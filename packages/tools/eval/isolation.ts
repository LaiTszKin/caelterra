/**
 * isolation.ts — 評測隔離模組
 *
 * 提供工具調用攔截與隔離功能：
 * 1. 讀取工具（Read, Grep, Glob）在 workspace 內真實執行
 * 2. 無法在隔離環境真實執行的工具（LSP, WebSearch, WebFetch）維持模擬
 * 3. 寫入工具（Write, Edit, Bash 等）記錄調用意圖後模擬回傳
 *
 * 僅使用 Node.js 內建模組，無外部依賴。
 */

import { access, stat, readFile, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// --- Public Types ---

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
}

interface MockToolResult {
  success: boolean;
  data: string;
  tool: string;
}

interface ToolDispatcher {
  /**
   * 分發工具調用請求。
   *
   * - 若 tool 為 Read/Grep/Glob 且 workspaceDir 存在 → 在 workspace 內真實執行
   * - 若 tool 為 LSP/WebSearch/WebFetch → 回傳模擬結果
   * - 若 tool 在 WRITE_TOOLS 中 → 記錄調用意圖後模擬回傳
   * - 未知工具 → 記錄 warning 並回傳 pass-through 結果
   *
   * @param toolCall - 工具調用請求
   * @returns 工具執行結果
   */
  dispatch(toolCall: ToolCall): Promise<MockToolResult>;
}

// --- Tool Dispatch Implementation ---

/**
 * 需要在 workspace 內真實執行的工具集合。
 * 當 workspaceDir 存在時，這些工具會實際讀取工作目錄中的檔案。
 */
const WORKSPACE_TOOLS: ReadonlySet<string> = new Set(['Read', 'Grep', 'Glob']);

/**
 * 維持模擬回傳的工具集合。
 * 這些工具無法在隔離環境中真實執行，回傳模擬結果。
 */
const SIMULATED_TOOLS: ReadonlySet<string> = new Set([
  'LSP',
  'WebSearch',
  'WebFetch',
]);

/**
 * 被視為寫入操作的工具集合。
 * 這些工具被攔截後記錄調用意圖，再回傳模擬成功結果。
 */
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'Write',
  'Edit',
  'NotebookEdit',
  // 'Bash' — 已移除：Bash 需要支援唯讀命令的真實執行
]);

/**
 * 建立模擬讀取回應字串，從 params.path 或 params.file_path 動態生成。
 */
function buildReadResponse(params: Record<string, unknown>): string {
  const path =
    typeof params['path'] === 'string'
      ? params['path']
      : typeof params['file_path'] === 'string'
        ? params['file_path']
        : '(unknown)';
  return `Content of ${path}`;
}

/**
 * 建立模擬寫入回應字串，從 params 動態生成內容大小資訊。
 */
function buildWriteResponse(params: Record<string, unknown>): string {
  const path =
    typeof params['path'] === 'string'
      ? params['path']
      : typeof params['file_path'] === 'string'
        ? params['file_path']
        : '(unknown)';
  const content = params['content'] ?? '';
  const length = typeof content === 'string' ? content.length : 0;
  return `Written ${path} (${String(length)} bytes)`;
}

const UNKNOWN_RESPONSE = 'Passthrough: not intercepted';

/**
 * 在 workspace 內真實執行 Read 工具。
 *
 * 讀取 workspaceDir 內指定路徑的檔案內容。
 * 支援 params.path 或 params.file_path 兩種參數格式。
 * 包含路徑穿越防護，確保只能在 workspaceDir 內讀取檔案。
 *
 * @param workspaceDir - 隔離工作目錄絕對路徑
 * @param params - 工具參數（path 或 file_path）
 * @returns 檔案內容或錯誤訊息
 */
