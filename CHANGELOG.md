# Changelog

All notable changes to this repository are documented in this file.

## [v4.1.1] - 2026-06-04

### Added

- **Evidence model enhancement**: `--evidence` now auto-parses `file:line` format (`observed:src/foo.ts:42`) into structured `sourceFile`/`sourceLine` fields. Rendered as visible source location badges in the submodule HTML pages.
- **CodeGraph help system**: Per-subcommand `--help` for all 8 codegraph subcommands (`init`, `sync`, `status`, `search`, `explore`, `survey`, `list-apis`, `verify`), plus `help` subcommand and enhanced main help with examples.
- **YAML apply evidence propagation**: Feature, submodule, function, and edge mutations in `apltk architecture apply` now persist `evidence` fields from YAML input.
- `scripts/test.sh`: Split test runner that isolates `mock.module`-dependent tests, resolving a Node.js 24.x IPC deserialization flaky-test issue.

### Changed

- **init-project-html SKILL.md → English**: Full translation, C4 Code level marked as mandatory (not optional), "must read" references changed to optional lookup, acceptance criteria condensed, self-review step added.
- **update-project-html SKILL.md → English**: Full translation plus all the same optimizations (C4 fix, optional lookup, self-review, condensed criteria, updated evidence CLI examples).
- Both skills' reference files (`architecture.md`, `definition.md`) translated to English; duplicate C4 tables removed from `definition.md`.
- `.gitignore`: broadened `assets/spec/rg*-*/` pattern to cover all generated test artifacts.

## [v4.1.0] - 2026-06-03

### Added

- **CodeGraph integration**: New `apltk codegraph` CLI with 8 subcommands (init/sync/status/search/explore/survey/list-apis/verify) powered by [@colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) — a tree-sitter-backed code knowledge graph engine.
  - `init` — initialize `.codegraph/` SQLite database and optionally run full index
  - `sync` — incremental index refresh
  - `status` — query index statistics (files, nodes, edges, languages)
  - `search` — full-text symbol search via FTS5
  - `explore` — deep-dive on a symbol (callers, callees, source context)
  - `survey` — directory scan with connected-component analysis, submodule grouping, and cross-boundary edge suggestions
  - `list-apis` — list public API surface per feature, with `--all` flag for non-exported symbols
  - `verify` — validate spec architecture overlays against actual CodeGraph index
- `init-project-html` skill: step 1 uses `codegraph survey` for project structure discovery.
- `design` skill: step 5e includes `apltk codegraph list-apis --all` for API surface enumeration.
- Architecture atlas: 3 new external actors (tool-registry, tui-lib, codegraph-npm), 6 new cross-feature edges forming complete eval pipeline, 13 new function I/O details across eval submodules.
- `packages/tools/codegraph/env.d.ts`: type declarations for `@colbymchenry/codegraph` API.
- Lazy import pattern (`getCodeGraphModule`) for graceful MODULE_NOT_FOUND handling.
- Regression tests: flag-splice (`--all`/`--index`), init check for status/search, edge relationship validation.

### Changed

- `apltk` global CLI permission: ensure `dist/bin/apollo-toolkit.js` has executable bit after `tsc --build`.
- `rewrite-imports.test.js`: relax TOOL_MODULE_NAMES assertion to accept bare specifier format.

### Documentation

