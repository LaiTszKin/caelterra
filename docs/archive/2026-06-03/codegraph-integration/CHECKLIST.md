# Checklist: CodeGraph 嵌入 CLI

- **Date**: 2026-06-03
- **Feature**: codegraph-integration
- **Source SPEC**:
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-lifecycle/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-discovery/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-validation/SPEC.md`

> **Purpose:** Verification strategy — defines how to confirm that the implementation satisfies the SPEC.md business requirements.

---

## Behavior-to-Test Checklist

### Lifecycle Spec

| ID | Observable Behavior | SPEC Req | Corresponding Test | Result |
|---|---|---|---|---|
| LC-01 | `apltk codegraph init` 在未初始化的專案建立 `.codegraph/` | Req L1 | `cg-init.test.ts` — 在 temp dir 執行 init，驗證目錄存在 | `[ ]` |
| LC-02 | `apltk codegraph init` 在已初始化的專案顯示錯誤 | Req L1 | `cg-init.test.ts` — 重複 init，驗證錯誤訊息 | `[ ]` |
| LC-03 | `apltk codegraph init --index` 初始化後顯示索引進度與摘要 | Req L2 | `cg-init-index.test.ts` — 在含原始碼的專案執行 init --index | `[ ]` |
| LC-04 | `apltk codegraph sync` 增量更新索引 | Req L3 | `cg-sync.test.ts` — init → 新增檔案 → sync，驗證索引更新 | `[ ]` |
| LC-05 | `apltk codegraph status` 顯示統計資料 | Req L4 | `cg-status.test.ts` — init --index 後執行 status，驗證輸出含 files/nodes/edges | `[ ]` |
| LC-06 | `apltk codegraph search` 回傳匹配符號 | Req L4 | `cg-search.test.ts` — 索引已知符號後搜尋，驗證回傳名稱 + 路徑 + 行號 | `[ ]` |
| LC-07 | `apltk codegraph search --json` 以 JSON 輸出 | Req L4 | `cg-search-json.test.ts` — 驗證輸出為可解析的 JSON | `[ ]` |
| LC-08 | 未初始化時執行 sync/status/search 顯示錯誤 | 邊界 | `cg-not-inited.test.ts` — 驗證錯誤提示包含 init 指引 | `[ ]` |
| LC-09 | 索引進度顯示即時回饋 | 邊界 | `cg-progress.test.ts` — 在大型專案執行 init --index，驗證 stdout 含進度數字 | `[ ]` |

### Discovery Spec

| ID | Observable Behavior | SPEC Req | Corresponding Test | Result |
|---|---|---|---|---|
| DI-01 | `apltk codegraph explore <query>` 回傳匹配符號原始碼 + 關係 | Req D1 | `cg-explore.test.ts` — 索引已知專案後 explore，驗證輸出含原始碼區塊與呼叫關係 | `[ ]` |
| DI-02 | `apltk codegraph explore --json` 以 JSON 輸出 | Req D1 | `cg-explore-json.test.ts` — 驗證 JSON 格式含 source、callers、callees | `[ ]` |
| DI-03 | `apltk codegraph survey [dir]` 回傳結構調查報告 | Req D2 | `cg-survey.test.ts` — 對已知結構的目錄執行 survey，驗證 suggestedSubmodules + suggestedEdges | `[ ]` |
| DI-04 | survey 的 submodule 分組合併呼叫密集的函式 | Req D2 | `cg-survey-grouping.test.ts` — 在一個多函式檔案中，驗證互相呼叫的函式被分到同一 submodule | `[ ]` |
| DI-05 | `apltk codegraph list-apis <feature>` 回傳公開 API 目錄 | Req D3 | `cg-list-apis.test.ts` — 對已知 feature 目錄執行 list-apis，驗證輸出含函式名+參數 | `[ ]` |
| DI-06 | `apltk codegraph list-apis --all` 回傳所有 API | Req D3 | `cg-list-apis-all.test.ts` — 驗證輸出包含系統中所有公開符號 | `[ ]` |
| DI-07 | survey 指定不存在的目錄顯示錯誤 | 邊界 | `cg-survey-not-found.test.ts` — 驗證錯誤訊息 | `[ ]` |
| DI-08 | explore 搜尋無結果時回傳空結果 | 邊界 | `cg-explore-empty.test.ts` — 驗證不報錯，回傳空清單 | `[ ]` |

### Validation Spec

| ID | Observable Behavior | SPEC Req | Corresponding Test | Result |
|---|---|---|---|---|
| VA-01 | `apltk codegraph verify --spec <dir>` 驗證通過時 exit 0 | Req V1 | `cg-verify-pass.test.ts` — 建立正確的 overlay，驗證 exit 0 + 通過項數量 | `[ ]` |
| VA-02 | verify 捕獲不存在的符號時 exit 1 | Req V1 | `cg-verify-fail.test.ts` — overlay 含不存在的 function，驗證 exit 1 + symbol_not_found | `[ ]` |
| VA-03 | verify 跳過新功能符號（action: add） | Req V1 | `cg-verify-skip-new.test.ts` — overlay 含新 feature，驗證跳過檢查 | `[ ]` |
| VA-04 | `apltk architecture apply <yaml>` 批量處理新增 | Req V2 | `cg-apply-add.test.ts` — YAML 含 1 feature + 2 submodules + 3 edges，驗證一次寫入成功 | `[ ]` |
| VA-05 | `architecture apply` 批量處理移除 | Req V2 | `cg-apply-remove.test.ts` — YAML 含 remove action，驗證級聯移除 | `[ ]` |
| VA-06 | `architecture apply` 中途失敗時還原 | Req V2 | `cg-apply-rollback.test.ts` — 注入格式錯誤，驗證 undo snapshot 還原 | `[ ]` |
| VA-07 | `architecture template --spec <dir>` 生成骨架 | Req V3 | `cg-template.test.ts` — 對有 SPEC.md 的目錄執行，驗證產生 proposal.yaml | `[ ]` |
| VA-08 | template 在 SPEC.md 不存在時退到空白骨架 | Req V3 | `cg-template-empty.test.ts` — 指定不存在路徑，驗證產生最小骨架 | `[ ]` |

### Node.js 升級

| ID | Observable Behavior | Corresponding Test | Result |
|---|---|---|---|
| NJ-01 | `package.json` engines.node 為 >=22.5.0 | `package.json` 檢查 | `[ ]` |
| NJ-02 | `import CodeGraph from '@colbymchenry/codegraph'` 在 Node 22.5+ 正常載入 | `cg-import.test.ts` — 只需驗證 import 不拋錯 | `[ ]` |

---

## Hardening Checklist

- [x] **回歸測試**：既有 `packages/tools/architecture/` 的工具行為不受影響。`apply` 復用 state.js，不修改既有 mutation 邏輯。
- [x] **單元測試 drift checks**：survey 的 grouper 演算法需要獨立的單元測試，確保分組行為可預測。
- [ ] **Property-based coverage**：不適用——此專案為 CLI 工具，無需要 property-based test 的複雜業務邏輯。
- [x] **外部服務 mocked/faked**：`@colbymchenry/codegraph` 是本地套件，不需 mock。測試中使用 temp dir 建立真實索引。
- [x] **濫用場景**：已涵蓋——重複 init、不存在的目錄、不存在的符號、格式錯誤的 YAML。
- [ ] **授權/並發風險**：不適用——CLI 工具無多用戶授權問題。並發風險（同時索引）由 CodeGraph 內部 file lock 處理。
- [x] **Assertions 驗證 side-effects**：`verify` 測試驗證 exit code + JSON 輸出內容；`apply` 測試驗證 YAML 檔案實際被寫入。
- [x] **Fixture 可複現**：測試使用 temp dir（`fs.mkdtempSync`）搭配已知的測試檔案，確保每次執行結果一致。

---

## E2E / Integration Decisions

| Flow / Risk | Test Level | Rationale |
|---|---|---|
| `codegraph init → sync → status` 完整流程 | Integration | 需要真實檔案系統和 CodeGraph 索引，單元測試無法覆蓋 |
| `codegraph explore` 符號查詢 | Integration | 需要真實 CodeGraph 索引來驗證回傳內容正確性 |
| `codegraph survey` 分組演算法 | **Unit test** + Integration | 分組邏輯可獨立單元測試；整體驗證需 integration |
| `architecture apply → verify` 完整流程 | Integration | apply 修改檔案後 verify 讀取，需真實 YAML 互動 |
| `architecture template` SPEC.md 解析 | Integration | 依賴目錄與檔案結構 |
| Node.js 版本相容性 | CI matrix | 在不同 Node 版本（22.5, 24.x, 25.x）驗證 import 與基本功能 |
