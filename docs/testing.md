# Testing

## Framework

[pytest](https://docs.pytest.org/) 9.1.1 — no plugins beyond stdlib.

## Commands

```bash
uv run pytest tests/ -v              # Full suite
uv run pytest tests/test_sync.py -v  # Single file
uv run pytest tests/ -k "auto_detect"  # Filter by test name
uv run pytest tests/test_git_utils.py -v  # Git utility tests
```

Integration tests require Docker:

```bash
uv run pytest tests/integration/ -v  # Docker-based CLI tests
```

## Test Layout

```
tests/
├── conftest.py              # Shared fixtures (git_repo)
├── test_git_utils.py        # 10 unit tests: git operations via temp repos
├── test_sync.py             # 5 unit tests: profile auto-detection + sync logic
└── integration/
    ├── conftest.py          # Docker test env (sets FABRICIUM_TEST_* env vars)
    └── test_cli.py          # Integration: setup, status, update-check via real Hermes in Docker
```

## Fixtures

| Fixture | Scope | Source | Description |
|---------|-------|--------|-------------|
| `git_repo` | function | `tests/conftest.py` | Temporary git repo with one initial commit |
| `hermes_test_env` | function | `tests/integration/conftest.py` (re-exported from `fabricium.testing.fixtures`) | Docker-based Hermes environment for CLI integration tests |
| `hermes_config` | function | Same as above | Hermes config fixture for Docker tests |

## Mock Policy

- **Unit tests**: monkeypatch `fabricium_state._get_global_hermes_home()` to redirect `~/.hermes/` to a temp directory. No mocking of caelterra's own code.
- **Integration tests**: real Hermes agent in Docker — no mocking. Tests exercise actual CLI commands end-to-end.
- **Git operations**: tested against real temporary git repos with `git_repo` fixture. No mocking of `git` binary.

## Test Patterns

- **File system isolation**: `tmp_path` (pytest built-in) for all temp directories
- **Output capture**: `capsys` fixture captures stdout/stderr for assertion
- **No database**: no DB fixtures needed; state is file-based JSON
- **No test markers**: tests not categorised by `@pytest.mark` decorators

## Quality Gates (from pre-commit)

| Step | Command | Blocks Commit? |
|------|---------|---------------|
| Lint | `ruff check .` | Yes |
| Type check | `mypy --strict .` | Yes |
| Format | `black --quiet .` | No (auto-fixes) |

Run all gates manually:

```bash
uv run pre-commit run --all-files
```

## CI

No CI workflow file detected in the repository. Integration tests run via Docker locally.

## How to Update

- New test fixture? → Add to Fixtures table
- Mock policy changed? → Update Mock Policy section
- CI added? → Update CI section with workflow file reference

## Find It Fast

```bash
grep -rn "def test_" tests/                    # All test functions
grep -rn "fixture" tests/                      # All fixtures
grep -rn "monkeypatch\|mock\|patch" tests/     # All mocking sites
```
