#!/usr/bin/env node

/**
 * question-utils.ts
 *
 * Question loading, validation, and stripping utilities.
 *
 * Purposes:
 *   - loadQuestionsFromFile(filePath): read JSON question file, validate, return question array
 *   - stripScoringCriteria(question): strip scoring criteria, return { id, userPrompt, projectContext }
 *   - getScoringCriteria(question): return full scoringCriteria object
 *
 * Uses only Node.js built-in modules (fs, path), no external dependencies.
 *
 * This is the TypeScript version migrated from scripts/question-utils.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';

import { callJudgeModelRaw } from './judge-api.js';
import type { EnvConfig } from './env-utils.js';

// --- Types ---

interface FileContext {
  path: string;
  content: string;
}

export interface ProjectContext {
  description: string;
  files: FileContext[];
}

interface CheckItem {
  id: string;
  description: string;
  passCondition: string;
}

interface ScoringDimension {
  weight: number;
  checks: CheckItem[];
}

export interface ScoringCriteria {
  outcome: ScoringDimension;
  process: ScoringDimension;
  style: ScoringDimension;
  efficiency: ScoringDimension;
}

export interface Question {
  id: string;
  userPrompt: string;
  difficulty: 'basic' | 'advanced' | 'edge';
  projectContext: ProjectContext;
  scoringCriteria: ScoringCriteria;
  coveredSteps?: string[];
}

interface StrippedQuestion {
  id: string;
  userPrompt: string;
  projectContext: ProjectContext;
}

interface StepDefinition {
  key: string;
  label: string;
}

// --- Constants ---

/**
 * Scoring dimensions definition (for reference by other modules).
 */
const SCORING_DIMENSIONS: ScoringDimensionMeta[] = [
  { key: 'outcome', label: '任務完成' },
  { key: 'process', label: '流程遵循' },
  { key: 'style', label: '輸出格式' },
  { key: 'efficiency', label: '效率' },
];

interface ScoringDimensionMeta {
  key: string;
  label: string;
}

/**
 * Spec skill workflow eight-step definition (used for step coverage validation).
 */
const SPEC_WORKFLOW_STEPS: StepDefinition[] = [
  { key: 'understand-requirements', label: '理解需求' },
  { key: 'design-architecture', label: '拆分設計' },
  { key: 'split-tasks', label: '拆分任務' },
  { key: 'define-acceptance', label: '制定驗收條件' },
  { key: 'research-docs', label: '查找文檔' },
  { key: 'use-cli', label: '使用 CLI 工具' },
  { key: 'architecture-diff', label: '產生架構 diff' },
  { key: 'self-review', label: '交付前自我審查' },
];

// --- Validation ---

/**
 * Validate a single question object against the expected schema.
 * A lightweight manual validator without external packages like ajv.
 *
 * @param question - The raw question object to validate
 * @returns Validation result with errors array
 */
