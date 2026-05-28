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

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

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
 *
 * @param {Array<object>} trace - 執行追蹤事件陣列
 * @param {object} scoringCriteria - 題目的評分標準
 * @param {string} testId - 題目 ID
 * @returns {string} 完整的評分提示詞
 */
function buildJudgePrompt(trace, scoringCriteria, testId) {
  // 萃取關鍵資訊：system prompt, user prompt, model response
  const thinkingEvent = trace.find(e => e.type === 'thinking');
  const responseEvent = trace.find(e => e.type === 'response');
  const endEvent = trace.find(e => e.type === 'end');
  const errorEvents = trace.filter(e => e.type === 'error');

  const systemPrompt = thinkingEvent?.data?.systemPrompt || '(未記錄)';
  const userPrompt = thinkingEvent?.data?.userPrompt || '(未記錄)';
  const assistantResponse = responseEvent?.data?.message?.content || '(無回應)';
  const duration = endEvent?.data?.duration_ms || 0;
  const status = endEvent?.data?.status || 'unknown';
  const errors = errorEvents.map(e => e.data?.error || e.data?.message || 'unknown error');

  // 建構每個維度的 checks 文字
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

  // 摘要化 trace（截取前 8000 字符的 assistant response）
  const truncatedResponse = assistantResponse.length > 8000
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
    '1. **任務完成 (outcome)**: agent 的輸出是否滿足使用者需求中的功能要求？檢查規格文件是否完整、準確。',
    '2. **流程遵循 (process)**: agent 是否按照正確的流程執行（如是否調用了正確的技能、是否閱讀了現有程式碼）？',
    '3. **輸出格式 (style)**: agent 產出的文件格式是否符合規範（章節結構、命名慣例等）？',
    '4. **效率 (efficiency)**: agent 的工作方式是否高效（任務拆分粒度、檔案級別的精確度等）？',
    '',
    '每個維度的評分為 0-100 分。請根據每個 check 的通過情況給分：',
    '- 完全滿足該 check: 該維度接近滿分',
    '- 部分滿足: 中等分數',
    '- 完全不滿足: 低分或零分',
    '',
    '**重要：若執行狀態為 timeout 或 error，且沒有有效的 agent 輸出，所有維度應評 0 分。**',
    '',
    '請以精確的 JSON 格式回覆（不要包含 markdown 標記，直接回傳 JSON object）：',
    '',
    '{',
    '  "overallScore": <0-100 的總分, number>,',
    '  "dimensions": [',
    '    {',
    '      "name": "outcome",',
    '      "score": <number 0-100>,',
    '      "maxScore": 100,',
    '      "weight": <來自評分標準的權重>,',
    '      "comments": "<中文評語>"',
    '    },',
    '    {',
    '      "name": "process",',
    '      "score": <number 0-100>,',
    '      "maxScore": 100,',
    '      "weight": <來自評分標準的權重>,',
    '      "comments": "<中文評語>"',
    '    },',
    '    {',
    '      "name": "style",',
    '      "score": <number 0-100>,',
    '      "maxScore": 100,',
    '      "weight": <來自評分標準的權重>,',
    '      "comments": "<中文評語>"',
    '    },',
    '    {',
    '      "name": "efficiency",',
    '      "score": <number 0-100>,',
    '      "maxScore": 100,',
    '      "weight": <來自評分標準的權重>,',
    '      "comments": "<中文評語>"',
    '    }',
    '  ],',
    '  "issues": [',
    '    {',
    '      "severity": "P0" | "P1" | "P2",',
    '      "category": "skill" | "apltk" | "other",',
    '      "description": "<問題描述>",',
    '      "evidence": "<從 trace 中擷取的證據>"',
    '    }',
    '  ],',
    '  "summary": "<100 字以內的整體評估摘要>"',
    '}',
    '',
    '請嚴格按照此 JSON schema 輸出。確保所有欄位都正確填入。',
  ].join('\n');

  return prompt;
}

// --- Judge Model API Call ---

/**
 * 呼叫 Judge 模型 API。
 *
 * @param {string} prompt - 評分提示詞
 * @param {object} env - 環境變數
 * @returns {Promise<object>} 解析後的評分 JSON
 */
