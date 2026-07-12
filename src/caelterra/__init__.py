"""Caelterra — team standardisation plugin for Hermes.

Registers bundled skills and CLI commands for multi-profile
setup, status, and version management.

Install via: hermes plugins install LaiTszKin/caelterra

Powered by Fabricium — shared Hermes plugin infrastructure.
"""

import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


# Self-bootstrap: fabricium must be importable before the plugin can register
# CLI commands.  Hermes manages its own venv and may recreate it during updates,
# dropping plugin-only dependencies.  This guard ensures fabricium is installed
# on first import after a Hermes update without requiring a manual pip install.
def _ensure_fabricium() -> None:
    try:
        import fabricium  # noqa: F401
    except ImportError:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "fabricium"],
            check=True,
            capture_output=True,
        )
        # Clear stale import cache from the failed attempt above
        sys.modules.pop("fabricium", None)


_ensure_fabricium()

from fabricium import HermesPlugin, skills  # noqa: E402
from fabricium import state as fabricium_state  # noqa: E402

logger = logging.getLogger(__name__)


class CaelterraPlugin(HermesPlugin):
    """Caelterra-specific plugin with multi-profile auto-detection.

    Extends Fabricium's HermesPlugin with auto-detection of the
    'default' profile during sync. When `caelterra update` runs,
    if the default profile exists (~/.hermes/config.yaml) but
    isn't in the installation state, it's auto-detected and synced.
    """

    def _sync_installed_profiles(self, context: str = "") -> None:
        """Override to auto-detect the 'default' profile.

        Caelterra's multi-profile mode should keep the global
        'default' profile in sync even when it wasn't explicitly
        set up via `caelterra setup`.
        """
        s = self._load_state()
        profiles_state = s.get("profiles", {})

        if not profiles_state:
            print("\n  No profiles in installation state.")
            print(f"  Run: hermes {self.name} setup")
            return

        ctx = f" ({context})" if context else ""
        print(f"\n{'─' * 40}")
        print(f"🔄 Syncing profiles{ctx}")

        ts = datetime.now().isoformat(timespec="seconds")

        # Auto-detect the "default" profile
        default_home = fabricium_state._get_global_hermes_home()
        if "default" not in profiles_state and (default_home / "config.yaml").exists():
            has_soul = (default_home / "SOUL.md").exists()
            profiles_state["default"] = {"soul_md": has_soul}
            s["profiles"]["default"] = {"soul_md": has_soul, "updated_at": ts}
            print("\n  📋 Auto-detected 'default' profile for syncing")

        synced = 0
        for profile_name, info in sorted(profiles_state.items()):
            profile_dir = self._get_profile_dir(profile_name)
            if not profile_dir.exists() or not (profile_dir / "config.yaml").exists():
                print(f"\n  ⏭  Profile '{profile_name}' no longer exists — skipping")
                continue

            print(f"\n📁 Profile: {profile_name}")

            # Current bundle + previous state → detect only OUR stale skills
            bundled_names = skills.get_bundled_skill_names(self.plugin_dir)
            previous_skills = set(info.get("skills", []))

            # Stale = we installed it before but it's no longer in the bundle
            stale = previous_skills - bundled_names
            if stale:
                skills.remove_stale_from_profile(profile_dir / "skills", stale)

            # Install all bundled skills to this profile
            print("  📚 Installing bundled skills...")
            skills_target = profile_dir / "skills"
            skills.install_bundled_skills(self.plugin_dir, skills_target)

            # Record what we installed so next update knows what's ours
            info["skills"] = sorted(bundled_names)

            if info.get("soul_md"):
                print("  🧠 Updating SOUL.md...")
                self._apply_soul_md(profile_name)
            else:
                print("  ✓ Skills only (SOUL.md not tracked)")

            s["profiles"][profile_name]["updated_at"] = ts
            synced += 1

        self._save_state(s)
        print(f"\n  ✅ {synced} profile(s) synced")


plugin = CaelterraPlugin(
    name="caelterra",
    plugin_dir=Path(__file__).parent,
    default_profile=None,  # multi-profile mode
)


def register(ctx: Any) -> None:
    """Register CLI commands and bundled skills with Hermes."""
    plugin.register(ctx)
    logger.info("Caelterra registered (via Fabricium)")
