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

import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __dirname = new URL('.', import.meta.url).pathname;

/**
 * 低階：將 trace event 寫入 JSONL 檔案。
 * @param {string} tracePath - 追蹤檔案的絕對路徑
 * @param {object} event - 要寫入的事件
 */
function appendTrace(tracePath, event) {
  appendFileSync(tracePath, JSON.stringify(event) + '\n', 'utf-8');
}

/**
 * 建立隔離的工作區目錄和初始檔案。
 *
 * @param {string} testNo - 題目編號 (如 "Q001")
 * @param {object} projectContext - 題目的 projectContext
 * @param {string} date - 日期字串
 * @returns {string} 工作區目錄的絕對路徑
 */
function initWorkspace(testNo, projectContext, date) {
  const rootDir = resolve(__dirname, '..');
  const workspaceDir = resolve(rootDir, 'assets', 'spec', date, `test_${testNo}`);
  const resultsDir = resolve(rootDir, 'results', 'spec', date, `test_${testNo}`);

  // 建立目錄
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  // 寫入 projectContext 中宣告的檔案
  for (const file of projectContext.files) {
    const filePath = join(workspaceDir, file.path);
    const fileDir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : null;

    if (fileDir) {
      mkdirSync(join(workspaceDir, fileDir), { recursive: true });
    }

    writeFileSync(filePath, file.content, 'utf-8');
  }

  return workspaceDir;
}

/**
 * 呼叫執行模型 API (OpenAI-compatible /v1/chat/completions)。
 *
 * @param {Array<{role: string, content: string}>} messages - 對話訊息
 * @param {object} env - 環境變數（來自 loadEnv）
 * @param {AbortSignal} [signal] - 用於超時取消的 AbortSignal
 * @returns {Promise<object>} API 的回應 JSON
 */
async function callExecModel(messages, env, signal) {
  const url = `${env.EXEC_BASE_URL}/v1/chat/completions`;

  const body = {
    model: env.EXEC_MODEL,
    messages,
    reasoning_effort: env.EXEC_REASONING_EFFORT,
    stream: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.EXEC_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unable to read error body)');
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/**
 * 執行單一測試題目。
 *
 * 流程：
 *   1. 剝離評分標準
 *   2. 建立隔離工作區
 *   3. 建構系統提示詞
 *   4. 呼叫執行模型
 *   5. 寫入 trace.jsonl 執行追蹤
 *   6. 寫入 .done 標記
 *
 * @param {object} question - 完整題目物件
 * @param {object} stripScoringCriteria - 剝離函數
 * @param {object} env - 環境變數
 * @param {string} date - 日期字串
 * @returns {Promise<{testId: string, success: boolean, error?: string}>}
 */
async function runSingleTest(question, stripScoringCriteria, env, date) {
  const testNo = question.id;
  const rootDir = resolve(__dirname, '..');
  const resultsDir = resolve(rootDir, 'results', 'spec', date, `test_${testNo}`);
  const tracePath = join(resultsDir, 'trace.jsonl');
  const donePath = join(resultsDir, '.done');

  // 確保 results 目錄存在
  mkdirSync(resultsDir, { recursive: true });

  const startTime = Date.now();

  // 寫入 start event
  appendTrace(tracePath, {
    type: 'start',
    timestamp: new Date().toISOString(),
    data: { testId: testNo, difficulty: question.difficulty },
  });

  try {
    // 1. 剝離評分標準
    const stripped = stripScoringCriteria(question);

    // 2. 建立隔離工作區
    const workspaceDir = initWorkspace(testNo, stripped.projectContext, date);

    // 3. 建構 messages
    const systemPrompt = [
      '你是一個 spec-writing agent，負責根據使用者需求撰寫規格文件。',
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
      ...stripped.projectContext.files.map(f => `  - ${f.path}`),
    ].join('\n');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: stripped.userPrompt },
    ];

    // 寫入 thinking phase marker
    appendTrace(tracePath, {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      data: { systemPrompt, userPrompt: stripped.userPrompt },
    });

    // 4. 呼叫執行模型 (含 timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, env.EXEC_TIMEOUT * 1000);

    let response;
    try {
      response = await callExecModel(messages, env, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }

    // 5. 寫入 response event
    const assistantMessage = response.choices?.[0]?.message;
    appendTrace(tracePath, {
      type: 'response',
      timestamp: new Date().toISOString(),
      data: {
        model: response.model,
        usage: response.usage,
        message: assistantMessage,
      },
    });

    // 6. 寫入 end event
    const duration = Date.now() - startTime;
    appendTrace(tracePath, {
      type: 'end',
      timestamp: new Date().toISOString(),
      data: { duration_ms: duration, status: 'completed' },
    });

    // 7. 寫入 .done 標記
    writeFileSync(donePath, JSON.stringify({
      testId: testNo,
      completedAt: new Date().toISOString(),
      duration_ms: duration,
      status: 'completed',
    }), 'utf-8');

    return { testId: testNo, success: true };

  } catch (err) {
    // 判斷是否為超時
    const isTimeout = err.name === 'AbortError' || err.name === 'TimeoutError';

    // 寫入 error event
    appendTrace(tracePath, {
      type: 'error',
      timestamp: new Date().toISOString(),
      data: {
        error: err.message,
        name: err.name,
        timeout: isTimeout,
      },
    });

    // 寫入 end event (failure)
    const duration = Date.now() - startTime;
    appendTrace(tracePath, {
      type: 'end',
      timestamp: new Date().toISOString(),
      data: {
        duration_ms: duration,
        status: isTimeout ? 'timeout' : 'error',
        error: err.message,
      },
    });

    // 即使失敗也寫入 .done，讓 scorer 可以對超時/錯誤進行評分
    writeFileSync(donePath, JSON.stringify({
      testId: testNo,
      completedAt: new Date().toISOString(),
      duration_ms: duration,
      status: isTimeout ? 'timeout' : 'error',
      error: err.message,
    }), 'utf-8');

    return { testId: testNo, success: false, error: err.message };
  }
}

