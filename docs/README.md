# Caelterra Documentation

Hermes plugin for team standardisation. Distributes bundled skills, manages
multi-profile setup, and self-updates from GitHub.

→ [Project README](../README.md) for install and usage.

## Quick Links

| Start here |
|-----------|
| [Setup](setup.md) — get the project running from zero |
| [Architecture](architecture.md) — system design with C4 diagrams |
| [Workflows](workflows.md) — recipes for common tasks |

## I want to...

| I want to... | Read... |
|-------------|---------|
| Understand the system design | [architecture.md](architecture.md) |
| Know what technologies we use | [tech-stack.md](tech-stack.md) |
| Find where code lives | [project-structure.md](project-structure.md) |
| Understand the plugin core | [modules/caelterra.md](modules/caelterra.md) |
| Understand git utilities | [modules/git_utils.md](modules/git_utils.md) |
| Set up the project from scratch | [setup.md](setup.md) |
| Run the tests | [testing.md](testing.md) |
| Know our code conventions | [conventions.md](conventions.md) |
| Add a new feature | [workflows.md](workflows.md) |
| Cut a release | [workflows.md](workflows.md) |

## Document Index

| File | Description |
|------|-------------|
| [architecture.md](architecture.md) | C4 context + container diagrams, data flows, architectural decisions |
| [conventions.md](conventions.md) | Naming, imports, error handling, logging, testing, git, security |
| [project-structure.md](project-structure.md) | Directory map, source layout, key files |
| [setup.md](setup.md) | Prerequisites, install, dev setup, env vars, state file, first run |
| [tech-stack.md](tech-stack.md) | Runtime, Python, dependencies, infrastructure, quality gates |
| [testing.md](testing.md) | Framework, commands, fixtures, mock policy, quality gates |
| [workflows.md](workflows.md) | Task recipes: add skill, add CLI command, release, debug sync |
| [modules/caelterra.md](modules/caelterra.md) | Plugin core: public API, sync logic, bundled skills, CLI commands |
| [modules/git_utils.md](modules/git_utils.md) | Git utility re-exports: typed dicts, functions, no-remote behaviour |

## Scope

- **Includes**: Plugin architecture, bundled skills, multi-profile state, self-update, dev tooling, testing
- **Excludes** (not applicable): HTTP API (no web server), data models (no database), CI/CD workflows (none present)
