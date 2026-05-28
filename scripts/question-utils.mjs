#!/usr/bin/env node

/**
 * question-utils.mjs
 *
 * 題目載入、驗證與剝離工具函數。
 *
 * 用途：
 *   - loadQuestions(filePath): 讀取 JSON 題目檔，驗證格式，回傳題目陣列
 *   - stripScoringCriteria(question): 剝離評分標準，僅回傳 { id, userPrompt, projectContext }
 *   - getScoringCriteria(question): 回傳完整的 scoringCriteria 物件
 *
 * 僅使用 Node.js 內建模組 (fs, path)，無外部依賴。
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Schema loading ---

/**
 * 讀取並解析題目 JSON Schema 檔案。
 * @param {string} [schemaPath] - schema 檔案路徑，預設為 assets/spec/question-schema.json
 * @returns {object} 解析後的 JSON Schema 物件
 */
function loadSchema(schemaPath) {
  const resolved = schemaPath
    ? resolve(schemaPath)
    : resolve(__dirname, '..', 'assets', 'spec', 'question-schema.json');
  return JSON.parse(readFileSync(resolved, 'utf-8'));
}

// --- Validation helpers (based on JSON Schema draft-07) ---

/**
 * 根據 schema 驗證單一題目物件。
 * 這是一個輕量級的手動驗證器，不依賴 ajv 等外部套件。
 *
 * 驗證項目：
 *  - 頂層必要欄位：id, userPrompt, projectContext, scoringCriteria, difficulty
 *  - difficulty 必須為 basic / advanced / edge
 *  - projectContext 必須包含 description (string) 和 files (array)
 *  - scoringCriteria 必須包含 outcome, process, style, efficiency
 *  - 每個維度必須包含 weight (0-1 number) 和 checks (array)
 *  - 每個 check 必須包含 id, description, passCondition（皆為 string）
 *
 * @param {object} question - 單一題目物件
 * @returns {{ valid: boolean, errors: string[] }} 驗證結果
 */
