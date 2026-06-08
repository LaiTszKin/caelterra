# Design: 簡化 apltk architecture 指令

- **Date**: 2026-06-07
- **Feature**: 優化 apltk architecture 指令
- **Source SPEC**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`

> **Purpose:** 定義簡化 `apltk architecture` CLI surface 的技術設計 — 僅改 CLI 調度層，不動底層狀態管理、渲染、diff 比對、merge 邏輯。

---

## 1. Research Summary

### 1.1 Technical Feasibility

| Requirement | Feasibility | Risk |
|---|---|---|
| Req 1: Unified `add` — 單一 entity | ✅ Feasible — 現有 `verbFeature`/`verbSubmodule`/`verbEdge` 可直接被 wrap | None |
| Req 2: Unified `add` — Batch 模式 | ✅ Feasible — iterate + suppress auto-render per entity, 最後一次 render | 非完全原子性（見 §7 取捨） |
| Req 3: Unified `remove` | ✅ Feasible — 與 add 相同 pattern，呼叫現有 verb 的 remove action | None |
| Req 4: 退役 legacy 指令 | ✅ Feasible — 從 TS handler 移除 route；從 cli.js help 隱藏 fine-grained 動詞 | None |
| Req 5: 既有指令相容性 | ✅ Feasible — `diff`/`merge`/`render`/`open` 不需要任何修改 | None |

**Overall assessment**: All feasible — 所有變更都在 CLI dispatch layer 內完成，底層 YAML 狀態、diff 演算法、render 範本、merge 邏輯完全不受影響。

### 1.2 Existing Reference Implementations

無相關外部參考 — 本設計為專案內部的 CLI 整理重構，不引入新架構模式或外部依賴。

### 1.3 Tech Stack Compatibility

無新依賴加入，stack 維持不變：
- Node.js (built-in modules: `fs`, `path`, `child_process`)
- `js-yaml` (既存 YAML 解析)
- 與現有 `apltk` CLI 框架完全相容

---

## 2. Architecture Overview

### 2.1 Module List

| Module Key | Responsibility | Owned Artifacts |
|---|---|---|
| `cli.js` (JS CLI dispatch) | 解析 verb 並 dispatch 到對應的 handler 函數 | `dispatch()`, `add`/`remove` verb functions |
| `index.ts` (TS handler) | 路由 `add`/`remove`，處理剩餘 verb delegation | `architectureHandler()`, `tool` registration |
| `state.js` | YAML 狀態讀寫（不修改） | load / save / merge / diff |
| `render.js` | HTML 渲染（不修改） | render / diff viewer |
| `schema.js` | 類型定義與驗證（不修改） | Feature / Submodule / Edge types |

### 2.2 Boundaries

- **Entry points**: CLI (`apltk architecture`)
- **Trust boundary**: None — 單機開發者工具，無跨程序邊界
- **External → Internal**: User/AI agent → `architectureHandler` (TS) → `cli.dispatch()` (JS) → verb functions → `state.js` (YAML I/O)

### 2.3 Target vs Baseline

| | Baseline (current) | Target (after change) |
|---|---|---|
| CLI verbs | 20 verbs (含 `apply`/`template`/`feature`/`submodule`/etc.) | 6 core verbs: `add`/`remove`/`diff`/`merge`/`render`/`open`, plus retained support verbs: `validate`/`status`/`scan`/`undo` |
| TS handler | intercepts `apply`, `template` | 不再 intercept 任何 verb（全數 delegate 到 cli.js） |
| Help text | 列出所有 fine-grained 動詞 | 列出 6 個核心指令與保留的支援指令（`validate`/`status`/`scan`/`undo`），fine-grained 動詞隱藏 |
| Fine-grained verbs | 正常暴露給使用者 | 保留但隱藏（不阻斷，僅從 help 移除） |

The `add` verb supports module relation flags `--implements`, `--deployed-on`, `--depends-on`, and `--data-flow-to` for capturing cross-entity relationships.

---

## 3. Interaction Design

### 3.1 Interaction Anchors (`INT-###`)

| ID | Intent | Caller → Callee | Coupling Type | Information Crossing | Failure Propagation |
|---|---|---|---|---|---|
| `INT-001` | `add` 單一 entity 路由 | `verbAdd()` → `verbFeature()` / `verbSubmodule()` / `verbEdge()` | sync call | entity type, name, relation flags (`--implements`, `--deployed-on`, `--depends-on`, `--data-flow-to`) | 子 verb 拋錯 → `verbAdd()` 中斷回報 |
| `INT-002` | `add` batch 多 entity 路由 | `verbAdd()` → multiple calls to `performMutation()` | sync loop, sequential | entity specs, suppress auto-render flag | 任一 entity 失敗 → 回報錯誤（已成功的部分已寫入） |
| `INT-003` | `remove` entity | `verbRemove()` → `verbFeature('remove')` / `verbSubmodule('remove')` / `*Edge` | sync call | entity type, name | 子 verb 拋錯 → 中斷回報 |
| `INT-004` | Legacy verb 退役 | `architectureHandler()` → `cli.dispatch()` (passthrough only) | route removal | N/A | 不再有 `apply`/`template` route |
| `INT-005` | 隱藏 fine-grained 動詞 | `cli-help.js` → `dispatch()` help output | text filtering | 不再顯示 `feature`/`submodule`/`function`/etc. | N/A |

### 3.2 Ordering / Concurrency Constraints

None — 所有 mutation 都是單機檔案操作，由 calling 順序決定。無平行寫入需求。

