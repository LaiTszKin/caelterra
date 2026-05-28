---
name: fix
description: 讀取 qa 產出的 FIX.md，嚴格按照其中的修復計畫和智能體路由執行修復。不做任何規劃決策。不用於沒有 FIX.md 的情境，不用於未經審查直接修復。
---

## 技能目標

按照 FIX.md 定義的修復計畫，機械式執行所有修復任務。
本技能是純執行器——不分析依賴、不檢測重疊、不決定路由。這些決策已由 `qa` 技能在 FIX.md 中完成。

## 驗收條件

- FIX.md 中所有定義的修復問題都已被完全修復
- 每個修復都經過 FIX.md 中定義的驗證方式確認
- 無引入新的退化（regression）
- 若使用 subagent，所有 worktree 已被清理

## 工作流程

### 1. 載入修復計畫

完整閱讀 FIX.md，理解：
- 修復批次排程（Fix Batch Schedule）
- Subagent 路由分配（Subagent Routing）
- 每個問題的修復細節（Per-Issue Fix Details）
- 驗證檢查點（Verification Checkpoints）

### 2. 按批次執行修復

嚴格按照 FIX.md 定義的批次順序執行。

#### 2a. 無 Subagent 的批次（循序執行）

按照 FIX.md 中定義的問題順序，逐一修復：
1. 閱讀 Per-Issue Fix Details 中該問題的修復方案
2. 根據複雜度分類選擇執行方式：
   - **簡單修復**：直接編輯代碼
   - **複雜修復**：使用 `systematic-debug` 技能進行系統性除錯
3. 執行該問題定義的驗證方式
4. 使用 `commit` 技能提交修復

#### 2b. 有 Subagent 路由的批次（並行執行）

按照 FIX.md 的 Subagent Routing 定義：

1. 為每個 subagent 建立專屬的獨立 worktree
2. 每個 subagent 的工作流程：
   - 閱讀 FIX.md 中自己的 Per-Issue Fix Details
   - 根據複雜度選擇修復方式（簡單→直接編輯，複雜→`systematic-debug`）
   - 執行定義的驗證命令
   - 使用 `commit` 技能提交到所屬 worktree
3. 等待所有 subagents 完成
4. 使用 `merge-changes-from-local-branches` 合併所有 subagent 變更
5. 清理所有 worktree

**錯誤恢復**：
- 若 subagent 失敗，重試一次；再次失敗則暫停並通知用戶
- 同批次其他成功的 subagent 結果保留
- 不因單一失敗廢棄整批成果

### 3. 執行驗證檢查點

在每個批次完成後，執行 FIX.md 中定義的 Verification Checkpoints：
- 執行指定驗證命令
- 確認結果符合預期
- 未通過驗證的批次必須重新修復

### 4. 回歸測試

按照 FIX.md 的 Regression Test Strategy：
- 執行必須通過的現有測試
- 實現並執行新增的回歸測試
- 若 FIX.md 要求 property-based 測試，一併實現

### 5. 最終驗證

所有批次完成後：
- 執行完整測試套件，確認無回歸
- 確認 lint 通過
- 對照 REPORT.md，確認所有問題已被處理

### 6. 產出修復摘要

記錄本次修復的摘要：
- 已修復的問題列表（含 P0-P3 分級與 FIX ID）
- 每個問題的修復方式與涉及檔案
- 驗證結果（測試通過 / 編譯成功）

## 範例

- "FIX.md 定義 3 個批次，Batch 1 並行 2 個 subagents" → 建立 2 個 worktree → 並行修復 → 合併 → 執行 Checkpoint 1 → 繼續 Batch 2
- "FIX.md 定義單一批次，循序修復 3 個問題" → 按順序逐一修復 → 每個修復後驗證 → 最終測試
- "Subagent A 執行失敗" → 重試一次 → 仍失敗 → 暫停，保留 Subagent B 的成果，通知用戶

## 參考資料

- FIX.md — 由 `qa` 技能產出的修復計畫，本技能的唯一執行依據
