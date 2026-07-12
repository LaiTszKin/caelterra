# Module: caelterra.git_utils

**Purpose:** Backward-compatible re-export shim for git utilities now living in `fabricium.git_utils`.

Source: `src/caelterra/git_utils.py` (27 lines)

## Public API

All symbols are re-exported from `fabricium.git_utils`. The shim exists so existing imports like `from caelterra import git_utils` / `from caelterra.git_utils import is_git_repo` continue to work.

| Symbol | Type | Description |
|--------|------|-------------|
| `AheadBehind` | TypedDict | `{ahead: int, behind: int, local_head: str, remote_head: str or None}` |
| `CommitResult` | TypedDict | `{success: bool, message: str, commit_hash: str or None}` |
| `FetchResult` | TypedDict | `{success: bool, message: str, fetched: int}` |
| `PullResult` | TypedDict | `{success: bool, before: str or None, after: str or None, message: str}` |
| `is_git_repo(path)` | `(str) -> bool` | Check if path is inside a git repo |
| `get_local_head(path, ref?)` | `(str, str?) -> str or None` | Get SHA of local ref (default: HEAD) |
| `get_remote_url(path, remote?)` | `(str, str?) -> str` | Get remote URL (default: origin) |
| `get_default_branch(path, remote?)` | `(str, str?) -> str` | Get default branch name (default: origin) |
| `fetch_remote(path, remote?)` | `(str, str?) -> FetchResult` | `git fetch` a remote |
| `get_remote_head(path, remote?, ref?)` | `(str, str?, str?) -> str or None` | Get SHA of remote ref |
| `get_ahead_behind(path, remote?)` | `(str, str?) -> AheadBehind` | Compare local vs remote HEAD |
| `pull_branch(path, remote?)` | `(str, str?) -> PullResult` | `git pull --ff-only` |
| `commit(path, message)` | `(str, str) -> CommitResult` | Stage all + commit |
| `stage_all(path)` | `(str) -> None` | `git add -A` |
| `get_diff(path)` | `(str) -> str` | `git diff` output |
| `get_diff_stat(path)` | `(str) -> str` | `git diff --stat` output |
| `get_head_hash(path)` | `(str) -> str` | Shortcut for `get_local_head()` |
| `is_ancestor(path, ancestor, descendant)` | `(str, str, str) -> bool` | `git merge-base --is-ancestor` |

## Dependencies

**Outbound**: `fabricium.git_utils` (all symbols re-exported)

**Inbound**:

| Consumer | Purpose |
|----------|---------|
| `tests/test_git_utils.py` | 10 unit tests exercising all git operations via temporary repos |

## Patterns & Gotchas

- **This module is a shim** — new code should import directly from `fabricium.git_utils`, not from `caelterra.git_utils`.
- **No-op without remote**: Functions like `fetch_remote()`, `get_remote_head()`, `get_ahead_behind()` return safe defaults (`None`, `0`, `False`) when no remote is configured — never raise.
- **TypedDict return types**: All functions that can fail return typed dicts with `success: bool` rather than raising exceptions. Check `result["success"]` before using other fields.

## How to Update

- New git utility added to fabricium? → Re-export it here + update table
- Git utility removed from fabricium? → Remove re-export + update table (this is a breaking change for consumers)

## Find It Fast

```bash
grep -n "from fabricium.git_utils import" src/caelterra/git_utils.py  # All re-exports
grep -rn "from caelterra.git_utils import\|from caelterra import git_utils" .  # Find consumers
```
