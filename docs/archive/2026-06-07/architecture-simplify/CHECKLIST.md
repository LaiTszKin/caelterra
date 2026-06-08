# Checklist: 簡化 apltk architecture 指令

- **Date**: 2026-06-07
- **Feature**: 優化 apltk architecture 指令
- **Source SPEC**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`

> **Purpose:** Verification strategy — defines how to confirm that the implementation satisfies the SPEC.md business requirements.

---

## Behavior-to-Test Checklist

| ID | Observable Behavior | SPEC Requirement | Corresponding Test | Result |
|---|---|---|---|---|
| CL-01 | `apltk architecture add feature <slug> --depends-on <other>` 成功新增 feature 並建立依賴關係 | Req 1 | `test-add-single-feature` | `[ ]` |
| CL-02 | `apltk architecture add module <slug> --part-of <feature> --depends-on <other>` 成功新增 submodule 並建立關係 | Req 1 | `test-add-single-module` | `[ ]` |
| CL-03 | `apltk architecture add relation <A> --data-flow-to <B>` 成功新增 edge | Req 1 | `test-add-relation` | `[ ]` |
| CL-04 | `add` 配合 `--spec` flag 時寫入 spec overlay 而非 baseline | Req 1 | `test-add-spec-mode` | `[ ]` |
| CL-05 | `add` batch 模式一次新增多個 entity 並建立關係 | Req 2 | `test-add-batch` | `[ ]` |
| CL-06 | Batch 模式中，任一 entity 驗證失敗時不 render（不汙染輸出） | Req 2 | `test-add-batch-partial-failure` | `[ ]` |
| CL-07 | `apltk architecture remove feature <slug>` 移除 feature 及其子 entity | Req 3 | `test-remove-feature` | `[ ]` |
| CL-08 | `apltk architecture remove module <slug> --part-of <feature>` 移除 submodule | Req 3 | `test-remove-module` | `[ ]` |
| CL-09 | Remove 不存在的 entity 時回傳非零 exit code 並列出相近名稱 | Req 3 | `test-remove-nonexistent` | `[ ]` |
| CL-10 | `apltk architecture apply` 和 `apltk architecture template` 回傳錯誤訊息 | Req 4 | `test-legacy-apply-rejected`, `test-legacy-template-rejected` | `[ ]` |
| CL-11 | CLI help 僅列出 `add`/`remove`/`diff`/`merge`/`render`/`open`，不列出 fine-grained 動詞 | Req 4 | `test-help-hides-fine-grained` | `[ ]` |
| CL-12 | `add --spec` 產出的 overlay 能被 `diff --spec` 正確讀取 | Req 5 | `test-add-diff-compatibility` | `[ ]` |
| CL-13 | `diff`/`merge`/`render`/`open` 在沒有 architecture 變更時行為不變 | Req 5 | `test-read-commands-regression` | `[ ]` |

---

## Hardening Checklist

- [x] 回歸測試 — 現有 `diff`/`merge`/`render`/`open` 行為不受影響（test-read-commands-regression）
- [ ] 語意驗證 — `add` 的 `--part-of` 參照不存在的 feature 應被拒絕（error 回歸）
- [ ] Edge cases — Entity 重複 add、不存在的 entity remove
- [ ] `--spec` 模式隔離 — 確認 spec overlay 寫入位置正確、不汙染 baseline
- [ ] Batch 行為 — 單一 entity 與 batch mode 的結果一致
- [ ] Help text 完整性 — 6 個主要指令都有適當的 usage 說明
- [ ] 輸出是可驗證的（exit code + 訊息），而非僅 stdout

---

## E2E / Integration Decisions

| Flow / Risk | Test Level | Rationale |
|---|---|---|
| `add`/`remove` 基本 CRUD | Integration | 直接呼叫 apltk CLI，驗證 YAML 檔案系統輸出。比 unit test 更接近真實使用場景 |
| `add --spec` → `diff --spec` → `merge --spec` → `render` 完整流程 | Integration | 跨模組流程需測試 overlay → diff → merge → render 的相容性 |
| Legacy 指令退役 | Unit | 只需確認 TS handler 不再路由 `apply`/`template` |
| Help text 隱藏檢查 | Unit | 單純字串比對，不需檔案系統操作 |
| Error & edge cases | Integration | 使用真實 CLI call，驗證 exit code + stderr 訊息 |

---

## References

- **Designed code file paths**:
  - `skills/init-project-html/lib/atlas/cli.js` — add/remove verb 實作 + dispatch switch 更新 + help 更新
  - `packages/tools/architecture/index.ts` — 移除 apply/template route
  - `packages/tools/architecture/index.test.ts` — legacy route 移除測試
  - `test/atlas-cli.test.js` — add/remove 整合測試
  - `test/architecture-script.test.js` — help text 測試更新
- **Project context files**:
  - `CLAUDE.md`
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
