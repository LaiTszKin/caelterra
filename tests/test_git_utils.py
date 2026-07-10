"""Tests for Caelterra — git utilities.

Uses temporary git repositories to test git operations.
"""

from pathlib import Path

from caelterra import git_utils


def test_is_git_repo_true(git_repo: Path) -> None:
    assert git_utils.is_git_repo(str(git_repo)) is True


def test_is_git_repo_false(tmp_path: Path) -> None:
    assert git_utils.is_git_repo(str(tmp_path / "nonexistent")) is False


def test_get_local_head_default(git_repo: Path) -> None:
    sha = git_utils.get_local_head(str(git_repo))
    assert sha is not None
    assert len(sha) == 40
    assert all(c in "0123456789abcdef" for c in sha)


def test_get_local_head_nonexistent_ref(git_repo: Path) -> None:
    sha = git_utils.get_local_head(str(git_repo), ref="nonexistent-branch-xyz")
    assert sha is None


def test_get_remote_url_no_remote(git_repo: Path) -> None:
    url = git_utils.get_remote_url(str(git_repo))
    assert url == ""


def test_get_default_branch_no_remote(git_repo: Path) -> None:
    branch = git_utils.get_default_branch(str(git_repo))
    assert branch == "main"


def test_fetch_remote_no_remote(git_repo: Path) -> None:
    result = git_utils.fetch_remote(str(git_repo))
    assert result["success"] is False
    assert "message" in result


def test_get_remote_head_no_remote(git_repo: Path) -> None:
    sha = git_utils.get_remote_head(str(git_repo))
    assert sha is None


def test_get_ahead_behind_no_remote(git_repo: Path) -> None:
    info = git_utils.get_ahead_behind(str(git_repo))
    assert info["ahead"] == 0
    assert info["behind"] == 0
    assert info["remote_head"] is None


def test_pull_branch_no_remote(git_repo: Path) -> None:
    result = git_utils.pull_branch(str(git_repo))
    assert result["success"] is False
    assert "message" in result
    # Before should be set since we have a commit
    assert result["before"] is not None
    assert len(result["before"]) == 40
