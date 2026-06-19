#!/usr/bin/env node

/**
 * run-evals.mjs — Test Executor
 *
 * 對所有題目執行 agent 測試，記錄完整的執行追蹤 (trace)。
 *
 * CLI 使用方式：
 *   node scripts/run-evals.mjs [date]       預設 date = "2026-05-28"
 *
 * 產出物：
 *   assets/spec/{date}/test_{no}/           隔離的工作區目錄
 *   results/spec/{date}/test_{no}/trace.jsonl  執行追蹤 (JSONL)
 *   results/spec/{date}/test_{no}/.done      完成標記檔案
 *
 * 僅使用 Node.js 內建模組。
 */

import { existsSync } from 'fs';
import { appendFile, mkdir, writeFile, rm } from 'fs/promises';
import { resolve, join } from 'path';

// ESM __dirname equivalent
const __dirname = new URL('.', import.meta.url).pathname;

/**
 * 低階：將 trace event 寫入 JSONL 檔案（非同步版本）。
 */
async function appendTrace(tracePath, event) {
  await appendFile(tracePath, JSON.stringify(event) + '\n', 'utf-8');
}

/**
 * 建立隔離的工作區目錄和初始檔案。
 */
async function initWorkspace(testNo, projectContext, date) {
  const rootDir = resolve(__dirname, '..');
  const workspaceDir = resolve(
    rootDir,
    'assets',
    'spec',
    date,
    `test_${testNo}`,
  );
  const resultsDir = resolve(
    rootDir,
    'results',
    'spec',
    date,
    `test_${testNo}`,
  );

  await mkdir(workspaceDir, { recursive: true });
  await mkdir(resultsDir, { recursive: true });

  for (const file of projectContext.files) {
    const filePath = join(workspaceDir, file.path);
    const fileDir = file.path.includes('/')
      ? file.path.substring(0, file.path.lastIndexOf('/'))
      : null;

    if (fileDir) {
      await mkdir(join(workspaceDir, fileDir), { recursive: true });
    }

    await writeFile(filePath, file.content, 'utf-8');
  }

  return workspaceDir;
}

/**
 * 執行單一測試題目。
 */
async function runSingleTest(
  question,
  stripScoringCriteria,
  env,
  date,
  skillName = 'spec',
) {
  const testNo = question.id;
  const rootDir = resolve(__dirname, '..');
  const resultsDir = resolve(
    rootDir,
    'results',
    'spec',
    date,
    `test_${testNo}`,
  );
  const tracePath = join(resultsDir, 'trace.jsonl');
  const donePath = join(resultsDir, '.done');

  // Ensure results dir and clean up old trace on retry
  await mkdir(resultsDir, { recursive: true });

  // Remove old trace if it exists (from a previous failed attempt) but no .done marker
  if (existsSync(tracePath) && !existsSync(donePath)) {
    await rm(tracePath, { force: true });
  }

  const startTime = Date.now();

  await appendTrace(tracePath, {
    type: 'start',
    timestamp: new Date().toISOString(),
    data: { testId: testNo, difficulty: question.difficulty },
  });

  try {
    const stripped = stripScoringCriteria(question);
    const workspaceDir = await initWorkspace(
      testNo,
      stripped.projectContext,
      date,
    );

    const systemPrompt = [
      `你是一個 ${skillName}-writing agent，負責根據使用者需求撰寫規格文件。`,
      '',
      '重要限制：',
      `- 你只能在以下工作目錄中讀取和寫入檔案：${workspaceDir}`,
      '- 不要在工作目錄之外建立或修改任何檔案',
      '- 將所有產出的 spec 文件都寫入工作目錄中',
      '',
      '專案背景：',
      stripped.projectContext.description || '(無)',
      '',
      '工作目錄中的初始檔案 (僅供參考，你應該在此基礎上產出 spec 文件)：',
      ...stripped.projectContext.files.map((f) => `  - ${f.path}`),
    ].join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: stripped.userPrompt },
    ];

    await appendTrace(tracePath, {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      data: { systemPrompt, userPrompt: stripped.userPrompt },
    });

    // Call exec model with timeout
    const { callExecModel } = await import('./lib/judge-api.mjs');
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      env.EXEC_TIMEOUT * 1000,
    );

    let response;
    try {
      response = await callExecModel(messages, env, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }

    const assistantMessage = response.choices?.[0]?.message;
    await appendTrace(tracePath, {
      type: 'response',
      timestamp: new Date().toISOString(),
      data: {
        model: response.model,
        usage: response.usage,
        message: assistantMessage,
      },
    });

    const duration = Date.now() - startTime;
    await appendTrace(tracePath, {
      type: 'end',
      timestamp: new Date().toISOString(),
      data: { duration_ms: duration, status: 'completed' },
    });

    await writeFile(
      donePath,
      JSON.stringify({
        testId: testNo,
        completedAt: new Date().toISOString(),
        duration_ms: duration,
        status: 'completed',
      }),
      'utf-8',
    );

    return { testId: testNo, success: true };
  } catch (err) {
    const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError';

    await appendTrace(tracePath, {
      type: 'error',
      timestamp: new Date().toISOString(),
      data: { error: err.message, name: err.name, timeout: isTimeout },
    });

    const duration = Date.now() - startTime;
    await appendTrace(tracePath, {
      type: 'end',
      timestamp: new Date().toISOString(),
      data: {
        duration_ms: duration,
        status: isTimeout ? 'timeout' : 'error',
        error: err.message,
      },
    });

    await writeFile(
      donePath,
      JSON.stringify({
        testId: testNo,
        completedAt: new Date().toISOString(),
        duration_ms: duration,
        status: isTimeout ? 'timeout' : 'error',
        error: err.message,
      }),
      'utf-8',
    );

    return { testId: testNo, success: false, error: err.message };
  }
}

