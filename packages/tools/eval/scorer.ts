/**
 * scorer.ts — LLM-as-Judge Scorer Engine
 *
 * Reads executor-produced JSONL traces, calls the Judge Model API to score
 * along three dimensions (instruction_adherence, tool_calling, result_quality),
 * and produces score.json per test.
 *
 * Scoring dimensions (used only for the judge prompt) are:
 *   - instruction_adherence: Did the agent understand and follow instructions?
 *   - tool_calling:         Did the agent select and invoke tools correctly?
 *   - result_quality:       Is the final output correct and well-formed?
 *
 * The original 4-dimension ScoringCriteria from the question bank is included
 * in the judge prompt as reference material.
 *
 * Only uses Node.js built-in modules and lib/ modules. No external dependencies.
 */

import { existsSync, readdirSync, mkdirSync, watch } from 'node:fs';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

import type { TraceEvent } from './executor.js';
import type { EnvConfig } from './lib/env-utils.js';
import { callJudgeModel } from './lib/judge-api.js';
import type { JudgeEnv } from './lib/judge-api.js';
import { promisePool } from './lib/promise-pool.js';
import { loadQuestions, getScoringCriteria } from './lib/question-utils.js';
import type { Question, ScoringCriteria } from './lib/question-utils.js';
import { getProjectRoot } from './lib/project-root.js';
export { getProjectRoot };

// --- Public Types ---

export interface ScoreDimension {
  name: string;
  score: number;
  maxScore: number;
  weight: number;
  comments: string;
}

export interface Issue {
  severity: 'P0' | 'P1' | 'P2';
  category: 'skill' | 'apltk' | 'other';
  description: string;
  evidence: string;
}

export interface ScoreResult {
  testId: string;
  overallScore: number;
  dimensions: ScoreDimension[];
  issues: Issue[];
  summary: string;
  scoredAt: string;
  scorable?: boolean;
  scoringNote?: string;
}

// --- Trace Reading ---

/** TraceEvent extended with optional JSONL line number annotation. */
type TraceEventWithLine = TraceEvent & { _lineNumber?: number };

/**
 * Read a JSONL trace file and return trace events with a corruption flag.
 *
 * Handles corrupted lines gracefully by recording them as `parse_error` events,
 * annotates each successfully parsed event with its JSONL line number, and
 * continues processing the remaining lines.
 *
 * @param tracePath - Absolute path to trace.jsonl
 * @returns Object with events array and hasCorruption flag
 * @throws Error if the trace file does not exist
 */
export async function readTrace(tracePath: string): Promise<{ events: TraceEvent[]; hasCorruption: boolean }> {
  if (!existsSync(tracePath)) {
    throw new Error(`Trace 檔案不存在: ${tracePath}`);
  }

  const content = await readFile(tracePath, 'utf-8');
  const lines = content.trim().split('\n');
  const events: TraceEvent[] = [];
  let hasCorruption = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const event = JSON.parse(line) as TraceEventWithLine;
      event._lineNumber = i + 1;
      events.push(event);
    } catch (err) {
      hasCorruption = true;
      // Corrupted line: record as parse_error and continue
      events.push({
        type: 'parse_error',
        timestamp: new Date().toISOString(),
        data: { line: i + 1, raw: line.substring(0, 200), error: (err as Error).message },
      } as unknown as TraceEvent);
    }
  }

  return { events, hasCorruption };
}

// --- Judge Prompt Building ---

/**
 * The three scoring dimensions used by the judge prompt.
 * These replace the original 4-dimension model from the question bank.
 */
const JUDGE_DIMENSIONS = [
  {
    name: 'instruction_adherence',
    label: '指令遵循',
    description: 'Agent 是否正確理解並遵循使用者指令？是否按照要求完成任務？',
    weight: 0.33,
  },
  {
    name: 'tool_calling',
    label: '工具調用',
    description: 'Agent 是否正確選擇和呼叫工具？工具的參數和順序是否得當？',
    weight: 0.33,
  },
  {
    name: 'result_quality',
    label: '結果質量',
    description: 'Agent 最終產出的結果品質如何？是否滿足功能需求和品質標準？',
    weight: 0.34,
  },
];

