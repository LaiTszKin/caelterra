# Fix Coordinator Prompt: CLI 工具全面重構 — Round 14

- **Date**: 2026-06-06
- **Source REPORT**: `docs/plans/2026-06-04/cli-refactor/REPORT.md` (Round 14)
- **Source Spec**: `docs/plans/2026-06-04/cli-refactor/`
- **Total Issues**: P1: 3, P2: 5, P3: 4
- **Total Regression Tests**: 5

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- **Create an isolated branch for each worker before dispatching** (e.g., `fix/worker-1-read-github-issue`, `fix/worker-2-coverage-ci`). Every worker gets its own branch — never dispatch two workers to the same branch.
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in Section 6) — **each worker commits their changes on their isolated branch**
- After all fixes pass verification, spawn workers to implement regression tests
- **After each batch completes**: merge every worker's isolated branch back to main (handle conflicts), **confirm all changes from all subagents have been implemented in the merged result**, then **clean up all agent branches** — do not leave any `fix/worker-*` or `fix/regtest-*` branches behind
- Wait for all workers in a batch to complete, then digest their results
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
- **Leave agent branches behind after merging** — always clean them up after each batch
- **Merge without verifying all changes are implemented** — always confirm every committed change is present in the merged result

---

## 2. Mission

修復 CLI refactoring Round 14 審查中發現的 12 項問題（3 P1 + 5 P2 + 4 P3）。核心目標依優先級：

1. **P1 read-github-issue createToolRunner 遷移不完整** — schema 只有 `help`，`--repo`、`--json`、`--comments` 三個旗標被 `strict: true` 的 `parseArgs` 攔截，handler 內部的 `parseArgs()` 永遠收不到這些旗標。這是 Round 12 修復 (52a42a6) 引入的迴歸
2. **P1 涵蓋率門檻 65% vs SPEC 80%** — 持續存在的差距，已在多個 round 中標記。需增加合併涵蓋率估算與更明確的說明文件
3. **P2/P3 清理** — sync-memory-index 多餘的巢狀 catch、review-threads cmdResolve 使用 stderr.write+return1 而非擲出 UserInputError、EOL 未消費、分派表格文件化、CI 腳本強化

共 **5 個 Fix Workers** + **5 個 Regression Test Workers**。分散在 **4 個批次**中。

**Success looks like**: All 12 issues in REPORT.md resolved, read-github-issue --repo/--json/--comments work correctly, all regression tests pass, full test suite passes, no regressions.

---

## 3. Issue Inventory

- FIX-01 (P1, 中等, 規格偏離): read-github-issue 恢復完整 createToolRunner schema + 移除內部 parseArgs — `packages/tools/read-github-issue/index.ts`
- FIX-02 (P1, 簡單, 規格遺漏): 涵蓋率門檻差距 65% vs 80% SPEC — 增加合併涵蓋率估算、新增 Windows 相容性防護、強化 grep 格式相依 — `scripts/test.sh`
- FIX-03 (P2, 簡單, 冗餘代碼): sync-memory-index 移除多餘巢狀 catch + 使用 adapter.EOL — `packages/tools/sync-memory-index/index.ts`, `packages/tool-utils/platform-adapter.ts`
- FIX-04 (P2, 簡單, 規格偏離): review-threads cmdResolve 轉換 stderr.write+return1 為擲出 UserInputError — `packages/tools/review-threads/index.ts`
- FIX-05 (P2, 簡單, 文件): 分派表格 Map + if-else chain 限制文件化 + FIX-16 註解更新 — `packages/cli/index.ts`
- REGTEST-01 → FIX-01: 驗證 --repo 旗標可正常傳遞
- REGTEST-02 → FIX-01: 驗證 --json 旗標可正常傳遞
- REGTEST-03 → FIX-01: 驗證 --comments 旗標可正常傳遞
- REGTEST-04 → FIX-03: 驗證 sync-memory-index 錯誤傳播（移除巢狀 catch 後格式仍正確）
- REGTEST-05 → FIX-04: 驗證 review-threads cmdResolve 擲出 UserInputError

---

## 4. Fix Dependency Analysis

### Dependencies

- FIX-01 stands alone. FIX-02 stands alone. FIX-03, FIX-04, FIX-05 all stand alone.
- All REGTESTs depend on their corresponding FIX completing first.

### File overlaps

| Worker | Files Modified | Overlaps With |
|---|---|---|
| W1 (FIX-01) | `packages/tools/read-github-issue/index.ts` | None (isolated) |
| W2 (FIX-02) | `scripts/test.sh` | None (isolated) |
| W3 (FIX-03) | `packages/tools/sync-memory-index/index.ts`, `packages/tool-utils/platform-adapter.ts` | None |
| W4 (FIX-04) | `packages/tools/review-threads/index.ts` | None |
| W5 (FIX-05) | `packages/cli/index.ts` | None |

**Zero file overlap between any workers** → all 5 fix workers can run in **full parallel**.

### Parallelism strategy

| Batch | Workers | File Overlap | Strategy |
|---|---|---|---|
| **Batch 1 — All Fixes** | W1, W2, W3, W4, W5 | No overlap | **Full parallel** — each worker on its own isolated branch |
| **Batch 2 — Regression Tests** | REGTEST-01~05 | REGTEST-01/02/03 all modify `test/tools/handler-error-propagation.test.js` | **Sequential sub-batches** (same file) |
| **Batch 3 — Final Verification** | Coordinator | Self-contained | **Sequential** |

---

## 5. Fix Details (with Regression Test Design)

### FIX-01: read-github-issue — Restore complete createToolRunner schema (P1-1, P1-3, P3-9)

**Root cause**: The Round 12 fix (52a42a6) changed the createToolRunner wrapping from a complete schema (with `--repo`, `--json`, `--comments` declared) to a minimal schema with only `help`. With `strict: true` (default), `node:util.parseArgs` rejects all undeclared flags. The original FIX-02b wrapping (0ca38ea) properly declared all options. The handler's internal `parseArgs()` receives only `positionals` (which is the function argument `argv`), so `--repo`/`--json`/`--comments` never reach it.

**Files involved**: `packages/tools/read-github-issue/index.ts`

