# Caelterra — Team standardisation plugin for Hermes

## Build & Test

- `uv run ruff check .` — Lint (E, F, I, N, W rules; fail on unfixable issues)
- `uv run mypy --strict .` — Static type checking
- `uv run black --check .` — Format check (dry-run)
- `uv run pre-commit run --all-files` — Full quality gate: lint → type-check → format
- `uv run pytest tests/ -v` — Unit tests (skips integration/)
- `uv run pytest tests/test_sync.py -v` — Single test file
- `uv run pytest tests/ -k "auto_detect"` — Run tests matching pattern
- `uv run pytest tests/integration/ -v` — Docker-based CLI integration tests

## Tech Stack

- **Language**: Python 3.10+ (dev uses 3.11)
- **Package manager**: uv — never pip/poetry
- **Build backend**: hatchling (PEP 621, src layout)
- **Testing**: pytest ≥8 (no plugins)
- **Lint**: ruff ≥0.8 (select: E, F, I, N, W)
- **Type check**: mypy ≥1.16 (`--strict`)
- **Format**: black ≥25 (line-length 100)
- **Runtime dep**: [fabricium](https://github.com/LaiTszKin/fabricium) ≥0.1.1 — shared Hermes plugin infrastructure
- **Distribution**: pip entry point (`hermes_agent.plugins`) via PyPI trusted publisher

## Project Structure

- `src/caelterra/` — Plugin package: entry point, CLI, state management
  - `__init__.py` — `register()` + `CaelterraPlugin` class
  - `git_utils.py` — Re-export shim from `fabricium.git_utils` (backward compat)
  - `plugin.yaml` — Hermes plugin manifest
  - `SOUL.md` — Agent identity applied during `caelterra setup`
- `src/caelterra/skills/` — Bundled skills auto-installed to profiles
- `tests/` — Unit tests (no Docker needed; `tmp_path` + `git_repo` fixture)
- `tests/integration/` — Docker-based CLI integration tests
- `.github/workflows/release.yml` — CI: build + publish on git tag push
- `docs/` — Architecture, conventions, testing, workflows, project structure

## Key Constraints

- **Self-bootstrapping**: `_ensure_fabricium()` auto-installs fabricium via pip if import fails. Hermes may recreate its venv — this guard keeps the plugin alive without manual intervention.
- **Multi-profile mode**: `default_profile=None` — each profile gets skills independently. The `default` profile is auto-detected during `caelterra update` even if never explicitly set up.
- **Import order**: stdlib → third-party → local (enforced by ruff `I` rule). No wildcard imports.
- **`git_utils.py` is a re-export shim** — all git logic lives in fabricium. This file only re-exports for backward compatibility. New git features → fabricium, not caelterra.
- **Source layout**: `src/caelterra/` package. Flat layout (`packages = ["."]`) breaks editable installs — never flatten.
- **Two config files for version**: bump both `pyproject.toml` and `plugin.yaml` on release.
- **Entry point distribution**: pip-installable, not directory-based. Old `hermes plugins install` directory installs must be removed before pip migration.

## Testing

- **Unit tests**: `uv run pytest tests/ -v` — no Docker. Filesystem isolation via `tmp_path` + `git_repo` fixture (temp git repos with real `git` binary).
- **Integration tests**: `uv run pytest tests/integration/ -v` — requires Docker. Exercises real Hermes CLI in container.
- **Mock policy**: monkeypatch `fabricium_state._get_global_hermes_home()` to redirect `~/.hermes/` to a temp directory. Never mock caelterra's own code.
- **No test markers**: tests not categorized by `@pytest.mark`. Filter by name with `-k`.
- **Test IDs**: descriptive function names explaining scenario + expected outcome (e.g. `test_sync_auto_detect_default_with_soul_md`).

## Git Workflow

- **Commits**: conventional commits — `feat:`, `fix:`, `release:`, `chore:`
- **Releases**: bump version in `pyproject.toml` + `plugin.yaml`, commit `release: vX.Y.Z`, tag `vX.Y.Z`, push tag. CI auto-publishes to PyPI.
- **Self-update guard**: `caelterra update` blocks if working tree is dirty.
- **No force push**: `git pull --ff-only` only.

## Documentation

- `docs/architecture.md` — C4 diagrams, data flows, architectural decisions
- `docs/conventions.md` — Naming, imports, error handling, logging, config, git conventions, security
- `docs/testing.md` — Test commands, fixtures, mock policy, quality gates
- `docs/workflows.md` — Task recipes: add skill, add CLI command, cut release, debug
- `docs/project-structure.md` — Directory map, source/test layout, key files

## Boundaries

**Always:**
- Run `uv run pre-commit run --all-files` before committing
- Add tests for new functionality
- Update `docs/` when changing conventions, structure, or architecture

**Ask first:**
- Adding new dependencies to `pyproject.toml`
- Changing CI/CD (`release.yml`)
- Modifying `plugin.yaml` or `SOUL.md`

**Never:**
- Commit `.env` files or secrets
- Mock caelterra's own code in tests — only monkeypatch external state
- Use `shell=True` for subprocess git commands — pass args as lists
- Edit skills under profiles directly — they're managed by the plugin bundle
