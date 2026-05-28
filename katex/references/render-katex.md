# apltk render-katex — KaTeX 數學公式渲染

## 用途
將 TeX 數學公式渲染為可直接插入的 KaTeX 輸出。

## 用法
```
apltk render-katex [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--tex <string>` | 原始 TeX 表達式（不含分隔符） |
| `--input-file <path>` | 包含 TeX 的文字檔案 |
| `--output-format <format>` | html-fragment（預設）/ html-page / markdown-inline / markdown-block / json |
| `--katex-format <format>` | html / mathml / htmlAndMathml（預設） |
| `--display-mode` | 顯示模式（置中獨立行） |
| `--output-file <path>` | 寫入檔案 |
| `--css-href <url>` | 樣式表 URL（預設 KaTeX CDN） |
| `--title <text>` | html-page 的文件標題 |
| `--lang <code>` | HTML lang 屬性（預設 en） |

## 輸出格式說明
- **html-fragment**: 插入 HTML、MDX、JSX
- **html-page**: 獨立 HTML 預覽檔
- **markdown-inline**: Markdown 內聯
- **markdown-block**: Markdown 區塊
- **json**: 機器可讀 JSON

## 注意事項
- 渲染結果需要 KaTeX CSS 才能正確顯示
- 預設使用 htmlAndMathml 格式以支援無障礙
