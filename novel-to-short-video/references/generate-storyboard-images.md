# apltk generate-storyboard-images — 故事板圖片生成

## 用途
透過 OpenAI 相容 API 從文字 prompt 生成故事板圖片。

## 用法
```
apltk generate-storyboard-images --input <name> [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--input, --content-name <name>` | 輸出資料夾名稱（必要） |
| `--project-dir <path>` | 專案目錄（預設 .） |
| `--env-file <path>` | .env 檔案路徑 |
| `--api-url <url>` | API 端點 URL |
| `--api-key <key>` | API 金鑰 |
| `--prompts-file <path>` | JSON prompt 檔案 |
| `--prompt <text>` | 圖片 prompt（可重複） |
| `--image-model <model>` | 圖片模型（預設 gpt-image-1） |
| `--aspect-ratio <ratio>` | 寬高比（如 16:9） |
| `--image-size <size>` | 圖片尺寸（如 1024x768） |
| `--quality <q>` | 圖片品質 |
| `--style <style>` | 圖片風格 |

## 輸出結構
```
<project-dir>/pictures/<content-name>/
├── 01_<scene>.png
├── 02_<scene>.png
└── storyboard.json
```

## 注意事項
- 至少需要 `--prompts-file` 或一個 `--prompt`
- 環境變數會從 `--env-file` 或 skill 資料夾的 `.env` 載入
- 檔名衝突時自動附加 `_2`, `_3` 等後綴