async function executeRead(
  workspaceDir: string,
  params: Record<string, unknown>,
): Promise<MockToolResult> {
  const filePath =
    typeof params['path'] === 'string'
      ? params['path']
      : typeof params['file_path'] === 'string'
        ? params['file_path']
        : '';

  if (!filePath) {
    return {
      success: false,
      data: 'Error: No path or file_path provided for Read',
      tool: 'Read',
    };
  }

  const fullPath = resolve(workspaceDir, filePath);
  const normalizedWorkspace = resolve(workspaceDir);

  // 路徑穿越防護：確保解析後的路徑仍在 workspaceDir 內
  const rel = relative(normalizedWorkspace, fullPath);
  if (rel.startsWith('..')) {
    return {
      success: false,
      data: `Error: Path "${filePath}" escapes workspace directory`,
      tool: 'Read',
    };
  }

  const fileExists = await access(fullPath)
    .then(() => true)
    .catch(() => false);
  if (!fileExists) {
    return {
      success: false,
      data: `Error: File not found: ${filePath}`,
      tool: 'Read',
    };
  }

  const fileStat = await stat(fullPath);
  if (!fileStat.isFile()) {
    return {
      success: false,
      data: `Error: Not a file: ${filePath}`,
      tool: 'Read',
    };
  }

  try {
    const content = await readFile(fullPath, 'utf-8');
    return { success: true, data: content, tool: 'Read' };
  } catch (err) {
    return {
      success: false,
      data: `Error reading file ${filePath}: ${(err as Error).message}`,
      tool: 'Read',
    };
  }
}

/**
 * 共享遞迴目錄遍歷器。
 *
 * 遍歷指定目錄，對每個檔案調用 onFile 回呼。
 * 自動跳過 .git 與 node_modules 目錄。
 *
 * @param dir - 起始目錄
 * @param workspaceDir - workspace 根目錄（用於計算相對路徑）
 * @param onFile - 每個檔案的處理回呼
 * @returns 因權限等原因跳過的目錄數
 */
async function walkDir(
  dir: string,
  workspaceDir: string,
  onFile: (fullPath: string, relPath: string, entry: Dirent) => Promise<void>,
): Promise<number> {
  let skippedCount = 0;

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 1; // 無法讀取的目錄（權限問題等），計為 1 個跳過
  }

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      skippedCount += await walkDir(fullPath, workspaceDir, onFile);
    } else if (entry.isFile()) {
      const relPath = relative(workspaceDir, fullPath);
      await onFile(fullPath, relPath, entry);
    }
  }

  return skippedCount;
}

/**
 * 在 workspace 內真實執行 Grep 工具。
 *
 * 遞迴掃描 workspaceDir 內所有文字檔案，匹配指定 pattern。
 * 自動跳過 .git 與 node_modules 目錄。
 *
 * @param workspaceDir - 隔離工作目錄絕對路徑
 * @param params - 工具參數（pattern）
 * @returns 符合條件的行（filepath:line_number:content 格式）
 */
async function executeGrep(
  workspaceDir: string,
  params: Record<string, unknown>,
): Promise<MockToolResult> {
  const pattern =
    typeof params['pattern'] === 'string' ? params['pattern'] : '';

  if (!pattern) {
    return {
      success: false,
      data: 'Error: No pattern provided for Grep',
      tool: 'Grep',
    };
  }

  const results: string[] = [];

  const skippedCount = await walkDir(
    workspaceDir,
    workspaceDir,
    async (fullPath, relPath) => {
      try {
        // 檔案大小檢查：超過 1MB 跳過 (避免將大型檔案載入記憶體)
        const fileStat = await stat(fullPath);
        if (fileStat.size > 1024 * 1024) {
          results.push(
            `[isolation] Skipped large file: ${relPath} (${(fileStat.size / 1024 / 1024).toFixed(1)}MB)`,
          );
          return;
        }
        const content = await readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? '';
          if (line.includes(pattern)) {
            results.push(`${relPath}:${String(i + 1)}:${line}`);
          }
        }
      } catch {
        // 二進位檔或無法以文字讀取的檔案，跳過
      }
    },
  );

  if (skippedCount > 0) {
    results.push(
      `[isolation] Warning: ${String(skippedCount)} path(s) could not be read`,
    );
  }

  if (results.length === 0) {
    return {
      success: true,
      data: `Grep: no matches found for "${pattern}"`,
      tool: 'Grep',
    };
  }

  return { success: true, data: results.join('\n'), tool: 'Grep' };
}

