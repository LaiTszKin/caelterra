---
name: qa
description: 讀取 spec 文檔與 review 產出的 REPORT.md，生成一份自包含的修復協調器提示詞（FIX.md），內含問題清單、依賴分析、批次排程、回歸測試設計與預先寫好的 worker prompt。生成的 FIX.md 可直接由 fix 技能消費執行。
---

## 技能目標

將 review 技能發現的問題清單（REPORT.md）轉化為一份**修復協調器提示詞**（FIX.md）。

這份提示詞定義了一個 fix coordinator agent：
- **主 agent** 只負責協調與監工：理解問題、派發 worker 修復、派發 worker 建立回歸測試、檢查結果、合併、驗證
- **Worker** 負責修復和測試：每個 worker 收到一份預先寫好的自包含提示詞，完成後回報

本技能負責「規劃修復策略」——從 REPORT.md + SPEC/DESIGN/CHECKLIST 中提取資訊，為每個修復問題和回歸測試撰寫 worker prompt，排定批次順序。

## 驗收條件

- 產出 FIX.md，放置在 spec 目錄下
- FIX.md 是一份**自包含的修復協調器提示詞**，包含：
  - 協調器角色定義
  - 問題清單與依賴分析
  - 每個修復問題的預先寫好 worker prompt
  - 每個修復對應的回歸測試設計與 worker prompt
  - 批次排程（修復批次 + 回歸測試批次 + 收尾驗證）
  - 錯誤恢復策略
  - 邊界規則

## 工作流程

### 1. 閱讀輸入文件

完整閱讀以下文件：

- **SPEC.md + DESIGN.md + CHECKLIST.md**：spec 與 design 階段的完整文檔
- **REPORT.md**：review 技能產出的問題清單（判決 + P0-P3 問題列表 + 審查維度摘要）

理解 spec 的原始設計意圖與 REPORT.md 中每個問題的本質。

### 2. 閱讀相關代碼

根據 REPORT.md 中標記的檔案路徑，閱讀受影響的代碼。
理解每個問題的實際程式碼上下文，以便制定精確的修復方案和測試設計。
如果外部環境允許使用 subagents，通過並行調度 subagents 完成代碼閱讀。

### 3. 分析每個問題並制定修復方案

對 REPORT.md 中的每個問題（按 P0 → P1 → P2 → P3 順序）→ FIX.md Section 5（Fix Details）：

- **根因分析**：透過程式碼閱讀確定問題的根本原因
- **修復方案**：描述具體的修改方式（修改哪些檔案、哪些函式、如何修改）
- **驗證方式**：定義修復完成後的驗證命令或手動檢查步驟
- **複雜度分類**：
  - **簡單修復**：單一檔案內的明確修改
  - **複雜修復**：跨多檔案、需深入理解執行路徑 — worker prompt 中需包含更多上下文

### 4. 為每個問題設計回歸測試

對每個修復問題，設計具體的回歸測試 → FIX.md Section 5（Fix Details 中每個問題的「回歸測試設計」欄位）→ FIX.md Section 6（Worker Prompt Library 中的 REGTEST 條目）。

設計原則：
- **每個 P0/P1 問題至少要有一個回歸測試**。P2/P3 問題若難以自動化測試則至少定義手動檢查步驟。
- 回歸測試必須**在該問題未被修復時失敗、修復後通過**。這是最核心的 oracle。
- 測試類型選擇：
  - 邏輯錯誤（輸出結果錯誤）→ 單元測試，直接測試修復的函式，用修復前會失敗的輸入/輸出對
  - 狀態錯誤（間歇性、順序相依）→ 整合測試，模擬觸發條件
  - 整合錯誤（邊界/合約）→ 整合測試或合約測試
  - 幻覺代碼 → 單元測試驗證該段代碼確實被執行到
  - 架構瑕疵 → 整合測試驗證新結構正確運作

**回歸測試設計格式**（記錄在 Fix Details 中）：

```
- 測試 ID: REGTEST-{序號}
- 測試類型: [單元 / 整合 / E2E]
- 測試位置: [檔案路徑，新檔案或現有檔案]
- 測試場景: [GIVEN/WHEN/THEN 描述]
- Oracle: [通過條件 — 修復前應失敗、修復後應通過]
- 關聯修復: FIX-{序號}
```

### 5. 分析修復依賴關係 → FIX.md Section 4

- **檔案重疊依賴**：多個問題觸及相同檔案的相同區域 → 必須循序
- **邏輯依賴**：修復 B 依賴修復 A 先完成
- **獨立問題**：無檔案重疊且無邏輯相依 → 可並行處理
- **回歸測試依賴**：回歸測試必須在對應修復完成後才能執行（測試修復後的代碼）

### 6. 檢測檔案重疊

對所有修復和回歸測試進行檔案重疊檢測：
1. 收集每個問題和回歸測試涉及的檔案清單
2. 比對檔案清單，標記重疊
3. 檔案重疊的工作不得並行、不可分配給不同 worker

### 7. 撰寫 Worker Prompt

#### 7a. 修復 Worker Prompt → FIX.md Section 6

為每個修復問題撰寫自包含的 worker prompt。

