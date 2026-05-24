---
name: implement-with-subagents
description: 當有多份規格文檔需並行實作時，調度 subagents 按依賴關係分批完成各份 spec，並將變更合併回當前分支。
---

## 目標

調度多個 subagents 並行完成規格文檔的實作。

## 驗收條件

- 對所有被要求實作的 spec，相關文件中的任務 checkboxes 全部被勾選為完成
- 這些文件包括 `checklist.md`、`tasks.md`、`spec.md`
- 不包含用戶自行填寫的項目
- 所有變更已從各 subagents 的工作分支合併回當前分支
- 所有 subagents 建立的工作分支及工作樹已被清理

## 工作流程

### 1. 定位實作範圍

閱讀用戶指定的spec：

- `spec.md` 定義了用戶的需求
- `tasks.md` 定義了詳細的實作任務
- `checklist.md` 定義了任務的完成和驗收條件
- `contract.md` 定義了spec的外部依賴
- `design.md` 定義了相關業務鏈路的架構設計
- `coordination.md`（如有）定義了batch spec之中各份spec各自的實作邊界
- `preparation.md`（如有）定義了實作batch spec之前各spec的共用準備工作

按照以上文件，閱讀repo，理解本次spec的實作範圍。

### 2. 完成前置準備工作（如有）

若 batch spec 有 `preparation.md`，在開始實作前先完成其規定的任務。
驗收後回填 `preparation.md`。
使用 `commit` 技能提交前置準備工作。不需要推送到 remote。

### 3. 規劃subagents調度順序

識別各份spec之間的依賴關係，並建立調度順序。將多份 spec 的實作切分為多個實作批次。每一個實作批次內部的 spec 之間沒有互相依賴。完成實作批次的建立之後，為每個 subagent 分配僅一份 spec，並且開始實作。
每一個被創建的 subagent 都需要有專屬的獨立 worktree。

每一個 subagent 的工作流程如下：
1. 使用 `implement-with-worktree` 技能實作 spec
2. 使用 `commit` 技能將變更提交到所屬worktree

在開始新的實作批次前，使用 `merge-changes-from-local-branches` 技能。
將前一批次的變更從本地其他分支合併回來。

### 4. 驗收工作

完成所有批次的合併後，閱讀所有 spec 中的 `checklist.md`、`tasks.md`、`spec.md`。
確保非用戶填寫的任務 checkboxes 都被勾選為完成。

## 範例

- "用戶要求實作一份含 5 份 spec 的 batch spec。spec 2 依賴 spec 1，spec 4 依賴 spec 3，spec 5 依賴 spec 2 與 spec 4。" -> "切分為 3 個批次。第一批派發兩個 subagents 實作 spec 1、spec 3。第二批派發兩個 subagents 實作 spec 2、spec 4。第三批派發 subagent 實作 spec 5。每批次完成後合併回當前分支。完成驗證後回報成果。"
- "用戶要求實作含 3 份 spec 的 batch spec，存在 `preparation.md`。3 份 spec 之間無依賴。" -> "先完成 `preparation.md` 的實作並提交。啟動三個 subagents 並行完成三份 spec。完成後合併回當前分支。驗證後回報結果。"