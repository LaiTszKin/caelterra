/**
 * scorer.ts — LLM-as-Judge Scorer Engine
 *
 * Reads executor-produced JSONL traces, calls the Judge Model API to score
 * along three dimensions (instruction_adherence, tool_calling, result_quality),
 * and produces score.json per test. Uses async directory scanning for the
 * main scoring path.
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

import { existsSync } from 'node:fs';
import {
  readFile,
  writeFile,
  rm,
  rmdir,
  readdir,
  access,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';

import type { TraceEvent } from './executor.js';
import type { EnvConfig } from './lib/env-utils.js';
import { callJudgeModel } from './lib/judge-api.js';
import { promisePool } from './lib/promise-pool.js';
import { acquireLock } from './lib/lock.js';
import {
  loadQuestionsFromFile,
  getScoringCriteria,
} from './lib/question-utils.js';
import type { Question, ScoringCriteria } from './lib/question-utils.js';
import { getProjectRoot } from './lib/project-root.js';

// --- Public Types ---

interface ScoreDimension {
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
export async function readTrace(
  tracePath: string,
): Promise<{ events: TraceEvent[]; hasCorruption: boolean }> {
  if (!existsSync(tracePath)) {
    throw new Error(`Trace 檔案不存在: ${tracePath}`);
  }

  const content = await readFile(tracePath, 'utf-8');
  const lines = content.trim().split('\n');
  const events: TraceEvent[] = [];
  let hasCorruption = false;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;

    try {
      const event = JSON.parse(line) as TraceEventWithLine;
      event._lineNumber = i + 1;
      events.push(event);
    } catch (err) {
      hasCorruption = true;
      // Corrupted line: record as parse_error and continue
      const parseErrorEvent: TraceEventWithLine = {
        type: 'parse_error',
        timestamp: new Date().toISOString(),
        data: {
          line: i + 1,
          raw: line.substring(0, 200),
          error: (err as Error).message,
        },
      };
      parseErrorEvent._lineNumber = i + 1;
      events.push(parseErrorEvent);
    }
  }

  return { events, hasCorruption };
}

// --- Judge Prompt Building ---

/**
 * Judge evaluation dimensions (mapped from 4 scoring criteria dimensions):
 * - outcome → 指令遵循 + 結果質量
 * - process → 工具調用 + 指令遵循
 * - style → 結果質量
 * - efficiency → 工具調用
 *
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
  function safeString(val: unknown, fallback: string): string {
    return typeof val === 'string' ? val : fallback;
  }

  let thinkingEvent: TraceEvent | undefined;
  let responseEvent: TraceEvent | undefined;
  let endEvent: TraceEvent | undefined;
  const errorEvents: TraceEvent[] = [];
  for (const e of trace) {
    if (e.type === 'thinking' && !thinkingEvent) thinkingEvent = e;
    else if (e.type === 'response' && !responseEvent) responseEvent = e;
    else if (e.type === 'end' && !endEvent) endEvent = e;
    else if (e.type === 'error') errorEvents.push(e);
  }

  const userPrompt = safeString(thinkingEvent?.data['userPrompt'], '(未記錄)');
  const assistantResponse = safeString(
    (responseEvent?.data['message'] as Record<string, unknown> | undefined)?.[
      'content'
    ],
    '(無回應)',
  );
  const duration = (endEvent?.data['duration_ms'] as number | undefined) ?? 0;
  const status = safeString(endEvent?.data['status'], 'unknown');
  const errors = errorEvents.map((e) => {
    const raw: unknown =
      e.data['error'] ?? e.data['message'] ?? 'unknown error';
    const msg = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return msg;
  });

  // Truncate long assistant response
  const truncatedResponse =
    assistantResponse.length > 8000
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
    criteriaText += `\n### ${dimLabels[key] ?? key} (權重: ${String(criteria.weight)})\n`;
    for (const check of criteria.checks) {
      criteriaText += `- [${check.id}] ${check.description}\n`;
      criteriaText += `  通過條件: ${check.passCondition}\n`;
    }
  }

  // Build the 3-dimension scoring rubric
  let rubricText = '';
  for (let i = 0; i < JUDGE_DIMENSIONS.length; i++) {
    const d = JUDGE_DIMENSIONS[i] as (typeof JUDGE_DIMENSIONS)[number];
    rubricText += `${String(i + 1)}. **${d.name}** (${d.label}): ${d.description}\n`;
  }

  const skillContext = skillName ? `\n## 測試技能\n${skillName}\n` : '';

  // Build trace events summary with JSONL line numbers
  const traceSummaryLines = trace.map((e) => {
    const type = e.type;
    let detail = '';
    if (type === 'tool_call' || type === 'tool_result') {
      const tool = (e.data as Record<string, unknown> | undefined)?.['tool'];
      if (tool) {
        detail = ` — ${typeof tool === 'string' ? tool : JSON.stringify(tool)}`;
      }
    } else if (type === 'thinking') {
      const up = (e.data as Record<string, unknown> | undefined)?.[
        'userPrompt'
      ];
      if (typeof up === 'string') detail = ` — "${up.substring(0, 60)}"`;
    } else if (type === 'response') {
      const msg = (e.data as Record<string, unknown> | undefined)?.[
        'message'
      ] as Record<string, unknown> | undefined;
      const content = msg?.['content'] as string | undefined;
      if (content) detail = ` — ${content.substring(0, 100)}`;
    }
    if (type === 'tool_call') {
      const params = (e.data as Record<string, unknown> | undefined)?.[
        'params'
      ];
      if (params !== undefined)
        detail += `, params: ${JSON.stringify(params).substring(0, 200)}`;
    } else if (type === 'tool_result') {
      const result = (e.data as Record<string, unknown> | undefined)?.[
        'result'
      ];
      if (result !== undefined)
        detail += `, result: ${JSON.stringify(result).substring(0, 200)}`;
    }
    return `L${String(e._lineNumber ?? '?')}: ${type}${detail}`;
  });
  let traceSummary =
    traceSummaryLines.length > 0 ? traceSummaryLines.join('\n') : '(無事件)';
  if (traceSummary.length > 5000) {
    traceSummary = traceSummary.substring(0, 5000) + '\n... (trace truncated)';
  }

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
    `- 耗時: ${String(duration)}ms`,
    errors.length > 0 ? `- 錯誤: ${errors.join('; ')}` : '',
    '',
    '## 執行軌跡事件',
    traceSummary,
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
    "Each issue's evidence MUST reference the JSONL line number(s) using the format 'L42: <description>'.",
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
 * Write score.json and .scored marker atomically.
 * Shared helper to avoid duplicated write logic in scoreSingleTest.
 */