/**
 * Promise pool 並發控制。
 * 限制同時執行的 Promise 數量。
 *
 * @param {Array} items - 要處理的項目陣列
 * @param {Function} fn - 處理函數，接受 (item, index) 並回傳 Promise
 * @param {number} concurrency - 最大同時執行數量
 * @returns {Promise<Array>} 處理結果陣列
 */
async function promisePool(items, fn, concurrency) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  const limit = Math.min(concurrency, items.length);
  for (let i = 0; i < limit; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * 帶指數退避的重試包裝函數。
 *
 * @param {Function} fn - 要執行的非同步函數
 * @param {number} maxRetries - 最大重試次數 (預設 3)
 * @param {Array<number>} delays - 延遲秒數陣列 (預設 [1, 2, 4])
 * @returns {Promise<any>}
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
        console.error(`  重試中 (${attempt + 1}/${maxRetries})... ${delaySec}s 後重試: ${err.message.split('\n')[0]}`);
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    }
  }

  throw lastError;
}

/**
 * 主入口：載入題目、並發執行所有測試。
 */
async function main() {
  // 動態 import 相依模組
  const { loadEnv } = await import('./env-utils.mjs');
  const { loadQuestions, stripScoringCriteria } = await import('./question-utils.mjs');

  // 解析 CLI 參數
  const date = process.argv[2] || '2026-05-28';
  const rootDir = resolve(__dirname, '..');
  const questionsPath = resolve(rootDir, 'assets', 'spec', date, 'test-questions.json');

  console.log('=== run-evals.mjs ===');
  console.log(`日期: ${date}`);
  console.log(`題目檔案: ${questionsPath}`);

  // 載入環境變數
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

  // 載入題目
  let questions;
  try {
    questions = loadQuestions(questionsPath);
  } catch (err) {
    console.error(`題目載入失敗: ${err.message}`);
    process.exit(1);
  }

  console.log(`題目總數: ${questions.length}`);
  const diffCount = { basic: 0, advanced: 0, edge: 0 };
  questions.forEach(q => diffCount[q.difficulty]++);
  console.log(`難度分佈: basic=${diffCount.basic}, advanced=${diffCount.advanced}, edge=${diffCount.edge}\n`);

  // 執行所有測試（並發控制）
  const startTime = Date.now();
  let completed = 0;
  let failed = 0;
  const total = questions.length;

  const results = await promisePool(questions, async (question, i) => {
    const label = `[${i + 1}/${total}] ${question.id} (${question.difficulty})`;

    try {
      const result = await withRetry(() =>
        runSingleTest(question, stripScoringCriteria, env, date)
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
  }, env.EXEC_CONCURRENCY);

  // 輸出摘要
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const succeeded = completed - failed;

  console.log(`\n=== 執行完成 ===`);
  console.log(`總題數: ${total}`);
  console.log(`成功: ${completed}`);
  console.log(`失敗: ${failed}`);
  console.log(`耗時: ${duration}s`);

  // 回傳非零 exit code 若有失敗
  if (failed > 0) {
    process.exitCode = 1;
  }
}

// 直接執行
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('run-evals.mjs') ||
  process.argv[1].endsWith('run-evals')
);

if (isDirectRun) {
  main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
