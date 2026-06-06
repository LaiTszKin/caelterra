# Fix Coordinator Prompt: CLI 工具全面重構 — Round 17

- **Date**: 2026-06-06
- **Source REPORT**: `docs/plans/2026-06-04/cli-refactor/REPORT.md` (Round 17)
- **Source Spec**: `docs/plans/2026-06-04/cli-refactor/`
- **Total Issues**: P1: 3, P2: 8, P3: 9 (20 total)
- **Total Regression Tests**: 6

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in Section 6)
- Wait for all workers in a batch to complete, then digest their results
- For sequential sub-batches, wait for each to finish before starting the next
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, updating lockfiles
- Commit all changes in a single commit after the final verification gate passes

### What you NEVER do

- Write, edit, or modify any source-code or test file directly
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)
- Start regression tests before all fixes in scope are verified
- Defer any REPORT.md issue to a future round — every issue has a complete plan here

---

## 2. Mission

Resolve 20 issues (3 P1 + 8 P2 + 9 P3) from Round 17 of the CLI refactoring review. The P1 defects are: (1) error re-wrapping at 3 sites in filter-logs and codegraph discards the original error cause chain, (2) the if-else chain in `parseArguments` contradicts the spec's "independently add/remove entries" requirement, and (3) Group 3 mock.module tests are permanently excluded from coverage, causing the combined ≥ 80% metric to be overstated.

The strategy: fix all documentation issues first (isolated files), then independent code fixes in parallel, then sequential fixes on shared files (cli/index.ts, test/tool-runner.test.js, scripts/test.sh), then regression tests, then final verification.

**Success looks like**: All 20 issues are resolved, all regression tests pass, full test suite passes, no regressions.

---

## 3. Issue Inventory

- FIX-01 (P1, 簡單, 實作遺漏): Error re-wrapping at 4 sites discards `{ cause: err }` — filter-logs L34-38/L50-51/L77-78, codegraph L137
- FIX-02 (P1, 複雜, 實作偏離): if-else chain (L91-155) requires 3 locations to add a command — needs `toParsedArguments()` on parser interface
- FIX-03 (P1, 簡單, 實作遺漏): Group 3 excluded from coverage — combined ≥ 80% overstated. Document gap and validate
- FIX-04 (P2, 簡單, 架構瑕疵): Dispatch table bypass (L157-173) routes tool names outside the Map
- FIX-05 (P2, 簡單, 冗餘代碼): Redundant `parseArguments` tests in tool-runner.test.js L22-26
- FIX-06 (P2, 簡單, 架構瑕疵): Eval convention erosion risk — add doc block and tool-registration exclusion note
- FIX-07 (P2, 簡單, 實作偏離): extract-conversations reads `process.env.CODEX_HOME` directly instead of using PlatformAdapter
- FIX-08 (P2, 簡單, 實作偏離): syncAgentsFile uses hardcoded `\n` concatenation despite EOL abstraction
- FIX-09 (P3, 簡單, 架構瑕疵): High collision density in cli/index.ts — add awareness comment
- FIX-10 (P2, 簡單, 實作遺漏): Stale HELP_SKIP — remove render-error-book and render-katex from exclusion set
- FIX-11 (P3, 簡單, 架構瑕疵): Hardcoded `\n` in EPERM fallback warning (installer.ts L369)
- FIX-12 (P3, 簡單, 架構瑕疵): formatAppError JSDoc omits ToolNotFoundError branch
- FIX-13 (P3, 簡單, 幻覺代碼): Stale Batch 4/5 migration comments in tool-runner.test.js
- FIX-14 (P3, 簡單, 實作遺漏): DESIGN.md branch threshold mismatch (65 stated vs 60 enforced)
- FIX-15 (P3, 簡單, 實作遺漏): DESIGN.md oversimplifies thresholds as uniform 75/65/65
- FIX-16 (P3, 簡單, 實作遺漏): Stale CI workflow comment (wrong thresholds, wrong Node version)
- FIX-17 (P3, 簡單, 實作遺漏): Windows glob warning inaccurate for CI context
- FIX-18 (P3, 簡單, 實作遺漏): Eval scope boundary leak — eval tests not excluded from Group 2
- FIX-19 (P3, 簡單, 冗餘代碼): enforce-video-aspect-ratio unused parseArgs (~75 lines dead code)
- FIX-20 (P3, 簡單, 冗餘代碼): architecture unused stderr bindings (L149, L482)

---

## 4. Fix Dependency Analysis

### File Overlaps (Parallelism Gate)

| File | Fixes | Must Be Sequential |
|---|---|---|
| `packages/cli/index.ts` | FIX-02, FIX-04, FIX-09 | ✅ FIX-09(doc) → FIX-04 → FIX-02 |
| `test/tool-runner.test.js` | FIX-05, FIX-13 | ✅ FIX-05 → FIX-13 |
| `scripts/test.sh` | FIX-03, FIX-17, FIX-18 | ✅ FIX-17 → FIX-03 → FIX-18 |
| `docs/plans/.../DESIGN.md` | FIX-14, FIX-15 | ✅ Merge into one worker (merged FIX-14+15) |

### Dependencies

- REGTEST-xx depends on its corresponding FIX-xx completing first (all regression tests)
- FIX-18 (eval exclusion) depends on FIX-03 (coverage docs): both touch scripts/test.sh, must be sequential
- FIX-13 (stale comments) depends on FIX-05 (redundant test removal): both touch tool-runner.test.js
- FIX-09 (collision comment in cli/index.ts) can be merged into FIX-02 or FIX-04 since it's a comment change

### Independent Fixes (parallel)

All remaining fixes touch unique files and can run in parallel within the same batch:
- FIX-01 (filter-logs + codegraph, single worker)
- FIX-06 (eval)
- FIX-07 (extract-conversations)
- FIX-08 (sync-memory-index)
- FIX-10 (schema-conversion-smoke.test.js)
- FIX-11 (installer.ts)
- FIX-12 (app-error.ts)
- FIX-16 (.github/workflows/test.yml)
- FIX-19 (enforce-video-aspect-ratio)
- FIX-20 (architecture)

### Merged Workers (simple, non-conflicting)

- FIX-14+15 → one worker (DESIGN.md threshold documentation)
- FIX-12 + FIX-16 → can be one "documentation stale comments" worker (app-error.ts JSDoc + test.yml comment — different files, no overlap)
- FIX-19 + FIX-20 → one "dead code removal" worker (different files, no overlap)

---

## 5. Fix Details (with Regression Test Design)

### FIX-01: Error re-wrapping discards cause chain (P1)

**Root cause**: At 4 re-wrap sites, `SystemError`/`UserInputError` constructors receive only `.message` without the `{ cause: err }` ErrorOptions parameter. The original error object (stack trace, nested cause) is lost.

**Files involved**:
- `packages/tools/filter-logs/index.ts` — L36-37 (empty `catch {}`), L50-51 (`throw new UserInputError((err as Error).message)`), L77-78 (`throw new SystemError((err as Error).message)`)
- `packages/tools/codegraph/index.ts` — L137 (`throw new SystemError(...)` without `{ cause: error }`)

**Fix approach**:
1. filter-logs L34-38: Change `catch {` to `catch (err)`, pass `{ cause: err as Error }` to `UserInputError`
2. filter-logs L50-51: Add `{ cause: err }` as second argument to `UserInputError` constructor
3. filter-logs L77-78: Add `{ cause: err }` as second argument to `SystemError` constructor
4. codegraph L137: Add `{ cause: error }` as second argument to `SystemError` constructor

The `AppError` constructor and its subclasses (`UserInputError`, `SystemError`) already accept `ErrorOptions` as the second parameter — this pattern is confirmed by the open-github-issue fix (W19) which uses `{ cause: exc }`.

**Complexity**: Simple — 4 single-line changes across 2 files.

**Regression test**: REGTEST-01

---

### FIX-02: if-else chain couples dispatcher (P1)

**Root cause**: `parseArguments` in `cli/index.ts` L91-155 uses a 65-line if-else chain to reshape each parser's typed result into `ParsedArguments`. Adding a new command requires modifying 3 locations: parser class, `Map.set()`, and if-else branch. This contradicts SPEC Req 5's "independently add/remove table entries."

