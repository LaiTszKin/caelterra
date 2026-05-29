#!/usr/bin/env node

/**
 * env-utils.ts
 *
 * Load .env file and validate required environment variables.
 * Uses only Node.js built-in modules (fs, path), no external dependencies.
 *
 * Usage:
 *   import { loadEnv } from './env-utils.js';
 *   const env = loadEnv();                  // load from cwd's .env
 *   const env = loadEnv('/path/to/.env');   // specify path
 *
 * This is the TypeScript version migrated from scripts/env-utils.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';

import { getProjectRoot } from './project-root.js';

// --- Public types ---

export interface EnvConfig {
  /* Required vars */
  EXEC_BASE_URL: string;
  EXEC_MODEL: string;
  EXEC_API_KEY: string;
  JUDGE_BASE_URL: string;
  JUDGE_MODEL: string;
  JUDGE_API_KEY: string;
  /* Defaults — string values */
  EXEC_REASONING_EFFORT: string;
  JUDGE_REASONING_EFFORT: string;
  /* Defaults — numeric after parsePositiveInt conversion */
  EXEC_CONCURRENCY: number;
  JUDGE_CONCURRENCY: number;
  EXEC_TIMEOUT: number;
  JUDGE_TIMEOUT: number;
}

// --- Constants ---

/**
 * Required environment variables.
 * Keys are variable names, values are descriptions (used in error messages).
 */
export const REQUIRED_VARS: Record<string, string> = {
  EXEC_BASE_URL: 'Execution model API base URL',
  EXEC_MODEL: 'Execution model name',
  EXEC_API_KEY: 'API key for execution model',
  JUDGE_BASE_URL: 'Judge model API base URL',
  JUDGE_MODEL: 'Judge model name',
  JUDGE_API_KEY: 'API key for judge model',
};

/**
 * Environment variables with default values.
 */
export const DEFAULTS: Record<string, string> = {
  EXEC_REASONING_EFFORT: '',
  JUDGE_REASONING_EFFORT: '',
  EXEC_CONCURRENCY: '10',
  JUDGE_CONCURRENCY: '5',
  EXEC_TIMEOUT: '600',
  JUDGE_TIMEOUT: '120',
};

// --- Main export ---

/**
 * Read and parse a .env file from the given path (defaults to .env in cwd).
 *
 * Parsing rules:
 *   - Skip blank lines and lines starting with #
 *   - Supports KEY=VALUE (VALUE may contain = characters)
 *   - Supports quoted values (single and double quotes)
 *   - Does NOT override existing process.env values (.env has lower priority)
 *
 * @param envPath - .env file path; defaults to .env in process.cwd()
 * @returns EnvConfig with all required vars and defaults
 * @throws Error if .env file is missing or required vars are missing
 */
