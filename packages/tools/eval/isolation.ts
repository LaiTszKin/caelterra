/**
 * isolation.ts — 評測隔離模組
 *
 * 提供工具調用攔截與評分上下文隔離功能：
 * 1. 讀取工具（Read, Grep, Glob 等）模擬回傳成功結果
 * 2. 寫入工具（Write, Edit, Bash 等）記錄調用意圖後模擬回傳
 * 3. 每次 judge call 使用全新 messages array，確保上下文不污染
 *
 * 僅使用 Node.js 內建模組，無外部依賴。
 */

// --- Public Types ---

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
}

export interface MockToolResult {
  success: boolean;
  data: string;
  tool: string;
}

export interface ToolCallRecord {
  tool: string;
  params: object;
  result: MockToolResult;
  timestamp: string;
}

export interface ToolDispatcher {
  /**
   * 分發工具調用請求。
   *
   * - 若 tool 在 READ_TOOLS 中 → 模擬成功結果（不實際執行）
   * - 若 tool 在 WRITE_TOOLS 中 → 記錄調用意圖後模擬成功結果
   * - 未知工具 → 記錄 warning 並回傳 pass-through 結果
   *
   * @param toolCall - 工具調用請求
   * @returns 模擬的工具執行結果
   */
  dispatch(toolCall: ToolCall): Promise<MockToolResult>;

  /**
   * 取得所有已記錄的工具調用記錄。
   *
   * @returns 工具調用記錄陣列（包含每個調用的 tool, params, result, timestamp）
   */
  getRecords(): ToolCallRecord[];
}

export interface MessageContext {
  /**
   * 當前 messages array（初始為空白陣列）。
   */
  messages: { role: string; content: string }[];

  /**
   * 建立全新的空白 messages array。
   * 每次 judge call 前應調用此方法，確保不同題目之間無上下文洩漏。
   *
   * @returns 空白的 messages array（[]）
   */
  createFresh(): { role: string; content: string }[];
}

// --- Tool Dispatch Implementation ---

/**
 * 被視為唯讀操作的工具集合。
 * 這些工具被攔截後直接回傳模擬成功結果，不實際執行。
 */
const READ_TOOLS: ReadonlySet<string> = new Set([
  'Read',
  'Grep',
  'Glob',
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
  'Bash',
]);

const READ_RESPONSE = 'Read operation simulated: OK';
const WRITE_RESPONSE = 'Write operation simulated: file written';
const UNKNOWN_RESPONSE = 'Passthrough: not intercepted';

/**
 * 建立工具分發器（ToolDispatcher）。
 *
 * 建立的 dispatcher 會攔截工具調用請求並根據工具類型決定行為：
 * - 讀取工具：直接回傳模擬成功結果
 * - 寫入工具：記錄調用意圖後回傳模擬成功結果
 * - 未知工具：記錄 warning 並回傳 pass-through 結果
 * 所有調用都會被記錄，可透過 getRecords() 取得。
 *
 * @param options.workspaceDir - 可選的隔離工作目錄路徑（目前保留供未來擴展）
 * @returns ToolDispatcher 實例
 */
export function createToolDispatcher(
  options: { workspaceDir?: string } = {},
): ToolDispatcher {
  const records: ToolCallRecord[] = [];

  const dispatcher: ToolDispatcher = {
    async dispatch(toolCall: ToolCall): Promise<MockToolResult> {
      const { tool, params } = toolCall;
      const timestamp = new Date().toISOString();

      let result: MockToolResult;

      if (READ_TOOLS.has(tool)) {
        result = { success: true, data: READ_RESPONSE, tool };
      } else if (WRITE_TOOLS.has(tool)) {
        console.warn(
          `[isolation] Write tool intercepted: ${tool}`,
          JSON.stringify(params),
        );
        result = { success: true, data: WRITE_RESPONSE, tool };
      } else {
        console.warn(`[isolation] Unknown tool called: ${tool}`);
        result = { success: true, data: UNKNOWN_RESPONSE, tool };
      }

      records.push({ tool, params, result, timestamp });
      return result;
    },

    getRecords(): ToolCallRecord[] {
      return [...records];
    },
  };

  return dispatcher;
}

// --- Fresh Context Factory ---

/**
 * 建立獨立上下文工廠（MessageContext）。
 *
 * 回傳的 MessageContext 實例包含：
 * - messages: 初始為空白陣列
 * - createFresh(): 每次呼叫回傳全新的空白 messages array（[]）
 *
 * 使用方式：
 *   const ctx = createFreshContext();
 *   const messages = ctx.createFresh(); // []
 *   // 對 messages 進行操作...
 *   const freshMessages = ctx.createFresh(); // 全新 []，不受前次操作影響
 *
 * @returns MessageContext 實例
 */
export function createFreshContext(): MessageContext {
  return {
    messages: [],
    createFresh(): { role: string; content: string }[] {
      return [];
    },
  };
}

// --- Isolation Validation ---

/**
 * Judge 輸出中不應出現在新鮮上下文中的關鍵詞集合。
 *
 * 當 validateIsolation 檢查非空的 messages array 時，
 * 會逐一檢查每則 message 的 content 是否包含這些關鍵詞。
 * 若包含任一關鍵詞，代表上下文隔離可能失效（judge 上下文洩漏）。
 */
const JUDGE_OUTPUT_KEYWORDS: ReadonlySet<string> = new Set([
  'overallScore',
  'instruction_adherence',
  'tool_calling',
  'result_quality',
  '評分',
  'score',
]);

/**
 * 驗證上下文隔離狀態。
 *
 * 檢查給定的 messages array 是否處於預期的隔離狀態：
 * - 若 messages 為空陣列（fresh state），代表隔離有效，回傳 true
 * - 若 messages 包含任何內容，檢查是否包含不應存在的 judge 輸出關鍵詞：
 *   - 包含任一關鍵詞 → 代表上下文已受 judge 輸出污染，回傳 false
 *   - 未包含關鍵詞 → 代表內容非 judge 相關，隔離仍有效，回傳 true
 *
 * @param messages - 要驗證的 messages array
 * @returns 隔離有效回傳 true，否則 false
 */
export function validateIsolation(
  messages: { role: string; content: string }[],
): boolean {
  if (messages.length === 0) {
    return true;
  }

  for (const msg of messages) {
    const content = msg.content ?? '';
    for (const keyword of JUDGE_OUTPUT_KEYWORDS) {
      if (content.includes(keyword)) {
        return false;
      }
    }
  }

  return true;
}
