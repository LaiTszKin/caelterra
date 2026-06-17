#!/usr/bin/env node

/**
 * score.mjs — LLM-as-Judge Scorer
 *
 * 讀取測試執行追蹤，使用 Judge 模型對每個測試進行四維度評分，
 * 產出結構化的 score.json。
 *
 * CLI 使用方式：
 *   node scripts/score.mjs [date]             評分所有測試
 *   node scripts/score.mjs [date] --watch     監視模式：偵測 .done 時立刻評分
 *
 * 評分維度：outcome (任務完成), process (流程遵循), style (輸出格式), efficiency (效率)
 *
 * 僅使用 Node.js 內建模組。
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  watch,
} from 'fs';
import { resolve, join } from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

// --- Trace Reading ---

/**
 * 讀取 JSONL 追蹤檔案，回傳事件陣列。
 *
 * @param {string} tracePath - trace.jsonl 檔案路徑
 * @returns {Array<object>} 事件物件陣列
 * @throws {Error} 若檔案不存在或格式無效
 */
function readTrace(tracePath) {
  if (!existsSync(tracePath)) {
    throw new Error(`Trace 檔案不存在: ${tracePath}`);
  }

  const content = readFileSync(tracePath, 'utf-8');
  const lines = content.trim().split('\n');
  const events = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      // 損壞的行：記錄錯誤但繼續處理其他行
      events.push({
        type: 'parse_error',
        timestamp: new Date().toISOString(),
        data: { line: i + 1, raw: line.substring(0, 200), error: err.message },
      });
    }
  }

  return events;
}

// --- Judge Prompt Building ---

/**
 * 建構 Judge 模型的評分提示詞。
 */
function buildJudgePrompt(trace, scoringCriteria, testId) {
  const thinkingEvent = trace.find((e) => e.type === 'thinking');
  const responseEvent = trace.find((e) => e.type === 'response');
  const endEvent = trace.find((e) => e.type === 'end');
  const errorEvents = trace.filter((e) => e.type === 'error');

  const _systemPrompt = thinkingEvent?.data?.systemPrompt || '(未記錄)';
  const userPrompt = thinkingEvent?.data?.userPrompt || '(未記錄)';
  const assistantResponse = responseEvent?.data?.message?.content || '(無回應)';
  const duration = endEvent?.data?.duration_ms || 0;
  const status = endEvent?.data?.status || 'unknown';
  const errors = errorEvents.map(
    (e) => e.data?.error || e.data?.message || 'unknown error',
  );

  const dimensions = ['outcome', 'process', 'style', 'efficiency'];
  const dimNames = {
    outcome: '任務完成',
    process: '流程遵循',
    style: '輸出格式',
    efficiency: '效率',
  };

  let criteriaText = '';
  for (const dim of dimensions) {
    const criteria = scoringCriteria[dim];
    if (!criteria) continue;
    criteriaText += `\n## ${dimNames[dim] || dim} (權重: ${criteria.weight})\n`;
    for (const check of criteria.checks) {
      criteriaText += `- [${check.id}] ${check.description}\n`;
      criteriaText += `  通過條件: ${check.passCondition}\n`;
    }
  }

  const truncatedResponse =
    assistantResponse.length > 8000
      ? assistantResponse.substring(0, 8000) + '\n\n... (內容被截斷)'
      : assistantResponse;

  const prompt = [
    '你是一個專業的 AI agent 評審。請根據以下資訊對 agent 的測試表現進行四維度評分。',
    '',
    `## 題目 ID: ${testId}`,
    '',
    '## 使用者需求',
    userPrompt,
    '',
    '## Agent 輸出',
    truncatedResponse,
    '',
    '## 執行狀態',
    `- 狀態: ${status}`,
    `- 耗時: ${duration}ms`,
    errors.length > 0 ? `- 錯誤: ${errors.join('; ')}` : '',
    '',
    '## 評分標準',
    criteriaText,
    '',
    '## 評分指示',
    '請根據以下四個維度進行評分：',
    '',
    '1. **任務完成 (outcome)**: agent 的輸出是否滿足使用者需求中的功能要求？',
    '2. **流程遵循 (process)**: agent 是否按照正確的流程執行？',
    '3. **輸出格式 (style)**: agent 產出的文件格式是否符合規範？',
    '4. **效率 (efficiency)**: agent 的工作方式是否高效？',
    '',
    '每個維度的評分為 0-100 分。',
    '**重要：若執行狀態為 timeout 或 error，且沒有有效的 agent 輸出，所有維度應評 0 分。**',
    '',
    '請以精確的 JSON 格式回覆（不要包含 markdown 標記，直接回傳 JSON object）：',
    '',
    '{',
    '  "overallScore": <0-100>,',
    '  "dimensions": [',
    '    { "name": "outcome", "score": <0-100>, "maxScore": 100, "weight": <權重>, "comments": "<中文評語>" },',
    '    { "name": "process", "score": <0-100>, "maxScore": 100, "weight": <權重>, "comments": "<中文評語>" },',
    '    { "name": "style", "score": <0-100>, "maxScore": 100, "weight": <權重>, "comments": "<中文評語>" },',
    '    { "name": "efficiency", "score": <0-100>, "maxScore": 100, "weight": <權重>, "comments": "<中文評語>" }',
    '  ],',
    '  "issues": [',
    '    { "severity": "P0"|"P1"|"P2", "category": "skill"|"apltk"|"other", "description": "<問題描述>", "evidence": "<證據>" }',
    '  ],',
    '  "summary": "<100 字以內的整體評估摘要>"',
    '}',
  ].join('\n');

  return prompt;
}