/**
 * 在 workspace 內真實執行 Glob 工具。
 *
 * 遞迴掃描 workspaceDir，找出所有路徑符合 glob pattern 的檔案。
 * 支援 *（單層萬用字元）、**（跨層萬用字元）、?（單字元）模式。
 *
 * @param workspaceDir - 隔離工作目錄絕對路徑
 * @param params - 工具參數（pattern）
 * @returns 符合條件的檔案路徑清單（每行一個）
 */
async function executeGlob(
  workspaceDir: string,
  params: Record<string, unknown>,
): Promise<MockToolResult> {
  const pattern =
    typeof params['pattern'] === 'string' ? params['pattern'] : '';

  if (!pattern) {
    return {
      success: false,
      data: 'Error: No pattern provided for Glob',
      tool: 'Glob',
    };
  }

  // 將簡易 glob pattern 轉換為 RegExp
  const regexSource = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*')
    .replace(/\?/g, '.');

  let regex: RegExp;
  try {
    regex = new RegExp(`^${regexSource}$`);
  } catch {
    return {
      success: false,
      data: `Error: Invalid glob pattern "${pattern}"`,
      tool: 'Glob',
    };
  }

  const matches: string[] = [];

  const skippedCount = await walkDir(
    workspaceDir,
    workspaceDir,
    (_fullPath, relPath, entry) => {
      if (entry.isFile() && regex.test(relPath)) {
        matches.push(relPath);
      }
      return Promise.resolve();
    },
  );

  if (skippedCount > 0) {
    matches.push(
      `[isolation] Warning: ${String(skippedCount)} path(s) could not be read`,
    );
  }

  if (matches.length === 0) {
    return {
      success: true,
      data: `Glob: no files matching "${pattern}"`,
      tool: 'Glob',
    };
  }

  return { success: true, data: matches.join('\n'), tool: 'Glob' };
}

/**
 * 引號感知的命令列解析。
 *
 * 將命令字串拆分為基底命令與引數陣列，
 * 正確處理單引號和雙引號內的空白字元。
 */
function parseCommandArgs(command: string): {
  baseCmd: string;
  args: string[];
} {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? '';

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
    } else if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === "'") {
        inSingle = true;
      } else if (ch === '"') {
        inDouble = true;
      } else if (ch === ' ' || ch === '\t') {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return {
    baseCmd: tokens.length > 0 ? (tokens[0] ?? '') : '',
    args: tokens.slice(1),
  };
}

const SAFE_BASH_COMMANDS = new Set([
  'ls',
  'cat',
  'pwd',
  'echo',
  'head',
  'tail',
  'wc',
  'find',
  'grep',
  'sort',
  'uniq',
  'which',
  'date',
  'printf',
  'tree',
]);

const FIND_DANGEROUS_FLAGS = new Set(['-exec', '-execdir', '-delete']);

