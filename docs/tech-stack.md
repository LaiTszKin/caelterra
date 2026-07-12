# Technology Stack

| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| Python | 3.10+ | Runtime | Minimum supported; dev env uses 3.11 |
| hatchling | — | Build system | PEP 621 build backend |
| uv | — | Package manager | Lockfile-based, `uv.lock` |

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| [fabricium](https://github.com/LaiTszKin/fabricium) | 0.1.1 | Shared Hermes plugin infrastructure (state, skills, git utils, prompts) |

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| pytest | 9.1.1 | Test framework |
| ruff | 0.15.21 | Linter + import sorting |
| mypy | 2.2.0 | Static type checking (`--strict`) |
| black | 26.5.1 | Code formatter (line-length 100) |
| pre-commit | 4.6.0 | Git hook runner |

## Infrastructure

| Service | Purpose | Detection |
|---------|---------|-----------|
| GitHub (git remote) | Update check + version pull | `git_utils` module |
| Hermes Agent | Plugin runtime host | Entry point: `hermes_agent.plugins` |
| Docker | Integration tests | `fabricium.testing.harness.HermesDockerTestEnv` |

## Quality Gates (pre-commit order)

| Step | Tool | Fail Behaviour |
|------|------|----------------|
| 1. Lint | `ruff check .` | Block commit |
| 2. Type check | `mypy --strict .` | Block commit |
| 3. Format | `black --quiet .` | Auto-reformat |

## How to Update

- New dependency added? → Add row to the appropriate table
- Version bumped? → Update version column from `uv.lock`
- Tool config changed? → Update Quality Gates or Infrastructure table