**Fix approach**:
1. Declare all 3 options in the schema: `--repo` (string), `--json` (boolean), `--comments` (boolean)
2. Change `readGitHubIssueHandler` signature from `(argv: string[], context)` to `(args: ReadIssueArgs, context)` — no test code calls this function directly
3. Move flag extraction from the internal `parseArgs()` into the createToolRunner handler callback, using `values.*` for flags and `positionals[0]` for the issue number
4. Remove the internal `parseArgs()` function entirely (resolves P3-9 dead code)
5. Add a JSDoc comment above the handler documenting the migration approach (resolves P1-3 missing docs)

**Complexity**: Medium — requires restructuring handler signature and schema

**Regression test**:
- REGTEST-01: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN `read-github-issue` with `['--repo', 'owner/repo', '42']` WHEN handler called THEN args.repo === 'owner/repo', no ERR_PARSE_ARGS_UNKNOWN_OPTION
- REGTEST-02: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN `read-github-issue` with `['--json', '42']` WHEN handler called THEN args.json === true
- REGTEST-03: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN `read-github-issue` with `['--comments', '42']` WHEN handler called THEN args.comments === true

---

### FIX-02: Coverage + CI script hardening (P1-2, P2-7, P3-10, P3-11, P3-12)

**Root cause**: The SPEC requires 80% line coverage but the split-process approach means each group has its own threshold. Group 1 achieves 77.48%, Group 2 achieves 69.29%. Combined coverage is estimated at ~80% but is not verified. Additionally: Group 3 tests run without coverage tracking; the `--test-coverage-exclude` Windows glob may not match; the post-hoc grep depends on Node.js internal error message format; `mktemp` requires Git Bash on Windows.

**Files involved**: `scripts/test.sh`

**Fix approach**:
1. Keep current thresholds (65/60/65) — they are the maximum sustainable across both groups given current coverage levels
2. Add a `combined-coverage` diagnostic step that estimates approximate combined coverage by running a single-process coverage scan on test/ + selected package test files (excluding Group 3 mock tests and eval exclusion)
3. Add a grep pattern sanity check: after grep for "does not meet threshold", verify at least one match was found (or handle zero matches explicitly). If no coverage lines exist at all, output a warning
4. Add Node.js version-compatible temp directory handling as fallback for `mktemp` (fall back to `$TMPDIR` or `/tmp`)
5. Document Windows glob risk with a note pointing to the Node.js coverage glob documentation
6. Add a comment noting Group 3's coverage blind spot

**Complexity**: Simple — config changes + documentation improvements

**Regression test**: REGTEST-04 ([Integration] `COVERAGE=true bash scripts/test.sh`) — verify script exits 0, verify combined coverage estimate line appears in output

---

### FIX-03: sync-memory-index — Remove redundant nested catch + consume adapter.EOL (P2-4, P2-5)

**Root cause**:
- P2-5: The createToolRunner-wrapped handler has an inner try/catch (L107-129) that catches all errors, calls `formatAppError(stderr, err)`, and returns 1. The createToolRunner outer catch (schema.ts:101-104) also calls `formatAppError` and returns 1. The inner catch is redundant — the outer catch handles errors identically.
- P2-4: PlatformAdapter.EOL is defined but never consumed. sync-memory-index writes files using hardcoded `\n` (L60: `lines.join('\n')`) instead of adapter.EOL.

**Files involved**: `packages/tools/sync-memory-index/index.ts`, `packages/tool-utils/platform-adapter.ts`

**Fix approach**:
1. Remove the inner try/catch (L107, L126-129) from the schema's handler function. Errors will propagate to createToolRunner's outer catch which already calls `formatAppError` and returns 1. Dedent the handler body.
2. In `renderSection()` (L60), change `lines.join('\n')` to use adapter.EOL. Import `createPlatformAdapter` at the top of the file and call: `lines.join(createPlatformAdapter().EOL)` — but note that `renderSection` is a pure function and should remain testable. Better: make it accept an optional EOL parameter, defaulting to `'\n'`.
3. In `syncAgentsFile()` (L85), `writeFileSync` with `'utf8'` doesn't transform line endings — `os.EOL` matters for the content written. If `sectionText` uses `\n` (from `renderSection` with default EOL), that's what gets written. For cross-platform correctness, use `adapter.EOL` when joining lines in `renderSection`.

**Alternative simpler approach for EOL**: Pass `createPlatformAdapter().EOL` as a parameter to `renderSection` with a `\n` default. This way the function remains testable (default behavior unchanged) but can use OS-appropriate EOL when called from the handler.

**Complexity**: Medium — multiple related changes

**Regression test**: REGTEST-05 ([Unit] `test/tools/sync-memory-index-error.test.js`) — verify error propagation still works after removing inner try/catch: GIVEN handler throws error THEN outer catch formats it correctly AND returns 1

---

### FIX-04: review-threads — Convert cmdResolve stderr.write+return1 to UserInputError throw (P2-6)

**Root cause**: In `cmdResolve` (L505-509), the "no thread IDs selected" case uses `stderr!.write('Error: ...')` and returns 1 instead of throwing `UserInputError`. This bypasses `formatAppError` at the CLI boundary and uses a manual "Error: " prefix which is inconsistent with how `formatAppError` formats UserInputError (no prefix).

**Files involved**: `packages/tools/review-threads/index.ts`

**Fix approach**:
Change the error handling in `cmdResolve` from:
```ts
if (threadIds.length === 0) {
  stderr!.write(
    'Error: no thread IDs selected. Use --thread-id, --thread-id-file, or --all-unresolved.\n',
  );
  return 1;
}
```
to:
```ts
if (threadIds.length === 0) {
  throw new UserInputError(
    'no thread IDs selected. Use --thread-id, --thread-id-file, or --all-unresolved.',
  );
}
```

Ensure `UserInputError` is imported at the top of the file (add to import from `@laitszkin/tool-utils`).

**Complexity**: Simple — 4 lines replaced

**Regression test**: REGTEST-06 ([Unit] `test/tools/handler-error-propagation.test.js`) — GIVEN `review-threads` `['resolve', '--dry-run', '--repo', 'test/repo']` with no thread IDs selected WHEN handler called THEN UserInputError is thrown with message containing "no thread IDs selected"

---

### FIX-05: Dispatch table — Update FIX-16 comment with explicit 3-touch documentation (P2-8)

**Root cause**: The dispatch table uses a Map for parser selection (L70-75) plus an if-else chain (L82-146) for reshaping. Adding a new command requires: (1) create a parser class, (2) add Map.set(), (3) add if-else branch. The ordering dependency (install/uninstall before tools/tool) is implicit.

