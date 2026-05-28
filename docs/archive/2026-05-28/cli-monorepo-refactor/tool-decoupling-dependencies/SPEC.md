# Spec: Tool Decoupling & External Dependencies

- Date: 2026-05-29
- Feature: CLI Monorepo Refactor — Tool Decoupling & External Dependencies
- Owner: [To be filled]

## Goal

將 20 個 CLI 工具從單體 `lib/tools/` 目錄拆分为獨立的 package，每個工具 package 有清晰的依賴邊界。同時引入成熟的外部依賴（CLI 框架、終端樣式、互動提示）替換目前的手工實作，簡化程式碼並提高可維護性。

## Scope

### In Scope

- 將每個現有工具（`lib/tools/*.ts`）遷移至獨立的 `packages/tools/<tool-name>/` package
- 每個工具 package 匯出標準 `ToolDefinition`，實作 `handler` 合約
- 將跨工具共享的程式碼（`log-cli-utils.ts`, `skill-discovery.ts`）提取為共用 package
- 引入 `yargs` CLI 框架替換手寫 `parseArgs`
- 引入 `chalk` 終端樣式庫替換 `lib/utils/terminal.ts` 的 ANSI escape code 拼接
- 引入 `@inquirer/prompts` 互動式提示庫替換手寫 raw mode 鍵盤處理（用於 `packages/tui`）
- 確保對外 CLI 介面（命令名稱、參數格式、輸出格式）完全一致
- 修復 6 個 `@ts-nocheck` 工具檔案的型別問題

### Out of Scope

- 新增或刪除 CLI 工具
- 修改工具的行為邏輯（重構僅改變組織方式，不改變功能）
- 變更工具的命令名稱或參數格式
- 修改 `skills/` 目錄結構
- 更換測試框架（維持 `node:test`）
- 變更 npm 發布流程

## Functional Behaviors (BDD)

### Requirement 1: 獨立工具 Package

**GIVEN** 每個 CLI 工具（如 `filter-logs`, `create-specs`, `architecture` 等）作為 `packages/tools/<tool-name>/` 下的獨立 package
**WHEN** tool-registry 註冊一個工具時
**THEN** 該工具 package 匯出符合 `ToolDefinition` 介面的物件（包含 `name`, `description`, `category`, `handler`）
**AND** 工具的 `handler` 函數簽名為 `(args: string[], context: ToolContext) => Promise<number>`
**AND** 工具 package 的依賴僅包含其實際需要的模組（不依賴其他工具 package）
**AND** 每個工具 package 可獨立測試

**Uncertainty Level**: Known

**Requirements**:
- [x] R1.1 20 個工具分別遷移至獨立的 `packages/tools/<tool-name>/` package（不按類別分組，每個工具一個 package）
- [x] R1.2 每個工具 package 有獨立的 `package.json` 與 `tsconfig.json`
- [x] R1.3 每個工具 package 匯出 `tool: ToolDefinition` 作為預設匯出或命名匯出
- [x] R1.4 工具 package 可通過 `tool-registry` 的 `registerTool()` API 註冊
- [x] R1.5 跨工具共享的 `log-cli-utils.ts` 提取為共用 package（如 `packages/tool-utils/`）
- [x] R1.6 `skill-discovery.ts` 工具函數提取至 `packages/tool-utils/`

### Requirement 2: 外部技術棧整合

**GIVEN** CLI 命令層使用 `yargs` 作為 CLI 框架，`chalk` 作為終端樣式庫，`@inquirer/prompts` 作為互動式提示庫
**WHEN** 使用者執行 `apltk filter-logs app.log --start 2026-03-24T10:00:00Z`
**THEN** `yargs` 正確解析命令名稱、選項與參數
**AND** `chalk` 提供終端顏色輸出，取代手寫 ANSI escape code
**AND** `@inquirer/prompts` 提供互動式選擇器與確認提示，用於 `packages/tui`
**AND** 每個工具的 `--help` 輸出自動生成（由 `yargs` 處理），格式與現有輸出一致
**AND** 未知選項自動被拒絕並給出提示

