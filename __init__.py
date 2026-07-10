"""
Caelterra — team standardisation plugin for Hermes.

Registers bundled skills and CLI commands for version management.
Team members install via: curl -fsSL <url>/install.sh | bash
"""

import logging
import os
import subprocess
from pathlib import Path

from . import git_utils

logger = logging.getLogger(__name__)

_PLUGIN_DIR = Path(__file__).parent


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


def _get_profile_dir(profile_name: str = "caelterra") -> Path:
    """Return the profile directory for caelterra."""
    return _get_profiles_dir() / profile_name


def _get_global_skills_dir() -> Path:
    """Return the global Hermes skills directory."""
    return _get_global_hermes_home() / "skills"


# ── Profile & SOUL.md ──────────────────────────────────────────────


def _ensure_profile(profile_name: str = "caelterra") -> bool:
    """Create the caelterra profile if it doesn't exist.

    Returns True if the profile exists or was created.
    """
    profile_dir = _get_profile_dir(profile_name)
    if profile_dir.exists():
        return True

    print(f"Creating profile '{profile_name}'...")
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


def _apply_soul_md(profile_name: str = "caelterra") -> bool:
    """Write SOUL.md to the profile directory."""
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


# ── Bundled skill installation ─────────────────────────────────────


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
        skill_md = child / "SKILL.md"
        if not child.is_dir() or not skill_md.exists():
            continue

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


def _setup_command(args) -> None:
    """Handler for 'hermes caelterra setup'.

    Creates the caelterra profile, writes SOUL.md, installs bundled skills.
    """
    print("⚡ Caelterra Setup")
    print("━" * 40)

    # Step 1: Profile
    print("\n📁 Profile")
    profile_ok = _ensure_profile()
    if profile_ok:
        print(f"  ✓ Profile '{_get_profile_dir()}' ready")

    # Step 2: SOUL.md
    print("\n🧠 Agent Identity (SOUL.md)")
    soul_ok = _apply_soul_md()
    if soul_ok:
        print("  ✓ Caelterra agent identity applied")

    # Step 3: Bundled skills
    print("\n📚 Bundled Skills")
    skills_ok = _install_bundled_skills()
    if skills_ok:
        print("  ✓ All skills installed")

    # Step 4: Summary
    print(f"\n{'━' * 40}")
    if profile_ok and soul_ok:
        print("✅ Caelterra plugin ready")
        print("  Start a session:    hermes -p caelterra")
        print("  Run setup again:    hermes caelterra setup")
        print("  Check for updates:  hermes caelterra update --check")
    else:
        print("⚠️  Caelterra plugin — setup incomplete")
        print("  Run again: hermes caelterra setup")


def _update_check(args) -> None:
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


def _update_pull(args) -> None:
    """Handler for 'hermes caelterra update'.

    Pulls the latest changes from the remote repository.
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
        print("\n✅ Caelterra is already up to date.")
        return

    # Pull
    print(f"   Pulling {behind} new commit(s)...")
    result = git_utils.pull_branch(project_dir)

    if result["success"]:
        after = result.get("after", "")
        print(f"   After:  {after[:12] if after else 'unknown'}")
        print("\n✅ Caelterra updated successfully!")
        print("   Restart any running Hermes sessions to see changes.")
    else:
        print(f"\n✗ Update failed: {result['message']}")
        print("  If the upstream force-pushed, reset with:")
        print("    git reset --hard origin/main")
        print("  (This discards local changes to Caelterra.)")


def _caelterra_command(args) -> None:
    """Top-level dispatcher for 'hermes caelterra <subcommand>'."""
    sub = getattr(args, "caelterra_command", None)

    if sub == "setup" or sub is None:
        _setup_command(args)
    elif sub == "update":
        if getattr(args, "check", False):
            _update_check(args)
        else:
            _update_pull(args)
    else:
        print(f"Unknown command: {sub}")
        print("Usage: hermes caelterra <setup|update>")


def _setup_argparse(subparser):
    """Build argparse subcommand tree for 'hermes caelterra'."""
    subs = subparser.add_subparsers(dest="caelterra_command")

    # ── setup ──
    subs.add_parser(
        "setup",
        help="Create caelterra profile, apply SOUL.md, and install bundled skills",
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


def register(ctx):
    """Wire schemas to handler closures, register CLI commands and skills.

    Called exactly once at Hermes startup.
    """
    # ── CLI commands ──
    ctx.register_cli_command(
        name="caelterra",
        help="Caelterra plugin — setup, update, and skill management",
        setup_fn=_setup_argparse,
        handler_fn=_caelterra_command,
    )

    # ── Bundled skills (namespaced, read-only) ──
    skills_dir = _PLUGIN_DIR / "skills"
    if skills_dir.is_dir():
        for child in sorted(skills_dir.iterdir()):
            skill_md = child / "SKILL.md"
            if child.is_dir() and skill_md.exists():
                ctx.register_skill(child.name, skill_md)
                logger.info("Registered bundled skill: caelterra:%s", child.name)
