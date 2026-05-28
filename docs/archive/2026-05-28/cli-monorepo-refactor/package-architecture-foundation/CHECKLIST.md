# Checklist: Package Architecture & Foundation

- **Date**: 2026-05-29
- **Feature**: CLI Monorepo Refactor — Package Architecture & Foundation
- **Source SPEC**: `docs/plans/2026-05-28/cli-monorepo-refactor/package-architecture-foundation/SPEC.md`

> **Purpose:** 驗證策略——定義如何確認重構後的 monorepo 基礎設施滿足 SPEC.md 的業務需求。

---

## Behavior-to-Test Checklist

| ID | 可觀察行為 | SPEC 需求 | 對應測試 |
|---|---|---|---|
| CL-01 | `npm install` 正確安裝所有 workspace 子 package | R1.1 | IT-01 |
| CL-02 | `npm run build` (tsc --build) 依正確順序編譯所有 package | R1.4 | IT-02 |
| CL-03 | `npm test` 在根目錄執行所有子 package 測試 | R1.5 | IT-03 |
| CL-04 | CLI 入口 `run(argv, context)` 簽名與現有行為一致 | R2.1 | UT-01 |
| CL-05 | `apltk install codex --symlink` 執行完整安裝流程 | R2.3 | IT-04 |
| CL-06 | `apltk uninstall codex --yes` 執行完整卸載流程 | R2.4 | IT-05 |
| CL-07 | `apltk filter-logs app.log --start ...` 正確路由到 tool-registry | R2.5 | IT-06 |
| CL-08 | `bin/apollo-toolkit.ts` import 路徑指向 packages/cli | R2.6 | UT-02 |
| CL-09 | `packages/tui` 匯出 `promptForModes` (基於 @inquirer/prompts) | R3.1 | UT-03 |
| CL-10 | `packages/tui` 匯出 `promptYesNo` (基於 @inquirer/prompts) | R3.2 | UT-04 |
| CL-11 | `packages/tui` 匯出顏色工具 (基於 chalk) | R3.4 | UT-05 |
| CL-12 | TUI 函數通過參數接收 I/O，不依賴 process 全域 | R3.5 | UT-06 |
| CL-13 | `packages/tool-registry` 匯出 `registerTool()` / `getTool()` / `listTools()` / `runTool()` | R4.3-R4.6 | UT-07 |
| CL-14 | `formatToolList()` / `buildToolDiscoveryHelp()` 輸出格式不變 | R4.7 | UT-08, REG-01 |
| CL-15 | 未知工具名稱 → 輸出可用工具列表 + exit 1 | Error | UT-09 |
| CL-16 | 循環依賴 → tsc --build 失敗 | Error | IT-07 |

---

## Hardening Checklist

- [x] **回歸測試**: CLI 幫助文字輸出格式與現有完全一致 (`REG-01`)
- [x] **Unit drift checks**: `parseArguments` → yargs 命令定義的等價性驗證 (`REG-02`)
- [x] **Property-based coverage**: `N/A` — 本次為重構，不改變業務邏輯
- [x] **外部服務 mocked/faked**: TUI 測試使用 fake stdin/stdout streams
- [x] **Adversarial cases**: `N/A` — 不變更安全相關邏輯
- [x] **授權/冪等性/並行**: installer manifest 一致性驗證 (`IT-04`)
- [x] **Assertions verify outcomes**: 每個測試驗證具體輸出或狀態變更，非僅 "returns 0"
- [x] **Fixtures reproducible**: `N/A` — TUI 測試手動注入 I/O streams

---

## E2E / Integration Decisions

| Flow/Risk | 測試層級 | 理由 |
|---|---|---|
| `apltk install codex --copy` 完整流程 | Integration | 跨模組協作（cli → tui → installer），需真實檔案系統 |
| `apltk --help` 輸出完整性 | Integration + Snapshot | 向後相容性關鍵路徑，golden file 比對 |
| `apltk <tool> --help` 各工具幫助文字 | Integration + Snapshot | yargs 替換後幫助格式需保持一致 |
| `npm run build` workspace 編譯 | Integration (CI) | 驗證 project references 依賴順序正確 |
| Package 之間 import 正確解析 | Unit | 每個 package 匯出驗證 |

---

## Test Case Details

### Unit Tests

**UT-01** — `run()` 簽名驗證
- **目標**: `packages/cli` 匯出的 `run(argv, context)` 與現有 `lib/cli.ts` 的 `run` 簽名一致
- **Oracle**: 型別層面 — `run: (argv: string[], context?: CliContext) => Promise<number>`
- **需求**: R2.1

