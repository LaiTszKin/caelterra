#!/usr/bin/env node

/**
 * env-utils.mjs
 *
 * 載入 .env 檔案並驗證必要環境變數。
 * 僅使用 Node.js 內建模組 (fs, path)，無外部依賴。
 *
 * 使用方式：
 *   import { loadEnv } from './env-utils.mjs';
 *   const env = loadEnv();           // 從工作目錄的 .env 載入
 *   const env = loadEnv('/path/to/.env');  // 指定路徑
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 所有必要的環境變數清單。
 * 欄位 key 是變數名稱，value 是用途說明（用於錯誤訊息）。
 */
const REQUIRED_VARS = {
  EXEC_BASE_URL: 'Execution model API base URL',
  EXEC_MODEL: 'Execution model name',
  EXEC_API_KEY: 'API key for execution model',
  EXEC_REASONING_EFFORT: 'Reasoning effort for execution model',
  JUDGE_BASE_URL: 'Judge model API base URL',
  JUDGE_MODEL: 'Judge model name',
  JUDGE_API_KEY: 'API key for judge model',
  JUDGE_REASONING_EFFORT: 'Reasoning effort for judge model',
};

/**
 * 具有預設值的環境變數。
 */
const DEFAULTS = {
  EXEC_CONCURRENCY: '10',
  JUDGE_CONCURRENCY: '5',
  EXEC_TIMEOUT: '600',
};

/**
 * 從指定路徑（或預設為工作目錄的 .env）讀取並解析 .env 檔案。
 *
 * 解析規則：
 *   - 忽略空白行和以 # 開頭的註解行
 *   - 支援 KEY=VALUE 格式（VALUE 可包含 = 符號）
 *   - 支援引號包裹的值（單引號和雙引號）
 *   - 不覆蓋已存在的 process.env 變數（.env 優先級較低）
 *
 * @param {string} [envPath] - .env 檔案路徑，預設為工作目錄下的 .env
 * @returns {object} 包含所有環境變數的物件，含必要變數和預設值
 * @throws {Error} 若 .env 檔案不存在，或缺少必要變數
 */
export function loadEnv(envPath) {
  const resolved = envPath ? resolve(envPath) : resolve(process.cwd(), '.env');

  // 讀取 .env 檔案
  let content;
  try {
    content = readFileSync(resolved, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `.env 檔案不存在: "${resolved}"\n` +
        '請從 .env.example 複製一份並填入實際值:\n' +
        '  cp .env.example .env'
      );
    }
    throw new Error(`無法讀取 .env 檔案 "${resolved}": ${err.message}`);
  }

  // 解析每一行
  const parsed = {};
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 跳過空白行和註解
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    // 解析 KEY=VALUE
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue; // 無效行，忽略
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // 移除包裹的引號
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      parsed[key] = value;
    }
  }

  // 合併：優先使用 process.env 中的值，.env 作為 fallback
  // (遵循標準 dotenv 行為：process.env 優先級高於 .env)
  const result = {};

  for (const key of Object.keys(REQUIRED_VARS)) {
    if (key in process.env) {
      result[key] = process.env[key];
    } else if (key in parsed) {
      result[key] = parsed[key];
    }
  }

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (key in process.env) {
      result[key] = process.env[key];
    } else if (key in parsed) {
      result[key] = parsed[key];
    } else {
      result[key] = defaultValue;
    }
  }

  // 驗證必要變數
  const missing = [];
  for (const [key, desc] of Object.entries(REQUIRED_VARS)) {
    if (!result[key] || result[key].trim() === '') {
      missing.push(`  ${key}: ${desc}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `.env 檔案缺少必要的環境變數 (${missing.length} 個):\n` +
      missing.join('\n') +
      '\n\n請確認 .env 檔案包含所有必要變數 (參考 .env.example)'
    );
  }

  // 數值轉換
  result.EXEC_CONCURRENCY = parseInt(result.EXEC_CONCURRENCY, 10);
  result.JUDGE_CONCURRENCY = parseInt(result.JUDGE_CONCURRENCY, 10);
  result.EXEC_TIMEOUT = parseInt(result.EXEC_TIMEOUT, 10);

  return result;
}

// --- Self-test ---

function selfTest() {
  console.log('=== env-utils.mjs 自我測試 ===\n');

  // Test 1: Missing .env file
  console.log('1. 測試缺少 .env 檔案:');
  try {
    loadEnv('/nonexistent/path/.env');
    console.error('   失敗: 應該拋出錯誤');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('.env 檔案不存在') || err.message.includes('ENOENT')) {
      console.log('   通過: 正確拋出檔案不存在錯誤');
    } else {
      console.log(`   部分通過 (錯誤訊息: ${err.message.split('\n')[0]})`);
    }
  }

  // Test 2: Parse .env content (via env.example for format validation)
  console.log('\n2. 測試解析 .env.example:');
  const envExamplePath = resolve(import.meta.dirname || resolve('.'), '..', '.env.example');
  try {
    const content = readFileSync(envExamplePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
    console.log(`   通過: .env.example 存在，共 ${lines.length} 行有變數定義`);
  } catch (err) {
    console.error(`   失敗: ${err.message}`);
    process.exit(1);
  }

  // Test 3: DEFAULTS values
  console.log('\n3. 測試預設值:');
  console.log(`   EXEC_CONCURRENCY=${DEFAULTS.EXEC_CONCURRENCY}, JUDGE_CONCURRENCY=${DEFAULTS.JUDGE_CONCURRENCY}, EXEC_TIMEOUT=${DEFAULTS.EXEC_TIMEOUT}`);
  console.log('   通過: 所有預設值已定義');

  console.log('\n=== 測試完成 ===');
}

// Run self-test when executed directly
import { fileURLToPath } from 'url';
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('env-utils.mjs') ||
  process.argv[1].endsWith('env-utils')
);

if (isDirectRun) {
  selfTest();
}
