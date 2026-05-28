# Spec: Package Architecture & Foundation

- Date: 2026-05-29
- Feature: CLI Monorepo Refactor — Package Architecture & Foundation
- Owner: [To be filled]

## Goal

將 `@laitszkin/apollo-toolkit` 從單體 CommonJS 專案重構為 monorepo 結構，建立清晰的 package 邊界（CLI 命令層、互動式 TUI、工具註冊中心），每個 package 有獨立介面、可獨立測試。

## Scope

### In Scope

- 建立 monorepo workspace 結構（`packages/cli`, `packages/tui`, `packages/tool-registry`）
- 將 CLI 命令管理邏輯（install / uninstall / tool 路由）從 `lib/cli.ts` 拆分至 `packages/cli`
- 將互動式終端 UI 元件（選擇器、確認提示、動畫、畫面渲染）從 `lib/cli.ts` 抽出至 `packages/tui`
- 建立 `packages/tool-registry`，定義統一的 `ToolDefinition` 介面與註冊/查詢/列表 API
- 定義各 package 之間的公開介面合約（import/export 邊界）
- 設定 TypeScript project references 與 workspace 建置流水線
- 遷移至 ESM 模組系統（`"type": "module"`）
- 維持對外 CLI 入口 (`bin/apollo-toolkit.ts`) 行為不變

### Out of Scope

- 將個別工具遷移至獨立 package（由 Spec 2 處理）
- 引入外部 CLI 框架 / 終端樣式庫替換手寫實作（由 Spec 2 處理）
- 修改技能安裝邏輯 (`installer.ts`) 的業務行為
- 修改 `skills/` 目錄結構或技能內容
- 變更 CLI 命令名稱、參數格式或輸出格式
- 遷移至 ESM 模組系統（`"type": "module"`）

## Functional Behaviors (BDD)

### Requirement 1: Monorepo Workspace 結構

**GIVEN** 開發者 clone 倉庫並執行 `npm install`
**AND** 專案根目錄 `package.json` 定義了 `workspaces` 指向 `packages/*`
**AND** 每個子 package 以 ESM 模組系統運作（`"type": "module"`）
**WHEN** 執行 `npm install`
**THEN** 所有子 package 的依賴被安裝
**AND** 跨 package 的本地 import 可正確解析
**AND** 單次 `npm run build`（或 `tsc --build`）能依正確順序編譯所有 package

**Uncertainty Level**: Known

**Requirements**:
- [x] R1.1 根 `package.json` 定義 workspaces 欄位，包含 `packages/cli`, `packages/tui`, `packages/tool-registry`
- [x] R1.2 每個子 package 有獨立的 `package.json`、`tsconfig.json`
- [x] R1.3 TypeScript project references 設定正確的依賴順序（tui → tool-registry → cli）
- [x] R1.4 `npm run build` 在根目錄執行時能編譯所有子 package
- [x] R1.5 `npm test` 在根目錄執行時能運行所有子 package 的測試

### Requirement 2: CLI 命令管理模組 (`packages/cli`)

**GIVEN** `packages/cli` 作為 CLI 命令層
**WHEN** 使用者執行 `apltk install codex` 或 `apltk uninstall codex` 或 `apltk filter-logs app.log`
**THEN** CLI 模組正確解析命令、路由到對應的處理邏輯（安裝/卸載流程或工具分發）
**AND** 所有現有 CLI 參數（`--help`, `--home`, `--symlink`, `--copy`, `--yes`）行為保持不變
**AND** 幫助文字輸出格式保持不變

**Uncertainty Level**: Known

**Requirements**:
- [x] R2.1 `packages/cli` 匯出 `run(argv, context)` 函數，簽名與現有 `lib/cli.ts` 的 `run` 一致
- [x] R2.2 命令解析邏輯（`parseArguments`）從 `lib/cli.ts` 遷移至 `packages/cli`
- [x] R2.3 安裝流程（`syncToolkitHome` → `installLinks` → `printSummary`）在 `packages/cli` 內實作，`installer.ts` 與 `updater.ts` 作為 `packages/cli` 內部模組
- [x] R2.4 卸載流程（`getUninstallTargetRoots` → `uninstallSkills` → `printUninstallSummary`）在 `packages/cli` 內實作
- [x] R2.5 工具命令路由（`parsed.command === 'tool'` 路徑）通過 tool-registry 介面分發
- [x] R2.6 `bin/apollo-toolkit.ts` 入口檔案更新 import 路徑指向 `packages/cli`

### Requirement 3: 互動式 TUI 模組 (`packages/tui`)