/**
 * Build a scoring prompt for the judge model.
 *
 * Extracts system prompt, user prompt, assistant response, errors, and duration
 * from the trace, truncates long responses, and instructs the judge to score
 * along three dimensions. The original question scoring criteria is included
 * as reference material.
 *
 * @param trace - Full trace event array
 * @param scoringCriteria - Original 4-dimension scoring criteria from question
 * @param testId - Test/question identifier
 * @param skillName - Optional skill name for context
 * @returns Judge prompt string
 */
export function buildJudgePrompt(
  trace: TraceEvent[],
  scoringCriteria: ScoringCriteria,
  testId: string,
  skillName?: string,
): string {
  const thinkingEvent = trace.find(e => e.type === 'thinking');
  const responseEvent = trace.find(e => e.type === 'response');
  const endEvent = trace.find(e => e.type === 'end');
  const errorEvents = trace.filter(e => e.type === 'error');

  const systemPrompt = thinkingEvent?.data?.systemPrompt as string | undefined ?? '(未記錄)';
  const userPrompt = thinkingEvent?.data?.userPrompt as string | undefined ?? '(未記錄)';
  const assistantResponse = (
    (responseEvent?.data?.message as Record<string, unknown> | undefined)?.content as string | undefined
  ) ?? '(無回應)';
  const duration = (endEvent?.data?.duration_ms as number | undefined) ?? 0;
  const status = (endEvent?.data?.status as string | undefined) ?? 'unknown';
  const errors = errorEvents.map(e => {
    const msg = (e.data?.error ?? e.data?.message ?? 'unknown error') as string;
    return msg;
  });

  // Truncate long assistant response
  const truncatedResponse = assistantResponse.length > 8000
    ? assistantResponse.substring(0, 8000) + '\n\n... (內容被截斷)'
    : assistantResponse;

  // Build reference criteria text from the original 4-dimension scoring criteria
  const dimLabels: Record<string, string> = {
    outcome: '任務完成',
    process: '流程遵循',
    style: '輸出格式',
    efficiency: '效率',
  };
  const dimKeys = ['outcome', 'process', 'style', 'efficiency'] as const;

  let criteriaText = '';
  for (const key of dimKeys) {
    const criteria = scoringCriteria[key];
    if (!criteria) continue;
    criteriaText += `\n### ${dimLabels[key] ?? key} (權重: ${criteria.weight})\n`;
    for (const check of criteria.checks) {
      criteriaText += `- [${check.id}] ${check.description}\n`;
      criteriaText += `  通過條件: ${check.passCondition}\n`;
    }
  }

  // Build the 3-dimension scoring rubric
  let rubricText = '';
  for (let i = 0; i < JUDGE_DIMENSIONS.length; i++) {
    const d = JUDGE_DIMENSIONS[i];
    rubricText += `${i + 1}. **${d.name}** (${d.label}): ${d.description}\n`;
  }

  const skillContext = skillName ? `\n## 測試技能\n${skillName}\n` : '';

  const prompt = [
    '你是一個專業的 AI agent 評審。請根據以下資訊對 agent 的測試表現進行三維度評分。',
    '',
    `## 題目 ID: ${testId}`,
    skillContext,
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
    '## 原始評分標準 (參考)',
    '以下是題庫定義的原始評分標準，請作為評分參考：',
    criteriaText,
    '',
    '## 評分維度',
    '請根據以下三個維度進行評分（每個維度 0-100 分）：',
    '',
    rubricText,
    '',
    '**重要：若執行狀態為 timeout 或 error，且沒有有效的 agent 輸出，所有維度應評 0 分。**',
    '',
    'Each issue\'s evidence MUST reference the JSONL line number(s) using the format \'L42: <description>\'.',
    '',
    '## 輸出格式',
    '請以精確的 JSON 格式回覆（不要包含 markdown 標記，直接回傳 JSON object）：',
    '',
    '{',
    '  "overallScore": <0-100>,',
    '  "dimensions": [',
    '    { "name": "instruction_adherence", "score": <0-100>, "maxScore": 100, "weight": 0.33, "comments": "<評語>" },',
    '    { "name": "tool_calling", "score": <0-100>, "maxScore": 100, "weight": 0.33, "comments": "<評語>" },',
    '    { "name": "result_quality", "score": <0-100>, "maxScore": 100, "weight": 0.34, "comments": "<評語>" }',
    '  ],',
    '  "issues": [',
    '    { "severity": "P0"|"P1"|"P2", "category": "skill"|"apltk"|"other", "description": "<問題描述>", "evidence": "L{N}: <證據描述>" }',
    '  ],',
    '  "summary": "<100 字以內的整體評估摘要>"',
    '}',
  ].join('\n');

  return prompt;
}