**Files involved**: `packages/cli/index.ts` (L78-81)

**Fix approach**:
Update the FIX-16 comment at L78-81 to explicitly document the 3-touch requirement and ordering constraint:
```ts
// FIX-16: The if-else chain below is intentional — each command type
// (uninstall, install, tools/tool) returns a different ParsedArguments
// shape. A handler-map refactor would need a union-to-discriminated
// mapping. Keeping explicit per-type branches is clearer for now.
//
// Adding a new command requires touching 3 locations:
// 1. Create a new parser class implementing CommandParser<T>
// 2. Add a Map.set() entry in the dispatch table above
// 3. Add a new if-else branch below to reshape the parsed result
//
// Ordering constraint: install/uninstall branches must precede
// tools/tool because the same parser reference (toolParser) serves both.
```

**Complexity**: Simple — comment-only change

**Regression test**: None (comments don't affect behavior). Manual verification: grep for the updated comment text.

---

## 6. Worker Prompt Library

### Fix Worker Prompts

#### Worker 1 (FIX-01): read-github-issue — Restore complete createToolRunner schema

```
## Mission
Fix the incomplete createToolRunner migration in read-github-issue. The schema currently only declares `help` in options, causing `--repo`, `--json`, and `--comments` to be rejected with ERR_PARSE_ARGS_UNKNOWN_OPTION. Restore the complete schema and remove the now-unnecessary internal `parseArgs` function, plus add a JSDoc comment documenting the approach.

## Context
- Review dimension: Spec implementation deviation (P1-1), Spec implementation omission (P1-3), Redundant code (P3-9)
- Spec requirements: Req 1 (Tool boilerplate), Req 3 (Unified error handling)
- Current state: Schema at L181-186 only declares `options: { help: { type: 'boolean', short: 'h' } }`. Handler calls `readGitHubIssueHandler(positionals, context)`, passing only positionals. Internal `parseArgs(argv)` at L14-45 handles `--repo`, `--json`, `--comments` but these flags never reach it.
- The original FIX-02b (0ca38ea) implemented this correctly with a full schema. The regression was introduced by Round 12 fix (52a42a6).
- File: packages/tools/read-github-issue/index.ts

## Input
- Read `packages/tools/read-github-issue/index.ts` — full file (188 lines)
- Read `packages/tools/filter-logs/index.ts` — reference for createToolRunner schema pattern

## What to do
1. **Update the schema** (L181-186): Add `--repo` (string), `--json` (boolean), `--comments` (boolean) to options:
   ```ts
   handler: createToolRunner({
     options: {
       repo: { type: 'string' as const },
       json: { type: 'boolean' as const },
       comments: { type: 'boolean' as const },
       help: { type: 'boolean' as const, short: 'h' },
     },
     allowPositionals: true,
     usage: 'apltk read-github-issue [options] <issue>',
     description: 'Read GitHub issue details through gh.',
     handler: async (values, positionals, context) => {
       const args: ReadIssueArgs = {
         issue: positionals[0] ?? null,
         repo: (values.repo as string) ?? null,
         comments: values.comments === true,
         json: values.json === true,
       };
       return readGitHubIssueHandler(args, context);
     },
   }),
   ```

2. **Change `readGitHubIssueHandler` signature** (L141): Accept `ReadIssueArgs` instead of `argv: string[]`:
   ```ts
   export async function readGitHubIssueHandler(
     args: ReadIssueArgs,
     context: ToolContext,
   ): Promise<number> {
     const { stdout, stderr } = context;
     // args.issue is now from positionals[0]
     if (!args.issue) {
       throw new UserInputError('Issue number or URL is required.');
     }
     ...
   }
   ```
   Remove the `parseArgs(argv)` call on L146 — args are now pre-parsed by createToolRunner.

3. **Remove the internal `parseArgs()` function** (L14-45 entirely). The `ReadIssueArgs` interface can stay as the type for the handler's argument.

4. **Update `buildCommand` call** (L74): It currently takes `(args: ReadIssueArgs)` — this stays the same since `args` is already `ReadIssueArgs`.

5. **Add a JSDoc comment** above `readGitHubIssueHandler`:
   ```ts
   /**
    * readGitHubIssueHandler — Wrapped in createToolRunner for schema-based
    * argument parsing. The schema (see tool export) declares --repo, --json,
    * --comments, and --help. Positional <issue> argument comes via positionals[0].
    *
    * Error handling uses UserInputError/SystemError which propagate through
    * createToolRunner's catch block to formatAppError.
    */
   ```

## Scope
- Allowed: `packages/tools/read-github-issue/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Which lines were modified (schema, handler signature, removed parseArgs)
- Confirmed: --repo, --json, --comments now pass through createToolRunner
- Build results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/handler-error-propagation.test.js test/tools/schema-conversion-smoke.test.js`
- Manual: Verify the tool can be called with flags by checking the schema-compiled output

## Boundaries
- Do NOT change error handling behavior (UserInputError/SystemError throws)
- Do NOT change any business logic in buildCommand, runGh, printSummary, joinNames
- The handler function is exported; ensure any external callers (test code) still work
- If test code calls `readGitHubIssueHandler(argv, context)` with argv array, it will break with the new signature. Check test/ directory for any callers first. If any exist, keep the old argv-based signature and create a wrapper.
```

---

#### Worker 2 (FIX-02): Coverage + CI script hardening

```
## Mission
Harden the test runner script against known fragility issues: add combined coverage estimation, add grep pattern validation, add mktemp fallback, document Windows glob risk and Group 3 coverage blind spot. Keep existing 65/60/65 thresholds.

## Context
- Review dimensions: Spec implementation omission (P1-2, P2-7), Architecture defect (P3-10, P3-11, P3-12)
- Spec requirement: Req 4 (Coverage >= 80% + CI matrix)
- Current thresholds: 65% lines, 60% branches, 65% functions — these are the maximum sustainable across both groups
- Group 3 (mock.module) runs without --experimental-test-coverage, creating a blind spot
- The --test-coverage-exclude glob uses forward slashes which may not match Windows backslash paths
- The post-hoc grep for "does not meet threshold" depends on Node.js internal message format
- mktemp is a POSIX utility not available in raw CMD/PowerShell on Windows
- File: scripts/test.sh

## Input
- Read `scripts/test.sh` — full file

## What to do
1. **Grep pattern sanity check**: After the existing grep for "does not meet threshold" (L60), add a check that validates the grep itself. If no coverage threshold lines were found at all (unexpected Node.js format change), emit a warning but do not fail:
   ```bash
   # Check that grep pattern matched at least one threshold line
   if ! grep -q "does not meet threshold" "$RUN_TEST_LOG" 2>/dev/null; then
     # Check if coverage output exists at all
     if grep -q "all files" "$RUN_TEST_LOG" 2>/dev/null; then
       echo "  (all thresholds met)"
     else
       echo "  (warning: no coverage data found — Node version may have changed output format)"
     fi
   fi
   ```

2. **mktemp fallback**: Replace the unconditional `mktemp` (L24) with a cross-platform approach:
   ```bash
   # Use TMPDIR, TEMP, or /tmp as fallback for platforms without mktemp (e.g., Windows CMD)
   RUN_TEST_LOG="${TMPDIR:-${TEMP:-/tmp}}/test-run-$$.log"
   ```
   This avoids `mktemp` entirely by using `$$` (PID) for uniqueness.

3. **Combined coverage estimate after Group 2**: Add a diagnostic step after both Group 1 and Group 2 coverage runs that parses the "all files" lines and prints an estimated combined coverage:
   ```bash
   # Estimate combined line coverage from Group 1 and Group 2 reports
   if [ "${COVERAGE:-}" = "true" ]; then
     GROUP1_LINES=$(grep "all files" "$RUN_TEST_LOG" | head -1 | awk '{print $4}')
     GROUP2_LINES=$(grep "all files" "$RUN_TEST_LOG" | tail -1 | awk '{print $4}')
     if [ -n "$GROUP1_LINES" ] && [ -n "$GROUP2_LINES" ]; then
       echo "  (combined coverage estimate: G1=$GROUP1_LINES G2=$GROUP2_LINES)"
       echo "  (SPEC requires 80% — see REPORT.md for split-process limitation)"
     fi
   fi
   ```
   Note: The exact column index for the percentage depends on `grep -E "all files"` output format. Adjust the `awk` column if needed (try `{print $5}` or `{print $4}` based on actual output).

4. **Update comments** (L14): Expand the header comment to document:
   - Group 3 blind spot (mock.module tests excluded from coverage)
   - Windows glob risk (eval exclusion glob forward-slash vs backslash on Windows)
   - The fact that combined coverage is estimated, not directly measured

5. **Keep existing thresholds** (65/60/65) — do not raise them. Current coverage (G1: 77.48%, G2: 69.29%) cannot sustain higher per-group thresholds.

## Scope
- Allowed: `scripts/test.sh`
- Forbidden: Any other file (especially no .github/workflows/test.yml changes)

## Output
On completion, report:
- All changes made to scripts/test.sh
- Test execution results with COVERAGE=true
- Combined coverage estimate values

## Verify
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: All test groups pass, combined coverage estimate printed, exit code 0
- Run: `bash scripts/test.sh` (without COVERAGE)
- Expected: All test groups pass, no coverage output, exit code 0

## Boundaries
- Do NOT change coverage thresholds (keep 65/60/65)
- Do NOT modify .github/workflows/test.yml
- Do NOT modify test files (Group 1/2/3 separation)
- Do NOT change the Group 1/2/3 split strategy
```

---

#### Worker 3 (FIX-03): sync-memory-index — Remove redundant nested catch + consume adapter.EOL

```
## Mission
Two improvements to sync-memory-index: (1) Remove the redundant inner try/catch that shadows createToolRunner's outer catch; (2) Make `renderSection` use PlatformAdapter.EOL for cross-platform file writes.

## Context
- Review dimensions: Redundant code (P2-5), Spec implementation omission (P2-4)
- Spec requirements: Req 2 (Cross-platform abstraction — EOL), Req 3 (Unified error handling)
- Current state:
  - The handler at L107-129 has try { ... } catch (err) { formatAppError(stderr, err); return 1; }
  - createToolRunner outer catch (schema.ts:101-104) already does the same: catch { formatAppError(stderr, err); return 1; }
  - renderSection at L60 uses `lines.join('\n')` — hardcoded line ending
  - syncAgentsFile at L85 writes with `'utf8'` encoding
  - PlatformAdapter.EOL is defined but never consumed by any production code
- File: packages/tools/sync-memory-index/index.ts, packages/tool-utils/platform-adapter.ts

## Input
- Read `packages/tools/sync-memory-index/index.ts` — full file
- Read `packages/tool-utils/platform-adapter.ts` — EOL property definition

## What to do
1. **Remove the inner try/catch** (L107 `try {`, L126 `} catch (err) {`, L127 `formatAppError(stderr, err);`, L128 `return 1;`, L129 `}`). Dedent the handler body (L108-125) by one level. The handler should look like:
   ```ts
   handler: async (values, _positionals, context): Promise<number> => {
     const stdout = context.stdout ?? process.stdout;
     const stderr = context.stderr ?? process.stderr;

     // ... handler body (previously inside try) ...

     stdout.write(`SYNCED_AGENTS_FILE=${path.resolve(agentsFile)}\n`);
     stdout.write(`MEMORY_FILES_INDEXED=${memoryFiles.length}\n`);
     return 0;
   },
   ```

2. **Update `renderSection` to accept optional EOL parameter** (L39):
   ```ts
   function renderSection(
     memoryFiles: string[],
     sectionTitle: string,
     instructionLines: string[],
     eol: string = '\n',
   ): string {
   ```
   Change L60 from `return lines.join('\n');` to `return lines.join(eol);`

3. **Pass adapter.EOL to renderSection** in the handler (L120 area):
   ```ts
   const adapter = createPlatformAdapter();
   const sectionText = renderSection(memoryFiles, sectionTitle, instructionLines, adapter.EOL);
   ```

4. The `createPlatformAdapter()` import already exists at L4 — no new import needed.

5. After removing the try/catch, the `stderr` variable is only used in the write at L123. That's fine — the variable stays.

## Scope
- Allowed: `packages/tools/sync-memory-index/index.ts`
- Forbidden: Any other file (do NOT modify platform-adapter.ts — EOL is already defined)

## Output
On completion, report:
- Confirmed: inner try/catch removed
- Confirmed: renderSection accepts eol parameter
- Confirmed: adapter.EOL passed to renderSection
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js test/tools/handler-error-propagation.test.js`
- Expected: All tests pass, error propagation still correct without inner catch

## Boundaries
- Do NOT change any business logic in renderSection, syncAgentsFile, iterMemoryFiles, titleFromMemoryFile, or removeExistingSection
- The EOL parameter default of '\n' keeps renderSection's existing test behavior unchanged
- Do NOT modify platform-adapter.ts
```

---

#### Worker 4 (FIX-04): review-threads — Convert cmdResolve stderr.write+return1 to UserInputError throw

```
## Mission
Fix the one remaining error path in review-threads that bypasses formatAppError. The "no thread IDs selected" case in cmdResolve uses stderr.write + return 1 instead of throwing UserInputError.

## Context
- Review dimension: Spec implementation deviation (P2-6)
- Spec requirement: Req 3 (Unified error handling — all errors should propagate via typed throws)
- Current state: cmdResolve at L505-509 checks `threadIds.length === 0` and writes to stderr with a manual "Error: " prefix, then returns 1
- Expected state: throw new UserInputError(...) — the CLI boundary's formatAppError formats it without "Error:" prefix
- The tool is a documented carryover from createToolRunner migration (carryover comment at L529+)
- File: packages/tools/review-threads/index.ts

## Input
- Read `packages/tools/review-threads/index.ts` L492-515 (cmdResolve function)
- Check imports at top of file for UserInputError

## What to do
1. **Change the error path** in cmdResolve (L505-509) from:
   ```ts
   if (threadIds.length === 0) {
     stderr!.write(
       'Error: no thread IDs selected. Use --thread-id, --thread-id-file, or --all-unresolved.\n',
     );
     return 1;
   }
   ```
   to:
   ```ts
   if (threadIds.length === 0) {
     throw new UserInputError(
       'no thread IDs selected. Use --thread-id, --thread-id-file, or --all-unresolved.',
     );
   }
   ```
   Note: Removed "Error: " prefix — UserInputError is formatted without "Error:" prefix by formatAppError.

2. **Ensure `UserInputError` is imported** at the top of the file. If not already imported from `@laitszkin/tool-utils`, add it:
   ```ts
   import { UserInputError, SystemError } from '@laitszkin/tool-utils';
   ```

## Scope
- Allowed: `packages/tools/review-threads/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Confirmed: stderr.write + return 1 replaced with throw new UserInputError
- Confirmed: UserInputError imported at top of file
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: REGTEST-06 (the existing review-threads error propagation test) still passes

## Boundaries
- Do NOT change any other error handling in review-threads (other paths already throw UserInputError/SystemError correctly)
- Do NOT change error message content (only remove "Error: " prefix and change the throw mechanism)
- Do NOT wrap in createToolRunner — this is a documented carryover tool
```

---

#### Worker 5 (FIX-05): Dispatch table — Update FIX-16 comment

```
## Mission
Update the FIX-16 comment in the dispatch table to explicitly document the 3-touch requirement and ordering constraint for adding new commands.

## Context
- Review dimension: Architecture defect (P2-8)
- Spec requirement: Req 5 (Dispatch isolation)
- Current state: FIX-16 comment at L78-81 acknowledges the if-else chain tradeoff but doesn't enumerate the full 3-touch requirement
- The dispatch table elegantly separates parser selection (Map) from result reshaping (if-else chain), but the tradeoff is that adding a new command requires modifying 3 locations
- File: packages/cli/index.ts (L78-81)

## Input
- Read `packages/cli/index.ts` L62-150 (parseArguments function)

## What to do
Update the FIX-16 comment (L78-81) to:
```ts
  // FIX-16: The if-else chain below is intentional — each command type
  // (uninstall, install, tools/tool) returns a different ParsedArguments
  // shape. A handler-map refactor would need a union-to-discriminated
  // mapping. Keeping explicit per-type branches is clearer for now.
  //
  // Adding a new command requires touching 3 locations:
  // 1. Create a new parser class implementing CommandParser<T>
  // 2. Add a Map.set() entry in the dispatch table above
  // 3. Add a new if-else branch below to reshape the parsed result
  //
  // Ordering constraint: install/uninstall branches must precede
  // tools/tool because the same parser reference (toolParser) serves both.
```

## Scope
- Allowed: `packages/cli/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Confirmed: FIX-16 comment updated
- The exact new comment text

## Verify
- Build: `npm run build` must succeed (comments don't affect build)
- Visual: Confirm the updated comment appears in the compiled dist

## Boundaries
- Do NOT change any code — comment-only change
```

---

### Regression Test Worker Prompts

#### REGTEST-01: read-github-issue --repo flag works (FIX-01)

```
## Mission
Add a regression test verifying that read-github-issue's `--repo` flag passes through createToolRunner without being rejected as an unknown option.

## Context
- Fix summary: Restored complete createToolRunner schema with --repo, --json, --comments options
- Root cause: The schema only declared `help`; with strict:true, `parseArgs` rejected --repo as unknown
- Fix files involved: packages/tools/read-github-issue/index.ts

## Input
- Read `test/tools/handler-error-propagation.test.js` — existing test format reference
- Read the dist output at `packages/tools/read-github-issue/dist/index.js` — to verify the handler export name

## What to do
Add a test to `test/tools/handler-error-propagation.test.js`:

```javascript
// REGTEST-01: FIX-01 — read-github-issue --repo passes through createToolRunner
it('read-github-issue: --repo flag passes through createToolRunner without unknown-option error', async () => {
  const mod = await import('../../packages/tools/read-github-issue/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };
  // Pass --repo and a positional issue number — should NOT throw unknown option error
  const code = await mod.tool.handler(
    ['--repo', 'owner/repo', '42'],
    { stdout: { write() {} }, stderr, env: {} },
  );
  // Handler should execute (will likely fail trying to call gh, but NOT with parseArgs error)
  assert.ok(typeof code === 'number', `Handler should return a number, got ${typeof code}: ${code}`);
  // stderr must NOT contain "Unknown option" (from node:util parseArgs)
  assert.ok(!stderr.data.includes('Unknown option'),
    `Should not have parseArgs unknown-option error: ${JSON.stringify(stderr.data)}`);
  // stderr must NOT contain "ERR_PARSE_ARGS" 
  assert.ok(!stderr.data.includes('ERR_PARSE_ARGS'),
    `Should not have ERR_PARSE_ARGS error: ${JSON.stringify(stderr.data)}`);
});
```

## Scope
- Allowed: `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: REGTEST-01 passes (no unknown-option error for --repo)
```

---

#### REGTEST-02: read-github-issue --json flag works (FIX-01)

```
## Mission
Add a regression test verifying that read-github-issue's `--json` flag passes through createToolRunner without being rejected.

## Context
- Fix summary: Restored complete createToolRunner schema with all options
- Root cause: Schema only declared `help`; strict:true rejected --json
- Fix files involved: packages/tools/read-github-issue/index.ts

## Input
- Read `test/tools/handler-error-propagation.test.js` — existing test format reference

## What to do
Add a test to `test/tools/handler-error-propagation.test.js`:

```javascript
// REGTEST-02: FIX-01 — read-github-issue --json passes through createToolRunner
it('read-github-issue: --json flag passes through createToolRunner without unknown-option error', async () => {
  const mod = await import('../../packages/tools/read-github-issue/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };
  // Pass --json and a positional issue number
  const code = await mod.tool.handler(
    ['--json', '42'],
    { stdout: { write() {} }, stderr, env: {} },
  );
  assert.ok(typeof code === 'number', `Handler should return a number, got ${typeof code}`);
  assert.ok(!stderr.data.includes('Unknown option'),
    `Should not have parseArgs unknown-option error: ${JSON.stringify(stderr.data)}`);
  assert.ok(!stderr.data.includes('ERR_PARSE_ARGS'),
    `Should not have ERR_PARSE_ARGS error: ${JSON.stringify(stderr.data)}`);
});
```

## Scope
- Allowed: `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: REGTEST-02 passes
```

---

#### REGTEST-03: read-github-issue --comments flag works (FIX-01)

```
## Mission
Add a regression test verifying that read-github-issue's `--comments` flag passes through createToolRunner without being rejected.

## Context
- Fix summary: Restored complete createToolRunner schema with all options
- Root cause: Schema only declared `help`; strict:true rejected --comments
- Fix files involved: packages/tools/read-github-issue/index.ts

## Input
- Read `test/tools/handler-error-propagation.test.js` — existing test format reference

## What to do
Add a test to `test/tools/handler-error-propagation.test.js`:

```javascript
// REGTEST-03: FIX-01 — read-github-issue --comments passes through createToolRunner
it('read-github-issue: --comments flag passes through createToolRunner without unknown-option error', async () => {
  const mod = await import('../../packages/tools/read-github-issue/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };
  // Pass --comments and a positional issue number
  const code = await mod.tool.handler(
    ['--comments', '42'],
    { stdout: { write() {} }, stderr, env: {} },
  );
  assert.ok(typeof code === 'number', `Handler should return a number, got ${typeof code}`);
  assert.ok(!stderr.data.includes('Unknown option'),
    `Should not have parseArgs unknown-option error: ${JSON.stringify(stderr.data)}`);
  assert.ok(!stderr.data.includes('ERR_PARSE_ARGS'),
    `Should not have ERR_PARSE_ARGS error: ${JSON.stringify(stderr.data)}`);
});
```

## Scope
- Allowed: `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: REGTEST-03 passes
```

---

#### REGTEST-04: sync-memory-index error propagation after removing inner catch (FIX-03)

```
## Mission
Add a regression test verifying that removing sync-memory-index's inner try/catch does not break error propagation.

## Context
- Fix summary: Removed redundant inner try/catch from createToolRunner-wrapped handler
- Root cause: Inner catch shadowed outer catch; error behavior is identical but structure is cleaner
- Fix files involved: packages/tools/sync-memory-index/index.ts

## Input
- Read `test/tools/sync-memory-index-error.test.js` — existing sync-memory-index error tests
- Read `test/tools/handler-error-propagation.test.js` — existing handler error format tests

## What to do
First, run the existing sync-memory-index error tests to confirm they still pass:
```bash
node --test test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js
```

If they pass, the existing tests already cover error propagation. Add one additional test to `test/tools/sync-memory-index-error.test.js` or `test/tools/handler-error-propagation.test.js` that verifies the outer createToolRunner catch correctly handles errors from the handler:

```javascript
// REGTEST-04: FIX-03 — sync-memory-index error propagation via createToolRunner outer catch
it('sync-memory-index: errors propagate correctly through createToolRunner after inner catch removal', async () => {
  const mod = await import('../../packages/tools/sync-memory-index/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };
  // Pass a non-existent agents-file path to trigger handler error
  const code = await mod.tool.handler(
    ['--agents-file', '/nonexistent/path/AGENTS.md'],
    { stdout: { write() {} }, stderr, env: {} },
  );
  assert.strictEqual(code, 1, 'Handler should return exit code 1 on error');
  assert.ok(stderr.data.length > 0, 'stderr should contain error information');
});
```

## Scope
- Allowed: `test/tools/sync-memory-index-error.test.js`, `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js test/tools/handler-error-propagation.test.js`
- Expected: All existing and new tests pass
```

---

#### REGTEST-05: review-threads cmdResolve throws UserInputError (FIX-04)

```
## Mission
Add a regression test verifying that review-threads cmdResolve throws UserInputError when no thread IDs are selected (instead of stderr.write + return 1).

## Context
- Fix summary: Changed "no thread IDs selected" error from stderr.write + return 1 to throw new UserInputError
- Root cause: The path used stderr.write with manual "Error:" prefix, bypassing formatAppError
- Fix files involved: packages/tools/review-threads/index.ts

## Input
- Read `test/tools/handler-error-propagation.test.js` — existing test format
- Read `packages/tools/review-threads/dist/index.js` — to verify handler export name

## What to do
Add a test to `test/tools/handler-error-propagation.test.js`:

```javascript
// REGTEST-05: FIX-04 — review-threads cmdResolve throws UserInputError for no thread IDs
it('review-threads: cmdResolve throws UserInputError when no thread IDs selected', async () => {
  const mod = await import('../../packages/tools/review-threads/dist/index.js');
  const { UserInputError } = await import('@laitszkin/tool-utils');
  // review-threads is not wrapped in createToolRunner, so errors propagate as rejected promises
  await assert.rejects(
    () => mod.tool.handler(
      ['resolve', '--dry-run', '--repo', 'test/repo'],
      { stdout: { write() {} }, stderr: { write() {} }, env: {} },
    ),
    (err) => {
      assert.ok(err instanceof UserInputError, 'Should throw UserInputError');
      assert.ok(err.message.includes('no thread IDs selected'),
        `Message should mention "no thread IDs selected": ${err.message}`);
      return true;
    },
  );
});
```

## Scope
- Allowed: `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: REGTEST-05 passes (UserInputError thrown with correct message)
```

---

## 7. Fix Batch Schedule

### Batch 1 — All Fixes (Full Parallel — Isolated Branches)

- **Issues**: FIX-01, FIX-02, FIX-03, FIX-04, FIX-05
- **Workers**: Worker 1, Worker 2, Worker 3, Worker 4, Worker 5
- **Strategy**: Full parallel — **zero file overlap** between all 5 workers. Each worker on its own isolated branch:
  - Worker 1 → `fix/worker-1-read-github-issue`
  - Worker 2 → `fix/worker-2-coverage-ci`
  - Worker 3 → `fix/worker-3-sync-memory-index`
  - Worker 4 → `fix/worker-4-review-threads`
  - Worker 5 → `fix/worker-5-dispatch-comment`
- **Depends on**: Nothing
- **Gate**:
  - [ ] Worker 1 reports success on its branch
  - [ ] Worker 2 reports success on its branch
  - [ ] Worker 3 reports success on its branch
  - [ ] Worker 4 reports success on its branch
  - [ ] Worker 5 reports success on its branch
  - [ ] **Merge**: Merge ALL 5 branches back to main — resolve any conflicts
  - [ ] **Verify merge**: Confirm changes from ALL 5 workers are present in the merged result (check each modified file: read-github-issue/index.ts, scripts/test.sh, sync-memory-index/index.ts, review-threads/index.ts, cli/index.ts)
  - [ ] **Clean up**: Delete all 5 agent branches (`fix/worker-1-read-github-issue`, `fix/worker-2-coverage-ci`, `fix/worker-3-sync-memory-index`, `fix/worker-4-review-threads`, `fix/worker-5-dispatch-comment`)
  - [ ] Run verification: `npm run build`
  - [ ] Run: `node --test test/tools/handler-error-propagation.test.js test/tools/schema-conversion-smoke.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`

### Batch 2 — Regression Tests (Sequential Sub-batches — file overlap)

- **Tasks**: REGTEST-01, REGTEST-02, REGTEST-03, REGTEST-04, REGTEST-05
- **Strategy**: REGTEST-01, REGTEST-02, REGTEST-03, REGTEST-05 all modify `test/tools/handler-error-propagation.test.js` → **must be sequential**. REGTEST-04 modifies `test/tools/sync-memory-index-error.test.js` or `test/tools/handler-error-propagation.test.js` → sequentialize accordingly.

  **Sub-batch 2a**: REGTEST-01 → `fix/regtest-01`
  - Gate: merge → verify → clean up branch
  **Sub-batch 2b**: REGTEST-02 → `fix/regtest-02`
  - Gate: merge → verify → clean up branch
  **Sub-batch 2c**: REGTEST-03 → `fix/regtest-03`
  - Gate: merge → verify → clean up branch
  **Sub-batch 2d**: REGTEST-04 → `fix/regtest-04`
  - Gate: merge → verify → clean up branch
  **Sub-batch 2e**: REGTEST-05 → `fix/regtest-05`
  - Gate: merge → verify → clean up branch

  Alternatively, since all REGTESTs modify the SAME file, they can all be combined into a SINGLE worker that writes all 5 tests at once. **Recommended**: Combine all REGTEST-01 through REGTEST-05 into one worker on one branch `fix/regtest-all`. This avoids 5 sequential merge cycles.

- **Depends on**: Batch 1 completed
- **Gate**:
  - [ ] **Option A (faster)**: Single REGTEST worker writes all 5 tests → merge → verify → clean up
  - [ ] **Option B (safer)**: 5 sequential sub-batches, each with merge → verify → clean up
  - [ ] Run verification: `node --test test/tools/handler-error-propagation.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`

### Batch 3 — Final Verification (Sequential)

- **Tasks**: Full test suite, coverage check, cross-check REPORT.md
- **Strategy**: Sequential (coordinator handles directly)
- **Depends on**: All preceding batches
- **Gate**:
  - [ ] `npm run build` — builds without errors
  - [ ] Full test suite passes: `COVERAGE=true bash scripts/test.sh`
  - [ ] Every issue in REPORT.md confirmed resolved (cross-check all 12 issues)
  - [ ] `COVERAGE=true bash scripts/test.sh` — combined coverage estimate printed
  - [ ] Commit all changes in a single commit with message: `fix: resolve 12 Round 14 review issues (3 P1 + 5 P2 + 4 P3)`

---

## 8. Regression Test Inventory

- REGTEST-01 → FIX-01: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN read-github-issue with `['--repo', 'owner/repo', '42']` WHEN handler called THEN no unknown-option error
- REGTEST-02 → FIX-01: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN read-github-issue with `['--json', '42']` WHEN handler called THEN no unknown-option error
- REGTEST-03 → FIX-01: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN read-github-issue with `['--comments', '42']` WHEN handler called THEN no unknown-option error
- REGTEST-04 → FIX-03: [Unit] `test/tools/handler-error-propagation.test.js` or `test/tools/sync-memory-index-error.test.js` — GIVEN sync-memory-index with invalid agents-file path WHEN handler called THEN returns exit code 1 with stderr (error propagation intact after inner catch removal)
- REGTEST-05 → FIX-04: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN review-threads resolve with --dry-run WHEN no thread IDs selected THEN UserInputError thrown with "no thread IDs selected" message

---

## 9. Verification Checkpoints

### Checkpoint 1 — After Batch 1 (All fixes)
- Run: `npm run build`
- Expected: Workers 1-5 report success, build compiles without errors
- Run: `node --test test/tools/handler-error-propagation.test.js test/tools/schema-conversion-smoke.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`
- Expected: All existing tests pass (read-github-issue flag tests need not exist yet — they'll be added in Batch 2)

### Checkpoint 2 — After Batch 2 (Regression tests)
- Run: `node --test test/tools/handler-error-propagation.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`
- Expected: All 5 new regression tests pass alongside existing tests
- Logical check: Each REGTEST must fail on unfixed code. For REGTEST-01/02/03 (read-github-issue flags), verify they would fail with the old schema by temporarily reverting the schema change

### Checkpoint 3 — Final verification
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: All groups pass, combined coverage estimate line appears in output
- Run: Cross-check REPORT.md — every issue from the 12 identified is confirmed resolved:
  - [ ] P1-1 (read-github-issue --repo/--json/--comments fixed) — REGTEST-01/02/03 pass
  - [ ] P1-2 (coverage gap documented) — scripts/test.sh improved, combined estimate present
  - [ ] P1-3 (read-github-issue JSDoc added) — comment verified in code
  - [ ] P2-4 (EOL consumed) — sync-memory-index uses adapter.EOL
  - [ ] P2-5 (redundant catch removed) — inner try/catch removed
  - [ ] P2-6 (review-threads throw) — REGTEST-05 passes
  - [ ] P2-7 (Group 3 coverage blind spot) — documented in scripts/test.sh
  - [ ] P2-8 (dispatch table docs) — FIX-16 comment updated
  - [ ] P3-9 (dead code removed) — internal parseArgs removed from read-github-issue
  - [ ] P3-10 (Windows glob) — documented in scripts/test.sh
  - [ ] P3-11 (grep format) — grep pattern validation added
  - [ ] P3-12 (mktemp) — replaced with cross-platform TMPDIR fallback

---

## 10. Error Recovery

- **If a fix worker fails**: Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry.
- **If a fix worker fails twice**: Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user.
- **If a regression test worker reports failure (test cannot pass)**: Check whether the test code is wrong or the fix is incomplete. If the test code is wrong, continue the worker to fix it. If the fix is incomplete, go back to the corresponding fix worker.
- **If a regression test passes on the unfixed code**: The test design is invalid — redesign the oracle and dispatch a new worker.
- **If merge conflicts occur**: The coordinator resolves the conflict, then re-runs the batch gate verification.
- **If a fix or regression test breaks existing tests**: Pause. Report which test failed and which worker's change caused it.
- **For FIX-01 (read-github-issue)**: If `readGitHubIssueHandler` signature change breaks test callers, keep the old signature and create a compatibility wrapper. Check `grep -rn "readGitHubIssueHandler" test/` first.
- **For FIX-02 (coverage)**: If the combined coverage estimation awk column doesn't parse the right value, adjust the column index based on actual `grep "all files"` output format (try `{print $4}` or `{print $5}`).
- **For FIX-03 (sync-memory-index)**: If removing the inner try/catch causes a test failure, the error propagation path may have changed. Verify `createToolRunner`'s outer catch still catches errors from the handler.

---

## 11. Fix History

### Round 14 — 2026-06-06
- **Issues fixed**: FIX-01 through FIX-05 (P1: 3, P2: 5, P3: 4)
- **Outcome**: TBD
- **Key notes**: FIX-01 (read-github-issue) is the most impactful fix — it restores the complete createToolRunner schema lost in Round 12, restoring --repo/--json/--comments functionality. FIX-02 addresses the persistent coverage gap documentation. FIX-03/FIX-04 are P2 cleanups for sync-memory-index and review-threads. FIX-05 documents the dispatch table's 3-touch requirement.

### Round 13 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-09 (P1: 4, P2: 5, P3: 6)
- **Outcome**: 21/21 issues resolved. Applied in commits `178d91f` (open-github-issue stderr removal), `001ce3d` (sync-memory-index restore), `a85107f` (test classifier fix), `64dbf49` (arch tests), and subsequent commits.
- **Key notes**: The Round 13 fix successfully resolved all 4 P1 issues but inadvertently left read-github-issue with a broken schema (introduced in Round 12). This went unnoticed by Round 13 review. The open-github-issue stderr.write fix was successful. Coverage threshold gap persisted (reappears as Round 14 FIX-02).

### Round 12 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-10 (P1: 7, P2: 16, P3: 11) — applied in commit `52a42a6`
- **Outcome**: 30/34 issues resolved. Remaining: open-github-issue stderr.write (not actually removed despite commit claim), coverage threshold at 69% (re-appears as Round 13 FIX-05), sync-memory-index createToolRunner regression (new issue — Round 13 FIX-02), test fix regressions (new issues — Round 13 FIX-03, FIX-04)
- **Key notes**: The Round 12 fix commit accidentally broke read-github-issue's schema while introducing the positionals-passthrough pattern. This created the P1-1 regression now addressed in Round 14 FIX-01.

### Round 11 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-13 (P1:3, P2:10, P3:5) — applied in commit `8f2d6a1`

### Round 10 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-16 (P1:2, P2:6, P3:8) — applied in commit `ddb9863`

### Round 9 — 2026-06-04
- **Issues fixed**: FIX-01 through FIX-13 (P2:5, P3:8) — applied in commit `17f7e49`

### Round 8 — 2026-06-04
- **Issues fixed**: FIX-01 through FIX-21 (P2:8, P3:13) — applied in commit `a2e8877`

### Rounds 1-7 — 2026-06-04
- **Issues fixed**: All Round 1-7 issues resolved progressively.

---

## 12. Boundaries

### ALWAYS

- Run gate verification immediately after every batch
- **Create an isolated branch for each worker before dispatching** (e.g., `fix/worker-1-read-github-issue`). Every worker gets its own branch — never dispatch two workers to the same branch.
- **Each worker commits their changes on their isolated branch.** Never allow workers to commit directly to main.
- **After each batch completes**: merge every worker's isolated branch back to main (handle conflicts), **confirm all changes from all subagents have been implemented in the merged result**, then **clean up all agent branches** — do not leave any `fix/worker-*` or `fix/regtest-*` branches behind. A clean repo is required before starting the next batch.
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them. This is coordination, not implementation.
- **For FIX-01 (read-github-issue)**: If test code calls `readGitHubIssueHandler` with argv directly, do NOT change the public signature. Create a wrapper inside the tool definition instead.
- **For FIX-03 (sync-memory-index)**: After removing the inner try/catch, run the existing sync-memory-index error tests to verify error propagation is intact.

### ASK FIRST — pause and confirm with the user

- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- **FIX-01 (read-github-issue)**: If the handler signature change breaks external callers, present the compatibility-wrapper option
- **FIX-02 (coverage)**: If `COVERAGE=true bash scripts/test.sh` fails, present the exact failure

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- **Defer any REPORT.md issue to a future round** — every issue has a complete fix plan in this FIX.md
- **Leave agent branches behind** — always clean up after each batch before starting the next
- **Merge without verifying** — always confirm every subagent's changes are present in the merged result
