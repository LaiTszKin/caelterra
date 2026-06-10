# 命名約定

## 技能目錄：kebab-case

技能目錄名稱使用全小寫字母、數字與連字號組合，符合正則表達式 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。此規則由驗證腳本強制執行，名稱須與 `SKILL.md` frontmatter 中的 `name` 欄位完全一致。

**理由**: kebab-case 在檔案系統、URL 與 CLI 參數中皆安全，避免大小寫敏感性問題。

**範例**: `deep-research-topics`, `open-github-issue`, `implement-with-worktree`

## 根層級文件：大寫無分隔

根目錄的專案文件使用大寫無分隔命名：`AGENTS.md`、`README.md`、`CHANGELOG.md`、`LICENSE`。

**理由**: 遵循 GitHub 生態系的慣例，這些檔案在倉庫瀏覽中會被特別渲染。

## JavaScript 模組：kebab-case

`lib/` 目錄中的 Node.js 模組使用 kebab-case：`cli.js`、`installer.js`、`tool-runner.js`、`updater.js`。

**理由**: 與技能目錄命名風格一致，統一整個倉庫的命名模式。

## 工具命令：連字號分隔多詞

工具註冊名稱使用連字號分隔：`architecture`、`codegraph`、`create-specs`、`create-review-report`、`open-github-issue`、`validate-skill-frontmatter`。

**理由**: CLI 環境中連字號比底線更易輸入，且與 npm script 命名慣例一致。
