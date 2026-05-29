# Apollo Toolkit

## Common Development Commands

- `npm test` - 執行 Node 測試套件（`node --test`）。
- `node dist/bin/apollo-toolkit.js [mode...]` - 直接從倉庫啟動 CLI，將技能安裝至指定目標（codex/openclaw/trae/agents/claude-code/all）。
- `node dist/bin/apollo-toolkit.js uninstall [mode...]` - 從指定目標移除已安裝的 Apollo Toolkit 技能。
- `node dist/bin/apollo-toolkit.js tools` - 列出所有內建 CLI 工具及其分類。
- `node dist/bin/apollo-toolkit.js <tool> [args...]` - 執行內建工具（如 `filter-logs`、`search-logs`、`architecture`、`create-specs` 等）。
- `node dist/bin/apollo-toolkit.js architecture [diff|merge]` - 開啟專案 HTML 架構圖、搭配 `diff` 產生分頁式 before/after 檢視器，或使用 `merge --spec <dir>` 將 spec 的架構變更合併至基礎架構圖。
- `node dist/bin/apollo-toolkit.js eval <skill>` - 對指定技能執行自動化評測（LLM-as-Judge），產出結構化報告和優化 diff。
- `apltk validate-skill-frontmatter` - 驗證 `skills/` 下所有技能 `SKILL.md` 的 frontmatter 格式與命名規範。
- `apltk validate-openai-agent-config` - 驗證所有技能 `agents/openai.yaml` 的設定完整性。
- `./scripts/install_skills.sh [mode...]` - 透過本地 shell 腳本安裝技能（非 npm 安裝方式）。

## Project Business Goals

- Provide a curated set of reusable agent skills installable into Codex, OpenClaw, Trae, Agents, and Claude Code skill directories.
- Enable spec-first software delivery: feature planning, implementation (including parallel subagents and worktree isolation), code review, systematic debugging, and release management.
- Support evidence-based research (deep research, financial analysis, API fingerprinting), media generation (video, audio, storyboard), and educational content (PDF exams, error books, KaTeX rendering).
- Automate platform workflows: GitHub issue/PR operations and blockchain development (Solana, Jupiter).
- Keep skills focused, composable, and easy to reuse; split shared capabilities into dedicated skills when multiple workflows can depend on them.

## Project Documentation Index

- `docs/features/skill-installation.md` - 安裝、解除安裝與使用內建工具
- `docs/features/software-development.md` - spec 驅動的開發生命週期
- `docs/features/research-and-content.md` - 研究、媒體與教育內容生成
- `docs/features/platform-automation.md` - GitHub、區塊鏈與 OpenClaw 自動化
- `docs/features/catalog-maintenance.md` - 技能優化、記憶管理、記帳與驗證
- `docs/architecture/cli-architecture.md` - CLI 設計：命令調度、工具註冊、更新檢查
- `docs/architecture/installer-architecture.md` - 安裝器設計：原子同步、manifest 追蹤、連結模式
- `docs/architecture/skill-structure.md` - 技能目錄佈局、frontmatter 規範、選擇性擴充
- `docs/principles/naming-conventions.md` - 命名慣例：kebab-case、文件命名、工具命名
- `docs/principles/skill-development.md` - 技能開發慣例：frontmatter、主體結構、依賴宣告
- `docs/principles/testing-conventions.md` - 測試慣例：node:test、隔離、輸出捕捉
- `README.md` - 公開安裝指南與技能目錄
- `CHANGELOG.md` - 版本發佈歷史
- `LICENSE` - MIT 授權條款
