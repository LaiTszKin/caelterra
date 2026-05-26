# Tasks: CLI 掃描與驗證增強 (O2+O3)

- Date: 2026-05-26
- Feature: CLI 掃描與驗證增強 (O2+O3)

## **Task 1: 重構 `schema.validate()` 回傳格式**

Purpose: 將 `validate()` 回傳從 `string[]` 改為結構化物件，為 fix command 做準備
Requirements: R4.1, R4.2, R4.3
Scope: `init-project-html/lib/atlas/schema.js` — 修改 `validate()` 及所有內部錯誤推入邏輯
Out of scope: 不修改 `emptyState()` 和 enum 定義

- T1.1 [ ] **`schema.js:validate()`** — 將回傳值從 `string[]` 改為 `{ valid: boolean, errors: [{ message: string, fixCommand: string | null }] }`。內部將所有 `errors.push("...")` 改為 `errors.push({ message: "...", fixCommand: null })`
  - Verify: `node -e "const s = require('./init-project-html/lib/atlas/schema'); const r = s.validate(s.emptyState()); console.assert(r.valid === true); console.assert(Array.isArray(r.errors));"` 無錯誤

- T1.2 [ ] **`schema.js:requireField()`** — 更新輔助函數接受 errors 陣列，推入 `{ message, fixCommand: null }` 格式
  - Verify: 所有呼叫點型別一致

## **Task 2: 為每個 validation error 產生 fix command**

Purpose: 根據錯誤類型和上下文生成精確的 `apltk architecture ...` 修復命令
Requirements: R3.1, R3.2, R3.3
Scope: `init-project-html/lib/atlas/schema.js`
Out of scope: 不改變驗證邏輯本身（只增加 fixCommand）

- T2.1 [ ] **`schema.js` — unknown function 錯誤** — dataflow step 引用未宣告的 function 時，`fixCommand` 為 `apltk architecture function add --feature <featureSlug> --submodule <subSlug> --name <fnName>`
  - Verify: validate 輸出包含正確的 fix command

- T2.2 [ ] **`schema.js` — unknown variable 錯誤** — dataflow step 引用未宣告的 variable 時，`fixCommand` 為 `apltk architecture variable add --feature <featureSlug> --submodule <subSlug> --name <varName>`
  - Verify: validate 輸出包含正確的 fix command

- T2.3 [ ] **`schema.js` — 枚舉值錯誤** — kind/side/scope 值不在合法枚舉中時，`fixCommand` 為 `apltk architecture <entity> set --feature <slug> --submodule <slug> --<field> <validValue>`（建議第一個合法值）
  - Verify: validate 輸出包含正確的 fix command

- T2.4 [ ] **`schema.js` — 其他無法自動修復的錯誤** — duplicate slug、missing required field 等，`fixCommand` 為 `null`；錯誤訊息標記 `(no automatic fix)`
  - Verify: validate 輸出顯示 `(no automatic fix)` 標記

## **Task 3: 更新 `verbValidate` CLI 輸出**

Purpose: 適配新回傳格式，保持人類可讀輸出
Requirements: R3.3, R4.3
Scope: `init-project-html/lib/atlas/cli.js` — 修改 `verbValidate()`
Out of scope: 不修改 validate 的 stderr/stdout 約定

- T3.1 [ ] **`cli.js:verbValidate()`** — 更新邏輯：檢查 `result.valid`、遍歷 `result.errors`、每行輸出 `message` 並在下一行輸出縮排的 `→ fix: <fixCommand>`（若 fixCommand 非 null）
  - Verify: `apltk architecture validate` 在有錯誤的 atlas 上每行錯誤後緊跟 fix command

## **Task 4: 在 cli.js 新增 `scan` verb**

Purpose: 實作 `apltk architecture scan [--src <dir>]` 命令
Requirements: R1.1, R1.2, R1.3, R2.1, R2.2, R2.3
Scope: `init-project-html/lib/atlas/cli.js` — 新增 `verbScan()` 函數、更新 `dispatch()` switch、更新 help
Out of scope: 不讀取檔案內容

- T4.1 [ ] **`cli.js:verbScan(flags, projectRoot, io)`** — 新增函數：決定掃描目錄（`--src` flag 或預設 `src/`）、`fs.readdirSync` 讀取、過濾非原始碼目錄、為每個目錄產生 kebab-case suggestion、輸出 JSON 陣列
  - Verify: `apltk architecture scan --src lib/` 輸出 lib/ 下的目錄 JSON 陣列

- T4.2 [ ] **`cli.js:dispatch()`** — 在 switch 中新增 `case 'scan'`，路由到 `verbScan`
  - Verify: `apltk architecture scan --help` 顯示 scan 的幫助文本

- T4.3 [ ] **`cli.js:buildArchitectureHelpPage('scan')`** — 新增 scan verb 的 help page
  - Verify: `apltk architecture scan --help` 輸出包含 `--src` flag 說明

## **Task 5: 更新現有的 validate 呼叫點**

Purpose: 確保所有呼叫 `schema.validate()` 的地方適配新回傳格式
Requirements: R4.3
Scope: `init-project-html/lib/atlas/cli.js` 及其他可能的呼叫點
Out of scope: 不改變呼叫點的業務邏輯

- T5.1 [ ] **`cli.js` 全域搜尋 `schema.validate(`** — 確認所有呼叫點適配新格式（`result.valid` + `result.errors`）
  - Verify: grep 確認無遺漏的舊格式使用；`npm test` 全部通過
