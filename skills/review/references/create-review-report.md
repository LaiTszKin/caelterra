# apltk create-review-report — review report 模板產生器

## 用途
將 review report 模板（REPORT.md）複製到對應的 spec 目錄。

## 用法
```
apltk create-review-report [options] [<spec-path>]
```

## 位置參數
| 參數 | 效果 |
|------|------|
| `<spec-path>` | spec 目錄、spec.md 或 batch 根目錄。省略時自動偵測 |

## 旗標
| 旗標 | 效果 |
|------|------|
| `--force, -f` | 覆蓋已存在的 `REPORT.md` |

## 放置邏輯
- 單一 spec：放在 `spec.md` 旁
- Batch spec：放在 batch 根目錄（`coordination.md` 旁）
