/**
 * project-root.ts — 專案根目錄解析共用模組
 *
 * 提供 getProjectRoot() 函式，供 eval pipeline 中所有模組使用。
 * 從檔案系統路徑推斷專案根目錄，以 assets/spec/ 目錄存在作為驗證。
 *
 * 僅使用 Node.js 內建模組，無外部依賴。
 */

import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 取得專案根目錄的絕對路徑。
 *
 * 從原始碼路徑 (lib/project-root.ts) 往上 4 層：
 *   lib/ -> eval/ -> tools/ -> packages/ -> 專案根目錄
 *
 * 從編譯後路徑 (dist/lib/project-root.js) 往上 5 層：
 *   lib/ -> dist/ -> eval/ -> tools/ -> packages/ -> 專案根目錄
 *
 * 以 assets/spec/ 目錄是否存在作為驗證。
 * 無法確定時會從 process.cwd() 向上遞迴搜尋（最多 10 層）。
 *
 * @returns 專案根目錄的絕對路徑
 * @throws Error 找不到 assets/spec/ 目錄時
 */
export function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // 原始碼路徑 (lib/project-root.ts -> 4 層)
  const sourceCandidate = resolve(__dirname, '..', '..', '..', '..');
  if (existsSync(join(sourceCandidate, 'assets', 'spec'))) {
    return sourceCandidate;
  }

  // 編譯後路徑 (dist/lib/project-root.js -> 5 層)
  const distCandidate = resolve(__dirname, '..', '..', '..', '..', '..');
  if (existsSync(join(distCandidate, 'assets', 'spec'))) {
    return distCandidate;
  }

  // Fallback: 從 process.cwd() 往上找（最多 10 層）
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'assets', 'spec'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('無法確定專案根目錄：找不到 assets/spec/ 目錄');
}
