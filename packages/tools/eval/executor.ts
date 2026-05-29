/**
 * executor.ts — 評測執行器核心模組
 *
 * 在隔離環境中讓模型執行技能，記錄完整的工具調用軌跡為 JSONL，
 * 支援 timeout、指數退避重試、並發控制。
 *
 * 產出物：
 *   assets/spec/{date}/test_{no}/           隔離的工作區目錄
 *   results/spec/{date}/test_{no}/trace.jsonl  執行追蹤 (JSONL)
 *   results/spec/{date}/test_{no}/.done      完成標記檔案
 *
 * 僅使用 Node.js 內建模組，無外部依賴。
 */

import { appendFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, statfsSync } from 'node:fs';
import { resolve, join } from 'node:path';

import type { EnvConfig } from './lib/env-utils.js';
import type { Question, ProjectContext } from './lib/question-utils.js';
import { callExecModel } from './lib/judge-api.js';
import { promisePool } from './lib/promise-pool.js';
import { stripScoringCriteria } from './lib/question-utils.js';
import { getProjectRoot } from './lib/project-root.js';
import { createToolDispatcher } from './isolation.js';
import type { ToolCall } from './isolation.js';

// --- Public Types ---

export interface TraceEvent {
  type: 'start' | 'thinking' | 'response' | 'tool_call' | 'tool_result' | 'error' | 'end';
  timestamp: string;
  data: Record<string, unknown>;
  _lineNumber?: number;
}

export interface TestResult {
  testId: string;
  success: boolean;
  error?: string;
}

// --- Core Functions ---

/**
 * 將 trace event 以 JSONL 格式附加至指定的追蹤檔案。
 * 使用 append-only 模式 (fs.appendFile)。
 */
export async function appendTrace(
  tracePath: string,
  event: TraceEvent,
): Promise<void> {
  await appendFile(tracePath, JSON.stringify(event) + '\n', 'utf-8');
}

/**
 * 建立隔離的工作區目錄和初始檔案。
 *
 * 目錄結構：
 *   assets/spec/{date}/test_{testNo}/   (工作區 - 模型可讀寫)
 *   results/spec/{date}/test_{testNo}/  (結果區 - 存放 trace 和 .done)
 *
 * @param testNo - 測試編號（通常使用 question.id）
 * @param projectContext - 專案背景與初始檔案
 * @param date - 日期字串（用於目錄結構）
 * @returns 工作區目錄的絕對路徑
 */
export async function initWorkspace(
  testNo: string,
  projectContext: ProjectContext,
  date: string,
): Promise<string> {
  const rootDir = getProjectRoot();
  const workspaceDir = resolve(rootDir, 'assets', 'spec', date, `test_${testNo}`);
  const resultsDir = resolve(rootDir, 'results', 'spec', date, `test_${testNo}`);

  await mkdir(workspaceDir, { recursive: true });
  await mkdir(resultsDir, { recursive: true });

  for (const file of projectContext.files) {
    const filePath = join(workspaceDir, file.path);
    const fileDir = file.path.includes('/')
      ? file.path.substring(0, file.path.lastIndexOf('/'))
      : null;

    if (fileDir) {
      await mkdir(join(workspaceDir, fileDir), { recursive: true });
    }

    await writeFile(filePath, file.content, 'utf-8');
  }

  return workspaceDir;
}

/**
 * 建構提供給執行模型的 system prompt。
 *
 * 包含：
 *   1. 角色定義 (skill-based)
 *   2. 工作目錄限制（防止模型操作真實檔案）
 *   3. 專案背景描述
 *   4. 初始檔案清單
 *
 * @param workspaceDir - 隔離的工作區目錄路徑
 * @param projectContext - 專案背景資訊
 * @param skillName - 技能名稱（用於角色提示）
 * @returns 完整的 system prompt 字串
 */
