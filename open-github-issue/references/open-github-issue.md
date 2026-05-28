# apltk open-github-issue — GitHub Issue 發布工具

## 用途
建立結構化 GitHub Issue，支援 gh CLI 與 Token 認證，自動偵測語言。

## 用法
```
apltk open-github-issue [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--payload-file <path>` | JSON payload 檔案（優先於個別旗標） |
| `--title <text>` | Issue 標題（必要） |
| `--issue-type <type>` | problem / feature / performance / security / docs / observability |
| `--problem-description <text>` | 問題描述（需含 BDD 段落） |
| `--suspected-cause <text>` | 推測原因（problem 必要） |
| `--reproduction <text>` | 重現條件 |
| `--proposal <text>` | 功能提案 |
| `--reason <text>` | 提案原因（feature 必要） |
| `--suggested-architecture <text>` | 建議架構（feature 必要） |
| `--impact <text>` | 影響描述 |
| `--evidence <text>` | 證據 |
| `--suggested-action <text>` | 建議行動 |
| `--severity <text>` | 嚴重程度（security 必要） |
| `--affected-scope <text>` | 受影響範圍（security 必要） |
| `--repo <owner/repo>` | 目標倉庫（省略時從 git remote 自動解析） |
| `--dry-run` | 不實際發布，僅輸出 issue body |

## 文字值的 @ 前置語法
任何文字旗標值若以 `@` 開頭，會被視為檔案路徑，讀取該檔案內容作為值。

## Issue Type 必要欄位
- **problem**: --title, --problem-description（含 BDD 段落）, --suspected-cause
- **feature**: --title, --reason, --suggested-architecture
- **performance**: --title, --problem-description, --impact, --evidence, --suggested-action
- **security**: --title, --problem-description, --affected-scope, --impact, --evidence, --suggested-action, --severity
- **docs**: --title, --problem-description, --evidence, --suggested-action
- **observability**: --title, --problem-description, --impact, --evidence, --suggested-action

## 認證優先順序
1. gh CLI 認證 → 2. GITHUB_TOKEN / GH_TOKEN → 3. draft-only（不發布）

## 輸出 JSON 欄位
repo, issue_type, language (zh/en), mode (gh-cli/github-token/dry-run/draft-only), issue_url, issue_title, issue_body, publish_error

## 注意事項
- README 含 20+ 中文字且佔比 ≥ 8% → 使用中文模板
- 使用暫存檔案傳遞 issue body 以避免 shell quoting 問題
