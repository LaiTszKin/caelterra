---
name: maintain-project-constraints
description: Reads the latest codebase and docs to update CLAUDE.md and AGENTS.md at both the project root and per sub-module (crate, package, etc.). CLAUDE.md targets Claude Code; AGENTS.md targets non-Claude agents (Codex, etc.).
---

## Goal

Maintain project constraint files at both root and sub-module levels so that every agent modifying any part of the codebase has clear boundaries to follow.

**Deliverables:**
- Root-level `CLAUDE.md` + `AGENTS.md` (three-section format: Commands / Business Goals / Documentation Index)
- Per-module `CLAUDE.md` + `AGENTS.md` (description / file list / non-violable rules)

## Acceptance Criteria

- Root `CLAUDE.md` and `AGENTS.md` updated and consistent with actual code
- Prohibitions extracted from git history, issues, and CI config
- Every discovered sub-module has its own constraint files
- All generated files accurately reflect the current codebase state

## Workflow

### 1. Explore the Codebase

Read the repository to understand:
- Project structure and how modules are organised
- Build system and package managers in use
- Existing documentation and development conventions
- CI config, git history, and issue patterns

### 2. Extract Prohibitions

Look across the project for implicit and explicit prohibitions. Concrete sources:
- Recurring revert / fix commits in git log
- Infeasible approaches mentioned in past issues
- Operations explicitly banned in CI config
- Technical limitations annotated in project docs

Each prohibition must be specific and actionable (e.g. "never auto-create database migrations" not "handle databases carefully"). Include them in root-level `AGENTS.md` and `CLAUDE.md` under a Prohibitions section.

### 3. Discover Sub-modules

Identify every sub-module that needs its own constraint files. A directory qualifies if EITHER:

1. **Has a package manifest**: the directory contains `Cargo.toml`, `package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle`, etc.
2. **Lives in a well-known group directory**: resides under `packages/`, `crates/`, `apps/`, `lib/`, `modules/`, `components/` AND has a clear boundary (own entry point, README, or standalone deployment unit)

For each sub-module record: relative path and a brief description (extract from the manifest's `description` field or README; infer from code if neither exists).

### 4. Write Root-level Files

Create or update `CLAUDE.md` and `AGENTS.md` in the project root using `assets/templates/root-AGENTS.md` and `assets/templates/root-CLAUDE.md` as format skeletons. Both use exactly three sections in this order:

1. **Common Development Commands** — only include commands verifiable against real entry points (`package.json`, Makefile, scripts, CI config). Before using any `apltk` command, run its `--help` first. Append a one-line purpose per command.
2. **Project Business Goals** — project-level purpose and value, not a feature list.
3. **Project Documentation Index** — cover all files under `docs/features/`, `docs/architecture/`, `docs/principles/`, plus important root files (`README.md`, etc.).

**AGENTS.md vs CLAUDE.md split:**

| Aspect | AGENTS.md | CLAUDE.md |
|--------|-----------|-----------|
| Audience | Non-Claude agents (Codex, etc.) | Claude Code |
| Syntax | Agent-neutral, no platform-specific syntax | May use Claude-specific syntax |
| Claude-only content | Must not include | May include hooks, scheduled tasks, cowork, MCP |
| Common base | Three sections + Prohibitions | Same as AGENTS.md |

Both files must stay under **100 lines**. Prioritise brevity over completeness when constrained.

### 5. Write Per-module Files

For each sub-module discovered in Step 3, create or update `CLAUDE.md` and `AGENTS.md` in its directory using `assets/templates/module-CLAUDE.md` as the format skeleton.

Key points:
- Module-level `CLAUDE.md` and `AGENTS.md` have identical content — the format is simple and carries no platform-specific information
- `MODULE FILE LIST` covers all source files; exclude generated output, dist, node_modules, target, etc.
- `RULES SHOULD NOT BE VIOLATED` derives from: module boundary rules, dependency direction, internal conventions, and historical error patterns
- If files already exist, verify their accuracy and update stale content — don't just append

## Verification

Self-review before delivery:

- [ ] Every sub-module has both `CLAUDE.md` and `AGENTS.md`
- [ ] All sub-modules discovered in Step 3 are covered — none missed
- [ ] File lists match actual source files in each directory
- [ ] Every prohibition has supporting evidence (git commit hash, issue link, CI config line number, or doc excerpt)
- [ ] Every `RULES SHOULD NOT BE VIOLATED` entry can be traced back to code structure or project history — no invented rules
- [ ] Documentation Index contains no dead links

## References

- `assets/templates/root-AGENTS.md` — format skeleton for root-level AGENTS.md
- `assets/templates/root-CLAUDE.md` — format skeleton for root-level CLAUDE.md
- `assets/templates/module-CLAUDE.md` — format skeleton for per-module constraint files