function buildSystemPrompt(
  workspaceDir: string,
  projectContext: ProjectContext,
  skillName: string,
): string {
  return [
    `你是一个 ${skillName}-writing agent，负责根据使用者需求撰写规格文件。`,
    '',
    '重要限制：',
    `- 你只能在以下工作目录中读取和写入文件：${workspaceDir}`,
    '- 不要在工作目录之外创建或修改任何文件',
    '- 将所有产出的 spec 文件都写入工作目录中',
    '',
    '项目背景：',
    projectContext.description || '(无)',
    '',
    '工作目录中的初始文件 (仅供参考，你应该在此基础上产出 spec 文件)：',
    ...projectContext.files.map(f => `  - ${f.path}`),
  ].join('\n');
}

/**
 * 帶指數退避的重試包裝函數。
 *
 * @param fn - 需要重試的非同步函數
 * @param maxRetries - 最大重試次數 (預設 3)
 * @param delays - 各次重試的延遲秒數 (預設 [1, 2, 4])
 * @returns fn 的執行結果
 * @throws 所有重試耗盡後拋出最後一次錯誤
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delays: number[] = [1, 2, 4],
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delaySec = delays[Math.min(attempt, delays.length - 1)];
        console.error(
          `  重试中 (${attempt + 1}/${maxRetries})... ${delaySec}s 后重试: ${lastError.message.split('\n')[0]}`,
        );
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    }
  }

  throw lastError;
}

/**
 * 執行單一測試（一次嘗試，不含重試）。
 *
 * 使用多輪 tool-use loop (最多 20 輪)：
 *   1. 建立結果目錄，清理舊的 trace
 *   2. 記錄 start event
 *   3. 使用 lib/question-utils 的 stripScoringCriteria 剝離評分標準
 *   4. 建立隔離工作區目錄 (initWorkspace)
 *   5. 建構 system prompt 並記錄 thinking event
 *   6. 建立工具分發器 (createToolDispatcher)
 *   7. 進入 tool-use loop:
 *      a. 呼叫 callExecModel（含 AbortController timeout）
 *      b. 若 finish_reason === 'stop' → 記錄最終 response 並結束循環
 *      c. 若 finish_reason === 'tool_calls' → 逐一 dispatch 並記錄 tool_call/tool_result
 *      d. 將 tool_call 和 tool_result 附加到 messages array
 *      e. 繼續下一輪
 *   8. 記錄 end event，寫入 .done marker
 *   9. 錯誤處理：timeout 記錄為 'timeout' 狀態，API error 記錄為 'error' 狀態
 */
