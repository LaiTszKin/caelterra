"""
Caelterra — team standardisation plugin for Hermes.

Registers bundled skills and CLI commands for multi-profile
setup, status, and version management.

Install via: hermes plugins install LaiTszKin/caelterra
"""

import json
import logging
import os
import shutil
import subprocess
import sys
from argparse import Namespace
from datetime import datetime
from pathlib import Path
from typing import Any

from . import git_utils

logger = logging.getLogger(__name__)

_PLUGIN_DIR = Path(__file__).parent
_STATE_FILENAME = "caelterra_state.json"


# ── Path helpers ───────────────────────────────────────────────────


def _get_global_hermes_home() -> Path:
    """Return the global Hermes home directory, not a profile-specific one.

    When running under a profile, HERMES_HOME is set to the profile directory
    (e.g. ~/.hermes/profiles/caelterra/). We need the actual global home
    (~/.hermes/) for skills, profiles dir, etc.
    """
    env_home = os.environ.get("HERMES_HOME")
    if env_home:
        p = Path(env_home).resolve()
        # If we're under a profiles/<name> directory, go up two levels
        if len(p.parts) >= 2 and p.parts[-2] == "profiles":
            return p.parent.parent
        return p
    return Path.home() / ".hermes"


def _get_profiles_dir() -> Path:
    """Return the global Hermes profiles directory."""
    return _get_global_hermes_home() / "profiles"


def _get_profile_dir(profile_name: str) -> Path:
    """Return the profile directory for a given profile name.

    The 'default' profile is special — its home is the global Hermes
    directory (~/.hermes/), not a subdirectory of profiles/.
    """
    if profile_name == "default":
        return _get_global_hermes_home()
    return _get_profiles_dir() / profile_name


def _get_global_skills_dir() -> Path:
    """Return the global Hermes skills directory."""
    return _get_global_hermes_home() / "skills"


def _get_state_path() -> Path:
    """Return the path to the Caelterra state file (~/.hermes/caelterra_state.json)."""
    return _get_global_hermes_home() / _STATE_FILENAME


# ── State management ───────────────────────────────────────────────


def _load_state() -> dict[str, Any]:
    """Load installation state from JSON file."""
    state_path = _get_state_path()
    if state_path.exists():
        try:
            result = json.loads(state_path.read_text())
            assert isinstance(result, dict)
            return result
        except (json.JSONDecodeError, OSError, AssertionError):
            pass
    return {"profiles": {}}


def _save_state(state: dict[str, Any]) -> None:
    """Save installation state to JSON file."""
    state_path = _get_state_path()
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    except OSError as e:
        print(f"  ! Could not save state: {e}")


