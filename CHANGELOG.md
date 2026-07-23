# Changelog

All notable changes to the **Caelterra** Hermes plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## v0.1.10 — 2026-07-23

### Fixed

- **Optimise `optimise-skill` skill** — removed all `→` arrow symbols and replaced
  them with natural language sentence connectors for logical flow. Phase 4
  verification checks (A-C) now use `hermes chat -q` instead of manual
  prompt-pasting, running independent Hermes instances for adversarial review.
  Fixed duplicate Step 7 numbering. Added missing `description-patterns.md`
  and `subagent-self-containment.md` reference files to the source bundle.
  Removed stale `references/definition.md`.

---

## v0.1.9 — 2026-07-12

### Fixed

- **Update `uv.lock` to pin fabricium ≥0.1.5** — the lockfile still referenced
  fabricium 0.1.1 which has the old 1-arg `install_bundled_skills()` signature.
  CI failed because `uv sync --dev` respects the lockfile and installed the old
  version. Upgraded to fabricium 0.1.6.

---

## v0.1.5 — 2026-07-11

### Added

- **Auto-detect default profile on `update`** — `_sync_installed_profiles()` now
  detects the `default` profile even when it was never explicitly set up via
  `caelterra setup`. If `~/.hermes/config.yaml` exists, the default profile is
  auto-included in the sync, keeping its SOUL.md in lockstep with the bundle.
- **Tests** — 5 new tests covering auto-detect with SOUL.md, skills-only,
  already-in-state, missing config.yaml, and skipped stale profiles.

### Fixed

- `hermes caelterra update` now correctly updates the default profile's SOUL.md
  even when the profile was not previously recorded in the installation state.

---

## v0.1.2 — 2026-07-11

Multi-profile support with state tracking. Removed `install.sh` — installation is now done exclusively via `hermes plugins install`.

### Added

- **CLI: `status`** — shows per-profile Caelterra installation status (Skills only vs Skills + SOUL.md), last updated time, and lists profiles without Caelterra
- **State management** (`~/.hermes/caelterra_state.json`) — JSON file tracking installation mode and timestamp per profile
- **Multi-profile `setup`** — interactive profile selection (comma-separated or `all`), then choose Skills only or Skills + SOUL.md; installs to all selected profiles
- **Profile sync on `update`** — after pulling latest code, updates SOUL.md per each profile's recorded state (skills-only vs skills+SOUL.md)

### Changed

- `setup` now lists all available Hermes profiles and lets you select which ones to install to
- `update` refreshes SOUL.md automatically for profiles that were set up with `Skills + SOUL.md` mode
- Plugin version bumped to 0.1.2

### Removed

- **`install.sh`** — no longer needed; public repo supports `hermes plugins install LaiTszKin/caelterra` directly

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
