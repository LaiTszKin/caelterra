# Design: Tool Decoupling & External Dependencies

- **Date**: 2026-05-29
- **Feature**: CLI Monorepo Refactor — Tool Decoupling & External Dependencies
- **Source SPEC**: `docs/plans/2026-05-28/cli-monorepo-refactor/tool-decoupling-dependencies/SPEC.md`

> **Purpose:** 技術方案文檔——定義工具 package 拆分方案、yargs 整合模式、chalk/@inquirer 遷移策略。

---

## 1. 調研摘要

### 1.1 技術可行性

| 需求編號 | 可行性 | 風險點 |
|---|---|---|
| R1 (獨立工具 Package) | 可行 | 6 個 `@ts-nocheck` 檔案移除後需修復型別；`architecture.ts` 的動態 `require()` 需改寫 |
| R2 (外部技術棧整合) | 可行 | yargs 的 `.strict()` 行為比現有手寫解析更嚴格，可能拒絕現有使用者誤輸入的未知參數 |
| R3 (向後相容性) | 可行 | 幫助文字格式需手動適配（yargs 預設格式與現有不同） |

**總體判斷**: 全部可行。R2 的 strict 行為變更需在測試中驗證。

### 1.2 現有實現參考

| 參考來源 | 可借鑑的設計模式 |
|---|---|
| yargs `.command()` module pattern | 每個工具 package 導出 `{ command, describe, builder, handler }`，由 cli 統一註冊 |
| Inquirer.js checkbox 模式 | `checkbox({ message, choices })` 完全取代 `promptForSelectableModes` 的手寫 raw mode |
| chalk 鏈式 API | `chalk.bold.cyan(...)` 取代 `color(text, '1;36', enabled)` |

### 1.3 技術棧兼容性

| 候選技術 | 與 repo 依賴兼容性 | 授權 | 選擇 |
|---|---|---|---|
| yargs | 無衝突（新增依賴） | MIT | ✅ 使用 |
| chalk v5 | 無衝突（新增依賴） | MIT | ✅ 使用 |
| @inquirer/prompts | 無衝突（新增依賴） | MIT | ✅ 使用 |

---

## 2. 架構總覽

### 2.1 模組清單

| 模組 key | 職責（一句話） | 擁有的產物 |
|---|---|---|
| `packages/tools/filter-logs` | 按時間窗口過濾日誌行 | `filterLogsHandler`, `ToolDefinition` |
| `packages/tools/search-logs` | 按關鍵字/正則搜尋日誌 | `searchLogsHandler`, `ToolDefinition` |
| `packages/tools/architecture` | 開啟/操作專案 HTML 架構圖 | `architectureHandler`, `ToolDefinition` |
| `packages/tools/create-specs` | 從模板建立 spec 規劃目錄 | `createSpecsHandler`, `ToolDefinition` |
| `packages/tools/create-review-report` | 複製 code review 報告模板 | `createReviewReportHandler`, `ToolDefinition` |
| `packages/tools/docs-to-voice` | 文字轉語音 + 字幕時間軸 | `docsToVoiceHandler`, `ToolDefinition` |
| `packages/tools/render-katex` | KaTeX 公式渲染 | `renderKatexHandler`, `ToolDefinition` |
| `packages/tools/render-error-book` | 錯誤書 JSON 轉 PDF | `renderErrorBookHandler`, `ToolDefinition` |
| `packages/tools/open-github-issue` | 發布結構化 GitHub issue | `openGitHubIssueHandler`, `ToolDefinition` |
| `packages/tools/find-github-issues` | 列出/搜尋 GitHub issues | `findGitHubIssuesHandler`, `ToolDefinition` |
| `packages/tools/read-github-issue` | 讀取 GitHub issue 詳情 | `readGitHubIssueHandler`, `ToolDefinition` |
| `packages/tools/review-threads` | 列出/解決 PR review threads | `reviewThreadsHandler`, `ToolDefinition` |
| `packages/tools/generate-storyboard-images` | 從文字生成故事板圖片 | `generateStoryboardImagesHandler`, `ToolDefinition` |
| `packages/tools/enforce-video-aspect-ratio` | 調整影片長寬比 | `enforceVideoAspectRatioHandler`, `ToolDefinition` |
| `packages/tools/extract-pdf-text` | PDF 文字提取 (macOS PDFKit) | `extractPdfTextHandler`, `ToolDefinition` |
| `packages/tools/extract-conversations` | 提取 Codex 對話紀錄 | `extractConversationsHandler`, `ToolDefinition` |
| `packages/tools/sync-memory-index` | 同步 Codex 記憶索引 | `syncMemoryIndexHandler`, `ToolDefinition` |
| `packages/tools/validate-skill-frontmatter` | 驗證 SKILL.md frontmatter | `validateSkillFrontmatterHandler`, `ToolDefinition` |
| `packages/tools/validate-openai-agent-config` | 驗證 agents/openai.yaml | `validateOpenaiAgentConfigHandler`, `ToolDefinition` |
| `packages/tool-utils` | 跨工具共享程式碼（日誌解析、技能發現） | `extractTimestamp`, `iterInputLines`, `iterSkillDirs` 等 |