/**
 * 帶指數退避的重試包裝函數。
 */
async function withRetry(fn, maxRetries = 3, delays = [1, 2, 4]) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delaySec = delays[Math.min(attempt, delays.length - 1)];
        console.error(
          `  重試中 (${attempt + 1}/${maxRetries})... ${delaySec}s 後重試: ${err.message.split('\n')[0]}`,
        );
        await new Promise((r) => setTimeout(r, delaySec * 1000));
      }
    }
  }

  throw lastError;
}

/**
 * 解析 CLI 參數。
 */
function parseArgs(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const positionals = args.filter((a) => !a.startsWith('--'));
  const date = positionals[0] || '2026-05-28';
  const skillName =
    flags.find((f) => f.startsWith('--skill='))?.split('=')[1] || 'spec';
  return { date, skillName };
}

/**
 * 主入口：載入題目、並發執行所有測試。
 */
async function main() {
  const [
    { loadEnv },
    { loadQuestions, stripScoringCriteria },
    { promisePool },
  ] = await Promise.all([
    import('./env-utils.mjs'),
    import('./question-utils.mjs'),
    import('./lib/promise-pool.mjs'),
  ]);

  const { date, skillName } = parseArgs(process.argv.slice(2));
  const rootDir = resolve(__dirname, '..');
  const questionsPath = resolve(
    rootDir,
    'assets',
    'spec',
    date,
    'test-questions.json',
  );

  console.log('=== run-evals.mjs ===');
  console.log(`日期: ${date}`);
  console.log(`技能: ${skillName}`);
  console.log(`題目檔案: ${questionsPath}`);

  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(`環境變數載入失敗: ${err.message}`);
    process.exit(1);
  }

  console.log(`執行模型: ${env.EXEC_MODEL} @ ${env.EXEC_BASE_URL}`);
  console.log(`並發上限: ${env.EXEC_CONCURRENCY}`);
  console.log(`逾時設定: ${env.EXEC_TIMEOUT}s`);
  console.log(`重試設定: 最多 3 次 (1s / 2s / 4s)`);

  let questions;
  try {
    questions = loadQuestions(questionsPath);
  } catch (err) {
    console.error(`題目載入失敗: ${err.message}`);
    process.exit(1);
  }

  console.log(`題目總數: ${questions.length}`);
  const diffCount = { basic: 0, advanced: 0, edge: 0 };
  questions.forEach((q) => diffCount[q.difficulty]++);
  console.log(
    `難度分佈: basic=${diffCount.basic}, advanced=${diffCount.advanced}, edge=${diffCount.edge}\n`,
  );

  const startTime = Date.now();
  let completed = 0;
  let failed = 0;
  const total = questions.length;

  await promisePool(
    questions,
    async (question, i) => {
      const label = `[${i + 1}/${total}] ${question.id} (${question.difficulty})`;

      try {
        const result = await withRetry(() =>
          runSingleTest(question, stripScoringCriteria, env, date, skillName),
        );
        completed++;
        if (result.success) {
          console.log(`${label} 完成`);
        } else {
          failed++;
          console.error(`${label} 失敗: ${result.error}`);
        }
        return result;
      } catch (err) {
        failed++;
        console.error(`${label} 最終失敗 (重試耗盡): ${err.message}`);
        return { testId: question.id, success: false, error: err.message };
      }
    },
    env.EXEC_CONCURRENCY,
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== 執行完成 ===`);
  console.log(`總題數: ${total}`);
  console.log(`成功: ${completed}`);
  console.log(`失敗: ${failed}`);
  console.log(`耗時: ${duration}s`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

// 直接執行
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('run-evals.mjs') ||
    process.argv[1].endsWith('run-evals'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
