/**
 * question-loader.ts
 *
 * Eval question management module for loading, validating, sampling,
 * and generating LLM variants of evaluation questions.
 *
 * This module wraps lib/question-utils and provides higher-level operations:
 *   - loadQuestions:     Load questions with explicit file-not-found error
 *   - sampleQuestions:   Stratified sampling by difficulty (fast / standard modes)
 *   - generateVariant:   LLM-based question variant generation
 *
 * Re-exports Question type from lib/question-utils for external consumers.
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadQuestions as libLoadQuestions } from './lib/question-utils.js';
import type { Question, FileContext, ScoringCriteria } from './lib/question-utils.js';
import type { EnvConfig } from './lib/env-utils.js';
import { callJudgeModel } from './lib/judge-api.js';

// --- Re-exports ---

export type { Question } from './lib/question-utils.js';

// --- Internal helpers ---

/**
 * Fisher-Yates shuffle (in-place on a copy, returns new array).
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// --- Public API ---

/**
 * Load questions from a JSON file with explicit error handling.
 *
 * Wraps lib/question-utils loadQuestions with a clearer file-not-found
 * message that helps users locate the correct file path.
 *
 * @param filePath - Path to the question JSON file
 * @returns Array of validated Question objects
 * @throws Error if file does not exist, JSON is invalid, or validation fails
 */
export function loadQuestions(filePath: string): Question[] {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `題目檔案不存在: "${resolved}"\n` +
      '請確認檔案路徑是否正確。你可使用 assets/spec/ 目錄下的範例題目檔案：\n' +
      '  node dist/bin/apollo-toolkit.js eval --questions assets/spec/2026-05-28/test-questions.json',
    );
  }

  return libLoadQuestions(resolved);
}

/**
 * Stratified question sampling by difficulty level.
 *
 * Two modes:
 *   - fast:     3–5 questions, at least 1 from each difficulty (basic, advanced, edge),
 *               remaining slots filled randomly from the full pool.
 *   - standard: 8–12 questions, following ~4:4:2 ratio (basic:advanced:edge),
 *               with proportional adjustment when counts are uneven.
 *
 * @param questions - Full question pool (must contain at least 1 question per difficulty for fast mode)
 * @param mode      - Sampling mode: 'fast' or 'standard'
 * @returns         Shuffled subset of questions
 * @throws          Error if the question pool is empty or (in fast mode) a difficulty level is empty
 */
export function sampleQuestions(
  questions: Question[],
  mode: 'fast' | 'standard',
): Question[] {
  if (questions.length === 0) {
    throw new Error('題目陣列為空，無法抽樣');
  }

  const byDifficulty = {
    basic: questions.filter(q => q.difficulty === 'basic'),
    advanced: questions.filter(q => q.difficulty === 'advanced'),
    edge: questions.filter(q => q.difficulty === 'edge'),
  };

  if (mode === 'fast') {
    // Validate each difficulty level has at least 1 question
    for (const [level, pool] of Object.entries(byDifficulty)) {
      if (pool.length === 0) {
        throw new Error(
          `fast 模式需要每個難度至少 1 道題目，但目前 ${level} 為 0 題`,
        );
      }
    }

    const targetCount = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
    const selected: Question[] = [];

    // Pick 1 from each difficulty (mandatory)
    for (const pool of Object.values(byDifficulty)) {
      selected.push(shuffleArray(pool)[0]);
    }

    // Fill remaining slots from all leftover questions
    const usedIds = new Set(selected.map(q => q.id));
    const remaining = questions.filter(q => !usedIds.has(q.id));
    const extraNeeded = targetCount - selected.length;
    selected.push(
      ...shuffleArray(remaining).slice(0, Math.min(extraNeeded, remaining.length)),
    );

    return shuffleArray(selected);
  }

  // Standard mode: 8–12 questions, ratio ~4:4:2
  const targetCount = 8 + Math.floor(Math.random() * 5); // 8, 9, 10, 11, or 12
  const basicTarget = Math.round(targetCount * 0.4);
  const advancedTarget = Math.round(targetCount * 0.4);
  const edgeTarget = targetCount - basicTarget - advancedTarget;

  const pickN = (pool: Question[], n: number): Question[] =>
    shuffleArray(pool).slice(0, Math.min(n, pool.length));

  const selected: Question[] = [
    ...pickN(byDifficulty.basic, basicTarget),
    ...pickN(byDifficulty.advanced, advancedTarget),
    ...pickN(byDifficulty.edge, edgeTarget),
  ];

  if (selected.length === 0) {
    throw new Error('抽樣結果為空，請確認題目陣列包含有效題目');
  }

  return shuffleArray(selected);
}

/**
 * Generate a variant of an existing question using an LLM.
 *
 * The LLM rewrites the userPrompt and projectContext (description + file contents)
 * to create a different scenario while preserving the critical invariants:
 *   - scoringCriteria is NEVER modified
 *   - difficulty is preserved from the original
 *   - coveredSteps is preserved if present
 *
 * @param question - Original question to generate a variant from
 * @param env      - Environment config providing JUDGE_* variables for the LLM call
 * @returns        A new Question with rewritten scenario but identical scoring criteria
 */
export async function generateVariant(
  question: Question,
  env: EnvConfig,
): Promise<Question> {
  const prompt = `你是一個題目變體生成器。請根據以下原始題目，生成一個新的變體。

## 要求
1. 改寫 userPrompt 的場景描述（保持相同的功能需求範圍和技術難度）
2. 改寫 projectContext 的 description 和檔案內容，建立一個不同的專案場景
3. 產生新的 id（在原始 id 後加上 "_v" 和隨機字母後綴）
4. **嚴格保留** 原始的 difficulty 和 scoringCriteria（完全不做任何修改）
5. 保留原始的 coveredSteps（如果有）

## 原始題目 JSON
${JSON.stringify(question, null, 2)}

## 輸出格式
請只回傳以下 JSON，不要包含其他說明文字：
{
  "id": "新的題目 ID（例如 Q001_v_abc）",
  "userPrompt": "改寫後的 user prompt",
  "projectContext": {
    "description": "新的專案背景描述",
    "files": [
      { "path": "檔案路徑", "content": "檔案內容" }
    ]
  }
}

請確保輸出是有效的 JSON，不要包含 \`\`\`json 標記或其他說明文字。`;

  const timeoutMs =
    typeof env.JUDGE_TIMEOUT === 'number' && env.JUDGE_TIMEOUT > 0
      ? env.JUDGE_TIMEOUT * 1000
      : 120_000;

  const result = await callJudgeModel(prompt, env, { timeoutMs });

  // Safely extract result fields with fallbacks
  const llmProjectContext = result.projectContext as
    | Record<string, unknown>
    | undefined;

  const variant: Question = {
    id:
      typeof result.id === 'string' && result.id.length > 0
        ? result.id
        : `${question.id}_v${Date.now()}`,

    userPrompt:
      typeof result.userPrompt === 'string' && result.userPrompt.length > 0
        ? result.userPrompt
        : question.userPrompt,

    difficulty: question.difficulty, // Preserved from original

    projectContext: {
      description:
        typeof llmProjectContext?.description === 'string'
          ? llmProjectContext.description
          : question.projectContext.description,

      files:
        Array.isArray(llmProjectContext?.files) &&
        llmProjectContext.files.length > 0
          ? (llmProjectContext.files as FileContext[])
          : question.projectContext.files,
    },

    scoringCriteria: question.scoringCriteria, // Critical invariant: NEVER modified
    coveredSteps: question.coveredSteps, // Preserved if present
  };

  return variant;
}