**GIVEN** `packages/tui` 作為可重用的終端 UI 元件庫
**WHEN** CLI 安裝流程需要顯示目標選擇器、確認提示、或歡迎動畫
**THEN** CLI 模組從 `packages/tui` 匯入對應元件
**AND** 每個 TUI 元件可獨立測試（不依賴 CLI 業務邏輯）
**AND** TUI 元件不直接讀取 `process.stdin`/`process.stdout`，而是通過參數注入

**Uncertainty Level**: Known

**Requirements**:
- [x] R3.1 `packages/tui` 匯出 `promptForSelectableModes` 函數，行為與現有實作一致
- [x] R3.2 `packages/tui` 匯出 `promptYesNo` 函數，行為與現有實作一致
- [x] R3.3 `packages/tui` 匯出 `renderSelectionScreen` 函數
- [x] R3.4 `packages/tui` 匯出終端樣式工具函數（`color`, `supportsColor`, `clearScreen`, `sleep` 等，來自現有 `lib/utils/terminal.ts`）
- [x] R3.5 所有 TUI 函數通過參數接收 I/O streams（stdin, stdout），不直接依賴 `process` 全域變數
- [x] R3.6 歡迎動畫邏輯（`animateWelcomeScreen`, `buildWelcomeScreen`, `buildWordmark`, `buildBanner`）遷移至 `packages/tui`

### Requirement 4: 工具註冊中心 (`packages/tool-registry`)

**GIVEN** `packages/tool-registry` 作為統一的工具註冊與發現層
**WHEN** CLI 需要列出可用工具、查詢特定工具、或分發工具執行
**THEN** tool-registry 提供註冊 API（`registerTool`）、查詢 API（`getTool`, `listTools`）、與分發 API（`runTool`）
**AND** 工具元數據（`ToolDefinition`）定義統一的結構，每個註冊的工具必須符合

**Uncertainty Level**: Known

**Requirements**:
- [x] R4.1 `packages/tool-registry` 匯出 `ToolDefinition` 介面（從現有 `lib/types.ts` 遷移）
- [x] R4.2 `packages/tool-registry` 匯出 `ToolContext` 介面
- [x] R4.3 `packages/tool-registry` 匯出 `registerTool(tool: ToolDefinition): void`
- [x] R4.4 `packages/tool-registry` 匯出 `getTool(name: string): ToolDefinition | null`
- [x] R4.5 `packages/tool-registry` 匯出 `listTools(): ToolDefinition[]`
- [x] R4.6 `packages/tool-registry` 匯出 `runTool(name, args, context): Promise<number>`
- [x] R4.7 幫助文字格式化函數（`formatToolList`, `buildToolDiscoveryHelp`, `buildToolOverview`, `buildToolExamples`）遷移至 `packages/tool-registry`
- [x] R4.8 `ToolDefinition.handler` 欄位為 `(args: string[], context: ToolContext) => Promise<number>`，與現有合約一致

## Error and Edge Cases

- [x] 當 `packages/tui` 在非 TTY 環境中調用互動式函數時，應拋出明確的錯誤訊息（與現有行為一致）
- [x] 當 tool-registry 收到未知工具名稱時，應輸出可用工具列表並返回非零 exit code
- [x] 當 workspace 子 package 之間的循環依賴被引入時，建置應失敗
- [x] 當某個子 package 的 `package.json` 缺少必要欄位時，`npm install` 應給出明確錯誤
- [x] 當 CLI 模組調用 installer 但 `APOLLO_TOOLKIT_HOME` 指向無效路徑時，應給出明確錯誤訊息

## Resolved Decisions

以下問題已在需求階段獲得確認，無需再次討論：

1. **Package 管理工具**: 使用 `npm workspaces`（零額外依賴）
2. **模組系統**: 遷移至 ESM（`"type": "module"`）
3. **Installer 模組**: 放在 `packages/cli` 內部
4. **Updater 模組**: 放在 `packages/cli` 內部

## References

- Official docs:
  - [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
  - [npm Workspaces](https://docs.npmjs.com/cli/using-npm/workspaces)
- Related code files:
  - `lib/cli.ts` — CLI 主邏輯（命令解析、安裝/卸載流程、幫助文字）
  - `lib/tool-runner.ts` — 工具註冊表與分發
  - `lib/installer.ts` — 技能安裝/卸載
  - `lib/types.ts` — 共享型別定義
  - `lib/utils/terminal.ts` — 終端樣式與動畫
  - `lib/utils/format.ts` — 格式化工具
  - `bin/apollo-toolkit.ts` — CLI 入口點
  - `package.json` — 當前單體 package 配置
  - `tsconfig.json` — 當前 TypeScript 配置
