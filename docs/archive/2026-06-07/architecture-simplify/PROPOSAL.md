# Proposal: 優化 apltk architecture 指令

- **Date**: 2026-06-07
- **Source**: Produced by the `discuss` skill through structured conversation

---

## 1. Scope

### In Scope

- 重新設計 `apltk architecture` 子指令集，從現有的 `diff / merge / apply / template / init` 簡化為 `add / remove / diff / merge / render / open` 六個指令
- 支援「正常模式」（修改 `resources/` 下的主架構圖）與「spec 模式」（透過 `--spec` flag 修改 `<spec_dir>/<batch_dir>/` 下的 architecture diff），兩種模式由同一個指令透過 flag 切換
- `add/remove` 支援一次操作單一 entity，也支援 batch 操作（一次指令同時新增多個 entity 並定義其關係）
- `diff` 以 before vs after 對比 HTML 呈現架構變動，方便維護者審視 agent 提案
- `render` 根據位置關係渲染 HTML 架構圖，輸出到 `docs/architecture.html`
- `merge` 將 spec 模式下的 diff 合併回主架構圖
- `open` 在瀏覽器中開啟目前的架構圖
- 保留五種位置關係：`--part-of`（包含/父子）、`--depends-on`（依賴）、`--data-flow-to`（資料流）、`--implements`（介面/契約）、`--deployed-on`（部署）

### Out of Scope (Explicitly Excluded)

- 不處理多專案聚合 — 只看單一 repo 的架構
- 不支援即時互動式 TUI
- 不支援匯出為 PlantUML、Mermaid、JSON 等其他格式
- `apply`、`template`、`init` 指令不再保留
- 不引入循環依賴檢測等圖論演算法（一致性驗證）
- 不修改底層架構定義檔的儲存格式（可破壞性更新 CLI 介面，但保留檔案格式簡單）

---

## 2. User Scenarios

### Target Users

以人類開發者為主（審視架構變動、開啟架構圖），AI agent 為輔（產生架構 diff、渲染圖表、驗證合法性）。

### Scenario A — Agent 在 Spec 模式下產生架構提案

```
1. Agent 在 spec/develop-payment-flow/batch-1/ 目錄下開發
2. Agent 執行 apltk architecture add --spec 依序定義新 feature 的模組與關係
3. Agent 執行 apltk architecture diff --spec 產出對比 HTML，讓維護者審查
4. 維護者打開 architecture-diff.html，side-by-side 比對 before/after 的變化
5. 維護者確認無誤後，執行 apltk architecture merge --spec 將變更合併回主架構
6. Agent 執行 apltk architecture render 更新主架構圖 HTML
```

#### 具體指令範例

```bash
# Step 2: Agent 定義 payment feature 架構
apltk architecture add feature payment --depends-on order --spec
apltk architecture add module payment-api --part-of payment --depends-on order-service --spec
apltk architecture add module payment-gateway --part-of payment --data-flow-to ledger --spec

# Step 3: 產出對比
apltk architecture diff --spec

# Step 5: 合併回主架構
apltk architecture merge --spec

# Step 6: 重新渲染
apltk architecture render
```

### Scenario B — 開發者初始化專案架構

```
1. 開發者構思整體專案架構
2. 執行 apltk architecture add 定義頂層 feature
3. 為每個 feature 定義其下的 module 及 module 之間的關係
4. 執行 apltk architecture render 產出 HTML 圖表
5. 執行 apltk architecture open 在瀏覽器中打開確認
```

### Scenario C — Batch 新增多個 Entity

```bash
# Agent 一次定義多個 entity 及其關係
apltk architecture add \
  feature payment --depends-on order \
  module payment-api --part-of payment --depends-on order-service \
  module payment-gateway --part-of payment --data-flow-to ledger
```

### Success Criteria

- Agent 能夠僅使用 `add / remove / diff / merge / render / open` 六個指令完成所有架構操作，無需查閱額外文件
- `diff` 產出的對比 HTML 能讓開發者在 30 秒內看懂架構變動的全貌
- 維護者可以在不閱讀任何文檔的情況下，透過 architecture diff 直接審視 agent 的 spec 提案
- `--spec` flag 的行為可預測：所有變更限於 spec 目錄，不污染主架構

