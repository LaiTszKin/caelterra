# apltk create-specs — spec 模板產生器

## 用途
根據 template 在 `docs/plans/` 下建立 spec 規劃文件。

## 用法
```
apltk create-specs <feature_name> [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--change-name, --slug <name>` | 資料夾名稱（預設為 feature_name 的 slug 化結果） |
| `--batch-name <name>` | 批次資料夾名稱（不要包含日期前綴） |
| `--with-coordination` | 建立 `coordination.md`（需要 `--batch-name`） |
| `--with-preparation` | 建立 `preparation.md`（需要 `--batch-name`） |
| `--output-dir <dir>` | 輸出基底目錄（預設 `docs/plans`） |
| `--template-dir <dir>` | 模板目錄 |
| `--force` | 覆蓋既有檔案 |

## 輸出結構
```
Single spec:  docs/plans/<today>/<change-name>/
Batch:        docs/plans/<today>/<batch-name>/<change-name>/
```

## 注意事項
- 工具會自動建立 `<today>` 日期資料夾
- Batch name 不應包含日期前綴
