# Changelog

All notable changes to the **Caelterra** Hermes plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## v0.1.0 — 2026-07-11

Initial release. Caelterra is a Hermes plugin for team standardisation,
replacing the old `@laitszkin/apollo-toolkit` npm package.

### Added

- **Plugin structure** — `__init__.py` entry point with `register()`, `plugin.yaml` manifest, `pyproject.toml`
- **Bundled skill** — `optimise-skill` for analysing and optimising SKILL.md files
- **CLI: `setup`** — creates `caelterra` Hermes profile, writes SOUL.md, installs bundled skills to global skills directory. Interactive prompt when overwriting existing SOUL.md (default: yes)
- **CLI: `update --check`** — fetches remote refs from GitHub and reports ahead/behind status
- **CLI: `update`** — fast-forward pulls latest changes, detects and removes stale bundled skills (interactive, default: yes), updates remaining skills, prompts before overwriting SOUL.md (default: yes)
- **Git utilities** (`git_utils.py` with TypedDict return types) — `is_git_repo`, `get_local_head`, `get_remote_url`, `get_default_branch`, `fetch_remote`, `get_remote_head`, `get_ahead_behind`, `pull_branch`
- **Interactive prompts** — `_prompt_yes_no()` with TTY detection, falls back to defaults in non-interactive (curl pipe) environments
- **Stale skill detection** — compares `~/.hermes/skills/` against bundled skills, interactively removes orphaned skills
- **Agent identity** (`SOUL.md`) — follows Hermes recommended format (Vibe / Style / Anti-Patterns / Technical posture)
- **Remote install** (`install.sh`) — single `curl ... | bash` command for team members
- **Quality gates** — `ruff check .`, `mypy --strict .`, `pre-commit` hooks (ruff → mypy → black)
- **Tests** — 10 pytest tests covering all `git_utils` functions with temporary git repositories
- **Documentation** — `README.md` (feature table, install guides, CLI reference, architecture overview, FAQ), `DEPRECATED.md` (npm deprecation instructions)

### Changed

- Repository renamed from `apollo-toolkit` to `caelterra`
- Git history reset (orphan branch) — legacy npm package artifacts removed
- Build system migrated to `uv`

### Simplified

- Extracted `_is_skill_dir()` helper — replaced repeated `is_dir() and SKILL.md.exists()` pattern across 4 call sites
- Flattened `_update_pull()` error handling — early return on failure instead of nested `if/else`

## v0.0.0 — Pre-history

Before v0.1.0 this repository was the `@laitszkin/apollo-toolkit` npm package
(v0.2.0 – v5.3.2). That package has been deprecated. See `DEPRECATED.md` for
details.
