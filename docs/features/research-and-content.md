# 研究與內容生成

## 影片生成

- **Given** 使用者需要從文字提示產生短影片
- **When** 使用 `text-to-short-video` 技能
- **Then** 產生 30-60 秒的短片

- **Given** 使用者需要從小說或文字內容產生循環短影片
- **When** 使用 `novel-to-short-video` 技能
- **Then** 產生包含生成素材的循環式短影片

- **Given** 使用者需要長片製作
- **When** 使用 `video-production` 技能
- **Then** 依 storyboard、語音、Remotion 渲染的流程產出長片

## 故事板圖片生成

- **Given** 使用者有章節、劇本或場景描述
- **When** 使用 `openai-text-to-image-storyboard` 技能
- **Then** 產生對應的故事板圖片集

## PDF 教材與測驗

- **Given** 使用者有講義 slides、歷屆試題與解答本
- **When** 使用 `exam-pdf-workflow` 技能
- **Then** 產生模擬考試、詳解、學習筆記或含 KaTeX 數學公式的評分 PDF

- **Given** 使用者有結構化的錯誤題庫 JSON
- **When** 使用 `learning-error-book` 技能
- **Then** 產出選擇題與申論題分離的錯誤本 PDF