**Uncertainty Level**: Known

**Requirements**:
- [x] R2.1 `packages/cli` 使用 `yargs` 解析頂層命令（`install`, `uninstall`, `tools`, `<tool>`）
- [x] R2.2 每個工具 package 使用 `yargs` 定義自己的子命令與選項
- [x] R2.3 `packages/tui` 使用 `chalk` 實作終端顏色輸出，使用 `@inquirer/prompts` 實作互動式元件
- [x] R2.4 `--help` 輸出格式與現有輸出一致（包含工具描述、使用場景、範例）
- [x] R2.5 現有所有 CLI 參數（`--home`, `--symlink`, `--copy`, `--yes`, `-y`, `--start`, `--end` 等）行為保持不變

### Requirement 3: 向後相容性

**GIVEN** CLI 工具已完成重構
**WHEN** 使用者執行任何現有的 CLI 命令或腳本（包括 CI/CD 流程）
**THEN** 命令執行結果與重構前完全一致（相同的 stdout/stderr 輸出、相同的 exit code）
**AND** `npx @laitszkin/apollo-toolkit` 行為不變
**AND** `apltk` 和 `apollo-toolkit` 兩個二進制入口皆正常運作

**Uncertainty Level**: Known

**Requirements**:
- [x] R3.1 所有現有 CLI 命令名稱保持不變（`install`, `uninstall`, `tools`, 各工具名稱）
- [x] R3.2 所有現有 CLI 參數與選項格式保持不變
- [x] R3.3 stdout/stderr 輸出格式保持不變（幫助文字、錯誤訊息、安裝摘要）
- [x] R3.4 exit code 行為保持不變（成功 = 0，失敗 = 1）
- [x] R3.5 `package.json` 的 `bin` 欄位指向正確的入口檔案
- [x] R3.6 現有測試全部通過（可能需要更新 import 路徑，但測試邏輯不變）

## Error and Edge Cases

- [x] 當工具 package 的 `handler` 拋出未捕獲異常時，tool-registry 應捕獲並返回 exit code 1，不導致整個 CLI 崩潰
- [x] 當外部 CLI 框架解析到未知選項時，應輸出幫助文字並返回非零 exit code
- [x] 當 `@ts-nocheck` 被移除後，TypeScript 編譯應無錯誤
- [x] 當工具 package 之間存在隱式循環依賴時，建置應失敗
- [x] 當使用者提供格式錯誤的時間戳（如 `filter-logs --start "invalid"`）時，錯誤訊息應與現有輸出一致
- [x] 當 `APOLLO_TOOLKIT_HOME` 環境變數未設定時，installer 應使用預設路徑（行為不變）

## Resolved Decisions

以下問題已在需求階段獲得確認，無需再次討論：

1. **CLI 框架**: 使用 `yargs`（更強大的自動幫助文字、內建驗證）
2. **終端樣式**: 使用 `chalk`（功能全面，方便後續美化 TUI）
3. **互動式提示**: 接受 `@inquirer/prompts` 作為 `packages/tui` 底層實作
4. **工具 Package 粒度**: 20 個工具每個獨立 package，不按類別分組

## References

- Official docs:
  - [Yargs](https://yargs.js.org/)
  - [Chalk](https://github.com/chalk/chalk)
  - [Inquirer](https://github.com/SBoudrias/Inquirer.js)
- Related code files:
  - `lib/tools/*.ts` — 20 個工具實作（含 6 個 `@ts-nocheck` 檔案）
  - `lib/tools/log-cli-utils.ts` — 跨工具共享的日誌處理函數
  - `lib/utils/skill-discovery.ts` — 技能目錄發現工具
  - `lib/utils/terminal.ts` — 終端樣式（將被外部庫替換）
  - `lib/tool-runner.ts` — 當前的工具註冊表（將被 `packages/tool-registry` 取代）
  - `test/tools/*.test.js` — 現有工具測試
