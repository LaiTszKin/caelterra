"""Backward-compatibility re-export from fabricium.git_utils.

All git utilities now live in Fabricium — the shared Hermes plugin
infrastructure library. This module exists so existing imports
like ``from caelterra import git_utils`` continue to work.
"""

from fabricium.git_utils import (  # noqa: F401
    AheadBehind,
    CommitResult,
    FetchResult,
    PullResult,
    commit,
    fetch_remote,
    get_ahead_behind,
    get_default_branch,
    get_diff,
    get_diff_stat,
    get_head_hash,
    get_local_head,
    get_remote_head,
    get_remote_url,
    is_ancestor,
    is_git_repo,
    pull_branch,
    stage_all,
)