async function writeScoreFiles(
  score: ScoreResult,
  testNo: string,
  scorePath: string,
  scoredPath: string,
): Promise<void> {
  await writeFile(scorePath, JSON.stringify(score, null, 2), 'utf-8');
  const scoredData = JSON.stringify({
    testId: testNo,
    scoredAt: score.scoredAt,
    overallScore: score.overallScore,
  });
  await writeFile(scoredPath, scoredData, 'utf-8');
}

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

  // Read trace
  const { events: trace, hasCorruption } = await readTrace(tracePath);

  // Get scoring criteria
  let scoringCriteria: ScoringCriteria;
  if (questionMap && questionMap[testNo]) {
    scoringCriteria = getScoringCriteria(questionMap[testNo]);
  } else {
    const questionsPath = resolve(
      rootDir,
      'assets',
      'spec',
      date,
      'test-questions.json',
    );
    const questions = loadQuestionsFromFile(questionsPath);
    const question = questions.find((q) => q.id === testNo);
    if (!question) {
      throw new Error(`找不到題目: ${testNo}`);
    }
    scoringCriteria = getScoringCriteria(question);
  }

  // Build judge prompt
  const prompt = buildJudgePrompt(trace, scoringCriteria, testNo, skillName);
  const timeoutMs = env.JUDGE_TIMEOUT > 0 ? env.JUDGE_TIMEOUT * 1000 : 120_000;

  // Atomic write: use mkdir as mutex to prevent race between concurrent scorers
  const lockDir = join(resultsDir, '.scoring-lock');
  const lockResult = await acquireLock(lockDir, { onConflict: 'skip' }); // await mkdir(lockDir)
  if (lockResult.skipped) {
    console.warn(`${testNo}: scoring lock held by another process, skipping`);
    return { testId: testNo, score: null, skipped: true };
  }

  try {
    // Double-check: another process might have scored this while we waited for the lock
    try {
      await access(scoredPath);
      console.warn(
        `${testNo}: already scored (detected after lock acquisition), skipping`,
      );
      return { testId: testNo, score: null, skipped: true };
    } catch {
      /* .scored not found — safe to score */
    }

    // Skip if trace has corruption — don't waste judge API calls
    if (hasCorruption) {
      const score: ScoreResult = {
        testId: testNo,
        overallScore: 0,
        dimensions: [],
        issues: [
          {
            severity: 'P2',
            category: 'other',
            description: '軌跡檔案損壞，無法評分',
            evidence: 'Trace file contains corrupted JSON lines',
          },
        ],
        summary: '無法評分：軌跡檔案損壞',
        scoredAt: new Date().toISOString(),
        scorable: false,
        scoringNote: '無法評分：軌跡檔案損壞',
      };
      await writeScoreFiles(score, testNo, scorePath, scoredPath);
      return { testId: testNo, score };
    }

    // ── Judge Model Scoring ───────────────────────────────────────────────
    // Only reached when the trace has no corruption and scoring should proceed.
    // Call judge model with timeout
    const judgment = await callJudgeModel(prompt, env, { timeoutMs });

    // Warn if judge output had a parse error
    if (judgment['_parseError']) {
      console.warn(`${testNo}: Judge 輸出解析失敗，使用預設評分結構`);
    }

    // Build ScoreResult from judgment with runtime type validation (FIX-20)
    const rawDims = Array.isArray(judgment['dimensions'])
      ? judgment['dimensions']
      : [];
    if (
      !Array.isArray(judgment['dimensions']) &&
      judgment['dimensions'] !== undefined
    ) {
      console.warn(
        `${testNo}: judgment['dimensions'] 不是陣列 (型別: ${typeof judgment['dimensions']})，使用空陣列`,
      );
    }

    const rawIssues = Array.isArray(judgment['issues'])
      ? judgment['issues']
      : [];
    if (
      !Array.isArray(judgment['issues']) &&
      judgment['issues'] !== undefined
    ) {
      console.warn(
        `${testNo}: judgment['issues'] 不是陣列 (型別: ${typeof judgment['issues']})，使用空陣列`,
      );
    }

    // Allowed values for validation
    const ALLOWED_SEVERITY: Issue['severity'][] = ['P0', 'P1', 'P2'];
    const ALLOWED_CATEGORY: Issue['category'][] = ['skill', 'apltk', 'other'];

    const score: ScoreResult = {
      testId: testNo,
      overallScore:
        typeof judgment['overallScore'] === 'number'
          ? judgment['overallScore']
          : 0,
      dimensions: rawDims.map((dim: Record<string, unknown>, idx) => {
        const nameOk = typeof dim['name'] === 'string';
        const scoreOk = typeof dim['score'] === 'number';
        const maxScoreOk = typeof dim['maxScore'] === 'number';
        const weightOk = typeof dim['weight'] === 'number';
        const commentsOk = typeof dim['comments'] === 'string';

        if (!nameOk || !scoreOk || !maxScoreOk || !weightOk || !commentsOk) {
          const badFields: string[] = [];
          if (!nameOk) badFields.push(`name (${typeof dim['name']})`);
          if (!scoreOk) badFields.push(`score (${typeof dim['score']})`);
          if (!maxScoreOk)
            badFields.push(`maxScore (${typeof dim['maxScore']})`);
          if (!weightOk) badFields.push(`weight (${typeof dim['weight']})`);
          if (!commentsOk)
            badFields.push(`comments (${typeof dim['comments']})`);
          console.warn(
            `${testNo}: dimension[${String(idx)}] 欄位型別不符: ${badFields.join(', ')}，使用預設值`,
          );
        }

        return {
          name: typeof dim['name'] === 'string' ? dim['name'] : '',
          score: typeof dim['score'] === 'number' ? dim['score'] : 0,
          maxScore: typeof dim['maxScore'] === 'number' ? dim['maxScore'] : 100,
          weight: typeof dim['weight'] === 'number' ? dim['weight'] : 0,
          comments: typeof dim['comments'] === 'string' ? dim['comments'] : '',
        };
      }),
      issues: rawIssues.map((issue: Record<string, unknown>, idx) => {
        const severityOk =
          typeof issue['severity'] === 'string' &&
          (ALLOWED_SEVERITY as string[]).includes(issue['severity']);
        const categoryOk =
          typeof issue['category'] === 'string' &&
          (ALLOWED_CATEGORY as string[]).includes(issue['category']);
        const descOk = typeof issue['description'] === 'string';
        const evidenceOk = typeof issue['evidence'] === 'string';

        if (!severityOk || !categoryOk || !descOk || !evidenceOk) {
          const badFields: string[] = [];
          if (!severityOk)
            badFields.push(
              `severity (${typeof issue['severity']}: ${String(issue['severity'])})`,
            );
          if (!categoryOk)
            badFields.push(
              `category (${typeof issue['category']}: ${String(issue['category'])})`,
            );
          if (!descOk)
            badFields.push(`description (${typeof issue['description']})`);
          if (!evidenceOk)
            badFields.push(`evidence (${typeof issue['evidence']})`);
          console.warn(
            `${testNo}: issue[${String(idx)}] 欄位型別不符: ${badFields.join(', ')}，使用預設值`,
          );
        }

        return {
          severity: (severityOk
            ? issue['severity']
            : 'P1') as Issue['severity'],
          category: (categoryOk
            ? issue['category']
            : 'other') as Issue['category'],
          description:
            typeof issue['description'] === 'string'
              ? issue['description']
              : '',
          evidence:
            typeof issue['evidence'] === 'string' ? issue['evidence'] : '',
        };
      }),
      summary: (judgment['summary'] ?? '') as string,
      scoredAt: new Date().toISOString(),
      scorable: true,
    };

    // Write score.json FIRST, then .scored marker
    await writeScoreFiles(score, testNo, scorePath, scoredPath);
    return { testId: testNo, score };
  } finally {
    // Release lock
    try {
      await rm(lockDir, { recursive: true });
    } catch (err) {
      console.error(
        `[scorer] Failed to remove scoring lock at ${lockDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Fallback: try rmdir (succeeds only if lock dir is empty, i.e. normal case)
      try {
        await rmdir(lockDir);
      } catch {
        /* ignore fallback failure */
      }
    }
  }
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
export async function scoreAllTests(
  date: string,
  env: EnvConfig,
): Promise<ScoreResult[]> {
  const rootDir = getProjectRoot();
  const resultsBase = resolve(rootDir, 'results', 'spec', date);
  const doneTests = await scanForDoneAsync(resultsBase);
  const unscoredTests = doneTests.filter(
    (t) => !isAlreadyScored(resultsBase, t),
  );

  if (unscoredTests.length === 0) {
    return [];
  }

  // Pre-load question map for efficient scoring criteria lookup
  let questionMap: Record<string, Question> | undefined;
  try {
    const questionsPath = resolve(
      rootDir,
      'assets',
      'spec',
      date,
      'test-questions.json',
    );
    const questions = loadQuestionsFromFile(questionsPath);
    questionMap = {};
    for (const q of questions) {
      questionMap[q.id] = q;
    }
  } catch {
    console.warn('無法載入題目檔案，將在評分時逐題載入');
  }

  console.log(
    `找到 ${String(doneTests.length)} 個已完成測試，其中 ${String(unscoredTests.length)} 個尚未評分`,
  );

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;

  const results = await promisePool(
    unscoredTests,
    async (testNo: string) => {
      try {
        const result = await scoreSingleTest(testNo, date, env, questionMap);
        if (result.score) {
          successCount++;
          console.log(
            `[${String(successCount + failCount)}/${String(unscoredTests.length)}] ${testNo} 評分完成 (總分: ${String(result.score.overallScore)})`,
          );
        } else if (result.skipped) {
          console.log(
            `[${String(successCount + failCount + 1)}/${String(unscoredTests.length)}] ${testNo} 跳過 (其他 process 佔用鎖)`,
          );
        }
        return result;
      } catch (err) {
        failCount++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[${String(successCount + failCount)}/${String(unscoredTests.length)}] ${testNo} 評分失敗: ${msg}`,
        );
        return { testId: testNo, score: null };
      }
    },
    env.JUDGE_CONCURRENCY,
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== 評分完成 ===`);
  console.log(`成功: ${String(successCount)}/${String(unscoredTests.length)}`);
  console.log(`失敗: ${String(failCount)}/${String(unscoredTests.length)}`);
  console.log(`耗時: ${duration}s`);

  return results
    .filter(
      (r): r is { testId: string; score: ScoreResult } => r.score !== null,
    )
    .map((r) => r.score);
}

// --- Directory Scanning ---

/**
 * Scan the results base directory and return all test IDs that have a .done marker.
 *
 * @param resultsBase - Absolute path to results/spec/{date}/
 * @returns Array of test IDs (e.g. ["Q001", "Q002", ...])
 */
/**
 * Check whether a test has already been scored.
 *
 * @param resultsBase - Absolute path to results/spec/{date}/
 * @param testNo - Test ID (e.g. "Q001")
 * @returns true if .scored marker exists
 */
function isAlreadyScored(resultsBase: string, testNo: string): boolean {
  const scoredPath = join(resultsBase, `test_${testNo}`, '.scored');
  return existsSync(scoredPath);
}

// --- Async Directory Scanning ---

/**
 * Scan the results base directory for tests with .done marker, using async I/O.
 *
 * Uses fs/promises readdir + access for non-blocking directory scanning.
 * Suitable for concurrent callers that don't want to block the event loop.
 *
 * @param resultsBase - Absolute path to results/spec/{date}/
 * @returns Promise resolving to array of test IDs (e.g. ["Q001", "Q002", ...])
 */
async function scanForDoneAsync(resultsBase: string): Promise<string[]> {
  try {
    const entries = await readdir(resultsBase, { withFileTypes: true });
    const doneTests: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('test_')) {
        const testNo = entry.name.replace('test_', '');
        try {
          await access(join(resultsBase, entry.name, '.done'));
          doneTests.push(testNo);
        } catch {
          /* .done not found */
        }
      }
    }
    return doneTests;
  } catch {
    return [];
  }
}
