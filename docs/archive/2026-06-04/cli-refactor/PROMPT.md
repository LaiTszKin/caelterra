# Implementation Coordinator Prompt: CLI 工具全面重構

- **Date**: 2026-06-04
- **Type**: Single Spec
- **Source Spec**: `docs/plans/2026-06-04/cli-refactor/SPEC.md`
- **Source Design**: `docs/plans/2026-06-04/cli-refactor/DESIGN.md`
- **Source Checklist**: `docs/plans/2026-06-04/cli-refactor/CHECKLIST.md`

---

## 1. Your Role

**You are the implementation coordinator.** You do not write code. Your job is to think, plan, delegate, synthesize, and verify.

### What you do

- Read and understand the mission, scope, technical context, and task definitions below
- Spawn workers to execute individual tasks, giving each a self-contained prompt (provided in Section 6)
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, updating lockfiles
- Commit all changes in a single commit after the final verification gate passes

### What you NEVER do

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)

---

## 2. Mission

Refactor the Apollo Toolkit CLI codebase from its current state (hardcoded values, no abstraction layers, inconsistent error handling) into a well-structured, maintainable system with standardized argument parsing, unified error handling, cross-platform abstraction, and >= 80% test coverage — all without changing the 5 existing package boundaries or the public CLI interface.

**Success looks like**: All 5 BDD requirements from SPEC.md satisfied: (1) tools need zero boilerplate for arg parsing/error/output, (2) cross-platform code routes through PlatformAdapter, (3) all errors use AppError hierarchy, (4) `npm test` passes with >= 80% coverage on both Ubuntu and Windows CI, (5) dispatch is testable via isolated parser classes.

---

## 3. Scope & Boundaries

### What we WILL implement

- Req 1: Tool boilerplate reduction — all tools use `node:util.parseArgs` for argument parsing, AppError for errors, and StdioAdapter for output
- Req 2: Cross-platform abstraction — PlatformAdapter interface with WindowsAdapter + PosixAdapter, covering symlink, spawn, EOL, home directory
- Req 3: Unified error handling — AppError hierarchy (UserInputError, ToolNotFoundError, SystemError), caught by CLI boundary
- Req 4: Coverage >= 80% lines / 60% branches / 75% functions — enforced via `--experimental-test-coverage` thresholds. CI matrix runs on ubuntu-latest + windows-latest
- Req 5: Dispatch table isolation — parseArguments split into InstallArgsParser, UninstallArgsParser, ToolArgsParser with shared interface
- Version bump from v4.1.4 to v5.0.0
- CI workflow at `.github/workflows/test.yml`

### What we will NOT implement

