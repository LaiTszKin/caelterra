# apltk find-github-issues — GitHub Issue 搜尋

## 用途
透過 gh CLI 搜尋和列出 GitHub Issue。

## 用法
```
apltk find-github-issues [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--repo <owner/repo>` | 目標倉庫 |
| `--state <open|closed|all>` | Issue 狀態（預設 open） |
| `--limit <n>` | 最大回傳數（預設 50） |
| `--label <name>` | 按標籤篩選（可重複） |
| `--search <query>` | 自由文字搜尋 |
| `--output <table|json>` | 輸出格式（預設 table） |

## 輸出欄位
number, title, state, updatedAt, url, labels, assignees

## 注意事項
底層依賴 `gh issue list`，需事先認證。