**Files involved**:
- `packages/cli/index.ts` — L66-190 (`parseArguments` function)
- `packages/cli/parsers/types.ts` — `CommandParser` interface definition
- `packages/cli/parsers/install-parser.ts` — `InstallArgsParser`
- `packages/cli/parsers/uninstall-parser.ts` — `UninstallArgsParser`
- `packages/cli/parsers/tool-parser.ts` — `ToolArgsParser`

**Fix approach**:
1. Add `toParsedArguments(result: T): ParsedArguments` method to the `CommandParser<T>` interface in `types.ts`
2. Implement `toParsedArguments()` in `InstallArgsParser`, `UninstallArgsParser`, `ToolArgsParser` — each moves its if-else branch logic into the parser class
3. Replace the if-else chain in `parseArguments` with a loop that calls `parser.parse(argv)` then `parser.toParsedArguments(result)`. The commandParsers Map is iterated: try each parser; the first one that returns a non-null result wins.
4. The tool-name bypass (FIX-04) must be resolved first to ensure clean routing.

**Complexity**: Complex — cross-file, touches the parser interface, affects all parser classes.

**Regression test**: REGTEST-02

---

### FIX-03: Group 3 coverage exclusion (P1)

**Root cause**: Three codegraph test files require `--experimental-test-module-mocks`, which is incompatible with `--experimental-test-coverage`. These tests run in Group 3 without coverage tracking, so the combined ≥ 80% metric covers only Groups 1+2.

**Files involved**:
- `scripts/test.sh` — L10-18, L85-91 (combined coverage calculation), L150-154 (Group 3 execution)

**Fix approach**:
1. Update the combined coverage calculation comment to explicitly state "Groups 1+2 only (Group 3 excluded due to mock.module incompatibility)"
2. Add a codegraph source file reference count to the combined formula comment so the approximate impact of the exclusion is understood
3. Ensure the combined coverage output explicitly prints "Groups 1+2" in the label

**Complexity**: Simple — documentation and output formatting.

**Regression test**: REGTEST-03

---

### FIX-04: Dispatch bypass (P2)

**Root cause**: `parseArguments` L157-173 routes direct tool names via `isKnownToolName()` check that bypasses the `commandParsers` Map. Tool routing doesn't go through the dispatch table.

**Files involved**:
- `packages/cli/index.ts` — L157-173

**Fix approach**:
1. Before the `parseArguments` if-else chain, check if `firstArg` is a known tool name (existing `isKnownToolName` check)
2. If yes, prefix it with `'tool'` in the argv so it routes through the dispatch table's `'tool'` entry
3. Remove the standalone bypass return block (L157-173)
4. The dispatch table then handles all tool routing uniformly

**Complexity**: Simple — single file, targeted change. Must run before FIX-02 since FIX-02 touches the same area.

**Regression test**: REGTEST-04

---

### FIX-05: Redundant parseArguments tests (P2)

**Root cause**: tool-runner.test.js L22-26 duplicates coverage of dispatch-table.test.js L13-31. W12 claimed removal but the overlap persists.

**Files involved**:
- `test/tool-runner.test.js` — L22-26

**Fix approach**:
1. Remove the `test('parseArguments distinguishes overview, install, and uninstall help', ...)` block at L22-26
2. The dispatch-table.test.js tests are more thorough (they also check `showHelp` and `command`)

**Complexity**: Simple — single deletion.

**Regression test**: No regression test needed — the existing dispatch-table.test.js covers the same scenarios. Verification: run the test suite.

---

### FIX-06: Eval convention erosion risk (P2)

**Root cause**: eval is explicitly excluded from refactoring scope (SPEC.md L28) but is registered in `tool-registration.ts` and dispatched normally. Its non-conforming pattern (hand-rolled parseArgs, console.error+continue, process.exit(1), no PlatformAdapter) is visible to any developer browsing packages/tools/.

**Files involved**:
- `packages/tools/eval/index.ts` — add warning comment at top
- `packages/cli/tool-registration.ts` — add eval to exclusion documentation

**Fix approach**:
1. Add a prominent comment block at the top of `eval/index.ts` explaining it predates the createToolRunner refactoring and is intentionally excluded per SPEC.md — it is NOT a template for new tools
2. Add a documented constant `SCOPE_EXCLUDED_TOOLS` in `tool-registration.ts` listing eval
3. No code changes to eval's behavior — just documentation

**Complexity**: Simple — documentation only.

**Regression test**: No automated test. Manual verification of the comment block.

---

### FIX-07: PlatformAdapter adoption gap (P2)

**Root cause**: `extract-conversations/index.ts` L7-10 reads `process.env.CODEX_HOME` directly instead of using `PlatformAdapter.homeDir()`. The PlatformAdapter exists but is not consumed here.

**Files involved**:
- `packages/tools/extract-conversations/index.ts` — L1-15

**Fix approach**:
1. Import `createPlatformAdapter` from `@laitszkin/tool-utils`
2. Replace the direct `process.env.CODEX_HOME` read with `adapter.homeDir()` after creating the adapter
3. The adapter's `homeDir()` already implements the `HOME` → `USERPROFILE` → `os.homedir()` fallback chain — but CODEX_HOME is a custom env var. Add `process.env.CODEX_HOME` priority in the adapter's `homeDir()` method, or resolve CODEX_HOME via the adapter pattern at the call site.

Better approach: Keep the CODEX_HOME env var check but route it through the adapter:
```
const codexHome = adapter.homeDir(process.env.CODEX_HOME) || path.join(adapter.homeDir(), '.codex');
```

**Complexity**: Simple — single file.

**Regression test**: REGTEST-05

---

### FIX-08: Mixed EOL in syncAgentsFile (P2)

**Root cause**: syncAgentsFile L85-89 uses hardcoded `\n` for concatenation while sectionText uses os.EOL. Creates mixed line endings on Windows.

**Files involved**:
- `packages/tools/sync-memory-index/index.ts` — L85-89

**Fix approach**:
1. Replace the hardcoded `\n` in `syncAgentsFile` with `os.EOL` (or `adapter.EOL` if the adapter is already imported)
2. Remove the "mixed line endings" comment since it will no longer apply

**Complexity**: Simple — single line change.

**Regression test**: No automated test practical. Verify: the file still builds and tests pass.

---

### FIX-09: Collision density awareness comment (P3)

**Root cause**: Three requirements modify overlapping regions of cli/index.ts (L55-190, L349-360). No awareness marker exists.

**Files involved**:
- `packages/cli/index.ts` — add comment at top of file or near dispatch area

**Fix approach**:
1. Add a comment block near the top of `cli/index.ts` (around L55) noting the high collision density region

Can be merged into FIX-04's worker since both touch cli/index.ts.

**Complexity**: Simple — comment only.

**Regression test**: None needed.

---

### FIX-10: Stale HELP_SKIP test set (P2)

**Root cause**: render-error-book and render-katex were migrated to createToolRunner but not removed from HELP_SKIP in schema-conversion-smoke.test.js.

**Files involved**:
- `test/tools/schema-conversion-smoke.test.js` — L40-42

**Fix approach**:
1. Remove `'render-error-book'` and `'render-katex'` from the HELP_SKIP Set
2. Update the comment to reflect that only architecture remains

**Complexity**: Simple — single line removal.

**Regression test**: REGTEST-06 — the existing smoke test will now cover these tools.

---

### FIX-11: Hardcoded `\n` in EPERM warning (P3)

**Root cause**: installer.ts L369 uses hardcoded `\n` in the warning message rather than `os.EOL` or `adapter.EOL`.

**Files involved**:
- `packages/cli/installer.ts` — L369

**Fix approach**:
1. Replace the hardcoded `\n` in the EPERM warning message with `adapter.EOL` (adapter is already imported in that scope)

**Complexity**: Simple — single character change.

**Regression test**: None needed.

---

### FIX-12: formatAppError JSDoc omits ToolNotFoundError (P3)

**Root cause**: JSDoc at app-error.ts L77-81 wasn't updated when the ToolNotFoundError branch was added at L90-91.