- Package boundary reorganization (no merging/splitting of packages)
- CLI external interface changes (commands, flags, env vars, exit codes stay identical)
- New CLI features or tools
- `@laitszkin/tool-eval` — explicitly excluded from refactoring scope
- Statements coverage threshold (Node 22 doesn't support it; lines threshold is sufficient)

---

## 4. Technical Context

### Modules involved

| Module | Responsibility | Key Files |
|---|---|---|
| `packages/tool-utils` | Shared utilities + new: `PlatformAdapter`, `AppError` hierarchy | `log-utils.ts`, `skill-discovery.ts`, `index.ts` |
| `packages/tui` | Terminal output + new: `StdioAdapter` (structured output) | `terminal.ts`, `banner.ts`, `prompts.ts`, `types.ts`, `index.ts` |
| `packages/cli` | CLI entry + refactored: command parsers, dispatch, help text | `index.ts`, `installer.ts`, `tool-registration.ts`, `updater.ts`, `types.ts` |
| `packages/tool-registry` | Tool registration (minimal changes) | `registry.ts`, `types.ts`, `index.ts` |
| `packages/tools/*` | 21 individual tool packages (eval excluded) | Each has `index.ts` + `package.json` |

### Invariants — must never be broken

1. **Public API stability**: All CLI commands, flags, and env vars work identically as v4.1.4. Integration tests must pass without modification.
2. **Tool signature stability**: Every `ToolDefinition` export keeps `name`, `category`, `description`, `handler` fields unchanged.
3. **Error always on stderr, exit code 1**: No error output goes to stdout. Non-zero exit code always accompanies errors.
4. **No `process.exit()` in tool handlers**: Only the CLI boundary in `run()` may call `process.exit()`.

### Technical decisions to follow

- **Argument parsing**: Use `node:util.parseArgs` — not Commander.js, not custom `while` loops. Flags are declared as a schema object. Workers must: replace each tool's ad-hoc `parseArgs()` with `parseArgs({options: {...}, allowPositionals: true})`.
- **Error handling**: Define `AppError` class with subclass variants. Throw from handlers, catch in CLI boundary. Workers must: NOT use `stderr.write + return 1` for errors; throw the appropriate `AppError`.
- **Cross-platform**: `PlatformAdapter` strategy pattern. Workers must: NOT call `process.platform` directly; call `platformAdapter.xxx()` instead.
- **Output formatting**: `StdioAdapter` in `tui` package. Workers must: NOT call `stdout.write` directly in tool handlers; use `stdio.info()`, `stdio.warn()`, `stdio.error()`.
- **Coverage**: `--experimental-test-coverage` with `--test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75`. Workers must: ensure new code has tests.

---

## 5. Task Units

### T1.1: Create PlatformAdapter + AppError in tool-utils

- **Goal**: Establish the cross-platform abstraction and error type hierarchy
- **Files**:
  - NEW: `packages/tool-utils/platform-adapter.ts`
  - NEW: `packages/tool-utils/app-error.ts`
  - MODIFY: `packages/tool-utils/index.ts`
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `node --test --experimental-test-coverage packages/tool-utils/dist/`
  - Expected: tests pass, coverage reported

### T1.2: Create StdioAdapter in tui

- **Goal**: Provide structured output functions (info/warn/error) with --json mode support
- **Files**:
  - NEW: `packages/tui/stdio-adapter.ts`
  - MODIFY: `packages/tui/index.ts`
  - MODIFY: `packages/tui/types.ts` (add output mode types)
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `node --test packages/tui/dist/`
  - Expected: all existing tui tests pass, new tests pass

### T1.3: Create CI workflow + coverage config

- **Goal**: Set up GitHub Actions matrix testing and coverage enforcement
- **Files**:
  - NEW: `.github/workflows/test.yml`
  - MODIFY: `package.json` (add `test:coverage` script)
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/`
  - Expected: passes with coverage report

### T2.1: Refactor CLI dispatch and help text

- **Goal**: Split parseArguments into command-specific parsers; unify help text generation
- **Files**:
  - NEW: `packages/cli/parsers/install-parser.ts`
  - NEW: `packages/cli/parsers/uninstall-parser.ts`
  - NEW: `packages/cli/parsers/tool-parser.ts`
  - NEW: `packages/cli/parsers/types.ts`
  - NEW: `packages/cli/help-text-builder.ts`
  - MODIFY: `packages/cli/index.ts` — replace parseArguments and help builders
  - MODIFY: `packages/cli/types.ts` — update ParsedArguments if needed
- **Depends on**: T1.1 (uses AppError)
- **Verify**:
  - Command: `node --test test/cli-parsing.test.js test/tool-runner.test.js`
  - Expected: all existing dispatch tests pass (same observable behavior)

### T3.1: Convert log/validation tools (6 tools)

- **Goal**: Standardize filter-logs, search-logs, validate-skill-frontmatter, validate-openai-agent-config, sync-memory-index, extract-conversations to use parseArgs + AppError + StdioAdapter
- **Files**:
  - MODIFY: `packages/tools/filter-logs/index.ts`
  - MODIFY: `packages/tools/search-logs/index.ts`
  - MODIFY: `packages/tools/validate-skill-frontmatter/index.ts`
  - MODIFY: `packages/tools/validate-openai-agent-config/index.ts`
  - MODIFY: `packages/tools/sync-memory-index/index.ts`
  - MODIFY: `packages/tools/extract-conversations/index.ts`
- **Depends on**: T1.1, T1.2 (consumes PlatformAdapter, AppError, StdioAdapter)
- **Verify**:
  - Command: `node --test test/tools/filter-logs.test.js`
  - Expected: filter-logs tests pass with same observable results

### T3.2: Convert GitHub/content tools (6 tools)

- **Goal**: Standardize open-github-issue, find-github-issues, read-github-issue, review-threads, create-review-report, extract-pdf-text
- **Files**:
  - MODIFY: `packages/tools/open-github-issue/index.ts`
  - MODIFY: `packages/tools/find-github-issues/index.ts`
  - MODIFY: `packages/tools/read-github-issue/index.ts`
  - MODIFY: `packages/tools/review-threads/index.ts`
  - MODIFY: `packages/tools/create-review-report/index.ts`
  - MODIFY: `packages/tools/extract-pdf-text/index.ts`
- **Depends on**: T1.1, T1.2
- **Verify**:
  - Command: `node --test test/`
  - Expected: green

### T3.3: Convert media/planning tools (6 tools)

- **Goal**: Standardize docs-to-voice, render-katex, render-error-book, generate-storyboard-images, enforce-video-aspect-ratio, create-specs
- **Files**:
  - MODIFY: `packages/tools/docs-to-voice/index.ts`
  - MODIFY: `packages/tools/render-katex/index.ts`
  - MODIFY: `packages/tools/render-error-book/index.ts`
  - MODIFY: `packages/tools/generate-storyboard-images/index.ts`
  - MODIFY: `packages/tools/enforce-video-aspect-ratio/index.ts`
  - MODIFY: `packages/tools/create-specs/index.ts`
- **Depends on**: T1.1, T1.2
- **Verify**:
  - Command: `node --test test/tools/create-specs.test.js` (if exists) and `node --test test/`
  - Expected: green

### T4.1: Write PlatformAdapter + AppError tests

- **Goal**: Achieve >= 80% coverage on new tool-utils code
- **Files**:
  - NEW: `test/utils/platform-adapter.test.js`
  - NEW: `test/utils/app-error.test.js`
- **Depends on**: T1.1
- **Verify**:
  - Command: `node --experimental-test-coverage --test-coverage-lines=80 packages/tool-utils/dist/`
  - Expected: >= 80% line coverage

### T4.2: Write CLI parsers + error boundary tests

- **Goal**: Achieve >= 80% coverage on new CLI parser code
- **Files**:
  - NEW: `test/cli/install-args-parser.test.js`
  - NEW: `test/cli/uninstall-args-parser.test.js`
  - NEW: `test/cli/tool-args-parser.test.js`
  - NEW: `test/cli/error-boundary.test.js`
- **Depends on**: T2.1
- **Verify**:
  - Command: `node --test test/cli/`
  - Expected: all 4 new test files pass

### T4.3: Write HelpTextBuilder + dispatch integration tests

- **Goal**: Verify help text generation and dispatch integration
- **Files**:
  - NEW: `test/cli/help-text-builder.test.js`
  - NEW: `test/cli/dispatch-table.test.js`
- **Depends on**: T2.1
- **Verify**:
  - Command: `node --test test/cli/help-text-builder.test.js test/cli/dispatch-table.test.js`
  - Expected: green

### T4.4: Adapt existing tests + fill coverage gaps

- **Goal**: Adapt test/cli-parsing.test.js for new parser interface; ensure overall coverage >= 80%
- **Files**:
  - MODIFY: `test/cli-parsing.test.js` (update imports if parseArguments moved)
  - MODIFY: `test/tool-runner.test.js` (ensure it works with new dispatch)
  - Any other test files requiring coverage patches
- **Depends on**: T2.1
- **Verify**:
  - Command: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/`
  - Expected: all thresholds met

---

## 6. Worker Prompt Library

### T1.1: Create PlatformAdapter + AppError in tool-utils

```
## Mission
Create the cross-platform abstraction layer (PlatformAdapter) and the error type hierarchy (AppError) in the tool-utils package. These are foundational — all other refactoring work depends on them.

## Input
- Read: `packages/tool-utils/index.ts` — current re-exports
- Read: `packages/tool-utils/log-utils.ts` — existing utility pattern
- Read: `packages/tool-utils/package.json` — package name and dependents

## What to do
1. Create `packages/tool-utils/app-error.ts` with:
   - Base class `AppError extends Error` with `code`, `statusCode`, `isOperational` fields
   - Subclass `UserInputError` — for invalid user input (exit code 1)
   - Subclass `ToolNotFoundError` — for unknown tool names (exit code 1)
   - Subclass `SystemError` — for unexpected system failures (exit code 1, includes stack)
   - All constructors accept a message string and optionally a details object

2. Create `packages/tool-utils/platform-adapter.ts` with:
   - Interface `PlatformAdapter` with methods:
     - `symlinkType(): 'junction' | 'dir'` — returns 'junction' when `process.platform === 'win32'`
     - `homeDir(): string` — checks `process.env.HOME`, then `USERPROFILE`, then `os.homedir()`
     - `resolveCommand(command: string): string` — appends `.cmd` on Windows for npm/node
     - `EOL: string` — delegates to `os.EOL`
     - `normalizePath(p: string): string` — calls `path.normalize()`
   - Factory function `createPlatformAdapter(): PlatformAdapter` returning `WindowsAdapter` or `PosixAdapter`
   - Class `WindowsAdapter implements PlatformAdapter`
   - Class `PosixAdapter implements PlatformAdapter`

3. Update `packages/tool-utils/index.ts`:
   - Export all new types and functions
   - Export the factory as `createPlatformAdapter`
   - Export the AppError classes

## Scope
- Allowed files:
  - `packages/tool-utils/app-error.ts` — create
  - `packages/tool-utils/platform-adapter.ts` — create
  - `packages/tool-utils/index.ts` — modify
  - `packages/tool-utils/package.json` — modify ONLY if a new dependency is needed (should not be)
- Forbidden files:
  - `packages/tui/*` — belongs to T1.2
  - `packages/cli/*` — belongs to T2.1
  - `.github/*` — belongs to T1.3

## Output
On completion, report:
- Which files were created/modified
- Change summary for each file
- Test results (pass/fail) from `node --test packages/tool-utils/dist/`

## Verify
- Run: `npm run build && node --test packages/tool-utils/dist/`
- Expected: No TypeScript errors. All tests pass.
- Run: `node -e "const {AppError, UserInputError} = await import('./packages/tool-utils/dist/index.js'); const e = new UserInputError('bad'); console.log(e instanceof AppError, e.statusCode)"`
- Expected: `true 1`

## Boundaries
- Do not modify any file in the forbidden list
- Do not introduce new npm dependencies — use only node:path, node:os, node:process
- If you encounter an unexpected blocker, stop and report — do not invent alternative approaches
```

### T1.2: Create StdioAdapter in tui

```
## Mission
Create structured output functions in the tui package that provide info/warn/error/verbose logging with automatic NO_COLOR detection and --json output mode support. This replaces ad-hoc stdout.write/stderr.write throughout the tool code.

## Input
- Read: `packages/tui/index.ts` — current exports
- Read: `packages/tui/terminal.ts` — supportsColor, isInteractive
- Read: `packages/tui/types.ts` — existing type definitions

## What to do
1. Add to `packages/tui/types.ts`:
   - Type `OutputMode = 'pretty' | 'json'` — controls output format
   - Interface `StdioWriter` with methods:
     - `info(msg: string): void` — writes to stdout
     - `warn(msg: string): void` — writes to stderr with yellow prefix (pretty) or structured JSON
     - `error(msg: string): void` — writes to stderr with red prefix (pretty) or structured JSON
     - `verbose(msg: string): void` — writes to stdout only when verbose mode is on
     - `json(data: unknown): void` — writes JSON to stdout regardless of mode
     - `setMode(mode: OutputMode): void`
     - `setVerbose(v: boolean): void`

2. Create `packages/tui/stdio-adapter.ts`:
   - Class `StdioWriterImpl implements StdioWriter`
   - Constructor accepts {stdout, stderr, env, mode, verbose} with defaults from process
   - Respects `NO_COLOR`, `supportsColor(stdout, env)` for pretty output
   - JSON mode: all output is `JSON.stringify` to stdout; warn/error go to stderr
   - Error output in JSON mode: `{"severity":"error","message":"..."}`
   - Factory function `createStdioWriter(opts?)` returning `StdioWriter`

3. Update `packages/tui/index.ts`:
   - Re-export StdioWriter, OutputMode, createStdioWriter
   - Keep all existing exports intact

## Scope
- Allowed files:
  - `packages/tui/stdio-adapter.ts` — create
  - `packages/tui/types.ts` — modify (add types)
  - `packages/tui/index.ts` — modify (add exports)
  - `packages/tui/terminal.ts` — read-only (reference for color detection)
- Forbidden files:
  - `packages/tool-utils/*` — belongs to T1.1
  - `packages/cli/*` — belongs to T2.1
  - `.github/*` — belongs to T1.3

## Output
On completion, report:
- Files created/modified
- Summary of StdioWriter interface
- Tests pass

## Verify
- Run: `npm run build && node --test packages/tui/dist/`
- Expected: No TypeScript errors. All existing tui tests pass.
- Run: `node -e "const {createStdioWriter} = await import('./packages/tui/dist/index.js'); const w = createStdioWriter({stdout: {write: s => process.stdout.write('OUT:'+s)}, stderr: {write: s => process.stdout.write('ERR:'+s)}, env: {NO_COLOR:'1'}}); w.info('hello'); w.error('bad')"`
- Expected: `OUT:hello` and `ERR:bad` in output

## Boundaries
- Do not modify any file in the forbidden list
- Do not introduce new npm dependencies — use only node:process
- All existing tui exports must remain untouched
```

### T1.3: Create CI workflow + coverage config

```
## Mission
Create the GitHub Actions CI workflow for cross-platform testing with coverage thresholds, and add the corresponding npm scripts.

## Input
- Read: `package.json` — current scripts section
- Read: `.github/workflows/` — existing workflow files (publish-npm.yml, eval.yml, skill-validation.yml) for pattern reference

## What to do
1. Create `.github/workflows/test.yml`:
   ```yaml
   name: Test
   on: [push, pull_request]
   jobs:
     test:
       strategy:
         fail-fast: false
         matrix:
           os: [ubuntu-latest, windows-latest]
           node-version: ['22']
       runs-on: ${{ matrix.os }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: ${{ matrix.node-version }}
             cache: 'npm'
         - run: npm ci
         - run: npm test
         - run: npm run test:coverage
   ```

2. Update `package.json` scripts:
   - Keep existing `test` script: `"test": "node --test"`
   - Add coverage script: `"test:coverage": "node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test"`
   - Keep all other existing scripts unchanged

3. Update `package.json` version from `"4.1.4"` to `"5.0.0"`

## Scope
- Allowed files:
  - `.github/workflows/test.yml` — create
  - `package.json` — modify (scripts + version)
- Forbidden files:
  - `packages/*` — code changes belong to other workers
  - Any `.ts` or `.js` file

## Output
On completion, report:
- Files created/modified
- The test.yml workflow definition
- package.json changes

## Verify
- Run: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test --test-name-pattern="this test will never match" test/`
- Expected: Coverage thresholds met (even with no tests matched, the coverage check runs)
- Run: `node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.version, p.scripts['test:coverage'])"`
- Expected: `5.0.0` and a string containing `--test-coverage-lines=80`

## Boundaries
- Do not modify any TypeScript source files
- Do not change any existing npm dependencies
- Keep all existing npm scripts unchanged — only add the new `test:coverage` script and update version
```

### T2.1: Refactor CLI dispatch and help text

```
## Mission
Replace the monolithic parseArguments function with command-specific parser classes, and unify the four help text builder functions into a single HelpTextBuilder. The observable CLI behavior must remain identical.

## Input
- Read: `packages/cli/index.ts` — full file (lines 208-303 parseArguments, lines 62-202 help builders, lines 423-586 run function)
- Read: `packages/cli/types.ts` — ParsedArguments type
- Read: `packages/cli/tool-registration.ts` — isKnownToolName, TOOL_NAMES
- Read: `packages/tool-utils/dist/platform-adapter.js` and `packages/tool-utils/dist/app-error.js` — existing (built by Batch 1)
- Read: `packages/tui/dist/stdio-adapter.js` — existing (built by Batch 1)

## What to do
1. Create `packages/cli/parsers/types.ts`:
   - Interface `CommandParser<T>` with method `parse(argv: string[]): T`
   - Type `ParsedCommand = InstallCommand | UninstallCommand | ToolCommand | HelpCommand`

2. Create `packages/cli/parsers/install-parser.ts`:
   - Class `InstallArgsParser implements CommandParser<InstallCommand>`
   - Uses `node:util.parseArgs` internally
   - Parses: modes (positional args), --home, --symlink, --copy, --help
   - Replicates current parseArguments behavior for install mode

3. Create `packages/cli/parsers/uninstall-parser.ts`:
   - Class `UninstallArgsParser implements CommandParser<UninstallCommand>`
   - Uses `node:util.parseArgs` internally
   - Parses: modes, --yes/-y, --home, --help

4. Create `packages/cli/parsers/tool-parser.ts`:
   - Class `ToolArgsParser implements CommandParser<ToolCommand>`
   - Identifies tool name, tool args, --help
   - Delegates tool name detection to isKnownToolName (preserve backward compat with aliases)

5. Create `packages/cli/help-text-builder.ts`:
   - Class `HelpTextBuilder` with methods:
     - `overview(version, colorEnabled): string` — replaces buildHelpText
     - `install(version, colorEnabled): string` — replaces buildInstallHelpText
     - `uninstall(version, colorEnabled): string` — replaces buildUninstallHelpText
     - `toolsHelp(version, colorEnabled): string` — replaces buildToolsHelp
   - Each method produces text identical to the current functions (same wording, same formatting)
   - Internally may share sections via private methods to reduce duplication
   - Reuses `buildBanner` from tui, `formatToolList` from tool-registry

6. Update `packages/cli/types.ts`:
   - Add types for the parsed command objects (InstallCommand, UninstallCommand, ToolCommand, HelpCommand)
   - Keep `CliContext` and `InstallResult` unchanged
   - Keep `ParsedArguments` if still re-exported for backward compatibility, or replace with new types

7. Update `packages/cli/index.ts`:
   - Replace the `parseArguments` function body to delegate to the appropriate CommandParser
   - Replace the four help builder functions to delegate to HelpTextBuilder
   - The `run()` function should still produce identical behavior
   - Keep all existing exports (run, parseArguments, etc.) — parseArguments can become a thin wrapper
   - The top-level catch block (line 582-586) should catch AppError subclasses specifically, formatting UserInputError messages concisely and SystemError with stack trace

## Scope
- Allowed files:
  - `packages/cli/parsers/*.ts` — create (new directory)
  - `packages/cli/help-text-builder.ts` — create
  - `packages/cli/index.ts` — modify
  - `packages/cli/types.ts` — modify
  - `packages/cli/tool-registration.ts` — read-only (reference isKnownToolName)
  - `packages/tool-utils/*` — read-only (reference AppError)
  - `packages/tui/*` — read-only (reference buildBanner)
- Forbidden files:
  - `packages/tools/*` — belongs to Batch 3 workers
  - `packages/tool-utils/*` — do not modify (already built in Batch 1)
  - `packages/tui/*` — do not modify
  - `packages/tool-registry/*` — do not modify

## Output
On completion, report:
- Files created and modified
- Summary of new parser classes and HelpTextBuilder
- Whether all existing imports in other files still work
- Test results

## Verify
- Run: `npm run build`
- Expected: No TypeScript errors
- Run: `node --test test/cli-parsing.test.js`
- Expected: All existing parseArguments tests pass with same behavior
- Run: `node --test test/tool-runner.test.js`
- Expected: All dispatch tests pass

## Boundaries
- Do not add new npm dependencies
- The observable output of help text must be identical (same wording, spacing, formatting)
- parseArguments must remain exported from index.ts (backward compat with tests)
- Do not modify installer.ts, updater.ts, or tool-registry.ts
```

### T3.1: Convert log/validation tools (6 tools)

```
## Mission
Standardize 6 tools (filter-logs, search-logs, validate-skill-frontmatter, validate-openai-agent-config, sync-memory-index, extract-conversations) to use node:util.parseArgs for argument parsing and AppError for errors instead of ad-hoc parsing and stderr.write.

## Input
- Read: `packages/tools/filter-logs/index.ts` — current pattern (ad-hoc parseArgs, stderr.write)
- Read: `packages/tools/create-specs/index.ts` — another example of the current pattern
- The other 5 tool files (similar pattern)

## What to do
For each of the 6 tools, apply the following transformation:

1. **Replace argument parsing**: Replace the ad-hoc while-loop with `parseArgs({options: {...}, allowPositionals: true})` from `node:util`.
   - Define an `options` object with `type: 'string'` or `type: 'boolean'` for each known flag
   - Set `allowPositionals: true` for positional args (file paths, etc.)
   - Set `strict: true` (default) to reject unknown flags

2. **Replace error handling**: Replace `stderr.write('Error: ...\n') + return 1` with `throw new UserInputError('...')`.
   - For invalid input values (bad timezone, bad timestamp): `throw new UserInputError('message')`
   - For file operation failures: `throw new SystemError('message')`

3. **Replace output formatting**: Replace `stdout.write(...)` with the tool context's stdout (which comes from the CLI boundary).
   - Note: Tools receive `context.stdout` and `context.stderr` — continue using these directly for now. The refactored output layer (StdioAdapter) will be adopted by the CLI boundary which passes the streams to tools.

4. **Keep the ToolDefinition export**: The `export const tool: ToolDefinition = {...}` format must remain identical (same name, category, description, handler field).

5. **Import changes**: Add `import { parseArgs } from 'node:util';` — no other new imports needed.

## Scope
- Allowed files (only these 6 tools):
  - `packages/tools/filter-logs/index.ts` — modify
  - `packages/tools/search-logs/index.ts` — modify
  - `packages/tools/validate-skill-frontmatter/index.ts` — modify
  - `packages/tools/validate-openai-agent-config/index.ts` — modify
  - `packages/tools/sync-memory-index/index.ts` — modify
  - `packages/tools/extract-conversations/index.ts` — modify
- Forbidden files:
  - Any tool not in the list above
  - `packages/tool-utils/*` — do not modify
  - `packages/cli/*` — do not modify

## Output
On completion, report:
- Each tool file modified with the changes made
- Whether any tool used special flags that needed different handling
- Test results

## Verify
- Run: `npm run build`
- Expected: No TypeScript errors
- Run: `node --test test/tools/filter-logs.test.js`
- Expected: filter-logs tests pass (if they exist for other tools, verify those too)
- Run: `node -e "const {AppError} = await import('./packages/tool-utils/dist/index.js'); const {tool} = await import('./packages/tools/filter-logs/dist/index.js'); console.log(typeof tool.handler, tool.name)"`
- Expected: `function filter-logs`

## Boundaries
- Do not change the `export const tool` signature — name, category, description, handler must remain
- Do not change the ToolDefinition's handler signature — it must still accept (argv, context)
- Do not modify package.json files
- Do not modify TypeScript config files
```

### T3.2: Convert GitHub/content tools (6 tools)

```
## Mission
Standardize 6 tools (open-github-issue, find-github-issues, read-github-issue, review-threads, create-review-report, extract-pdf-text) to use node:util.parseArgs and AppError, following the same pattern as T3.1.

## Input
- Read: The current implementation of each of the 6 tools listed above
- The transformation pattern is identical to T3.1: replace ad-hoc parseArgs with node:util.parseArgs, replace stderr.write errors with AppError

## What to do
For each of the 6 tools, apply the same transformation as described in T3.1:
1. Replace ad-hoc while-loop parsers with `parseArgs({options, allowPositionals: true})`
2. Replace `stderr.write('Error: ...\n') + return 1` with `throw new UserInputError('...')`
3. Keep ToolDefinition export format identical
4. Add `import { parseArgs } from 'node:util';`

## Scope
- Allowed files:
  - `packages/tools/open-github-issue/index.ts` — modify
  - `packages/tools/find-github-issues/index.ts` — modify
  - `packages/tools/read-github-issue/index.ts` — modify
  - `packages/tools/review-threads/index.ts` — modify
  - `packages/tools/create-review-report/index.ts` — modify
  - `packages/tools/extract-pdf-text/index.ts` — modify
- Forbidden files:
  - Any tool not in the list above
  - All packages/cli/*, packages/tool-utils/*, packages/tui/* files

## Output
Same format as T3.1 — report each file change and test results.

## Verify
- Run: `npm run build`
- Expected: No TypeScript errors

## Boundaries
- Same as T3.1
```

### T3.3: Convert media/planning tools (6 tools)

```
## Mission
Standardize 6 tools (docs-to-voice, render-katex, render-error-book, generate-storyboard-images, enforce-video-aspect-ratio, create-specs) to use node:util.parseArgs and AppError, following the same pattern as T3.1.

## Input
- Read: The current implementation of each of the 6 tools listed above
- The transformation pattern is identical to T3.1

## What to do
For each of the 6 tools, apply the same transformation as described in T3.1:
1. Replace ad-hoc while-loop parsers with `parseArgs({options, allowPositionals: true})`
2. Replace `stderr.write('Error: ...\n') + return 1` with `throw new UserInputError('...')`
3. Keep ToolDefinition export format identical
4. Add `import { parseArgs } from 'node:util';`

Special note for create-specs: This tool has a more complex argument parser (lines 43-81) with --batch-name, --change-name, --output-dir, --template-dir, --force, --help. Its parseArgs schema should define all of these as options. The `--force` flag should be `type: 'boolean'`, and string options like `--change-name` should be `type: 'string'`.

## Scope
- Allowed files:
  - `packages/tools/docs-to-voice/index.ts` — modify
  - `packages/tools/render-katex/index.ts` — modify
  - `packages/tools/render-error-book/index.ts` — modify
  - `packages/tools/generate-storyboard-images/index.ts` — modify
  - `packages/tools/enforce-video-aspect-ratio/index.ts` — modify
  - `packages/tools/create-specs/index.ts` — modify
- Forbidden files:
  - Any tool not in the list above
  - All packages/cli/*, packages/tool-utils/*, packages/tui/* files

## Output
Same format as T3.1 — report each file change and test results.

## Verify
- Run: `npm run build`
- Expected: No TypeScript errors

## Boundaries
- Same as T3.1
- create-specs has a more complex CLI interface — ensure all existing flags are represented in the parseArgs schema
```

### T4.1: Write PlatformAdapter + AppError tests

```
## Mission
Write comprehensive unit tests for the PlatformAdapter and AppError classes created in T1.1, achieving >= 80% line coverage on the new code.

## Input
- Read: `packages/tool-utils/platform-adapter.ts` — the implementation to test
- Read: `packages/tool-utils/app-error.ts` — the implementation to test
- Read: `test/utils/terminal.test.js` — example test pattern in the project

## What to do
1. Create `test/utils/platform-adapter.test.js`:
   - Test `createPlatformAdapter()` returns correct adapter for each platform
   - Test `WindowsAdapter.symlinkType()` returns `'junction'`
   - Test `PosixAdapter.symlinkType()` returns `'dir'`
   - Test `homeDir()` checks HOME, then USERPROFILE, then os.homedir()
   - Test `resolveCommand()` appends .cmd on Windows
   - Test `resolveCommand()` returns command unchanged on POSIX
   - Test `EOL` returns correct value per platform
   - Mock `process.platform` and `process.env` using stubs

2. Create `test/utils/app-error.test.js`:
   - Test `AppError` instantiation with message and code
   - Test `UserInputError` sets statusCode = 1
   - Test `ToolNotFoundError` sets correct error code
   - Test `SystemError` preserves stack trace
   - Test `instanceof` checks in the hierarchy
   - Test error message inheritance

## Scope
- Allowed files:
  - `test/utils/platform-adapter.test.js` — create
  - `test/utils/app-error.test.js` — create
- Forbidden files:
  - Do not modify the implementation files (T1.1 already created them)
  - Do not modify any other test files

## Output
On completion, report:
- Which test files were created
- Number of test cases per file
- Coverage percentage measured

## Verify
- Run: `node --experimental-test-coverage --test-coverage-lines=80 test/utils/platform-adapter.test.js test/utils/app-error.test.js`
- Expected: All tests pass, coverage >= 80% for packages/tool-utils
- Run: `npm run build && node --experimental-test-coverage --test-coverage-lines=80 packages/tool-utils/dist/`
- Expected: Passes

## Boundaries
- Do not modify any source files — only write test files
- Use node:test and node:assert/strict only (no testing framework dependencies)
- Each test should be independent (own temporary directories, no shared state)
```

### T4.2: Write CLI parsers + error boundary tests

```
## Mission
Write unit tests for the three command parser classes and the error boundary in the CLI entry point, achieving >= 80% coverage.

## Input
- Read: `packages/cli/parsers/install-parser.ts` — the parser to test
- Read: `packages/cli/parsers/uninstall-parser.ts` — the parser to test
- Read: `packages/cli/parsers/tool-parser.ts` — the parser to test
- Read: `packages/cli/types.ts` — types used
- Read: `test/cli-parsing.test.js` — existing tests for reference (many can be adapted)

## What to do
1. Create `test/cli/install-args-parser.test.js`:
   - Test empty args → default install command, no modes
   - Test single mode → `['codex']`
   - Test multiple modes → `['codex', 'openclaw', 'trae']`
   - Test `--symlink` flag parsed correctly
   - Test `--copy` flag parsed correctly
   - Test `--home` with path value
   - Test `--help` → help flag set
   - Test `install` explicit keyword
   - Test `all` mode expands to all valid modes

2. Create `test/cli/uninstall-args-parser.test.js`:
   - Test bare `uninstall` → command = uninstall, no modes
   - Test `uninstall codex` → mode = codex
   - Test `--yes` / `-y` → assumeYes = true
   - Test `--home` with path
   - Test `--help` → help flag set
   - Test missing --home value → error

3. Create `test/cli/tool-args-parser.test.js`:
   - Test `filter-logs app.log --count-only` → toolName, toolArgs correct
   - Test `tools filter-logs app.log` → toolName, toolArgs correct
   - Test `tools` alone → tools help
   - Test `tools --help` → tools help
   - Test unknown tool name (but not dispatched here — parser just identifies)

4. Create `test/cli/error-boundary.test.js`:
   - Test that AppError thrown from a handler → stderr message + exit code
   - Test that SystemError includes stack trace in stderr
   - Test that unknown error (Error, not AppError) → generic message
   - Test that successful handler → exit code 0, stdout output

## Scope
- Allowed files:
  - `test/cli/install-args-parser.test.js` — create
  - `test/cli/uninstall-args-parser.test.js` — create
  - `test/cli/tool-args-parser.test.js` — create
  - `test/cli/error-boundary.test.js` — create
- Forbidden files:
  - Do not modify packages/cli/* source files
  - Do not modify other test files

## Output
Same format as T4.1.

## Verify
- Run: `node --test test/cli/install-args-parser.test.js test/cli/uninstall-args-parser.test.js test/cli/tool-args-parser.test.js test/cli/error-boundary.test.js`
- Expected: All tests pass

## Boundaries
- Do not modify any source files — only write test files
- Use only node:test and node:assert/strict
```

### T4.3: Write HelpTextBuilder + dispatch integration tests

```
## Mission
Write tests for the HelpTextBuilder output and the end-to-end dispatch integration, ensuring help text is identical to the original and dispatching works correctly.

## Input
- Read: `packages/cli/help-text-builder.ts` — the implementation
- Read: `packages/cli/index.ts` — the run() function

## What to do
1. Create `test/cli/help-text-builder.test.js`:
   - Test each help section (overview, install, uninstall, toolsHelp) produces expected structure
   - Test that `overview` contains "Usage:", "Common goals:", "Bundled tools:", "Examples:"
   - Test that `install` contains "Supported targets:", usage lines, options
   - Test that `uninstall` contains "Behavior notes:", options
   - Test that `toolsHelp` contains "Bundled tools:", "Common goals:"
   - Test that colorEnabled=false produces no ANSI codes (strip them for comparison)

2. Create `test/cli/dispatch-table.test.js`:
   - Test that adding a new parser to the dispatch table works
   - Test that the run() function correctly dispatches install, uninstall, tool commands
   - Use mock context (with fake stdout/stderr) — do not create real file system
   - Test dispatching to known tool (filter-logs with --help) → 0 exit code
   - Test dispatching to unknown tool → 1 exit code, error message on stderr

## Scope
- Allowed files:
  - `test/cli/help-text-builder.test.js` — create
  - `test/cli/dispatch-table.test.js` — create
- Forbidden files:
  - Do not modify any source files

## Output
Same format as T4.1.

## Verify
- Run: `node --test test/cli/help-text-builder.test.js test/cli/dispatch-table.test.js`
- Expected: All tests pass
- Run: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 test/cli/`
- Expected: Coverage thresholds met for CLI module

## Boundaries
- Do not modify any source files
```

### T4.4: Adapt existing tests + fill coverage gaps

```
## Mission
Ensure the existing test suite (test/cli-parsing.test.js, test/tool-runner.test.js) still works with the refactored code, and fill any remaining coverage gaps to reach the 80% line coverage threshold across all packages.

## Input
- Read: `test/cli-parsing.test.js` — existing tests (may need import updates if parseArguments moved)
- Read: `test/tool-runner.test.js` — existing tests
- Run: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/` to get current coverage

## What to do
1. Update `test/cli-parsing.test.js` if needed:
   - The test imports `parseArguments` from `@laitszkin/cli`. If parseArguments is still exported as a thin wrapper, the tests should pass unchanged. If the wrapper changes the function signature, update the imports accordingly.
   - Keep all test assertions the same — the observable behavior must not change.

2. Update `test/tool-runner.test.js` if needed:
   - Same approach — update imports only if the public API changed.
   - Keep all behavior tests intact.

3. Run the full coverage measurement and identify any gaps:
   - `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/`
   - If coverage thresholds are not met, write additional tests to close the gaps.
   - Focus on uncovered lines in: platforms/cli/*, packages/tool-utils/*, packages/tui/*, packages/tool-registry/*

## Scope
- Allowed files:
  - `test/cli-parsing.test.js` — modify (imports only)
  - `test/tool-runner.test.js` — modify (imports only)
  - Any `test/**/*.test.js` — create new or modify existing to close coverage gaps
- Forbidden files:
  - Do not modify source files (packages/)
  - Do not modify test logic or assertions — only imports if necessary

## Output
On completion, report:
- Which existing test files were modified and why
- Which new test files were created
- Final coverage numbers

## Verify
- Run: `npm run build`
- Expected: Build passes
- Run: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/`
- Expected: Coverage thresholds met
- Run: `node --test test/cli-parsing.test.js test/tool-runner.test.js`
- Expected: All original tests pass

## Boundaries
- Preserve all existing test assertions — only update imports if necessary
- If coverage thresholds are already met without changes, report that
```

---

## 7. Batch Schedule

### Batch 1 — Foundation

- **Tasks**: T1.1 (PlatformAdapter + AppError), T1.2 (StdioAdapter), T1.3 (CI + coverage config)
- **Strategy**: Dispatch 3 workers in parallel — zero file overlap confirmed
- **Depends on**: — (initial batch)
- **Gate** (all items must pass before next batch):
  - [ ] T1.1 worker reports success
  - [ ] T1.2 worker reports success
  - [ ] T1.3 worker reports success
  - [ ] Run: `npm run build` — no TypeScript errors

---

### Batch 2 — CLI Dispatch Refactor

- **Tasks**: T2.1 (Refactor CLI dispatch + help text)
- **Strategy**: Sequential (1 worker, touches index.ts exclusively)
- **Depends on**: Batch 1 (uses AppError from T1.1, StdioAdapter from T1.2)
- **Gate**:
  - [ ] T2.1 worker reports success
  - [ ] Run: `npm run build` — no TypeScript errors
  - [ ] Run: `node --test test/cli-parsing.test.js test/tool-runner.test.js` — all pass

---

### Batch 3 — Tool Standardization

- **Tasks**: T3.1 (log/validation tools), T3.2 (GitHub/content tools), T3.3 (media/planning tools)
- **Strategy**: Dispatch 3 workers in parallel — each touches disjoint tool packages
- **Depends on**: Batch 2 (ensure CLI dispatch works before modifying tools)
- **Gate**:
  - [ ] T3.1 worker reports success
  - [ ] T3.2 worker reports success
  - [ ] T3.3 worker reports success
  - [ ] Run: `npm run build` — no TypeScript errors
  - [ ] Run: `node --test test/tools/filter-logs.test.js` — passes

---

### Batch 4 — Coverage Completion

- **Tasks**: T4.1 (PlatformAdapter + AppError tests), T4.2 (CLI parsers tests), T4.3 (HelpTextBuilder tests), T4.4 (adapt existing + fill gaps)
- **Strategy**: Dispatch up to 4 workers in parallel — each writes to different test files
- **Depends on**: Batch 3 (tools must be converted before coverage can be measured on them)
- **Gate**:
  - [ ] All 4 workers report success
  - [ ] Run: `npm run build` — no TypeScript errors
  - [ ] Run: `node --test test/` — all tests pass

---

### Batch 5 — Final Integration

- **Tasks**: T5.1 (coordinator handles: final full test suite, final adjustments, commit)
- **Strategy**: Sequential (coordinator handles directly)
- **Depends on**: Batch 4
- **Gate**:
  - [ ] Run: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/` — thresholds met
  - [ ] Run: `npm run build` — clean build
  - [ ] Run: `node dist/bin/apollo-toolkit.js --help` — CLI still works
  - [ ] Run: `node dist/bin/apollo-toolkit.js tools --help` — tools listing works
  - [ ] Version in package.json is `5.0.0`

---

## 8. Verification Checkpoints

### Per-batch

| Batch | Verification Command | Expected Result |
|---|---|---|
| Batch 1 | `npm run build` | No TypeScript errors |
| Batch 2 | `node --test test/cli-parsing.test.js test/tool-runner.test.js` | All pass |
| Batch 3 | `npm run build && node --test test/tools/filter-logs.test.js` | Build + tests pass |
| Batch 4 | `node --test test/` | All tests pass |
| Batch 5 | Full coverage + smoke tests | Thresholds met, CLI works |

### Key behavior checks (from CHECKLIST.md)

| ID | Observable Behavior | How to verify |
|---|---|---|
| CL-01 | Tool with parseArgs schema auto-handles `--help` and error formatting | `node dist/bin/apollo-toolkit.js filter-logs --help` shows correct help |
| CL-03 | PlatformAdapter.symlinkType() returns 'junction' on Windows | `test/utils/platform-adapter.test.js` |
| CL-06 | AppError → stderr + exit code 1 | `test/cli/error-boundary.test.js` |
| CL-08 | Coverage >= 80% lines, 60% branches, 75% functions | `--test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75` |
| CL-09 | CI runs on both ubuntu-latest and windows-latest | `.github/workflows/test.yml` matrix config |
| CL-11 | Parsers independently testable | `test/cli/install-args-parser.test.js` does not import other modules |
| CL-13 | All 18 tool names resolve correctly | `node -e "const {isKnownToolName} = await import('./packages/cli/dist/index.js'); ['filter-logs','create-specs','architecture','codegraph'].forEach(n => console.log(n, isKnownToolName(n)))"` |

### Final verification

- [ ] Full test suite passes: `node --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75 --test test/`
- [ ] Build passes: `npm run build`
- [ ] CLI smoke test passes: `node dist/bin/apollo-toolkit.js --help` exits 0
- [ ] Tools listed correctly: `node dist/bin/apollo-toolkit.js tools` exits 0
- [ ] Version is 5.0.0: `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"`

---

## 9. Error Recovery

| Scenario | Response |
|---|---|
| A single worker reports failure | Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry. |
| Same worker fails twice | Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user: which task failed, what was tried, suggested next steps. |
| Merge conflict (merging worker results) | Coordinator resolves the conflict, then re-runs the batch gate verification. |
| Test regression (new code breaks existing tests) | Pause. Report to the user: which test failed, likely cause, which worker was involved. Do not weaken the test to make it pass. |
| Contradiction in SPEC/DESIGN or infeasible design found during implementation | Pause. Document the specific contradiction and notify the user. |
| `npm run build` fails with TypeScript errors | Do not proceed. Run `npx tsc --noEmit` to get full error list. Check if the error is in the worker's assigned files or in a pre-existing condition. Report to the user. |

---

## 10. Boundaries

### ALWAYS

- Run gate verification immediately after every batch
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Follow the File Ownership implied by task assignments — do not let two workers modify the same file
- **Resolve merge conflicts yourself** — when combining worker results, the coordinator handles conflict resolution. This is coordination, not implementation.
- After two failures, pause and ask — do not keep retrying
- Always build (`npm run build`) between batches to catch TypeScript errors early

### ASK FIRST — pause and confirm with the user

- Need to modify a file not defined in SPEC/DESIGN
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- `@laitszkin/tool-eval` is referenced — it's explicitly out of scope, skip it

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Workers spawn sub-workers
- Skip verification and proceed to the next batch
- Give workers vague instructions (e.g., "fix it" or "based on what you found")
- Expand implementation scope beyond Section 3
- Proceed to the next batch when the current batch's gate has not passed
- Modify `@laitszkin/tool-eval` — excluded from scope
- Change the `ToolDefinition` export format in any tool
- Add any new npm dependency
