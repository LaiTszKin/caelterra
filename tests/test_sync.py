"""Tests for Caelterra — profile syncing logic."""

import json
from pathlib import Path

import pytest

import caelterra.__init__ as caelterra_mod


def test_sync_auto_detect_default_with_soul_md(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Default profile is auto-detected when it exists with SOUL.md and is not in state."""
    fake_home = tmp_path / "hermes"
    fake_home.mkdir()
    (fake_home / "config.yaml").write_text("")
    (fake_home / "SOUL.md").write_text("# SOUL")
    state = {"profiles": {"jovaltus-agent": {"soul_md": True, "updated_at": "2025-01-01T00:00:00"}}}
    (fake_home / "caelterra_state.json").write_text(json.dumps(state))

    monkeypatch.setattr(caelterra_mod, "_get_global_hermes_home", lambda: fake_home)
    caelterra_mod._sync_installed_profiles("test")

    state_after = json.loads((fake_home / "caelterra_state.json").read_text())
    assert "default" in state_after["profiles"]
    assert state_after["profiles"]["default"]["soul_md"] is True

    captured = capsys.readouterr().out
    assert "Auto-detected 'default' profile" in captured
    assert "🧠 Updating SOUL.md" in captured


def test_sync_auto_detect_default_skills_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Default profile is auto-detected as skills-only when SOUL.md is absent."""
    fake_home = tmp_path / "hermes"
    fake_home.mkdir()
    (fake_home / "config.yaml").write_text("")
    # No SOUL.md
    state = {"profiles": {"jovaltus-agent": {"soul_md": True, "updated_at": "2025-01-01T00:00:00"}}}
    (fake_home / "caelterra_state.json").write_text(json.dumps(state))

    monkeypatch.setattr(caelterra_mod, "_get_global_hermes_home", lambda: fake_home)
    caelterra_mod._sync_installed_profiles("test")

    state_after = json.loads((fake_home / "caelterra_state.json").read_text())
    assert "default" in state_after["profiles"]
    assert state_after["profiles"]["default"]["soul_md"] is False

    captured = capsys.readouterr().out
    assert "Auto-detected 'default' profile" in captured
    assert "Skills only (SOUL.md not tracked)" in captured


def test_sync_no_auto_detect_when_already_in_state(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Default profile is NOT auto-detected when already present in state."""
    fake_home = tmp_path / "hermes"
    fake_home.mkdir()
    (fake_home / "config.yaml").write_text("")
    (fake_home / "SOUL.md").write_text("# SOUL")
    state = {"profiles": {"default": {"soul_md": True, "updated_at": "2025-01-01T00:00:00"}}}
    (fake_home / "caelterra_state.json").write_text(json.dumps(state))

    monkeypatch.setattr(caelterra_mod, "_get_global_hermes_home", lambda: fake_home)
    caelterra_mod._sync_installed_profiles("test")

    captured = capsys.readouterr().out
    assert "Auto-detected 'default' profile" not in captured


def test_sync_no_auto_detect_when_no_config_yaml(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Default profile is NOT auto-detected when config.yaml is missing."""
    fake_home = tmp_path / "hermes"
    fake_home.mkdir()
    # No config.yaml
    state = {"profiles": {"jovaltus-agent": {"soul_md": True, "updated_at": "2025-01-01T00:00:00"}}}
    (fake_home / "caelterra_state.json").write_text(json.dumps(state))

    monkeypatch.setattr(caelterra_mod, "_get_global_hermes_home", lambda: fake_home)
    caelterra_mod._sync_installed_profiles("test")

    state_after = json.loads((fake_home / "caelterra_state.json").read_text())
    assert "default" not in state_after["profiles"]

    captured = capsys.readouterr().out
    assert "Auto-detected 'default' profile" not in captured


def test_sync_skips_missing_state_profiles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """State profiles whose directories no longer exist are skipped (no crash)."""
    fake_home = tmp_path / "hermes"
    fake_home.mkdir()
    (fake_home / "config.yaml").write_text("")
    state = {"profiles": {"_t": {"soul_md": True, "updated_at": "2025-01-01T00:00:00"}}}
    (fake_home / "caelterra_state.json").write_text(json.dumps(state))

    monkeypatch.setattr(caelterra_mod, "_get_global_hermes_home", lambda: fake_home)
    caelterra_mod._sync_installed_profiles("test")

    state_after = json.loads((fake_home / "caelterra_state.json").read_text())
    # _t stays in state (not removed)
    assert "_t" in state_after["profiles"]

    captured = capsys.readouterr().out
    assert "Profile '_t' no longer exists — skipping" in captured