function validateQuestion(question: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const q = question as Record<string, unknown>;

  // Top-level required fields
  if (typeof q['id'] !== 'string' || q['id'].length === 0) {
    errors.push(
      `question.id 必須是非空字串，目前為: ${JSON.stringify(q['id'])}`,
    );
  }
  if (typeof q['userPrompt'] !== 'string' || q['userPrompt'].length === 0) {
    errors.push(
      `question.userPrompt 必須是非空字串，目前為: ${JSON.stringify(q['userPrompt'])}`,
    );
  }

  // difficulty enum
  const validDifficulties = ['basic', 'advanced', 'edge'];
  if (!validDifficulties.includes(q['difficulty'] as string)) {
    errors.push(
      `question.difficulty 必須為 basic/advanced/edge，目前為: "${String(q['difficulty'])}"`,
    );
  }

  // projectContext
  if (!q['projectContext'] || typeof q['projectContext'] !== 'object') {
    errors.push('question.projectContext 必須是物件');
  } else {
    const pc = q['projectContext'] as Record<string, unknown>;
    if (typeof pc['description'] !== 'string') {
      errors.push('question.projectContext.description 必須是字串');
    }
    if (!Array.isArray(pc['files'])) {
      errors.push('question.projectContext.files 必須是陣列');
    } else {
      (pc['files'] as unknown[]).forEach((file, i) => {
        const f = file as Record<string, unknown>;
        if (typeof f['path'] !== 'string') {
          errors.push(`projectContext.files[${String(i)}].path 必須是字串`);
        }
        if (typeof f['content'] !== 'string') {
          errors.push(`projectContext.files[${String(i)}].content 必須是字串`);
        }
      });
    }
  }

  // scoringCriteria
  if (!q['scoringCriteria'] || typeof q['scoringCriteria'] !== 'object') {
    errors.push('question.scoringCriteria 必須是物件');
  } else {
    const sc = q['scoringCriteria'] as Record<string, unknown>;
    for (const { key, label } of SCORING_DIMENSIONS) {
      const dim = sc[key] as Record<string, unknown> | undefined;
      if (!dim || typeof dim !== 'object') {
        errors.push(`scoringCriteria.${key} (${label}) 必須是物件`);
        continue;
      }
      if (
        typeof dim['weight'] !== 'number' ||
        dim['weight'] < 0 ||
        dim['weight'] > 1
      ) {
        errors.push(
          `scoringCriteria.${key}.weight 必須是 0-1 的數字，目前為: ${String(dim['weight'])}`,
        );
      }
      if (!Array.isArray(dim['checks']) || dim['checks'].length === 0) {
        errors.push(`scoringCriteria.${key}.checks 必須是非空陣列`);
      } else {
        (dim['checks'] as unknown[]).forEach((check, i) => {
          const c = check as Record<string, unknown>;
          if (typeof c['id'] !== 'string' || c['id'].length === 0) {
            errors.push(
              `scoringCriteria.${key}.checks[${String(i)}].id 必須是非空字串`,
            );
          }
          if (
            typeof c['description'] !== 'string' ||
            c['description'].length === 0
          ) {
            errors.push(
              `scoringCriteria.${key}.checks[${String(i)}].description 必須是非空字串`,
            );
          }
          if (
            typeof c['passCondition'] !== 'string' ||
            c['passCondition'].length === 0
          ) {
            errors.push(
              `scoringCriteria.${key}.checks[${String(i)}].passCondition 必須是非空字串`,
            );
          }
        });
      }
    }
  }

  // coveredSteps (optional field)
  if (q['coveredSteps'] !== undefined) {
    if (!Array.isArray(q['coveredSteps'])) {
      errors.push('question.coveredSteps 必須是陣列');
    } else {
      const validSteps = new Set(SPEC_WORKFLOW_STEPS.map((s) => s.key));
      (q['coveredSteps'] as unknown[]).forEach((step, i) => {
        if (typeof step !== 'string' || !validSteps.has(step)) {
          errors.push(
            `question.coveredSteps[${String(i)}] "${String(step)}" 不是有效的步驟鍵值`,
          );
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Public API ---

/**
 * Load a question file, read JSON, and validate each question.
 *
 * @param filePath - Path to the question JSON file
 * @returns Array of validated Question objects
 * @throws Error if JSON is invalid, the array is empty, or any question fails validation
 */
export function loadQuestionsFromFile(filePath: string): Question[] {
  const resolved = path.resolve(filePath);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(
      `無法讀取題目檔案 "${resolved}": ${(err as Error).message}`,
    );
  }

  let questions: unknown[];
  try {
    questions = JSON.parse(raw) as unknown[];
  } catch (err) {
    throw new Error(
      `題目檔案 JSON 格式無效 "${resolved}": ${(err as Error).message}`,
    );
  }

  if (!Array.isArray(questions)) {
    throw new Error('題目檔案內容必須是 JSON 陣列');
  }

  if (questions.length === 0) {
    throw new Error('題目陣列為空');
  }

  if (questions.length < 3) {
    throw new Error(
      `題庫數量不足: 需要至少 3 題（目前 ${String(questions.length)} 題）。請先建立足夠題庫。`,
    );
  }

  if (questions.length < 100) {
    console.log(
      `提示: 題目數量為 ${String(questions.length)}，少於預期的 100 道。測試覆蓋率可能不足。`,
    );
  }

  // Validate each question
  const validationErrors: string[] = [];
  const idSet = new Set<string>();

  questions.forEach((q, index) => {
    const { valid, errors } = validateQuestion(q);
    if (!valid) {
      const rawId = (q as Record<string, unknown>)['id'];
      const qid = typeof rawId === 'string' ? rawId : '無';
      validationErrors.push(
        `題目 #${String(index + 1)} (id: ${qid}): ${errors.join('; ')}`,
      );
    }
    // Check duplicate ID
    const qid = (q as Record<string, unknown>)['id'] as string | undefined;
    if (qid && idSet.has(qid)) {
      validationErrors.push(`題目 #${String(index + 1)}: id "${qid}" 重複`);
    }
    if (qid) {
      idSet.add(qid);
    }
  });

  if (validationErrors.length > 0) {
    throw new Error(
      `題目驗證失敗 (${String(validationErrors.length)} 個錯誤):\n${validationErrors.join('\n')}`,
    );
  }

  return questions as Question[];
}

/**
 * Strip scoring criteria and difficulty from a question,
 * returning only { id, userPrompt, projectContext }.
 * This ensures the tested agent cannot see the scoring criteria or difficulty level.
 *
 * @param question - Full question object
 * @returns Stripped question with only id, userPrompt, and projectContext
 */
export function stripScoringCriteria(question: Question): StrippedQuestion {
  return {
    id: question.id,
    userPrompt: question.userPrompt,
    projectContext: question.projectContext,
  };
}

/**
 * Return the scoring criteria object from a full question for use by the scorer.
 *
 * @param question - Full question object
 * @returns Scoring criteria containing outcome/process/style/efficiency dimensions
 */
export function getScoringCriteria(question: Question): ScoringCriteria {
  return question.scoringCriteria;
}

/**
 * Generate question variants by rewriting only the user prompt.
 * Uses the judge model to generate semantically equivalent variants.
 * Preserves scoringCriteria, difficulty, and projectContext from the original.
 *
 * @param question - The source question to generate variants from
 * @param count    - Number of variants to generate
 * @param env      - Environment config (used for judge model API call)
 * @returns        Array of variant Question objects (may be fewer than count on parse failure)
 */
export async function generateVariants(
  question: Question,
  count: number,
  env: EnvConfig,
): Promise<Question[]> {
  const prompt = `You are a test question variant generator. Given an evaluation question, create ${String(count)} semantically equivalent variants by rewriting only the scenario description.

Original question:
\`\`\`
ID: ${question.id}
User Prompt: ${question.userPrompt}
Difficulty: ${question.difficulty}
\`\`\`

For each variant:
- Rewrite the userPrompt to be semantically equivalent but differently worded
- Keep the same difficulty level
- DO NOT change the scoring criteria, project context, or expected behavior
- Output as a JSON array of objects, each with "id" and "userPrompt" fields
- ID format: "${question.id}_v{1..${String(count)}}"

Respond ONLY with the JSON array, no other text.`;

  const { content } = await callJudgeModelRaw(
    [{ role: 'user', content: prompt }],
    env,
  );

  // Parse JSON with fallback
  let variants: Array<Record<string, unknown>> = [];
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      variants = parsed as Array<Record<string, unknown>>;
    }
  } catch {
    const match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        variants = JSON.parse(match[0]) as Array<Record<string, unknown>>;
      } catch {
        /* fall through */
      }
    }
  }

  return variants
    .filter(
      (v) =>
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        v != null &&
        typeof v['id'] === 'string' &&
        typeof v['userPrompt'] === 'string',
    )
    .map((v) => ({
      ...question,
      id: v['id'] as string,
      userPrompt: v['userPrompt'] as string,
    }))
    .slice(0, count);
}