**Files involved**:
- `packages/tool-utils/app-error.ts` — L77-81

**Fix approach**:
1. Add ToolNotFoundError to the JSDoc comment documenting formatting behavior

**Complexity**: Simple — documentation only.

**Regression test**: None needed.

---

### FIX-13: Stale Batch 4/5 comments (P3)

**Root cause**: tool-runner.test.js L6-7 and L29-30 reference an outdated migration timeline.

**Files involved**:
- `test/tool-runner.test.js` — L6-7, L29-30

**Fix approach**:
1. Remove or update the stale Batch 4/5 comments to reflect current state

**Complexity**: Simple — documentation only.

**Regression test**: None needed.

---

### FIX-14+15: DESIGN.md coverage threshold documentation (P3)

**Root cause**: DESIGN.md consistently documents per-process thresholds as 75/65/65, but enforcement is two-tier: G1=75/60/65, G2=65/60/65.

**Files involved**:
- `docs/plans/2026-06-04/cli-refactor/DESIGN.md` — L20, L75, L133, L138, L177, L193

**Fix approach**:
1. Update all threshold references to reflect per-group actuals
2. Document the two-tier structure (Group 1: test/ at 75/60/65, Group 2: packages/ at 65/60/65)
3. Include rationale for two-tier thresholds

**Complexity**: Simple — documentation only.

**Regression test**: None needed.

---

### FIX-16: Stale CI workflow comment (P3)

**Root cause**: .github/workflows/test.yml L23-24 references wrong thresholds (65/60/65), wrong enforcement method (post-hoc grep), and wrong Node version (25+).

**Files involved**:
- `.github/workflows/test.yml` — L23-24

**Fix approach**:
1. Update the comment to reflect actual thresholds (G1: 75/60/65, G2: 65/60/65), enforcement method (`run_coverage_group` in test.sh with bc), and Node version (22)

**Complexity**: Simple — comment update.

**Regression test**: None needed.

---

### FIX-17: Windows glob warning inaccurate (P3)

**Root cause**: scripts/test.sh L19-21 warns that forward-slash globs won't work on Windows, but CI uses shell: bash which handles them correctly.

**Files involved**:
- `scripts/test.sh` — L19-21

**Fix approach**:
1. Update the comment to clarify that the glob works under CI's bash shell but may need backslashes for direct cmd.exe/PowerShell invocation

**Complexity**: Simple — comment update.

**Regression test**: None needed.

---

### FIX-18: Eval scope boundary leak (P3)

**Root cause**: scripts/test.sh doesn't exclude eval test files from Group 2 test discovery. Out-of-scope code affects coverage metrics.

**Files involved**:
- `scripts/test.sh` — L128 (test file pattern), add eval exclusion

**Fix approach**:
1. Add eval to the `grep -v -E` exclusion list on the test file discovery line (L128) or add a specific eval exclusion pattern
2. The existing exclusion pattern already filters `cmd-init|cmd-list-apis|cmd-survey` — extend it to also exclude eval test files

**Complexity**: Simple — single line change.

**Regression test**: REGTEST-07

---

### FIX-19: enforce-video-aspect-ratio unused parseArgs (P3)

**Root cause**: The old `parseArgs` function (~75 lines, L21-95) and `AspectArgs` interface were not removed when the tool was migrated to `createToolRunner` at L379.

**Files involved**:
- `packages/tools/enforce-video-aspect-ratio/index.ts` — L7-95 (AspectArgs interface L7-19, parseArgs function L21-95)

**Fix approach**:
1. Remove the `AspectArgs` interface and `parseArgs` function
2. Remove the unused `help` field from the interface if it exists
3. Verify the tool still builds (the handler uses createToolRunner(schema) which handles parsing independently)

**Complexity**: Simple — dead code deletion.

**Regression test**: REGTEST-08

---

### FIX-20: architecture unused stderr bindings (P3)

**Root cause**: handleApply (L149) and handleTemplate (L482) destructure `stderr` from context but never use it in the function body.

**Files involved**:
- `packages/tools/architecture/index.ts` — L149, L482

**Fix approach**:
1. Remove the unused `const stderr = context.stderr || process.stderr;` lines from both functions
2. Verify the functions still work (errors propagate via throws, not stderr.write)

**Complexity**: Simple — 2 lines removed.

**Regression test**: REGTEST-08 (combined with FIX-19)

---

## 6. Worker Prompt Library

### Fix Worker Prompts

#### WORKER-F01: Error cause chain preservation (FIX-01)

```
## Mission
Fix error re-wrapping at 4 sites to preserve the original error's cause chain. Currently, all 4 sites pass only `.message` to the new `UserInputError`/`SystemError` without `{ cause: err }`, losing the original stack trace and nested cause chain.

## Context
- Review dimension: Spec implementation omission
- Spec requirement: Req 3 (unified error handling with typed AppError hierarchy)
- The `AppError` constructor and subclasses accept a second `ErrorOptions` parameter for `{ cause }` — confirmed by open-github-issue fix (W19)

## Input
Read these files to understand the current error paths:
- `packages/tools/filter-logs/index.ts` — L30-80 (3 re-wrap sites)
- `packages/tools/codegraph/index.ts` — L130-145 (1 re-wrap site)

## What to do
Make these changes:

### Site 1 — filter-logs/index.ts L34-38 (timezone validation)
Change:
```
catch {
  throw new UserInputError(`invalid timezone: ${assumeTimezone}`);
}
```
To:
```
catch (err) {
  throw new UserInputError(`invalid timezone: ${assumeTimezone}`, { cause: err as Error });
}
```

### Site 2 — filter-logs/index.ts L50-51 (timestamp parsing)
Change:
```
throw new UserInputError((err as Error).message);
```
To:
```
throw new UserInputError((err as Error).message, { cause: err as Error });
```

### Site 3 — filter-logs/index.ts L77-78 (stream processing)
Change:
```
throw new SystemError((err as Error).message);
```
To:
```
throw new SystemError((err as Error).message, { cause: err as Error });
```

### Site 4 — codegraph/index.ts L137 (catch-all)
Change:
```
throw new SystemError(error instanceof Error ? error.message : 'Unknown error in codegraph');
```
To:
```
throw new SystemError(error instanceof Error ? error.message : 'Unknown error in codegraph', { cause: error instanceof Error ? error : undefined });
```

## Scope
- Allowed files:
  - `packages/tools/filter-logs/index.ts`
  - `packages/tools/codegraph/index.ts`
- Forbidden files: all others

## Output
On completion, report:
- Which files were modified
- The 4 changes made (line numbers before/after)
- Test results
- Any blockers or risks

## Verify
- Run tests: `node --test test/tools/filter-logs.test.js`
- Run tests: `node --test packages/tools/codegraph/` (if test script exists)
- Expected: All tests pass

## Boundaries
- Do not modify any file outside the allowed list
- The fix uses the existing `{ cause }` ErrorOptions pattern — no constructor changes needed
- Do not write regression tests — that is handled by another worker
- If you encounter an unexpected blocker, stop and report
```

---

#### WORKER-F02: if-else chain refactoring (FIX-02)

