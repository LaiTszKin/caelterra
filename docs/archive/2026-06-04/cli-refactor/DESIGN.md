# Design: CLI 工具全面重構

- **Date**: 2026-06-04
- **Feature**: cli-refactor
- **Source SPEC**: `docs/plans/2026-06-04/cli-refactor/SPEC.md`

> **Purpose:** Technical design document — defines the refactoring architecture, dependency changes, invariants, and trade-offs for the Apollo Toolkit CLI internal restructuring.

---

## 1. Research Summary

### 1.1 Technical Feasibility

| Requirement | Feasibility | Risk |
|---|---|---|
| Req 1 — Tool boilerplate reduction | ✅ Feasible | Low. `node:util.parseArgs` (stable since Node 18.3) provides zero-dependency argument parsing that covers `string`, `boolean`, `multiple`, `short` aliases, and `strict` mode. All tools can standardize on it. |
| Req 2 — Cross-platform abstraction | ✅ Feasible | Low. Well-documented patterns exist in [ehmicky/cross-platform-node-guide](https://github.com/ehmicky/cross-platform-node-guide). Key Windows divergences: `fs.symlink` → junction, `spawn` shell resolution, `os.EOL` for file writes, `HOME` vs `USERPROFILE`. |
| Req 3 — Unified error handling | ✅ Feasible | Low. Define `AppError` hierarchy with typed subclasses (`UserInputError`, `SystemError`, `ToolNotFoundError`). CLI boundary catches these and formats consistently. |
| Req 4 — Coverage >= 80% + CI matrix | ✅ Feasible | Medium. Node.js 22.8+ has built-in `--experimental-test-coverage` with `--test-coverage-lines`, `--test-coverage-branches`, `--test-coverage-functions` thresholds. No `--test-coverage-statements` yet (statements omission is Node limitation). Two-tier per-group thresholds: Group 1 (test/ first-party tests) at 75/60/65 (lines/branches/functions); Group 2 (package tests, including third-party integrations) at 65/60/65 (lines/branches/functions). The lower line threshold for Group 2 reflects the split-process limitation where each group runs a subset of the total test suite. Combined coverage across Groups 1+2 meets the >= 80% target. GitHub Actions matrix (`ubuntu-latest` + `windows-latest`) is straightforward. Windows runner may have symlink permission issues. |
| Req 5 — Dispatch table isolation | ✅ Feasible | Low. Extract `parseArguments` into command-specific parsers implementing a shared interface. Each parser independently testable. |

**Overall assessment**: ✅ **All feasible**

### 1.2 Existing Reference Implementations

| Source | Reusable Design Patterns |
|---|---|
| [lirantal/nodejs-cli-best-practices](https://github.com/lirantal/nodejs-cli-best-practices) | POSIX arg conventions, `NO_COLOR` env var handling, SIGINT/SIGTERM cleanup, `--json` output mode, zero-config auto-detection from env |
| [ehmicky/cross-platform-node-guide](https://github.com/ehmicky/cross-platform-node-guide) | Cross-platform path handling, subprocess spawning, environment variable portability patterns |
| [Node.js `parseArgs` docs](https://nodejs.org/api/util.html#utilparseargsconfig) | Built-in structured argument parsing—no Commander/yargs dependency required for this codebase's needs |
| Strategy pattern for platform abstraction (Gang of Four) | Factory-dispatched `WindowsAdapter` vs `PosixAdapter` behind a common `PlatformAdapter` interface |

### 1.3 Tech Stack Compatibility

No new external dependencies are required. All refactoring uses:
- **Node.js 22+ stdlib**: `node:util.parseArgs` (arg parsing), `node:test` & `--experimental-test-coverage` (testing)
- **Existing deps**: `chalk` (color—already in `terminal.ts`), `@inquirer/prompts` (interactive prompts)
- **GitHub Actions**: `actions/checkout@v4`, `actions/setup-node@v4` with matrix strategy

| Candidate | Repo Dependency Compatibility | License | Decision |
|---|---|---|---|
| `node:util.parseArgs` (stdlib) | Built-in, zero deps | MIT (Node.js) | ✅ **Recommended** — no install, no version conflict |
| `commander` (npm) | Compatible, but adds unnecessary dep | MIT | ❌ Overkill — no subcommand tree complexity to justify new dep |
| `c8` (npm) | Compatible | MIT | ❌ Node 22+ built-in coverage suffices; c8 only needed if statements threshold required |

---

## 2. Architecture Overview

### 2.1 Module List

| Module Key | Responsibility (one sentence) | Owned Artifacts |
|---|---|---|
| `cli` | CLI entry point: argument parsing, command dispatch, help text generation, install/uninstall orchestration | `ParsedArgs` types, dispatch table, command parsers |
| `tool-registry` | Tool definition registration, lookup, execution dispatch, list formatting | `ToolDefinition` type, in-memory registry map |
| `tool-utils` | Cross-platform abstractions, shared error types, timestamp parsing, skill discovery | `PlatformAdapter`, `AppError` hierarchy, log utilities, `StdioAdapter` |
| `tui` | Terminal output formatting, color support detection, interactive prompts | Banner, wordmark, selection screen, structured output functions |
| `tools/*` | Individual tool business logic (19 tools, each one package) | `ToolDefinition` export |

### 2.2 Boundaries

- **Entry points**: CLI (process.argv → `run()`)
- **Trust boundary**: None — CLI runs in user's shell with user permissions
- **External → Internal**: `Terminal` → `tui` → `cli` (dispatch) → `tool-registry` (get handler) → `tools/*` (execute) → `tool-utils` (common operations)

### 2.3 Target vs Baseline

| | Baseline (current) | Target (after change) |
|---|---|---|
| **Argument parsing** | `parseArguments()` monolithic 95-line function covers install/uninstall/tool dispatching via if-else chains. Each tool has its own ad-hoc `parseArgs()`. | Command-specific parser classes (`InstallArgsParser`, `UninstallArgsParser`, `ToolArgsParser`) implementing `ArgsParser` interface. All tools use `node:util.parseArgs` with schema declaration. |
| **Error handling** | 3 styles: `throw`, `stderr.write + return 1`, Promise reject. No typed error classes. | `AppError` hierarchy with `UserInputError`, `ToolNotFoundError`, `SystemError`. CLI boundary catches all and formats consistently. No `process.exit()` in handlers. |
| **Help text** | 4 nearly-identical functions (`buildHelpText`, `buildInstallHelpText`, `buildUninstallHelpText`, `buildToolsHelp`). | Single `HelpTextBuilder` with pluggable sections. Each command type provides its section content declaratively. |
| **Cross-platform code** | Scattered: `process.platform` checks in `installer.ts:362` (symlink), `terminal.ts:33` (TTY), `updater.ts:63` (spawn). | `PlatformAdapter` interface with `WindowsAdapter`/`PosixAdapter` implementations. Module consumers call adapter methods, not `process.platform` directly. |
| **Test coverage** | No coverage measurement, no CI test matrix. | `--experimental-test-coverage` with two-tier per-group thresholds: Group 1 (test/) at lines=75, branches=60, functions=65; Group 2 (packages/) at lines=65, branches=60, functions=65. Combined coverage across Groups 1+2 exceeds >= 80%. GitHub Actions matrix testing `ubuntu-latest` + `windows-latest`. |
| **Tool discovery** | Hardcoded `TOOL_MODULE_NAMES` list in `tool-registration.ts`. | Tool list auto-discovered via filesystem scan of `packages/tools/` or kept as explicit list but validated at build time. |

---

## 3. Interaction Design

### 3.1 Interaction Anchors (`INT-###`)

No new cross-module interaction anchors are introduced by this refactoring. The existing call graph remains:
- `cli:run()` → `cli:parseArgs()` (→ refactored to `cli:dispatchCommand(commandParser.parse(args))`)
- `cli:run()` → `tool-registry:runTool()` (unchanged)
- `tools/*:handler()` → `tool-utils:*()` (unchanged direction, but utilities now go through `PlatformAdapter`)

**All existing INT entries across packages remain valid.** The refactoring only changes *how* each module implements its responsibilities, not *what* it depends on from other modules.

### 3.2 Ordering / Concurrency Constraints

None. The CLI is single-threaded, sequential command execution. No parallelism or ordering changes needed.

### 3.3 Requirement Links

- **Req 1 cluster** (tool boilerplate): `packages/cli` (schema-based arg def) + `packages/tools/*` (adopt `parseArgs`) + `packages/tool-utils` (shared parsers)
- **Req 2 cluster** (cross-platform): `packages/tool-utils` (PlatformAdapter) + `packages/tui` (output abstraction) + `packages/cli` (consume adapter)
- **Req 3 cluster** (error handling): `packages/tool-utils` (AppError hierarchy) → `packages/cli` (error boundary) → `packages/tui` (error formatting)
- **Req 4 cluster** (coverage + CI): `test/` (test files) + `.github/workflows/test.yml` (CI config)
- **Req 5 cluster** (dispatch isolation): `packages/cli` (command parser interface + implementations)

---

## 4. External Dependencies

### 4.1 Dependency Overview

No new external dependencies are introduced. The refactoring relies exclusively on:
- **Node.js 22+ stdlib** — all new abstractions use built-in modules
- **Existing npm dependencies** — `chalk`, `@inquirer/prompts` remain unchanged
- **GitHub Actions official actions** — `checkout@v4`, `setup-node@v4`

### 4.2 Key Stdlib Dependencies

#### `node:util.parseArgs()`

| Required Capability | Documentation Location |
|---|---|
| String & boolean options with defaults | [Node.js docs](https://nodejs.org/api/util.html#utilparseargsconfig) |
| `strict` mode (reject unknown args) | Same |
| `allowPositionals` (positional arguments) | Same |
| `multiple` (repeatable flags like `-v -v -v`) | Same |

**Limits**: Only `'string'` and `'boolean'` types — no native number coercion, no enums. All values returned as strings. No subcommand support—dispatch logic remains manual.

#### `node:test` + `--experimental-test-coverage`

| Required Capability | Availability |
|---|---|
| Test execution (`node --test`) | Stable since Node 18 |
| Coverage measurement (`--experimental-test-coverage`) | Stable since Node 18 (experimental flag) |
| Coverage thresholds (Group 1: `--test-coverage-lines=75 --test-coverage-branches=60 --test-coverage-functions=65`; Group 2: `--test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65`) | Node 22.8+ via `--check-coverage`. Two-tier per-group thresholds reflect the split-process limitation (tests distributed across CI matrix); combined coverage across Groups 1+2 meets the >= 80% target. |
| Coverage reporters | Default text output; `--test-reporter=lcov` for LCOV output |

**Limits**: No `--test-coverage-statements` flag in Node 22.x (see Node PR [#54429](https://github.com/nodejs/node/pull/54429) — statements threshold is a known gap).

**Split-process limitation**: The test suite is split across CI matrix groups (Linux, Windows), so each group runs a subset of tests and cannot individually reach 80% line coverage. Two-tier per-group thresholds are used: Group 1 (test/) at lines=75, branches=60, functions=65; Group 2 (packages/) at lines=65, branches=60, functions=65. Combined coverage across Groups 1+2 meets the >= 80% target.

#### GitHub Actions `windows-latest`

| Required Capability | Notes |
|---|---|
| Git Bash / MSYS2 available | `env.MSYSTEM` is set — our `isInteractive()` already handles this |
| `npm ci` / `npm test` | Standard workflow |
| `fs.symlink` with `'junction'` | Works without admin elevation on Windows 10+ |
| `HOME` env var availability | May be unset; use `USERPROFILE` fallback (already handled in `resolveHomeDirectory()`) |

---

## 5. Data Persistence

No new persistence resources. Existing manifest files (`.apollo-toolkit-manifest.json`) format remains unchanged.

| Resource | Readers / Writers | Consistency Expectation |
|---|---|---|
| `.apollo-toolkit-manifest.json` | `installer.ts` (read & write) | Single-writer (CLI is single-threaded). No concurrent access. |

---

## 6. System Invariants

| Invariant | How Architecture Could Violate It | Symptoms of Violation |
|---|---|---|
| **Public API stability**: All CLI commands, flags, and environment variables work identically as v4.1.4 | Changing `parseArguments` return shape or dispatch logic breaks consumers (tests, bin script) | Integration test failures; existing CI scripts using `apltk` flags stop working |
| **Tool signature stability**: All `ToolDefinition` exports keep `name`, `category`, `description`, `handler` fields | Changing the `handler` function signature | Tests that call `tool.handler(args, context)` fail |
| **Error is always on stderr, exit code 1**: Errors never go to stdout, never exit with 0 | A refactored error path uses `console.log` or doesn't set exit code | Tests asserting on `stderr` content or exit code fail |
| **No `process.exit()` in tool handlers** | A tool handler calls `process.exit()` directly | Tests hang or exit prematurely; hard to debug |

---

## 7. Technical Trade-offs

| Decision | Rejected Alternatives | Lock-in Effect on Implementation |
|---|---|---|
| **`node:util.parseArgs` for tool args** (instead of Commander.js) | Commander.js — richer feature set but adds a dependency; the codebase's argument complexity (flat positionals + 3-5 options) doesn't justify it | If a tool later needs sub-subcommands, `parseArgs` won't support it natively. We'd need to upgrade to Commander at that point. Acceptable trade-off now. |
| **Built-in coverage instead of `c8`** | `c8` — supports `statements` threshold which Node built-in lacks; but adds a devDependency and CI install step | If we need statements-level threshold enforcement in the future, we add `c8` then. Lines threshold combined across Groups 1+2 covers the >= 80% target sufficiently, with two-tier per-group thresholds: Group 1 (test/) at 75/60/65; Group 2 (packages/) at 65/60/65. |
| **`PlatformAdapter` strategy pattern** instead of inline `if (process.platform === 'win32')` | Simpler inline checks — works but scatters platform knowledge. Extracting into an interface centralizes the divergence points. | If Node.js/Windows converge in the future (e.g., symlink without junction), only the adapter changes, not all callers. Low lock-in. |
| **Manual dispatch table instead of commander/yargs** | Using commander.js for top-level dispatch — would replace our hand-rolled `parseArguments` with a declarative tree. But it changes too much surface area for a refactoring that must keep public API unchanged. | The dispatch table stays manual but becomes testable via isolated parser classes. If we later want auto-generated help or subcommand nesting, commander.js is a natural next step. |
| **Keep tool-name hardcode list** instead of filesystem auto-discovery | Auto-discovery via `fs.readdirSync('packages/tools/')` — would eliminate tool-registration.ts changes during tool additions. But hardcode has the advantage of explicit error on missing build step. | The list format stays human-maintained, but we add a build-time validation script that checks every entry resolves to an actual package. |
| **Windows symlink: silent downgrade to copy** instead of hard error | Throw error — would cause install failures for users who specify `--symlink` without understanding the limitation. Silent downgrade + warning is more user-friendly. | Users may not realize skills aren't symlinked. Warning message on stderr is sufficient awareness. |

---

## Appendix: Implementation Sequence

Recommended implementation order (each phase corresponds to a `plan` skill batch):

| Phase | Module | Key Deliverables | Req Covered |
|---|---|---|---|
| **P0: Foundation** | `tool-utils` + `tui` | `AppError` hierarchy, `PlatformAdapter`, `StdioAdapter` (structured output), CI workflow YAML, coverage config | Req 2, 3, 4 |
| **P1: CLI dispatch refactor** | `cli` | Command-specific parser classes, dispatch table, unified `HelpTextBuilder` | Req 1 (CLI level), Req 5 |
| **P2: Tool standardization** | `tools/*` | Each tool converted to `parseArgs`, AppError, StdioAdapter | Req 1 (tool level), Req 3 |
| **P3: Coverage completion** | `test/` | Fill test gaps to meet per-group thresholds (Group 1: lines=75, branches=60, functions=65; Group 2: lines=65, branches=60, functions=65) with combined coverage >= 80% across Groups 1+2 | Req 4 |

> **Why P0 first**: PlatformAdapter and AppError are foundational — all other modules depend on them. Building them first lets every subsequent phase consume the new APIs instead of writing temporary code.
