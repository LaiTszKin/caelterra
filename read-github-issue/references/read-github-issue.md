# apltk read-github-issue — 讀取 GitHub Issue 明細

## 用途
透過 gh CLI 讀取單個 GitHub Issue 完整內容。

## 用法
```
apltk read-github-issue [options] <issue-number>
```

## 位置參數
| 參數 | 效果 |
|------|------|
| `<issue-number>` | Issue 號碼或 URL（必要） |

## 旗標
| 旗標 | 效果 |
|------|------|
| `--repo <owner/repo>` | 目標倉庫 |
| `--comments` | 一併顯示留言 |
| `--json` | JSON 格式輸出 |

## 輸出欄位
Number, Title, State, URL, Author, Labels, Assignees, Created, Updated, Closed, Body, Comments

## 注意事項
底層依賴 `gh issue view`，需事先認證。
