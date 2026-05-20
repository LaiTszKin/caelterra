# 技能目錄維護

## 優化技能

- **Given** 現有技能的描述或結構不夠精確
- **When** 使用 `optimise-skill` 技能
- **Then** 推導目標交付物、收緊驗收標準，並將 SKILL.md 重寫為精簡的目標/驗收條件/工作流程/範例/參考資料結構

## 從對話中學習技能

- **Given** Codex 中有最近的成功對話模式
- **When** 使用 `learn-skill-from-conversations` 技能
- **Then** 分析最近對話，萃取可重複使用的技能或改善現有技能

## Codex 記憶管理

- **Given** 需要管理 Codex 的使用者偏好記憶
- **When** 使用 `codex-memory-manager` 技能
- **Then** 回顧最近 24 小時的對話，將可重複使用的偏好儲存為記憶文件，並同步記憶索引至 `~/.codex/AGENTS.md`

## 記帳與財務

- **Given** 使用者需要記錄收入、支出或資產變動
- **When** 使用 `record-spending` 技能
- **Then** 在每月 Excel 活頁簿中維護多帳戶明細，含公式計算、彙總分析與圖表

- **Given** 使用者需要新增或重新命名帳戶
- **When** 在記帳流程中提出
- **Then** 更新 `ACCOUNT.md` 與受影響的活頁簿，保留歷史資料與公式

## 功能提案

- **Given** 使用者從現有程式碼中發現可提案的功能
- **When** 使用 `feature-propose` 技能
- **Then** 產出結構化的功能提案，通過後可對外發佈

## 目錄驗證

- **Given** 技能目錄中的 SKILL.md 被修改過
- **When** 執行 `apltk validate-skill-frontmatter`
- **Then** 驗證所有頂層技能的 frontmatter 格式、必要欄位與命名規範

- **Given** 技能目錄中的 OpenAI agent 配置被修改過
- **When** 執行 `apltk validate-openai-agent-config`
- **Then** 驗證所有技能的 `agents/openai.yaml` 符合規範