// (callJudgeModel and parseJudgeOutput are imported from shared lib/judge-api.mjs)

// --- Single Test Scoring ---

/**
 * 對單一測試進行評分。
 *
 * @param {string} testNo - 題目 ID (如 "Q001")
 * @param {string} date - 日期字串
 * @param {object} env - 環境變數
 * @param {object} [options] - 其他選項
 * @param {object} [options.questionMap] - 題目 ID → question 物件的對應表
 * @returns {Promise<{testId: string, score: object}>}
 */
async function scoreSingleTest(testNo, date, env, options = {}) {
  const rootDir = resolve(__dirname, '..');
  const resultsDir = resolve(
    rootDir,
    'results',
    'spec',
    date,
    `test_${testNo}`,
  );
  const tracePath = join(resultsDir, 'trace.jsonl');
  const scorePath = join(resultsDir, 'score.json');
  const scoredPath = join(resultsDir, '.scored');

  // Read trace (streaming not needed for typical trace sizes)
  const trace = readTrace(tracePath);

  // Get scoring criteria
  let scoringCriteria;
  if (options.questionMap && options.questionMap[testNo]) {
    scoringCriteria = options.questionMap[testNo].scoringCriteria;
  } else {
    const { loadQuestions, getScoringCriteria } =
      await import('./question-utils.mjs');
    const questionsPath = resolve(
      rootDir,
      'assets',
      'spec',
      date,
      'test-questions.json',
    );
    const questions = loadQuestions(questionsPath);
    const question = questions.find((q) => q.id === testNo);
    if (!question) {
      throw new Error(`找不到題目: ${testNo}`);
    }
    scoringCriteria = getScoringCriteria(question);
  }

  const prompt = buildJudgePrompt(trace, scoringCriteria, testNo);

  // Call judge model with timeout, without json_object mode (not supported by all APIs)
  const { callJudgeModel } = await import('./lib/judge-api.mjs');
  const judgment = await callJudgeModel(prompt, env, {
    timeoutMs: env.EXEC_TIMEOUT ? env.EXEC_TIMEOUT * 1000 : 0,
  });

  const score = {
    testId: testNo,
    overallScore: judgment.overallScore ?? 0,
    dimensions: (judgment.dimensions || []).map((dim) => ({
      name: dim.name,
      score: dim.score ?? 0,
      maxScore: dim.maxScore ?? 100,
      weight: dim.weight ?? 0,
      comments: dim.comments || '',
    })),
    issues: (judgment.issues || []).map((issue) => ({
      severity: issue.severity || 'P1',
      category: issue.category || 'other',
      description: issue.description || '',
      evidence: issue.evidence || '',
    })),
    summary: judgment.summary || '',
    scoredAt: new Date().toISOString(),
  };

  // Atomic write: write .scored lock first, then score.json
  // If process crashes between, the .scored marker prevents re-scoring
  const scoredData = JSON.stringify({
    testId: testNo,
    scoredAt: new Date().toISOString(),
    overallScore: score.overallScore,
  });

  // Use mkdir as mutex to prevent race between concurrent scorers
  const lockDir = join(resultsDir, '.scoring-lock');
  try {
    mkdirSync(lockDir);
  } catch (_) {
    // Lock already held by another process — skip
    console.warn(`${testNo}: scoring lock held by another process, skipping`);
    return { testId: testNo, score: null, skipped: true };
  }

  try {
    writeFileSync(scoredPath, scoredData, 'utf-8');
    writeFileSync(scorePath, JSON.stringify(score, null, 2), 'utf-8');
  } finally {
    // Release lock
    try {
      rmSync(lockDir, { recursive: true });
    } catch (_) {
      /* ignore */
    }
  }

  return { testId: testNo, score };
}

