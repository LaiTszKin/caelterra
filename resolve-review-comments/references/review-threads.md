# apltk review-threads — PR Review Thread 管理

## 用途
列出或解析 GitHub PR review threads。

## 用法
```
apltk review-threads <subcommand> [options]
```

## 子指令
### list
列出 review threads。預設只顯示未解析的 thread。

### resolve
解析已處理的 review thread。

## 全局旗標
| 旗標 | 效果 |
|------|------|
| `--repo <owner/repo>` | 目標倉庫（省略時自動偵測） |
| `--pr <number>` | PR 編號（省略時從當前 branch 推斷） |

## list 子指令旗標
| 旗標 | 效果 |
|------|------|
| `--state <unresolved|resolved|all>` | 過濾條件（預設 unresolved） |
| `--output <table|json>` | 輸出格式（預設 table） |

## resolve 子指令旗標
| 旗標 | 效果 |
|------|------|
| `--thread-id <id>` | 指定要解析的 thread ID（可重複） |
| `--thread-id-file <path>` | 從 JSON 檔案讀取 thread ID 列表 |
| `--all-unresolved` | 解析所有未處理的 thread |
| `--dry-run` | 預覽將解析的 thread，不實際操作 |