- README: add CodeGraph integration section with credit to [@colbymchenry/codegraph](https://github.com/colbymchenry/codegraph).
- CLAUDE.md, AGENTS.md: add `codegraph` and `architecture apply/template` commands; add prohibitions block.
- Architecture atlas re-rendered with updated summary, enriched actors/edges/functions.

## [v4.0.11] - 2026-06-02

### Changed

- All skills: made parallel subagent usage the default by removing conditional "if subagents are available" language across 11 SKILL.md files and review/README.md.

### Fixed

- `architecture` tool: use `pathToFileURL()` for ESM `import()` to ensure Windows compatibility (backslash paths break dynamic imports on Windows).
- `rewrite-imports` script: normalize relative paths to forward slashes for ESM import compatibility on Windows.

### Added

- `test/rewrite-imports.test.js`: regression test verifying forward-slash normalization in `rewrite-imports.mjs`.

## [v4.0.10] - 2026-06-01

### Documentation

- `design`, `plan`, `qa`, `spec` skills: standardized output file path references in acceptance criteria to `docs/plans/<YYYY-MM-DD>/<spec_name>/` format for consistency with actual output layout.

## [v4.0.9] - 2026-05-31

### Changed

- All skills: SKILL.md headers standardized from Chinese to English (Goal, Acceptance Criteria, Workflow, Examples, References) for cross-platform agent compatibility.
- All skills: `description` frontmatter field changed from Chinese to English for better discoverability.
- All templates (CHECKLIST.md, DESIGN.md, PROPOSAL.md, SPEC.md, REPORT.md, FIX.md, PROMPT.md): content translated to English.
- All reference files (architecture.md, definition.md, create-specs.md, etc.): content translated to English.
- `design` skill: added decision gate table for research phase — blocking issues now trigger STOP before architecture design begins (✅/⚠️/🛑 assessment matrix with explicit escalation rules).
- `design` skill: research outputs now use structured tables (feasibility assessment, reference implementations, dependency compatibility) instead of prose lists.
- `optimise-skill` skill: significantly expanded with new methodology — category classification (Behavioral vs Format vs Tool), consumption chain tracing, contradiction detection, restructuring workflow, and self-review checklist.
- `test-case-strategy` skill: restructured with clearer decision framework — risk assessment matrix (Likelihood × Impact), test boundary heuristics, and streamlined workflow steps.
- `systematic-debug` skill: improved error type classification table with clearer characteristics and approaches.
- `discuss` skill: refined structured clarification workflow with plain-language dimension descriptions.
- `qa` skill: added fix history condensation step for iterative FIX.md regeneration.
- Skills no longer reference `agents/openai.yaml` in SKILL.md workflow steps (OpenAI configs are maintained separately via `apltk validate-openai-agent-config`).

### Documentation

- `docs/principles/skill-development.md`: updated standard section sequence to English headers; replaced "中文優先" directive with "英文為主".
- `docs/architecture/skill-structure.md`: updated standardized block sequence to English headers.
- `docs/features/catalog-maintenance.md`: updated `optimise-skill` description to reference new English section names.

## [v4.0.8] - 2026-05-30

### Changed

- `discuss` skill: now produces high-level module design (PROPOSAL.md) through conversation only; explicitly does not read any repo files. Added step 3a for functional module breakdown with module responsibilities and collaboration relationships.
- `spec` skill: must dispatch parallel subagents to research the repo before generating SPEC.md (can skip for brand new repos). Ensures every requirement's scope and boundary aligns with actual codebase state.

## [v4.0.7] - 2026-05-30

### Changed

- `qa` skill: add no-defer enforcement — FIX.md must cover all issues from REPORT.md (including P2/P3) with complete fix plans and worker prompts. No issue may be deferred to a future round or marked as "later". Large issue sets are handled via batch scheduling rather than omission.
- `qa` skill template (FIX.md): add NEVER-defer rule to Section 12 Boundaries, so the constraint propagates to the fix coordinator agent.

## [v4.0.6] - 2026-05-30

### Changed

- `design` skill: support batch specs — read all SPEC.md files under a batch directory, produce a single unified DESIGN.md + CHECKLIST.md + Architecture Diff covering the entire batch scope. Updated workflow steps (判断規格類型, 統一調研, 統一設計, 統一驗證策略) and added batch spec example.
- `design` skill: add mandatory test coverage requirements to CHECKLIST.md generation — all public functions must have unit tests, medium-risk paths (I/O, external deps, state changes) must have integration or property-based tests, high-risk paths (cross-module, financial/auth/data consistency) must have E2E or integrated PBT.
- `review` skill: restructure from six per-dimension subagents to per-requirement subagents — each subagent reviews one spec requirement across all six review dimensions (幻覺/冗余/偏移/遺漏/架構/性能). Cross-subagent finding overlap is handled at synthesis phase.
- `implement`/`fix` skills: remove worktree isolation pattern — coordinator no longer creates isolated worktrees for workers; conflicts are resolved directly by the coordinator. Worker merge step removed from workflow. Related `isolation-guidance.md` reference document deleted.
- `implement` skill OpenAI agent config: update description to match new coordinator-worker model.

### Fixed

- `design` skill: add missing batch spec example to workflow examples section.

### Documentation

- `docs/features/software-development.md`: remove worktree isolation section to reflect current implement/fix skill implementation.

## [v4.0.5] - 2026-05-29

### Added

- `REPORT.md` template: add Review History section for preserving past review round summaries across multiple review sessions.
- `FIX.md` template: add Fix History section (Section 11) for preserving past fix round summaries across multiple fix sessions; Boundaries renumbered to Section 12.

### Changed

- `review` skill: when an old REPORT.md exists, archive its verdict and findings summary into the Review History section before overwriting with the new review result.
- `fix` skill: when an old FIX.md exists, archive its fix summary into the Fix History section before overwriting with the new fix plan.
- `create-review-report` CLI tool: update description to match current terminology.

## [v4.0.4] - 2026-05-29

### Changed

- Refactor `plan`/`implement`/`qa`/`fix` skills for coordinator-worker agent model. PROMPT.md and FIX.md are now self-contained coordinator prompts: main agent only coordinates (delegation, synthesis, verification), workers are leaf nodes that receive pre-written self-contained task prompts. FIX.md now includes concrete regression test design with dedicated worker prompts and batch scheduling.

## [v4.0.3] - 2026-05-29

### Fixed

- Add `chalk` and `@inquirer/prompts` to root dependencies so CLI works when installed globally. After rewriting `@laitszkin/*` imports to relative paths in v4.0.2, the workspace packages' external dependencies were not installed because only root dependencies are resolved during global install.

## [v4.0.2] - 2026-05-29

### Fixed

- Fix global npm install: rewrite `@laitszkin/*` package imports to relative paths so CLI works when installed globally. Workspace sub-packages are not published to npm; bare specifier imports like `from '@laitszkin/cli'` fail at runtime without this rewrite.

## [v4.0.1] - 2026-05-29

### Added

- `discuss` skill: structured requirements clarification before spec phase. Uses four-dimension questioning (scope, user scenarios, constraints, business value) with mandatory default suggestions and YAGNI/KISS gatekeeping.
- `PROPOSAL.md` template: captures clarified requirements from discuss skill before formal SPEC.md creation.

### Changed

- Rewrite `PROMPT.md` template: from third-person project-management document to second-person self-contained AI execution prompt. New structure includes Mission, Technical Context (inlined from DESIGN.md), task-level verification, behavior check mapping (from CHECKLIST.md), and self-contained subagent prompts.

## [v4.0.0] - 2026-05-29

### Changed

- **Breaking:** Migrate from single CommonJS package to npm workspaces monorepo with ESM (`"type": "module"`, `"module": "NodeNext"`).
- **Breaking:** Split codebase into scoped packages: `@laitszkin/cli`, `@laitszkin/tui`, `@laitszkin/tool-registry`, `@laitszkin/tool-utils`, and 20 `@laitszkin/tool-*` packages.
- **Breaking:** Replace static `require()` with dynamic `import()` for lazy tool loading; CLI no longer loads all tool handlers at startup.
- **Breaking:** CLI entry point now at `dist/bin/apollo-toolkit.js`; old `bin/apollo-toolkit.js` removed.
- Tool registration uses `isKnownToolName()` (sync, Set-based) for argument parsing and `registerAllTools()` (async, `Promise.all` dynamic import) for tool dispatch.
- Add `aliases` field to `ToolDefinition` interface; `registerTool()` auto-registers aliases with canonical name tracking.
- Add `Subagent Prompt` blocks to `PROMPT.md` and `FIX.md` plan/qa templates.

### Fixed

- Correct `sourceRoot` path in compiled entry point so `apltk architecture` and other tools resolve `package.json` correctly.
- Prevent crash in `open-github-issue` when `TEXT_FIELDS` snake_case keys are read against camelCase argument object.
- Include actual tool names and aliases in `isKnownToolName` so `extract-pdf-text-pdfkit` and aliased tools are recognized.

### Removed

- Remove `yargs` and `js-yaml` from CLI package dependencies.
- Remove dead `buildToolOverview()` and `buildToolExamples()` from tool-registry.
- Remove `yargsCommand` export blocks from all 19 tool modules.
- Delete stale CJS entry point (`bin/apollo-toolkit.js`) and legacy `dist/lib/` build artifacts.

## [v3.18.0] - 2026-05-29

### Added

- `plan` skill: converts SPEC.md + DESIGN.md + CHECKLIST.md into PROMPT.md with task decomposition, dependency analysis, batch scheduling, and subagent routing.
- `design` skill: research-first technical design (feasibility, existing implementations, compatible tech stack) producing DESIGN.md, CHECKLIST.md, and Architecture Diff.
- `qa` skill (new): converts REPORT.md + spec documents into FIX.md with fix dependency analysis, file overlap detection, batch scheduling, and subagent routing.
- `review` skill: renamed from old `qa`, produces REPORT.md (issue list only, no solutions).

### Changed

- Refactor spec skill to only produce SPEC.md (pure business requirements). BDD requirements > 5 triggers batch spec; each spec focuses on 3-5 requirements.
- Delete unused spec templates: tasks.md, checklist.md, contract.md, design.md, coordination.md, preparation.md.
- Update `implement` skill to read PROMPT.md and execute mechanically (no coordination decisions).
- Update `fix` skill to read FIX.md and execute mechanically (no planning decisions).
- Update `develop-new-features` skill to follow the spec → design → plan → implement four-phase pipeline.
- Simplify `apltk create-specs` CLI to only generate SPEC.md (remove --with-coordination / --with-preparation).
- Update `apltk create-review-report` CLI: output REPORT.md, support SPEC.md and spec.md detection.

### Removed

- `implement-with-subagents` skill: coordination logic moved to `plan`, execution merged into `implement`.

## [v3.17.3] - 2026-05-28

### Docs

- Add apltk tool reference files to 17 skills, covering all CLI flags, parameters, output formats, and usage notes for each tool.

## [v3.17.2] - 2026-05-28

### Docs

- Limit each spec to at most 3 user requirements.

## [v3.17.1] - 2026-05-28

### Docs

- Add regression testing step to fix skill workflow.

## [v3.17.0] - 2026-05-27

### Added

- atlas CLI: `scan` verb with structured validation and automated fix commands.
- atlas CLI: `status` verb and `--dry-run` flag for previewing changes before applying.
- atlas CLI: `--evidence` flag and automatic mode detection for context-aware CLI behavior.

### Changed

- Refactor atlas CLI: extract help and diff-viewer modules from monolithic cli.js, narrow state.js and schema.js public API surfaces.
- Upgrade `@types/node` to ^25.9.1 and set minimum Node.js engine to >=20.19.0.
- Remove unused skill directories to reduce repository footprint.

### Fixed

- Resolve fourth and fifth round QA findings across atlas CLI modules, documentation, and module exports.

### Docs

- Add implementation specs for atlas CLI optimization covering all six objectives (O1-O6).
- Archive completed atlas-cli-optimization spec.

## [v3.16.0] - 2026-05-25

### Added

- `test-case-strategy/references/integrated-pbt.md`: stateful/state machine property-based testing reference with 3 integration levels (sequential, contract+PBT, concurrent) and decision flow.
- `test-case-strategy/references/contract-tests.md`: contract testing reference for parallel development boundary verification.
- `fix/assets/templates/fix-summary.md`: structured fix summary output template.
- `implement/references/isolation-guidance.md`: decision guidance for worktree isolation vs quick path.
- `spec/references/spec-quality-checklist.md`: spec delivery self-review checklist.

### Changed

- Restructure `systematic-debug` skill: error classification (6 types), debugging method selection guide (HDD/5Whys/FTA/KT IS/IS NOT), Red Flags list (11 items), Rule of Three, Assumption Ledger, and No Root Cause handling procedure.
- Rewrite `test-case-strategy` skill: replace "choose a shape" with risk-driven decision framework (風險→邊界→驗證機制), integrated PBT decision line, and updated references.
- Merge `implement-with-worktree` into `implement` skill: unified entry point with isolation vs quick path decision, pre-flight check, scope guard, drift handling, and conflict resolution.
- Enhance `implement-with-subagents` skill: Scope Contract, file overlap detection (git merge-tree), lockfile handling rules, error recovery (retry once, partial success), and batch boundary verification.
- Restructure `spec` skill architecture diff generation (Step 7) with C4 model layers (Context→Container→Component→Code), baseline drift measurement, context economy, and evidence traceability linking declarations to spec tasks.
- Optimize `init-project-html` skill: C4 model alignment with layer mapping table, progressive disclosure (System Context first), evidence traceability with source file references, and sample-demo-driven workflow.
- Optimize `update-project-html` skill: drift threshold mechanism (<20% incremental, ≥20% notify), diff noise filtering (formatting/config/test/comments), context economy (read only affected features), and pre/post drift measurement.
- Optimize `docs-project` skill: claim traceability with confidence score model (Direct/Indirect/Inferred/Speculative), LLM safety principle (structured metadata only, no raw source), incremental update guidance, and periodic drift detection cycle.
- Optimize `maintain-project-constraints` skill: AGENTS.md vs CLAUDE.md role differentiation (Codex vs Claude Code), 100-line limit, prohibitions extraction from past issues/commit history, and docs index auto-sync guidance.
- Standardize C4 model layer mapping in definition.md across `init-project-html`, `update-project-html`, and `spec` skills.

## [v3.15.24] - 2026-05-25

### Changed

- Refine `spec` skill: add step to read existing architecture diagrams before defining new module structures.
- Refine `docs-project` skill: clarify that template docs should be read before rewriting project documentation.

## [v3.15.23] - 2026-05-25

### Changed

- Strengthen subagent dispatch wording in `fix` and `qa` skills: change from recommendation ("建議") to requirement ("必須").

## [v3.15.22] - 2026-05-25

### Changed

- Refine subagent workflow in `fix` skill: add fallback path when subagents are unavailable.

## [v3.15.21] - 2026-05-25

### Changed

- Refine subagent wording in `qa` skill: clarify that six subagents should be dispatched in parallel.

## [v3.15.20] - 2026-05-24

### Changed

- Refine subagent workflow in `fix` skill: restructure independent/non-independent issue batching and require `systematic-debug` skill usage in subagents.
- Refine subagent workflow in `implement-with-subagents` skill: require dedicated worktree per subagent and use `implement-with-worktree` skill.

## [v3.15.19] - 2026-05-24

### Changed

- Refine subagent workflow in `implement-with-subagents` skill: require creating spec-specific branch and worktree before launching subagent, and use `implement` skill instead of `implement-with-worktree`.

## [v3.15.18] - 2026-05-24

### Added

- Add `apltk architecture merge` verb to apply spec `architecture_diff/` overlays to the base atlas state, with `--spec <dir>` and `--all` batch mode support.
- Add `--clean` flag to `merge` for removing overlay directories after successful application.
- Create undo snapshot before merge so `apltk architecture undo` can revert the operation.
- Document architecture merge workflow in `docs/features/software-development.md`.

## [v3.15.17] - 2026-05-23

### Changed

- Refine skill instructions in `commit` and `update-project-html` skills.

## [v3.15.16] - 2026-05-23

### Changed

- Clarify subagent workflow instructions in `fix` and `implement-with-subagents` skills.

## [v3.15.15] - 2026-05-23

### Added

- Add hallucination review instruction reference to qa skill documentation.

## [v3.15.14] - 2026-05-23

### Changed

- Clarify code review pass criteria in qa skill documentation.

## [v3.15.13] - 2026-05-22

### Changed

- Expand `fix` skill subagent workflow with dependency-aware batching guidance.
- Split `qa` skill dimension review into dedicated subagents per dimension; add PASS/NOT PASS result criteria to report template.
- Restructure `spec` skill architecture diagram creation into actionable steps.

## [v3.15.12] - 2026-05-22

### Changed

- Clarify `--batch-name` guidance in `create-specs` help text: add output layout description and warn that batch names should not include date prefixes.
- Add runtime warning when `--batch-name` starts with a YYYY-MM-DD pattern to prevent nested date folders.

## [v3.15.11] - 2026-05-22

### Changed

- Add spec conflict avoidance note to qa skill documentation: review suggestions must not conflict with spec requirements.

## [v3.15.10] - 2026-05-21

### Changed

- Optimize all 17 skill descriptions for clarity and conciseness.

## [v3.15.9] - 2026-05-21

### Changed

- Add `apltk create-review-report --help` reference to qa skill documentation.

## [v3.15.8] - 2026-05-21

### Changed

- Update QA skill code review report workflow to use `apltk` CLI tool for template generation.
- Expand code review report template with root cause, fix plan, and verification fields for P0-P3 issues.

## [v3.15.7] - 2026-05-21

### Changed

- Clarify batch spec trigger condition wording in spec skill documentation for broader cross-module scenarios.
- Add guidance for handling non-independent specs within a batch via optional `preparation.md` file.

## [v3.15.6] - 2026-05-21

### Added

- Add `apltk create-review-report` tool that copies the QA code review report template to the appropriate spec directory (batch root for batch specs, alongside spec.md for single specs), with auto-detection and `--force` support.

### Changed

- Simplify `code-review-report.md` template by replacing code block placeholders with concise text descriptions in P0/P1/P2 solution sections.

## [v3.15.4] - 2026-05-20

### Changed

- Clarify fix skill acceptance criteria with explicit P0-P3 scope for issue severity levels.

### Removed

- Remove deprecated `marginfi-development` skill directory and all its reference documents.
- Remove deprecated `openclaw-configuration` skill directory and all its reference documents.
- Remove OpenClaw configuration and Marginfi sections from project documentation.

## [v3.15.3] - 2026-05-20

### Changed

- Enhance fix skill with worktree isolation and merge-back instructions for subagent workflows.

## [v3.15.2] - 2026-05-20

### Changed

- Standardize architecture edge definition acceptance criteria across init-project-html, spec, and update-project-html skills for clearer submodule edge documentation.

## [v3.15.1] - 2026-05-17

### Changed

- Add architecture diagram sync step to commit workflow, ensuring project architecture HTML is updated when code changes affect it.

## [v3.15.0] - 2026-05-16

### Changed

- Move all skill templates from `references/` directories into skill-local `assets/` directories for clearer separation between reference docs and template files.
- Update all internal references (SKILL.md, README.md, agents/openai.yaml, create-specs CLI tool) to point to the new `assets/` paths.

## [v3.14.9] - 2026-05-16

### Fixed

- Prevent double-date-nesting in `apltk create-specs` when `--output-dir` points to an existing date folder; the handler no longer appends today's date again, avoiding a `YYYY-MM-DD/YYYY-MM-DD/` nested structure.

## [v3.14.8] - 2026-05-16

### Fixed

- Fix hardcoded `generate-spec` path references in `lib/tools/create-specs.ts` and `lib/tool-runner.ts` that broke the `apltk create-specs` CLI tool after the skill rename.

## [v3.14.7] - 2026-05-16

### Changed

- Rename `archive-specs` to `archive` for consistency with other short skill aliases.

## [v3.14.6] - 2026-05-16

### Changed

- Rename `generate-spec` to `spec` for consistency with other short skill aliases.

## [v3.14.5] - 2026-05-16

### Changed

- Rename 7 skills with shorter aliases: `align-project-documents` → `docs-project`, `commit-and-push` → `commit`, `implement-specs` → `implement`, `implement-specs-with-subagents` → `implement-with-subagents`, `implement-specs-with-worktree` → `implement-with-worktree`, `review-spec-related-changes` → `qa`, `solve-issues-found-during-review` → `fix`.

## [v3.14.4] - 2026-05-16

### Changed

- Standardize spec template task numbering (P1.x/P2.x, T1.x/T2.x) and simplify SKILL.md description format across skill docs.

## [v3.14.3] - 2026-05-15

### Changed

- Consistently use "並行調度 subagents" wording across 9 SKILL.md to clarify that subagents should be dispatched in parallel.

## [v3.14.2] - 2026-05-15

### Fixed

- Support flags before verb in architecture atlas dispatch, preventing silent default to `open` when `--spec` precedes the verb (e.g., `apltk architecture --spec docs/plans/xxx feature add ...`).

## [v3.14.1] - 2026-05-15

### Fixed

- Replace non-existent `cli.main()` with `cli.dispatch()` in architecture handler, fixing `apltk architecture --help` crash.
- Correct `repoRoot()` path resolution in `validate-openai-agent-config` tool (3 levels up from `dist/lib/tools/` instead of 2) so CI validation finds skill directories.
- Add missing `npm run build` step to publish CI workflow so tests importing from `dist/` resolve correctly.
- Replace removed Python validation scripts (`validate_skill_frontmatter.py`, `validate_openai_agent_config.py`) in CI workflow with their TypeScript CLI equivalents.

## [v3.14.0] - 2026-05-15

### Added

- TypeScript infrastructure (`tsconfig.json`, `lib/types.ts`, `lib/utils/`) for type-safe CLI development.
- TypeScript handlers for all 19 built-in tools under `lib/tools/`, enabling direct function calls via the CLI without subprocess spawning.
- `apltk architecture diff` command for paginated before/after architecture viewers.
- `apltk validate-skill-frontmatter` and `apltk validate-openai-agent-config` CLI commands as TypeScript replacements for the removed Python validation scripts.

### Changed

- Convert CLI core (`lib/cli`, `lib/tool-runner`, `lib/installer`, `lib/updater`, `bin/apollo-toolkit`) from CommonJS JavaScript to TypeScript.
- Port observability tools (`filter-logs`, `search-logs`), GitHub tools (`open-github-issue`, `find-github-issues`, `read-github-issue`, `review-threads`), media tools (`docs-to-voice`, `render-katex`, `render-error-book`, `generate-storyboard-images`, `enforce-video-aspect-ratio`, `extract-pdf-text`), and spec tools (`create-specs`) from Python/Swift/Shell to TypeScript handlers.
- Merge two identical `extract_recent_conversations.py` scripts into a single TypeScript handler supporting both `extract-codex-conversations` and `extract-skill-conversations` CLI commands.
- Replace `init-project-html/scripts/architecture.js` with a TypeScript handler in `lib/tools/architecture.ts`.
- Update installer to stop copying `scripts/` directories (all tool scripts are now natively handled).
- Update all SKILL.md files to reference `apltk <tool-name>` instead of legacy script paths.
- Replace Python validation scripts (`validate_skill_frontmatter.py`, `validate_openai_agent_config.py`) with native TypeScript CLI commands.
- Archive completed TypeScript migration specs and sync project documentation (architecture docs, testing conventions, AGENTS.md, CLAUDE.md) to reflect current TypeScript-based tooling.

### Removed

- All 14 skill-level `scripts/` directories with 18 Python, 2 Shell, 1 Swift, and 2 JavaScript scripts.
- `test/python-scripts.test.js` (Python scripts no longer exist).
- `__pycache__/` and `*.pyc` from `.gitignore` (no more Python assets in the skill tree).
- Old `docs/plans/2026-05-14/` planning artifacts (archived to `docs/archive/`).

## [v3.13.2] - 2026-05-14

### Changed

- Clarify `review-spec-related-changes` subagent dimension scope so each subagent reviews one specific dimension.

## [v3.13.1] - 2026-05-14

### Changed

- Rewrite `AGENTS.md` into a compact project-instructions format focused on development commands, business goals, and documentation index.
- Add project-level `CLAUDE.md` with consistent content.
- Change `optimise-skill` description to Chinese and add section spacing for readability.
- Add architecture diff visualization acceptance criterion to `generate-spec`.

### Added

- Standardized `docs/` structure with feature, architecture, and principle categories.
- Sync `README.md` skill list with the actual curated catalog.

## [v3.13.0] - 2026-05-14

### Changed

- Further tighten SKILL.md files (`archive-specs`, `commit-and-push`, `generate-spec`, `init-project-html`, `maintain-project-constraints`, `merge-changes-from-local-branches`, `solve-issues-found-during-review`, `systematic-debug`, `test-case-strategy`, `update-project-html`, `version-release`) by removing inline examples, standardizing section headings, and simplifying descriptions.

### Added

- `generate-spec/references/definition.md`, `init-project-html/references/definition.md`, `update-project-html/references/definition.md` with shared terminology for feature modules and sub-modules.

### Removed

- Remove `iterative-code-performance`, `iterative-code-quality`, `merge-conflict-resolver`, `spec-to-project-html`, and `submission-readiness-check` skills that are no longer part of the curated catalog.

## [v3.12.1] - 2026-05-14

### Changed

- Rewrite remaining shipped skills (`enhance-existing-features`, `generate-spec`, `init-project-html`, `merge-changes-from-local-branches`, `open-source-pr-workflow`, `optimise-skill`, `review-spec-related-changes`, `solve-issues-found-during-review`, `submission-readiness-check`, `commit-and-push`, `version-release`, `iterative-code-performance`, `iterative-code-quality`, `maintain-project-constraints`, `ship-github-issue-fix`, `spec-to-project-html`, `systematic-debug`) into the compact Chinese-first structure with goal, acceptance criteria, workflow, examples, and references sections.
- Update `AGENTS.md` and `README.md` to remove references to deleted skills and simplify dependency descriptions.

### Removed

- Remove `discover-edge-cases`, `discover-security-issues`, `recover-missing-plan`, `review-change-set`, `review-codebases`, and `scheduled-runtime-health-check` skills that are no longer part of the curated catalog.

## [v3.12.0] - 2026-05-13

### Added

- `maintain-project-constraints` now ships `references/constraint-file-reference.md`, a shared contract/checklist/template for keeping root `AGENTS.md` / `CLAUDE.md` limited to the three required sections.

### Changed

- Rewrite a broad set of shipped skills into a more compact Chinese-first structure built around explicit goal, acceptance, workflow, examples, and reference sections, covering documentation alignment, submission/release, planning, implementation, review, debugging, testing, security, and architecture-atlas workflows.
- Simplify supporting references and wording across the catalog to prefer `repo` / `spec` terminology, point `maintain-project-constraints` at its new shared reference file, and tighten example phrasing in `optimise-skill` plus the standardized docs template.

### Removed

- Remove the now-redundant `archive-specs` reference templates for `architecture`, `docs-index`, `features`, and `principles` after delegating standardized documentation structure guidance to `align-project-documents`.

## [v3.11.8] - 2026-05-12

### Added

- `apltk` now provides task-oriented top-level help for bundled tools, and `apltk architecture --help` can route to action-specific help pages for the atlas CLI.
- `optimise-skill` now ships a dedicated `references/definition.md` reference so the target skill output structure has a separate canonical definition.

### Changed

- Refresh the atlas-related planning docs and command guidance (`generate-spec`, `init-project-html`, `spec-to-project-html`, `update-project-html`) to rely on `apltk architecture --help` as the authoritative command tree and to better explain batch overlays plus subagent responsibilities.
- Expand the bundled CLI help system so `apltk tools <tool> --help` shows curated purpose / use-when / examples before native script help, and align the validator / helper scripts with that layered help flow.
- Refresh multiple shipped skills (`docs-to-voice`, `open-github-issue`, `read-github-issue`, `resolve-review-comments`, `optimise-skill`) and retire the standalone `maintain-skill-catalog` skill while keeping the validator commands available as bundled `apltk` tools.
- Remove brittle text-level workflow assertions from the test suite so repository tests focus on executable CLI and rendering behavior instead of exact prompt wording.

### Fixed

- Keep the public skill inventory and bundled tool metadata consistent after removing `maintain-skill-catalog`, so validator commands no longer reference a deleted skill owner.

## [v3.11.7] - 2026-05-12

### Added

- Add `optimise-skill`, a new catalog skill that reads a target skill and its supporting files, derives the intended deliverable and acceptance criteria, and rewrites the skill into a tighter `goal / acceptance criteria / workflow / examples / references` structure for higher-signal agent execution.

### Changed

- Catalog docs now include `optimise-skill`, and its bundled example reference path is normalized to match the shipped file name.

### Fixed

## [v3.11.6] - 2026-05-12

### Added

- Tests: spec-mode batch-root overlay writes, combined batch diff rendering, legacy HTML-only batch diff fallback, repeated spec render cleanup, and multi-step `undo` coverage for the declarative atlas CLI.

### Changed

- `apltk architecture --spec <spec_dir>` now keeps the existing single-spec layout for standalone plans, but batch member paths resolve to one shared `architecture_diff/` beside `coordination.md` so the whole batch maintains a single overlay and rendered architecture diff.
- `generate-spec` and `spec-to-project-html` now document the shared batch-root overlay behavior and tighten architecture-diff completion criteria: all intended cross-feature edges, feature-to-feature relationships, and sub-module relationships must be declared explicitly through the CLI instead of being left implicit in prose.
- Spec-mode atlas persistence now derives overlay state from the merged proposed-after graph, which lets repeated edits collapse back to a minimal diff automatically and adds `apltk architecture undo --steps <n>` for multi-step rollback.

### Fixed

- `apltk architecture diff` now renders batch specs as one combined macro/viewer result instead of showing separate incomplete macro pages per member spec.
- `apltk architecture diff` preserves compatibility with legacy batch artifacts that only contain rendered HTML plus `_removed.txt`, instead of silently dropping those member diffs when atlas overlay state is absent.
- Spec-mode scoped renders now clean stale HTML pages and removal state correctly, preventing repeated render/diff runs from crashing on already-removed pages or leaving ghost overlay output behind.

## [v3.11.5] - 2026-05-12

### Added

- New skill `update-project-html`: refreshes the base project HTML architecture atlas (`resources/project-architecture/`) to reflect the latest code changes by reading the existing atlas, resolving the diff scope (`git diff --stat` + staged by default, or against a user-named ref), filtering to code-affecting hunks, and dispatching one write-capable subagent per affected feature to update declarations through `apltk architecture` (no `--spec`); the main agent waits until every subagent finishes before declaring cross-feature edges, then runs `apltk architecture render` and `apltk architecture validate`.
- README: notes for `update-project-html`, the `commit-and-push` / `version-release` decoupling, the `review-change-set` decoupling + subagent guidance, and the `review-spec-related-changes` parallel secondary-subagent pattern. AGENTS.md: new business-flow bullet for `update-project-html`.
- Tests (`test/skill-workflows.test.js`): assertions for the four behavior changes above (decoupling and subagent recommendations).

### Changed

- `commit-and-push` and `version-release` no longer chain `discover-edge-cases` or `discover-security-issues` automatically. The `review-change-set` gate stays mandatory for code-affecting scope, and other conditional gates (e.g. `archive-specs`) remain unchanged. Invoke security or edge-case skills explicitly when their scenario applies.
- `review-change-set` no longer chains `discover-security-issues` and now recommends dispatching one read-only subagent per coherent scope cluster for multi-file diffs; the main agent aggregates structured architecture + simplification findings without re-reading delegated files. Tiny diffs are still reviewed inline.
- `review-spec-related-changes` keeps its three secondary dependencies (`review-change-set`, `discover-edge-cases`, `discover-security-issues`) but now prefers running each one in its own read-only subagent in parallel, and may also fan out independent business-goal requirement clusters to read-only subagents.

### Fixed

## [v3.11.4] - 2026-05-12

### Added

- Macro atlas: `measureEdgeLabel` wraps long edge labels (including CJK) with honest width/height for elkjs so orthogonal routes reserve space proportional to label size; `renderMacroSvg` paints wrapped labels as stacked `<tspan>` lines on one anchor.
- Macro atlas: isolated feature clusters (no intra-feature edges and not an endpoint of a root-level cross-feature edge) use elk **rectpacking** with aspect-ratio hint for a grid-like pack instead of a tall vertical column of sub-modules.
- Tests: CJK submodule sizing, edge-label wrapping, rectpacking vs layered cluster selection, compact rectpack geometry, `m-edge--cross` markup, and cross-edge CSS dim/hover rules.

### Changed

- Macro layout (`layout.js`): CJK-aware text width and visual-width wrapping for sub-module **role** lines; raised `SUB_WIDTH_MAX` / `SUB_HEIGHT_MAX` and `MAX_ROLE_LINES`; sub-module boxes prefer fewer wrapped lines when content allows.
- Root ELK graph: `elk.aspectRatio` 16:9, tighter node/layer spacing and padding, `BALANCED` node placement, `EDGE_LENGTH` post-compaction; cluster padding and internal spacing reduced.
- Cross-feature edges: root-level edges render with `m-edge--cross`; default lower opacity/thinner stroke, full strength on hover/focus so intra-feature flow reads first.

## [v3.11.3] - 2026-05-11

### Added

- New shipped font stack for every rendered atlas page (Fraunces display serif, Geist UI sans, JetBrains Mono technical accents) loaded via Google Fonts preconnect + stylesheet in `<head>`.
- Tests: shipped CSS viewport `clamp()` + svg `height:100%`; `viewer.client.js` wheel handler always prevents default; `preserveAspectRatio` on macro SVG; Google Fonts links in rendered `<head>`; full `renderAll` orphan sweep (scoped renders do not sweep).

### Changed

- Atlas visual system redesigned end-to-end: dark "blueprint × editorial" theme with a faint vellum grid behind every diagram, sectioned canvases with corner labels (`MACRO DIAGRAM`, `INTERNAL FLOW`), refined toolbar buttons, sharper edge color hierarchy, hover glow on sub-module nodes, and serif story / role typography. All existing class hooks (`.atlas-svg`, `.m-cluster`, `.m-node`, `.sub-dataflow__*`, etc.) are preserved so spec overlays and tests continue to work.
- Macro and sub-dataflow SVGs render with `preserveAspectRatio="xMidYMid meet"` and fill 100% of a fixed-height viewport (`clamp(480px, 68vh, 760px)` for macro; `clamp(480px, 64vh, 720px)` for sub-dataflow), so horizontally-biased atlases no longer collapse to a thin strip while leaving empty space inside the canvas block.
- Skills + OpenAI agent prompts (`init-project-html`, `spec-to-project-html`, `generate-spec`): agents **MUST** use `apltk architecture --help` as the authoritative command tree; SKILL prose carries semantic guidance and constraints only (avoids doc/CLI drift). **Subagent-only** read/declare workflow; orchestrator **MUST** wait until all feature subagents finish before cross-feature `edge` or stitching `meta`/`actor`. `generate-spec` §3.5 and frontmatter describe overlay layout, `validate --spec`, and the paginated **`apltk architecture diff`** viewer across `docs/plans/**/architecture_diff/`.

### Fixed

- `viewer.client.js`: the wheel gesture inside any diagram viewport now unconditionally calls `preventDefault()` + `stopPropagation()`, so scrolling/zooming the atlas no longer scrolls the surrounding page. Removed the `ctrlKey`/`metaKey` gate that previously let small wheel deltas bubble up.
- `apltk architecture render` (full base mode, no `--spec`) now sweeps orphan feature directories and stale sub-module HTML files left over from previous renders, so re-running `render` is a true refresh — old pages from renamed / removed features no longer linger with the previous styling. Scoped renders (overlay mode) intentionally do **not** sweep.

## [v3.11.2] - 2026-05-11

### Fixed

- `apltk architecture` / `resolveProjectRoot`: auto-create `resources/project-architecture/` on every command; when no atlas marker is found walking parent directories, use the current working directory as the project root (explicit `--project` still wins). `open` renders a fresh `index.html` when the file is missing so an empty tree bootstraps in one step.
- Legacy `init-project-html/scripts/architecture.js` `open` / `diff`: same directory creation and one-shot `render` bootstrap via `architecture-bootstrap-render.js` when `index.html` is absent.

### Added

- `init-project-html/scripts/architecture-bootstrap-render.js` helper invoked by the legacy sync `open` path.
- Tests: `test/atlas-cli.test.js` covers `--project` on a bare directory (layout + `index.html`); `test/architecture-script.test.js` expects legacy `open` to exit 0 when `index.html` is missing after bootstrap.

## [v3.11.1] - 2026-05-11

### Added

- `dataflow add` optional `--fn`, `--reads`, and `--writes` (comma-separated variable names): each internal step can reference a declared function and read/write declared variables in the same sub-module; `validate` rejects unknown names. The renderer draws a function pill plus reads/writes chips on sub-module internal flow diagrams.
- `init-project-html` / `spec-to-project-html`: **Acceptance criteria** for macro edges (call/return/data-row/failure) and for sub-module diagrams (function flow + variable state); Rule 2 and CLI verb table updated; `TEMPLATE_SPEC.md` documents object-shaped `dataflow` steps and new CSS hooks.
- Macro atlas UX: each sub-module rectangle is an `<a href="features/<feature>/<sub>.html">` with `aria-label`, nested SVG `<title>` tooltip, `cursor: pointer`, and clearer hover/focus styles.

### Changed

- `layout.js`: `measureSubmodule()` computes per-node width/height from slug, kind label, and `role` so elkjs lays out boxes that fit wrapped role text (replaces fixed 240×92 and the old single-line truncation).
- `render.js`: macro SVG draws slug, kind, and multi-line role using the same `measureSubmodule()` output as layout; sub-dataflow SVG renders enriched steps with fn pill and reads/writes chips (from prior work in this release train, now validated and documented).

### Fixed

- `viewer.client.js`: defer pointer capture until the pointer moves past a small drag threshold so clicks on macro sub-module links navigate; swallow the synthetic click after an actual drag so pan does not accidentally open a page.

## [v3.11.0] - 2026-05-11

### Added

- Declarative atlas CLI: every component (feature, sub-module, function, variable, dataflow step, error, edge, actor, meta) is now declared through `apltk architecture <verb> ...`. The CLI persists per-feature YAML under `resources/project-architecture/atlas/`, runs deterministic layout via `elkjs`, and re-renders HTML/SVG (with built-in pan/zoom) on every mutation.
- `--spec <spec_dir>` flag: spec-mode mutations write the overlay snapshot under `<spec_dir>/architecture_diff/atlas/` and render only the affected proposed-after HTML pages there; `apltk architecture diff` continues to pair pages by relative path.
- `apltk architecture` new verbs: `render`, `validate`, `undo`, plus per-component `add` / `set` / `remove` actions for features, sub-modules, functions, variables, dataflow steps, errors, and edges.
- Built-in pan/zoom client for the macro atlas (mouse wheel, drag, +/-/Fit toolbar, keyboard arrows) shipped as `lib/atlas/assets/viewer.client.js`.
- New test suites: `test/atlas-state.test.js`, `test/atlas-render.test.js`, `test/atlas-cli.test.js` covering YAML round-trip, overlay merge, layout no-overlap, rendering scope, and every CLI verb.
- New runtime dependencies: `elkjs` (layered layout) and `js-yaml` (YAML state).

### Changed

- `init-project-html`, `spec-to-project-html`, and `generate-spec` SKILL.md / agents/openai.yaml / `references/TEMPLATE_SPEC.md`: rewritten around CLI verbs and the declarative atlas; binding rules now forbid hand-authoring HTML under `resources/project-architecture/**` or `architecture_diff/**` (the renderer owns layout, no-overlap, DOM, CSS, ARIA, pan/zoom).
- `init-project-html/sample-demo/`: converted to YAML source (`atlas/atlas.index.yaml` + `atlas/features/*.yaml`) and regenerated via the new CLI.
- `init-project-html/scripts/architecture.js`: now a thin shim — the legacy `open` / `diff` verbs stay sync for backward-compatible tests, while new declarative verbs (`feature add`, `submodule add`, etc.) route through `lib/atlas/cli.js`.
- `.gitignore`: ignore `node_modules/` for local development; document that `package-lock.json` must remain committed so `npm ci` installs and published installs resolve the same dependency tree (`elkjs`, `js-yaml`).

### Fixed

## [v3.10.0] - 2026-05-11

### Added

- `init-project-html` skill: HTML architecture atlas (macro × sub-module SVG contract, sample demo, `references/TEMPLATE_SPEC.md` cheat sheet, `apltk architecture` helper script).
- `spec-to-project-html` skill: refresh `resources/project-architecture/**` from active `docs/plans/**` specs using the same atlas rules.
- `apltk architecture` and `apltk architecture diff`: open the project atlas or render a paginated before/after viewer from every `docs/plans/**/architecture_diff/` tree (pairs paths with `resources/project-architecture/`).
- `generate-spec/references/TEMPLATE_SPEC.md` and `spec-to-project-html/references/TEMPLATE_SPEC.md`: local copies of the atlas vocabulary + DOM cheat sheet so each skill is self-contained when installed.
- `cjk-pdf/agents/openai.yaml` and `merge-conflict-resolver/agents/openai.yaml` OpenAI agent interface stubs.
- `test/architecture-script.test.js` covering registration, diff classification, and viewer output paths.

### Changed

- `generate-spec`: when a spec touches the atlas surface, emit `architecture_diff/` next to `spec.md` with path-aligned after-HTML (`_removed.txt` for deletions); keep rules in SKILL.md (reference file is non-authoritative).
- Root `README.md` and `AGENTS.md`: document `apltk architecture` / `architecture diff` examples.
- `.gitignore`: ignore `.apollo-toolkit/` (default output for the diff viewer).

## [v3.9.7] - 2026-05-09

### Changed

- `merge-changes-from-local-branches`: restructure like `generate-spec` / `implement-specs` (Non-negotiables, Pause prompts, sample hints); drop mandatory `archive-specs` post-merge step; finalize via `commit-and-push` with local commit by default (push only when the user explicitly requests remote update); sync OpenAI agent `default_prompt`.

## [v3.9.6] - 2026-05-09

### Changed

- `generate-spec`: refocus `design.md`/`contract.md` templates as coarse `INT-###`/`EXT-###` guiding context above `tasks.md` (avoid mirroring runnable checklist rows); tighten SKILL/README/agent prompt layering; clarify `tasks.md` notes accordingly.
- `implement-specs`: treat `tasks.md` as the authoritative runnable queue; read `design`/`contract` as constraints/anchors; align execution standards copy.
- `implement-specs-with-subagents`: remove fixed four-subagent ceiling and stagger-only pacing language; generalize parallel phase examples and agent prompt.
- Root `README.md`: simplify `implement-specs-with-subagents` compatibility blurb.

## [v3.7.0] - 2026-04-29

### Added
- Extract shared CJK PDF layout, merge-conflict-resolver, and common git-submission workflows into standalone reusable skills (`cjk-pdf`, `merge-conflict-resolver`)
- Establish skill-dependency pattern: `implement-specs-with-worktree` depends on `implement-specs`; `version-release` depends on `commit-and-push`

### Changed
- Strip ~375 lines of verbosity across 32 skill files: remove empty Dependencies sections, merge redundant Overview paragraphs, deduplicate repeated principles in `generate-spec`, and consolidate `archive-specs` workflow steps
- Extract inline output templates and issue schemas into skill-local reference files for `scheduled-runtime-health-check` and `open-github-issue`

## [v3.8.1] - 2026-05-01

### Changed
- Enhance `solve-issues-found-during-review` skill: add finding classification by module and business logic chain, parallel sub-agent deployment with isolated workspaces, and change consolidation with conflict resolution; fall back to sequential fixing when sub-agents are unavailable

## [v3.8.2] - 2026-05-02

### Changed
- Simplify `generate-spec` coordination.md to three sections (Business Goals, Design Principles, Spec Boundaries) and restructure preparation.md to follow tasks.md-style compact format

## [v3.8.3] - 2026-05-03

### Changed
- Refactor `align-project-documents` to generate standardized `docs/features/` (BDD user-facing scenarios), `docs/architecture/` (macro-level design principles), and `docs/principles/` (code conventions and development constraints) instead of flexible Diataxis-based classification
- Simplify `maintain-project-constraints` to produce `AGENTS.md`/`CLAUDE.md` with exactly three sections: Common Development Commands, Project Business Goals, and Project Documentation Index
- Update `archive-specs` to delegate documentation generation to the refactored `align-project-documents` and constraint-file refresh to `maintain-project-constraints`; replace flat-category reference templates with the new three-category structure

## [v3.9.5] - 2026-05-08

### Changed
- `implement-specs`: document read order (spec → design → contract → checklist → tasks), evidence-backed plan resolution, sequential multi-directory execution per `coordination.md`; drop `enhance-existing-features` / `develop-new-features` dependencies; trim frontmatter description; sync agent prompt.
- `implement-specs-with-worktree`: align with updated `implement-specs` contract and dependencies; trim description; sync agent prompt.
- `implement-specs-with-subagents`: replace sample hints with subagent scheduling examples (parallel four-spec batch vs preparation plus A → {B, C}).

## [v3.9.4] - 2026-05-07

### Changed
- `implement-specs`, `implement-specs-with-worktree`, `implement-specs-with-subagents`: require full execution of every in-scope `tasks.md` line with no workload exemption; treat complete `checklist.md` wrap-up / acceptance / closing obligations as a hard gate before the spec may be considered done or merged (coordinators must not merge partial checklist closure); tighten workflow Pause prompts and agent-facing descriptions accordingly.

## [v3.9.3] - 2026-05-07

### Changed
- `solve-issues-found-during-review`: add explicit completion criteria (spec conformance plus full closure of security, edge-case, and related ancillary review streams), tighten dependencies and closing report gates.

## [v3.9.2] - 2026-05-06

### Changed
- Rename skill `harden-app-security` → `discover-security-issues` and realign catalog references, agent prompts, and `test/skill-workflows.test.js`.
- Refactor `discover-edge-cases`, `discover-security-issues`, and `review-change-set` for clearer dependencies, workflows, and agent-facing copy.
- Standardize git submission: skills that record or publish changes now depend on **`commit-and-push`** (`implement-specs*`, `implement-specs-with-subagents`, `merge-conflict-resolver` when committing, `open-source-pr-workflow`, `resolve-review-comments`, `solve-issues-found-during-review`, `develop-new-features`, `enhance-existing-features`); **`commit-and-push`** runs **push** only when the user explicitly requests a remote update.

## [v3.9.1] - 2026-05-06

### Changed
- `implement-specs-with-subagents`: require full multi-phase reconciliation (repeat run/merge steps until every non-blocked in-scope spec is merged or explicitly blocked); forbid early completion narratives while later phases or unmerged successful branches remain.

## [v3.9.0] - 2026-05-05

### Changed
- Refine agent-facing descriptions and workflow copy across planning, review, and submission skills (`commit-and-push`, `version-release`, `generate-spec`, `implement-specs*`, `develop-new-features`, `enhance-existing-features`, `review-spec-related-changes`, `solve-issues-found-during-review`, `maintain-skill-catalog`, `align-project-documents`, `maintain-project-constraints`); keep CI-visible contract wording aligned with `test/skill-workflows.test.js`.

## [v3.8.4] - 2026-05-04

### Changed
- Simplify `generate-spec` checklist template from 108 lines to 53 lines: consolidate multi-field behavior-to-test items into single-line checkboxes, flatten hardening records, and streamline E2E/integration decisions and completion records
- Emphasize official documentation lookup as mandatory step in `generate-spec` workflow

## [v3.8.0] - 2026-04-30

### Added
- Add `solve-issues-found-during-review` skill: fix review findings from highest to lowest severity with per-fix validation and full-scope re-validation

## [v3.6.5] - 2026-04-29

### Fixed
- Synchronize `package-lock.json` version with release
- Fix template assertion test to match the simplified tasks.md format

## [v3.6.4] - 2026-04-29

### Changed
- Simplify `generate-spec` tasks.md template with compact per-item format (inline file/change/outcome + Verify field), and strengthen SKILL.md §4 to require exact file path, modification, and verification step for every task item

## [v3.6.3] - 2026-04-28

### Changed
- Extend `implement-specs-with-subagents` with multi-phase execution: analyse spec dependencies from `coordination.md`, build phased delegation plans via topological sort, execute phases sequentially with parallel subagents per phase, and merge completed spec branches back via `merge-changes-from-local-branches` between phases.

## [v3.6.2] - 2026-04-28

### Changed
- Normalize `AGENTS.md` references to `AGENTS.md/CLAUDE.md` across the skill catalog for CLAUDE.md awareness.

## [v3.6.1] - 2026-04-28

### Added
- Add an optional `generate-spec` `preparation.md` template and `apltk create-specs --with-preparation` support for minimal non-business prerequisite work before parallel spec implementation.

### Changed
- Tighten `implement-specs-with-subagents` so the coordinating agent completes and commits documented prerequisite preparation before launching implementation subagents.
- Keep `coordination.md` focused on ownership and collision rules by removing preparation-task fields from its template.

## [v3.6.0] - 2026-04-28

### Added
- Add `review-spec-related-changes`, a spec-compliance review skill that checks recent or named planning documents against implementation evidence and treats unmet business goals as the most severe findings before secondary edge-case, security, and code-review checks.

### Changed
- Remove the post-merge code-review gate from `merge-changes-from-local-branches` so spec-related review now lives in the dedicated `review-spec-related-changes` skill.

## [v3.5.0] - 2026-04-28

### Added
- Add `implement-specs-with-subagents`, a coordinator skill that assigns each approved spec directory to an independent worktree-backed subagent with staggered starts and a maximum of four active implementation agents.

### Changed
- Tighten `generate-spec` so current templates remain the binding format even when older project specs use different layouts.

## [v3.4.1] - 2026-04-28

### Changed
- Clarify `generate-spec` unit drift check template fields so agents fill in expected results or assertions instead of the ambiguous `oracle` shorthand.

## [v3.4.0] - 2026-04-28

### Added
- Add `test-case-strategy`, a shared skill for selecting risk-driven test levels, defining meaningful test oracles, and adding focused unit drift checks for atomic implementation tasks.

### Changed
- Make `generate-spec`, `develop-new-features`, and `enhance-existing-features` depend on `test-case-strategy` for test case selection, while tightening `tasks.md` into an atomic implementation queue with verification hooks.

## [v3.3.5] - 2026-04-28

### Changed
- Tighten `implement-specs-with-worktree` so parallel batch implementations must inspect active sibling worktrees before editing shared runtime, config, or contract boundaries that may already be in flight elsewhere.

## [v3.3.4] - 2026-04-27

### Changed
- Tighten `implement-specs-with-worktree` so the skill must verify it is operating inside the intended isolated worktree before any edits, and never mutate product files from the parent checkout.

## [v3.3.3] - 2026-04-27

### Changed
- Require `review-change-set` after merge verification before `merge-changes-from-local-branches` can continue into archival or submission.

## [v3.3.2] - 2026-04-27

### Changed
- Tighten `version-release` so GitHub release prerelease state must come from explicit user intent or a verified repository convention, instead of being inferred from tag text such as `alpha-*`.

## [v3.3.1] - 2026-04-26

### Added
- Add an interactive `apltk uninstall` target selector so users can choose which agent skill directories to remove.
- Add `apltk uninstall --yes` for non-interactive uninstall confirmation.

### Fixed
- Fix default `apltk uninstall` cleanup so a missing OpenClaw workspace no longer prevents uninstalling Codex, Trae, Agents, or Claude Code targets.
- Remove manifest-tracked historical skills during CLI uninstall so renamed or removed skills do not remain behind.
- Ignore unsafe manifest skill names during install and uninstall cleanup so removals remain scoped to direct child skill directories.

## [v3.3.0] - 2026-04-26

### Added
- Add `apltk uninstall` command to remove all installed skills from all targets (or specific targets) via manifest-based cleanup.
- Add symlink install mode (`--symlink`) so skills auto-update when `git pull` runs in `~/.apollo-toolkit`, removing the need to re-run the installer after patch updates.
- Add `--copy` flag to explicitly select copy mode when symlink is not desired.
- Add interactive prompt during install that explains symlink pros/cons and lets the user choose between symlink and copy mode.
- Add interactive prompt to optionally install codex-exclusive skills into non-codex targets during global install.
- Add `.apollo-toolkit-manifest.json` per target directory to track installed skills, historical skill names, and install mode for future uninstall and deduplication.
- Add `listAllKnownSkillNames()` to combine current and historically-appeared skill names with automatic deduplication.
- Add `uninstall` subcommand to `scripts/install_skills.sh` and `scripts/install_skills.ps1`.
- Add `--symlink` / `--copy` flags to both shell and PowerShell install scripts.

## [v3.2.2] - 2026-04-25

### Changed
- Tighten `implement-specs-with-worktree` so targeted Rust verification must avoid multi-filter `cargo test` invocations and rerun any zero-test selector before treating the worktree spec as validated.

## [v3.2.1] - 2026-04-24

### Changed
- Tighten `iterative-code-quality` so remaining modules may be reported as complete only after they are explicitly classified with evidence, including user-owned active edits that must be left untouched during repository-wide cleanup.
- Tighten `implement-specs-with-worktree` so formatter-only edits outside the owned spec scope must be reverted before the final worktree commit.

## [v3.2.0] - 2026-04-23

### Added
- Add `iterative-code-performance`, a repository-wide speed optimization skill that repeatedly scans each in-scope module, measures or proves bottlenecks, selects safe performance jobs, adds benchmark and regression guardrails, and loops until no actionable bottleneck or unvisited module remains.

### Changed
- Strengthen `iterative-code-quality` and `iterative-code-performance` so confidence decisions require the agent to assess its own ability alongside task difficulty, objective guardrails, test or benchmark strength, and rollback or repair paths before deferring or attempting deeper refactors.

## [v3.1.8] - 2026-04-23

### Changed
- Refine `iterative-code-quality` so module deep reads must scan each module through the available job lenses before choosing which refactors land, preventing scan phases from degrading into generic reading or low-value micro-fixes.

## [v3.1.7] - 2026-04-23

### Changed
- Enhance `iterative-code-quality` with module inventory and coverage-ledger guidance so agents start from the easiest useful modules, deeply read each in-scope module before completion, and return to scanning whenever unvisited modules remain.

## [v3.1.6] - 2026-04-23

### Changed
- Rewrite `iterative-code-quality` around a strict three-step loop of full-codebase scan, per-round job selection/refactor, and final doc/constraint sync, while moving job-specific execution guidance into reference documents so the main skill no longer reads like a serial workflow.

## [v3.1.5] - 2026-04-23

### Changed
- Strengthen `iterative-code-quality` so large coupled or apparently core files trigger staged unlock work instead of passive stopping, and require a full-codebase stage-gate decision after every iteration to determine whether additional rounds are still needed.

## [v3.1.4] - 2026-04-23

### Changed
- Refine `iterative-code-quality` so it now treats naming, abstraction, module boundaries, logging, and tests as selectable execution directions under continuous full-codebase rescans, guiding agents to choose the highest-confidence, highest-leverage gradual refactors that prepare the ground for deeper later cleanup while preserving behavior under green guardrails and a precise system-level definition of macro architecture.

## [v3.1.3] - 2026-04-23

### Changed
- Tighten `iterative-code-quality` so agents must keep iterating while any known in-scope actionable quality issue remains, must not produce a completion report until the latest scan is clear or remaining candidates are explicitly classified as blocked, unsafe, low-value, speculative, or approval-dependent, and should use tests or equivalent guardrails to support more aggressive refactors instead of deferring them for subjective confidence reasons.

## [v3.1.2] - 2026-04-23

### Changed
- Tighten `commit-and-push` so emitted UI git directives such as `::git-stage`, `::git-commit`, and `::git-push` never count as evidence that staging, commit creation, or remote push actually happened.
- Tighten `version-release` so release flows require real git mutations for staging, commit/tag creation, and push verification instead of treating UI git directives as proof that the release commit or tag exists.

## [v3.1.1] - 2026-04-22

### Changed
- Fix Apollo Toolkit installers so `codex`-only skills stay scoped to Codex targets, while shared skills continue to install across the selected destinations.
- Align the CLI welcome/help text, non-interactive guidance, and README examples with the supported `agents` target and current installer behavior.

## [v3.1.0] - 2026-04-22

### Added
- Add `iterative-code-quality`, a new repository-wide improvement skill that performs repeated behavior-neutral passes for naming cleanup, function simplification, module-boundary refactors, logging alignment, and risk-based test coverage, then synchronizes project docs and `AGENTS.md`.

## [v3.0.4] - 2026-04-22

### Changed
- Strengthen `systematic-debug` so stress, chaos, and edge-case reruns must preserve a minimally executable path, classify globally disabling profiles as toolchain or harness invalidation before blaming product logic, and report whether the final scenario still exercises the target lifecycle stage.

## [v3.0.3] - 2026-04-21

### Changed
- Strengthen `improve-observability` so ownership-model refactors must audit and repair stale log messages, event names, and structured fields, keeping canonical owners distinct from compatibility projections in telemetry.

## [v3.0.2] - 2026-04-20

### Changed
- Strengthen `scheduled-runtime-health-check` so bounded-run investigations must detect artifact-path drift, reconcile reports back to one canonical run root before comparison, and report bounded execute time separately from setup and shutdown overhead.
- Strengthen `systematic-debug` so runtime reruns that inherit stale report paths are classified as artifact-routing problems before any performance conclusion, and speed analysis now separates execute time from provisioning/readiness/cleanup overhead.

## [v3.0.1] - 2026-04-19

### Changed
- Strengthen `jupiter-development` so Jupiter program registries are treated as discovery and observability inputs rather than automatic signing allowlists, preserving fail-closed local transaction grammar for wallet flows.
- Strengthen `scheduled-runtime-health-check` and `systematic-debug` so bounded runtime follow-ups compare only complete like-for-like run artifacts, derive missing-business-event causes from structured funnels, and report per-stage latency instead of vague wall-clock duration.

## [v3.0.0] - 2026-04-18

### Changed
- Add bundled `apltk` tool dispatch so packaged skill scripts can be listed with `apltk tools` and executed directly through `apltk <tool> ...`.
- Update skill and repository docs to prefer bundled `apltk` tool commands over direct script paths for log filtering, spec generation, KaTeX rendering, audio generation, error-book rendering, GitHub issue publishing, and related helpers.
- Harden `open-github-issue` with `--payload-file` and `@file` support so Markdown-rich fields containing backticks or shell metacharacters survive CLI invocation without shell corruption.
- Skip Python tests that require optional media/PDF modules when those dependencies are unavailable so release CI stays aligned with the repository's optional tooling contract.

### Added
- Add `lib/tool-runner.js` plus Node and Python regression tests that cover bundled tool discovery, CLI dispatch, safe wrapper behavior, and new helper entrypoints.

## [v2.14.23] - 2026-04-18

### Changed
- Strengthen `scheduled-runtime-health-check` so bounded runtime investigations must explicitly choose and report the highest-fidelity execution mode that matches the user's claim, instead of silently substituting a lower-fidelity harness for production-like behavior.
- Strengthen `systematic-debug` so runtime bug investigations must reproduce failures in the same runtime mode as the observed claim, and treat scenario or harness reruns as lower-fidelity evidence unless that limitation is made explicit.
- Strengthen `improve-observability` so aggregate success counters must stay reconcilable with per-entity detail records across harness and production paths, treating missing detail rows as an observability bug.

## [v2.14.22] - 2026-04-17

### Changed
- Strengthen `systematic-debug` so failing-test investigations must classify each symptom as stale test contract, test-harness interference, or real product bug, and must treat isolated-only passes as evidence to inspect shared-state and parallel-test interference before changing product code.

## [v2.14.21] - 2026-04-16

### Changed
- Tighten `implement-specs-with-worktree` so branch/worktree setup uses direct `git` ref checks and requires an explicit re-check of repo state before retrying after ambiguous creation failures.

## [v2.14.20] - 2026-04-15

### Changed
- Tighten `version-release` so same-version prerelease retarget flows fall back to a GitHub-accepted `target_commitish` such as the release branch name when raw commit SHA updates are rejected.

## [v2.14.19] - 2026-04-14

### Changed
- Update `version-release` so same-version prerelease hotfixes retarget the existing prerelease tag and GitHub release instead of forcing an extra semver bump.

## [v2.14.18] - 2026-04-13

### Changed
- Update `review-codebases` so issue-publishing runs must search for overlapping open or recent issues first and skip publishing duplicates when the root cause already has a tracker.
- Tighten `implement-specs-with-worktree` so archived or already-landed spec requests must verify whether the work is already present before creating a fresh worktree, and report a no-op with evidence when appropriate.

## [v2.14.17] - 2026-04-12

### Changed
- Tighten `version-release` so explicit semver wording such as `patch update`, `minor update`, or `major update` counts as release intent and still requires publishing the matching GitHub release.
- Tighten `enhance-existing-features` so it must not report an enabling intermediate milestone as complete when the user asked for the final scoped behavior.

## [v2.14.16] - 2026-04-11

### Changed
- Strengthen `generate-spec` so batch planning now requires spec sets to be truly parallel-implementable, not merely independently scoped.
- Update `generate-spec` templates and prompts so `coordination.md` captures parallel-readiness gates, collision-resolution records, and pre-agreed ownership rules before concurrent implementation starts.

## [v2.14.15] - 2026-04-11

### Changed
- Update `merge-changes-from-local-branches` so merge scope is determined from explicit branch names or spec-name mappings, instead of verifying child-branch ancestry from git history.
- Update `implement-specs-with-worktree` so new worktree branches inherit from the same parent branch as the worktree base, and use the spec-set name as the canonical branch/worktree identifier.

## [v2.14.14] - 2026-04-11

### Changed
- Tighten `commit-and-push` so it must distinguish staged versus unstaged work before choosing commit scope, preserve intentionally separated commit boundaries, and only broaden scope after an explicit user request.
- Update `learn-skill-from-conversations` so repeated follow-ups that correct commit scope or local-versus-remote submission boundaries are treated as evidence to harden the owning submit workflow.

## [v2.14.13] - 2026-04-10

### Added
- Add `implement-specs` for executing approved spec sets directly in the current checkout without creating a branch or git worktree.

## [v2.14.12] - 2026-04-10

### Changed
- Tighten `implement-specs-with-worktree` so detached or temporary worktrees must recover the exact requested `docs/plans/...` spec set from the authoritative branch or main working tree before coding, instead of substituting nearby plans.
- Require `implement-specs-with-worktree` to sync only the in-scope spec directory plus its governing batch `coordination.md`, avoiding accidental sibling-spec imports into the worktree.

## [v2.14.11] - 2026-04-09

### Changed
- Re-scope `merge-changes-from-local-branches` so it merges only verified child branches that forked from the current branch, and lands the result back onto that same current branch instead of sweeping all local branches into `main`.
- Require `merge-changes-from-local-branches` to run `archive-specs` after merge verification so completed plan sets are archived and durable project docs are synchronized before `commit-and-push` creates the final current-branch submission.

## [v2.14.10] - 2026-04-09

### Changed
- Strengthen `generate-spec` coordination guidance and template so parallel worktree batches must record file ownership guardrails, shared API or schema freeze rules, compatibility-shim retention rules, and post-merge integration checkpoints that reduce functional merge conflicts.
- Update `implement-specs-with-worktree` so engineers executing batch specs must treat those `coordination.md` guardrails as blocking constraints during implementation instead of optional notes.

## [v2.14.9] - 2026-04-08

### Changed
- Update `merge-changes-from-local-branches` so it must inspect active batch-spec `coordination.md` files under `docs/plans/` and follow their documented merge order when one is explicitly provided.
- Clarify that merge-order guidance from active batch specs is authoritative unless the plan is stale, conflicting, or cannot be mapped safely to the current branches.

## [v2.14.8] - 2026-04-08

### Changed
- Tighten `generate-spec` so multi-spec batch planning must slice work into independently completable specs that can each be approved, implemented, tested, and merged without depending on another spec in the same batch landing first.
- Update `generate-spec` coordination guidance and templates so batch-level merge order may be a convenience only, never a functional prerequisite between specs.
## [v2.14.7] - 2026-04-08

### Changed
- Update `merge-changes-from-local-branches` so it removes successfully merged source branches and any detached worktrees only after the merge commit and verification both succeed, while refusing forced deletion for branches that are not actually merged.

## [v2.14.6] - 2026-04-08

### Added
- Add batch-level `coordination.md` support to `generate-spec` so one planning request can create multiple parallel spec workstreams under `docs/plans/{YYYY-MM-DD}/{batch_name}/`, while keeping shared field preparation, ownership boundaries, merge order, and legacy-replacement direction in one canonical coordination file.

### Changed
- Update `develop-new-features`, `enhance-existing-features`, and `implement-specs-with-worktree` so multi-spec worktree execution reads and maintains shared `coordination.md` state instead of duplicating cross-spec rules inside each `design.md`.
- Update `archive-specs` and `recover-missing-plan` so the newer nested `docs/plans/{YYYY-MM-DD}/...` layout and batch-level `coordination.md` files are recognized during archival, reconciliation, and recovery workflows.

## [v2.14.5] - 2026-04-08

### Changed
- Clarify `learn-skill-from-conversations`, `codex-memory-manager`, and `weekly-financial-event-report` so Codex automation runs must treat an explicit `Automation memory:` path in the prompt as authoritative and not rely on `$CODEX_HOME` shell expansion being available.

## [v2.14.4] - 2026-04-07

### Changed
- Clarify `maintain-project-constraints` so `Core project purpose` must describe the repository's macro goal or problem-to-solve, instead of restating its implemented feature list.

## [v2.14.3] - 2026-04-07

### Changed
- Strengthen `systematic-debug` so runtime-pipeline investigations must anchor on one canonical run or artifact root, map failures to concrete stages, and separate toolchain/platform faults from application-logic faults before fixing.
- Strengthen `scheduled-runtime-health-check` so bounded runs must record the canonical run folder as soon as it materializes and use structured artifacts from that same run when analyzing health.

## [v2.14.2] - 2026-04-06

### Changed
- Rewire `merge-changes-from-local-branches` so its final local-branch submission stage is handed to `commit-and-push`, which now owns the shared changelog/readiness/archival flow after merges.
- Rework `archive-specs` so documentation alignment is delegated to `align-project-documents` and `maintain-project-constraints` before completed plan sets are archived.
- Clarify that `commit-and-push` and `version-release` depend directly on `archive-specs` for completed plan conversion and project-doc alignment, instead of duplicating downstream documentation-sync steps.

## [v2.14.1] - 2026-04-06

### Changed
- Tighten `merge-changes-from-local-branches` so it inspects branch divergence before merging, resolves conflicts by composing verified behavior instead of relying on blanket `-X ours/theirs` or timestamp heuristics, and requires targeted verification after conflictful merges.

### Fixed
- Add missing `agents/openai.yaml` metadata for `merge-changes-from-local-branches` and `implement-specs-with-worktree` so repository agent-config validation passes and both skills expose UI metadata consistently.

## [v2.14.0] - 2026-04-05

### Added
- Add `agents` install mode to CLI and installer, aligning npm-based CLI with shell script capabilities.
- Add `implement-specs-with-worktree` skill for implementing specs in isolated git worktrees.
- Add `merge-changes-from-local-branches` skill for consolidating local branch changes into main.

## [v2.13.4] - 2026-04-05

### Changed
- Update `learn-skill-from-conversations` so it must inventory the current repository's existing skills first, weigh repeated user corrections and error-driven lessons more heavily, extract duplicated workflow fragments into shared skills when warranted, wrap repeatedly customized external skills, and keep project-specific tooling patterns in the owning project's `~/.codex/skills/`.

### Fixed
- Synchronize `package-lock.json` metadata with the current package version and CLI bin aliases before release publication.

## [v2.13.3] - 2026-04-05

### Removed
- Remove `production-sim-debug` skill as it is no longer actively maintained or needed.

## [v2.13.2] - 2026-04-05

### Changed
- Update `codex-memory-manager` to require reusable, preference-first memory files built around a normalized `Scope / Preferences / Maintenance / Evidence notes` template instead of project- or incident-specific memory logs.
- Add a bundled memory-file template reference plus focused template-structure tests so future updates keep the new memory format and de-projectification rules aligned.

## [v2.13.1] - 2026-04-05

### Fixed
- Fix the npm / `apltk` installer so selecting `codex` now copies agent-specific skills from the repository `codex/` subdirectory into the managed toolkit home and the final Codex skills target.
- Fix the npm / `apltk` interactive installer and help output so `claude-code` appears as a supported target and can be installed through the same CLI flow as the other modes.

### Changed
- Refresh installer banner and README wording so Claude Code support is described consistently in the npm-based installation flow.

## [v2.13.0] - 2026-04-05

### Added
- Add `recover-missing-plan` for restoring or reconstructing missing `docs/plans/...` plan sets from repository evidence, git history, and authoritative issue context before implementation continues.
- Expand `generate-spec` with standardized `contract.md` and `design.md` templates plus generator support so plan sets can capture external dependency contracts and architecture deltas alongside `spec.md`, `tasks.md`, and `checklist.md`.

### Changed
- Update `develop-new-features`, `enhance-existing-features`, `archive-specs`, and related agent prompts to treat `contract.md` and `design.md` as first-class planning artifacts wherever `generate-spec` is used.
- Update `ship-github-issue-fix` to require `recover-missing-plan` when a referenced `docs/plans/...` path is missing or archived unexpectedly.
- Expand repository capability docs and skill inventory to include `recover-missing-plan` and the broader five-file planning workflow.
- Strengthen `weekly-financial-event-report` so it checks for an existing report covering the same research window before regenerating output, and requires exact calendar dates for exchange/session timing when reporting market-sensitive follow-up.

## [v2.12.7] - 2026-04-02

### Added
- Add `claude-code` install mode for copying skills into `~/.claude/skills`, with `CLAUDE_CODE_SKILLS_DIR` environment override support.

### Changed
- Move `codex-memory-manager` and `learn-skill-from-conversations` into `codex/` subdirectory to clarify agent-specific skill boundaries.
- Update codex install mode to include skills from both root directory and the `codex/` subdirectory.

## [v2.12.6] - 2026-04-02

### Added
- Add the global `apltk` CLI alias so the Apollo Toolkit installer can be launched with a shorter command after npm installation.

### Changed
- Update `develop-new-features` and `enhance-existing-features` so any spec-backed change affecting more than three modules must be split into independent, non-conflicting, non-dependent spec sets.
- Expand `commit-and-push` with stricter worktree replay and cleanup rules so temporary worktree delivery verifies the authoritative target branch before removing the worktree.
- Strengthen `production-sim-debug` so protocol-sensitive simulation claims must be checked against official docs or upstream source, and infeasible local-simulation designs must be collapsed quickly instead of left as pending implementation.
- Update the Apollo Toolkit CLI so interactive global runs can start from `apltk`, check npm for newer published packages, and offer an in-place global update before continuing.

### Fixed
- Fix updater version comparison so prerelease builds such as `2.12.5-beta.1` no longer suppress available stable-release upgrade prompts.

## [v2.12.5] - 2026-04-01

### Changed
- Update `maintain-project-constraints` so generated `AGENTS.md` templates must include a factual `Common Commands` section grounded in repository-owned command entry points such as CLIs, package scripts, and task runners.
- Refresh the Apollo Toolkit root `AGENTS.md` guidance with repository-specific common commands for the local CLI, validation scripts, tests, and install flows.

## [v2.12.4] - 2026-04-01

### Added
- Add a bundled macOS `PDFKit` extraction helper for `weekly-financial-event-report` so marked-event PDFs can still be parsed locally when the usual PDF tooling is unavailable.

### Changed
- Expand `weekly-financial-event-report` to prefer the `pdf` skill for extraction, fall back to the local PDFKit helper on macOS, and call `document-vision-reader` when visual highlights are not recoverable from extracted text alone.
- Rework `align-project-documents` around category-based, newcomer-friendly documentation selection with a reusable template grounded in Diataxis and common open source doc types.
- Tighten `commit-and-push` and `version-release` so clean-worktree submit/release requests must inspect existing local and remote state instead of fabricating a new submission result.
- Strengthen `production-sim-debug` to record the active artifact root immediately and check startup admission signals before concluding a run had no opportunities.

## [v2.12.3] - 2026-03-30

### Changed
- Strengthen `commit-and-push`, `submission-readiness-check`, and `version-release` so submit flows must actually update root `CHANGELOG.md` `Unreleased` before continuing when the pending code-affecting or user-visible change is missing there.
- Strengthen `commit-and-push` and `version-release` so `review-change-set` remains conditional, but becomes a blocking requirement whenever the change set includes code changes.
- Strengthen `version-release` prompts and workflow docs to require reading the current version and existing tag/release state first, and to treat the release as incomplete until the matching commit, tag, and GitHub release all exist.
- Clarify across submit and release workflows that every conditional gate becomes blocking as soon as its triggering scenario is present, including spec archival and other readiness work.
- Clarify that `discover-edge-cases` and `harden-app-security` are important risk-driven code review gates that also become blocking whenever the change or release surface says they apply.

## [v2.12.2] - 2026-03-29

### Changed
- Update the npm installer and local install scripts to expand `~/` path overrides consistently for managed toolkit homes and target skill directories.
- Refresh skill docs and agent prompts to replace user-specific absolute home paths with portable `~/`-based examples.
- Strengthen `production-sim-debug` and `scheduled-runtime-health-check` so bounded runs must verify the actual stop mechanism and treat overruns as contract/tooling bugs to diagnose.

## [v2.12.1] - 2026-03-28

### Changed
- Update `commit-and-push` so it must keep root `CHANGELOG.md` `Unreleased` aligned with the actual pending change set, preserving unrelated bullets while removing stale conflicting entries.
- Update `version-release` so releases publish directly from curated root `CHANGELOG.md` `Unreleased` content instead of reconstructing release notes from `git diff`.

## [v2.12.0] - 2026-03-28

### Added
- Add `agents` mode to install scripts for copying skills into `~/.agents/skills` directory, supporting agent-skill-compatible software.

### Changed
- Strengthen `production-sim-debug` so simulation investigations must verify protocol-sensitive blame against official docs or upstream source, distinguish liquidation pipeline stages precisely, and explain quote-budget counts as attempts versus unique opportunities.

## [v2.11.4] - 2026-03-27

### Added
- Add `production-sim-debug` for investigating production or local simulation runs, separating harness realism gaps from runtime bugs, and validating fixes by rerunning the same bounded scenario.
- Add `ship-github-issue-fix` for taking a remote GitHub issue through implementation and direct push to a requested branch without opening a PR or performing release work.

### Changed
- Update `read-github-issue` to prefer bundled issue scripts while falling back to raw `gh issue list` and `gh issue view` commands when repository-specific helpers are missing or fail.
- Strengthen `commit-and-push` and `version-release` so sequential git mutations must verify the remote branch tip and release tag before reporting success or publishing a release.
- Refresh repository capability docs and skill inventory to include direct issue-shipping and production simulation debugging workflows.

## [v2.11.3] - 2026-03-24

### Added
- Add bundled `analyse-app-logs` scripts for filtering logs by bounded time windows and searching by keyword or regex, with focused tests for both helpers.
- Add `read-github-issue` as a dedicated GitHub issue discovery skill with bundled scripts for finding issue candidates and reading a specific issue with comments.

### Changed
- Expand `open-github-issue` to support structured `performance`, `security`, `docs`, and `observability` issue categories in addition to `problem` and `feature`.
- Refocus the former `fix-github-issues` workflow into read-only GitHub issue discovery and inspection guidance instead of a hardcoded fixing workflow.
- Update repository capability docs and agent prompts to reflect the new GitHub issue-reading and log-search workflows.

## [v2.11.2] - 2026-03-23

### Changed
- Update `develop-new-features` and `enhance-existing-features` so small localized work such as bug fixes, pure frontend polish, and simple adjustments can skip spec generation, while non-trivial feature work still uses approval-backed specs.
- Strengthen `generate-spec` so spec creation must verify relevant official documentation for external dependencies before writing requirements or scope.
- Refine spec templates so `spec.md` uses dedicated `In Scope` and `Out of Scope` sections, checklist completion uses structured completion records, and E2E versus integration decisions support multiple per-flow records without encouraging false checkbox completion.

## [v2.11.1] - 2026-03-23

### Changed
- Add a dedicated GitHub Actions validation job for `SKILL.md` description length checks.
- Enforce a maximum `description` length of 1024 characters in `scripts/validate_skill_frontmatter.py`.
- Shorten `enhance-existing-features` metadata so its `description` stays within the loader limit without changing intent.

## [v2.11.0] - 2026-03-23

### Added
- Add `exam-pdf-workflow` for turning lecture slides, past papers, and answer books into mock exams, worked solutions, study notes, or graded PDFs with KaTeX-rendered math when needed.

### Changed
- Update `develop-new-features` and `enhance-existing-features` so approved spec-backed work must continue through all in-scope tasks, applicable checklist items, testing, and backfill before yielding unless scope changes or an external blocker prevents safe completion.
- Update `generate-spec` to require creating a distinct plan directory when adjacent work is not actually covered by an existing plan set.
- Update `archive-specs`, `commit-and-push`, and `version-release` to better distinguish completed planning scope from still-active follow-up work before archiving or conversion.
- Refresh repository skill inventory and project capability docs to include `exam-pdf-workflow` and its `pdf` dependency.

## [v2.10.0] - 2026-03-21

### Added
- Add `document-vision-reader` for screenshot-based inspection of rendered documents when visible layout matters more than raw extracted text.
- Add `katex` for rendering and embedding math formulas with official KaTeX guidance and reusable render scripts.

### Changed
- Rework `learning-error-book` to generate separate multiple-choice and long-answer reference JSON files plus polished PDFs rendered directly from structured data.
- Update the repository skill inventory and project capability docs to include the new document-vision and KaTeX workflows.


## [v2.9.0] - 2026-03-21

### Changed
- Update `scheduled-runtime-health-check` to run requested commands in a background terminal immediately or within a requested time window, with optional pre-run safe updates and optional post-run log findings.
- Update `open-github-issue` to require explicit BDD-style expected behavior, current behavior, and behavior-gap content for problem issues, and enforce that contract in the bundled publisher script and docs.

## [v2.8.0] - 2026-03-21

### Changed
- Change the npm installer and local install scripts to copy managed skill directories into selected targets instead of creating symlinks.
- Replace legacy Apollo Toolkit symlink installs with real copied skill directories during reinstall, while still removing stale skills that no longer ship in the current version.
- Normalize every repository `LICENSE` file to the MIT template owned by `LaiTszKin`.

## [v2.7.0] - 2026-03-20

### Added
- Add `openclaw-configuration` for explaining, editing, validating, and troubleshooting OpenClaw configuration from the current official docs, including `~/.openclaw/openclaw.json`, skills config, secrets, and CLI workflows.
- Add bundled OpenClaw configuration references covering the official doc map, config option guide, and operational best practices.

### Changed
- Update `fix-github-issues` to require temporary worktree and local branch cleanup as part of direct-push or PR completion, with explicit cleanup verification before finishing.
- Update `learn-skill-from-conversations` to treat post-completion cleanup or finalization follow-ups as evidence that the owning workflow's done criteria need tightening.
- Update the repository skill inventory and project capability docs to include OpenClaw configuration support.

## [v2.6.0] - 2026-03-20

### Added
- Add `jupiter-development` for building Jupiter-based Solana integrations from current official docs, including swap, token, price, lend, trigger, recurring, and portfolio surfaces.
- Add `marginfi-development` for building or reviewing marginfi integrations with official SDK, CLI, protocol, and The Arena references.
- Add `solana-development` for native Solana Rust programs and Rust client workflows grounded in official Solana documentation.

### Changed
- Update `learn-skill-from-conversations` to prefer inventorying the current skill catalog, weighting user corrections and error-driven lessons more heavily, and tightening when to update an existing skill versus creating a new one.
- Update `codex-memory-manager` so memory reports include already-stored relevant preferences when users ask what memory exists or why a known preference was omitted.
- Refresh new protocol reference snapshots against current official Jupiter, marginfi, and Solana docs before release.

## [v2.5.0] - 2026-03-19

### Changed
- Rename `specs-to-project-docs` to `archive-specs` and refocus the skill on converting completed specs into project docs while archiving the consumed planning files.
- Update `develop-new-features` and `enhance-existing-features` so completed work must backfill requirement completion status in `spec.md` alongside `tasks.md` and `checklist.md`.
- Update `commit-and-push` and `version-release` to treat planning-file checkboxes semantically during conversion, and to invoke `archive-specs` when completed spec sets should become project documentation.
- Update the npm installer to remove stale linked skills that no longer exist in the latest packaged skill list during managed installs.

### Removed
- Remove the `codex-subagent-orchestration` skill and clean related multi-agent guidance from affected skill documents.

## [v2.4.3] - 2026-03-19

### Changed
- Clarify `codex-subagent-orchestration` guidance so delegated custom-agent creation steps include the required context for agent-creation tooling.

## [v2.4.2] - 2026-03-19

### Changed
- Relax `codex-subagent-orchestration` so reusable custom agents no longer require repeated historical use before creation or persistence.
- Require agents to abstract task-specific delegation into the most general reusable role that still preserves clear ownership boundaries, such as `code_reviewer` before narrower one-off task agents.
- Clarify when domain-specific specialization such as `rust_reviewer` is warranted and when a generic reusable reviewer should be preferred.

## [v2.4.1] - 2026-03-19

### Changed
- Tighten `codex-subagent-orchestration` so non-trivial tasks must use actual subagent tool calls when delegation is allowed, instead of stopping at prose-only delegation guidance.
- Require `codex-subagent-orchestration` to default to a parallel subagents workflow whenever two or more independent workstreams can run safely in parallel.
- Clarify runtime handoff and orchestration boundaries for delegated agents, including tool-rule, sandbox, write-scope, and isolated-review expectations.

## [v2.4.0] - 2026-03-19

### Added
- Add `codex-memory-manager` for reviewing the last 24 hours of Codex chats, storing durable preference memory, and syncing a managed memory index into `~/.codex/AGENTS.md`.
- Add extractor and index-sync helper scripts plus focused tests for the new Codex memory workflow.

### Changed
- Update `codex-subagent-orchestration` guidance, prompts, and routing notes to require explicit subagent spawning language for non-trivial tasks.

### Removed
- Remove the standalone OpenAI Codex subagent summary reference from `codex-subagent-orchestration` now that the skill documentation carries the needed guidance directly.

## [v2.3.0] - 2026-03-18

### Added
- Add `codex-subagent-orchestration` for default subagent routing on most non-trivial Codex tasks, including reusable custom-agent catalog inspection, creation, and persistence guidance.
- Add OpenAI-backed subagent references, a reusable custom-agent TOML template, and a routing rubric for splitting exploration, review, verification, and isolated implementation work.

### Changed
- Restrict `codex-subagent-orchestration` starter model guidance to `gpt-5.4` and `gpt-5.3-codex`.
- Require reusable subagents to set `model_reasoning_effort` by delegated task complexity instead of using a single fixed effort.

## [v2.2.0] - 2026-03-18

### Added
- Add a branded Apollo Toolkit installer welcome screen with staged terminal reveal content before target selection.

### Changed
- Update the interactive installer banner and selection screen to present clearer Apollo Toolkit branding and setup guidance.
- Require `version-release` to create and publish a matching GitHub release after pushing the release tag, and document release-triggered publish workflow verification.

## [v2.1.1] - 2026-03-18

### Added
- Allow `fix-github-issues` to hand off validated issue fixes either to `open-source-pr-workflow` for PR submission or to `commit-and-push` for explicit direct-push delivery.

### Changed
- Align `fix-github-issues` metadata and agent prompt wording with the new direct-push delivery path.
- Strengthen `weekly-financial-event-report` PDF handoff requirements for long-text table layout, reusable renderers, and visual QA checks.

## [v2.1.0] - 2026-03-18

### Added
- Add `scheduled-runtime-health-check` for bounded project runtime scheduling, automatic shutdown, and delegated log-based module health analysis.

### Changed
- Align `commit-and-push` and `version-release` workflow guidance, prompts, and supporting docs with the current review and documentation-sync requirements.
- Tighten release and commit planning-artifact detection to exclude template/reference specs, and require `scheduled-runtime-health-check` to fail closed when future scheduling is unavailable.

## [v2.0.2] - 2026-03-17

### Changed
- Update the npm Trusted Publishing workflow to use newer GitHub Actions and Node 24, and simplify publish invocation to `npm publish --access public`.

## [v2.0.1] - 2026-03-17

### Fixed
- Align `specs-to-project-docs`, `commit-and-push`, and `version-release` references with the current `docs/*` documentation layout.

## [v2.0.0] - 2026-03-17

### Added
- Add the `@laitszkin/apollo-toolkit` npm package with an `apollo-toolkit` CLI entrypoint.
- Add an interactive terminal installer with Apollo Toolkit branding, multi-target selection, and managed installs under `~/.apollo-toolkit`.
- Add Node-based installer tests and a release-triggered npm Trusted Publishing workflow.

### Changed
- Change managed installer defaults from `~/.apollo-toolkit-repo` to `~/.apollo-toolkit` for curl / iwr installs.
- Refresh installer documentation around npm, npx, and global CLI usage.

## [v1.1.0] - 2026-03-13

### Added
- Add `deep-research-topics` for evidence-based research deliverables.
- Add `review-codebases` for repository-wide code review and issue publication workflows.
- Add `agents/openai.yaml` metadata across top-level skills.
- Add skill metadata validation scripts and a GitHub Actions workflow for `SKILL.md` frontmatter and `agents/openai.yaml`.
- Add `harden-app-security/references/common-software-attack-catalog.md` for broader security audit coverage.

### Changed
- Expand `harden-app-security` into a discovery-only adversarial audit workflow with broader common software attack coverage.
- Strengthen `develop-new-features`, `enhance-existing-features`, `discover-edge-cases`, and related references with clearer testing and evidence requirements.
- Refresh root and skill-level documentation to reflect the new skills, metadata requirements, and review workflow guidance.

### Fixed
- Restore skill metadata loading behavior after the OpenAI agent metadata rollout.

## [v1.0.0] - 2026-03-09

### Added
- Add `align-project-documents` for codebase-driven project documentation alignment.
- Add `answering-questions-with-research` for evidence-based answers that combine repo discovery with web research.
- Add `learning-error-book` for mistake summaries with Markdown-to-PDF error book generation.
- Add `maintain-project-constraints` to keep `AGENTS.md` aligned with the repository.
- Add `open-github-issue` for deterministic GitHub issue publishing with auth fallback and README-based language detection.
- Add `resolve-review-comments` for PR review thread triage, adoption decisions, and resolution workflows.
- Add cross-platform installers in `scripts/install_skills.sh` and `scripts/install_skills.ps1`.

### Changed
- Rename multiple skills for clearer naming, including `project-doc-aligner` -> `align-project-documents`, `agents-md-maintainer` -> `maintain-project-constraints`, `edge-case-test-fixer` -> `fix-edge-cases`, `github-issue-fix-pr-workflow` -> `fix-github-issues`, `gh-pr-review-comment-workflow` -> `resolve-review-comments`, `security-expert-hardening` -> `harden-app-security`, and `app-log-issue-analysis` -> `analyse-app-logs`.
- Split GitHub issue publication out of `analyse-app-logs` and make it depend on `open-github-issue`.
- Expand `open-github-issue` with target repository resolution, README-based language selection, and deterministic draft fallback behavior.
- Strengthen `develop-new-features`, `enhance-existing-features`, and related skills with clearer property-based testing requirements and refreshed templates.
- Move installer entrypoints into `scripts/`, add Trae install support, and improve curl/pipe repo detection.
- Refresh root and skill-level docs to reflect the renamed skills, installer flow, and dependency guidance.

### Fixed
- Correct current documentation references to `maintain-project-constraints`.

## [v0.6.0] - 2026-02-27

### Added
- Add default worktree guidance to `github-issue-fix-pr-workflow` debug dependencies.

### Changed
- Quote a multiline skill description in `systematic-debug` to keep YAML metadata valid.
- Refine `systematic-debug` auto-invoke criteria and examples for mismatched behavior debugging.
- Clarify `version-release` workflow requirements for release range review and code/documentation alignment.

## [v0.5.0] - 2026-02-26

### Added
- Add `commit-and-push` skill for commit+push-only submission workflows.
- Add `version-release` skill for explicit version/tag/changelog release workflows.
- Add new skill documents and references for the split submit/release workflows.

### Changed
- Replace legacy `submit-changes` with two dedicated skills: `commit-and-push` and `version-release`.
- Translate project documentation, templates, and testing/reference guides to English across skills.
- Update multiple skill definitions to English wording for consistent skill documentation language.
- Clarify spec-first requirements in feature-planning skills, including mandatory re-approval after clarification updates.

## [v0.4.0] - 2026-02-26

### Added
- Add `github-issue-fix-pr-workflow` skill with issue listing, local fix flow, and PR submission guidance.
- Add `github-issue-fix-pr-workflow/scripts/list_issues.py` and related tests for deterministic issue discovery.

### Changed
- Update `install_skills.sh` to support interactive multi-option selection, multi-mode CLI input, and `all` installation.
- Add Trae IDE support in `install_skills.sh`, with a default install target at `~/.trae/skills`.
- Update root `README.md` installer examples to include `trae` and `all` usage.
- Highlight BDD keywords in `develop-new-features` and `enhance-existing-features` spec templates using Markdown bold formatting.

## [v0.3.0] - 2026-02-25

### Added
- Enhance `app-log-issue-analysis` with deterministic GitHub issue publishing support.
- Add `app-log-issue-analysis/scripts/publish_log_issue.py` for issue publishing with auth fallback (`gh` login -> `GITHUB_TOKEN`/`GH_TOKEN` -> draft).
- Add remote README-based issue language selection (Chinese README -> Chinese issue body, otherwise English).

### Changed
- Update app-log issue analysis docs, checklist, and default prompt to document the new issue publishing workflow.