def _set_profile_state(profile_name: str, soul_md: bool) -> None:
    """Record that a profile has been set up with Caelterra.

    The presence of a profile in the state means skills have been installed.
    The *soul_md* flag indicates whether SOUL.md was also deployed.
    """
    state = _load_state()
    state["profiles"][profile_name] = {
        "soul_md": soul_md,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    _save_state(state)


# ── Profile listing ────────────────────────────────────────────────


def _list_profiles() -> list[str]:
    """List all available Hermes profile names.

    Scans the profiles dir for named profiles, and always includes
    'default' (whose config lives at ~/.hermes/config.yaml).
    """
    profiles: list[str] = []
    profiles_dir = _get_profiles_dir()
    if profiles_dir.is_dir():
        profiles.extend(
            child.name
            for child in sorted(profiles_dir.iterdir())
            if child.is_dir() and (child / "config.yaml").exists()
        )
    # default profile uses ~/.hermes/config.yaml, not a subdirectory
    if _get_global_hermes_home().joinpath("config.yaml").exists():
        profiles.insert(0, "default")
    return profiles


# ── Interactive prompts ────────────────────────────────────────────


def _prompt_yes_no(prompt: str, default: bool = True) -> bool:
    """Ask a yes/no question interactively.

    Returns *default* when stdin is not a TTY (non-interactive).
    """
    if not sys.stdin.isatty():
        return default
    hint = "Y/n" if default else "y/N"
    raw = input(f"{prompt} [{hint}] ").strip().lower()
    if not raw:
        return default
    return raw in ("y", "yes")


def _prompt_select_profiles(available: list[str]) -> list[str]:
    """Interactive multi-select prompt for profiles.

    In non-TTY mode returns all profiles.
    """
    if not sys.stdin.isatty():
        return list(available)

    print("\n📁 Available profiles:")
    for i, name in enumerate(available, 1):
        print(f"   {i}) {name}")
    print()

    raw = input("  Select profiles (comma-separated numbers, or 'all'): ").strip().lower()
    if not raw or raw == "all":
        return list(available)

    selected: list[str] = []
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            idx = int(part) - 1
            if 0 <= idx < len(available):
                selected.append(available[idx])

    return selected or list(available)


# ── Profile & SOUL.md ──────────────────────────────────────────────


def _ensure_profile(profile_name: str) -> bool:
    """Create the profile if it doesn't exist.

    Returns True if the profile exists or was created.
    """
    profile_dir = _get_profile_dir(profile_name)
    if profile_dir.exists() and (profile_dir / "config.yaml").exists():
        return True

    print(f"\n  Creating profile '{profile_name}'...")
    try:
        subprocess.run(
            ["hermes", "profile", "create", profile_name],
            check=True,
            capture_output=True,
            text=True,
        )
        print(f"  ✓ Profile '{profile_name}' created")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ! Could not auto-create profile: {e.stderr.strip()}")
        print(f"    Create it manually: hermes profile create {profile_name}")
        return False
    except FileNotFoundError:
        print("  ! 'hermes' CLI not found on PATH")
        print(f"    Create the profile manually: hermes profile create {profile_name}")
        return False


def _apply_soul_md(profile_name: str) -> bool:
    """Write SOUL.md from the plugin bundle into the profile directory."""
    profile_dir = _get_profile_dir(profile_name)
    soul_src = _PLUGIN_DIR / "SOUL.md"
    soul_dst = profile_dir / "SOUL.md"

    if not soul_src.exists():
        print(f"  ! Bundled SOUL.md not found at {soul_src}")
        return False

    try:
        soul_dst.write_text(soul_src.read_text())
        print(f"  ✓ SOUL.md written to {soul_dst}")
        return True
    except OSError as e:
        print(f"  ! Could not write SOUL.md: {e}")
        return False


# ── Bundled skill management ───────────────────────────────────────


def _is_skill_dir(path: Path) -> bool:
    """Return True if *path* is a directory containing SKILL.md."""
    return path.is_dir() and (path / "SKILL.md").exists()


def _get_bundled_skill_names() -> set[str]:
    """Return the set of skill names currently bundled in the plugin directory."""
    skills_dir = _PLUGIN_DIR / "skills"
    if not skills_dir.is_dir():
        return set()
    return {child.name for child in sorted(skills_dir.iterdir()) if _is_skill_dir(child)}


def _remove_installed_skill(skill_name: str) -> bool:
    """Remove an installed skill from the global skills directory.

    Returns True if the skill was removed or didn't exist.
    """
    skill_dir = _get_global_skills_dir() / skill_name
    if not skill_dir.exists():
        return True
    try:
        shutil.rmtree(skill_dir)
        print(f"  🗑  Removed stale skill '{skill_name}' from global skills")
        return True
    except OSError as e:
        print(f"  ! Could not remove stale skill '{skill_name}': {e}")
        return False


def _remove_stale_skills(after_skills: set[str]) -> None:
    """Detect and remove skills that are no longer bundled.

    Compares currently installed skills against the new set of bundled
    skills. Any skill installed in ~/.hermes/skills/ that no longer
    exists in the plugin is stale and gets removed.
    """
    global_dir = _get_global_skills_dir()
    if not global_dir.is_dir():
        return

    installed = {child.name for child in global_dir.iterdir() if _is_skill_dir(child)}
    stale = installed - after_skills
    if not stale:
        print("  ✓ No stale skills to remove")
        return

    print()
    print("  📋 Stale skills detected (removed from bundle):")
    for name in sorted(stale):
        print(f"    - {name}")

    if _prompt_yes_no("  Remove stale skills?", default=True):
        for name in sorted(stale):
            _remove_installed_skill(name)
    else:
        print("  ⏭  Skipped stale skill removal")


def _install_bundled_skills() -> bool:
    """Copy bundled skills to the global skills dir for visibility.

    Returns True if all skills were installed successfully.
    """
    skills_dir = _PLUGIN_DIR / "skills"
    if not skills_dir.is_dir():
        print("  ! No bundled skills directory found")
        return False

    all_ok = True
    for child in sorted(skills_dir.iterdir()):
        if not _is_skill_dir(child):
            continue
        skill_md = child / "SKILL.md"
        skill_name = child.name
        dst = _get_global_skills_dir() / skill_name / "SKILL.md"

        if dst.exists():
            if dst.read_text() == skill_md.read_text():
                print(f"  ✓ Skill '{skill_name}' already installed and up to date")
                continue

        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(skill_md.read_text())
            print(f"  ✓ Skill '{skill_name}' installed to {dst}")
            print(f"    Load via: skill_view('{skill_name}')")
        except OSError as e:
            print(f"  ! Could not install skill '{skill_name}': {e}")
            all_ok = False

    return all_ok


# ── CLI handlers ───────────────────────────────────────────────────


def _setup_command(args: Namespace) -> None:  # noqa: ARG001
    """Handler for 'hermes caelterra setup'.

    Interactive prompt:
      1. List available profiles.
      2. Let user select one or more.
      3. Ask: skills only, or skills + SOUL.md.
      4. Install and persist state.
    """
    print("⚡ Caelterra Setup — Multi-Profile")
    print("━" * 40)

    # Step 1: List profiles
    available = _list_profiles()
    if not available:
        print("\n! No Hermes profiles found.")
        print("  Create one first: hermes profile create <name>")
        return

    selected = _prompt_select_profiles(available)
    if not selected:
        print("\n  ⏭  No profiles selected — exiting.")
        return

    print(f"\n  Selected profiles: {', '.join(selected)}")

    # Step 2: Choose installation mode
    print("\n📦 Installation mode:")
    if _prompt_yes_no("  Install SOUL.md with agent identity?", default=True):
        mode = "soul_md"
        print("  ✓ Mode: Skills + SOUL.md")
    else:
        mode = "skills_only"
        print("  ✓ Mode: Skills only")

    # Step 3: Install to each selected profile
    any_ok = False
    for profile_name in selected:
        print(f"\n{'─' * 40}")
        print(f"📁 Profile: {profile_name}")

        profile_ok = _ensure_profile(profile_name)
        if not profile_ok:
            print(f"  ⏭  Skipping profile '{profile_name}'")
            continue

        # Install bundled skills (global)
        print()
        _install_bundled_skills()

        # Write SOUL.md if requested
        soul_ok = True
        if mode == "soul_md":
            print()
            profile_dir = _get_profile_dir(profile_name)
            soul_dst = profile_dir / "SOUL.md"
            if soul_dst.exists():
                if _prompt_yes_no("  Overwrite existing SOUL.md?", default=False):
                    soul_ok = _apply_soul_md(profile_name)
                else:
                    print("  ⏭  Keeping existing SOUL.md")
            else:
                soul_ok = _apply_soul_md(profile_name)

        # Persist state
        _set_profile_state(profile_name, soul_md=(mode == "soul_md" and soul_ok))
        any_ok = True

    # Summary
    print(f"\n{'━' * 40}")
    if any_ok:
        print("✅ Caelterra setup complete for selected profiles.")
        print("  Check status: hermes caelterra status")
        print("  Update:       hermes caelterra update")
    else:
        print("⚠️  Setup incomplete.")


def _status_command(args: Namespace) -> None:  # noqa: ARG001
    """Handler for 'hermes caelterra status'.

    Shows per-profile installation status.
    """
    print("📊 Caelterra Installation Status")
    print("━" * 40)

    state = _load_state()
    profiles_state = state.get("profiles", {})

    if not profiles_state:
        print("\n  Caelterra has not been installed to any profile yet.")
        print("  Run: hermes caelterra setup")
        return

    print()
    header = f"{'Profile':<22} {'Status':<24} {'Last Updated'}"
    sep = f"{'─' * 22} {'─' * 24} {'─' * 20}"
    print(f"  {header}")
    print(f"  {sep}")
    for name, info in sorted(profiles_state.items()):
        status = "Skills + SOUL.md ✓" if info.get("soul_md") else "Skills only"
        updated = info.get("updated_at", "—")
        print(f"  {name:<22} {status:<24} {updated}")
    print()

    # Also detect profiles without Caelterra
    all_profiles = _list_profiles()
    missing = [p for p in all_profiles if p not in profiles_state]
    if missing:
        print("  📋 Profiles without Caelterra:")
        for name in missing:
            print(f"    - {name}")
        print("  Run: hermes caelterra setup")


def _update_check(args: Namespace) -> None:  # noqa: ARG001
    """Handler for 'hermes caelterra update --check'.

    Compares local HEAD against remote origin/main and reports
    whether updates are available.
    """
    project_dir = str(_PLUGIN_DIR.resolve())

    if not git_utils.is_git_repo(project_dir):
        print("! Not a git repository — cannot check for updates.")
        print("  If installed from a tarball, re-install from source:")
        print("    git clone https://github.com/LaiTszKin/caelterra.git")
        return

    remote_url = git_utils.get_remote_url(project_dir)
    if not remote_url:
        print("! No remote 'origin' configured — cannot check for updates.")
        return

    print("🔍 Checking for Caelterra updates...")
    print(f"   Remote: {remote_url}")

    local_head = git_utils.get_local_head(project_dir)

    # Fetch remote refs
    print("   Fetching remote refs...", end=" ", flush=True)
    fetch_result = git_utils.fetch_remote(project_dir)
    print("✓" if fetch_result["success"] else "✗")

    if not fetch_result["success"]:
        print(f"   Fetch failed: {fetch_result['message']}")
        return

    # Compare
    info = git_utils.get_ahead_behind(project_dir)
    remote_head = info.get("remote_head")

    if remote_head is None:
        print("! Could not determine remote HEAD.")
        return

    behind = info.get("behind", 0)
    ahead = info.get("ahead", 0)

    print(f"\n   Local:  {local_head[:12] if local_head else 'unknown'}")
    print(f"   Remote: {remote_head[:12]}")

    if behind > 0:
        print(f"\n📦 {behind} new commit(s) behind remote.")
        print("   Run 'hermes caelterra update' to pull the latest changes.")
    elif ahead > 0:
        print(f"\n⚠️  Local is {ahead} commit(s) AHEAD of remote.")
        print("   (You have local changes not yet pushed.)")
    else:
        print("\n✅ Caelterra is up to date.")


def _sync_installed_profiles(context: str = "") -> None:
    """Update skills and SOUL.md for all profiles in the installation state.

    Called after pulling latest code to ensure profiles are in sync.
    Skills are already expected to be updated globally; this function
    re-applies SOUL.md where tracked and refreshes timestamps.
    """
    state = _load_state()
    profiles_state = state.get("profiles", {})

    if not profiles_state:
        print("\n  No profiles in installation state.")
        print("  Run: hermes caelterra setup")
        return

    ctx = f" ({context})" if context else ""
    print(f"\n{'─' * 40}")
    print(f"🔄 Syncing profiles{ctx}")

    ts = datetime.now().isoformat(timespec="seconds")

    # Auto-detect the "default" profile: if the global Hermes home has a
    # config.yaml, the default profile exists.  We sync its SOUL.md even
    # when it wasn't explicitly set up via `caelterra setup`, so that
    # `caelterra update` keeps it in lockstep with the bundle.
    default_home = _get_global_hermes_home()
    if "default" not in profiles_state and (default_home / "config.yaml").exists():
        has_soul = (default_home / "SOUL.md").exists()
        profiles_state["default"] = {"soul_md": has_soul}
        state["profiles"]["default"] = {"soul_md": has_soul, "updated_at": ts}
        print("\n  📋 Auto-detected 'default' profile for syncing")

    synced = 0
    for profile_name, info in sorted(profiles_state.items()):
        profile_dir = _get_profile_dir(profile_name)
        if not profile_dir.exists() or not (profile_dir / "config.yaml").exists():
            print(f"\n  ⏭  Profile '{profile_name}' no longer exists — skipping")
            continue

        print(f"\n📁 Profile: {profile_name}")

        # SOUL.md
        if info.get("soul_md"):
            print("  🧠 Updating SOUL.md...")
            _apply_soul_md(profile_name)
        else:
            print("  ✓ Skills only (SOUL.md not tracked)")

        # Refresh timestamp in state
        state["profiles"][profile_name]["updated_at"] = ts
        synced += 1

    _save_state(state)
    print(f"\n  ✅ {synced} profile(s) synced")


def _update_pull(args: Namespace) -> None:  # noqa: ARG001
    """Handler for 'hermes caelterra update'.

    Pulls the latest changes from the remote repository.
    Detects and removes stale bundled skills.
    Then updates each previously-installed profile according to its state.
    """
    project_dir = str(_PLUGIN_DIR.resolve())

    if not git_utils.is_git_repo(project_dir):
        print("! Not a git repository — cannot update.")
        return

    remote_url = git_utils.get_remote_url(project_dir)
    if not remote_url:
        print("! No remote 'origin' configured — cannot update.")
        return

    print("📦 Updating Caelterra...")
    print(f"   Remote: {remote_url}")

    # Check for uncommitted changes first
    try:
        status = subprocess.check_output(
            ["git", "-C", project_dir, "status", "--porcelain"],
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        status = ""

    if status:
        print("\n! You have uncommitted changes. Stash or commit them first:")
        for line in status.splitlines():
            print(f"   {line}")
        print("\n  Then run: hermes caelterra update")
        return

    # Fetch first so we can show what's coming
    print("   Fetching remote refs...", end=" ", flush=True)
    fetch_result = git_utils.fetch_remote(project_dir)
    print("✓" if fetch_result["success"] else "✗")

    if not fetch_result["success"]:
        print(f"   Fetch failed: {fetch_result['message']}")
        return

    # Check what's coming
    info = git_utils.get_ahead_behind(project_dir)
    behind = info.get("behind", 0)

    local_head = git_utils.get_local_head(project_dir)
    print(f"\n   Before: {local_head[:12] if local_head else 'unknown'}")

    if behind == 0:
        print("   After:  already up to date")
        # Still refresh skills and SOUL in case state drifted
        print("\n📚 Refreshing bundled skills...")
        _install_bundled_skills()
        _sync_installed_profiles("already up to date — refreshing")
        print(f"\n{'━' * 40}")
        print("✅ Caelterra is up to date.")
        return

    # Pull
    print(f"   Pulling {behind} new commit(s)...")
    result = git_utils.pull_branch(project_dir)

    if not result["success"]:
        print(f"\n✗ Update failed: {result['message']}")
        print("  If the upstream force-pushed, reset with:")
        print("    git reset --hard origin/main")
        print("  (This discards local changes to Caelterra.)")
        return

    after = result.get("after", "")
    print(f"   After:  {after[:12] if after else 'unknown'}")

    # Detect and remove stale skills
    after_skills = _get_bundled_skill_names()
    _remove_stale_skills(after_skills)

    # Update remaining skills — always (global operation)
    print("\n📚 Updating bundled skills...")
    _install_bundled_skills()

    # Sync profiles (update SOUL.md where tracked, refresh timestamps)
    _sync_installed_profiles("updated")

    print(f"\n{'━' * 40}")
    print("✅ Caelterra updated successfully!")
    print("   Restart any running Hermes sessions to see changes.")
    print("   Check status: hermes caelterra status")


def _caelterra_command(args: Namespace) -> None:
    """Top-level dispatcher for 'hermes caelterra <subcommand>'."""
    sub = getattr(args, "caelterra_command", None)

    if sub in ("setup", None):
        _setup_command(args)
    elif sub == "status":
        _status_command(args)
    elif sub == "update":
        if getattr(args, "check", False):
            _update_check(args)
        else:
            _update_pull(args)
    else:
        print(f"Unknown command: {sub}")
        print("Usage: hermes caelterra <setup|status|update>")


def _setup_argparse(subparser: Any) -> None:
    """Build argparse subcommand tree for 'hermes caelterra'."""
    subs = subparser.add_subparsers(dest="caelterra_command")

    # ── setup ──
    subs.add_parser(
        "setup",
        help="Install Caelterra skills and optionally SOUL.md to selected profiles",
    )

    # ── status ──
    subs.add_parser(
        "status",
        help="Show Caelterra installation status per profile",
    )

    # ── update ──
    update_parser = subs.add_parser(
        "update",
        help="Check for and apply Caelterra plugin updates",
    )
    update_parser.add_argument(
        "--check",
        action="store_true",
        help="Only check for updates without pulling",
    )

    subparser.set_defaults(func=_caelterra_command)


# ── Plugin registration ────────────────────────────────────────────


def register(ctx: Any) -> None:
    """Wire schemas to handler closures, register CLI commands and skills.

    Called exactly once at Hermes startup.
    """
    # ── CLI commands ──
    ctx.register_cli_command(
        name="caelterra",
        help="Caelterra plugin — setup, status, update, and skill management",
        setup_fn=_setup_argparse,
        handler_fn=_caelterra_command,
    )

    # ── Bundled skills (namespaced, read-only) ──
    skills_dir = _PLUGIN_DIR / "skills"
    if skills_dir.is_dir():
        for child in sorted(skills_dir.iterdir()):
            if _is_skill_dir(child):
                ctx.register_skill(child.name, child / "SKILL.md")
                logger.info("Registered bundled skill: caelterra:%s", child.name)