每個修復 worker prompt 必須包含：

```
## Mission — 修復什麼問題、為什麼要修復
## Context — 來自哪個審查維度、相關 spec 需求
## Input — 需要閱讀哪些檔案
## What to do — 具體修復步驟（描述「要做什麼」而非「用什麼工具做」）
## Scope — 允許/禁止修改的檔案清單
## Output — 完成後必須回報的內容
## Verify — 驗證命令與預期結果
## Boundaries — 限制（不與 spec 衝突、保留現有測試語義、遇到阻礙回報）
```

**簡單修復可合併**：多個簡單且互不衝突的修復可合併為一個 worker prompt。
**複雜修復獨立**：複雜修復（需 systematic debug）必須有獨立的 worker prompt。

#### 7b. 回歸測試 Worker Prompt → FIX.md Section 6

為每個回歸測試撰寫自包含的 worker prompt。回歸測試 worker 負責**撰寫測試代碼**。

每個回歸測試 worker prompt 必須包含：

```
## Mission — 為哪個修復建立回歸測試、為什麼需要這個測試
## Context — 修復了什麼問題（簡述）、根因是什麼
## Input — 需要閱讀哪些檔案（修復涉及的檔案 + 現有測試檔案作為格式參考）
## What to do — 具體測試撰寫步驟：
  1. 在指定位置建立測試
  2. 測試場景（GIVEN/WHEN/THEN）
  3. Oracle（修復前應失敗、修復後應通過）
## Scope — 允許修改的測試檔案
## Verify — 執行測試命令，確認測試通過（證明修復有效）
```

#### 7c. 無需獨立 worker 的情況

- 單行 typo 修復（多個 typo 可合併派給一個 worker）
- 純文件或註解修正
- 修復本身極簡單且可與其回歸測試合併在同一個 worker 中實現

### 8. 建立批次排程 → FIX.md Section 7

**批次劃分原則：**
- 修復批次：按依賴關係排列，優先 P0
- 回歸測試批次：在**所有修復完成後**派發，因為測試要驗證修復後的代碼。同一批次內的回歸測試無檔案重疊可並行。
- 收尾批次：執行完整測試套件，確認所有回歸測試通過 + 原有測試無退化

**典型排程結構：**
```
Batch 1: 獨立 P0 修復 → 驗證
Batch 2: 依賴 P0 修復 → 驗證
Batch 3: P1/P2 修復 → 驗證
Batch 4: 回歸測試實現（所有 REGTEST 並行派發）
Batch 5: 收尾 — 完整測試套件 + lint
```

回歸測試的 worker 之間，按檔案重疊分組：無重疊可並行、有重疊分入子批次。

### 9. 設定驗證檢查點與錯誤恢復 → FIX.md Section 9-11

- 每批次 Gate 驗證條件
- 回歸測試批次的特殊 Gate：確認每個 REGTEST worker 產出的測試在未修復的場景下會失敗（logical check）
- Worker 失敗處理（繼續已有上下文 → 重試一次 → 暫停並報告）
- 邊界規則（ALWAYS / ASK FIRST / NEVER）

### 10. 填寫 FIX.md 各區段

使用 `assets/templates/FIX.md` 模板，按以下順序填入：

| Section | 內容來源 |
|---------|---------|
| 1. Your Role | 固定模板（不需修改） |
| 2. Mission | REPORT.md 判決 + 問題總數 |
| 3. Issue Inventory | REPORT.md 問題清單 |
| 4. Fix Dependency Analysis | 步驟 5-6 依賴分析與檔案重疊 |
| 5. Fix Details（含回歸測試設計） | 步驟 3 修復方案 + 步驟 4 回歸測試設計 |
| 6. Worker Prompt Library | 步驟 7a 修復 prompt + 步驟 7b 回歸測試 prompt |
| 7. Fix Batch Schedule | 步驟 8 批次排程（修復 + 回歸測試 + 收尾） |
| 8. Regression Test Inventory | 步驟 4 的全量回歸測試清單（表格式總覽） |
| 9-11. Verification / Error Recovery / Boundaries | 固定模板 + spec 特定規則 |

### 11. 產出 FIX.md

將 FIX.md 放置在 spec 目錄下（與 REPORT.md 同層）。

## 範例

- REPORT.md 有 3 個 P0（幻覺碼、實作偏移、遺漏）、2 個 P1 → 每個 P0/P1 各設計 1+ 回歸測試 → FIX.md 包含 3 個修復 worker + 5 個回歸測試 worker → 排程: Batch 1 並行修復 3 個 P0 → Batch 2 修復 2 個 P1 → Batch 3 並行實現 5 個回歸測試 → Batch 4 收尾
- 兩個 P0 問題都修改 src/auth.ts → 檔案重疊 → 分兩個批次循序修復 → 回歸測試在修復批次後統一實現
- 某 P0 是邏輯錯誤：函式 getDiscount() 未處理負數輸入 → 回歸測試設計為單元測試：GIVEN 負數輸入 WHEN 調用 getDiscount() THEN 應返回 0（修復前返回錯誤的負折扣值）

## 參考資料

- `assets/templates/FIX.md` — FIX.md 綁定模板