### 3.3 Requirement Links

- **Req 1 cluster**: `INT-001` (single entity add)
- **Req 2 cluster**: `INT-002` (batch add)
- **Req 3 cluster**: `INT-003` (remove)
- **Req 4 cluster**: `INT-004` (legacy verb removal), `INT-005` (hide fine-grained verbs)

---

## 4. External Dependencies

None — stdlib only, 全為 in-process 呼叫。

---

## 5. Data Persistence

| Resource | Typical Readers / Writers | Consistency Expectation |
|---|---|---|
| `resources/project-architecture/atlas/` | `verbAdd()`/`verbRemove()` → `verbFeature()`/etc. → `performMutation()` → `state.save()` | Read-after-write consistency (by `performMutation` flow) |
| `<spec_dir>/architecture_diff/atlas/` | `verbAdd()`/`verbRemove()` with `--spec` flag | Same as above, isolated per spec directory |

底層儲存格式 (YAML) 不變，檔案路徑結構不變。

---

## 6. System Invariants

| Invariant | How Architecture Could Violate It | Symptoms of Violation |
|---|---|---|
| YAML 檔案格式必須與 schema.js 定義一致 | 若 `verbAdd()` 傳遞錯誤的結構給 `performMutation()` | `schema.validate()` 在 render/validate 時拋錯 |
| Atlas index 的 feature list order 必須反映 feature 新增順序 | 若 batch add 不依序處理 | 架構圖 feature 順序錯亂 |
| `--spec` 模式的所有變更必須限於 spec directory | 若 `verbAdd()` 沒有正確傳遞 `--spec` flag 到子 verb | 變更污染 baseline |

---

## 7. Technical Trade-offs

| Decision | Rejected Alternatives | Lock-in Effect |
|---|---|---|
| `add`/`remove` verb 在 cli.js 中以 JS 實作，而非在 index.ts 以 TS 實作 | 在 TS 層實作可以獲得 type safety，但會破壞現有 delegate 架構，且需要重複現有 verb 的驗證邏輯 | `add`/`remove` 依賴現有 verb 函數的簽名一致；若未來這些 verb 簽名改變需同步更新 |
| Batch 模式採 sequential apply with suppressed auto-render，並實作 rollback 機制 | 使用 `apply` 的 atomic batch 邏輯需要暴露內部實作；建立完整 transaction 系統需要修改 `state.js`（out of scope）。狀態檔案 rollback 被選為實用折衷方案 | Batch 目前已實作 rollback：若中間 entity 失敗，系統自動還原狀態/overlay 檔案到 batch 開始前，確保不產生部分變更 |
| Fine-grained verbs 保留但隱藏，而非刪除 | 刪除會破壞依賴這些內部動詞的現有腳本/測試 | 無 — 這些動詞本來就不應該被外部直接使用 |
| Help text 採用白名單制，只列出 6 個指令 | 黑名單制（標記哪些要隱藏）需要維護隱藏清單 | 白名單較簡單 — `buildArchitectureHelpPage()` 只渲染公開 verb |

### Batch 原子性保障 (自 Round 3 實作)

Batch 操作目前具備完整的 rollback 機制（已在 cli.js L940-963, L1019-1027 實作）。當任一 entity 在處理過程中拋出錯誤時，系統會將狀態/overlay 檔案還原到 batch 開始前的內容，確保不會產生部分變更。注意事項：

- Rollback 還原的是 YAML 狀態檔案，不包含歷史記錄（`appendHistory` 中的條目在 rollback 後可能殘留）。
- 此機制與 spec 模式下的 overlay rollback 行為一致（spec 模式和 base 模式都支援 rollback）。
- 如果有強原子性需求（包括被 rollback 的 entity 不留下任何蹤跡），使用 spec 模式 + `diff` + `merge` 流程，它在更嚴格的語意下運作。

---

## 8. Design-Time Refactoring

Code health findings identified during architecture survey, classified by module boundary scope.

| Finding | Affected Module | Tier (T1/T2/T3) | Disposition | Test Evidence |
|---|---|---|---|---|
| `cli.js` 為 1214 行的 God Module，包含 19+ 個獨立 verb 實作 | `cli.js` | T3 | Deferred — 本次範圍僅為 CLI surface 簡化，不重構內部結構。T3 重構（拆分 verb 到獨立檔案）應作為獨立任務規劃 | 既有整合測試覆蓋主要 verb |
| `index.ts` 的 `handleApply()` (329行) 與 `cli.js` 的 verb 函數有重複邏輯 | `index.ts` | T2 | Scheduled — 本次移除 `apply`/`template` route 後，`handleApply()` 函數仍需保留作為內部 utility（供 `add` batch 模式參考），但應在未來獨立任務中統一 | `index.test.ts` 現有三大測試案例 |

---

## 9. References

- **Designed code file paths**:
  - `skills/init-project-html/lib/atlas/cli.js` — 新增 `add`/`remove` verb 函數，更新 dispatch switch，更新 help 輸出
  - `packages/tools/architecture/index.ts` — 移除 `apply`/`template` route intercept
  - `packages/tools/architecture/index.test.ts` — 更新測試反映 route 移除
  - `test/atlas-cli.test.js` — 新增 add/remove 整合測試
  - `test/architecture-script.test.js` — 更新 help text 斷言
- **Project context files**:
  - `CLAUDE.md`
  - `packages/cli/help-text-builder.ts`
  - `resources/project-architecture/**` (if available)
- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
  - `docs/plans/2026-06-07/architecture-simplify/PROPOSAL.md`
