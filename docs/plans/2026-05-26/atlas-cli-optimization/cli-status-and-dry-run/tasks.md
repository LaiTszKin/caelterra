# Tasks: CLI 狀態查詢與預覽 (O1+O4)

- Date: 2026-05-26
- Feature: CLI 狀態查詢與預覽 (O1+O4)

## **Task 1: 在 state.js 新增 `summarize()` 函數**

Purpose: 提供結構化的 atlas 狀態摘要，供 `status` verb 使用
Requirements: R2.1, R2.2
Scope: `init-project-html/lib/atlas/state.js`
Out of scope: 不修改 save/load/merge 邏輯

- T1.1 [ ] **`state.js:summarize(state)`** — 新增匯出函數，接受 atlas state，回傳 `{ meta, counts: { features, submodules, crossFeatureEdges, intraFeatureEdges, actors }, featureList: [{ slug, title, submoduleCount }] }`
  - Verify: `node -e "const s = require('./init-project-html/lib/atlas/state'); const sum = s.summarize(s.load('/tmp/test-atlas')); console.assert('counts' in sum);"` 無錯誤

## **Task 2: 在 cli.js 新增 `status` verb**

Purpose: 實作 `apltk architecture status [--json]` 命令
Requirements: R1.1, R1.2, R2.1, R2.2, R2.3, R3.1
Scope: `init-project-html/lib/atlas/cli.js` — 新增 `verbStatus()` 函數、更新 `dispatch()` switch、更新 help
Out of scope: 不修改任何 mutation verb

- T2.1 [ ] **`cli.js:verbStatus(flags, projectRoot, io)`** — 新增函數：載入 resolved state、呼叫 `stateLib.summarize()` 取得摘要、呼叫 `schema.validate()` 取得驗證結果。若 `--json` 輸出合併後的 JSON 到 stdout；否則輸出人類可讀文字摘要
  - Verify: `apltk architecture status --json` 輸出合法 JSON；`apltk architecture status` 輸出文字摘要

- T2.2 [ ] **`cli.js:dispatch()`** — 在 switch 中新增 `case 'status'`，路由到 `verbStatus`
  - Verify: `apltk architecture status --help` 顯示 status 的幫助文本

- T2.3 [ ] **`cli.js:buildArchitectureHelpPage('status')`** — 新增 status verb 的 help page
  - Verify: `apltk architecture status --help` 輸出包含 `--json` flag 說明

## **Task 3: 在 cli.js 實作 `--dry-run` global flag**

Purpose: 讓所有 mutation verb 支援預覽模式
Requirements: R4.1, R4.2, R4.3, R5.1
Scope: `init-project-html/lib/atlas/cli.js` — 修改 `performMutation()`、`parseFlags()`
Out of scope: 不修改各 verb 函數的內部邏輯

- T3.1 [ ] **`cli.js:parseFlags()`** — 在 boolean flags set 中新增 `dry-run`
  - Verify: `--dry-run` 被正確解析為 `flags['dry-run'] = true`

- T3.2 [ ] **`cli.js:performMutation()`** — 在函數入口處檢查 `flags['dry-run']`。若為 true，執行 mutate callback 在 cloned state 上計算 diff，輸出 JSON diff 到 stdout，然後 return（不呼叫 save/saveOverlay、不寫入 undo、不觸發 render）
  - Verify: `apltk architecture feature add --slug test --title "Test" --dry-run` 輸出 JSON diff 且不建立 YAML 檔案

- T3.3 [ ] **`cli.js` global flags 文件** — 在 module docstring（line 25-32）新增 `--dry-run` 說明
  - Verify: 程式碼註解正確反映 `--dry-run` 行為

## **Task 4: 更新 architecture.ts 路由**

Purpose: 在 TypeScript entry point 中新增 `status` 和 `scan`（Spec B）的路由識別
Requirements: R1.x, R2.x
Scope: `lib/tools/architecture.ts`
Out of scope: 不修改實際 CLI 邏輯（已在 cli.js 中）

- T4.1 [ ] **`architecture.ts`** — 無需修改（`dispatch()` 自動處理新 verb）。確認現有路由能將 `status` 傳遞至 cli.js
  - Verify: `apltk architecture status --help` 正常輸出
