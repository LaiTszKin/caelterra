"""Caelterra — team standardisation plugin for Hermes.

Registers bundled skills and CLI commands for multi-profile
setup, status, and version management.

Install via: hermes plugins install LaiTszKin/caelterra

Powered by Fabricium — shared Hermes plugin infrastructure.
"""

import logging
from datetime import datetime
from pathlib import Path

from fabricium import HermesPlugin
from fabricium import state as fabricium_state

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


def register(ctx):
    """Register CLI commands and bundled skills with Hermes."""
    plugin.register(ctx)
    logger.info("Caelterra registered (via Fabricium)")