```
## Mission
Refactor the `parseArguments` if-else chain (L91-155) to eliminate the 3-location coupling when adding new commands. Add a `toParsedArguments()` method to the `CommandParser` interface so each parser handles its own output reshaping.

## Context
- Review dimension: Spec implementation deviation
- Spec requirement: Req 5 (dispatch table entries independently addable/removable)
- Current: 65-line if-else chain in cli/index.ts + 4 parser classes. Adding a command requires 3 locations.
- Target: Each parser has `toParsedArguments()` — the dispatch loop calls it generically.

## Input
Read these files:
- `packages/cli/index.ts` — L55-190 (parseArguments)
- `packages/cli/parsers/types.ts` — CommandParser interface
- `packages/cli/parsers/install-parser.ts` — InstallArgsParser
- `packages/cli/parsers/uninstall-parser.ts` — UninstallArgsParser
- `packages/cli/parsers/tool-parser.ts` — ToolArgsParser
- `packages/cli/types.ts` — ParsedArguments type

## What to do
1. In `packages/cli/parsers/types.ts`, add a `toParsedArguments(result: T): ParsedArguments` method to the `CommandParser<T>` interface:
   ```typescript
   export interface CommandParser<T> {
     parse(argv: string[]): T;
     toParsedArguments(result: T): ParsedArguments;
   }
   ```

2. In each parser, implement `toParsedArguments()`:
   - **InstallArgsParser**: Move logic from cli/index.ts L108-123
   - **UninstallArgsParser**: Move logic from cli/index.ts L91-106
   - **ToolArgsParser**: Move logic from L125-154 (both tools-help and tool paths)

3. In `packages/cli/index.ts`, replace the if-else chain (L91-155) with a loop:
   ```typescript
   // Command dispatch: iterate parsers, first match wins
   for (const [name, parser] of commandParsers) {
     if (firstArg === name) {
       const result = parser.parse(argv);
       return parser.toParsedArguments(result);
     }
   }
   ```
   Keep the default fallback (L175+) for unrecognized commands.

4. Keep the tool-name bypass (FIX-04 will handle removing it). Just ensure the if-else chain replacement doesn't break the bypass.

5. Preserve the existing FIX-16 comment and FIX-10 error patterns docs.

## Scope
- Allowed files:
  - `packages/cli/parsers/types.ts`
  - `packages/cli/parsers/install-parser.ts`
  - `packages/cli/parsers/uninstall-parser.ts`
  - `packages/cli/parsers/tool-parser.ts`
  - `packages/cli/index.ts` — only L55-190; do not touch L349-360 (error pattern docs)

- Forbidden files: all others, especially `packages/cli/installer.ts`, `test/` files, `scripts/` files

## Output
On completion, report:
- Each file modified and the changes made
- The new `toParsedArguments()` implementation for each parser
- Test results
- Any blockers or risks

## Verify
- Run: `node --test test/cli/dispatch-table.test.js`
- Run: `node --test test/tool-runner.test.js`
- Run: `node --test test/cli/install-args-parser.test.js test/cli/uninstall-args-parser.test.js test/cli/tool-args-parser.test.js`
- Expected: All tests pass

## Boundaries
- Do not change the ParsedArguments type shape — the return structure must remain identical
- Do not modify any test files
- Do not change the default fallback (install) behavior
- If you encounter a complex merge conflict, report it rather than forcing a change
```

---

#### WORKER-F03: Coverage documentation and gap validation (FIX-03)

```
## Mission
Update the combined coverage calculation in scripts/test.sh to explicitly document the Group 3 exclusion, and add a validation test that confirms the combined ≥ 80% calculation includes only Groups 1+2.

## Context
- Review dimension: Spec implementation omission
- Spec requirement: Req 4 (coverage ≥ 80% + CI matrix)
- Three codegraph test files (cmd-init, cmd-list-apis, cmd-survey) require --experimental-test-module-mocks which is incompatible with coverage
- Combined weighted ≥ 80% enforcement exists but doesn't account for Group 3 exclusion

## Input
Read `scripts/test.sh` — focus on L1-30 (comments/globals), L85-91 (combined coverage calculation), L148-170 (Group 3 execution + combined gate)

## What to do
1. Update the combined coverage calculation header comment (around L85) to explicitly state:
   "Combined coverage = weighted average of Groups 1+2. Group 3 (codegraph mock.module tests) excluded due to Node.js incompatible flags."

2. Update the combined coverage output message (around L163) to print "Combined coverage (G1+G2)" instead of just "Combined coverage" so the exclusion is visible in CI output.

3. Keep the existing ≥ 80% threshold — no change to the pass/fail logic.

## Scope
- Allowed files:
  - `scripts/test.sh` — comments and output messages only
- Forbidden files: all source code files

## Output
On completion, report:
- The exact lines changed
- Verification that `COVERAGE=true bash scripts/test.sh` still passes

## Verify
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: Combined coverage gate passes, output message includes "G1+G2" notation

## Boundaries
- Do not change any coverage threshold values
- Do not modify any source code or test files
- Do not modify the Group 3 test execution logic
```

---

#### WORKER-F04+F09: Dispatch bypass removal + collision comment (FIX-04, FIX-09)

```
## Mission
Remove the dispatch table bypass path for direct tool names (FIX-04) and add a collision density awareness comment (FIX-09).

## Context
- FIX-04 dimension: Architecture defect, Req 5/Req 1
- FIX-09 dimension: Architecture defect, Req 1/Req 3/Req 5
- Current: L157-173 routes direct tool names via isKnownToolName() bypassing the commandParsers Map
- Target: All routing goes through the dispatch table

## Input
Read `packages/cli/index.ts` — L55-190 (full parseArguments function)

## What to do
### Fix 04 — Remove bypass path (L157-173)
1. Before the if-else chain (or within the Map loop, depending on what FIX-02 leaves), ensure that tool name matching goes through the `'tool'` key of the dispatch table
2. Remove the standalone bypass return block at L157-173
3. The pattern should be: `firstArg` matches a Map key → use that parser. Not matched AND isKnownToolName → treat as `'tool'` command via the `'tool'` Map entry. Not matched AND not a tool → default install.

### Fix 09 — Add collision awareness comment
1. Add a comment block near L55 (before the dispatch table) noting that L55-190 and L349-360 are high-collision regions touched by dispatch, parser, and error-boundary changes.

## Scope
- Allowed files:
  - `packages/cli/index.ts` — parseArguments function only
- Forbidden files: all others

## Output
On completion, report:
- The changes made to remove the bypass
- The collision comment added
- Test results

## Verify
- Run: `node --test test/cli/dispatch-table.test.js`
- Run: `node --test test/tool-runner.test.js`
- Expected: All tool routing tests pass

## Boundaries
- Do not change the ParsedArguments type shape
- Do not modify any test files
- Do not modify the FIX-10 error pattern docs (L349-360)
```

---

#### WORKER-F05+F13: Redundant test removal + stale comment update (FIX-05, FIX-13)

```
## Mission
Remove the redundant parseArguments test and stale Batch 4/5 migration comments from tool-runner.test.js.

## Context
- FIX-05 dimension: Redundant code, Req 5
- FIX-13 dimension: Hallucinated code, Req 5
- The test at L22-26 and comments at L6-7/L29-30 are stale

## Input
Read `test/tool-runner.test.js` — full file

## What to do
1. Remove the entire test block at L22-26 (`test('parseArguments distinguishes overview, install, and uninstall help', ...)`)
2. Remove or update the stale Batch 4/5 comments:
   - L6-7: Remove `// Note: tools are not yet registered in the new registry (Batch 4).\n// Tool handler tests will be enabled after tool migration.`
   - L29-30: Remove `// No tools registered yet (will be populated in Batch 5)` or update to reflect current state

## Scope
- Allowed files:
  - `test/tool-runner.test.js`
- Forbidden files: all others

## Output
On completion, report:
- The exact lines removed
- Test results

## Verify
- Run: `node --test test/tool-runner.test.js`
- Run: `node --test test/cli/dispatch-table.test.js`
- Expected: All tests pass. The dispatch-table tests continue to cover the parseArguments scenarios
```

---

#### WORKER-F06: Eval convention erosion documentation (FIX-06)

```
## Mission
Add prominent documentation warning that the eval tool is intentionally excluded from the refactoring scope and is NOT a template for new tools.

## Context
- Review dimension: Architecture defect, Req 1/Req 2/Req 3
- eval is explicitly excluded from scope per SPEC.md L28, but its non-conforming patterns (hand-rolled parseArgs, console.error+continue, process.exit(1), no PlatformAdapter) create a simpler visible pattern

## Input
Read `packages/tools/eval/index.ts` — first 30 lines and the handler export
Read `packages/cli/tool-registration.ts` — the TOOL_MODULE_NAMES list