async function executeBash(
  workspaceDir: string,
  params: Record<string, unknown>,
): Promise<MockToolResult> {
  const command =
    typeof params['command'] === 'string' ? params['command'].trim() : '';
  if (!command) {
    return {
      success: false,
      data: 'Error: No command provided for Bash',
      tool: 'Bash',
    };
  }

  const { baseCmd, args } = parseCommandArgs(command);

  if (!SAFE_BASH_COMMANDS.has(baseCmd)) {
    console.warn(`[isolation] Unsafe Bash command intercepted: ${baseCmd}`);
    return {
      success: true,
      data: `${command}: completed (read-only mode).`,
      tool: 'Bash',
    };
  }

  // 修正 1: find -exec 危險旗標攔截
  if (baseCmd === 'find') {
    if (args.some((a) => FIND_DANGEROUS_FLAGS.has(a))) {
      console.warn(`[isolation] Dangerous find flag intercepted: ${command}`);
      return {
        success: true,
        data: `find: completed (dangerous flags disabled).`,
        tool: 'Bash',
      };
    }
  }

  // 路徑穿越防護：對每個命令參數做 resolve + relative 檢查（與 executeRead 一致）
  const normalizedWorkspace = resolve(workspaceDir);
  for (const arg of args) {
    const fullPath = resolve(workspaceDir, arg);
    const rel = relative(normalizedWorkspace, fullPath);
    if (rel.startsWith('..')) {
      console.warn(`[isolation] Path escape attempt intercepted: ${command}`);
      return {
        success: true,
        data: `Error: Access denied — paths outside workspace are restricted.`,
        tool: 'Bash',
      };
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(baseCmd, args, {
      cwd: workspaceDir,
      timeout: 5000,
    });
    const output = stderr ? `${stdout}\n${stderr}` : stdout;
    return { success: true, data: output || '(no output)', tool: 'Bash' };
  } catch (err) {
    return {
      success: false,
      data: `Error: ${err instanceof Error ? err.message : String(err)}`,
      tool: 'Bash',
    };
  }
}

/**
 * 在 workspace 內真實執行支援的工具。
 *
 * @param tool - 工具名稱（Read / Grep / Glob）
 * @param workspaceDir - 隔離工作目錄絕對路徑
 * @param params - 工具參數
 * @returns 真實執行結果
 */
async function executeInWorkspace(
  tool: string,
  workspaceDir: string,
  params: Record<string, unknown>,
): Promise<MockToolResult> {
  switch (tool) {
    case 'Read':
      return await executeRead(workspaceDir, params);
    case 'Grep':
      return await executeGrep(workspaceDir, params);
    case 'Glob':
      return await executeGlob(workspaceDir, params);
    default:
      throw new Error(`Unknown workspace tool: ${tool}`);
  }
}

/**
 * 建立工具分發器（ToolDispatcher）。
 *
 * 建立的 dispatcher 會攔截工具調用請求並根據工具類型決定行為：
 * - Read/Grep/Glob（有 workspaceDir）：在 workspace 內真實執行
 * - LSP/WebSearch/WebFetch：回傳模擬結果
 * - Read/Grep/Glob（無 workspaceDir）：回傳模擬結果
 * - 寫入工具：記錄調用意圖後回傳模擬成功結果
 * - 未知工具：記錄 warning 並回傳 pass-through 結果
 *
 * @param options.workspaceDir - 可選的隔離工作目錄路徑
 * @returns ToolDispatcher 實例
 */
export function createToolDispatcher(
  options: { workspaceDir?: string } = {},
): ToolDispatcher {
  const workspaceDir = options.workspaceDir;

  const dispatcher: ToolDispatcher = {
    async dispatch(toolCall: ToolCall): Promise<MockToolResult> {
      const { tool, params } = toolCall;

      let result: MockToolResult;

      if (tool === 'Bash' && workspaceDir) {
        // 在 workspace 內真實執行 Bash 唯讀命令
        result = await executeBash(workspaceDir, params);
      } else if (WORKSPACE_TOOLS.has(tool) && workspaceDir) {
        // 在 workspace 內真實執行
        result = await executeInWorkspace(tool, workspaceDir, params);
      } else if (
        SIMULATED_TOOLS.has(tool) ||
        (WORKSPACE_TOOLS.has(tool) && !workspaceDir)
      ) {
        // 維持模擬回傳，對被測模型透明
        result = {
          success: true,
          data: buildReadResponse(params),
          tool,
        };
      } else if (WRITE_TOOLS.has(tool)) {
        console.warn(
          `[isolation] Write tool intercepted: ${tool}`,
          JSON.stringify(params),
        );
        result = { success: true, data: buildWriteResponse(params), tool };
      } else {
        console.warn(`[isolation] Unknown tool called: ${tool}`);
        result = { success: true, data: UNKNOWN_RESPONSE, tool };
      }

      return result;
    },
  };

  return dispatcher;
}