async function executeSingleTest(
  question: Question,
  env: EnvConfig,
  date: string,
  skillName: string,
): Promise<TestResult> {
  const testNo = question.id;
  const rootDir = getProjectRoot();
  const resultsDir = resolve(rootDir, 'results', 'spec', date, `test_${testNo}`);
  const tracePath = resolve(resultsDir, 'trace.jsonl');
  const donePath = resolve(resultsDir, '.done');

  // 確保結果目錄存在，並在重試時清理舊的 trace
  await mkdir(resultsDir, { recursive: true });

  // 如果 trace 檔案存在但沒有 .done marker（代表前一次失敗），清除舊 trace
  if (existsSync(tracePath) && !existsSync(donePath)) {
    await rm(tracePath, { force: true });
  }

  const startTime = Date.now();

  await appendTrace(tracePath, {
    type: 'start',
    timestamp: new Date().toISOString(),
    data: { testId: testNo, difficulty: question.difficulty },
  });

  try {
    // 剝離評分標準，確保被測模型看不到評分條件
    const stripped = stripScoringCriteria(question);
    const workspaceDir = await initWorkspace(testNo, stripped.projectContext, date);
    const systemPrompt = buildSystemPrompt(workspaceDir, stripped.projectContext, skillName);

    await appendTrace(tracePath, {
      type: 'thinking',
      timestamp: new Date().toISOString(),
      data: { systemPrompt, userPrompt: stripped.userPrompt },
    });

    // 建立工具分發器 (每個 test 一個)
    const dispatcher = createToolDispatcher({ workspaceDir });

    // 使用寬鬆型別以容納 tool_calls 和 tool_call_id 欄位
    const messages: Record<string, unknown>[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: stripped.userPrompt },
    ];

    // 多輪 tool-use loop (最多 20 輪)
    const MAX_TOOL_ROUNDS = 20;
    let finalResponse: Record<string, unknown> | null = null;
    let totalToolCalls = 0;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // 呼叫執行模型（含 AbortController timeout）
      const controller = new AbortController();
      const timeoutMs = env.EXEC_TIMEOUT * 1000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Record<string, unknown>;
      try {
        response = await callExecModel(
          messages as unknown as Parameters<typeof callExecModel>[0],
          env,
          controller.signal,
        );
      } finally {
        clearTimeout(timeoutId);
      }

      const choices = response.choices as Array<Record<string, unknown>> | undefined;
      const finishReason = choices?.[0]?.finish_reason as string | undefined;
      const assistantMessage = choices?.[0]?.message as Record<string, unknown> | undefined;

      if (finishReason === 'stop' || (finishReason !== 'tool_calls' && round > 0)) {
        // 記錄最終 response
        await appendTrace(tracePath, {
          type: 'response',
          timestamp: new Date().toISOString(),
          data: {
            model: response.model,
            usage: response.usage,
            message: assistantMessage,
            finish_reason: finishReason,
            rounds: round + 1,
            totalToolCalls,
          },
        });
        finalResponse = response;
        break;
      }

      if (finishReason === 'tool_calls') {
        const toolCalls = assistantMessage?.tool_calls as Array<Record<string, unknown>> | undefined;
        if (!toolCalls || toolCalls.length === 0) {
          // 異常：finish_reason 為 tool_calls 但無 tool_calls 資料
          await appendTrace(tracePath, {
            type: 'error',
            timestamp: new Date().toISOString(),
            data: { error: 'finish_reason is tool_calls but no tool_calls in response' },
          });
          break;
        }

        // 將 assistant message（含 tool_calls）加入 messages
        messages.push({
          role: 'assistant',
          content: (assistantMessage?.content as string | null) ?? null,
          tool_calls: toolCalls,
        });

        for (const tc of toolCalls) {
          const id = tc.id as string;
          const func = tc.function as Record<string, unknown> | undefined;
          const toolName = (func?.name as string) || (tc.tool as string) || 'unknown';
          const rawArgs = func?.arguments as string | undefined;
          let args: Record<string, unknown>;
          try {
            args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
          } catch {
            args = {};
          }

          const toolCall: ToolCall = { tool: toolName, params: args };
          const result = await dispatcher.dispatch(toolCall);

          // 記錄 tool_call event
          await appendTrace(tracePath, {
            type: 'tool_call',
            timestamp: new Date().toISOString(),
            data: { id, tool: toolName, params: args },
          });

          // 記錄 tool_result event
          await appendTrace(tracePath, {
            type: 'tool_result',
            timestamp: new Date().toISOString(),
            data: { id, tool: toolName, result },
          });

          // 將 tool result 加入 messages
          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: id,
          });

          totalToolCalls++;
        }

        // 繼續下一輪
        continue;
      }

      // 首輪 finish_reason 非 tool_calls 也非 stop（如 length 或 content_filter）
      await appendTrace(tracePath, {
        type: 'response',
        timestamp: new Date().toISOString(),
        data: {
          model: response.model,
          usage: response.usage,
          message: assistantMessage,
          finish_reason: finishReason,
        },
      });
      finalResponse = response;
      break;
    }

    if (!finalResponse) {
      throw new Error('Max tool rounds (20) exceeded without final response');
    }

    const duration = Date.now() - startTime;
    await appendTrace(tracePath, {
      type: 'end',
      timestamp: new Date().toISOString(),
      data: { duration_ms: duration, status: 'completed' },
    });

    await writeFile(
      donePath,
      JSON.stringify({
        testId: testNo,
        completedAt: new Date().toISOString(),
        duration_ms: duration,
        status: 'completed',
      }),
      'utf-8',
    );

    return { testId: testNo, success: true };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';

    await appendTrace(tracePath, {
      type: 'error',
      timestamp: new Date().toISOString(),
      data: { error: error.message, name: error.name, timeout: isTimeout },
    });

    const duration = Date.now() - startTime;
    await appendTrace(tracePath, {
      type: 'end',
      timestamp: new Date().toISOString(),
      data: {
        duration_ms: duration,
        status: isTimeout ? 'timeout' : 'error',
        error: error.message,
      },
    });

    await writeFile(
      donePath,
      JSON.stringify({
        testId: testNo,
        completedAt: new Date().toISOString(),
        duration_ms: duration,
        status: isTimeout ? 'timeout' : 'error',
        error: error.message,
      }),
      'utf-8',
    );

    return { testId: testNo, success: false, error: error.message };
  }
}