## What to do
1. In `packages/tools/eval/index.ts`, add a prominent comment block at the top of the file (after the imports, before any code):
   ```
   // ╔══════════════════════════════════════════════════════════════════════════╗
   // ║  SCOPE EXCLUSION NOTICE                                                ║
   // ║  This tool is explicitly excluded from the CLI refactoring scope       ║
   // ║  (SPEC.md L28). It predates createToolRunner, AppError, and            ║
   // ║  PlatformAdapter. DO NOT use this tool's patterns as a template        ║
   // ║  for new tools. New tools should use createToolRunner + AppError.      ║
   // ╚══════════════════════════════════════════════════════════════════════════╝
   ```

2. In `packages/cli/tool-registration.ts`, add a constant:
   ```
   /** Tools excluded from CLI refactoring scope (SPEC.md L28) */
   export const SCOPE_EXCLUDED_TOOLS = new Set(['eval']);
   ```

## Scope
- Allowed files:
  - `packages/tools/eval/index.ts` — comment block only
  - `packages/cli/tool-registration.ts` — add exported constant
- Forbidden files: all others. Do not change eval's behavior or migrate it

## Output
On completion, report:
- The exact comments/constants added
- File locations

## Verify
- Run: `node --test test/tool-registration/all-tools-known.test.js`
- Expected: All tests pass

## Boundaries
- Do not change any code behavior — comments and one constant only
- Do not attempt to migrate eval to createToolRunner
```

---

#### WORKER-F07: extract-conversations PlatformAdapter adoption (FIX-07)

```
## Mission
Replace the direct `process.env.CODEX_HOME` read in extract-conversations with a PlatformAdapter-based pattern.

## Context
- Review dimension: Spec implementation deviation, Req 2/Req 1
- extract-conversations/index.ts L7-10 reads `process.env.CODEX_HOME` directly
- PlatformAdapter exists in @laitszkin/tool-utils with homeDir() and resolveCommand()

## Input
Read `packages/tools/extract-conversations/index.ts` — L1-30
Read `packages/tool-utils/platform-adapter.ts` — homeDir() method

## What to do
1. Import `createPlatformAdapter` from `@laitszkin/tool-utils` at the top of the file
2. Replace the direct `process.env.CODEX_HOME` read with:
   ```typescript
   import { createPlatformAdapter } from '@laitszkin/tool-utils';
   
   // ... in the initialization:
   const adapter = createPlatformAdapter();
   const codexHome = process.env.CODEX_HOME || path.join(adapter.homeDir(), '.codex');
   ```
3. Keep the env var priority for CODEX_HOME (it's specific to this tool's domain) but use the adapter for the fallback

## Scope
- Allowed files:
  - `packages/tools/extract-conversations/index.ts`
- Forbidden files: all others

## Output
On completion, report:
- The changes made
- Test results

## Verify
- Run the relevant tests (check if extract-conversations has tests)
- Run: `node --test test/` to confirm no regressions
- Expected: All tests pass

## Boundaries
- Do not modify the PlatformAdapter interface itself
- The CODEX_HOME env var priority is intentional for this tool — preserve it
```

---

#### WORKER-F08: syncAgentsFile EOL consistency (FIX-08)

```
## Mission
Replace the hardcoded `\n` in syncAgentsFile with `os.EOL` for cross-platform consistency.

## Context
- Review dimension: Spec implementation deviation, Req 2
- sync-memory-index/index.ts L85-89 uses hardcoded `\n` for concatenation with a comment acknowledging mixed line endings

## Input
Read `packages/tools/sync-memory-index/index.ts` — L80-95

## What to do
1. Replace the hardcoded `\n` in the `syncAgentsFile` function with `EOL` from `node:os`
2. Remove the "mixed line endings on Windows" comment since it will no longer apply
3. If `os` is not already imported, add `import { EOL } from 'node:os';` at the top of the file

## Scope
- Allowed files:
  - `packages/tools/sync-memory-index/index.ts`
- Forbidden files: all others

## Output
On completion, report:
- The changes made
- Test results

## Verify
- Run relevant tests (search for sync-memory-index test files)
- Run: `node --test test/` to confirm no regressions
- Expected: All tests pass

## Boundaries
- Do not change the logic of syncAgentsFile — only the EOL character
```

---

#### WORKER-F10: HELP_SKIP cleanup (FIX-10)

```
## Mission
Remove render-error-book and render-katex from the HELP_SKIP exclusion set since they now use createToolRunner.

## Context
- Review dimension: Spec implementation omission, Req 1
- schema-conversion-smoke.test.js L40-42 excludes 3 tools from --help validation
- Both render-error-book and render-katex now use createToolRunner

## Input
Read `test/tools/schema-conversion-smoke.test.js` — L30-50

## What to do
1. Remove `'render-error-book'` and `'render-katex'` from the HELP_SKIP Set
2. Update the comment to reflect that only architecture remains as a legitimate exclusion

## Scope
- Allowed files:
  - `test/tools/schema-conversion-smoke.test.js`
- Forbidden files: all others

## Output
On completion, report:
- The tools removed from HELP_SKIP
- Test results

## Verify
- Run: `node --test test/tools/schema-conversion-smoke.test.js`
- Expected: The test now validates --help for render-error-book and render-katex, and all pass
```

---

#### WORKER-F11: EPERM warning EOL (FIX-11)

```
## Mission
Replace hardcoded `\n` with platform EOL in the EPERM fallback warning message.

## Context
- Review dimension: Architecture defect, Req 2
- installer.ts L369 uses hardcoded `\n` while the same function uses adapter.symlinkType()

## Input
Read `packages/cli/installer.ts` — L360-375

## What to do
1. Replace the hardcoded `\n` in the warning message with `\n` — actually, since the adapter is already imported (check for `platformAdapter` or `createPlatformAdapter`), switch to using `platformAdapter.EOL` for consistency. If the adapter is not available in that scope, use `os.EOL`.

## Scope
- Allowed files:
  - `packages/cli/installer.ts`
- Forbidden files: all others

## Output
On completion, report:
- The change made
- Test results

## Verify
- Run: `node --test test/installer.test.js`
- Expected: All tests pass
```

---

#### WORKER-F12+F16: Documentation stale comment fixes (FIX-12, FIX-16)

```
## Mission
Update 2 stale documentation comments in different files.

## Context
- FIX-12: formatAppError JSDoc in app-error.ts L77-81 omits ToolNotFoundError
- FIX-16: CI workflow comment in test.yml L23-24 references wrong thresholds, enforcement, and Node version

## Input
Read:
- `packages/tool-utils/app-error.ts` — L70-100
- `.github/workflows/test.yml` — L20-30

## What to do
### Fix 12 — app-error.ts JSDoc
Update the JSDoc comment (L77-81) to include ToolNotFoundError. The current text documents UserInputError, SystemError, AppError (generic), and Other. Add a line for ToolNotFoundError (formatted like UserInputError: message only, no prefix):
```
 * - <code>ToolNotFoundError</code> — bare message (same as UserInputError)
```

### Fix 16 — test.yml comment
Replace the stale comment at L23-24:
```
# Coverage thresholds enforced via run_coverage_group in scripts/test.sh.
# Group 1 (test/): 75/60/65, Group 2 (packages/): 65/60/65, Combined: >= 80%.
# Node 22+ with --experimental-test-coverage.
```

## Scope
- Allowed files:
  - `packages/tool-utils/app-error.ts`
  - `.github/workflows/test.yml`
- Forbidden files: all others

## Output
On completion, report:
- Both changes made
- Verification that build/tests pass

## Verify
- Run: `node --test test/` to confirm no regressions
- Expected: All tests pass
```

---

#### WORKER-F14+15: DESIGN.md coverage threshold documentation (FIX-14, FIX-15)

```
## Mission
Update DESIGN.md to accurately reflect the two-tier coverage threshold structure and correct the branch threshold from 65 to 60.

## Context
- FIX-14: Branch threshold mismatch (DESIGN.md says 65, test.sh enforces 60)
- FIX-15: Threshold structure oversimplified (no two-tier documentation)

## Input
Read `docs/plans/2026-06-04/cli-refactor/DESIGN.md` — all sections mentioning "75/65/65" or threshold values

## What to do
Update all 6 references to per-process thresholds:

1. Change `75/65/65` to the actual two-tier values:
   - Group 1 (test/): `75/60/65` (lines/branches/functions)
   - Group 2 (packages/): `65/60/65` (lines/branches/functions)