// --- Single Test Scoring ---

/**
 * Score a single test by reading its trace, calling the judge model,
 * and writing the result to score.json.
 *
 * Uses a mkdir-based mutex (.scoring-lock) to prevent concurrent scoring
 * of the same test. Writes a .scored marker to prevent duplicate scoring.
 *
 * @param testNo - Test/question ID (e.g. "Q001")
 * @param date - Date string used for directory structure
 * @param env - Environment configuration with JUDGE_* variables
 * @param questionMap - Optional pre-loaded question map for scoring criteria
 * @param skillName - Optional skill name for context in the judge prompt
 * @returns Scoring result (score is null when another process holds the lock)
 */
export async function scoreSingleTest(
  testNo: string,
  date: string,
  env: EnvConfig,
  questionMap?: Record<string, Question>,
  skillName?: string,
): Promise<{ testId: string; score: ScoreResult | null; skipped?: boolean }> {
  const rootDir = getProjectRoot();
  const resultsDir = resolve(rootDir, 'results', 'spec', date, `test_${testNo}`);
  const tracePath = join(resultsDir, 'trace.jsonl');
  const scorePath = join(resultsDir, 'score.json');
  const scoredPath = join(resultsDir, '.scored');

  // Read trace
  const { events: trace, hasCorruption } = await readTrace(tracePath);

  // Get scoring criteria
  let scoringCriteria: ScoringCriteria;
  if (questionMap && questionMap[testNo]) {
    scoringCriteria = getScoringCriteria(questionMap[testNo]);
  } else {
    const questionsPath = resolve(rootDir, 'assets', 'spec', date, 'test-questions.json');
    const questions = loadQuestions(questionsPath);
    const question = questions.find(q => q.id === testNo);
    if (!question) {
      throw new Error(`找不到題目: ${testNo}`);
    }
    scoringCriteria = getScoringCriteria(question);
  }

  // Build judge prompt
  const prompt = buildJudgePrompt(trace, scoringCriteria, testNo, skillName);

  // Call judge model with timeout
  const timeoutMs = env.JUDGE_TIMEOUT > 0 ? env.JUDGE_TIMEOUT * 1000 : 120_000;
  const judgment = await callJudgeModel(prompt, env as unknown as JudgeEnv, { timeoutMs });

  // Warn if judge output had a parse error
  if ((judgment as Record<string, unknown>)._parseError) {
    console.warn(`${testNo}: Judge 輸出解析失敗，使用預設評分結構`);
  }

  // Build ScoreResult from judgment
  const rawDims = (judgment.dimensions as Array<Record<string, unknown>> | undefined) ?? [];
  const rawIssues = (judgment.issues as Array<Record<string, unknown>> | undefined) ?? [];

  const score: ScoreResult = {
    testId: testNo,
    overallScore: (judgment.overallScore as number) ?? 0,
    dimensions: rawDims.map(dim => ({
      name: (dim.name as string) ?? '',
      score: (dim.score as number) ?? 0,
      maxScore: (dim.maxScore as number) ?? 100,
      weight: (dim.weight as number) ?? 0,
      comments: (dim.comments as string) ?? '',
    })),
    issues: rawIssues.map(issue => ({
      severity: (issue.severity as Issue['severity']) ?? 'P1',
      category: (issue.category as Issue['category']) ?? 'other',
      description: (issue.description as string) ?? '',
      evidence: (issue.evidence as string) ?? '',
    })),
    summary: (judgment.summary as string) ?? '',
    scoredAt: new Date().toISOString(),
    scorable: !hasCorruption,
    scoringNote: hasCorruption ? '無法評分：軌跡檔案損壞' : undefined,
  };

  // Atomic write: use mkdir as mutex to prevent race between concurrent scorers
  const lockDir = join(resultsDir, '.scoring-lock');
  try {
    await mkdir(lockDir);
  } catch {
    // Lock already held by another process — skip
    console.warn(`${testNo}: scoring lock held by another process, skipping`);
    return { testId: testNo, score: null, skipped: true };
  }

  try {
    const scoredData = JSON.stringify({
      testId: testNo,
      scoredAt: score.scoredAt,
      overallScore: score.overallScore,
    });
    await writeFile(scoredPath, scoredData, 'utf-8');
    await writeFile(scorePath, JSON.stringify(score, null, 2), 'utf-8');
  } finally {
    // Release lock
    try {
      await rm(lockDir, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  return { testId: testNo, score };
}

// --- Batch Scoring ---

/**
 * Score all tests that have a .done marker but no .scored marker.
 *
 * Scans the results directory, finds unscored tests, and scores them
 * concurrently using promisePool with the concurrency limit from env.
 *
 * @param date - Date string for directory structure
 * @param env - Environment configuration
 * @returns Array of successfully scored ScoreResults
 */
export async function scoreAllTests(date: string, env: EnvConfig): Promise<ScoreResult[]> {
  const rootDir = getProjectRoot();
  const resultsBase = resolve(rootDir, 'results', 'spec', date);
  const doneTests = scanForDone(resultsBase);
  const unscoredTests = doneTests.filter(t => !isAlreadyScored(resultsBase, t));

  if (unscoredTests.length === 0) {
    return [];
  }

  // Pre-load question map for efficient scoring criteria lookup
  let questionMap: Record<string, Question> | undefined;
  try {
    const questionsPath = resolve(rootDir, 'assets', 'spec', date, 'test-questions.json');
    const questions = loadQuestions(questionsPath);
    questionMap = {};
    for (const q of questions) {
      questionMap[q.id] = q;
    }
  } catch {
    console.warn('無法載入題目檔案，將在評分時逐題載入');
  }

  console.log(`找到 ${doneTests.length} 個已完成測試，其中 ${unscoredTests.length} 個尚未評分`);

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  const results = await promisePool(
    unscoredTests,
    async (testNo: string, _i: number) => {
      try {
        const result = await scoreSingleTest(testNo, date, env, questionMap);
        if (result.score) {
          successCount++;
          console.log(`[${successCount + failCount}/${unscoredTests.length}] ${testNo} 評分完成 (總分: ${result.score.overallScore})`);
        } else if (result.skipped) {
          console.log(`[${successCount + failCount + 1}/${unscoredTests.length}] ${testNo} 跳過 (其他 process 佔用鎖)`);
        }
        return result;
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${successCount + failCount}/${unscoredTests.length}] ${testNo} 評分失敗: ${msg}`);
        return { testId: testNo, score: null };
      }
    },
    env.JUDGE_CONCURRENCY,
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== 評分完成 ===`);
  console.log(`成功: ${successCount}/${unscoredTests.length}`);
  console.log(`失敗: ${failCount}/${unscoredTests.length}`);
  console.log(`耗時: ${duration}s`);

  return results
    .filter((r): r is { testId: string; score: ScoreResult } => r.score !== null)
    .map(r => r.score);
}

// --- Directory Scanning ---

/**
 * Scan the results base directory and return all test IDs that have a .done marker.
 *
 * @param resultsBase - Absolute path to results/spec/{date}/
 * @returns Array of test IDs (e.g. ["Q001", "Q002", ...])
 */
export function scanForDone(resultsBase: string): string[] {
  if (!existsSync(resultsBase)) return [];

  const entries = readdirSync(resultsBase, { withFileTypes: true });
  const doneTests: string[] = [];

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
 * Check whether a test has already been scored.
 *
 * @param resultsBase - Absolute path to results/spec/{date}/
 * @param testNo - Test ID (e.g. "Q001")
 * @returns true if .scored marker exists
 */
export function isAlreadyScored(resultsBase: string, testNo: string): boolean {
  const scoredPath = join(resultsBase, `test_${testNo}`, '.scored');
  return existsSync(scoredPath);
}

// --- Watch Mode ---

/**
 * Watch mode: monitor the results directory for new .done files and score
 * them as they appear.
 *
 * Uses fs.watch as the primary detection mechanism, with a polling fallback
 * every 10 seconds if fs.watch is unavailable.
 *
 * The function returns a Promise that never resolves (it runs until the
 * process is terminated with SIGINT or SIGTERM).
 *
 * @param date - Date string for directory structure
 * @param env - Environment configuration
 */
export async function watchMode(date: string, env: EnvConfig): Promise<void> {
  const rootDir = getProjectRoot();
  const resultsBase = resolve(rootDir, 'results', 'spec', date);

  // Pre-load question map for efficiency
  let questionMap: Record<string, Question> | undefined;
  try {
    const questionsPath = resolve(rootDir, 'assets', 'spec', date, 'test-questions.json');
    const questions = loadQuestions(questionsPath);
    questionMap = {};
    for (const q of questions) {
      questionMap[q.id] = q;
    }
    console.log(`已載入 ${questions.length} 道題目的評分標準`);
  } catch {
    console.warn('無法載入題目檔案，將在評分時逐題載入');
  }

  const scored = new Set<string>();
  const pendingQueue: string[] = [];
  let activeWorkers = 0;
  let stopped = false;

  /**
   * Process the next item in the pending queue, respecting concurrency limits.
   */
  const processNext = async (): Promise<void> => {
    if (stopped) return;

    while (activeWorkers < env.JUDGE_CONCURRENCY && pendingQueue.length > 0) {
      const testNo = pendingQueue.shift();
      if (!testNo || scored.has(testNo)) continue;

      activeWorkers++;
      scored.add(testNo);

      scoreSingleTest(testNo, date, env, questionMap)
        .then(result => {
          if (result.score) {
            console.log(`${testNo} 評分完成 (總分: ${result.score.overallScore})`);
          }
        })
        .catch((err: Error) => {
          console.error(`${testNo} 評分失敗: ${err.message}`);
          scored.delete(testNo); // Allow retry
        })
        .finally(() => {
          activeWorkers--;
          processNext();
        });
    }
  };

  /**
   * Enqueue a test for scoring if it hasn't been scored yet.
   */
  function enqueue(testNo: string): void {
    if (scored.has(testNo) || pendingQueue.includes(testNo)) return;
    pendingQueue.push(testNo);
    processNext();
  }

  /**
   * Poll the filesystem for newly completed tests.
   */
  function pollForDone(): void {
    if (stopped) return;
    try {
      for (const testNo of scanForDone(resultsBase)) {
        if (!isAlreadyScored(resultsBase, testNo) && !scored.has(testNo)) {
          enqueue(testNo);
        }
      }
    } catch {
      /* directory may not exist yet */
    }
  }

  // Initial scan
  pollForDone();

  // Primary: fs.watch for real-time detection
  let watcher: ReturnType<typeof watch> | undefined;
  try {
    mkdirSync(resultsBase, { recursive: true });
    watcher = watch(resultsBase, { recursive: true }, (_eventType: string, filename: string | null) => {
      if (filename) {
        // Debounce: delay slightly to ensure file write completes
        setTimeout(pollForDone, 200);
      }
    });
  } catch {
    // fs.watch not available, fall back to polling only
  }

  // Fallback: periodic polling every 10 seconds
  const interval = setInterval(pollForDone, 10000);
  console.log('監視模式已啟動，等待 .done 標記...');
  console.log(`評分並發上限: ${env.JUDGE_CONCURRENCY}`);

  function shutdown(): void {
    stopped = true;
    clearInterval(interval);
    if (watcher) {
      watcher.close();
    }
    console.log('\n監視模式已停止');
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Never resolves on its own
  await new Promise<void>(() => {});
}