### 2.2 邊界

- **進入點**: 工具通過 `packages/tool-registry` 的 `registerTool()` 註冊後，由 CLI 層的 `yargs` `.command()` 暴露給使用者
- **信任邊界**: `None` — 所有工具為進程內呼叫
- **外部 → 內部**: `User (shell)` → CLI → `yargs` → `tool-registry.runTool()` → `ToolDefinition.handler()`

### 2.3 Target vs Baseline

| | Baseline（現在） | Target（變更後） |
|---|---|---|
| 工具組織 | 20 個 `.ts` 檔案集中在 `lib/tools/` | 20 個獨立 package 在 `packages/tools/<name>/` |
| 工具註冊 | 硬編碼陣列 `TOOL_COMMANDS` 在 `tool-runner.ts` | 每個 package 導出 `ToolDefinition`，由 cli 統一 `registerTool()` |
| 參數解析 | 每個工具手寫 `parseArgs()` | `yargs` `.command()` builder 模式 |
| 共享程式碼 | `log-cli-utils.ts` 放在 `lib/tools/` 內 | `packages/tool-utils/` 獨立 package |
| 型別安全 | 6 個檔案使用 `@ts-nocheck` | 全部移除 `@ts-nocheck`，完整型別檢查 |

---

## 3. 互動設計

### 3.1 互動錨點 (`INT-###`)

| ID | 意圖 | Caller → Callee | 耦合類型 | 跨越的資訊 | 失敗傳播期望 |
|---|---|---|---|---|---|
| `INT-010` | 工具註冊 | `packages/cli` → `tool-registry.registerTool()` | sync call | `ToolDefinition` | 重複註冊 → overwrite |
| `INT-011` | 工具執行 | `packages/cli` (via yargs handler) → `tool-registry.runTool()` | async call | `toolName`, `args`, `context` | handler 失敗 → exit 1 |
| `INT-012` | 工具 package 導出 | `packages/tools/<name>` → `packages/tool-registry` (型別) | import | `ToolDefinition` 型別 | 型別不符 → 編譯失敗 |
| `INT-013` | 共用工具導入 | `packages/tools/filter-logs` → `packages/tool-utils` | import | `extractTimestamp`, `iterInputLines` 等 | 編譯期檢查 |
| `INT-014` | yargs 子命令定義 | `packages/tools/<name>` → `yargs` (型別) | import | `CommandModule` 型別 | 編譯期檢查 |

### 3.2 排序 / 並行約束

- 所有工具為獨立 package，彼此無依賴 — 可並行遷移
- `packages/tool-utils` 須先於 `filter-logs` 和 `search-logs` 建立
- 工具註冊 (`INT-010`) 必須在 CLI 啟動時、命令解析之前完成

### 3.3 需求連結

- **R1 集群 (獨立工具 Package)**: `INT-012` → `INT-013` (工具內部) + `INT-010` (註冊到 registry)
- **R2 集群 (外部技術棧整合)**: `INT-014` (yargs 命令定義) + `INT-011` (執行路徑)
- **R3 集群 (向後相容)**: 所有互動錨點必須保持輸出格式一致

---

## 4. 外部依賴

### 4.1 依賴總覽

本 spec 新增的外部依賴與 Spec 1 相同（`yargs`, `chalk`, `@inquirer/prompts`），在此僅補充工具層面的使用方式。

### 4.2 yargs — 工具層整合模式

#### 事實依據

