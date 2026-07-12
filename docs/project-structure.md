# Project Structure

## Directory Map

| Directory | Responsibility | Key Files |
|-----------|----------------|-----------|
| `src/caelterra/` | Plugin package: entry point, CLI, state management | `__init__.py`, `git_utils.py`, `SOUL.md`, `plugin.yaml` |
| `src/caelterra/skills/optimise-skill/` | Bundled skill: skill auditing and rewriting | `SKILL.md`, `references/` |
| `src/caelterra/skills/create-skill/` | Bundled skill: skill scaffolding from scratch | `SKILL.md`, `scripts/`, `references/`, `assets/` |
| `tests/` | Unit tests (pytest) | `conftest.py`, `test_sync.py`, `test_git_utils.py` |
| `tests/integration/` | Docker-based CLI integration tests | `conftest.py`, `test_cli.py` |
| `.github/workflows/` | CI/CD (if present) | — |
| `(root)` | Project config and docs | `pyproject.toml`, `uv.lock`, `README.md`, `.pre-commit-config.yaml` |

## Source Layout

```
src/caelterra/
├── __init__.py          # Plugin entry: register(), CaelterraPlugin class
├── git_utils.py         # Re-exports from fabricium.git_utils (backward compat)
├── SOUL.md              # Agent identity — applied to profiles during setup
├── plugin.yaml          # Hermes plugin manifest (name, version, description)
└── skills/
    ├── optimise-skill/  # Skill audit + rewrite workflow
    │   ├── SKILL.md
    │   ├── agents/
    │   └── references/
    └── create-skill/    # Skill scaffolding workflow
        ├── SKILL.md
        ├── scripts/
        ├── references/
        └── assets/
```

## Test Layout

```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures (git_repo)
├── test_git_utils.py        # 10 unit tests for git operations
├── test_sync.py             # 5 tests for profile auto-detection + sync
└── integration/
    ├── conftest.py          # Docker test environment setup
    └── test_cli.py          # Integration tests: setup, status, update-check
```

## Key Files

| File | Purpose |
|------|---------|
| `pyproject.toml` | Project metadata, deps, build config, tool config (ruff, mypy, black) |
| `uv.lock` | Pinned dependency versions |
| `.pre-commit-config.yaml` | Pre-commit hooks: ruff → mypy → black |
| `plugin.yaml` | Hermes plugin manifest (in source tree for self-describing install) |

## How to Update

- Directory added/removed? → Update Directory Map + Source Layout
- New test file? → Update Test Layout
- File repurposed? → Update Key Files table
