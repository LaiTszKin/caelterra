# Checklist: Tool Decoupling & External Dependencies

- **Date**: 2026-05-29
- **Feature**: CLI Monorepo Refactor — Tool Decoupling & External Dependencies
- **Source SPEC**: `docs/plans/2026-05-28/cli-monorepo-refactor/tool-decoupling-dependencies/SPEC.md`

> **Purpose:** 驗證策略——定義如何確認 20 個工具 package 遷移和外部技術棧整合滿足 SPEC.md 的業務需求。

---

## Behavior-to-Test Checklist

| ID | 可觀察行為 | SPEC 需求 | 對應測試 |
|---|---|---|---|
| CL-01 | 每個工具 package 導出符合 `ToolDefinition` 的物件 | R1.3 | UT-10 |
| CL-02 | `registerTool(tool)` 成功註冊，`getTool(name)` 可查詢 | R1.4 | UT-11 |
| CL-03 | `packages/tool-utils` 導出 `extractTimestamp`, `iterInputLines`, `iterSkillDirs` | R1.5-R1.6 | UT-12 |
| CL-04 | `apltk filter-logs --start ...` 通過 yargs 解析並執行 handler | R2.1-R2.2 | IT-08 |
| CL-05 | `apltk <tool> --help` 輸出與重構前一致 | R2.4 | REG-03 |
| CL-06 | 所有 CLI 命令名稱保持不變 | R3.1 | REG-04 |
| CL-07 | 所有 CLI 參數格式保持不變 | R3.2 | REG-05 |
| CL-08 | stdout/stderr 輸出格式保持不變 | R3.3 | REG-06 |
| CL-09 | exit code 行為保持不變（0 = 成功, 1 = 失敗） | R3.4 | IT-09 |
| CL-10 | `package.json` 的 `bin` 欄位正確 | R3.5 | UT-13 |
| CL-11 | 現有測試全部通過（更新 import 路徑後） | R3.6 | REG-07 |
| CL-12 | 六個 `@ts-nocheck` 檔案移除後 TypeScript 編譯無錯誤 | R2 (型別) | UT-14 |
| CL-13 | handler 未捕獲異常 → exit 1，不崩潰 CLI | Error | IT-10 |
| CL-14 | yargs 解析到未知選項 → 錯誤 + 非零 exit code | Error | IT-11 |
| CL-15 | filter-logs 收到無效時間戳 → 與現有錯誤訊息一致 | Error | REG-08 |

---

## Hardening Checklist

- [x] **回歸測試**: 每個工具的 `--help` 輸出 golden 比對 (`REG-03`); 現有測試全部通過 (`REG-07`)
- [x] **Unit drift checks**: 工具 handler 行為等價性驗證 (`REG-06`)
- [x] **Property-based coverage**: `N/A` — 本次為重構，不改變業務邏輯
- [x] **外部服務 mocked/faked**: GitHub API 調用工具使用 fake gh CLI
- [x] **Adversarial cases**: `N/A` — 不變更安全相關邏輯
- [x] **授權/冪等性/並行**: 工具執行不應有副作用除非預期（dry-run 驗證）
- [x] **Assertions verify outcomes**: 每個測試驗證具體 stdout/stderr 內容和 exit code
- [x] **Fixtures reproducible**: 時間敏感測試使用固定時戳

---

## E2E / Integration Decisions

| Flow/Risk | 測試層級 | 理由 |
|---|---|---|
| 每個工具 `apltk <tool> --help` 輸出 | Integration + Snapshot | 向後相容核心路徑 |
| 每個工具的基本執行路徑（成功案例） | Integration | 驗證 yargs → handler 資料流正確 |
| 每個工具的錯誤路徑（無效參數） | Integration | 驗證 yargs strict 模式行為 |
| @ts-nocheck 型別修復 | Unit (編譯) | tsc --noEmit 通過即驗證 |
| tool-registry 註冊 + 分發 | Unit | 純邏輯，無 IO |
| `packages/tool-utils` 共用工具 | Unit | 純函數 |

---

## Test Case Details

### Unit Tests

**UT-10** — 工具導出格式
- **目標**: 每個 `packages/tools/<name>` 導出 `{ tool: ToolDefinition }` 或 `export const tool`
- **Oracle**: 型別層面 — `tool` 符合 `ToolDefinition` 介面（含 `name`, `category`, `description`, `handler`）
- **需求**: R1.3

