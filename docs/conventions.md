# Conventions

## Naming

| Category | Convention | Example |
|----------|-----------|---------|
| Modules/files | `snake_case` | `git_utils.py` |
| Classes | `PascalCase` | `CaelterraPlugin` |
| Functions/methods | `snake_case` | `_sync_installed_profiles()` |
| Private internals | `_` prefix | `_ensure_fabricium()`, `_load_state()` |
| Test files | `test_<module>.py` | `test_sync.py`, `test_git_utils.py` |
| Test functions | `test_<scenario>()` | `test_sync_auto_detect_default_with_soul_md()` |
| Fixtures | `snake_case` | `git_repo`, `hermes_test_env` |

## Import Style

- **Order**: stdlib → third-party → local (enforced by ruff `I` rule)
- **Lazy imports** for optional/bootstrapped deps: `fabricium` imported inside `_ensure_fabricium()` guard
- **Re-export shims** use `from X import ...  # noqa: F401` pattern
- **No wildcard imports** (`from x import *`) — rule enforced by ruff `F403`

## Error Handling

- **CLI handlers** print errors to stdout/stderr and return non-zero exit
- **Library functions** return typed dicts with `success: bool` + `message: str` on failure (see `git_utils.AheadBehind`, `FetchResult`, `PullResult`)
- **None returns** signal "not found" / "not applicable" (e.g., `get_remote_head()` returns `None` when no remote)
- **Early return** pattern: check for failure preconditions first, return immediately, avoid nested `if/else`

## Logging

- Module-level logger: `logger = logging.getLogger(__name__)`
- Info level for registration events: `logger.info("Caelterra registered")`
- CLI output uses `print()` for user-facing messages, not logging

## Configuration

| Config Source | Purpose |
|--------------|---------|
| `pyproject.toml` | Project metadata, build, tool configs |
| `plugin.yaml` | Hermes plugin manifest (name, version, description) |
| `caelterra_state.json` | Per-profile installation state (~/.hermes/) |
| Environment (env vars) | Test configuration: `FABRICIUM_TEST_PLUGIN_NAME`, `FABRICIUM_TEST_PLUGIN_DIR` |
| `SOUL.md` | Agent identity — written to profiles during setup |

## Testing

- **Framework**: pytest with `tmp_path` for filesystem isolation
- **Fixtures** in `conftest.py` at each level (root for unit, `tests/integration/` for Docker)
- **Mock policy**: monkeypatch `fabricium_state._get_global_hermes_home()` to isolate filesystem; no mocking of own code
- **Test data**: generated in fixtures via temporary git repos, not checked-in data files
- **Integration tests**: Docker-based, requiring `fabricium.testing.harness.HermesDockerTestEnv`
- **Test IDs**: descriptive function names that explain the scenario and expected outcome
- **No test markers**: tests not categorised by markers; run all with `pytest tests/ -v`

## Git / Commits

- **Commit style**: conventional commits (`feat:`, `fix:`, `release:`, `chore:`)
- **Version bumps**: `release: vX.Y.Z` commits with corresponding git tags
- **Update guard**: `_update_pull()` blocks if working tree is dirty (uncommitted changes)

## Security

- **No secrets in code**: no hardcoded tokens, keys, or credentials
- **GitHub auth**: relies on user's existing git credentials; `fetch_remote()`/`pull_branch()` use local git config
- **Default answers**: non-TTY mode uses safe defaults (yes for cleanup, no for destructive ops)

## How to Update

- New naming pattern? → Add row to Naming table
- Import convention changed? → Update Import Style section
- New config source? → Add row to Configuration table
- Test policy changed? → Update Testing section
