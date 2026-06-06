# Spec: CLI 工具全面重構

- **Date**: 2026-06-04
- **Feature**: cli-refactor

## Goal

提升 Apollo Toolkit CLI 的內部可維護性，讓開發者在現有 5 個 package 邊界內，能以最少的樣板程式碼新增或修改指令，並且對程式碼的正確性有足夠信心（單元測試覆蓋率 >= 80%，CI 矩陣同時驗證 Ubuntu 與 Windows）。

## Scope

### In Scope

- `packages/cli`：指令派發流程與引數解析的內部重構；安裝/解除安裝引擎的內部抽象化；help 文字產生器的統一化。
- `packages/tool-registry`：註冊機制維持不變，但改善工具列舉格式化的可測試性。
- `packages/tool-utils`：新增跨平台抽象子模組，封裝路徑、換行、子行程、TTY 偵測等平台相關行為。
- `packages/tools/*`：各工具內部的引數解析、錯誤處理、輸出格式化，統一由共用層提供，消除各自實作的樣板。
- `packages/tui`：新增結構化輸出函數（`stdout`/`stderr`/`info`/`warn`/`error`），支援 `--json` 模式的自動降階。
- `test/`：測試總涵蓋率 >= 80%，補足目前測試覆蓋不足的模組（特別是個別工具與跨平台路徑）。
- `.github/workflows/`：新增 test CI workflow，使用 matrix 策略（ubuntu-latest + windows-latest）。
- 版本號由 v4.1.4 提升至 v5.0.0。

### Out of Scope

- **Package 邊界重劃分**：不拆分或合併現有的 `cli`、`tool-registry`、`tool-utils`、`tui`、`tools/*` 等 package。
- **CLI 對外介面**：不改變指令名稱、引數簽名、傳回值語義、設定檔格式或環境變數名稱。
- **新增功能**：不引入任何新的 CLI 指令或 tool。
- **Eval 工具**：`@laitszkin/tool-eval` 不納入本次重構範圍。
- **TypeScript 轉 JavaScript**：保留 TypeScript 專案結構，不改寫語言或建置工具鏈。

## Functional Behaviors (BDD)

### Requirement 1: 新工具的樣板程式碼降至最低

**GIVEN** 開發者想要新增一個 CLI tool
**AND** 該 tool 只需要接收若干個具名引數（例如 `--start`、`--end`），執行一條純粹的資料處理邏輯，然後輸出結果
**WHEN** 開發者在 `packages/tools/` 下建立 tool package 並定義 `ToolDefinition`
**THEN** 該 tool 不需要自行實作引數解析、錯誤處理、或輸出格式化
**AND** tool 的引數定義、help 文字、驗證邏輯全部來自同一個 schema 宣告

**Uncertainty Level**: Known

**備註**：目前 filter-logs、create-specs 等工具各自實作了完整的 `parseArgs()` 迴圈，行數在 30-60 行——這些在重構後應由框架層提供。

### Requirement 2: 跨平台路徑與檔案操作由統一抽象層處理

**GIVEN** CLI 的任何程式碼需要進行檔案系統操作（路徑組合、檔案讀寫、資料夾刪除）、子行程呼叫、或 TTY 偵測
**WHEN** 該操作在 Windows 環境被觸發
**THEN** 它的行為與在 macOS/Linux 一致，不需要開發者手動判斷 `process.platform`

**Uncertainty Level**: Known

**備註**：目前跨平台處理散落在各處——`replaceWithSymlink` 在 `installer.ts:359` 處理了 Windows junction，`isInteractive` 在 `terminal.ts:27` 處理了 MSYS2 偵測——但缺乏統一抽象層。新的抽象層應以 `PlatformAdapter` interface 形式存在，封裝：
- `path.normalize` / `path.join` 的標準使用（已無差異，但確保一致）
- `os.EOL` 的統一處理（寫入檔案時使用）
- `fs.symlink` 的 Windows junction 降階
- `spawn` 的 `shell: true` 行為（Windows 需要 .cmd 解析）

### Requirement 3: 所有錯誤路徑採用統一的錯誤類別與處理紀律

**GIVEN** CLI 或 tool handler 在執行中遇到錯誤
**WHEN** 該錯誤不是預期中的「使用者輸入錯誤」
**THEN** handler 拋出具類別的 `AppError`（非泛型 `Error`），由 CLI 邊界攔截後格式化輸出（`stderr` + 非零 exit code）
**AND** handler 永遠不會直接呼叫 `process.exit()` 或僅 `console.error()` 後繼續執行

**Uncertainty Level**: Known

**備註**：目前有的錯誤走 `throw`（`installer.ts:253`）、有的走 `stderr.write + return 1`（`filter-logs/index.ts:65`）、還有的以 Promise reject 形式傳遞（`updater.ts:88`）。重構後應統一為「業務邏輯層拋例外 → 邊界層捕捉 + 格式化」。

### Requirement 4: 測試總涵蓋率 >= 80%，CI 雙平台驗證

**GIVEN** CI pipeline 被觸發（push / pull request）
**WHEN** `npm test` 執行完畢
**THEN** node --experimental-test-coverage 報告的 line coverage >= 80%
**AND** 該 pipeline 在 `ubuntu-latest` 與 `windows-latest` 兩者上都通過

**Uncertainty Level**: Exploratory

