# apltk render-error-book — Error Book PDF 渲染

## 用途
將結構化 error-book JSON 轉換為 PDF 成品。

## 用法
```
apltk render-error-book [options]
```

## 旗標
| 旗標 | 效果 |
|------|------|
| `--input <path>` | 輸入 JSON 檔案路徑（必要） |
| `--output <path>` | 輸出 PDF 檔案路徑（必要） |

## 位置參數（向後相容）
```
apltk render-error-book input.json output.pdf
```

## 輸出引擎優先順序
1. pandoc + weasyprint
2. pandoc + wkhtmltopdf
3. wkhtmltopdf
4. HTML fallback（無 PDF 轉換工具時寫入 .html）

## 注意事項
- 輸入 JSON 必須符合 templates 定義的結構
- 輸出路徑不存在時自動建立目錄
