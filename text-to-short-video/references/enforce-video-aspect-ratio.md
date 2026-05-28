# apltk enforce-video-aspect-ratio — 影片長寬比修正

## 用途
將影片輸出調整為目標長寬比或尺寸，支援置中裁切與縮放。

## 用法
```
apltk enforce-video-aspect-ratio [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--input, --input-video <path>` | 輸入影片路徑（必要） |
| `--output, --output-video <path>` | 輸出影片路徑 |
| `--in-place` | 直接覆蓋輸入檔案 |
| `--aspect <ratio>` | 目標長寬比（如 9:16、16:9） |
| `--target-size <size>` | 目標尺寸（如 1080x1920） |
| `--target-width <px>` | 目標寬度（像素） |
| `--target-height <px>` | 目標高度（像素） |
| `--force` | 覆蓋既有輸出 |
| `--ffmpeg-bin <path>` | ffmpeg 執行檔（預設 ffmpeg） |
| `--ffprobe-bin <path>` | ffprobe 執行檔（預設 ffprobe） |

## 行為說明
- 長寬比不符合：先置中裁切再縮放
- 長寬比符合但尺寸不同：直接縮放
- 完全符合：複製原檔案

## 注意事項
- 需要 ffmpeg 與 ffprobe 指令
- 可設定環境變數 TEXT_TO_SHORT_VIDEO_WIDTH / TEXT_TO_SHORT_VIDEO_HEIGHT 作為預設目標尺寸