// (promisePool is imported from shared lib/promise-pool.mjs)

// --- Watch Mode ---

/**
 * 監視模式：偵測 .done 檔案，發現即評分。
 * 使用 fs.watch 作為主要監控機制，polling 作為 fallback。
 */
async function watchMode(date, env, questionMap) {
  const rootDir = resolve(__dirname, '..');
  const resultsBase = resolve(rootDir, 'results', 'spec', date);

  const scored = new Set();
  const pendingQueue = [];
  let activeWorkers = 0;
  let stopped = false;

  const processNext = async () => {
    if (stopped) return;
    while (activeWorkers < env.JUDGE_CONCURRENCY && pendingQueue.length > 0) {
      const testNo = pendingQueue.shift();
      if (!testNo || scored.has(testNo)) continue;
      activeWorkers++;
      scored.add(testNo);
      scoreSingleTest(testNo, date, env, { questionMap })
        .then((result) => {
          if (result.score)
            console.log(
              `${testNo} 評分完成 (總分: ${result.score.overallScore})`,
            );
        })
        .catch((err) => {
          console.error(`${testNo} 評分失敗: ${err.message}`);
          scored.delete(testNo);
        })
        .finally(() => {
          activeWorkers--;
          processNext();
        });
    }
  };

  function enqueue(testNo) {
    if (scored.has(testNo) || pendingQueue.includes(testNo)) return;
    pendingQueue.push(testNo);
    processNext();
  }

  function pollForDone() {
    if (stopped) return;
    try {
      for (const testNo of scanForDone(resultsBase)) {
        if (!isAlreadyScored(resultsBase, testNo)) enqueue(testNo);
      }
    } catch (_) {
      /* dir may not exist yet */
    }
  }

  // Initial scan
  pollForDone();

  // Primary: fs.watch for real-time detection
  let watcher;
  try {
    mkdirSync(resultsBase, { recursive: true });
    watcher = watch(resultsBase, { recursive: true }, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        // Debounce: delay slightly to ensure file write completes
        setTimeout(pollForDone, 200);
      }
    });
  } catch (_) {
    // fs.watch not available, fall back to polling only
  }

  // Fallback: periodic polling every 10 seconds
  const interval = setInterval(pollForDone, 10000);
  console.log('監視模式已啟動，等待 .done 標記...');
  console.log(`評分並發上限: ${env.JUDGE_CONCURRENCY}`);

  const shutdown = () => {
    stopped = true;
    clearInterval(interval);
    if (watcher) watcher.close();
    console.log('\n監視模式已停止');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return new Promise(() => {}); // never resolves on its own
}

