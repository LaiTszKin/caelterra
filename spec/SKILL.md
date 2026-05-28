---
name: spec
description: 將用戶模糊的複雜需求拆解為有嚴格實作範圍的規格文檔。產出包含 tasks.md、checklist.md、設計方案、架構 diff 與測試策略。形成完整規格包。不用於已有明確實作方案的簡單任務，不用於不需 spec 的單檔案變更。
---

## 目標

將用戶需求轉化為有明確完成條件與實作邊界的 spec。

## 驗收條件

- 已經產出了嚴格遵循模板格式的 spec。
- 為 spec 當中的需求制定了明確的驗收條件及測試策略。
- 完整按照技能流程生成了 architecture diff 供用戶對 spec 變更進行可視化審核。

## 工作流程

### 1. 理解用戶需求並閱讀repo

分析用戶需求。
在 repo 中搜索可能相關的內容。
完成搜索後，深入閱讀相關代碼。
識別變更範圍。
如果外部環境存在 subagents 功能，必須通過並行調度 subagents 來完成深入閱讀 repo 的任務。

### 2. 拆分用戶需求及設計業務架構

將用戶需求拆分為有明確邊界的工程需求。結合現有代碼，設計業務架構。在設計的過程中，你需要考慮包括但不限於以下設計事項：
- 錯誤處理
- 測試策略
- 模塊之間的呼叫、回傳
- 資料流

同時對每個需求標記**不確定性等級**：
- **已知領域**：團隊已有經驗的技術或業務，風險低
- **探索性領域**：團隊不熟悉或依賴外部系統的部分，需在 spec 中標記為高不確定性
- 高不確定性的需求應在 spec 的 Clarification Questions 中反映，必要時建議先做 spike/prototype

若用戶有不清晰的需求且該需求會影響設計方案，記錄並填入 spec。
等待用戶回答。

### 3. 將整個設計方案拆分成可執行任務

將完整設計方案拆分為精確到函式或檔案級別的任務。
確保每個任務可直接執行且無歧義。
以此確保開發者不偏離設計方案。

### 4. 制定驗收條件

使用 `test-case-strategy` 為任務制定基於測試的驗收條件。
確保每個任務完成後能被驗證。
同時為需求制定驗收條件。
確保用戶需求能被測試明確驗收。

### 5. 查找開發文檔

在撰寫 spec 前，使用 `deep-research` 技能查找所需外部依賴的官方文檔或源代碼。
確保後續實作符合外部規範。

### 6. 使用 `apltk` cli 工具協助完成 spec

使用 CLI 工具產生 spec 模板。在執行前先閱讀 `references/create-specs.md` 了解所有參數。將完整計劃填入模板。
若變更範圍跨多個模塊，建立 batch spec。
盡可能確保每份 spec 可獨立實作。每一份 spec 應該專注在滿足不超過3個用戶需求。超過即建立新 spec，確保實作者能夠專注在自己的實作範圍內。
無法獨立實作的 spec，額外建立 `preparation.md` 定義前置工作。

### 7. 使用 `apltk` cli 工具協助完成 spec architecture diff

通過 CLI 工具生成完整的 architecture diff，採用 C4 模型層級逐步展開。
讓用戶審閱本次 spec 的架構設計。

#### 7a. 閱讀現有架構圖

閱讀項目現有架構圖（`resources/project-architecture/atlas/atlas.index.yaml` + 受影響的 feature YAML）。
不讀取無關的 feature 或模組，維持 context economy。

若無現有架構圖，跳過基準比對，直接從 System Context 開始定義本次 spec 的邊界。

#### 7b. 測量基準 drift

比對現有架構圖與當前程式碼，確認基準 atlas 的可靠程度：
- 若基準 atlas 與程式碼有顯著偏離（> 20% entries 不一致），在 architecture diff 中標記風險：「基準架構圖可能已過期，diff 僅反映 spec 設計而非實際狀態」
- 若基準 atlas 可靠，diff 可直接疊加在基準之上

#### 7c. 依 C4 層級逐步定義 diff

依照 C4 model 層級逐步產生架構 diff：

1. **System Context**：定義本次 spec 涉及的 external actor、系統邊界、跨系統 edge
2. **Container 層級**（功能模塊）：定義新增或修改的 feature，以及 feature 之間的 edge
3. **Component 層級**（子模塊）：定義子模塊內部的 function、variable、dataflow、error rows
4. **Code 層級**（選擇性）：只在關鍵路徑補充函式層級細節

#### 7d. 證據追溯

每個透過 CLI 宣告的 component 應連結到 spec 中的對應任務：
- 新增的 feature → 對應 spec.md 中的需求編號
- 新增或修改的子模塊 → 對應 tasks.md 中的任務
- function / dataflow / edge → 對應設計方案中的具體決策

無法直接對應到 spec 內容的宣告應在 architecture diff 中標記。

#### 7e. 產生 diff 並驗證

使用 `apltk architecture --spec <spec_dir>` 指令完成所有宣告，然後：

```bash
apltk architecture --spec <spec_dir> render
apltk architecture --spec <spec_dir> validate
```

確認驗證通過後，使用 `apltk architecture diff` 產生可視化對比，讓用戶審閱。

### 8. 交付前自我審查

在交付 spec 前，使用 `references/spec-quality-checklist.md` 進行自我審查。
確認以下項目：
- 所有需求是否都有明確的驗收條件
- 每個任務是否精確到函式或檔案級別
- 高不確定性的需求是否已標記並在 Clarification Questions 中反映
- 架構 diff 是否完整覆蓋變更範圍
- spec 內部是否一致（需求、任務、驗收條件之間無矛盾）

自我審查通過後才可將 spec 交付給用戶審核。

## 範例

- "製作一個網頁德州撲克小遊戲" -> "拆分成多個模塊：遊戲本體邏輯、前端頁面渲染、前端頁面交互邏輯。制定單元測試、整合測試等策略。製作一份單一 spec 指導實作。"
- "提升現有系統的性能" -> "識別 repo 中拖累性能的代碼。製作 batch spec，將全量優化拆分為以三個模塊為一組的優化。對必須改動業務邏輯才能提升性能的項目，填寫 clarification questions。等待用戶回答後更新 spec。"

## 參考資料

- `references/create-specs.md` — apltk create-specs 工具的完整參數說明。在步驟 6 使用 CLI 產生 spec 模板前閱讀。
- `references/architecture.md` — apltk architecture 工具的完整參數說明。在步驟 7 產生 architecture diff 前閱讀。
- `assets/templates/spec.md` - `spec.md` 的綁定模板。
- `assets/templates/tasks.md` - `tasks.md` 的綁定模板。
- `assets/templates/checklist.md` - `checklist.md` 的綁定模板。
- `assets/templates/contract.md` - `contract.md` 的綁定模板。
- `assets/templates/design.md` - `design.md` 的綁定模板。
- `assets/templates/coordination.md` - batch root 的 coordination 模板。
- `assets/templates/preparation.md` - batch root 的前置工作模板。
- `references/TEMPLATE_SPEC.md` - `apltk` cli工具相關格式指引。
- `references/spec-quality-checklist.md` - spec 交付前自我審查清單。
- `references/definition.md` - 架構圖之中功能模塊及子模塊的具體定義