**UT-11** — Tool Registry 註冊與查詢
- **目標**: `registerTool(tool)` → `getTool(tool.name)` → tool
- **Oracle**: 註冊後可查詢、`listTools()` 包含該工具、`runTool()` 調用 handler
- **需求**: R1.4

**UT-12** — tool-utils 匯出
- **目標**: `packages/tool-utils` 導出所有共用函數
- **Oracle**: `extractTimestamp('2026-03-24T10:00:00Z ...', 'UTC')` 返回正確 Date
- **需求**: R1.5-R1.6

**UT-13** — bin 欄位
- **目標**: 根 `package.json` 的 `bin.apltk` 指向有效檔案
- **Oracle**: `fs.existsSync(binPath)` 返回 true
- **需求**: R3.5

**UT-14** — @ts-nocheck 移除
- **目標**: 六個檔案移除 `// @ts-nocheck` 後 `tsc --noEmit` 通過
- **Oracle**: exit code 0, 無型別錯誤
- **需求**: R2 (外部技術棧整合, 型別安全)

### Integration Tests

**IT-08** — yargs 命令解析 + handler 執行
- **目標**: `run(['filter-logs', 'test.log', '--start', '2026-03-24T10:00:00Z'], ctx)` 正確執行
- **Oracle**: yargs 解析參數 → handler 被調用 → stdout 輸出正確過濾結果
- **需求**: R2.1-R2.2

**IT-09** — exit code 行為
- **目標**: 成功命令 exit 0, 失敗命令 exit 1
- **Oracle**: `run(['filter-logs', 'nonexistent.log'], ctx)` → exit 1; `run(['filter-logs', 'valid.log'], ctx)` → exit 0
- **需求**: R3.4

**IT-10** — handler 異常處理
- **目標**: handler 拋出未捕獲異常 → tool-registry 捕獲
- **Oracle**: exit 1, CLI 不崩潰 (process 仍存活)
- **需求**: Error case

**IT-11** — yargs 未知選項
- **目標**: `run(['filter-logs', '--unknown-flag'], ctx)` → 錯誤
- **Oracle**: exit ≠ 0, stderr 包含未知參數提示
- **需求**: Error case

### Regression Tests

**REG-03** — 工具 `--help` 輸出 Golden 比對 (每個工具)
- **目標**: 每個工具的 `apltk <tool> --help` 輸出與重構前一致
- **Oracle**: snapshot 比對（共 20 個 snapshot）
- **需求**: R2.4, R3.3

**REG-04** — 命令名稱列表
- **目標**: `apltk tools` 列出的工具名稱與現有一致
- **Oracle**: 命令名稱集合完全相同
- **需求**: R3.1

**REG-05** — 參數格式
- **目標**: 每個工具接受的參數名稱、型別、別名與現有一致
- **Oracle**: 參數矩陣比對（從現有 TOOL_COMMANDS 和 parseArgs 邏輯提取）
- **需求**: R3.2

**REG-06** — stdout/stderr 輸出格式
- **目標**: 每個工具的成功/失敗輸出格式不變
- **Oracle**: 關鍵輸出行的文字比對
- **需求**: R3.3

**REG-07** — 現有測試通過
- **目標**: `npm test` 所有現有測試通過
- **Oracle**: exit 0, 無失敗案例
- **需求**: R3.6

**REG-08** — 錯誤訊息一致性
- **目標**: 無效時間戳 → 錯誤訊息與現有一致
- **Oracle**: `filter-logs --start "invalid"` → stderr 包含 `Error: invalid timestamp`
- **需求**: Error case

---

## Execution Summary

| 測試類型 | 狀態 |
|---|---|
| Unit | 5 test cases (UT-10 ~ UT-14) |
| Regression | 6 test cases (REG-03 ~ REG-08) |
| Property-based | N/A (重構不改變業務邏輯) |
| Integration | 4 test cases (IT-08 ~ IT-11) |
| E2E | N/A (Integration 取代 E2E — CLI 為進程內工具) |
| Mock scenarios | GitHub API 工具使用 fake gh CLI 輸出 |
| Adversarial | N/A |
