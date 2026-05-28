---
name: plan
description: 將完整的 spec 文檔轉換為一份非常詳細的實作計畫（PROMPT.md），讓 implement 直接讀取計畫來進行多智能體協同實作，而不需要自己思考如何協同。不用於沒有 spec 的情境。
---

## 技能目標

將 spec 文檔（精確定義）轉化為可執行的實作方法論（PROMPT.md）。
分離「規劃如何協同」與「執行實作」兩個階段。

## 驗收條件

- 產出 PROMPT.md，放置在 spec 或 batch spec 的根目錄下
- PROMPT.md 包含完整的依賴分析、批次排程、檔案所有權分配、驗證檢查點
- PROMPT.md 可直接被 implement 消費，無需 implement 再做協同決策

## 工作流程

### 1. 識別 Spec 類型

閱讀用戶指定的 spec 目錄，判斷類型：

- **單 Spec**：目錄內只有一組 spec 文檔（spec.md、tasks.md、design.md、checklist.md、contract.md）
- **Batch Spec**：目錄內有 coordination.md，且包含多份子 spec

### 2. 閱讀並理解 Spec

完整閱讀所有 spec 文檔：

- `spec.md` — 業務需求與範圍（BDD 格式的 GIVEN/WHEN/THEN）
- `design.md` — 模組架構、互動錨點（INT-###）、資料流、不變量
- `contract.md` — 外部依賴事實、API 限制、失敗模式（EXT-###）
- `tasks.md` — 檔案/函式級別的實作步驟（T1.1, T1.2...）
- `checklist.md` — 行為驗證、測試策略
- `coordination.md`（如有）— 各 spec 邊界、檔案所有權、合併順序
- `preparation.md`（如有）— 並行前的前置工作

### 3. 提取關鍵資訊

從 spec 文檔中提取以下資訊，作為規劃的輸入：

**從 design.md 提取：**
- 模組清單與職責（Modules 表）
- 互動錨點（INT-###）及其依賴順序（Requirement linkage）
- 並行/循序約束（Ordering / concurrency）
- 交易取捨（Tradeoffs inherited by implementation）

**從 tasks.md 提取：**
- 每個任務的目標檔案清單
- 任務之間的隱含依賴（同檔案、同模組）

**從 contract.md 提取：**
- 外部依賴設置順序（EXT-### 及 doc-level ordering constraint）
- Mock 需求

**從 coordination.md 提取（batch spec）：**
- 各 spec 的檔案所有權邊界（Ownership Map）
- 共享檔案與編輯規則（Collisions & Integration）
- 建議合併順序（Merge order）
- 整合檢查點（Integration checkpoints）

**從 checklist.md 提取：**
- 驗證項目與測試類型
- Hardening checklist 要求

### 4. 分析依賴關係

#### 4a. 單 Spec：任務級別依賴分析

分析 tasks.md 中各任務之間的依賴關係：
- 同檔案依賴：多個任務觸及相同檔案 → 必須循序
- 模組依賴：任務 T1.2 的輸出是任務 T2.1 的輸入 → T1.2 先於 T2.1
- INT 錨點順序：design.md 中定義的 INT-### 順序約束

產出任務 DAG。

#### 4b. Batch Spec：Spec 級別依賴分析

分析各 spec 之間的依賴關係：
- 讀取 coordination.md 的 Ownership Map
- 識別 spec 之間的共享檔案
- 識別跨 spec 的 INT 錨點依賴

產出 spec DAG。

### 5. 檢測檔案重疊

對所有工作單元進行檔案重疊檢測：

1. 收集每個 spec（或任務組）預計修改的檔案列表
2. 比對檔案清單，標記重疊
3. 檔案重疊的工作單元不得並行處理

### 6. 建立批次排程

根據依賴分析和檔案重疊檢測結果，建立批次排程：

**批次劃分原則：**
- 同一批次內的工作單元之間：無檔案重疊、無邏輯依賴
- 不同批次之間：前一批次完成並驗證後，才開始下一批次
- 每個批次的產出是可獨立驗證的中間狀態

**排程輸出格式：**
```
Batch 1（前置）: [工作單元]
Batch 2（並行）: [工作單元 A] ∥ [工作單元 B]
Batch 3（並行）: [工作單元 C] ∥ [工作單元 D]
Batch N（收尾）: [工作單元]
```

### 7. 決定 Subagent 路由

對於需要並行處理的批次，定義 subagent 路由：

**每個 subagent 的定義包含：**
- 目標：這個 subagent 要完成什麼
- 工作目錄：對應的 spec 目錄（batch spec）或任務範圍（單 spec）
- 目標檔案清單：允許修改的檔案
- 禁止修改的檔案：屬於其他 subagent 的檔案
- 風險標記：auth / schema / migration / 外部 API
- 輸出格式：完成的任務 checkboxes + 驗證結果

### 8. 定義 Lockfile 策略

若多個工作單元可能修改 lockfile：
- 指定**一個 subagent** 負責最終 lockfile 更新
- 或告知所有 subagent 不修改 lockfile，在最終批次統一處理

### 9. 設定驗證檢查點

在每個批次邊界設定驗證檢查點：

- **批次前檢查**：確認前置批次的測試全部通過
- **整合檢查點**：合併後執行 coordination.md 定義的 integration checkpoints
- **最終驗證**：執行 checklist.md 定義的完整測試套件

### 10. 定義錯誤恢復策略

為每個批次定義失敗處理：
- 若 subagent 失敗，重試一次；再次失敗則暫停並通知用戶
- 同批次其他成功的 subagent 結果不受影響
- 已完成的批次不需重做

### 11. 產出 PROMPT.md

使用 `assets/templates/PROMPT.md` 模板，填入完整計劃。
將 PROMPT.md 放置在 spec 或 batch spec 的根目錄下。

## 範例

- "為單一 spec 生成執行計畫" → 分析 tasks.md 依賴 → 決定是否需要 subagent 並行 → 產出 PROMPT.md
- "為含 4 份 spec 的 batch spec 生成執行計畫" → 分析 coordination.md + 各 spec design.md → 建立 DAG → 檢測檔案重疊 → 排程批次 → 分配 subagent → 產出 PROMPT.md
- "Spec 之間有共享檔案" → 在 PROMPT.md 中將共享檔案的 spec 分到不同批次，定義嚴格的檔案所有權邊界

## 參考資料

- `assets/templates/PROMPT.md` — PROMPT.md 的綁定模板
