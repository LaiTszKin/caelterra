# Design: Package Architecture & Foundation

- **Date**: 2026-05-29
- **Feature**: CLI Monorepo Refactor — Package Architecture & Foundation
- **Source SPEC**: `docs/plans/2026-05-28/cli-monorepo-refactor/package-architecture-foundation/SPEC.md`

> **Purpose:** 技術方案文檔——定義 monorepo 架構、package 邊界、互動設計、外部依賴與技術取捨。

---

## 1. 調研摘要

### 1.1 技術可行性

| 需求編號 | 可行性 | 風險點 |
|---|---|---|
| R1 (Monorepo Workspace) | 可行 | TypeScript project references 與 npm workspaces 的整合需手動維護依賴順序 |
| R2 (CLI 命令管理) | 可行 | None |
| R3 (互動式 TUI) | 可行 | `@inquirer/prompts` 為 ESM-only，需確認與 ESM 遷移的相容性 |
| R4 (工具註冊中心) | 可行 | None |

**總體判斷**: 全部可行。ESM 遷移是關鍵前置條件。

### 1.2 現有實現參考

| 參考來源 | 可借鑑的設計模式 |
|---|---|
| [yargs command module pattern](https://github.com/yargs/yargs) | 每個命令導出 `{ command, describe, builder, handler }`，由 main CLI 統一 `.command()` 註冊 |
| [TypeScript Project References 官方文檔](https://www.typescriptlang.org/docs/handbook/project-references.html) | 根 `tsconfig.json` 使用 `references` 陣列 + `"files": []`, 子 package 設 `"composite": true` |
| [npm Workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) | 根 `package.json` 設 `"workspaces": ["packages/*"]`，跨 package import 使用 `"@laitszkin/tool-registry"` 等名稱 |

### 1.3 技術棧兼容性

| 候選技術 | 與 repo 依賴兼容性 | 授權 | 選擇 |
|---|---|---|---|
| npm workspaces | 內建（Node 20+） | N/A | ✅ 使用 |
| TypeScript Project References | 內建（tsc） | N/A | ✅ 使用 |
| yargs | 無衝突 | MIT | ✅ 使用 |
| chalk v5 | ESM-only，與 ESM 遷移一致 | MIT | ✅ 使用 |
| @inquirer/prompts | ESM-only，與 ESM 遷移一致 | MIT | ✅ 使用 |

---

## 2. 架構總覽

### 2.1 模組清單

| 模組 key | 職責（一句話） | 擁有的產物 |
|---|---|---|
| `packages/tui` | 可重用的終端 UI 元件（選擇器、確認提示、動畫、樣式） | `promptForModes()`, `promptYesNo()`, `buildBanner()`, 顏色工具 |
| `packages/tool-registry` | 統一的工具註冊、查詢、分發與幫助文字 | `ToolDefinition`, `ToolContext`, `registerTool()`, `runTool()` |
| `packages/cli` | CLI 入口、命令解析、安裝/卸載流程 | `run()`, `parseArguments()`, installer, updater |

### 2.2 邊界

- **進入點**: CLI (`bin/apollo-toolkit.ts` → `packages/cli` → `run()`)
- **信任邊界**: `None` — 所有模組為進程內呼叫
- **外部 → 內部**: `User (shell)` → `bin/apollo-toolkit.ts` → `packages/cli/run()` → `yargs` 解析 → `tool-registry` / `installer`

### 2.3 Target vs Baseline

| | Baseline（現在） | Target（變更後） |
|---|---|---|
| 結構 / 所有權 | 單體 `lib/` 目錄，所有程式碼在單一 package | Monorepo: `packages/tui`, `packages/tool-registry`, `packages/cli` |
| 模組系統 | CommonJS (`"type": "commonjs"`) | ESM (`"type": "module"`) |
| 建置 | `tsc` 單次編譯全專案 | `tsc --build` 依 project references 順序編譯 |
| CLI 參數解析 | 手寫 `parseArguments()` (~100 行) | `yargs` `.command()` 宣告式定義 |
| 終端樣式 | 手寫 ANSI escape code (`lib/utils/terminal.ts`) | `chalk` v5 |
| 互動式 UI | 手寫 raw mode 鍵盤處理 (`promptForSelectableModes` ~150 行) | `@inquirer/prompts` (`checkbox` + `confirm`) |

---

## 3. 互動設計

### 3.1 互動錨點 (`INT-###`)

| ID | 意圖 | Caller → Callee | 耦合類型 | 跨越的資訊 | 失敗傳播期望 |
|---|---|---|---|---|---|
| `INT-001` | CLI 入口初始化 | `bin/apollo-toolkit.ts` → `packages/cli` | sync call | `argv`, `context` | 啟動失敗 → exit 1 |
| `INT-002` | 命令解析與路由 | `packages/cli` → `yargs` | sync call | CLI 參數 | yargs 拋錯 → exit 1 |
| `INT-003` | 安裝流程 - TUI 選擇器 | `packages/cli` → `packages/tui` | async call | `stdin`, `stdout`, `version`, `env` | TUI 異常 → exit 1 |
| `INT-004` | 安裝流程 - 執行安裝 | `packages/cli` → `installer` (內部) | async call | `toolkitHome`, `modes`, `linkMode` | 安裝失敗 → exit 1 |
| `INT-005` | 工具命令路由 | `packages/cli` → `packages/tool-registry` | async call | `toolName`, `toolArgs`, `ToolContext` | 未知工具 → 列表 + exit 1 |
| `INT-006` | 工具執行 | `packages/tool-registry` → `ToolDefinition.handler()` | async call | `args`, `context` | handler 異常 → exit 1 |
| `INT-007` | TUI 顏色輸出 | `packages/tui` → `chalk` | sync call | 文字 + 樣式 | N/A (無失敗模式) |
| `INT-008` | TUI 互動式提示 | `packages/cli` → `@inquirer/prompts` | async call | 選項列表、提示訊息 | 用戶取消 → exit 1 |

### 3.2 排序 / 並行約束

- `INT-001` (CLI 初始化) → `INT-002` (命令解析) — 順序相依
- `INT-002` → `INT-003` (TUI) 或 `INT-005` (tool 路由) — 分支，取決於命令類型
- `INT-005` → `INT-006` (工具執行) — 順序相依
- `INT-003` 和 `INT-004` 之間可能有 `INT-008` (互動式提示) — 順序相依
- 無並行需求，所有互動為順序執行

### 3.3 需求連結（粗粒度排序）

- **R1 集群 (Workspace 結構)**: 設定根 package.json → 建立子 package 目錄 → 設定 tsconfig references → 驗證 `npm run build`
- **R2 集群 (CLI 命令管理)**: `INT-001` → `INT-002` → `INT-004` / `INT-005`
- **R3 集群 (TUI 模組)**: `INT-003` → `INT-007` → `INT-008`
- **R4 集群 (Tool Registry)**: `INT-005` → `INT-006`

---

## 4. 外部依賴

### 4.1 依賴總覽

| 外部依賴 | 用途 | 官方文檔 |
|---|---|---|
| yargs | CLI 命令解析與幫助文字生成 | https://yargs.js.org/ |
| chalk v5 | 終端顏色輸出 | https://github.com/chalk/chalk |
| @inquirer/prompts | 互動式 checkbox 選擇器 + confirm 確認提示 | https://github.com/SBoudrias/Inquirer.js |

### 4.2 yargs

#### 事實依據

| 需要的功能 / 能力 | 文檔位置 |
|---|---|
| `.command()` 註冊子命令與 builder/handler | https://yargs.js.org/docs/#api-reference-command |
| `.strict()` 拒絕未知選項 | https://yargs.js.org/docs/#api-reference-strict |
| `.demandCommand()` 要求至少一個命令 | https://yargs.js.org/docs/#api-reference-demandcommand |
| `hideBin()` 剝離 node 前綴 | https://yargs.js.org/docs/#api-reference-hidebin |
| TypeScript 型別推斷 (`.options()` + `.parseSync()`) | https://github.com/yargs/yargs/blob/HEAD/docs/typescript.md |

**版本假設**: `^18.0.0`（支援 ESM）

#### 限制與失敗模式

| 類別 | 文檔事實 | 編碼義務 |
|---|---|---|
| 未知命令 | `.strict()` 自動拋出 `Unknown argument` 錯誤 | 包裝為 exit code 1 + 幫助文字 |
| 非同步命令 | `handler` 可為 async，`.parse()` 返回 Promise | CLI 頂層使用 await（現有 `run()` 已為 async） |
| 幫助文字 | `.help()` 自動生成，但格式與現有不同 | 須自訂 help 輸出以匹配現有格式（工具描述、使用場景、範例） |

#### 整合錨點 (`EXT-###`)

| ID | 在此邊界整合的對象 | 不可協商的處理要求 | 禁止的假設 |
|---|---|---|---|
| `EXT-001` | `yargs(hideBin(process.argv)).command(...)` | 所有命令必須 `.strict()` 處理未知參數 | 不假設 yargs 自動匹配現有幫助格式 |
| `EXT-002` | `.command(cmdModule)` 模式 | 每個工具命令模組導出 `{ command, describe, builder, handler }` | 不假設所有工具可用相同 builder 模式 |

### 4.3 chalk v5

#### 事實依據

| 需要的功能 / 能力 | 文檔位置 |
|---|---|
| 顏色輸出 (`chalk.cyan`, `chalk.green`, `chalk.red`, `chalk.yellow`, `chalk.bold`) | https://github.com/chalk/chalk#readme |
| 巢狀樣式 (`chalk.bold.red(...)`) | https://github.com/chalk/chalk#chain-styles |
| 顏色支援自動檢測 | https://github.com/chalk/chalk#chalksupportscolor |

**版本假設**: `^5.0.0`（ESM-only，與 ESM 遷移一致）

#### 限制與失敗模式

| 類別 | 文檔事實 | 編碼義務 |
|---|---|---|
| ESM-only | Chalk 5 為純 ESM | 確保 tsconfig 設定 `"module": "NodeNext"` 或 `"ES2022"` |
| 非 TTY 環境 | `chalk.supportsColor` 自動檢測 | 在 `packages/tui` 中包裝 `supportsColor` 檢查，與現有行為一致 |

### 4.4 @inquirer/prompts

#### 事實依據

| 需要的功能 / 能力 | 文檔位置 |
|---|---|
| `checkbox()` 多選清單 | https://github.com/SBoudrias/Inquirer.js/blob/main/packages/checkbox/README.md |
| `confirm()` 是/否確認 | https://github.com/SBoudrias/Inquirer.js/blob/main/packages/confirm/README.md |
| `Separator` 分組分隔線 | https://github.com/SBoudrias/Inquirer.js |

**版本假設**: `^8.0.0`

#### 限制與失敗模式

| 類別 | 文檔事實 | 編碼義務 |
|---|---|---|
| ESM-only | 純 ESM package | 與 chalk 相同，ESM 環境 |
| 用戶取消 | 用戶按 Ctrl+C 拋出錯誤 | 包裝為有意義的取消訊息，exit code 1 |
| 非 TTY 環境 | `stdin.isTTY === false` 時行為由呼叫方決定 | 保持現有行為：非 TTY 時拋出錯誤訊息提示用戶使用命令列參數 |

---

## 5. 資料持久化

| 資源 | 典型讀寫者 | 一致性期望 |
|---|---|---|
| `~/.apollo-toolkit/` (managed home) | `packages/cli/installer` | manifest JSON 必須與實際複製/連結的技能目錄一致 |
| `~/.apollo-toolkit/.apollo-toolkit-manifest.json` | `packages/cli/installer` | 寫入後 fsync，破壞時可重建 |
| 各 target 技能目錄 (`~/.codex/skills/*`) | `packages/cli/installer` | symlink 指向 managed home，copy 為獨立快照 |

無新增持久化資源。現有 installer 邏輯維持不變。

---

## 6. 系統不變量

| 不變量 | 架構上破壞它的方式 | 違反的症狀 |
|---|---|---|
| CLI 入口 (`bin/apollo-toolkit.ts`) 是唯一的公開進入點 | 其他 package 提供自己的 bin 入口 | 使用者調用到錯誤的二進制 |
| `packages/tui` 不依賴 `packages/cli` 業務邏輯 | 在 TUI 元件中 import CLI 模組 | 循環依賴導致建置失敗 |
| `packages/tool-registry` 不依賴任何工具 package | tool-registry import 特定工具 | 循環依賴，新增工具需修改 registry |
| 每個工具 package 僅依賴 `tool-registry`（型別）和 `tool-utils`（共用工具） | 工具 package import `cli` 或 `tui` | 循環依賴，工具無法獨立測試 |
| CLI 命令名稱、參數、輸出格式與重構前一致 | yargs 自動格式化改變輸出 | 現有腳本/CI 中斷 |

---

## 7. 技術取捨

| 決策 | 拒絕的替代方案 | 對實作的鎖定影響 |
|---|---|---|
| npm workspaces（非 pnpm） | pnpm workspaces — 更快但需團隊安裝額外工具 | 零額外依賴，但依賴隔離較鬆散 |
| ESM 遷移（同步進行） | 維持 CommonJS — 減少風險，但與 chalk/@inquirer 不相容 | 所有 import 使用 ESM 語法，`require()` 動態載入需改寫 |
| installer + updater 留在 `packages/cli` 內部 | 獨立為 `packages/installer` — 更清晰的介面邊界 | 減少 package 數量，但 installer 的重用性受限於 cli |
| `@inquirer/prompts` 替換手寫 TUI | 保持手寫 — 零依賴，但維護成本高 | 所有互動式 UI 通過 @inquirer API，行為可能微調 |
| yargs 替換手寫參數解析 | commander — 更輕量，但驗證能力較弱 | `.strict()` 可能拒絕使用者誤輸入的未知參數（現有手寫解析會忽略） |
