# apltk filter-logs — 日誌時間窗口過濾

## 用途
將日誌文件縮小到精確的時間窗口，便於後續深入調查。

## 用法
```
apltk filter-logs [paths...] [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--start <timestamp>` | 時間窗口起始（ISO 8601） |
| `--end <timestamp>` | 時間窗口結束（ISO 8601） |
| `--assume-timezone <tz>` | 日誌時區（預設 UTC） |
| `--keep-undated` | 保留無時間戳的行 |
| `--count-only` | 只輸出符合行數 |

## 範例
```
apltk filter-logs app.log --start 2026-03-24T10:00:00Z --end 2026-03-24T10:15:00Z
apltk filter-logs syslog --assume-timezone Asia/Taipei --count-only
```

## 注意事項
- 可接受檔案路徑或 stdin 輸入
- `--assume-timezone` 只影響日誌中無時區標記的時間戳