// --- Public API ---

/**
 * 執行單一測試（含指數退避重試）。
 *
 * 使用 lib/question-utils 的 stripScoringCriteria 剝離評分標準，
 * 建構 system prompt（含工作目錄限制），
 * 呼叫 callExecModel（含 AbortController timeout），
 * 記錄 start → thinking → response → end/error events 到 trace.jsonl，
 * 寫入 .done marker 檔案（含 testId, completedAt, duration_ms, status）。
 *
 * 支援指數退避重試 (1s/2s/4s，最多 3 次)。
 * timeout 和 API error 分別處理，timeout 記錄為 'timeout' 狀態。
 *
 * @param question - 完整題目物件（內部會剝離評分標準）
 * @param env - 環境設定（EXEC_* 用於執行模型，JUDGE_* 用於評分模型）
 * @param date - 測試日期字串（用於目錄結構）
 * @param skillName - 技能名稱 (預設 'spec')
 * @returns TestResult
 */
export async function runSingleTest(
  question: Question,
  env: EnvConfig,
  date: string,
  skillName: string = 'spec',
): Promise<TestResult> {
  return withRetry(() => executeSingleTest(question, env, date, skillName));
}

/**
 * 執行所有測試（使用 promisePool 並發控制）。
 *
 * 加入以下保護機制：
 *   - 磁碟空間檢查 (FIX-06)：低於 100MB 時中止
 *   - 執行階段並發鎖 (FIX-11)：防止同一 results 目錄多次執行
 *
 * @param questions - 題目陣列
 * @param env - 環境設定
 * @param date - 測試日期字串
 * @param skillName - 技能名稱 (預設 'spec')
 * @returns TestResult 陣列（順序與輸入相同）
 */
export async function runAllTests(
  questions: Question[],
  env: EnvConfig,
  date: string,
  skillName: string = 'spec',
): Promise<TestResult[]> {
  const rootDir = getProjectRoot();
  const resultsBase = resolve(rootDir, 'results', 'spec', date);

  // 磁碟空間檢查 (FIX-06)
  try {
    const stats = statfsSync(resultsBase);
    const availableMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    if (availableMB < 100) {
      throw new Error('Eval aborted: insufficient disk space (< 100MB available)');
    }
  } catch (err: unknown) {
    if ((err as Error).message?.startsWith('Eval aborted')) {
      throw err;
    }
    // statfsSync 不支援或目錄不存在 — 跳過檢查
    console.warn('  无法检查磁盘空间 (statfsSync 不可用，跳过)');
  }

  // 執行階段並發鎖 (FIX-11)
  const lockPath = resolve(resultsBase, '.exec-lock');
  try {
    await mkdir(lockPath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'EEXIST') {
      throw new Error('Another eval is already in progress');
    }
    throw err;
  }

  try {
    const total = questions.length;
    let completed = 0;
    let failed = 0;

    const results = await promisePool(
      questions,
      async (question: Question, i: number) => {
        const label = `[${i + 1}/${total}] ${question.id} (${question.difficulty})`;

        try {
          const result = await runSingleTest(question, env, date, skillName);
          completed++;
          if (result.success) {
            console.log(`${label} 完成`);
          } else {
            failed++;
            console.error(`${label} 失败: ${result.error}`);
          }
          return result;
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`${label} 最终失败 (重试耗尽): ${msg}`);
          return { testId: question.id, success: false, error: msg };
        }
      },
      env.EXEC_CONCURRENCY,
    );

    return results;
  } finally {
    // 清除並發鎖
    await rm(lockPath, { recursive: true, force: true });
  }
}
