# Spec: 簡化 apltk architecture 指令

- **Date**: 2026-06-07
- **Feature**: 優化 apltk architecture 指令

## Goal

降低 `apltk architecture` CLI 對 AI agent 的認知負荷，將現有 19+ 個子指令/子動詞簡化為 6 個直覺指令（add / remove / diff / merge / render / open），讓 agent 無需查閱文件就能正確操作架構圖工具。

## Scope

### In Scope

- 新增統一 `add` 指令，支援依 entity type 新增 feature、module、relation，並以 flags 表達五種位置關係（--part-of / --depends-on / --data-flow-to / --implements / --deployed-on）
- 新增統一 `remove` 指令，支援依 entity type 移除 feature、module、relation
- `add`/`remove` 支援一次操作單一 entity 與 batch 多 entity
- `add`/`remove` 支援 `--spec` flag 切換 spec 模式（寫入 `<spec_dir>/architecture_diff/`）
- 退役 `apply`、`template` 指令（不再暴露給 agent 使用）
- 退役/隱藏 fine-grained entity 子指令（feature / submodule / function / variable / dataflow / error / edge / meta / actor），agent 不應再直接呼叫
- `diff` / `merge` / `render` / `open` 保留既有行為，與新的 add/remove 資料格式相容

### Out of Scope

- **不修改底層 YAML 格式**、狀態管理邏輯、diff 比對演算法、render 範本、merge 合併邏輯 — 僅改 CLI 調度層
- 不修改 `validate` / `status` / `scan` / `undo` / `help` 的實作行為（可保留或隱藏，但不屬本次改造目標）
- 不新增加 `init` 指令（提案中提及，但實際不存在）
- 不引入循環依賴檢測、跨 repo 架構聚合、TUI、非 HTML 匯出

## Functional Behaviors (BDD)

### Requirement 1: Unified `add` 指令 — 單一 entity 模式

**GIVEN** 一個已初始化 architecture 狀態的專案（存在 `resources/project-architecture/atlas/`）
**AND** 使用者執行 `apltk architecture add <entity-type> <name> [relation-flags...]`
**WHEN** entity-type 是 `feature`、`module` 或 `relation` 之一
**THEN** 系統根據 entity-type 在對應的 YAML 狀態中新增 entity
**AND** 若包含 `--depends-on`、`--part-of`、`--data-flow-to`、`--implements`、`--deployed-on` 等 relation flags，系統同時建立對應的依賴/包含/資料流/介面/部署關係
**AND** 新增完成後自動觸發 render（除非提供 `--no-render`）
**AND** CLI 輸出成功訊息與變更摘要

**Examples (non-normative)**:

```bash
apltk architecture add feature payment --depends-on order
apltk architecture add module payment-api --part-of payment --depends-on order-service
apltk architecture add relation payment-api --data-flow-to payment-gateway
apltk architecture add module stripe-adapter --part-of payment --implements payment-provider
apltk architecture add module payment-api --deployed-on eks-cluster
```

**Uncertainty Level**: Known Domain

---

### Requirement 2: Unified `add` 指令 — Batch 模式

**GIVEN** 使用者執行 `apltk architecture add` 並在指令中指定多個 entity
**WHEN** 每一個 entity 區塊獨立定義其 entity-type、name 與 relation flags
**THEN** 系統以單一交易（atomic, all-or-nothing）處理所有 entity
**AND** 若任一 entity 驗證失敗，全部 rollback，不產生部分變更
**AND** 成功後自動觸發 render（除非 `--no-render`）

**Examples (non-normative)**:

```bash
apltk architecture add \
  feature payment --depends-on order \
  module payment-api --part-of payment --depends-on order-service \
  module payment-gateway --part-of payment --data-flow-to ledger
```

**Uncertainty Level**: Known Domain

---

### Requirement 3: Unified `remove` 指令

**GIVEN** 一個已有 entity 的 architecture 狀態
**AND** 使用者執行 `apltk architecture remove <entity-type> <name>`
**WHEN** entity-type 對應到一個現有的 entity
**THEN** 系統標記該 entity 為已刪除（soft delete），使其出現在 diff 對比中
**AND** 級聯移除依賴於此 entity 的子關係（如移除 feature 時同時移除其 submodule）
**AND** 若非 `--spec` 模式，直接從主架構 YAML 中移除該 entity
**AND** 成功後自動觸發 render（除非 `--no-render`）