2. Add a note explaining the two-tier rationale:
   "Two-tier per-group thresholds: Group 1 (test/ first-party tests) at 75/60/65. Group 2 (package tests, including third-party integrations) at 65/60/65. The lower line threshold for Group 2 reflects the split-process limitation where each group runs a subset of the total test suite."

3. Ensure the "Combined coverage across CI matrix exceeds ≥ 80%" statement is preserved and references "Groups 1+2 combined."

## Scope
- Allowed files:
  - `docs/plans/2026-06-04/cli-refactor/DESIGN.md`
- Forbidden files: all others

## Output
On completion, report:
- All sections modified
- Before/after for each threshold reference

## Verify
- Read the file to confirm all thresholds are accurate
- No test needed — documentation only
```

---

#### WORKER-F17: Windows glob warning update (FIX-17)

```
## Mission
Update the Windows glob warning in scripts/test.sh L19-21 to accurately reflect that CI uses bash shell which handles forward slashes correctly.

## Context
- Review dimension: Spec implementation omission, Req 4
- Current warning: says forward-slash globs "will not expand correctly on Windows"
- Reality: CI uses shell: bash (Git Bash) which handles forward slides; the glob is also a Node.js --test argument, not a shell glob

## Input
Read `scripts/test.sh` — L15-25

## What to do
Replace the current warning comment with:
```
# Note on Windows: The test/**/*.test.js glob uses forward slashes.
# In CI (shell: bash) this works correctly via Git Bash.
# For direct cmd.exe/PowerShell invocation, use backslash globs instead.
```

## Scope
- Allowed files:
  - `scripts/test.sh` — comment only
- Forbidden files: all others

## Output
On completion, report:
- The exact comment change
- File location

## Verify
- No test needed — the change is a comment update only

## Boundaries
- Do not change any execution logic in test.sh
```

---

#### WORKER-F18: Eval scope boundary leak (FIX-18)

```
## Mission
Exclude eval test files from Group 2 coverage measurement in scripts/test.sh to match the refactoring scope boundary.

## Context
- Review dimension: Spec implementation omission, Req 4
- SPEC.md L28 excludes eval from refactoring scope
- scripts/test.sh L128 includes eval test files in the package test discovery pattern

## Input
Read `scripts/test.sh` — L125-145 (Group 2 test discovery and execution)

## What to do
1. Extend the `grep -v -E` exclusion pattern at L128 to also exclude eval test files
2. The current exclusion is: `grep -v -E '(cmd-init|cmd-list-apis|cmd-survey)'`
3. Change to: `grep -v -E '(cmd-init|cmd-list-apis|cmd-survey|eval)'`
4. This will exclude all path names containing "eval" from the test file list

## Scope
- Allowed files:
  - `scripts/test.sh`
- Forbidden files: all others

## Output
On completion, report:
- The exact change made
- Verification that eval tests are no longer in Group 2

## Verify
- Run: `bash scripts/test.sh`
- Expected: The test suite still passes. Eval tests excluded from coverage group
```

---

#### WORKER-F19+F20: Dead code removal (FIX-19, FIX-20)

```
## Mission
Remove dead code in 2 files: unused parseArgs from enforce-video-aspect-ratio (FIX-19) and unused stderr bindings from architecture (FIX-20).

## Context
- FIX-19: ~75 lines of unused code (parseArgs function L21-95, AspectArgs interface L7-19)
- FIX-20: Unused stderr declarations in handleApply (L149) and handleTemplate (L482)

## Input
Read:
- `packages/tools/enforce-video-aspect-ratio/index.ts` — L1-100 and L370-385
- `packages/tools/architecture/index.ts` — L145-155 and L478-488

## What to do
### Fix 19 — enforce-video-aspect-ratio
1. Remove the `AspectArgs` interface (L7-19)
2. Remove the `parseArgs` function (L21-95)
3. Remove the unused `AspectArgs` type in the `help` field if referenced
4. Do NOT remove the `schema` definition or the `createToolRunner(schema)` handler

### Fix 20 — architecture
1. In `handleApply` (around L149), remove the line `const stderr = context.stderr || process.stderr;`
2. In `handleTemplate` (around L482), remove the line `const stderr = context.stderr || process.stderr;`

## Scope
- Allowed files:
  - `packages/tools/enforce-video-aspect-ratio/index.ts`
  - `packages/tools/architecture/index.ts`
- Forbidden files: all others. Especially do not modify architecture's logic

## Output
On completion, report:
- Files modified and exact lines removed
- Test results

## Verify
- Run tests for both tools
- Run: `node --test test/` to confirm no regressions
- Expected: All tests pass
```

---

### Regression Test Worker Prompts

#### REGTEST-01: Error cause chain preservation (FIX-01)

```
## Mission
Create a regression test that verifies error re-wrapping preserves the original error's cause chain.

## Context
- Fix summary: FIX-01 adds { cause: err } to 4 re-wrap sites in filter-logs and codegraph
- Root cause: SystemError/UserInputError constructors received only .message without the ErrorOptions { cause } parameter
- Fix files: filter-logs/index.ts, codegraph/index.ts

## Input
- Read fix-related files: `packages/tools/filter-logs/index.ts`, `packages/tools/codegraph/index.ts`
- Read existing test files as format reference: existing filter-logs test, codegraph test

## What to do
Create regression tests that verify error cause preservation:

### Test 1 — filter-logs: timezone error cause
Add to the existing filter-logs test file (or create test/tools/filter-logs-causes.test.js):
- GIVEN an invalid timezone string that triggers the buildTimezone throw
- WHEN filter-logs handler runs with `--assume-timezone=Invalid/Zone`
- THEN the resulting UserInputError has `.cause` property equal to the original error

### Test 2 — filter-logs: timestamp parsing error cause
- GIVEN an invalid timestamp that causes parseCliTimestamp to throw
- WHEN filter-logs runs with `--start=not-a-timestamp`
- THEN the resulting UserInputError has `.cause` property

### Test 3 — codegraph: unknown error cause
- GIVEN a scenario where codegraph throws a non-AppError (e.g., TypeError)
- WHEN the catch block at L135-138 handles it
- THEN the resulting SystemError has `.cause` property

Oracle: Each test must fail before FIX-01 is applied (cause is undefined) and pass after (cause is the original error).

## Scope
- Allowed files:
  - `test/tools/filter-logs-causes.test.js` (new file)
  - `test/tools/codegraph-causes.test.js` (new file)
- Forbidden files: all non-test source files

## Output
On completion, report:
- Test file paths and test function names
- Test execution results (must pass)

## Verify
- Run: `node --test test/tools/filter-logs-causes.test.js`
- Run: `node --test test/tools/codegraph-causes.test.js`
- Expected: Both pass
```

---

#### REGTEST-02: if-else chain refactoring verification (FIX-02)

```
## Mission
Create a regression test that verifies the dispatch table refactoring maintains backward compatibility and supports independent command addition.

## Context
- Fix summary: FIX-02 adds toParsedArguments() to CommandParser interface, replaces if-else chain with dispatch loop
- Root cause: Adding a command required 3 locations (parser class, Map.set(), if-else branch)
- Fix files: cli/parsers/types.ts, install-parser.ts, uninstall-parser.ts, tool-parser.ts, cli/index.ts

## Input
- Read fix-related files: all parser files
- Read existing test files: test/cli/dispatch-table.test.js, test/cli/install-args-parser.test.js

## What to do
Add tests to the existing dispatch-table.test.js (or create a new test file):

### Test 1 — All existing command types still dispatch correctly
- GIVEN the existing parseArguments scenarios (--help, install --help, uninstall --help, tools, tool-name)
- WHEN parseArguments is called with each scenario
- THEN the returned ParsedArguments match the expected command, helpTopic, and showHelp values
- This validates backward compatibility — all existing behavior must be preserved

### Test 2 (architectural) — Mock command can be added with 2 locations
- GIVEN a mock command parser implementing CommandParser with toParsedArguments
- WHEN the mock parser is added to commandParsers Map
- THEN parseArguments correctly routes the new command without modifying parseArguments itself

