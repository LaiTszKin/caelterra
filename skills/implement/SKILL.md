---
name: implement
description: 載入 plan 產出的 PROMPT.md，扮演協調器角色（coordinator），按照其中的任務分解和批次排程，派發 worker 完成實作。協調器不寫程式碼，只負責協調與監工。
---

## 技能目標

載入 PROMPT.md，**成為協調器**。

協調器的工作不是寫程式碼，而是：
1. 理解任務範圍與依賴關係
2. 按批次排程，從 PROMPT.md Section 6 擷取預先寫好的 worker prompt 派發給 worker
3. 等待 worker 完成，消化結果
4. 執行驗證檢查點
5. 處理合併、提交等流程性操作
6. 遇到阻礙時按錯誤恢復策略處理

## 驗收條件

- PROMPT.md 中定義的所有任務完成，所有 Gate 驗證通過
- 所有 worker 回報的結果已被消化和整合
- 完整測試套件和 lint 通過

## 工作流程

### 1. 載入協調器提示詞

完整閱讀 PROMPT.md，理解：
- **Section 1**: 你的角色與職責（你不能做什麼）
- **Section 3**: 實施範圍與 File Ownership
- **Section 5**: 任務清單與依賴圖
- **Section 6**: 每個任務的預先寫好 worker prompt
- **Section 7**: 批次排程與 Gate 條件
- **Section 9**: 錯誤恢復策略
- **Section 10**: 邊界規則

同時閱讀 SPEC.md、DESIGN.md、CHECKLIST.md 以理解完整的業務與技術上下文。

### 2. 準備執行環境

- 確認當前分支狀態乾淨

### 3. 按批次執行

嚴格按照 PROMPT.md Section 7 的 Batch Schedule 執行。

#### 每個批次的執行循環：

1. **派發階段** — 從 Section 6 擷取對應任務的 worker prompt，原樣派發給 worker。同一批次內無依賴的任務可並行派發。
2. **等待階段** — 等待該批次所有 worker 完成並回報結果。
3. **消化階段** — 閱讀每個 worker 的回報，確認修改內容符合預期。不可跳過這一步直接進入驗證。
4. **驗證階段** — 執行該批次的 Gate 驗證命令，確認結果符合預期。
5. **決策階段** —
   - 全部通過 → 進入下一批次
   - 個別 worker 失敗 → 按 Section 9 錯誤恢復策略處理
   - 測試回歸 → 暫停並報告

#### Worker 管理規則：

- **新建 worker**：任務之間無上下文重疊 → 從 Section 6 擷取對應 prompt 新建 worker
- **繼續 worker**：同一 worker 失敗後重試 → 繼續該 worker（它保有失敗的上下文），給予更具體的指令
- **Worker 是葉節點**：不允許 worker 自己生成子 worker

### 4. 處理衝突

若多個 worker 的變更發生衝突，協調器自己解決衝突。
解決後重新執行該批次的 Gate 驗證。

### 5. 最終驗證

所有批次完成後，執行 PROMPT.md Section 8 的最終驗證：
- 完整測試套件
- Lint
- 對照 SPEC.md 確認所有需求 checkboxes

### 6. 回填 SPEC.md

所有驗證通過後，更新 SPEC.md 中的需求 checkboxes。

### 7. 提交變更

將所有變更提交。不要在每批次後提交——只在全部完成並通過最終驗證後提交一次。

### 8. 回報用戶

向用戶報告：
- 完成了哪些任務
- 每個批次的驗證結果
- 任何值得注意的風險或偏離

## 範例

- PROMPT.md 定義 Batch 1 有 2 個並行任務 → 協調器從 Section 6 擷取 T1.1 和 T1.2 的 worker prompt → 派發 2 個 worker → 等待兩者完成 → 消化結果 → 執行 Gate 驗證 → 進入 Batch 2
- Worker T2.1 回報失敗 → 協調器繼續該 worker，給予更具體指令 → 第二次仍失敗 → 暫停，保留 T2.2 成功結果，通知用戶
- 所有批次完成 → 執行最終測試 → 提交 → 回填 SPEC.md → 回報用戶

## 參考資料

- PROMPT.md — 協調器提示詞，本技能的唯一執行依據
