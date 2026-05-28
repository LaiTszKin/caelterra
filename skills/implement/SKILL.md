---
name: implement
description: 讀取 plan 產出的 PROMPT.md，嚴格按照其中的實作計畫和智能體路由執行實作。不做任何協同決策。不用於沒有 PROMPT.md 的情境，不用於不需 spec 的單檔案變更。
---

## 技能目標

按照 PROMPT.md 定義的實作計畫，機械式執行所有實作任務。
本技能是純執行器——不分析依賴、不檢測重疊、不決定路由。這些決策已由 `plan` 技能在 PROMPT.md 中完成。

## 驗收條件

- PROMPT.md 中所有定義的任務 checkboxes 全部被勾選為完成
- 所有實作已通過 PROMPT.md 中定義的驗證檢查點
- 若使用 subagent，所有 worktree 已被清理、無遺留分支
- spec.md 中的需求 checkboxes 已回填

## 工作流程

### 1. 載入實作計畫

完整閱讀 PROMPT.md，理解：
- 工作單元定義與依賴圖（Dependency Graph）
- 批次排程（Batch Schedule）
- Subagent 分配（Subagent Assignments）
- 檔案所有權地圖（File Ownership Map）
- 驗證檢查點（Verification Checkpoints）
- 錯誤恢復策略（Error Recovery）
- 邊界規則（Boundaries）

同時閱讀 spec 文檔組以理解實作上下文（spec.md、tasks.md、design.md、checklist.md）。

### 2. 判斷是否需要隔離環境

參考 `references/isolation-guidance.md` 判斷是否需要 git worktree 隔離：

- **隔離路徑**：PROMPT.md 定義了多個 subagent 或變更涉及多個檔案 → 走隔離路徑
- **快速路徑**：PROMPT.md 定義為單一循序執行、範圍明確 → 跳過隔離，直接在當前分支進行

#### 2a. 隔離路徑：前置檢查與創建 worktree

在建立 worktree 前：
- 若有未提交的變更，先 stash 或提交
- 確認當前分支已同步遠端（若需推送）

滿足前置條件後，從當前分支創建子分支及 worktree。
分支命名參考 `references/branch-naming.md`。

### 3. 按批次執行實作

嚴格按照 PROMPT.md 定義的 Batch Schedule 執行。

#### 3a. 無 Subagent 的批次（循序執行）

按照 PROMPT.md 定義的順序，逐一執行工作單元：
1. 閱讀對應 spec 的 tasks.md
2. 逐項完成任務（T1.1, T1.2...）
3. 執行該工作單元的驗證命令
4. 將完成的 tasks.md checkboxes 勾選

#### 3b. 有 Subagent 路由的批次（並行執行）

按照 PROMPT.md 的 Subagent Assignments 定義：

1. 為每個 subagent 建立專屬的獨立 worktree
2. 每個 subagent 的工作流程：
   - 載入 PROMPT.md 中自己的任務清單
   - 閱讀對應 spec 的 tasks.md
   - 逐項完成任務，只修改允許修改的檔案
   - 執行定義的驗證命令
   - 使用 `commit` 技能提交到所屬 worktree
3. 等待所有 subagents 完成
4. 使用 `merge-changes-from-local-branches` 技能合併所有 subagent 變更
5. 清理所有 worktree

**錯誤恢復**（嚴格按 PROMPT.md 第 8 節執行）：
- 若 subagent 失敗，重試一次；再次失敗則暫停並通知用戶
- 同批次其他成功的 subagent 結果保留
- 已完成的批次不需重做

### 4. 執行驗證檢查點

在每個批次完成後，執行 PROMPT.md 中定義的 Verification Checkpoints：
- 執行指定驗證命令
- 確認結果符合預期
- 未通過驗證的批次必須重新實作

### 5. 實作範圍守門員

在實作過程中持續對照 PROMPT.md 的 Boundaries：
- **Always**：無條件執行
- **Ask First**：暫停並與用戶確認
- **Never**：嚴格禁止

若發現超出 spec 定義範圍的修改需求，暫停並與用戶確認後再繼續。

### 6. 實作偏離處理

若在實作過程中發現 tasks.md 的任務無法照計畫完成：
1. 暫停該任務的實作
2. 記錄偏離原因與實際發現
3. 更新 spec.md 中相關需求的 checkboxes 與備註
4. 通知用戶偏離情況，等待用戶決策

### 7. 回填 spec

確保所有實作任務完成並通過驗收之後，更新 spec.md 中的需求 checkboxes。

### 8. 提交變更

使用 `commit` 技能將變更提交到分支上。不需要推送到 remote。

若與主分支發生合併衝突：
1. 使用 `git merge main` 將主分支最新變更拉入
2. 解決衝突檔案的衝突標記
3. 確認解決後測試套件依然通過
4. 完成合併提交

若使用隔離路徑，提交後清理 worktree。

## 範例

- "PROMPT.md 定義 3 個批次，Batch 2 有 2 個並行 subagent" → 執行 Batch 1 → 建立 2 個 worktree → 並行實作 → 合併 → 驗證 → 繼續 Batch 3
- "PROMPT.md 定義單一循序執行" → 直接在當前分支按順序完成所有工作單元
- "Subagent A 實作失敗" → 按 Error Recovery 重試一次 → 仍失敗 → 暫停，保留 Subagent B 成果，通知用戶

## 參考資料

- `references/branch-naming.md` — 建議分支命名方式
- `references/isolation-guidance.md` — 判斷何時需要使用 worktree 隔離
- PROMPT.md — 由 `plan` 技能產出的實作計畫，本技能的唯一執行依據
