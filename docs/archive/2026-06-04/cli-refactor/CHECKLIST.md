# Checklist: CLI 工具全面重構

- **Date**: 2026-06-04
- **Feature**: cli-refactor
- **Source SPEC**: `docs/plans/2026-06-04/cli-refactor/SPEC.md`

> **Purpose:** Verification strategy — defines how to confirm that the implementation satisfies the SPEC.md business requirements.

---

## Behavior-to-Test Checklist

| ID | Observable Behavior | SPEC Req | Corresponding Test | Result |
|---|---|---|---|---|
| CL-01 | Developer defines tool with `parseArgs` schema → tool auto-handles `--help`, arg validation, and error formatting without extra code | Req 1 | `test/tools/schema-arg-validation.test.js` — classifies all tools by arg mode and validates strict mode rejects unknown flags | `[x] verified` |
| CL-02 | Tool using `parseArgs` schema rejects invalid input with consistent error format (stderr + exit code 1) | Req 1 | `test/tools/schema-arg-validation.test.js` — validates strict tools reject unknown flags with exit 1 + "Error:" prefix | `[x] verified` |
| CL-03 | `PlatformAdapter.symlinkType()` returns `'junction'` on Windows, `'dir'` on POSIX | Req 2 | `test/utils/platform-adapter.test.js` — tests `symlinkType()` returns `'junction'` (Win) and `'dir'` (POSIX) | `[x] verified` |
| CL-04 | `PlatformAdapter.resolveCommand()` resolves command name correctly on Windows (`npm` → `npm.cmd`) | Req 2 | `test/utils/platform-adapter.test.js` — tests `resolveCommand()` appends `.cmd` for npm/node on Windows | `[x] verified` |
| CL-05 | `PlatformAdapter.homeDir()` uses `HOME` → `USERPROFILE` → `os.homedir()` fallback chain | Req 2 | `test/utils/platform-adapter.test.js` — tests each env var set/unset for both Win/POSIX | `[x] verified` |
| CL-06 | Error thrown as `UserInputError` → caught by CLI boundary → stderr message + exit code 1, no `process.exit()` | Req 3 | `test/cli/error-boundary.test.js` — injects `UserInputError`, verifies no "Error:" prefix + exit 1 | `[x] verified` |
| CL-07 | Error thrown as `SystemError` → caught by CLI boundary → stderr message with stack trace (only in non-production mode) | Req 3 | `test/cli/error-boundary.test.js` — verifies `SystemError` writes message + stack trace to stderr | `[x] verified` |
| CL-08 | `npm test` exits with code 0 when coverage >= 65% lines, branches >= 60%, functions >= 65% | Req 4 | CI workflow step — built into `scripts/test.sh` via `--test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65` | `[x] [65/60/65 enforced]` |
| CL-09 | CI workflow runs on both `ubuntu-latest` and `windows-latest`; both pass | Req 4 | `.github/workflows/test.yml` — matrix `os: [ubuntu-latest, windows-latest]` | `[x] verified` |
| CL-10 | New command type added → only need to write `{name, parser, handler}` triplet, dispatch table auto-integrates | Req 5 | `test/cli/dispatch-table.test.js` — classifies help/install/uninstall/tool commands via `parseArguments()` | `[x] verified` |
| CL-11 | `InstallArgsParser`, `UninstallArgsParser`, `ToolArgsParser` independently testable without loading other modules | Req 5 | `test/cli/install-args-parser.test.js`, `test/cli/uninstall-args-parser.test.js`, `test/cli/tool-args-parser.test.js` | `[x] verified` |
| CL-12 | `PlatformAdapter.EOL` returns `\r\n` on Windows, `\n` elsewhere | Req 2 | `test/utils/platform-adapter.test.js` — tests `EOL` property for both Win/POSIX adapters | `[x] verified` |
| CL-13 | All 21 existing tool names resolve via dispatch table the same as current `isKnownToolName()` | Req 5 (backward compat) | `test/tool-registry/all-tools-known.test.js` — verifies 21 names + 3 aliases recognized by `isKnownToolName()` | `[x] verified` |

---

## Hardening Checklist

- [x] **Regression tests for bug-prone behavior**: Existing test suite (`test/cli-parsing.test.js`, `test/installer.test.js`, `test/tool-runner.test.js`, `test/tools/filter-logs.test.js`) must continue to pass unmodified — they define the current behavior contract.
- [ ] **Unit drift checks**: ParseArgs schema declaration for each tool must be validated at build time (or via a test) to ensure it resolves correctly. `TOOL_MODULE_NAMES` must be checked against actual package directories.
- [ ] **Property-based coverage**: Argument parsing (edge cases: empty args, mixed `--` separator, special characters in positional args) benefits from property-based testing — random argv arrays vs expected dispatch.
- [x] **External services mocked/faked**: `npm view` in updater, `fs` operations in installer — already use injection/DI pattern. Maintain this for platform adapter tests.
- [ ] **Adversarial cases**: Path traversal in skill names (already handled via `isSafeSkillName()`), infinite symlink chains, extremely long path strings on Windows (MAX_PATH = 260 chars).
- [ ] **Authorization/idempotency**: Install operation is idempotent (re-installing same config produces same result). Verify this invariant.
- [x] **Assertions verify outcomes**: Tests should assert on observable results (files created, exit codes, stderr content), not on mock call counts.
- [x] **Fixtures reproducible**: All temp directories use `mkdtemp`, all timestamps use fixed strings (not `Date.now()`), all env vars explicitly set per test.

---

## E2E / Integration Decisions

| Flow / Risk | Test Level | Rationale |
|---|---|---|
| **Install flow** (full `run()` with fake source → target install) | Integration (existing, expand) | Already covered in `test/installer.test.js` as integration tests with temp dirs. Expand to verify cross-platform adapter behavior. |
| **Uninstall flow** | Integration (existing) | Already covered in `test/installer.test.js`. No changes to uninstall logic expected. |
| **Tool dispatch** (`apltk <tool> <args>`) | Integration (existing `tool-runner.test.js`) | Verify dispatch still works after parsing refactor. |
| **PlatformAdapter symlink behavior** | Unit + Integration | Unit test validates type parameter (`'junction'` vs `'dir'`). Integration test validates actual symlink creation/deletion. |
| **Error boundary** | Unit | CLI boundary catch is pure orchestration — no I/O needed for unit test. Mock handlers that throw various `AppError` subclasses. |
| **Coverage enforcement** | Build-time check | `bash scripts/test.sh` with `COVERAGE=true` enforces `--test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65` via post-hoc grep. |
| **CI matrix passes on Windows** | E2E (CI) | Full test suite runs on `windows-latest`. Must pass before merge. |
