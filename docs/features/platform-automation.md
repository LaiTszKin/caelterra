# 平台自動化

## GitHub Issue 操作

- **Given** 使用者需要在遠端倉庫搜尋 issues
- **When** 使用 `read-github-issue` 技能的 `find-github-issues` 工具
- **Then** 列出符合條件的 issues 供後續檢視

- **Given** 使用者知道 issue 編號
- **When** 使用 `read-github-issue` 技能
- **Then** 顯示 issue 完整內容與討論串

