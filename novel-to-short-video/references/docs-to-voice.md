# apltk docs-to-voice — 文字轉語音工具

## 用途
將文字轉換為音檔、時間軸 JSON 與 SRT 字幕。

## 用法
```
apltk docs-to-voice [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--input, --input-file <path>` | 輸入文字檔案路徑 |
| `--text <string>` | 直接輸入文字 |
| `--project-dir <path>` | 專案目錄（預設 .） |
| `--project-name <name>` | 音檔輸出資料夾名稱 |
| `--output-name <name>` | 輸出檔名 |
| `--engine, --mode <say\|api>` | TTS 模式（預設 say） |
| `--voice <name>` | macOS say 語音 |
| `--rate <wpm>` | macOS say 語速 |
| `--speech-rate <factor>` | 語速倍率（如 1.2） |
| `--api-endpoint <url>` | Alibaba Cloud TTS 端點 |
| `--api-model <name>` | API 模型（預設 qwen3-tts） |
| `--api-voice <name>` | API 語音（預設 Cherry） |
| `--api-key <key>` | API 金鑰 |
| `--max-chars <n>` | 每段 TTS 最大字數 |
| `--no-auto-prosody` | 停用標點停頓增強 |
| `--force` | 覆蓋既有檔案 |

## 輸出結構
```
<project-dir>/audio/<project-name>/
├── voice-<timestamp>.aiff
├── voice-<timestamp>.timeline.json
└── voice-<timestamp>.srt
```

## 注意事項
- say 模式需要 macOS 的 `say` 指令
- api 模式需要有效的 API key 與 `ffmpeg`（用於多段合併）
