#!/usr/bin/env node

/**
 * question-utils.ts
 *
 * Question loading, validation, and stripping utilities.
 *
 * Purposes:
 *   - loadQuestions(filePath): read JSON question file, validate, return question array
 *   - stripScoringCriteria(question): strip scoring criteria, return { id, userPrompt, projectContext }
 *   - getScoringCriteria(question): return full scoringCriteria object
 *
 * Uses only Node.js built-in modules (fs, path), no external dependencies.
 *
 * This is the TypeScript version migrated from scripts/question-utils.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Types ---

export interface FileContext {
  path: string;
  content: string;
}

export interface ProjectContext {
  description: string;
  files: FileContext[];
}

export interface CheckItem {
  id: string;
  description: string;
  passCondition: string;
}

export interface ScoringDimension {
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

export interface StrippedQuestion {
  id: string;
  userPrompt: string;
  projectContext: ProjectContext;
}

export interface StepDefinition {
  key: string;
  label: string;
}

// --- Constants ---

/**
 * Scoring dimensions definition (for reference by other modules).
 */
export const SCORING_DIMENSIONS: ScoringDimensionMeta[] = [
  { key: 'outcome', label: '任務完成' },
  { key: 'process', label: '流程遵循' },
  { key: 'style', label: '輸出格式' },
  { key: 'efficiency', label: '效率' },
];

export interface ScoringDimensionMeta {
  key: string;
  label: string;
}

/**
 * Spec skill workflow eight-step definition (used for step coverage validation).
 */
export const SPEC_WORKFLOW_STEPS: StepDefinition[] = [
  { key: 'understand-requirements', label: '理解需求' },
  { key: 'design-architecture', label: '拆分設計' },
  { key: 'split-tasks', label: '拆分任務' },
  { key: 'define-acceptance', label: '制定驗收條件' },
  { key: 'research-docs', label: '查找文檔' },
  { key: 'use-cli', label: '使用 CLI 工具' },
  { key: 'architecture-diff', label: '產生架構 diff' },
  { key: 'self-review', label: '交付前自我審查' },
];

// --- Schema loading ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Read and parse a question JSON Schema file.
 *
 * @param schemaPath - Schema file path; defaults to assets/spec/question-schema.json
 *                     relative to the project root (derived from script location)
 * @returns Parsed JSON Schema object
 */
export function loadSchema(schemaPath?: string): Record<string, unknown> {
  const resolved = schemaPath
    ? path.resolve(schemaPath)
    // In compiled output (packages/tools/eval/dist/lib/),
    // navigates 5 levels up to project root via __dirname.
    // __dirname for source = packages/tools/eval/lib/
    // __dirname for compiled = packages/tools/eval/dist/lib/
    : path.resolve(__dirname, '..', '..', '..', '..', '..', 'assets', 'spec', 'question-schema.json');
  return JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Record<string, unknown>;
}

// --- Validation ---

/**
 * Validate a single question object against the expected schema.
 * A lightweight manual validator without external packages like ajv.
 *
 * @param question - The raw question object to validate
 * @returns Validation result with errors array
 */
