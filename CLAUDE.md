# Apollo Toolkit

## Common Development Commands

- Before using any `apltk` or `node dist/bin/apollo-toolkit.js` command, run the corresponding `--help` command first and follow the live CLI guidance rather than memorized flags.
- `pnpm test` - Run Node test suite (`node --test`).
- `pnpm run build` - Full build of all packages (tsc --build).
- `pnpm lint` - Run ESLint strict-type-checked across all packages.
- `pnpm lint:fix` - Run ESLint with autofix.
- `pnpm format` - Format all files with Prettier.
- `pnpm format:check` - Check formatting without writing.
- `node dist/bin/apollo-toolkit.js [mode...]` - Start CLI, install skills to targets (codex/openclaw/trae/agents/claude-code/all).
- `node dist/bin/apollo-toolkit.js uninstall [mode...]` - Remove Apollo Toolkit skills from targets.
- `node dist/bin/apollo-toolkit.js tools` - List all built-in CLI tools and their categories.
- `node dist/bin/apollo-toolkit.js <tool> [args...]` - Run a built-in tool (e.g., `codegraph`, `architecture`, `create-specs`).
- `apltk codegraph <subcommand> [options]` - CodeGraph codebase exploration tool. Run `apltk codegraph --help` and subcommand help before using it.
- `apltk architecture [add|remove|diff|merge|render|open]` - Architecture atlas management and spec overlay operations.
- `apltk eval <skill>` - LLM-as-Judge skill evaluation.
- `apltk validate-skill-frontmatter` - Validate SKILL.md frontmatter format.
- `apltk validate-openai-agent-config` - Validate agents/openai.yaml configuration.
- `./scripts/install_skills.sh [mode...]` - Local shell script to install skills.
- `apltk auto-update enable|disable|status|run` - Manage background skill auto-update. Run `apltk auto-update --help` before using.

## Project Business Goals

- Provide a curated set of reusable agent skills installable into Codex, OpenClaw, Trae, Agents, and Claude Code skill directories.
- Enable spec-first software delivery with deterministic tooling: feature planning, tree-sitter-backed code discovery, architecture diff with verification, code review, systematic debugging, release management.
- Support evidence-based research, media generation, and educational content workflows.
- Automate platform workflows: GitHub issue/PR operations and blockchain development (Solana, Jupiter).
- Keep skills focused and composable; split shared capabilities into dedicated skills when multiple workflows depend on them.

## Project Documentation Index

- `docs/features/skill-installation.md` - Install, uninstall, and use built-in tools
- `docs/features/software-development.md` - Spec-driven development lifecycle
- `docs/features/research-and-content.md` - Research, media, and educational content generation
- `docs/features/platform-automation.md` - GitHub, blockchain, and OpenClaw automation
- `docs/features/catalog-maintenance.md` - Skill optimization, memory management, billing, and validation
- `docs/architecture/cli-architecture.md` - CLI design: command dispatch, tool registration, update checks
- `docs/architecture/installer-architecture.md` - Installer design: atomic sync, manifest tracking, link modes
- `docs/architecture/skill-structure.md` - Skill directory layout, frontmatter conventions, optional extensions
- `docs/principles/naming-conventions.md` - Naming conventions: kebab-case, documentation naming, tool naming
- `docs/principles/skill-development.md` - Skill development conventions: frontmatter, body structure, dependency declarations
- `docs/principles/testing-conventions.md` - Testing conventions: node:test, isolation, output capture
- `docs/README.md` - Documentation structure, maintenance guidelines, and drift detection
- `README.md` - Public installation guide and skill catalog
- `CHANGELOG.md` - Release history
- `LICENSE` - MIT License
- `packages/cli/CLAUDE.md` - CLI command management module
- `packages/tool-registry/CLAUDE.md` - Tool registration and dispatch module
- `packages/tool-utils/CLAUDE.md` - Shared tool utilities module
- `packages/tui/CLAUDE.md` - Terminal UI components module
- `packages/tools/architecture/CLAUDE.md` - Architecture atlas tool
- `packages/tools/codegraph/CLAUDE.md` - CodeGraph codebase exploration tool
- `packages/tools/create-review-report/CLAUDE.md` - Review report generation tool
- `packages/tools/create-specs/CLAUDE.md` - Spec generation tool
- `packages/tools/eval/CLAUDE.md` - LLM-as-Judge evaluation tool
- `packages/tools/find-github-issues/CLAUDE.md` - GitHub issue search tool
- `packages/tools/open-github-issue/CLAUDE.md` - GitHub issue creation tool
- `packages/tools/read-github-issue/CLAUDE.md` - GitHub issue reader tool
- `packages/tools/review-threads/CLAUDE.md` - Review thread management tool
- `packages/tools/validate-openai-agent-config/CLAUDE.md` - OpenAI agent config validator tool
- `packages/tools/validate-skill-frontmatter/CLAUDE.md` - Skill frontmatter validator tool

## Prohibitions

- Do not install uncommitted skill changes directly.
- Do not create automated database migrations.
- Do not merge spec implementation branches without code review.
- Do not manually edit `.codegraph/codegraph.db` (managed internally by CodeGraph).
- YAML values containing colons (`in:`, `out:`, etc.) must be quoted (e.g., `'projectRoot: string'`).