### Error Handling

- 參照不存在的 module/feature 名稱 → 明確的錯誤訊息，列出相近的可用名稱
- 缺少必填的位置關係 → 提示需要哪種關係
- 重複新增已存在的 entity → 提示已存在，無操作
- 移除不存在的 entity → 提示不存在，無操作

---

## 3. Constraints

- **Timeline**: 無時限壓力，品質優先
- **Budget**: 無特殊資源限制
- **Region / Language**: CLI 輸出以英文為主，可接受中英文混合
- **Security / Privacy**: 不處理敏感資料或金流，僅為專案內開發工具
- **Backward Compatibility**: 不要求向後相容，CLI 指令可以完全重新設計；但底層架構定義檔格式建議保持簡單，不引入無謂的破壞

---

## 4. Business Value

### Problem Statement

現有 `apltk architecture` 指令（diff / merge / apply / template / init）對 AI agent 來說指令過多、命名不直覺、職責模糊，導致 agent 頻繁混淆且維護者無法有效透過架構圖審視 spec 提案。

### Why Not Keep the Current Design?

現有子指令中，`apply` 和 `template` 的功能邊界與 `diff` / `merge` 重疊，agent 難以判斷何時該用哪一個。簡化為 add / remove / diff / merge / render / open 後，每個指令的名稱直接描述了它的行為，agent 不需要理解額外的領域概念。

---

## 5. Functional Module Design

### Module 1: Entity Management (`add`, `remove`)

- **職責**：新增或刪除架構中的 entities（feature / module / interface / deployment）及其位置關係
- **支援模式**：正常模式（修改主架構）、spec 模式（產生 diff 檔案，透過 `--spec` 切換）
- **支援一次操作一個或多個 entity（batch）**
- **輸出**：無直接輸出，操作成功或錯誤訊息
- **與其他模組的關係**：
  - `add --spec` → 產生 diff 檔案供 `diff` 讀取，供 `merge` 寫入
  - `remove` → 標記 entity 為刪除（soft delete），仍出現在 diff 對比中

### Module 2: Diff & Review (`diff`)

- **職責**：產出架構變更的 before/after 對比 HTML，讓維護者審查
- **輸出**：`docs/architecture-diff.html`
- **與其他模組的關係**：
  - 讀取 `add --spec` 產生的 diff 檔案
  - 讀取 `resources/` 下的主架構定義作為 before 狀態
  - 產出被 `open` 開啟的 HTML 檔案
  - 驗證 diff 的合法性（格式 + 語意層級）

### Module 3: Merge (`merge`)

- **職責**：將 spec 模式下的 diff 合併回主架構圖（`resources/`）
- **與其他模組的關係**：
  - 處理 `add --spec` 產生的 diff 檔案
  - 合併結果被 `render` 渲染進主架構圖

### Module 4: Render (`render`)

- **職責**：依照位置關係（part-of / depends-on / data-flow-to / implements / deployed-on）渲染完整架構圖為 HTML
- **輸出**：`docs/architecture.html`
- **與其他模組的關係**：
  - 讀取 `resources/` 下合併後的完整架構定義
  - 產出被 `open` 開啟的 HTML 檔案

### Module 5: Open (`open`)

- **職責**：在瀏覽器中開啟架構圖 HTML
- **與其他模組的關係**：
  - 開啟 `render` 或 `diff` 產出的 HTML

### Module Relationship Diagram

```
add --spec ──→ (spec_dir/ diff 檔案)
                  │
                  ▼
    diff ─────────┤ (驗證 + 產出 architecture-diff.html)
                  │
                  ▼
   merge ────────→ (寫入 resources/ 主架構)
                  │
                  ▼
   render ───────→ (讀取 resources/, 產出 architecture.html)
                  │
                  ▼
   open ────────── (開啟 architecture.html 或 architecture-diff.html)
```

---

## 6. Open Questions

- `remove` 的 soft delete 方式是否需要在架構圖中以視覺化區別（如灰色淡化）？建議在 diff 階段決定，不在 PROPOSAL 層級處理。
- 無其他未解決問題。