Oracle: Test 1 must pass (backward compat). Test 2 verifies the architectural improvement (2 vs 3 locations).

## Scope
- Allowed files:
  - `test/cli/dispatch-table.test.js` — add new tests
- Forbidden files: all non-test source files

## Output
On completion, report:
- Test descriptions and locations
- Test execution results (must pass)

## Verify
- Run: `node --test test/cli/dispatch-table.test.js`
- Run: `node --test test/cli/install-args-parser.test.js test/cli/uninstall-args-parser.test.js test/cli/tool-args-parser.test.js`
- Expected: All tests pass
```

---

#### REGTEST-03: Combined coverage label verification (FIX-03)

```
## Mission
Create a test that verifies the combined coverage output explicitly labels Groups 1+2 exclusion.

## Context
- Fix summary: FIX-03 updates combined coverage output to show "G1+G2" notation
- Root cause: Group 3 permanently excluded due to mock.module incompatibility
- Fix files: scripts/test.sh

## Input
- Read `scripts/test.sh` — combined coverage section (L156-170)

## What to do
This is a verification-only test. Since running COVERAGE=true is expensive, make this a targeted test:

Add a test that runs `bash scripts/test.sh` with COVERAGE=true and grep for the combined coverage output label:
- GIVEN COVERAGE=true environment
- WHEN scripts/test.sh runs
- THEN the combined coverage output contains "Combined coverage (G1+G2)" or similar G1+G2 notation

Oracle: The test passes when the output contains the G1+G2 notation.

Alternatively, write a unit test that validates the coverage formula using synthetic data (matching the existing pattern at test/coverage-enforcement.test.js).

## Scope
- Allowed files:
  - `test/coverage-enforcement.test.js` — add test case
- Forbidden files: all non-test source files

## Output
On completion, report:
- Test location and implementation
- Test execution result

## Verify
- Run: `node --test test/coverage-enforcement.test.js`
- Expected: Passes
```

---

#### REGTEST-04: Dispatch bypass removal verification (FIX-04)

```
## Mission
Create a regression test that verifies tool name routing goes through the dispatch table, not a bypass.

## Context
- Fix summary: FIX-04 removes the isKnownToolName() bypass path, routing all tool names through the dispatch table's 'tool' entry
- Root cause: Direct tool names bypassed the commandParsers Map
- Fix files: cli/index.ts

## Input
- Read `packages/cli/index.ts` — updated parseArguments
- Read `test/cli/dispatch-table.test.js` — existing dispatch tests

## What to do
The existing tests (dispatch-table.test.js L40-44: "direct tool name" test) already verify that tool name routing works. The fix doesn't change the output — it changes the routing path.

Add a test that verifies:
- GIVEN a known tool name (e.g., 'filter-logs')
- WHEN parseArguments is called with that name
- THEN the command is 'tool' and toolName is 'filter-logs'
- Verify this works for multiple known tool names

Add a negative test:
- GIVEN an unknown tool name
- WHEN parseArguments is called
- THEN it does NOT route as a 'tool' command

Oracle: All tool routing returns expected command/toolName. Unknown names fall through to install.

## Scope
- Allowed files:
  - `test/cli/dispatch-table.test.js`
  - `test/tool-runner.test.js` (if needed for integration testing)
- Forbidden files: all non-test source files

## Output
On completion, report:
- Test descriptions and locations
- Test execution results (must pass)

## Verify
- Run: `node --test test/cli/dispatch-table.test.js`
- Run: `node --test test/tool-runner.test.js`
- Expected: All tests pass
```

---

#### REGTEST-05: PlatformAdapter CODEX_HOME verification (FIX-07)

```
## Mission
Create a regression test that verifies extract-conversations uses PlatformAdapter for home directory resolution.

## Context
- Fix summary: FIX-07 replaces direct process.env.CODEX_HOME read with adapter-based pattern
- Root cause: extract-conversations bypassed PlatformAdapter for env var resolution
- Fix files: extract-conversations/index.ts

## Input
- Read `packages/tools/extract-conversations/index.ts` — the updated CODEX_HOME resolution
- Read `packages/tool-utils/platform-adapter.ts` — homeDir() method

## What to do
The existing platform-adapter tests (test/utils/platform-adapter.test.js) already cover homeDir(). The fix is about extract-conversations using the adapter.

Write a test that verifies:
- GIVEN extract-conversations runs
- WHEN it needs to resolve the codex home directory
- THEN it checks process.env.CODEX_HOME first (env var priority preserved)
- AND falls back to adapter.homeDir()

Oracle: The test verifies that the adapter fallback works when CODEX_HOME is unset.

## Scope
- Allowed files:
  - `test/tools/extract-conversations.test.js` (create if not exists, add to existing)
- Forbidden files: all non-test source files

## Output
On completion, report:
- Test file and test function name
- Execution result (must pass)

## Verify
- Run: `node --test test/tools/extract-conversations.test.js` (if file exists)
- Or run the tests that exist for this tool
- Expected: Passes
```

---

#### REGTEST-06: HELP_SKIP cleanup auto-verification (FIX-10)

```
## Mission
No separate regression test worker needed — the existing schema-conversion-smoke.test.js will automatically validate that render-error-book and render-katex now pass --help validation because they were removed from HELP_SKIP.

Reference the existing test as the regression test:
- Test: test/tools/schema-conversion-smoke.test.js
- The --help validation runs on all tools not in HELP_SKIP
- After removing render-error-book and render-katex from HELP_SKIP, the test will exercise them
- Oracle: The test passes (the tools implement createToolRunner which auto-generates --help)

Verification: Run `node --test test/tools/schema-conversion-smoke.test.js`
```

---

#### REGTEST-07: Eval exclusion verification (FIX-18)

```
## Mission
Create a test that verifies eval test files are excluded from Group 2 coverage measurement.

## Context
- Fix summary: FIX-18 adds eval to the grep -v exclusion pattern in scripts/test.sh
- Root cause: eval test files included in coverage despite being out of scope
- Fix files: scripts/test.sh

## Input
- Read `scripts/test.sh` — the test file discovery pattern

## What to do
Create a test that verifies:
- GIVEN the find + grep exclusion pattern in scripts/test.sh
- WHEN the pattern is applied to list test files
- THEN no path containing "eval" appears in the output

Oracle: The pattern excludes eval files. If eval tests exist, they're excluded from the coverage run.

## Scope
- Allowed files:
  - `test/coverage-enforcement.test.js` — add test case
- Forbidden files: all non-test source files

## Output
On completion, report:
- Test location and implementation
- Execution result (must pass)

## Verify
- Run: `node --test test/coverage-enforcement.test.js`
- Expected: Passes
```

---

#### REGTEST-08: Dead code removal verification (FIX-19, FIX-20)

```
## Mission
Verify that removing dead code in enforce-video-aspect-ratio and architecture does not break existing functionality.

## Context
- FIX-19: Removed unused parseArgs from enforce-video-aspect-ratio
- FIX-20: Removed unused stderr bindings from architecture
- Both are dead code removals — the existing tests should verify correct behavior

## What to do
No separate regression test needed. The existing test suite is the regression test:
1. Run the existing tests for both tools
2. Verify they pass