**備註**：Windows runner 上可能遇到以下問題需要確認：
- `fs.symlink` 需要系統管理員權限，或改用 junction
- `path.resolve('/')` 在 Windows 上的行為差異
- 暫存目錄名稱中的 PID 格式（`process.pid` 數字）
- `node:child_process.spawn('npm', ...)` 在 Windows 需要 `.cmd` 解析

### Requirement 5: 指令派發邏輯可獨立測試

**GIVEN** 指令派發層從 `parseArguments` 分離為一個派發表格（dispatch table）+ 各命令類別的專屬解析器
**WHEN** 測試注入一組 argv
**THEN** 傳回的派發結果（command、toolName、modes、flags）可以直接驗證
**AND** 派發表格的條目可以獨立增刪而不影響其他命令

**Uncertainty Level**: Known

**備註**：目前 `parseArguments`（`packages/cli/index.ts:208-303`）是一個以 while 迴圈和 if-else 構成的 95 行函數，涵蓋 install、uninstall、tool、tools-help 四種命令。將其拆分為 `InstallArgsParser`、`UninstallArgsParser`、`ToolArgsParser` 各自實作同一個介面，既可獨立測試，也降低日後新增命令類別時的耦合。

## Error and Edge Cases

- **不完整的引數值**：`--home` 後接值為空或遺失 → 拋出具體錯誤訊息，Exit code 1。（已有實作，需確認統一 Error 類別涵蓋）
- **無對應 tool**：`apltk nonexistent-tool` → Exit code 1，stderr 包含「Unknown tool」與工具列表。（已有實作，無需變更）
- **Windows 符號連結權限不足**：在 Windows 執行 `--symlink` 安裝但使用者未以管理員身份執行 → 降階為 copy 模式並輸出警告。
- **CI Windows runner 無 HOME 變數**：部分 Windows CI 環境 `HOME` 未設定 → 需確保 `resolveHomeDirectory()` 正確 fallback 到 `USERPROFILE` 和 `os.homedir()`。
- **選擇性互動模式在非 TTY 的行為**：非 TTY 模式下執行 `apltk`（無引數）→ 拋出明確的錯誤訊息，提示使用明確模式引數重新執行，而非靜默失敗。
- **Update check 在 Windows npm 的相容性**：`execCommand('npm', ['view', ...])` 在 Windows 需要確保 `npm.cmd` 被正確解析。
- **測試隔離性**：多個測試檔案使用暫存目錄時可能因非同步 cleanup 造成衝突 → 確保每個測試使用獨立的 `mkdtemp` 路徑。

## Clarification Questions

1. **Windows 符號連結降階策略**：在 Windows 上如果 `fs.symlink` 權限不足，你期望自動降階為 copy（靜默降階），還是拋錯誤讓使用者知道？推薦靜默降階 + 警告訊息，因為終端使用者不需要知道 symlink 跟 copy 的技術差異。
2. **測試涵蓋率測量工具**：你偏好使用 `node:test` 原生的 `--experimental-test-coverage`（Node 22+ 內建），還是 `c8`（v8 引擎的 JavaScript 涵蓋率工具）？推薦 `node --experimental-test-coverage` 以減少依賴。
3. **硬體限制**：你的開發機器或 CI 環境有 Node.js 版本下限嗎？這會影響我們能否使用 Node 22+ 的 `--experimental-test-coverage` 或 `fs.symlink` 的 `'junction'` 類型。

## References

### Related code files (current state for refactoring)

- `packages/cli/index.ts` — `run()` (L423-586)、`parseArguments()` (L208-303)、help text builders (L62-202)
- `packages/cli/installer.ts` — 465 行，包含安裝/解除安裝的核心邏輯與 target root 解析
- `packages/cli/tool-registration.ts` — 動態匯入 21 個 tool package；`TOOL_MODULE_NAMES` 為 hardcode 列表
- `packages/cli/updater.ts` — `execCommand()` (L63-96) 實作跨平台 spawn；`checkForPackageUpdate()` (L130-166)
- `packages/cli/types.ts` — `CliContext`, `ParsedArguments`, `InstallMode` 等共用型別
- `packages/tool-registry/registry.ts` — `ToolDefinition` 註冊/查詢/執行/格式化
- `packages/tool-utils/log-utils.ts` — 時間戳解析（230 行純函數）
- `packages/tool-utils/skill-discovery.ts` — 技能目錄列舉
- `packages/tui/terminal.ts` — TTY 偵測、顏色支援判定
- `packages/tui/banner.ts` — Wordmark、歡迎畫面、選擇畫面
- `packages/tui/prompts.ts` — Inquirer 的 confirm / checkbox 封裝
- `packages/tools/filter-logs/index.ts` — 工具自帶 `parseArgs()` 的範例
- `packages/tools/create-specs/index.ts` — 工具自帶完整引數解析與錯誤處理的範例
- `test/cli-parsing.test.js` — 19 個 `parseArguments` 測試案例
- `test/installer.test.js` — 整合測試：syncToolkitHome、installLinks、uninstallSkills、run
- `test/tool-runner.test.js` — 工具派發測試
- `test/tools/filter-logs.test.js` — filter-logs handler 測試

<!--
以下 codegraph 工具被排除在本次範圍外，但有相關程式碼：
- packages/tools/codegraph/
- packages/tools/eval/
-->
