---
name: plan
description: 將 SPEC.md + DESIGN.md + CHECKLIST.md 轉換為一份自包含的協調器提示詞（PROMPT.md），內含完整的任務分解、依賴分析、批次排程與預先寫好的 worker prompt。生成的 PROMPT.md 可直接由 implement 技能消費執行。
---

## 技能目標

將業務規格（SPEC.md）與技術方案（DESIGN.md + CHECKLIST.md）轉化為一份**協調器提示詞**（PROMPT.md）。

這份提示詞定義了一個 coordinator agent：
- **主 agent** 只負責協調與監工：讀任務、派發 worker、檢查結果、合併、驗證
- **Worker** 負責實作：每個 worker 收到一份預先寫好的自包含任務提示詞，完成後回報

本技能負責「規劃協同策略」——從 SPEC/DESIGN/CHECKLIST 中提取資訊，分解為具體任務，為每個任務預先寫好 worker prompt，排定批次順序。

## 驗收條件

- 產出 PROMPT.md，放置在 spec 或 batch spec 的根目錄下
- PROMPT.md 是一份**自包含的協調器提示詞**，包含：
  - 協調器角色定義（做什麼、不做什麼）
  - 任務分解與依賴圖
  - 每個任務的預先寫好 worker prompt（自包含、可直接派發）
  - 批次排程與驗證門檻
  - 錯誤恢復策略
  - 邊界規則（ALWAYS / ASK FIRST / NEVER）

## 工作流程

### 1. 識別 Spec 類型

閱讀用戶指定的目錄，判斷類型：

- **單 Spec**：目錄內有一份 SPEC.md + DESIGN.md + CHECKLIST.md
- **Batch Spec**：目錄內有多個子目錄，每個子目錄有各自的 SPEC.md + DESIGN.md + CHECKLIST.md

### 2. 閱讀並理解所有文檔

完整閱讀：
- `SPEC.md` — 業務需求與範圍（BDD 格式的 GIVEN/WHEN/THEN）、In/Out of Scope
- `DESIGN.md` — 模組架構、互動錨點（INT-###）、外部依賴（EXT-###）、系統不變量、技術取捨
- `CHECKLIST.md` — 行為驗證對照、Hardening 要求、測試層級選擇

### 3. 任務分解

將 DESIGN.md 的架構設計拆分為精確到檔案或函式級別的任務。

**任務分解原則：**
- 每個任務對應一個可獨立驗證的結果
- 任務粒度：精確到具體檔案和函式
- 每個任務定義明確的驗證方式
- 遵循 DESIGN.md 中 INT-### 定義的互動錨點順序
- 遵循 DESIGN.md 中 EXT-### 定義的外部依賴設置順序

**每任務需決定是否需要獨立的 worker：**
- 涉及 ≥2 個檔案的修改 → 需要獨立 worker
- 任務之間無檔案重疊 → 可以並行 worker
- 任務之間有檔案重疊或邏輯依賴 → 必須循序
- 純流程性操作（lockfile 更新、合併、提交）→ 不需 worker，由協調器自己處理

### 4. 提取關鍵資訊

**從 DESIGN.md 提取 → PROMPT.md Section 4（Technical Context）：**
- 模組清單與職責
- 互動錨點（INT-###）及其依賴順序
- 外部依賴設置順序（EXT-###）
- 系統不變量
- 技術取捨與決策

**從 CHECKLIST.md 提取 → PROMPT.md Section 8（Verification Checkpoints）：**
- 行為測試對照（CL-### → SPEC 需求）
- Hardening checklist 要求
- 測試執行命令

### 5. 分析依賴關係

#### 5a. 單 Spec：任務級別依賴分析

分析任務之間的依賴關係：
- 同檔案依賴：多個任務觸及相同檔案 → 必須循序
- 模組依賴：任務 A 的輸出是任務 B 的輸入 → A 先於 B
- INT 錨點順序：DESIGN.md 中定義的 INT-### 順序約束
- EXT 錨點順序：外部依賴的設置必須在消費之前

產出任務 DAG → PROMPT.md Section 5（Task Units）。

#### 5b. Batch Spec：Spec 級別依賴分析

分析各 spec 之間的依賴關係：
- 從各 DESIGN.md 的互動錨點識別跨 spec 依賴
- 識別 spec 之間可能共享的檔案
- 從各 DESIGN.md 的模組清單識別模組所有權重疊

產出 spec DAG。

### 6. 檢測檔案重疊

對所有工作單元進行檔案重疊檢測：

