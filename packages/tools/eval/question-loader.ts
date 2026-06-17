/**
 * question-loader.ts
 *
 * Eval question management module for loading, validating, and sampling
 * evaluation questions.
 *
 * This module wraps lib/question-utils and provides higher-level operations:
 *   - loadQuestions:     Load questions with explicit file-not-found error
 *   - sampleQuestions:   Stratified sampling by difficulty (fast / standard modes)
 */

import fs from 'node:fs';
import path from 'node:path';

import { loadQuestionsFromFile } from './lib/question-utils.js';
import type { Question } from './lib/question-utils.js';

// --- Internal helpers ---

/**
 * Fisher-Yates shuffle (in-place on a copy, returns new array).
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = temp;
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
        "請確認題庫檔案存在於 assets/spec/{date}/test-questions.json，或使用 'apltk eval <skill>' 自動載入。需先建立題庫。",
    );
  }

  return loadQuestionsFromFile(resolved);
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
    throw new Error('題目陣列為空，無法抽樣。需先建立題庫。');
  }

  const byDifficulty: Record<string, Question[]> = {
    basic: [],
    advanced: [],
    edge: [],
  };
  for (const q of questions) {
    (byDifficulty[q.difficulty] as Question[]).push(q);
  }

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
      selected.push(shuffleArray(pool)[0] as Question);
    }

    // Fill remaining slots from all leftover questions
    const usedIds = new Set(selected.map((q) => q.id));
    const remaining: Question[] = [];
    for (const q of questions) {
      if (!usedIds.has(q.id)) remaining.push(q);
    }
    const extraNeeded = targetCount - selected.length;
    selected.push(
      ...shuffleArray(remaining).slice(
        0,
        Math.min(extraNeeded, remaining.length),
      ),
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
    ...pickN(byDifficulty['basic'] as Question[], basicTarget),
    ...pickN(byDifficulty['advanced'] as Question[], advancedTarget),
    ...pickN(byDifficulty['edge'] as Question[], edgeTarget),
  ];

  if (selected.length === 0) {
    throw new Error('抽樣結果為空，請確認題目陣列包含有效題目');
  }

  return shuffleArray(selected);
}
