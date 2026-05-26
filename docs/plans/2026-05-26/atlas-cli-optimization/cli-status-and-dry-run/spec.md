# Spec: CLI 狀態查詢與預覽 (O1+O4)

- Date: 2026-05-26
- Feature: CLI 狀態查詢與預覽 (O1+O4)
- Owner: [To be filled]

## Goal

為 `apltk architecture` CLI 新增兩個非破壞性狀態查詢能力：`status` verb 讓 AI agent 程式化讀取 atlas 摘要；`--dry-run` global flag 讓所有 mutation verb 支援預覽模式，輸出 JSON diff 但不寫入磁碟。

## Scope

### In Scope
- `apltk architecture status` — 人類可讀的 atlas 狀態摘要
- `apltk architecture status --json` — JSON 格式輸出，供 AI 程式化消費
- `apltk architecture status --json --spec <dir>` — 支援 spec overlay 模式
- `--dry-run` global flag 在 `performMutation()` 中的短路邏輯
- 全部 mutation verb（feature/submodule/function/variable/dataflow/error/edge/meta/actor）均支援 `--dry-run`
- `status` 輸出整合 `validate()` 結果

### Out of Scope
- 修改現有 mutation verb 的內部邏輯
- 新增任何 runtime 依賴
- `status` 輸出格式的向後相容保證（此為新增功能）

## Functional Behaviors (BDD)

### Requirement 1: `status` 人類可讀輸出
**GIVEN** 一個已初始化的 atlas
**WHEN** 使用者執行 `apltk architecture status`
**THEN** 輸出包含：features 數量、submodules 總數、edges 總數（cross-feature + intra-feature）、actors 數量、updatedAt 時間戳、validation 結果摘要
**AND** 退出碼為 0

**Uncertainty Level**: Known

**Requirements**:
- [ ] R1.1 `status`（無 flags）輸出易讀的文本摘要，涵蓋所有關鍵統計
- [ ] R1.2 若 validation 失敗，`status` 顯示 error count（不列出全部錯誤）

### Requirement 2: `status --json` 程式化輸出
**GIVEN** 一個已初始化的 atlas
**WHEN** 使用者執行 `apltk architecture status --json`
**THEN** stdout 輸出合法 JSON object，包含 `meta`、`counts`、`featureList`、`validation`
**AND** `counts` 包含 features、submodules、crossFeatureEdges、intraFeatureEdges、actors
**AND** `featureList` 為 `[{ slug, title, submoduleCount }]` 陣列
**AND** `validation` 包含 `{ valid: boolean, errorCount: number, errors: string[] }`
**AND** stdout 僅輸出 JSON（無其他文字）

**Uncertainty Level**: Known

**Requirements**:
- [ ] R2.1 `--json` 輸出合法 JSON 到 stdout
- [ ] R2.2 JSON schema 如上所述
- [ ] R2.3 即使 validation 失敗，退出碼仍為 0（非零保留給 CLI 自身錯誤）

### Requirement 3: `status` 空 atlas
**GIVEN** 尚未初始化的 atlas（無 YAML 檔案）
**WHEN** 使用者執行 `apltk architecture status --json`
**THEN** 返回 counts 全為 0、featureList 為空陣列、validation.valid 為 true 的有效 JSON
**AND** 退出碼為 0

**Uncertainty Level**: Known

**Requirements**:
- [ ] R3.1 空 atlas 不回報錯誤

### Requirement 4: `--dry-run` 預覽 mutation
**GIVEN** 一個已初始化的 atlas
**WHEN** 使用者執行 `apltk architecture feature add --slug test --title "Test" --dry-run`
**THEN** stdout 輸出 JSON 描述即將發生的變更：`action`、`diff: { addedFeatures, modifiedFeatures, removedFeatures }`
**AND** 不寫入任何 YAML 檔案
**AND** 不觸發 HTML 渲染

**Uncertainty Level**: Known

**Requirements**:
- [ ] R4.1 `--dry-run` 寫入 JSON diff 到 stdout
- [ ] R4.2 `--dry-run` 不修改任何 YAML 檔案
- [ ] R4.3 `--dry-run` 不觸發 HTML render（無視 `--no-render`）

### Requirement 5: `--dry-run` + `--spec` 組合
**GIVEN** 一個 spec overlay 目錄
**WHEN** 使用者執行 `apltk architecture submodule add --feature X --slug Y --dry-run --spec <dir>`
**THEN** 預覽基於 resolved state（base + overlay merged）的變更 diff
**AND** 不修改 overlay 檔案

**Uncertainty Level**: Known

**Requirements**:
- [ ] R5.1 `--dry-run --spec <dir>` 正確解析 merged state 並預覽 diff

## Error and Edge Cases
- [ ] `status` 在損壞的 YAML 檔案上應報告 validation errors 而非 crash
- [ ] `--dry-run` 在 remove 不存在的 entity 時應報告錯誤（與實際 mutation 一致）
- [ ] `--dry-run` 在 spec 模式下 overlay 目錄不存在時應回報錯誤
- [ ] `status --json` 確保 stdout 僅包含 JSON（錯誤訊息走 stderr）
- [ ] `--dry-run` 與 `--no-render` 同時使用時不衝突（兩者皆抑制寫入 + 渲染）

## Clarification Questions
None — 需求已在前期研究中確認完畢。

## References
- Official docs: 無外部依賴
- Related code files:
  - `init-project-html/lib/atlas/cli.js` — `performMutation()` (line 1131)、`dispatch()` (line 2091)
  - `init-project-html/lib/atlas/state.js` — `load()` (line 49)、`save()` (line 102)、`mergeOverlay()` (line 219)
  - `init-project-html/lib/atlas/schema.js` — `validate()` (line 251)、`emptyState()` (line 324)
  - `lib/tools/architecture.ts` — CLI entry point 路由 (line 4)