**GIVEN** 使用者執行 `apltk architecture remove <entity-type> <name>` 且該 entity 不存在
**WHEN** 系統查無此 entity
**THEN** 輸出明確錯誤訊息，列出相近的可用名稱，exit code 非零

**Uncertainty Level**: Known Domain

---

### Requirement 4: 退役 legacy 指令

**GIVEN** 使用者或 agent 執行 `apltk architecture apply` 或 `apltk architecture template`
**WHEN** 這兩個指令已被移除
**THEN** CLI 傳回錯誤訊息，提示改用 `apltk architecture add` 替代
**AND** 對應的 TypeScript handler（`packages/tools/architecture/index.ts`）不再路由這兩個指令

**GIVEN** 使用者或 agent 在 CLI dispatch 層嘗試呼叫 `feature add`、`submodule add`、`edge add` 等 fine-grained 動詞
**WHEN** 這些動詞在 CLI help 中被隱藏，但仍可向後相容運作（不強制阻斷）
**THEN** 系統在 help 輸出中不顯示這些動詞，agent 不應自行發現或使用

**Uncertainty Level**: Known Domain

---

### Requirement 5: 既有指令的相容性

**GIVEN** 使用者使用 `add --spec` 在 spec 目錄下產生了架構 diff
**WHEN** 執行 `apltk architecture diff --spec`
**THEN** diff 正確讀取 `add --spec` 產出的 overlay，產出 before/after 對比 HTML
**AND** 結果格式與目前 diff viewer 一致

**GIVEN** 使用者執行 `apltk architecture merge --spec`
**WHEN** spec overlay 格式與目前相同
**THEN** merge 正確將 overlay 合併回主架構

**GIVEN** 使用者執行 `apltk architecture render` 或 `apltk architecture open`
**WHEN** 主架構或 spec overlay 處於合法狀態
**THEN** render 產出完整 HTML，open 在瀏覽器中開啟

**Uncertainty Level**: Known Domain

## Error and Edge Cases

- **Entity 重複新增**: add 一個已存在的 entity，系統提示「已存在」並跳過，不視為錯誤
- **Entity 不存在但嘗試移除**: 系統提示「不存在」並列出相近可用名稱，exit code 非零
- **參照不存在的 parent/module**: 使用 `--part-of` 或 `--depends-on` 參照不存在的 entity，系統拒絕操作，列出該 type 下所有可用名稱
- **缺少關係目標**: 對需要關係定義的 entity-type（如 `module` 需要 `--part-of`），若未提供則提示必填
- **不支援的 entity-type**: 傳入非 `feature`/`module`/`relation` 的 type，系統提示支援的 type 清單
- **Batch 中部分失敗**: 任一個 entity 驗證失敗時，整個 batch rollback，不產生部分狀態變更
- **Spec 模式檔案衝突**: `add --spec` 時對應 overlay 已存在，系統採用 merge 而非覆寫
- **`--spec` 缺少對應 spec 目錄**: 若 `--spec <dir>` 指定的目錄不存在，系統拒絕操作並提示

## Clarification Questions

暫無 — 所有需求均屬 Known Domain，且已透過 PROPOSAL 階段的結構化討論充分釐清。

## References

- **Key code file paths** (affected by this spec):
  - `packages/tools/architecture/index.ts` — TS handler routing（修改 `apply`/`template` 路由，改為 `add`/`remove`）
  - `skills/init-project-html/lib/atlas/cli.js` — JS CLI verb dispatch（新增 `add`/`remove` verb，隱藏 fine-grained 動詞）
  - `packages/tools/architecture/index.test.ts` — 現有單元測試（更新以反映退役指令）
  - `test/atlas-cli.test.js` — 現有 CLI 整合測試（新增 add/remove 測試案例）
  - `test/architecture-script.test.js` — tool registration 與 help text 測試（更新 help 斷言）
  - `packages/cli/tool-registration.ts` — tool 註冊表（不需改動，但需確認 applied/template 的註冊條目）
  - `packages/cli/help-text-builder.ts` — help 文字建構器（更新 architecture 說明）
- **Related project context files**:
  - `docs/plans/2026-06-07/architecture-simplify/PROPOSAL.md`
  - `docs/architecture/cli-architecture.md`
  - `CLAUDE.md`