function validateQuestion(question: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const q = question as Record<string, unknown>;

  // Top-level required fields
  if (typeof q.id !== 'string' || q.id.length === 0) {
    errors.push(`question.id 必須是非空字串，目前為: ${JSON.stringify(q.id)}`);
  }
  if (typeof q.userPrompt !== 'string' || q.userPrompt.length === 0) {
    errors.push(`question.userPrompt 必須是非空字串，目前為: ${JSON.stringify(q.userPrompt)}`);
  }

  // difficulty enum
  const validDifficulties = ['basic', 'advanced', 'edge'];
  if (!validDifficulties.includes(q.difficulty as string)) {
    errors.push(`question.difficulty 必須為 basic/advanced/edge，目前為: "${String(q.difficulty)}"`);
  }

  // projectContext
  if (!q.projectContext || typeof q.projectContext !== 'object') {
    errors.push('question.projectContext 必須是物件');
  } else {
    const pc = q.projectContext as Record<string, unknown>;
    if (typeof pc.description !== 'string') {
      errors.push('question.projectContext.description 必須是字串');
    }
    if (!Array.isArray(pc.files)) {
      errors.push('question.projectContext.files 必須是陣列');
    } else {
      (pc.files as unknown[]).forEach((file, i) => {
        const f = file as Record<string, unknown>;
        if (typeof f.path !== 'string') {
          errors.push(`projectContext.files[${i}].path 必須是字串`);
        }
        if (typeof f.content !== 'string') {
          errors.push(`projectContext.files[${i}].content 必須是字串`);
        }
      });
    }
  }

  // scoringCriteria
  if (!q.scoringCriteria || typeof q.scoringCriteria !== 'object') {
    errors.push('question.scoringCriteria 必須是物件');
  } else {
    const sc = q.scoringCriteria as Record<string, unknown>;
    for (const { key, label } of SCORING_DIMENSIONS) {
      const dim = sc[key] as Record<string, unknown> | undefined;
      if (!dim || typeof dim !== 'object') {
        errors.push(`scoringCriteria.${key} (${label}) 必須是物件`);
        continue;
      }
      if (typeof dim.weight !== 'number' || dim.weight < 0 || dim.weight > 1) {
        errors.push(
          `scoringCriteria.${key}.weight 必須是 0-1 的數字，目前為: ${String(dim.weight)}`,
        );
      }
      if (!Array.isArray(dim.checks) || dim.checks.length === 0) {
        errors.push(`scoringCriteria.${key}.checks 必須是非空陣列`);
      } else {
        (dim.checks as unknown[]).forEach((check, i) => {
          const c = check as Record<string, unknown>;
          if (typeof c.id !== 'string' || c.id.length === 0) {
            errors.push(`scoringCriteria.${key}.checks[${i}].id 必須是非空字串`);
          }
          if (typeof c.description !== 'string' || c.description.length === 0) {
            errors.push(`scoringCriteria.${key}.checks[${i}].description 必須是非空字串`);
          }
          if (typeof c.passCondition !== 'string' || c.passCondition.length === 0) {
            errors.push(`scoringCriteria.${key}.checks[${i}].passCondition 必須是非空字串`);
          }
        });
      }
    }
  }

  // coveredSteps (optional field)
  if (q.coveredSteps !== undefined) {
    if (!Array.isArray(q.coveredSteps)) {
      errors.push('question.coveredSteps 必須是陣列');
    } else {
      const validSteps = new Set(SPEC_WORKFLOW_STEPS.map(s => s.key));
      (q.coveredSteps as unknown[]).forEach((step, i) => {
        if (typeof step !== 'string' || !validSteps.has(step)) {
          errors.push(`question.coveredSteps[${i}] "${String(step)}" 不是有效的步驟鍵值`);
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
export function loadQuestions(filePath: string): Question[] {
  const resolved = path.resolve(filePath);
  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`無法讀取題目檔案 "${resolved}": ${(err as Error).message}`);
  }

  let questions: unknown[];
  try {
    questions = JSON.parse(raw) as unknown[];
  } catch (err) {
    throw new Error(`題目檔案 JSON 格式無效 "${resolved}": ${(err as Error).message}`);
  }

  if (!Array.isArray(questions)) {
    throw new Error('題目檔案內容必須是 JSON 陣列');
  }

  if (questions.length === 0) {
    throw new Error('題目陣列為空');
  }

  if (questions.length < 100) {
    console.warn(
      `警告: 題目數量為 ${questions.length}，少於預期的 100 道。測試覆蓋率可能不足。`,
    );
  }

  // Validate each question
  const validationErrors: string[] = [];
  const idSet = new Set<string>();

  questions.forEach((q, index) => {
    const { valid, errors } = validateQuestion(q);
    if (!valid) {
      const qid = (q as Record<string, unknown>)?.id ?? '無';
      validationErrors.push(`題目 #${index + 1} (id: ${String(qid)}): ${errors.join('; ')}`);
    }
    // Check duplicate ID
    const qid = (q as Record<string, unknown>)?.id as string | undefined;
    if (qid && idSet.has(qid)) {
      validationErrors.push(`題目 #${index + 1}: id "${qid}" 重複`);
    }
    if (qid) {
      idSet.add(qid);
    }
  });

  if (validationErrors.length > 0) {
    throw new Error(
      `題目驗證失敗 (${validationErrors.length} 個錯誤):\n${validationErrors.join('\n')}`,
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

// --- Self-test (run with: node dist/lib/question-utils.js) ---

function selfTest(): void {
  console.log('=== question-utils 自我測試 ===\n');

  const __filenameST = fileURLToPath(import.meta.url);
  const __dirnameST = path.dirname(__filenameST);
  // In compiled output (packages/tools/eval/dist/lib/), navigate 5 levels up to project root
  const PROJECT_ROOT = path.resolve(__dirnameST, '..', '..', '..', '..', '..');

  // Test 1: loadQuestions with the test file
  const questionsPath = path.resolve(PROJECT_ROOT, 'assets', 'spec', '2026-05-28', 'test-questions.json');
  console.log(`1. 載入題目檔案: ${questionsPath}`);
  let questions: Question[];
  try {
    questions = loadQuestions(questionsPath);
    console.log(`   通過: 成功載入 ${questions.length} 道題目`);
  } catch (err) {
    console.error(`   失敗: ${(err as Error).message}`);
    process.exit(1);
  }

  // Test 2: Verify difficulty distribution
  console.log('\n2. 難度分佈:');
  const diffCount: Record<string, number> = { basic: 0, advanced: 0, edge: 0 };
  questions.forEach(q => { diffCount[q.difficulty]++; });
  console.log(`   basic: ${diffCount.basic}, advanced: ${diffCount.advanced}, edge: ${diffCount.edge}`);
  if (diffCount.basic !== 40 || diffCount.advanced !== 40 || diffCount.edge !== 20) {
    console.error('   失敗: 難度分佈與預期不符 (預期 40/40/20)');
    process.exit(1);
  }
  console.log('   通過: 難度分佈符合預期');

  // Test 3: Verify all IDs are unique
  console.log('\n3. 檢查 ID 唯一性:');
  const ids = questions.map(q => q.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    console.error('   失敗: 存在重複的 ID');
    process.exit(1);
  }
  console.log(`   通過: 所有 ${ids.length} 個 ID 都是唯一的`);

  // Test 4: Test stripScoringCriteria
  console.log('\n4. 測試 stripScoringCriteria:');
  const stripped = stripScoringCriteria(questions[0]);
  if ('scoringCriteria' in stripped || 'difficulty' in stripped) {
    console.error('   失敗: 剝離後的物件仍包含 scoringCriteria 或 difficulty');
    process.exit(1);
  }
  if (!('id' in stripped && 'userPrompt' in stripped && 'projectContext' in stripped)) {
    console.error('   失敗: 剝離後的物件缺少必要欄位');
    process.exit(1);
  }
  console.log('   通過: 評分標準和難度已正確剝離');
  console.log(`   剝離後欄位: ${Object.keys(stripped).join(', ')}`);

  // Test 5: Test getScoringCriteria
  console.log('\n5. 測試 getScoringCriteria:');
  const criteria = getScoringCriteria(questions[0]);
  const requiredDims = ['outcome', 'process', 'style', 'efficiency'] as const;
  const hasAllDims = requiredDims.every(dim => dim in criteria);
  if (!hasAllDims) {
    console.error('   失敗: scoringCriteria 缺少維度');
    process.exit(1);
  }
  for (const dim of requiredDims) {
    const w = criteria[dim].weight;
    if (typeof w !== 'number' || w < 0 || w > 1) {
      console.error(`   失敗: ${dim}.weight 不是有效的 0-1 數字: ${w}`);
      process.exit(1);
    }
    if (!Array.isArray(criteria[dim].checks) || criteria[dim].checks.length === 0) {
      console.error(`   失敗: ${dim}.checks 不是有效的非空陣列`);
      process.exit(1);
    }
  }
  console.log('   通過: scoringCriteria 包含所有四個維度，且格式正確');

  // Test 6: Verify at least 10 edge questions are negative tests
  console.log('\n6. 檢查反向測試題目 (至少 10 道):');
  const negativeTests = questions.filter(q => {
    const processChecks = q.scoringCriteria?.process?.checks || [];
    return processChecks.some(c =>
      (c.description && c.description.includes('沒有調用')) ||
      (c.passCondition && c.passCondition.includes('不啟動 spec'))
    );
  });
  console.log(`   反向測試題目數量: ${negativeTests.length}`);
  if (negativeTests.length < 10) {
    console.error('   失敗: 反向測試題目數量不足 (需要至少 10 道)');
    process.exit(1);
  }
  console.log('   通過: 反向測試題目數量符合要求 (>= 10)');

  // Test 7: Verify schema validation works
  console.log('\n7. 測試 schema 載入:');
  try {
    const schema = loadSchema();
    if (!schema || typeof schema !== 'object') {
      throw new Error('schema 不是有效物件');
    }
    console.log(`   通過: Schema 載入成功 (title: ${String(schema.title ?? 'unknown')})`);
  } catch (err) {
    console.error(`   失敗: ${(err as Error).message}`);
    process.exit(1);
  }

  // Test 8: Verify step coverage (spec workflow 8 steps)
  console.log('\n8. 檢查 spec 工作流程步驟覆蓋率 (每步驟至少 5 題):');
  const stepCounts: Record<string, number> = {};
  SPEC_WORKFLOW_STEPS.forEach(s => { stepCounts[s.key] = 0; });

  for (const q of questions) {
    if (Array.isArray(q.coveredSteps)) {
      for (const step of q.coveredSteps) {
        if (Object.hasOwn(stepCounts, step)) {
          stepCounts[step]++;
        }
      }
    }
  }

  const lowCoverage: string[] = [];
  for (const step of SPEC_WORKFLOW_STEPS) {
    const count = stepCounts[step.key];
    console.log(`   ${step.label}: ${count} 題`);
    if (count < 5) {
      lowCoverage.push(`${step.label} (${count} 題)`);
    }
  }

  if (lowCoverage.length > 0) {
    console.log(`   警告: 以下步驟題目不足 5 道: ${lowCoverage.join(', ')}`);
    console.log('   部分步驟可能缺乏足夠的測試覆蓋率');
  } else {
    console.log('   通過: 所有步驟至少有 5 道題目覆蓋');
  }

  // Test 9: Verify all scoring criteria weights sum close to 1
  console.log('\n9. 檢查評分權重總和:');
  const badWeights = questions.filter(q => {
    const dims = q.scoringCriteria;
    const sum = dims.outcome.weight + dims.process.weight + dims.style.weight + dims.efficiency.weight;
    return Math.abs(sum - 1.0) > 0.01;
  });
  if (badWeights.length > 0) {
    console.log(
      `   警告: ${badWeights.length} 道題目的權重總和不為 1.0: ${badWeights.map(q => q.id).join(', ')}`,
    );
  } else {
    console.log('   通過: 所有題目的權重總和等於 1.0');
  }

  // Summary
  console.log('\n=== 全部測試通過 ===');
  console.log(`題目總數: ${questions.length}`);
  console.log(`難度分佈: basic=${diffCount.basic}, advanced=${diffCount.advanced}, edge=${diffCount.edge}`);
  console.log(`反向測試: ${negativeTests.length} 道`);
}

// Run self-test when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('question-utils.ts') ||
  process.argv[1].endsWith('question-utils.js') ||
  process.argv[1].endsWith('question-utils')
);

if (isDirectRun) {
  selfTest();
}