| 需要的功能 / 能力 | 文檔位置 |
|---|---|
| `.command()` module 模式 (`command`, `describe`, `builder`, `handler`) | https://yargs.js.org/docs |
| `.positional()` 位置參數定義 | https://yargs.js.org/docs/#api-reference-positional |
| `.option()` 選項定義 (type, alias, default, demandOption) | https://yargs.js.org/docs/#api-reference-option |
| `builder` 函數接收 yargs 實例以鏈式定義 | https://yargs.js.org/docs |

#### 工具 package 標準匯出模式

每個工具 package 的 `index.ts` 匯出：

```typescript
// packages/tools/filter-logs/index.ts
import type { ToolDefinition } from '@laitszkin/tool-registry';
import { filterLogsHandler } from './handler.js';

export const tool: ToolDefinition = {
  name: 'filter-logs',
  category: 'Observability',
  description: 'Filter log lines by timestamp window.',
  aliases: ['filter-logs-by-time'],
  handler: filterLogsHandler,
};

// yargs 命令模組（供 cli 層使用）
export const yargsCommand = {
  command: 'filter-logs [paths...]',
  describe: 'Filter log lines by timestamp window.',
  builder: (yargs) => yargs
    .positional('paths', { describe: 'Log file paths', type: 'string', array: true, default: [] })
    .option('start', { type: 'string', describe: 'Start timestamp' })
    .option('end', { type: 'string', describe: 'End timestamp' }),
  handler: async (argv) => {
    // 適配 yargs argv 到現有 handler 簽名
    // ...
  },
};
```

#### 限制與失敗模式

| 類別 | 文檔事實 | 編碼義務 |
|---|---|---|
| yargs argv 物件 vs 現有 args 格式 | yargs 返回物件而非字串陣列 | 每個工具需在 yargs handler 中轉換 argv → string[] 以調用現有 handler |
| Strict 模式 | `.strict()` 拒絕未知參數 | 使用者可能傳遞了現有手寫解析會忽略的未知 flag — 需文檔化此行為變更 |

---

## 5. 資料持久化

無新增持久化資源。工具 package 為純計算模組，不儲存狀態。

現有工具依賴的檔案路徑：
| 路徑 | 依賴的工具 |
|---|---|
| `skills/spec/assets/templates/` | `create-specs` |
| `skills/review/assets/templates/REPORT.md` | `create-review-report` |
| `skills/init-project-html/lib/atlas/cli.js` | `architecture` |

這些路徑依賴將通過 `ToolContext.sourceRoot` 動態解析，不硬編碼。

---

## 6. 系統不變量

| 不變量 | 架構上破壞它的方式 | 違反的症狀 |
|---|---|---|
| 每個工具 package 僅依賴 `tool-registry`（型別）和 `tool-utils`（共用） | 工具 import `cli` 或 `tui` | 循環依賴，建置失敗 |
| `handler` 簽名保持 `(args: string[], context: ToolContext) => Promise<number>` | 修改 handler 簽名 | 所有工具需同步修改 |
| 工具命令名稱、參數格式與重構前一致 | yargs 改名或改格式 | 現有腳本失敗 |
| 所有 `@ts-nocheck` 移除後型別檢查通過 | 跳過型別修復 | 潛在執行期錯誤 |
| 工具之間無直接依賴（僅通過 tool-utils 共享） | 工具 A import 工具 B | 循環依賴，package 邊界模糊 |

---

## 7. 技術取捨

| 決策 | 拒絕的替代方案 | 對實作的鎖定影響 |
|---|---|---|
| 20 個工具各自獨立 package（非按類別分組） | 按 category 分 6 組 — 減少 package 數量，但組內工具仍耦合 | 需維護 20 個 package.json，但每個工具可獨立版本、獨立發布、獨立測試 |
| yargs handler 內部轉換 argv → string[] 調用現有 handler | 改寫所有 handler 直接接收 yargs argv 物件 | 最小化 handler 內部改動，保持 handler 與 tool-registry 合約一致 |
| `yargsCommand` 作為工具 package 的第二匯出 | 在 cli 層集中定義所有工具的命令 | 工具自行定義 CLI 介面，cli 層僅需 `.command(tool.yargsCommand)` |
| chalk v5 全面替換 `lib/utils/terminal.ts` | 保留 `terminal.ts` 作為 chalk 的薄包裝 | `packages/tui` 直接使用 chalk，移除間接層 |
| `@inquirer/prompts` 完全取代手寫互動 | 保留手寫作為 fallback | 非 TTY 環境的行為由 @inquirer 決定（其自身會檢測 TTY） |