**UT-02** — CLI 入口 import 路徑
- **目標**: `bin/apollo-toolkit.ts` 正確 import `packages/cli`
- **Oracle**: `import { run } from '@laitszkin/cli'` 可解析
- **需求**: R2.6

**UT-03** — `promptForModes` 基於 @inquirer/prompts
- **目標**: `packages/tui` 匯出 `promptForModes(opts)` → `Promise<string[]>`
- **Oracle**: 傳入 choices 列表，返回選中的值陣列
- **需求**: R3.1

**UT-04** — `promptYesNo` 基於 @inquirer/prompts
- **目標**: `packages/tui` 匯出 `promptYesNo(opts)` → `Promise<boolean>`
- **Oracle**: default true → 直接 enter 返回 true; default false → 返回 false
- **需求**: R3.2

**UT-05** — 顏色工具基於 chalk
- **目標**: `packages/tui` 匯出 `color(text, style)` 使用 chalk
- **Oracle**: `color('hello', 'bold.cyan')` 產生正確的 ANSI 輸出
- **需求**: R3.4

**UT-06** — TUI 不依賴 process 全域
- **目標**: 所有 TUI 函數通過參數接收 stdin, stdout
- **Oracle**: 可傳入 `createMemoryStream()` 進行測試，不觸及 `process.stdin`
- **需求**: R3.5

**UT-07** — Tool Registry API
- **目標**: `registerTool()` → `getTool()` → `listTools()` → `runTool()` 完整流程
- **Oracle**: 註冊後可查詢、可列出、可執行；未註冊工具返回 null
- **需求**: R4.3-R4.6

**UT-08** — `formatToolList()` 輸出格式
- **目標**: 工具列表輸出與現有一致
- **Oracle**: 比對 golden snapshot
- **需求**: R4.7

**UT-09** — 未知工具處理
- **目標**: `runTool('unknown-tool', [], ctx)` 返回 1 並輸出列表
- **Oracle**: exit code = 1, stderr 包含 `Unknown tool: unknown-tool`
- **需求**: Error case

### Integration Tests

**IT-01** — Workspace 安裝
- **目標**: `npm install` 在根目錄成功安裝所有子 package
- **Oracle**: `node_modules/` 下存在所有 workspace symlink
- **需求**: R1.1

**IT-02** — 建置順序
- **目標**: `tsc --build` 依 tui → tool-registry → cli 順序編譯
- **Oracle**: 所有 package 的 `dist/` 產出正確
- **需求**: R1.4

**IT-03** — 測試運行
- **目標**: `npm test` 執行所有子 package 的測試
- **Oracle**: 所有測試通過，exit code 0
- **需求**: R1.5

**IT-04** — 安裝流程
- **目標**: `run(['install', 'codex', '--copy'], ctx)` 完成安裝
- **Oracle**: 技能目錄被複製、manifest JSON 正確寫入
- **需求**: R2.3

**IT-05** — 卸載流程
- **目標**: `run(['uninstall', 'codex', '--yes'], ctx)` 完成卸載
- **Oracle**: 技能目錄被移除、manifest 更新
- **需求**: R2.4

**IT-06** — 工具路由
- **目標**: `run(['filter-logs', 'test.log', '--start', '...'], ctx)` 正確路由
- **Oracle**: filter-logs handler 被調用，參數正確傳遞
- **需求**: R2.5

**IT-07** — 循環依賴防護
- **目標**: 引入 `tui → cli` import → tsc --build
- **Oracle**: 編譯失敗，錯誤訊息包含循環引用
- **需求**: Error case

### Regression Tests

**REG-01** — CLI 幫助文字 Golden 比對
- **目標**: `apltk --help` 輸出與重構前一致
- **Oracle**: 文字比對（忽略版本號變動）
- **需求**: R4.7 (向後相容)

**REG-02** — 參數解析等價性
- **目標**: yargs 命令定義與現有 `parseArguments()` 行為等價
- **Oracle**: 相同 CLI 輸入 → 相同的解析結果
- **需求**: R2.2

---

## Execution Summary

| 測試類型 | 狀態 |
|---|---|
| Unit | 9 test cases (UT-01 ~ UT-09) |
| Regression | 2 test cases (REG-01, REG-02) |
| Property-based | N/A (重構不改變業務邏輯) |
| Integration | 7 test cases (IT-01 ~ IT-07) |
| E2E | N/A (Integration 取代 E2E — CLI 為進程內工具) |
| Mock scenarios | TUI 測試使用 fake I/O streams |
| Adversarial | N/A |
