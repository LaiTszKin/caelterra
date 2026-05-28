# apltk search-logs — 日誌關鍵字與正則搜尋

## 用途
透過關鍵字或正則表達式搜尋日誌內容，支援時間窗口與上下文行。

## 用法
```
apltk search-logs [paths...] [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--keyword <text>` | 關鍵字搜尋（可重複） |
| `--regex <pattern>` | 正則搜尋（可重複） |
| `--mode <any|all>` | 多條件匹配模式（預設 any） |
| `--ignore-case` | 忽略大小寫 |
| `--start <timestamp>` | 時間窗口起始 |
| `--end <timestamp>` | 時間窗口結束 |
| `--assume-timezone <tz>` | 日誌時區（預設 UTC） |
| `--before-context <n>` | 匹配行前行數 |
| `--after-context <n>` | 匹配行後行數 |
| `--count-only` | 只輸出符合行數 |

## 範例
```
apltk search-logs app.log --keyword timeout --mode any
apltk search-logs system.log --regex "error|exception" --ignore-case --before-context 2 --after-context 2
```