Verification commands:
- `node --test test/tools/` (test all tools)
- `node --test test/` (full test suite)
```

---

## 7. Fix Batch Schedule

### Batch 1 — Documentation Fixes (parallel, independent files)

- **Issues**: WORKER-F12+F16 (stale comments), WORKER-F14+15 (DESIGN.md thresholds), WORKER-F17 (glob warning), WORKER-F06 (eval notice)
- **Strategy**: Dispatch 4 workers in parallel — all touch different files
- **Depends on**: Nothing
- **Gate**:
  - [ ] All 4 workers report success
  - [ ] Run verification: `node --test test/`

---

### Batch 2 — Independent Code Fixes (parallel, unique files)

- **Issues**: WORKER-F01 (cause chain), WORKER-F07 (PlatformAdapter), WORKER-F08 (EOL), WORKER-F10 (HELP_SKIP), WORKER-F11 (EPERM \n), WORKER-F19+F20 (dead code)
- **Strategy**: Dispatch 6 workers in parallel — ALL touch different files with ZERO overlap
- **Depends on**: Batch 1
- **Gate**:
  - [ ] All 6 workers report success
  - [ ] Run verification: `node --test test/`

---

### Batch 3 — Sequential Code Fixes (shared files, ordered)

#### Sub-batch 3a: scripts/test.sh doc fixes
- **Issue**: WORKER-F17 (already in Batch 1 since it's just a comment)

Actually, let me reorganize. FIX-17 is just a comment in test.sh. FIX-03 is a documentation+output change. FIX-18 is a logic change (exclusion pattern). Let me reorder:

#### Sub-batch 3a: scripts/test.sh — Coverage documentation (FIX-03)
- **Issue**: WORKER-F03
- **Strategy**: Single worker
- **Gate**: [ ] WORKER-F03 reports success

#### Sub-batch 3b: scripts/test.sh — Eval exclusion (FIX-18)
- **Issue**: WORKER-F18
- **Strategy**: Single worker (must run after FIX-03 because both modify scripts/test.sh)
- **Depends on**: Sub-batch 3a
- **Gate**: [ ] WORKER-F18 reports success

#### Sub-batch 3c: test/tool-runner.test.js — Redundant tests + stale comments (FIX-05, FIX-13)
- **Issue**: WORKER-F05+F13
- **Strategy**: Single worker
- **Gate**: [ ] WORKER-F05+F13 reports success

---

### Batch 4 — CLI Dispatch Refactoring (sequential, shared file)

#### Sub-batch 4a: cli/index.ts — Dispatch bypass removal + collision comment (FIX-04, FIX-09)
- **Issue**: WORKER-F04+F09
- **Strategy**: Single worker
- **Depends on**: Batch 3
- **Gate**:
  - [ ] WORKER-F04+F09 reports success
  - [ ] Run: `node --test test/cli/dispatch-table.test.js`

#### Sub-batch 4b: cli/index.ts + parsers — if-else chain refactor (FIX-02)
- **Issue**: WORKER-F02
- **Strategy**: Single worker (complex, cross-file)
- **Depends on**: Sub-batch 4a (both modify cli/index.ts)
- **Gate**:
  - [ ] WORKER-F02 reports success
  - [ ] Run: `node --test test/cli/dispatch-table.test.js`
  - [ ] Run: `node --test test/cli/install-args-parser.test.js test/cli/uninstall-args-parser.test.js test/cli/tool-args-parser.test.js`
  - [ ] Run: `node --test test/tool-runner.test.js`

---

### Batch 5 — Regression Test Implementation

- **Issues**: REGTEST-01, REGTEST-02, REGTEST-03, REGTEST-04, REGTEST-05, REGTEST-06 (existing test), REGTEST-07, REGTEST-08 (existing test suite)
- **Strategy**: Parallel for REGTEST-01, 02, 03, 04, 05, 07 (unique files). REGTEST-06 and REGTEST-08 use existing tests.
- **Depends on**: All fix batches completed
- **Gate**:
  - [ ] All REGTEST workers report success
  - [ ] All new regression tests pass: `node --test test/tools/filter-logs-causes.test.js test/tools/codegraph-causes.test.js test/coverage-enforcement.test.js`
  - [ ] All existing tests pass: `node --test test/`
  - [ ] EXISTING_TEST=SELF-CHECK: Confirm that each REGTEST oracle would fail on unfixed code

---

### Batch 6 — Final Verification

- **Tasks**: Full test suite, confirm all 20 issues resolved
- **Strategy**: Coordinator handles directly
- **Depends on**: Batch 5
- **Gate**:
  - [ ] Full test suite passes: `node --test test/`
  - [ ] Every issue in REPORT.md confirmed resolved
  - [ ] Cross-check the 20 FIX items against REPORT.md finding list

---

## 8. Regression Test Inventory

- REGTEST-01 → FIX-01: [Unit] `test/tools/filter-logs-causes.test.js` (new) + `test/tools/codegraph-causes.test.js` (new) — verify error cause chain preserved
- REGTEST-02 → FIX-02: [Unit] `test/cli/dispatch-table.test.js` (add tests) — verify backward compat + architectural improvement
- REGTEST-03 → FIX-03: [Unit] `test/coverage-enforcement.test.js` (add test) — verify combined coverage label
- REGTEST-04 → FIX-04: [Unit] `test/cli/dispatch-table.test.js` (add tests) — tool routing through dispatch table
- REGTEST-05 → FIX-07: [Unit] `test/tools/extract-conversations.test.js` (new/add) — adapter-based CODEX_HOME resolution
- REGTEST-06 → FIX-10: [Unit] Existing `test/tools/schema-conversion-smoke.test.js` — auto-validates HELP_SKIP cleanup
- REGTEST-07 → FIX-18: [Unit] `test/coverage-enforcement.test.js` (add test) — eval exclusion from coverage
- REGTEST-08 → FIX-19, FIX-20: [Integration] Existing `node --test test/` — dead code removal verified by passing suite

---

## 9. Verification Checkpoints

### Checkpoint 1 — After Batch 1 (documentation)
- Run: `node --test test/`
- Expected: All existing tests pass

### Checkpoint 2 — After Batch 2 (independent code fixes)
- Run: `node --test test/`
- Expected: All tests pass, no regressions

### Checkpoint 3 — After Batch 3 (shared file sequential fixes)
- Run: `bash scripts/test.sh`
- Expected: Test suite passes on both groups

### Checkpoint 4 — After Batch 4 (CLI dispatch refactoring)
- Run: `node --test test/cli/dispatch-table.test.js test/cli/install-args-parser.test.js test/cli/uninstall-args-parser.test.js test/cli/tool-args-parser.test.js test/tool-runner.test.js`
- Expected: All dispatch-related tests pass

### Checkpoint 5 — After regression tests implemented
- Run: `node --test test/tools/filter-logs-causes.test.js test/tools/codegraph-causes.test.js test/coverage-enforcement.test.js`
- Expected: All new regression tests pass
- Logical check: Each REGTEST oracle must be "fails on unfixed code, passes after fix"

### Checkpoint 6 — Final verification
- Run full test suite: `node --test test/`
- Confirm lint passes: `npx tsc --noEmit` (or project lint command)
- Cross-check REPORT.md: every issue resolved

---

## 10. Error Recovery

- **If a fix worker fails**: Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry.
- **If a fix worker fails twice**: Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user.
- **If a regression test worker reports failure (test cannot pass)**: Check whether the test code is wrong or the fix is incomplete. If the test code is wrong, continue the worker to fix it. If the fix is incomplete, go back to the corresponding fix worker.
- **If a regression test passes on the unfixed code**: The test design is invalid — redesign the oracle and dispatch a new worker.
- **If merge conflicts occur**: The coordinator resolves the conflict, then re-runs the batch gate verification.
- **If a fix or regression test breaks existing tests**: Pause. Report which test failed and which worker's change caused it.

---

## 11. Fix History

<!--
### Round 16 — 2026-06-06
- **Issues fixed**: 29 total (5 P1 + 12 P2 + 12 P3) via W1–W19 workers
- **Outcome**: 26 resolved. 3 partially resolved (carried to Round 17): FIX-10 renderSection default (P3-18), FIX-13 storyboard prefix (P3-19), FIX-01 cause chain partial (P3-22)
- **Key notes**: W4 EPERM fallback was initially reverted then re-applied. W19 fixed open-github-issue cause preservation but missed filter-logs/codegraph sites.
-->

---

## 12. Boundaries

### ALWAYS

- Run gate verification immediately after every batch
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them. This is coordination, not implementation.
- **For FIX-02 (Complex)**: ensure the worker performs systematic debugging (reading related code, tracing execution paths) before applying the fix. Do not let the worker guess the fix.

### ASK FIRST — pause and confirm with the user

- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- If FIX-02 refactoring proves too complex — the if-else chain has been accepted as FIX-16 for 3 rounds, and a simpler alternative may be preferred

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- **Defer any REPORT.md issue to a future round** — every issue has a complete fix plan in this FIX.md