1. 收集每個工作單元預計修改的檔案列表
2. 比對檔案清單，標記重疊
3. 檔案重疊的工作單元不得並行處理、不可分配給不同 worker

### 7. 撰寫 Worker Prompt（每個需派發的任務）

為每個需要獨立 worker 的任務，撰寫自包含的 worker prompt → PROMPT.md Section 6（Worker Prompt Library）。

每個 worker prompt 必須包含：

```
## Mission — 你要做什麼、為什麼
## Input — 需要閱讀哪些檔案
## What to do — 具體步驟（描述「要做什麼」而非「用什麼工具做」）
## Scope — 允許/禁止修改的檔案清單
## Output — 完成後必須回報的內容（檔案清單、變更摘要、測試結果、風險）
## Verify — 驗證命令與預期結果
## Boundaries — 限制（不碰其他 worker 檔案、不新增依賴、遇到阻礙回報）
```

**撰寫原則：**
- **自包含**：worker 看不到協調器的對話上下文，prompt 必須包含所有必要資訊
- **具體**：嵌入檔案路徑、函式名稱、行號；不寫 "fix it" 或 "based on your findings"
- **宣告式**：描述「要做什麼」，而非「用什麼工具做」
- **清晰邊界**：明確列出允許和禁止修改的檔案

**無需獨立 worker 的任務**（純流程性操作）不需要 worker prompt。這些由協調器在對應批次中自行處理。

### 8. 建立批次排程

根據依賴分析和檔案重疊檢測結果，建立批次排程 → PROMPT.md Section 7（Batch Schedule）。

**批次劃分原則：**
- 同一批次內的任務之間：無檔案重疊、無邏輯依賴 → 可並行派發 worker
- 不同批次之間：前一批次完成並通過 Gate 驗證後，才開始下一批次
- 收尾批次處理整合性任務（lockfile 更新、最終測試）

### 9. 定義錯誤恢復策略

→ PROMPT.md Section 9（Error Recovery）。

- Worker 失敗：用已有上下文繼續（不要新建），最多重試一次
- 兩次失敗後：暫停流程，保留同批次成功結果，通知用戶
- 合併衝突：協調器自己解決
- 測試回歸：暫停並報告用戶

### 10. 設定邊界規則

→ PROMPT.md Section 10（Boundaries）。

- **ALWAYS**：每批次 Gate 驗證、原樣擷取 worker prompt、先消化結果再決定
- **ASK FIRST**：修改未定義檔案、新增依賴、worker 兩次失敗、無法定位的回歸
- **NEVER**：協調器自己編輯原始碼、worker 生成子 worker、跳過驗證、模糊指令

### 11. 填寫 PROMPT.md 各區段

使用 `assets/templates/PROMPT.md` 模板，按以下順序填入：

| Section | 內容來源 |
|---------|---------|
| 1. Your Role | 固定模板（不需修改） |
| 2. Mission | SPEC.md Goal + 業務價值 |
| 3. Scope & Boundaries | SPEC.md In/Out of Scope |
| 4. Technical Context | DESIGN.md 模組、不變量、技術取捨 |
| 5. Task Units | 步驟 3 任務分解 + 步驟 5 依賴圖 |
| 6. Worker Prompt Library | 步驟 7 為每個需派發的任務撰寫 |
| 7. Batch Schedule | 步驟 8 批次排程 |
| 8. Verification Checkpoints | CHECKLIST.md 行為測試 + hardening |
| 9. Error Recovery | 固定模板（微調即可） |
| 10. Boundaries | 固定模板 + spec 特定規則 |

### 12. 產出 PROMPT.md

將 PROMPT.md 放置在 spec 或 batch spec 的根目錄下。

## 範例

- "為單一 spec 生成協調器提示詞" → 讀取 SPEC.md + DESIGN.md → 分解 3 個任務 → T1.1 和 T1.2 無檔案重疊可並行 → 為每個任務寫 worker prompt → 排程: Batch 1 並行 T1.1+T1.2 → Batch 2 T1.3 → 產出 PROMPT.md
- "為含 4 份 spec 的 batch spec 生成協調器提示詞" → 讀取所有 SPEC.md + DESIGN.md → 建立 spec DAG → 檢測跨 spec 檔案重疊 → 排程批次 → 為每個 spec 的工作單元寫 worker prompt → 產出 PROMPT.md
- "兩個任務修改相同檔案" → 分到不同批次，各自有獨立 worker prompt，循序執行

## 參考資料

- `assets/templates/PROMPT.md` — PROMPT.md 綁定模板