function validateQuestion(question) {
  const errors = [];

  // 頂層必要欄位
  if (typeof question.id !== 'string' || question.id.length === 0) {
    errors.push(`question.id 必須是非空字串，目前為: ${JSON.stringify(question.id)}`);
  }
  if (typeof question.userPrompt !== 'string' || question.userPrompt.length === 0) {
    errors.push(`question.userPrompt 必須是非空字串，目前為: ${JSON.stringify(question.userPrompt)}`);
  }

  // difficulty 枚舉
  const validDifficulties = ['basic', 'advanced', 'edge'];
  if (!validDifficulties.includes(question.difficulty)) {
    errors.push(`question.difficulty 必須為 basic/advanced/edge，目前為: "${question.difficulty}"`);
  }

  // projectContext
  if (!question.projectContext || typeof question.projectContext !== 'object') {
    errors.push('question.projectContext 必須是物件');
  } else {
    if (typeof question.projectContext.description !== 'string') {
      errors.push('question.projectContext.description 必須是字串');
    }
    if (!Array.isArray(question.projectContext.files)) {
      errors.push('question.projectContext.files 必須是陣列');
    } else {
      question.projectContext.files.forEach((file, i) => {
        if (typeof file.path !== 'string') {
          errors.push(`projectContext.files[${i}].path 必須是字串`);
        }
        if (typeof file.content !== 'string') {
          errors.push(`projectContext.files[${i}].content 必須是字串`);
        }
      });
    }
  }

  // scoringCriteria
  const dimensionsConfig = [
    { key: 'outcome', label: '任務完成' },
    { key: 'process', label: '流程遵循' },
    { key: 'style', label: '輸出格式' },
    { key: 'efficiency', label: '效率' },
  ];

  if (!question.scoringCriteria || typeof question.scoringCriteria !== 'object') {
    errors.push('question.scoringCriteria 必須是物件');
  } else {
    dimensionsConfig.forEach(({ key, label }) => {
      const dim = question.scoringCriteria[key];
      if (!dim || typeof dim !== 'object') {
        errors.push(`scoringCriteria.${key} (${label}) 必須是物件`);
        return;
      }
      if (typeof dim.weight !== 'number' || dim.weight < 0 || dim.weight > 1) {
        errors.push(`scoringCriteria.${key}.weight 必須是 0-1 的數字，目前為: ${dim.weight}`);
      }
      if (!Array.isArray(dim.checks) || dim.checks.length === 0) {
        errors.push(`scoringCriteria.${key}.checks 必須是非空陣列`);
      } else {
        dim.checks.forEach((check, i) => {
          if (typeof check.id !== 'string' || check.id.length === 0) {
            errors.push(`scoringCriteria.${key}.checks[${i}].id 必須是非空字串`);
          }
          if (typeof check.description !== 'string' || check.description.length === 0) {
            errors.push(`scoringCriteria.${key}.checks[${i}].description 必須是非空字串`);
          }
          if (typeof check.passCondition !== 'string' || check.passCondition.length === 0) {
            errors.push(`scoringCriteria.${key}.checks[${i}].passCondition 必須是非空字串`);
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// --- Public API ---

/**
 * 載入題目檔案，讀取 JSON 並驗證每道題目。
 *
 * @param {string} filePath - 題目 JSON 檔案的路徑
 * @returns {object[]} 驗證通過的題目陣列
 * @throws {Error} 若 JSON 格式無效、題目陣列為空、或有題目驗證失敗
 */
export function loadQuestions(filePath) {
  const resolved = resolve(filePath);
  let raw;
  try {
    raw = readFileSync(resolved, 'utf-8');
  } catch (err) {
    throw new Error(`無法讀取題目檔案 "${resolved}": ${err.message}`);
  }

  let questions;
  try {
    questions = JSON.parse(raw);
  } catch (err) {
    throw new Error(`題目檔案 JSON 格式無效 "${resolved}": ${err.message}`);
  }

  if (!Array.isArray(questions)) {
    throw new Error('題目檔案內容必須是 JSON 陣列');
  }

  if (questions.length === 0) {
    throw new Error('題目陣列為空');
  }

  // 驗證每道題目
  const validationErrors = [];
  const idSet = new Set();

  questions.forEach((q, index) => {
    const { valid, errors } = validateQuestion(q);
    if (!valid) {
      validationErrors.push(`題目 #${index + 1} (id: ${q.id || '無'}): ${errors.join('; ')}`);
    }
    // 檢查重複 ID
    if (q.id && idSet.has(q.id)) {
      validationErrors.push(`題目 #${index + 1}: id "${q.id}" 重複`);
    }
    if (q.id) {
      idSet.add(q.id);
    }
  });

  if (validationErrors.length > 0) {
    throw new Error(`題目驗證失敗 (${validationErrors.length} 個錯誤):\n${validationErrors.join('\n')}`);
  }

  return questions;
}

/**
 * 剝離評分標準，僅回傳不包含 scoringCriteria 和 difficulty 的題目物件。
 * 此函數確保被測 agent 無法看到評分標準。
 *
 * @param {object} question - 完整題目物件
 * @returns {{ id: string, userPrompt: string, projectContext: object }} 剝離後的題目
 */
export function stripScoringCriteria(question) {
  return {
    id: question.id,
    userPrompt: question.userPrompt,
    projectContext: question.projectContext,
  };
}

/**
 * 從完整題目中回傳評分標準物件，供評分器使用。
 *
 * @param {object} question - 完整題目物件
 * @returns {object} scoringCriteria 物件，包含 outcome/process/style/efficiency 四個維度
 */
export function getScoringCriteria(question) {
  return question.scoringCriteria;
}

// --- Self-test (run with: node scripts/question-utils.mjs) ---

function selfTest() {
  console.log('=== question-utils.mjs 自我測試 ===\n');

  // Test 1: loadQuestions with the test file
  const questionsPath = resolve(__dirname, '..', 'assets', 'spec', '2026-05-28', 'test-questions.json');
  console.log(`1. 載入題目檔案: ${questionsPath}`);
  let questions;
  try {
    questions = loadQuestions(questionsPath);
    console.log(`   通過: 成功載入 ${questions.length} 道題目`);
  } catch (err) {
    console.error(`   失敗: ${err.message}`);
    process.exit(1);
  }

  // Test 2: Verify difficulty distribution
  console.log(`\n2. 難度分佈:`);
  const diffCount = { basic: 0, advanced: 0, edge: 0 };
  questions.forEach((q) => { diffCount[q.difficulty]++; });
  console.log(`   basic: ${diffCount.basic}, advanced: ${diffCount.advanced}, edge: ${diffCount.edge}`);
  if (diffCount.basic !== 40 || diffCount.advanced !== 40 || diffCount.edge !== 20) {
    console.error(`   失敗: 難度分佈與預期不符 (預期 40/40/20)`);
    process.exit(1);
  }
  console.log('   通過: 難度分佈符合預期');

  // Test 3: Verify all IDs are unique
  console.log(`\n3. 檢查 ID 唯一性:`);
  const ids = questions.map((q) => q.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    console.error(`   失敗: 存在重複的 ID`);
    process.exit(1);
  }
  console.log(`   通過: 所有 ${ids.length} 個 ID 都是唯一的`);

  // Test 4: Test stripScoringCriteria
  console.log(`\n4. 測試 stripScoringCriteria:`);
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
  console.log(`\n5. 測試 getScoringCriteria:`);
  const criteria = getScoringCriteria(questions[0]);
  const requiredDims = ['outcome', 'process', 'style', 'efficiency'];
  const hasAllDims = requiredDims.every((dim) => dim in criteria);
  if (!hasAllDims) {
    console.error('   失敗: scoringCriteria 缺少維度');
    process.exit(1);
  }
  requiredDims.forEach((dim) => {
    const w = criteria[dim].weight;
    if (typeof w !== 'number' || w < 0 || w > 1) {
      console.error(`   失敗: ${dim}.weight 不是有效的 0-1 數字: ${w}`);
      process.exit(1);
    }
    if (!Array.isArray(criteria[dim].checks) || criteria[dim].checks.length === 0) {
      console.error(`   失敗: ${dim}.checks 不是有效的非空陣列`);
      process.exit(1);
    }
  });
  console.log('   通過: scoringCriteria 包含所有四個維度，且格式正確');

  // Test 6: Verify at least 10 edge questions are negative tests (反向測試)
  console.log(`\n6. 檢查反向測試題目 (至少 10 道):`);
  const negativeTests = questions.filter((q) => {
    const processChecks = q.scoringCriteria?.process?.checks || [];
    return processChecks.some((c) =>
      c.description && c.description.includes('沒有調用') ||
      c.passCondition && c.passCondition.includes('不啟動 spec')
    );
  });
  console.log(`   反向測試題目數量: ${negativeTests.length}`);
  if (negativeTests.length < 10) {
    console.error(`   失敗: 反向測試題目數量不足 (需要至少 10 道)`);
    process.exit(1);
  }
  console.log(`   通過: 反向測試題目數量符合要求 (>= 10)`);

  // Test 7: Verify schema validation works (without external deps)
  console.log(`\n7. 測試 schema 載入:`);
  try {
    const schema = loadSchema();
    if (!schema || typeof schema !== 'object') {
      throw new Error('schema 不是有效物件');
    }
    console.log(`   通過: Schema 載入成功 (title: ${schema.title})`);
  } catch (err) {
    console.error(`   失敗: ${err.message}`);
    process.exit(1);
  }

  // Test 8: Verify all scoring criteria weights sum close to 1
  console.log(`\n8. 檢查評分權重總和:`);
  const badWeights = questions.filter((q) => {
    const dims = q.scoringCriteria;
    const sum = dims.outcome.weight + dims.process.weight + dims.style.weight + dims.efficiency.weight;
    return Math.abs(sum - 1.0) > 0.01; // tolerance for floating point
  });
  if (badWeights.length > 0) {
    console.log(`   警告: ${badWeights.length} 道題目的權重總和不為 1.0: ${badWeights.map((q) => q.id).join(', ')}`);
  } else {
    console.log('   通過: 所有題目的權重總和等於 1.0');
  }

  // Summary
  console.log(`\n=== 全部測試通過 ===`);
  console.log(`題目總數: ${questions.length}`);
  console.log(`難度分佈: basic=${diffCount.basic}, advanced=${diffCount.advanced}, edge=${diffCount.edge}`);
  console.log(`反向測試: ${negativeTests.length} 道`);
}

// Run self-test when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('question-utils.mjs') ||
  process.argv[1].endsWith('question-utils')
);

if (isDirectRun) {
  selfTest();
}
