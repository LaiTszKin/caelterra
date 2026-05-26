# Spec: CLI 掃描與驗證增強 (O2+O3)

- Date: 2026-05-26
- Feature: CLI 掃描與驗證增強 (O2+O3)
- Owner: [To be filled]

## Goal

為 `apltk architecture` CLI 新增兩個輔助 AI agent 準確建模的能力：`scan` verb 掃描專案目錄結構並提出 feature 候選清單；`validate` 增強為每個錯誤附帶對應的修復 CLI 命令。

## Scope

### In Scope
- `apltk architecture scan [--src <dir>]` — 掃描目錄結構，輸出 JSON feature 候選清單
- `scan` 僅掃描一層深度，自動過濾 `node_modules`、`.git`、`dist`、`__tests__` 等目錄
- `validate` 每個錯誤字串後附加對應的 `apltk architecture ...` 修復命令
- `schema.validate()` 回傳格式從 `string[]` 改為 `{ valid: boolean, errors: [{ message: string, fixCommand: string | null }] }`
- 向後相容：`verbValidate` CLI 輸出不變（人類可讀格式，錯誤 + fix command 各一行）

### Out of Scope
- `scan` 不讀取檔案內容（僅目錄結構）
- `scan` 不自動建立 feature（需 agent 自行呼叫 mutation verb）
- 不修改 mutation verb 的行為
- 不引入新 runtime 依賴

## Functional Behaviors (BDD)

### Requirement 1: `scan` 掃描目錄結構
**GIVEN** 一個包含 `src/`、`lib/`、`app/` 等常見原始碼目錄的 repo
**WHEN** 使用者執行 `apltk architecture scan --src src/`
**THEN** 輸出 JSON 陣列，每個元素包含 `name`（目錄名）、`path`（相對路徑）、`suggestion`（建議的 feature slug）
**AND** 僅掃描一層深度（不遞迴）
**AND** 自動跳過 `node_modules`、`.git`、`dist`、`__tests__`、`coverage`、`.turbo`、`build` 等非原始碼目錄

**Uncertainty Level**: Known

**Requirements**:
- [ ] R1.1 `scan --src <dir>` 輸出一層目錄結構的 JSON 陣列
- [ ] R1.2 自動過濾常見非原始碼目錄
- [ ] R1.3 若 `--src` 未指定，預設掃描 `src/`（若存在）否則掃描專案根目錄

### Requirement 2: `scan` 輸出格式
**GIVEN** 任意目錄結構
**WHEN** 執行 `apltk architecture scan`
**THEN** stdout 輸出合法 JSON 陣列：`[{ "name": "...", "path": "...", "suggestion": "..." }]`
**AND** `suggestion` 為 kebab-case 的 feature slug 建議
**AND** 僅輸出 JSON（無其他文字）

**Uncertainty Level**: Known

**Requirements**:
- [ ] R2.1 JSON 輸出為合法陣列
- [ ] R2.2 每個項目的 `suggestion` 符合 kebab-case slug 格式
- [ ] R2.3 輸出僅為 JSON 陣列文字

### Requirement 3: `validate` 附帶修復命令
**GIVEN** atlas 包含一個 dataflow step 引用不存在的 function `handlePost`
**WHEN** 使用者執行 `apltk architecture validate`
**THEN** 錯誤輸出每行包含原始錯誤描述及對應的 fix command：
  `features[register].submodules[0].dataflow[0]: "fn" references unknown function "handlePost"`
  `  → fix: apltk architecture function add --feature register --submodule api --name handlePost`
**AND** 無法自動建議修復的錯誤（如 duplicate slug）標記 `(no automatic fix)`

**Uncertainty Level**: Known

**Requirements**:
- [ ] R3.1 每個 validation error 附帶一個 `apltk architecture ...` fix command
- [ ] R3.2 fix command 的 flag 名稱和值正確對應到錯誤上下文
- [ ] R3.3 無法自動修復的錯誤標記 `(no automatic fix)`

### Requirement 4: `schema.validate()` 新回傳格式
**GIVEN** 任意 atlas state
**WHEN** 呼叫 `schema.validate(state)`
**THEN** 回傳 `{ valid: boolean, errors: [{ message: string, fixCommand: string | null }] }`
**AND** 既有的 `verbValidate` 從新格式提取人類可讀輸出，格式不變

**Uncertainty Level**: Known

**Requirements**:
- [ ] R4.1 `validate()` 回傳結構化物件而非 `string[]`
- [ ] R4.2 `fixCommand` 為完整的 `apltk architecture ...` 字串或 `null`
- [ ] R4.3 現有的 `verbValidate` CLI 輸出格式保持不變（`atlas: OK` 或逐行錯誤）

## Error and Edge Cases
- [ ] `scan` 在目錄不存在時回報錯誤（stderr），不輸出空 JSON
- [ ] `scan` 在空目錄時輸出空陣列 `[]`
- [ ] `validate` 在完全正確的 atlas 上輸出 `atlas: OK`（不變）
- [ ] `validate` 在 spec 模式下正確使用 overlay state 產生 fix command（參數對應 overlay）
- [ ] `validate` 回傳格式變更不影響 `performMutation` 中可能存在的 silent validation

## Clarification Questions
None — 需求已在前期研究中確認完畢。

## References
- Official docs: 無外部依賴
- Related code files:
  - `init-project-html/lib/atlas/cli.js` — `verbValidate()` (line 1510)、`dispatch()` (line 2091)
  - `init-project-html/lib/atlas/schema.js` — `validate()` (line 251)、所有 `requireField()` 呼叫點
  - `lib/tools/architecture.ts` — CLI entry point 路由 (line 4)
