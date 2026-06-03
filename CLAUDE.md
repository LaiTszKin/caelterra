# Apollo Toolkit

## Common Development Commands

- `npm test` - 執行 Node 測試套件（`node --test`）。
- `npm run build` - 完整構建所有套件。
- `node dist/bin/apollo-toolkit.js [mode...]` - 啟動 CLI，安裝技能至目標（codex/openclaw/trae/agents/claude-code/all）。
- `node dist/bin/apollo-toolkit.js uninstall [mode...]` - 從目標移除 Apollo Toolkit 技能。
- `node dist/bin/apollo-toolkit.js tools` - 列出所有內建 CLI 工具及其分類。
- `node dist/bin/apollo-toolkit.js <tool> [args...]` - 執行內建工具（如 `codegraph`、`architecture`、`filter-logs`）。
- `apltk codegraph <subcommand> [options]` - CodeGraph 程式碼智慧工具（init/sync/status/search/explore/survey/list-apis/verify）。
- `apltk architecture [diff|merge|apply|template]` - 架構圖管理與 spec overlay 操作。
- `apltk eval <skill>` - LLM-as-Judge 技能評測。
- `apltk validate-skill-frontmatter` - 驗證技能 SKILL.md frontmatter 格式。
- `apltk validate-openai-agent-config` - 驗證技能 agents/openai.yaml 設定。
- `./scripts/install_skills.sh [mode...]` - 本機 shell 腳本安裝技能。

## Project Business Goals

- Provide a curated set of reusable agent skills installable into Codex, OpenClaw, Trae, Agents, and Claude Code skill directories.
- Enable spec-first software delivery with deterministic tooling: feature planning, tree-sitter-backed code discovery, architecture diff with verification, code review, systematic debugging, release management.
- Support evidence-based research, media generation, and educational content workflows.
- Automate platform workflows: GitHub issue/PR operations and blockchain development (Solana, Jupiter).
- Keep skills focused and composable; split shared capabilities into dedicated skills when multiple workflows depend on them.

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

## Prohibitions

- 禁止直接安裝未提交的技能改動
- 禁止建立自動 database migrations
- 禁止未經 code review 直接合併 spec 實作分支
- 禁止手動編輯 `.codegraph/codegraph.db`（由 CodeGraph 內部管理）
- `in:`、`out:` 等包含冒號的 YAML 值必須使用引號（`'projectRoot: string'`）
