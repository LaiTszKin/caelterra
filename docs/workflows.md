# Workflows

Task recipes for common development and maintenance operations.

## Add a New Bundled Skill

1. Create directory: `src/caelterra/skills/<skill-name>/`
2. Write `SKILL.md` with YAML frontmatter (`name`, `description`) and markdown body
3. Add supporting files: `scripts/`, `references/`, `assets/` as needed
4. Run `hermes caelterra update` — new skill is auto-discovered and installed to profiles
5. Verify: `hermes caelterra status` — check skill appears in profile state
6. Update `docs/modules/caelterra.md` Bundled Skills table

## Add a New CLI Command

Commands are registered by `fabricium.HermesPlugin`. Extend in Fabricium if the command is reusable across plugins, or override in `CaelterraPlugin` if Caelterra-specific.

1. Add handler method to `CaelterraPlugin` in `src/caelterra/__init__.py`
2. Register in the base class's command registry (see Fabricium docs)
3. Update `docs/modules/caelterra.md` CLI Commands table
4. Add tests in `tests/test_sync.py` or `tests/integration/test_cli.py`
5. Run tests: `uv run pytest tests/ -v`

## Cut a Release

1. Bump version in `pyproject.toml` (`[project] version`)
2. Bump version in `src/caelterra/plugin.yaml`
3. Update `CHANGELOG.md` with new version section
4. Commit: `release: vX.Y.Z`
5. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
6. PyPI trusted publisher auto-publishes on tag push
7. Verify: `pip install caelterra==X.Y.Z` in a clean venv

## Run the Full Quality Gate

```bash
uv run pre-commit run --all-files
```

Or individually:

```bash
uv run ruff check .          # Lint
uv run mypy --strict .       # Type check
uv run black --check .       # Format check (dry-run)
```

## Debug Profile Sync Issues

1. Check state file: `cat ~/.hermes/caelterra_state.json`
2. Verify profile directories exist: `ls ~/.hermes/profiles/`
3. Check skills installed: `ls ~/.hermes/profiles/*/skills/`
4. Run sync manually with context: edit `_sync_installed_profiles("debug")` call
5. Check for TTY vs non-TTY behaviour differences (prompts default differently)

## Update This Documentation

After any structural change:

1. `python-project-tooling` → `docs/tech-stack.md` (deps), `docs/conventions.md` (tooling)
2. Source restructured → `docs/project-structure.md`
3. New service/dependency → `docs/architecture.md` (diagram + decisions)
4. Module changed → `docs/modules/<name>.md`
5. Install steps changed → `docs/setup.md`
6. Tests changed → `docs/testing.md`
7. Workflow changed → `docs/workflows.md`
8. Any doc added/removed → `docs/README.md` (index)

## How to Update

- New common task? → Add recipe following the format above
- Workflow steps changed? → Update the relevant recipe
