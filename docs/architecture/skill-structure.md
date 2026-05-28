# 技能結構設計原則

## 每技能一目錄

每個技能是 `skills/` 下的 kebab-case 目錄，根目錄包含 `SKILL.md` 作為技能進入點。CLI 透過掃描 `skills/` 下含 `SKILL.md` 的子目錄來發現技能清單。

## Frontmatter 最小化

`SKILL.md` 的 YAML frontmatter 僅包含兩個必要欄位：`name`（kebab-case，須與目錄名稱一致）與 `description`（一行觸發描述，最長 1024 字元）。無版本、作者或其他元資料。此設計由 `apltk validate-skill-frontmatter` 強制執行。

## 標準化主體結構

技能採用標準化區塊序列：目標（技能存在的理由）→ 驗收條件（可量化的完成狀態）→ 工作流程（編號步驟）→ 使用範例（轉換前後配對）→ 參考資料（指向 `references/` 的連結）。較成熟的技能另包含 `## Dependencies` 與 `## Standards` 區塊，分別管理技能依賴與執行品質約束。

## 選擇性擴充目錄

技能可依需求包含以下子目錄：
- `agents/openai.yaml`：OpenAI 相容的代理人介面定義（幾乎所有技能必備）
- `references/`：補充說明文件、模板與格式指南
- `scripts/`：可執行輔助腳本（Python/Shell），由 `lib/tool-runner.ts` 中的 TypeScript handler 直接調用
- `tests/`：與腳本配對的 Python 測試
- `assets/`：靜態資源檔案
- `lib/`：完整子專案（僅 `init-project-html` 的 atlas 系統）
