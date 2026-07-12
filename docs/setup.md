# Setup

## Prerequisites

- Python 3.10+
- `uv` (package manager) — [install](https://docs.astral.sh/uv/getting-started/installation/)
- Git (for version check and self-update)
- Hermes Agent installed

## Install (as end user)

```bash
pip install caelterra && hermes plugins enable caelterra
```

`fabricium` is installed automatically as a dependency.

### Migrate from directory-based install (v0.1.5 and earlier)

Remove old directory plugins first:

```bash
rm -rf ~/.hermes/plugins/caelterra
rm -rf ~/.hermes/profiles/*/plugins/caelterra
```

Then install via pip as above. Run `hermes caelterra setup` afterwards.

## Development Setup

```bash
# Clone
git clone https://github.com/LaiTszKin/caelterra.git
cd caelterra

# Install dependencies (including dev)
uv sync --group dev

# Install pre-commit hooks
uv run pre-commit install
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FABRICIUM_TEST_PLUGIN_NAME` | Tests only | — | Plugin name for Docker integration tests (`"caelterra"`) |
| `FABRICIUM_TEST_PLUGIN_DIR` | Tests only | — | Absolute path to plugin repo root |
| `FABRICIUM_TEST_FABRICIUM_SRC` | Tests only | — | Absolute path to fabricium source for editable install in container |

No runtime environment variables are required.

## State File

Caelterra writes `~/.hermes/caelterra_state.json` to track per-profile installation state. Example:

```json
{
  "profiles": {
    "default": {
      "soul_md": true,
      "skills": ["create-skill", "optimise-skill"],
      "updated_at": "2026-07-12T10:30:00"
    }
  }
}
```

- `soul_md: true` → SOUL.md installed for this profile
- `skills: [...]` → list of bundled skill names installed
- `updated_at` → ISO 8601 timestamp of last sync

## First Run

```bash
hermes caelterra setup
```

Interactive: select target profiles, choose mode (Skills only / Skills + SOUL.md), confirm.

In non-TTY (CI/scripted): auto-selects all available profiles.

## Verify

```bash
hermes caelterra status     # Should show profiles with installation status
hermes caelterra update --check  # Check for updates
```

## How to Update

- New env var? → Add to Environment Variables table
- Install steps changed? → Update Development Setup section
- State file schema changed? → Update State File section

## Find It Fast

```bash
grep -rn "caelterra_state.json" src/caelterra/  # State file read/write locations
cat ~/.hermes/caelterra_state.json 2>/dev/null   # View current state
```
