# apltk extract-pdf-text-pdfkit — macOS PDF 文字提取

## 用途
透過 macOS PDFKit 從 PDF 中提取逐頁文字（不需安裝 Python PDF 套件）。

## 用法
```
apltk extract-pdf-text-pdfkit <path>
```

## 位置參數
| 參數 | 效果 |
|------|------|
| `<path>` | PDF 檔案的絕對路徑（必要） |

## 輸出格式
```
PDF_PATH=/path/to/source.pdf
PAGE_COUNT=12
=== PAGE 1 ===
<page text>
=== PAGE 2 ===
...
```

## 注意事項
- 僅支援 macOS（依賴系統內建 PDFKit）
- 適合低階文字提取，不保留版面、圖表或圖像中的文字
- 若 PDF 為掃描檔（圖像型），此工具無法提取文字，需使用 OCR 替代方案
