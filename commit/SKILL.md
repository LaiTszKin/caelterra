---
name: commit
description: 提交指引與提交前的必要品控閘門。將變更提交到 git repo 或推送到 remote 前，需完成所有品控項目。包括審查、文檔同步與 changelog 門檻。
---

## 目標

在不破壞既有工作樹與提交邊界的前提下，安全地完成本地 commit 與可選 push。
確保所有審查、文件同步與 changelog 門檻均已確實完成。

## 驗收條件

- 所有暫存的變更已被提交，並依需求推送到 remote

## 工作流程

### 1. 檢查變更狀態

檢查目前的 git 變更狀態。
識別變更範圍。
確認暫存變更中是否包含代碼變更。

### 2. 品控閘門（選用）

若變更範圍涉及代碼變更，確認變更已通過必要的審查與驗證。
若在審查中發現問題，修復後暫存。

### 3. 同步項目文檔

使用 `docs-project`、`maintain-project-constraints` 技能更新項目文檔。
遵循當中的指引，確保文檔與 repo 保持一致。

### 4. 同步項目架構圖

若存在代碼變更，使用 `update-project-html` 檢查並更新項目架構圖。

### 5. 提交及推送變更

依使用者的 staging 邊界建立 commit。
提交訊息須遵循 `references/commit-messages.md`。
只有在使用者明確要求更新 remote 時才 push。

## 參考資料

- `references/commit-messages.md`：提交訊息格式
- `references/branch-naming.md`：分支命名慣例