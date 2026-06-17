---
name: version-release
description: 協助完成自動化版本發佈。同步文檔、更新版本號、推送 tag 並建立 GitHub Release。
---

## 技能目標

協助用戶完成自動化版本發佈流程。

## 驗收條件

- `CHANGELOG.md`, `docs/` 下所有項目文檔已經被同步到最新狀態
- GitHub release 與 version tag 已被建立
- 代碼圖索引（codegraph）與實際代碼同步
- 若不在 default 分支，已完成分支合併流程

## 工作流程

### 1. 確定發佈分支

檢查當前 git 分支是否為 default 分支（main 或 master）：

- 若在 **default 分支**：直接進入步驟 2-5
- 若在 **非 default 分支**：按照以下流程完成版本發佈

#### 非 default 分支發佈流程

1. 使用 `commit` 技能提交所有待處理變更。推送到 remote。
2. 切換到 default 分支。將工作分支合併到 default 分支。
3. 在 default 分支上，按步驟 2-4 完成發佈。
4. 發佈完成後，切回原始的 working branch。
5. 與 remote default branch 同步（`git merge --ff-only origin/<default>`）。
6. 推送已同步的工作分支。

### 2. 同步代碼圖索引

若有代碼變更，先執行 `apltk codegraph --help` 與相關子命令 `--help`，再按 live CLI 指引同步代碼圖，確保代碼圖與實際代碼同步。
若 `CLAUDE.md` 或 `AGENTS.md` 缺少 `apltk codegraph` 的引用，必須添加。

### 3. 更新項目文檔狀態

通過並行調度 subagents 完成變更的逐行深度閱讀，檢查文檔是否存在錯誤或遺漏。
若有，使用 `docs-project`、`maintain-project-constraints` 將文檔同步到最新。

### 4. 發佈版本

確認所有文檔已更新。
更新 repo 的版本文件（如 pyproject.toml）。
使用 `commit` 技能提交並推送所有變更。
最後推送 version tag 並建立 GitHub release。

## 參考資料索引

- `references/semantic-versioning.md`：版本號選擇規則
- `references/commit-messages.md`：release commit 訊息格式
- `references/branch-naming.md`：分支命名慣例
- `references/changelog-writing.md`：`CHANGELOG.md` 與 `Unreleased` 維護規則
- `references/readme-writing.md`：README 只在必要時同步更新
