# Module: caelterra (Plugin Core)

**Purpose:** Hermes plugin entry point — CLI commands, profile syncing, and bundled skill management via Fabricium.

Source: `src/caelterra/__init__.py` (131 lines)

## Public API

### Plugin Instance

| Symbol | Description |
|--------|-------------|
| `plugin: CaelterraPlugin` | Singleton plugin instance (`__init__.py:121`). Name: `"caelterra"`, multi-profile mode (`default_profile=None`) |

### Entry Point

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `register(ctx)` | `(ctx: Any) -> None` | Registers CLI commands + bundled skills with Hermes. Called by Hermes on plugin load |

### Class: `CaelterraPlugin(HermesPlugin)`

Inherits from `fabricium.HermesPlugin`. Key override:

| Method | Signature | Description |
|--------|-----------|-------------|
| `_sync_installed_profiles` | `(self, context: str = "") -> None` | Override that auto-detects `default` profile, syncs skills + SOUL.md to all installed profiles |

**Auto-detect logic** (`__init__.py:76`): If `default` profile not in state but `~/.hermes/config.yaml` exists, auto-adds it. Checks for SOUL.md to determine `soul_md` flag.

### Self-Bootstrap

| Function | Description |
|----------|-------------|
| `_ensure_fabricium()` | Called at module import time. If `import fabricium` fails, runs `pip install --upgrade fabricium` and clears stale import cache |

This prevents breakage when Hermes recreates its venv during updates and drops plugin-only dependencies.

## Dependencies

**Outbound** (what this module imports):

| Module | Purpose |
|--------|---------|
| `fabricium.HermesPlugin` | Base class |
| `fabricium.skills` | `get_bundled_skill_names()`, `install_bundled_skills()`, `remove_stale_from_profile()` |
| `fabricium.state` | `_get_global_hermes_home()` — resolves `~/.hermes/` path |

**Inbound** (who imports this module):

| Consumer | Purpose |
|----------|---------|
| Hermes Agent | Entry point: `hermes_agent.plugins` → `caelterra = "caelterra"` |
| `tests/test_sync.py` | Direct import of `caelterra.plugin` for unit testing sync logic |

## Bundled Skills

| Skill | Location | Purpose |
|-------|----------|---------|
| `optimise-skill` | `skills/optimise-skill/SKILL.md` | 5-phase audit → decouple → rewrite → verify → deliver for Agent Skills |
| `create-skill` | `skills/create-skill/SKILL.md` | 6-phase scaffold new Agent Skills: discover → design → plan → build → validate → deliver |

## CLI Commands (registered via Fabricium)

| Command | Handler (in Fabricium base) | Description |
|---------|----------------------------|-------------|
| `hermes caelterra setup` | `_setup_command()` | Interactive multi-profile setup: select profiles, choose skills-only or skills+SOUL.md |
| `hermes caelterra status` | `_status_command()` | Display per-profile installation status from `caelterra_state.json` |
| `hermes caelterra update --check` | `_update_check()` | `git fetch` + report ahead/behind vs GitHub |
| `hermes caelterra update` | `_update_pull()` | `git pull --ff-only` → stale skill detection → skill install → SOUL.md sync → state update |

## Patterns & Gotchas

- **State file location**: `~/.hermes/caelterra_state.json` — not `~/.hermes/profiles/*/`. Single source of truth across all profiles.
- **Multi-profile**: `default_profile=None` means no single profile owns the plugin; all profiles are managed independently.
- **Import order**: `_ensure_fabricium()` runs before `from fabricium import ...` — the `# noqa: E402` on fabricium imports is intentional.
- **Non-TTY fallback**: When `sys.stdin.isatty()` is False, interactive prompts auto-select defaults. This enables headless CI + scripted installs.
- **Context parameter**: `_sync_installed_profiles(context="..." )` appends `(context)` to the sync header for debugging which code path triggered the sync.

## How to Update

- New CLI command added? → Update CLI Commands table
- New bundled skill? → Update Bundled Skills table
- Plugin method overridden? → Update Class: CaelterraPlugin table
- State file location changed? → Update Patterns & Gotchas

## Find It Fast

```bash
grep -n "def _" src/caelterra/__init__.py    # All private methods
grep -n "class\|def register" src/caelterra/__init__.py  # Public API
grep -rn "caelterra_state.json" src/caelterra/  # State file references
```