async function callJudgeModel(prompt, env) {
  const url = `${env.JUDGE_BASE_URL}/v1/chat/completions`;

  const body = {
    model: env.JUDGE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    reasoning_effort: env.JUDGE_REASONING_EFFORT,
    response_format: { type: 'json_object' },
    stream: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.JUDGE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(unable to read error body)');
    throw new Error(`Judge API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Judge 模型回覆中沒有 content');
  }

  // 嘗試解析 JSON
  return parseJudgeOutput(content);
}

/**
 * 解析 Judge 模型輸出的 JSON，含 fallback 處理。
 *
 * @param {string} content - Judge 模型回覆的文字
 * @returns {object} 解析後的 JSON 物件
 */
function parseJudgeOutput(content) {
  // 嘗試直接解析
  try {
    return JSON.parse(content);
  } catch (_) {
    // not valid JSON directly
  }

  // 嘗試提取 ```json ... ``` block
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]);
    } catch (_) {
      // still not valid
    }
  }

  // 嘗試提取 { ... } 區塊
  const braceMatch = content.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (_) {
      // still not valid
    }
  }

  // 最終 fallback: 回傳錯誤結構
  return {
    overallScore: 0,
    dimensions: [],
    issues: [{
      severity: 'P1',
      category: 'other',
      description: 'Judge 模型回覆無法解析為有效 JSON',
      evidence: content.substring(0, 500),
    }],
    summary: 'Judge 輸出解析失敗',
    _parseError: true,
    _rawContent: content.substring(0, 1000),
  };
}

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
  const resultsDir = resolve(rootDir, 'results', 'spec', date, `test_${testNo}`);
  const tracePath = join(resultsDir, 'trace.jsonl');
  const scorePath = join(resultsDir, 'score.json');
  const scoredPath = join(resultsDir, '.scored');

  // 讀取 trace
  const trace = readTrace(tracePath);

  // 取得評分標準
  let scoringCriteria;
  if (options.questionMap && options.questionMap[testNo]) {
    scoringCriteria = options.questionMap[testNo].scoringCriteria;
  } else {
    // 若無 questionMap，嘗試從原始題目檔案取得
    const { loadQuestions, getScoringCriteria } = await import('./question-utils.mjs');
    const questionsPath = resolve(rootDir, 'assets', 'spec', date, 'test-questions.json');
    const questions = loadQuestions(questionsPath);
    const question = questions.find(q => q.id === testNo);
    if (!question) {
      throw new Error(`找不到題目: ${testNo}`);
    }
    scoringCriteria = getScoringCriteria(question);
  }

  // 建構 Judge prompt
  const prompt = buildJudgePrompt(trace, scoringCriteria, testNo);

  // 呼叫 Judge 模型
  const judgment = await callJudgeModel(prompt, env);

  // 建構最終的 score.json 結構
  const score = {
    testId: testNo,
    overallScore: judgment.overallScore ?? 0,
    dimensions: (judgment.dimensions || []).map(dim => ({
      name: dim.name,
      score: dim.score ?? 0,
      maxScore: dim.maxScore ?? 100,
      weight: dim.weight ?? 0,
      comments: dim.comments || '',
    })),
    issues: (judgment.issues || []).map(issue => ({
      severity: issue.severity || 'P1',
      category: issue.category || 'other',
      description: issue.description || '',
      evidence: issue.evidence || '',
    })),
    summary: judgment.summary || '',
    scoredAt: new Date().toISOString(),
  };

  // 寫入 score.json
  writeFileSync(scorePath, JSON.stringify(score, null, 2), 'utf-8');

  // 寫入 .scored 標記
  writeFileSync(scoredPath, JSON.stringify({
    testId: testNo,
    scoredAt: new Date().toISOString(),
    overallScore: score.overallScore,
  }), 'utf-8');

  return { testId: testNo, score };
}

// --- Promise Pool ---

/**
 * Promise pool 並發控制。
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

// --- Watch Mode ---

/**
 * 監視模式：週期性檢查新的 .done 檔案，發現即評分。
 *
 * @param {string} date - 日期字串
 * @param {object} env - 環境變數
 * @param {object} questionMap - 題目 ID → question 物件對應表
 */
async function watchMode(date, env, questionMap) {
  const rootDir = resolve(__dirname, '..');
  const resultsBase = resolve(rootDir, 'results', 'spec', date);

  // 記錄已評分的測試編號
  const scored = new Set();

  // 先掃描一次，檢查是否有已經存在但未評分的 .done 檔案
  const initialScan = scanForDone(resultsBase);
  for (const testNo of initialScan) {
    if (!isAlreadyScored(resultsBase, testNo)) {
      console.log(`發現未評分: ${testNo}`);
      // 不立即評分，交由主循環處理
    }
  }

  console.log('監視模式已啟動，等待 .done 標記...');
  console.log(`評分並發上限: ${env.JUDGE_CONCURRENCY}`);

  // 使用排隊機制：維護一個待評分佇列和正在執行的 worker
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

      // 非同步評分（不 await，讓 worker 自行管理）
      scoreSingleTest(testNo, date, env, { questionMap })
        .then(result => {
          console.log(`${testNo} 評分完成 (總分: ${result.score.overallScore})`);
        })
        .catch(err => {
          console.error(`${testNo} 評分失敗: ${err.message}`);
          scored.delete(testNo); // 允許重試
        })
        .finally(() => {
          activeWorkers--;
          processNext(); // 處理下一個
        });
    }
  };

  /**
   * 排入評分佇列。
   */
  function enqueue(testNo) {
    if (scored.has(testNo)) return;
    // 避免重複排入
    if (pendingQueue.includes(testNo)) return;
    pendingQueue.push(testNo);
    processNext();
  }

  /**
   * 掃描新的 .done 檔案。
   */
  function pollForDone() {
    if (stopped) return;

    try {
      const doneTests = scanForDone(resultsBase);
      for (const testNo of doneTests) {
        if (!isAlreadyScored(resultsBase, testNo)) {
          enqueue(testNo);
        }
      }
    } catch (_) {
      // 目錄可能還不存在，忽略
    }
  }

  // 初始掃描
  pollForDone();

  // 每秒輪詢一次
  const interval = setInterval(pollForDone, 1000);

  // 處理 graceful shutdown
  const shutdown = () => {
    stopped = true;
    clearInterval(interval);
    console.log('\n監視模式已停止');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 保持程序運行直到手動停止，或所有已知測試都已評分
  // 注意：我們不知道總共會有多少測試，所以持續運行
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
  const { loadEnv } = await import('./env-utils.mjs');

  // 解析 CLI 參數
  const args = process.argv.slice(2);
  const watchFlag = args.includes('--watch');
  const date = args.filter(a => !a.startsWith('--'))[0] || '2026-05-28';
  const rootDir = resolve(__dirname, '..');

  console.log('=== score.mjs ===');
  console.log(`日期: ${date}`);
  console.log(`模式: ${watchFlag ? '監視模式' : '批次評分'}`);

  // 載入環境變數
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(`環境變數載入失敗: ${err.message}`);
    process.exit(1);
  }

  console.log(`Judge 模型: ${env.JUDGE_MODEL} @ ${env.JUDGE_BASE_URL}`);
  console.log(`並發上限: ${env.JUDGE_CONCURRENCY}\n`);

  // 載入題目以取得評分標準對照表
  const { loadQuestions } = await import('./question-utils.mjs');
  const questionsPath = resolve(rootDir, 'assets', 'spec', date, 'test-questions.json');
  const questions = loadQuestions(questionsPath);
  const questionMap = {};
  for (const q of questions) {
    questionMap[q.id] = q;
  }
  console.log(`已載入 ${questions.length} 道題目的評分標準`);

  if (watchFlag) {
    // 監視模式
    await watchMode(date, env, questionMap);
  } else {
    // 批次模式：找出所有有 trace 的測試（有 .done 檔案）
    const resultsBase = resolve(rootDir, 'results', 'spec', date);
    const doneTests = scanForDone(resultsBase);

    if (doneTests.length === 0) {
      console.log('沒有找到已完成的測試 (.done 檔案)。');
      console.log('請先執行 run-evals.mjs 產生測試結果，或使用 --watch 模式等待。');
      process.exit(0);
    }

    // 過濾出尚未評分的測試
    const unscoredTests = doneTests.filter(t => !isAlreadyScored(resultsBase, t));

    if (unscoredTests.length === 0) {
      console.log('所有測試皆已評分完畢。');
      process.exit(0);
    }

    console.log(`找到 ${doneTests.length} 個已完成測試，其中 ${unscoredTests.length} 個尚未評分\n`);

    // 並發評分
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    await promisePool(unscoredTests, async (testNo, i) => {
      const label = `[${i + 1}/${unscoredTests.length}] ${testNo}`;

      try {
        const result = await scoreSingleTest(testNo, date, env, { questionMap });
        successCount++;
        console.log(`${label} 評分完成 (總分: ${result.score.overallScore})`);
        return result;
      } catch (err) {
        failCount++;
        console.error(`${label} 評分失敗: ${err.message}`);
        return { testId: testNo, error: err.message };
      }
    }, env.JUDGE_CONCURRENCY);

    // 輸出摘要
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=== 評分完成 ===`);
    console.log(`成功: ${successCount}/${unscoredTests.length}`);
    console.log(`失敗: ${failCount}/${unscoredTests.length}`);
    console.log(`耗時: ${duration}s`);

    if (failCount > 0) {
      process.exitCode = 1;
    }
  }
}

// 直接執行
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('score.mjs') ||
  process.argv[1].endsWith('score')
);

if (isDirectRun) {
  main().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