/**
 * 掃描 results 目錄，回傳所有有 .done 檔案的測試編號。
 */
function scanForDone(resultsBase) {
  if (!existsSync(resultsBase)) return [];

  const entries = readdirSync(resultsBase, { withFileTypes: true });
  const doneTests = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('test_')) {
      const testNo = entry.name.replace('test_', '');
      const donePath = join(resultsBase, entry.name, '.done');
      if (existsSync(donePath)) {
        doneTests.push(testNo);
      }
    }
  }

  return doneTests;
}

/**
 * 檢查測試是否已經被評分過。
 */
function isAlreadyScored(resultsBase, testNo) {
  const scoredPath = join(resultsBase, `test_${testNo}`, '.scored');
  return existsSync(scoredPath);
}

// --- Main ---

async function main() {
  const [{ loadEnv }, { loadQuestions }, { promisePool }] = await Promise.all([
    import('./env-utils.mjs'),
    import('./question-utils.mjs'),
    import('./lib/promise-pool.mjs'),
  ]);

  const args = process.argv.slice(2);
  const watchFlag = args.includes('--watch');
  const date = args.filter((a) => !a.startsWith('--'))[0] || '2026-05-28';
  const rootDir = resolve(__dirname, '..');

  console.log('=== score.mjs ===');
  console.log(`日期: ${date}`);
  console.log(`模式: ${watchFlag ? '監視模式' : '批次評分'}`);

  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(`環境變數載入失敗: ${err.message}`);
    process.exit(1);
  }

  console.log(`Judge 模型: ${env.JUDGE_MODEL} @ ${env.JUDGE_BASE_URL}`);
  console.log(`並發上限: ${env.JUDGE_CONCURRENCY}\n`);

  const questionsPath = resolve(
    rootDir,
    'assets',
    'spec',
    date,
    'test-questions.json',
  );
  const questions = loadQuestions(questionsPath);
  const questionMap = {};
  for (const q of questions) {
    questionMap[q.id] = q;
  }
  console.log(`已載入 ${questions.length} 道題目的評分標準`);

  if (watchFlag) {
    await watchMode(date, env, questionMap);
  } else {
    const resultsBase = resolve(rootDir, 'results', 'spec', date);
    const doneTests = scanForDone(resultsBase);

    if (doneTests.length === 0) {
      console.log('沒有找到已完成的測試 (.done 檔案)。');
      console.log(
        '請先執行 run-evals.mjs 產生測試結果，或使用 --watch 模式等待。',
      );
      process.exit(0);
    }

    const unscoredTests = doneTests.filter(
      (t) => !isAlreadyScored(resultsBase, t),
    );

    if (unscoredTests.length === 0) {
      console.log('所有測試皆已評分完畢。');
      process.exit(0);
    }

    console.log(
      `找到 ${doneTests.length} 個已完成測試，其中 ${unscoredTests.length} 個尚未評分\n`,
    );

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    await promisePool(
      unscoredTests,
      async (testNo, i) => {
        const label = `[${i + 1}/${unscoredTests.length}] ${testNo}`;
        try {
          const result = await scoreSingleTest(testNo, date, env, {
            questionMap,
          });
          successCount++;
          console.log(`${label} 評分完成 (總分: ${result.score.overallScore})`);
          return result;
        } catch (err) {
          failCount++;
          console.error(`${label} 評分失敗: ${err.message}`);
          return { testId: testNo, error: err.message };
        }
      },
      env.JUDGE_CONCURRENCY,
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 評分完成 ===`);
    console.log(`成功: ${successCount}/${unscoredTests.length}`);
    console.log(`失敗: ${failCount}/${unscoredTests.length}`);
    console.log(`耗時: ${duration}s`);

    if (failCount > 0) process.exitCode = 1;
  }
}

// 直接執行
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('score.mjs') || process.argv[1].endsWith('score'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