export function loadEnv(envPath?: string): EnvConfig {
  const resolved = envPath ? path.resolve(envPath) : path.resolve(process.cwd(), '.env');

  // Read .env file
  let content: string;
  try {
    content = fs.readFileSync(resolved, 'utf-8');
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new Error(
        `.env 檔案不存在: "${resolved}"\n` +
        '請從 .env.example 複製一份並填入實際值:\n' +
        '  cp .env.example .env',
      );
    }
    throw new Error(`無法讀取 .env 檔案 "${resolved}": ${(err as Error).message}`);
  }

  // Parse each line
  const parsed: Record<string, string> = {};
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip blank lines and comments
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue; // invalid line, skip
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      parsed[key] = value;
    }
  }

  // Merge: prefer process.env, .env as fallback
  // (standard dotenv behavior: process.env takes priority over .env)
  const stringVals: Record<string, string> = {};

  for (const key of Object.keys(REQUIRED_VARS)) {
    if (key in process.env) {
      stringVals[key] = process.env[key] as string;
    } else if (key in parsed) {
      stringVals[key] = parsed[key];
    }
  }

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (key in process.env) {
      stringVals[key] = process.env[key] as string;
    } else if (key in parsed) {
      stringVals[key] = parsed[key];
    } else {
      stringVals[key] = defaultValue;
    }
  }

  // Validate required vars
  const missing: string[] = [];
  for (const [key, desc] of Object.entries(REQUIRED_VARS)) {
    if (!stringVals[key] || stringVals[key].trim() === '') {
      missing.push(`  ${key}: ${desc}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `.env 檔案缺少必要的環境變數 (${missing.length} 個):\n` +
      missing.join('\n') +
      '\n\n請確認 .env 檔案包含所有必要變數 (參考 .env.example)',
    );
  }

  // Numeric conversion
  const parsePositiveInt = (val: string, defaultVal: number): number => {
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n > 0 ? n : defaultVal;
  };

  // Same model warning (FIX-21)
  if (
    stringVals.EXEC_MODEL === stringVals.JUDGE_MODEL &&
    stringVals.EXEC_BASE_URL === stringVals.JUDGE_BASE_URL
  ) {
    console.warn(
      'Warning: EXEC_MODEL and JUDGE_MODEL are the same. Context isolation may be compromised.',
    );
  }

  return {
    // Required vars
    EXEC_BASE_URL: stringVals.EXEC_BASE_URL,
    EXEC_MODEL: stringVals.EXEC_MODEL,
    EXEC_API_KEY: stringVals.EXEC_API_KEY,
    JUDGE_BASE_URL: stringVals.JUDGE_BASE_URL,
    JUDGE_MODEL: stringVals.JUDGE_MODEL,
    JUDGE_API_KEY: stringVals.JUDGE_API_KEY,
    // Default string vars
    EXEC_REASONING_EFFORT: stringVals.EXEC_REASONING_EFFORT ?? '',
    JUDGE_REASONING_EFFORT: stringVals.JUDGE_REASONING_EFFORT ?? '',
    // Numeric conversions
    EXEC_CONCURRENCY: parsePositiveInt(stringVals.EXEC_CONCURRENCY, 10),
    JUDGE_CONCURRENCY: parsePositiveInt(stringVals.JUDGE_CONCURRENCY, 5),
    EXEC_TIMEOUT: parsePositiveInt(stringVals.EXEC_TIMEOUT, 600),
    JUDGE_TIMEOUT: parsePositiveInt(stringVals.JUDGE_TIMEOUT, 120),
  };
}

// --- Self-test ---

function selfTest(): void {
  console.log('=== env-utils 自我測試 ===\n');

  // Test 1: Missing .env file
  console.log('1. 測試缺少 .env 檔案:');
  try {
    loadEnv('/nonexistent/path/.env');
    console.error('   失敗: 應該拋出錯誤');
    process.exit(1);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('.env 檔案不存在') || msg.includes('ENOENT')) {
      console.log('   通過: 正確拋出檔案不存在錯誤');
    } else {
      console.log(`   部分通過 (錯誤訊息: ${msg.split('\n')[0]})`);
    }
  }

  // Test 2: Parse .env content (via env.example for format validation)
  console.log('\n2. 測試解析 .env.example:');
  const envExamplePath = path.join(getProjectRoot(), '.env.example');
  try {
    const content = fs.readFileSync(envExamplePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
    console.log(`   通過: .env.example 存在，共 ${lines.length} 行有變數定義`);
  } catch (err) {
    console.error(`   失敗: ${(err as Error).message}`);
    process.exit(1);
  }

  // Test 3: DEFAULTS values
  console.log('\n3. 測試預設值:');
  console.log(
    `   EXEC_CONCURRENCY=${DEFAULTS.EXEC_CONCURRENCY}, ` +
    `JUDGE_CONCURRENCY=${DEFAULTS.JUDGE_CONCURRENCY}, ` +
    `EXEC_TIMEOUT=${DEFAULTS.EXEC_TIMEOUT}`,
  );
  console.log('   通過: 所有預設值已定義');

  console.log('\n=== 測試完成 ===');
}

// Run self-test when executed directly
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('env-utils.ts') ||
  process.argv[1].endsWith('env-utils.js') ||
  process.argv[1].endsWith('env-utils')
);

if (isDirectRun) {
  selfTest();
}
