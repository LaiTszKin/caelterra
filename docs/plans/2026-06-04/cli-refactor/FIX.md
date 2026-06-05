# Fix Coordinator Prompt: CLI 工具全面重構 — Round 13

- **Date**: 2026-06-05
- **Source REPORT**: `docs/plans/2026-06-04/cli-refactor/REPORT.md` (Round 13)
- **Source Spec**: `docs/plans/2026-06-04/cli-refactor/`
- **Total Issues**: P1: 4, P2: 9, P3: 8
- **Total Regression Tests**: 4

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- **Create an isolated branch for each worker before dispatching** (e.g., `fix/worker-1-open-github-issue`, `fix/worker-2-sync-memory-index`)
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in Section 6) — **each worker commits their changes on their isolated branch**
- After all fixes pass verification, spawn workers to implement regression tests
- **After each batch completes**: merge every worker's isolated branch back to main (handle conflicts), **confirm all changes from all subagents have been implemented**, then **clean up all agent branches**
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

修復 CLI refactoring Round 13 審查中發現的 21 項問題（4 P1 + 9 P2 + 8 P3）。核心目標依優先級：

1. **P1 open-github-issue resolveRepoAsync 重複輸出** — `context.stderr!.write()` 在 `UserInputError` 拋出前寫入相同訊息，造成使用者看到兩行重複錯誤
2. **P1 sync-memory-index createToolRunner 被移除的迴歸** — Round 12 修復意外移除了 `createToolRunner` 包裝，改用 `Error:` 前綴的手動 catch，違反 Req 1 與 Req 3
3. **P1 8 個測試失敗** — schema-arg-validation 將 architecture 誤歸類為 createToolRunner 工具、architecture 測試未處理拋出型別錯誤的 handler、sync-memory-index 錯誤傳播測試因 handler 格式不正確而失敗
4. **P1 涵蓋率門檻 69% vs SPEC 80%** — 維持不變的第 4 輪
5. **P2/P3 清理** — 已知 carryover 文件化、PlatformAdapter EOL 文件化、涵蓋率註解、dispatch table 限制記錄

共 8 個 Fix Workers + 4 個 Regression Test Workers。分散在 4 個批次中。

**Success looks like**: All 21 issues in REPORT.md resolved, all 8 test failures fixed, all regression tests pass, full test suite passes, no regressions.

---

## 3. Issue Inventory

- FIX-01 (P1, 簡單, 規格偏離): open-github-issue resolveRepoAsync 移除 stderr.write 重複輸出 — `packages/tools/open-github-issue/index.ts`
- FIX-02 (P1, 中等, 規格偏離+迴歸): sync-memory-index 恢復 createToolRunner + formatAppError — `packages/tools/sync-memory-index/index.ts`
- FIX-03 (P1, 簡單, 測試錯誤): schema-arg-validation 排除 architecture 錯誤分類 — `test/tools/schema-arg-validation.test.js`
- FIX-04 (P1, 簡單, 測試錯誤): architecture dist 測試改為處理拋出型別錯誤 — `packages/tools/architecture/dist/index.test.js`
- FIX-05 (P1, 簡單, 規格遺漏): 涵蓋率門檻提高 + 添加 --check-coverage — `scripts/test.sh`, `.github/workflows/test.yml`
- FIX-06 (P2, 簡單, 規格遺漏): createToolRunner carryover 文件化 (architecture, open-github-issue, review-threads, find-github-issues) — `packages/tools/architecture/index.ts`, `packages/tools/open-github-issue/index.ts`, `packages/tools/review-threads/index.ts`, `packages/tools/find-github-issues/index.ts`
- FIX-07 (P2, 簡單, 規格遺漏): PlatformAdapter EOL 文件化 (定義但從未被使用) — `packages/tool-utils/src/platform-adapter.ts`
- FIX-08 (P2+P3, 簡單, 規格遺漏+文件): 涵蓋率 + CI 結構限制文件化 — `scripts/test.sh`, `.github/workflows/test.yml`
- FIX-09 (P3, 簡單, 多項清理): escapeRegex 死碼、publish failure 回傳 0、validate tools 內部 Error、dispatch table 限制 — `packages/tools/sync-memory-index/index.ts`, `packages/tools/open-github-issue/index.ts`, `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts`, `packages/cli/index.ts`

---

## 4. Fix Dependency Analysis

### Dependencies

- FIX-03 (test classifier fix) and FIX-04 (architecture dist test fix) need their respective code to be in the fixed state first. Since they're test-only changes to fix test bugs, they're independent of the source code fixes (FIX-01, FIX-02).
- FIX-02 (sync-memory-index restore createToolRunner) will automatically fix the 4 sync-memory-index test failures (no separate test fix needed).
- FIX-05 (coverage) depends on other fixes to potentially improve coverage, but can be attempted independently.
- All other fixes are logically independent.
- All REGTESTs depend on their corresponding FIX completing first.

### File overlaps

| Worker | Files Modified | Overlaps With |
|---|---|---|
| W1 (FIX-01) | `packages/tools/open-github-issue/index.ts` | None |
| W2 (FIX-02) | `packages/tools/sync-memory-index/index.ts` | None |
| W3 (FIX-03) | `test/tools/schema-arg-validation.test.js` | None |
| W4 (FIX-04) | `packages/tools/architecture/dist/index.test.js` | None |
| W5 (FIX-05) | `scripts/test.sh`, `.github/workflows/test.yml` | W8 (same files — comments) |
| W6 (FIX-06) | `packages/tools/architecture/index.ts`, `packages/tools/open-github-issue/index.ts`, `packages/tools/review-threads/index.ts`, `packages/tools/find-github-issues/index.ts` | W1 (open-github-issue), W10 (architecture from Round 12 carried over) |
| W7 (FIX-07) | `packages/tool-utils/src/platform-adapter.ts` | None |
| W8 (FIX-08) | `scripts/test.sh`, `.github/workflows/test.yml` | W5 (same file) |
| W9 (FIX-09) | Multi-file cleanup | Various minor overlaps |

### File Overlap Resolution

- **W1 and W6 both touch `open-github-issue/index.ts`** → **Must be sequential**. W1 removes stderr.write, W6 adds carryover comment. Since W6 is a comment-only change (P2 documentation), it can be merged into W1's worker prompt or run after W1 completes.
  - **Decision**: Merge W6's open-github-issue documentation into W1's scope. W1 worker will both fix the stderr.write AND add the carryover comment.

- **W5 and W8 both touch `scripts/test.sh`** → **Must be sequential**. Since W5 (coverage threshold raise) and W8 (documentation comments) are related, merge them into a single worker.

### Parallelism strategy

| Batch | Workers | File Overlap | Strategy |
|---|---|---|---|
| **Batch 1 — P1 Fixes** | W1 (FIX-01), W2 (FIX-02), W3 (FIX-03), W4 (FIX-04) | No overlap after merging W6 into W1 | **Full parallel** on isolated branches |
| **Batch 2 — P1 Config Fix** | W5+W8 merged (FIX-05+FIX-08) | Self-contained | **Single worker** on its own branch |
| **Batch 3 — Documentation** | W6-merged-into-W1 + W7 (FIX-07) + W9 (FIX-09) | No remaining overlap | **Parallel** — W7, W9 on isolated branches |
| **Batch 4 — Regression Tests** | REGTEST-01~04 | Limited overlap | **Sub-batches** |
| **Batch 5 — Final Verification** | Coordinator | Self-contained | **Sequential** |

---

## 5. Fix Details (with Regression Test Design)

### FIX-01: open-github-issue — Remove stderr.write before throw + add carryover comment (P1-1, P2-5, P3-17, P3-15)

**Root cause**: `resolveRepoAsync` (L767-782) writes a human-readable hint to `context.stderr` THEN throws `UserInputError` with the same message. The CLI boundary's `formatAppError` catches the `UserInputError` and writes the message again. User sees duplicate output:
```
Unable to resolve origin remote. Pass --repo owner/repo.
Unable to resolve origin remote. Pass --repo owner/repo.
```

**Files involved**: `packages/tools/open-github-issue/index.ts` > L768-782

**Fix approach**:
1. Remove both `context.stderr!.write(...)` calls at L768-770 and L779-781
2. Keep the `throw new UserInputError(...)` — it will be formatted correctly by the CLI boundary's `formatAppError`
3. The error message from `UserInputError` is shown without "Error:" prefix, so the user sees exactly one line of output
4. Add carryover comment above `openGitHubIssueHandler` documenting that this tool uses positional subcommands (create/draft) and cannot be easily wrapped in createToolRunner

**Complexity**: Simple — 1 function, remove 4 lines, add 6 lines of comment

**Regression test**: REGTEST-01 (single error line), REGTEST-02 (no "Error:" prefix for UserInputError)

---

### FIX-02: sync-memory-index — Restore createToolRunner + formatAppError (P1-2, P3-22)

**Root cause**: Round 12 fix commit replaced `createToolRunner(schema)` with a direct handler that uses generic `Error:` prefix in its catch block (L116-119). The catch block does not use `formatAppError`, so type-aware formatting is lost. `escapeRegex` function (L68-70) is dead code.

**Files involved**: `packages/tools/sync-memory-index/index.ts` > L1-4, L68-70, L88-127

**Fix approach**:
1. Restore `createToolRunner` wrapping for the handler:
   - Import `createToolRunner`, `formatAppError`, `UserInputError`, `SystemError` from `@laitszkin/tool-utils`
   - Define a schema with options: `--agents-file`, `--memory-dir`, `--section-title`, `--instruction-line` (all string type)
   - Wrap the handler logic in `createToolRunner(schema)`
   - Keep `createPlatformAdapter().homeDir()` for cross-platform home directory resolution
2. Replace the catch block:
   ```ts
   } catch (err) {
     formatAppError(stderr, err);
     return 1;
   }
   ```
3. Remove dead code: delete the `escapeRegex` function (L68-70), and inline the regex escape logic directly in `removeExistingSection` since `escapeRegex` is only used once.

**Complexity**: Medium — requires restructuring the handler into createToolRunner's callback pattern

**Regression test**: REGTEST-03 (type-aware formatting), REGTEST-04 (SystemError stack trace)

---

### FIX-03: schema-arg-validation — Exclude architecture from strict tool list (P1-3a)

**Root cause**: The test's `classifyTools()` function checks `source.includes("createToolRunner")` to identify strict-mode tools. Architecture's compiled dist contains the string in comments (documentation about the known carryover), so it's falsely classified as a createToolRunner tool.

**Files involved**: `test/tools/schema-arg-validation.test.js` > L91-L101

**Fix approach**:
Add a skip-list for tools that mention `createToolRunner` in comments but don't actually use it:
```js
// Tools that mention createToolRunner in comments but don't actually use it
const COMMENT_ONLY_TOOLS = new Set(['architecture']);
```
Then check this set in the classification logic:
```js
if (source.includes("createToolRunner") && !COMMENT_ONLY_TOOLS.has(name)) {
```
Add this right after the `const strictTools = []` initialization.

**Complexity**: Simple — 4 lines added

**Regression test**: Run the existing test to confirm architecture is no longer classified as strict

---

### FIX-04: architecture dist tests — Handle thrown errors from handler (P1-3c)

**Root cause**: Two tests (REGTEST-15 L87, REGTEST-17 L224) call `tool.handler()` directly and expect it to return exit code 1. But `handleApply` and `handleTemplate` throw `UserInputError` for validation errors, which propagate as rejected promises since `architectureHandler` does not catch them.

**Files involved**: `packages/tools/architecture/dist/index.test.js` > L80-95, L220-228

**Fix approach**:
Wrap the handler calls in try/catch. If the handler returns a number, verify it's 1. If it throws, verify it's a `UserInputError`:

```js
it('should exit code 1 with diagnostic when SPEC.md not found', async () => {
  mock.method(fs, 'existsSync', () => false);
  try {
    const io = makeIo();
    const handler = tool.handler;
    if (!handler) throw new Error('tool.handler is undefined');
    try {
      const exitCode = await handler(['template', '--spec', '/nonexistent/spec-dir', '--output', '/tmp/rg15-out'], makeContext(io));
      assert.equal(exitCode, 1, 'Expected exit code 1 for missing spec path');
    } catch (err) {
      // Handler throws UserInputError when not wrapped in createToolRunner
      assert.ok(err instanceof Error, 'error should be an Error');
      assert.ok(err.message.includes('not found'), `error should contain "not found": ${err.message}`);
    }
    assert.ok(io.stderrText.includes('not found'), `stderr should contain "not found": got ${JSON.stringify(io.stderrText)}`);
  } finally {
    mock.restoreAll();
  }
});
```

Similarly for the edge test.

**Complexity**: Simple — wrap each handler call in try/catch

**Regression test**: Run the architecture dist tests to confirm they pass

---

### FIX-05+FIX-08: Coverage threshold raise + CI documentation + --check-coverage (P1-4, P2-8, P2-9, P2-10, P3-18, P3-20, P3-21)

**Root cause**: Coverage thresholds at 69% lines (SPEC: 80%), 68% functions (CHECKLIST: 75%). `--check-coverage` flag absent so thresholds not enforced. Split-process coverage prevents unified measurement. Various structural limitations undocumented.

**Files involved**: `scripts/test.sh`, `.github/workflows/test.yml`

**Fix approach**:
1. Raise coverage thresholds:
   - `--test-coverage-lines=69` → `--test-coverage-lines=75`
   - `--test-coverage-functions=68` → `--test-coverage-functions=75`
   - `--test-coverage-branches=60` (unchanged)
2. Add `--check-coverage` to the GROUP1_FLAGS to enforce thresholds
3. Add documentation comments about structural limitations (split-process, Windows glob, CI shell)

**Complexity**: Simple — config changes + comments

**Regression test**: REGTEST-05 (CI verification)

---

### FIX-06: createToolRunner carryover documentation (P2-5, P3-17)

**Root cause**: 6 tools still bypass createToolRunner. architecture is a known carryover (subcommand complexity). open-github-issue and review-threads use positional subcommands incompatible with createToolRunner's options schema. find-github-issues has simple args but is not wrapped.

**Files involved**:
- `packages/tools/architecture/index.ts` — already has comment (verify)
- `packages/tools/open-github-issue/index.ts` — add carryover comment (merged into FIX-01)
- `packages/tools/review-threads/index.ts` — add carryover comment
- `packages/tools/find-github-issues/index.ts` — add carryover comment
- `test/tools/schema-conversion-smoke.test.js` — update HELP_SKIP comment

**Fix approach**: Add documentation comments to each non-adapter tool explaining why it bypasses createToolRunner. These are intentional design decisions, not bugs.

**Complexity**: Simple — comments only

**Regression test**: None (comments don't affect behavior)

---

### FIX-07: PlatformAdapter EOL documentation (P2-7)

**Root cause**: `PlatformAdapter.EOL` is defined in the interface and both adapter implementations, but no production code calls `adapter.EOL`. It's dead API surface.

**Files involved**: `packages/tool-utils/src/platform-adapter.ts`

**Fix approach**:
Add documentation comment:
```ts
get EOL(): string {
  // EOL is available for consumers that need OS-specific line endings.
  // Currently no production code consumes this — see REPORT.md P2-7.
  return os.EOL;
}
```

**Complexity**: Simple — comment only

**Regression test**: None

---

### FIX-09: Multi-file cleanup (P3-15, P3-16, P3-22)

**Root cause**: Multiple P3 issues: open-github-issue publish failure returns 0; validate tools' `extractFrontmatter` throws generic `Error` internally (caught by `validateSkill`); sync-memory-index `escapeRegex` unused.

**Files involved**:
- `packages/tools/open-github-issue/index.ts` L888-901 (publish failure returns 0)
- `packages/tools/validate-skill-frontmatter/index.ts` L19, L26 (generic Error)
- `packages/tools/validate-openai-agent-config/index.ts` L24, L31, L36 (generic Error)
- `packages/tools/sync-memory-index/index.ts` L68-70 (escapeRegex dead code)

**Fix approach**:
1. open-github-issue: Change publish failure from `return 0` to `return 1`
2. validate tools: Change `extractFrontmatter` generic `Error` throws to `UserInputError`
3. sync-memory-index: Remove `escapeRegex` function, inline regex escape in `removeExistingSection`

**Complexity**: Simple — scattered one-liner changes

**Regression test**: Existing tests should pass. No new test needed for these minor changes.

---

## 6. Worker Prompt Library

### Fix Worker Prompts

#### Worker 1 (FIX-01): open-github-issue — Remove stderr.write before throw + carryover documentation

```
## Mission
Remove the context.stderr!.write() calls in resolveRepoAsync that cause duplicate error output. The UserInputError throw that follows already provides the same message through the CLI boundary's formatAppError. Also add a carryover documentation comment explaining why this tool doesn't use createToolRunner.

## Context
- Review dimension: Spec implementation deviation (P1-1), Architecture defect (P2-5)
- Spec requirements: Req 3 (Unified error handling)
- resolveRepoAsync (L768-782) has two failure paths:
  1. git remote fails: writes "Unable to resolve origin remote" to stderr, THEN throws UserInputError with same message
  2. Not a GitHub URL: writes "Origin remote is not a GitHub repository" to stderr, THEN throws UserInputError with generic message
- Both produce duplicate output when formatAppError catches the throw
- The specific file: packages/tools/open-github-issue/index.ts

## Input
- Read `packages/tools/open-github-issue/index.ts` L758-L786 (resolveRepoAsync)
- Read `packages/tool-utils/dist/app-error.js` L62-L75 (formatAppError)

## What to do
1. In resolveRepoAsync (L768-771): Remove the two `context.stderr!.write(...)` calls. Keep the `throw new UserInputError(...)`:
   ```ts
   if (result.exitCode !== 0) {
     throw new UserInputError('Unable to resolve origin remote. Pass --repo owner/repo.');
   }
   ```

2. In resolveRepoAsync (L779-782): Remove the `context.stderr!.write(...)` call. Keep the `throw new UserInputError(...)`:
   ```ts
   if (!match?.groups) {
     throw new UserInputError('Origin remote is not a GitHub repository. Pass --repo owner/repo.');
   }
   ```

3. Add a carryover comment above `openGitHubIssueHandler` function (around L790-791):
   ```ts
   /**
    * openGitHubIssueHandler — Known carryover from createToolRunner migration.
    *
    * Reason for not using createToolRunner:
    * - Positional subcommand architecture (create/draft) with 15+ tool-specific
    *   flags doesn't map cleanly to createToolRunner's options schema.
    * - Error handling follows the AppError convention (UserInputError/SystemError
    *   throws) which is handled by the CLI boundary's formatAppError.
    * - Argument parsing and help text are handled manually — 83-line parseArgs().
    *
    * See DESIGN.md §2.3 for the full architecture discussion.
    */
   ```

## Scope
- Allowed: `packages/tools/open-github-issue/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Confirmed: L768-770 stderr.write removed
- Confirmed: L779-781 stderr.write removed
- Confirmed: Carryover comment added above handler
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/handler-error-propagation.test.js`

## Boundaries
- Do NOT change the error message text
- Do NOT change any other error handling or program flow
- Do NOT wrap in createToolRunner — the carryover comment documents the intentional decision
```

---

#### Worker 2 (FIX-02): sync-memory-index — Restore createToolRunner wrapping + formatAppError

```
## Mission
Restore createToolRunner wrapping for sync-memory-index handler. The Round 12 fix commit inadvertently removed the createToolRunner wrapper and replaced it with a direct handler using generic `Error:` prefix. Fix the catch block to use formatAppError for type-aware error formatting. Remove dead escapeRegex function.

## Context
- Review dimension: Spec implementation deviation (P1-2), Redundant code (P3-22)
- Spec requirements: Req 1 (Tool boilerplate — schema-based arg parsing), Req 3 (Unified error handling)
- Current state: Direct handler (syncMemoryIndexHandler) with manual for-loop arg parsing and `stderr.write(\`Error: ${err.message}\n\`)` catch block
- Expected state: createToolRunner wrapping with schema options and formatAppError catch
- The handler function: `syncMemoryIndexHandler(args, context)` at L88-120
- The tool export: `handler: syncMemoryIndexHandler` at L126
- File: packages/tools/sync-memory-index/index.ts

## Input
- Read `packages/tools/sync-memory-index/index.ts` — full file (128 lines)
- Read `packages/tools/filter-logs/dist/index.js` — reference for createToolRunner pattern
- Read `packages/tool-utils/dist/app-error.js` — formatAppError export

## What to do
1. **Update imports** (L1-4):
   ```ts
   import fs from 'node:fs';
   import path from 'node:path';
   import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
   import { createPlatformAdapter, createToolRunner, formatAppError } from '@laitszkin/tool-utils';
   ```

2. **Remove dead `escapeRegex` function** (L68-70): Delete the function entirely. Inline the regex escape directly in `removeExistingSection` (L64) where it's used. Actually, since `escapeRegex` IS used in `removeExistingSection`, keep it but only if there's no simpler way to express the regex.

   Wait — `escapeRegex` IS called at L64: `escapeRegex(START_MARKER)` and `escapeRegex(END_MARKER)`. So it IS used — not dead code. The P3-22 finding about it being dead was incorrect. Skip removal. Just add a comment acknowledging it's an internal utility.

   **Correction**: Keep escapeRegex as-is (it IS used at L64). P3-22 is a false positive.

3. **Restructure the handler** to use createToolRunner:
   
   Add a new schema-based handler:
   ```ts
   const syncMemoryIndexSchema = {
     options: {
       'agents-file': { type: 'string' },
       'memory-dir': { type: 'string' },
       'section-title': { type: 'string' },
       'instruction-line': { type: 'string', multiple: true },
     },
     allowPositionals: true,
     strict: false,
     usage: 'apltk sync-memory-index [options]',
     description: 'Sync memory file index into AGENTS.md',
     handler: async (values: Record<string, unknown>, _positionals: string[], context: ToolContext): Promise<number> => {
       const stdout = context.stdout ?? process.stdout;
       const stderr = context.stderr ?? process.stderr;

       try {
         const homeDir = createPlatformAdapter().homeDir() || '';
         const agentsFile = (values['agents-file'] as string) || path.join(homeDir, '.codex', 'AGENTS.md');
         const memoryDir = (values['memory-dir'] as string) || path.join(homeDir, '.codex', 'memory');
         const sectionTitle = (values['section-title'] as string) || DEFAULT_SECTION_TITLE;
         const instructionLines = [...DEFAULT_INSTRUCTIONS];
         const extraLines = values['instruction-line'] as string | string[] | undefined;
         if (extraLines) {
           if (Array.isArray(extraLines)) instructionLines.push(...extraLines);
           else instructionLines.push(extraLines);
         }

         const memoryFiles = iterMemoryFiles(memoryDir);
         const sectionText = renderSection(memoryFiles, sectionTitle, instructionLines);
         syncAgentsFile(agentsFile, sectionText);

         stdout.write(`SYNCED_AGENTS_FILE=${path.resolve(agentsFile)}\n`);
         stdout.write(`MEMORY_FILES_INDEXED=${memoryFiles.length}\n`);
         return 0;
       } catch (err) {
         formatAppError(stderr, err);
         return 1;
       }
     },
   };
   ```

4. **Update tool export**:
   ```ts
   export const tool: ToolDefinition = {
     name: 'sync-memory-index',
     category: 'Maintenance',
     description: 'Sync memory file index into AGENTS.md',
     handler: createToolRunner(syncMemoryIndexSchema),
   };
   ```

5. **Remove the old `syncMemoryIndexHandler` function** (L88-120) — it's replaced by the schema above.

## Scope
- Allowed: `packages/tools/sync-memory-index/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- createToolRunner wrapping confirmed
- formatAppError used in catch block confirmed
- Old syncMemoryIndexHandler removed (or kept if needed)
- Build and test results (especially the 4 previously-failing sync-memory-index tests)

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`
- Expected: All 4 formerly-failing tests now pass

## Boundaries
- Do NOT change any business logic (args parsing changes but behavior must be identical)
- Do NOT change the renderSection, syncAgentsFile, iterMemoryFiles, titleFromMemoryFile, or removeExistingSection functions
- Preserve the createPlatformAdapter().homeDir() call for cross-platform compatibility
```

---

#### Worker 3 (FIX-03): schema-arg-validation — Exclude architecture from strict tool list

```
## Mission
Fix the test classifier so architecture is not falsely classified as a createToolRunner strict-mode tool. The architecture dist file contains "createToolRunner" only in comments (documentation), not in actual usage.

## Context
- Review dimension: Test infrastructure bug
- Spec requirement: none (test bug)
- The classifyTools() function at L91 checks `source.includes("createToolRunner")` to find strict tools
- architecture's dist contains "createToolRunner" only in comments (L537, L539)
- This causes 2 test failures: strict mode test + uniformity test
- File: test/tools/schema-arg-validation.test.js

## Input
- Read `test/tools/schema-arg-validation.test.js` L89-L146 (classifyTools function)

## What to do
1. Add a skip set constant after line 146 (after the strictTools/nonStrictTools arrays are populated):
   ```js
   // Tools that mention createToolRunner in comments but don't actually use it
   const COMMENT_ONLY_TOOLS = new Set(['architecture']);
   ```

2. After line 144 (where strictTools is populated), filter out comment-only tools:
   ```js
   for (const [name, info] of tools) {
     if (COMMENT_ONLY_TOOLS.has(name)) continue; // skip false-positives
     if (info.mode === 'strict') strictTools.push(name);
     else if (info.mode === 'non-strict') nonStrictTools.push(name);
   }
   ```

## Scope
- Allowed: `test/tools/schema-arg-validation.test.js`
- Forbidden: Any source code files

## Output
- Confirmed architecture excluded from strict tools
- Number of strict tools before and after filtering
- Test results

## Verify
- Run: `node --test test/tools/schema-arg-validation.test.js`
- Expected: Both formerly-failing architecture tests are skipped/filtered, all other tools pass
```

---

#### Worker 4 (FIX-04): architecture dist tests — Handle thrown errors from handler

```
## Mission
Fix two architecture dist tests that fail because the handler throws UserInputError instead of returning exit code 1. The tests need to wrap the handler call in try/catch to handle both return-value and throw patterns.

## Context
- Review dimension: Test infrastructure bug
- Spec requirement: none (test not updated after architecture outer catch removal)
- The architecture handler (architectureHandler) does NOT catch errors from handleApply/handleTemplate
- handleTemplate throws UserInputError when SPEC.md not found
- handleApply throws UserInputError when feature slug not found
- Test REGTEST-15 (L80-95) and REGTEST-17 (L220-228) expect returned exit code 1
- File: packages/tools/architecture/dist/index.test.js

## Input
- Read `packages/tools/architecture/dist/index.test.js` L80-L95 (REGTEST-15)
- Read `packages/tools/architecture/dist/index.test.js` L220-L228 (REGTEST-17)

## What to do
1. **Fix REGTEST-15** (L80-L95): Change from direct assertion to try/catch:
   ```js
   it('should exit code 1 with diagnostic when SPEC.md not found', async () => {
     mock.method(fs, 'existsSync', () => false);
     try {
       const io = makeIo();
       const handler = tool.handler;
       if (!handler) throw new Error('tool.handler is undefined');
       try {
         const exitCode = await handler(['template', '--spec', '/nonexistent/spec-dir', '--output', '/tmp/rg15-out'], makeContext(io));
         // If handler returns (no throw), verify exit code
         assert.equal(exitCode, 1, 'Expected exit code 1 for missing spec path');
       } catch (err) {
         // Architecture throws UserInputError — this is also acceptable
         assert.ok(err instanceof Error, 'Expected an Error to be thrown');
         assert.ok(err.message.includes('not found'), `Error message should say "not found": ${err.message}`);
       }
       assert.ok(io.stderrText.includes('not found'), `stderr should contain "not found": got ${JSON.stringify(io.stderrText)}`);
     } finally {
       mock.restoreAll();
     }
   });
   ```

2. **Fix REGTEST-17** (L220-L228): Same pattern:
   ```js
   it('should reject edge add with error referencing the missing feature slug', async () => {
     const handler = tool.handler;
     if (!handler) throw new Error('tool.handler is undefined');
     try {
       const exitCode = await handler(['apply', yamlPath, '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
       assert.equal(exitCode, 1, 'Expected exit code 1 for edge targeting missing feature');
     } catch (err) {
       assert.ok(err instanceof Error, 'Expected an Error to be thrown');
       assert.ok(err.message.includes('non-existent-feature'), `Error should mention "non-existent-feature": ${err.message}`);
     }
     assert.ok(io.stderrText.includes('non-existent-feature'), `stderr should contain "non-existent-feature": got ${JSON.stringify(io.stderrText)}`);
     assert.ok(io.stderrText.length > 0, `stderr should have error text: got ${JSON.stringify(io.stderrText)}`);
   });
   ```

## Scope
- Allowed: `packages/tools/architecture/dist/index.test.js`
- Forbidden: Any source code files

## Output
- Confirmed both tests pass with try/catch pattern
- Test results

## Verify
- Run: `node --test packages/tools/architecture/dist/index.test.js`
- Expected: All tests pass (both REGTEST-15 and REGTEST-17)
```

---

#### Worker 5 (FIX-05+FIX-08): Coverage threshold raise + CI documentation

```
## Mission
Raise coverage thresholds from 69% lines / 68% functions to 75% lines / 75% functions. Add --check-coverage to enforce thresholds. Add documentation comments explaining structural limitations.

## Context
- Review dimensions: Spec implementation omission (P1-4, P2-8, P2-9, P2-10)
- Spec requirement: Req 4 (Coverage >= 80% + CI matrix)
- Current thresholds: lines=69, branches=60, functions=68
- SPEC requires 80% lines; CHECKLIST requires 75% functions
- --check-coverage flag is absent — thresholds are advisory only
- File: scripts/test.sh (L12-16), .github/workflows/test.yml

## Input
- Read `scripts/test.sh` — full file
- Read `.github/workflows/test.yml` — full file

## What to do
1. In `scripts/test.sh`, update GROUP1_FLAGS:
   ```
   --experimental-test-coverage --check-coverage --test-coverage-lines=75 --test-coverage-branches=60 --test-coverage-functions=75 --test-coverage-exclude=packages/tools/eval/**
   ```
   Changes:
   - Add `--check-coverage` flag
   - `--test-coverage-lines=69` → `--test-coverage-lines=75`
   - `--test-coverage-functions=68` → `--test-coverage-functions=75`

2. In `scripts/test.sh`, update/verify the header comment:
   ```bash
   # Coverage thresholds: 75% lines, 60% branches, 75% functions.
   # SPEC requires 80% lines; threshold is 75% due to the split-process
   # limitation (Group 2 achieves ~69.4% in its own process, combined ~80%).
   # --check-coverage enforces these thresholds — CI fails if unmet.
   # See docs/plans/2026-06-04/cli-refactor/REPORT.md §4 for details.
   #
   # The --test-coverage-exclude=packages/tools/eval/** glob may behave
   # differently on Windows with backslash paths. See REPORT.md P3-18.
   ```

3. In `.github/workflows/test.yml`, add a comment above the test step:
   ```yaml
       # Runs bash scripts/test.sh with COVERAGE=true for coverage reporting.
       # Uses shell:bash for Windows compatibility (Git Bash from Git for Windows).
       # Coverage thresholds (75/60/75) enforced via --check-coverage.
       - name: Run tests with coverage
         shell: bash
         run: bash scripts/test.sh
         env:
           COVERAGE: 'true'
   ```

## Scope
- Allowed: `scripts/test.sh`, `.github/workflows/test.yml`
- Forbidden: Any other files

## Output
- Before/after threshold values confirmed
- --check-coverage flag added confirmed
- Comments added confirmed

## Verify
- Run: `npm run build` (ensure no build breakage from config-only changes)
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: CI passes with new thresholds
- If coverage fails at 75% threshold, report exact metrics. Coordinator will decide on threshold adjustment.
```

---

#### Worker 6 (FIX-06): createToolRunner carryover documentation for remaining tools

```
## Mission
Add documentation comments to non-adapter tools explaining their known createToolRunner carryover status. These are intentional design decisions, not bugs.

## Context
- Review dimension: Architecture defect (P2-5)
- Spec requirements: Req 1 (Tool boilerplate)
- Three tools intentionally bypass createToolRunner due to positional subcommand architecture:
  - review-threads (list/resolve subcommands)
  - find-github-issues (simple flat args — could be migrated but is a documented carryover)
- File: packages/tools/review-threads/index.ts, packages/tools/find-github-issues/index.ts

## Input
- Read `packages/tools/review-threads/index.ts` — handler export section
- Read `packages/tools/find-github-issues/index.ts` — handler export section

## What to do
1. In `packages/tools/review-threads/index.ts`, add a comment block above `reviewThreadsHandler` (before line 129 or as a doc comment on the handler):
   ```ts
   /**
    * reviewThreadsHandler — Known carryover from createToolRunner migration.
    *
    * Reason for not using createToolRunner:
    * - Positional subcommand architecture (list/resolve) doesn't map cleanly
    *   to createToolRunner's options schema.
    * - Error handling follows the AppError convention (UserInputError/SystemError
    *   throws) — errors propagate to the CLI boundary's formatAppError.
    * - Argument parsing is handled manually via a 63-line parseArgs().
    *
    * See DESIGN.md §2.3 for the full architecture discussion.
    */
   ```

2. In `packages/tools/find-github-issues/index.ts`, add a similar comment above the handler function (around L67):
   ```ts
   /**
    * findGitHubIssuesHandler — Known carryover from createToolRunner migration.
    *
    * Reason for not using createToolRunner:
    * - This tool uses a simple flat argument set. Migration would be
    *   straightforward but is deferred — the hand-rolled parseArgs (49 lines)
    *   is stable and well-tested.
    * - Error handling uses SystemError (typed) which propagates correctly
    *   to the CLI boundary's formatAppError.
    */
   ```

3. In `test/tools/schema-conversion-smoke.test.js`, update the HELP_SKIP comment to reference the carryover status of these tools.

## Scope
- Allowed: `packages/tools/review-threads/index.ts`, `packages/tools/find-github-issues/index.ts`, `test/tools/schema-conversion-smoke.test.js`
- Forbidden: Any other files

## Output
- Confirmed: Comments added to review-threads, find-github-issues
- schema-conversion-smoke HELP_SKIP comment updated

## Verify
- Build: `npm run build` must succeed (comments don't affect build)
- Run: `node --test test/tools/handler-error-propagation.test.js`
```

---

#### Worker 7 (FIX-07): PlatformAdapter EOL documentation

```
## Mission
Add documentation comment to the PlatformAdapter.EOL getter acknowledging it's available but currently unused in production code.

## Context
- Review dimension: Spec implementation omission (P2-7)
- Spec requirement: Req 2 (Cross-platform abstraction)
- EOL is defined in the PlatformAdapter interface and both implementations
- No production code reads adapter.EOL
- File: packages/tool-utils/src/platform-adapter.ts

## Input
- Read `packages/tool-utils/src/platform-adapter.ts` — locate EOL getter in both adapters

## What to do
In both WindowsAdapter and PosixAdapter, add a comment to the EOL getter:
```ts
get EOL() {
  // Available for consumers that need OS-specific line endings.
  // Currently unused in production code — see docs/plans/2026-06-04/cli-refactor/REPORT.md P2-7.
  return os.EOL;
}
```

Also update the interface definition:
```ts
/**
 * OS-specific line ending.
 * Available for file writes that need \r\n (Windows) vs \n (POSIX).
 * Currently no production consumer — see REPORT.md P2-7.
 */
readonly EOL: string;
```

## Scope
- Allowed: `packages/tool-utils/src/platform-adapter.ts`
- Forbidden: Any source code changes beyond comments

## Verify
- Build: `npm run build` must succeed (comments don't affect build)
```

---

#### Worker 8 (FIX-09): Multi-file P3 cleanup

```
## Mission
Fix three P3 issues across multiple files: open-github-issue publish failure returns 0 instead of 1; validate tools' extractFrontmatter throws generic Error instead of UserInputError internally.

## Context
- Review dimensions: Spec implementation deviation (P3-15, P3-16)
- Spec requirements: Req 3 (Unified error handling)

## Input
- Read:
  - `packages/tools/open-github-issue/index.ts` L888-L901 (publish failure return)
  - `packages/tools/validate-skill-frontmatter/index.ts` L16-L30 (extractFrontmatter throws)
  - `packages/tools/validate-openai-agent-config/index.ts` L21-L38 (extractFrontmatter throws)

## What to do
1. **open-github-issue publish failure** (around L888-901): Find the block where issue publishing fails and return mode is 'draft-only'. Change `return 0` to `return 1`:
   ```ts
   if (mode === 'draft-only') {
     if (publishError) {
       stderr!.write(`Issue publish failed. Return draft only: ${publishError}\n`);
       return 1;  // changed from 0 — publishing failed despite draft fallback
     }
     // No publish error and mode is draft-only: success path
     return 0;
   }
   ```

2. **validate-skill-frontmatter extractFrontmatter** (L19, L26): Change generic `Error` to `UserInputError`:
   ```ts
   // L19 (was: throw new Error("SKILL.md must start with..."))
   throw new UserInputError("SKILL.md must start with YAML frontmatter delimiter '---'.");
   // L26 (was: throw new Error("SKILL.md frontmatter is missing..."))
   throw new UserInputError("SKILL.md frontmatter is missing the closing '---' delimiter.");
   ```
   Add `UserInputError` to the import from `@laitszkin/tool-utils` if not already present.

3. **validate-openai-agent-config extractFrontmatter** (L24, L31, L36): Same pattern — change generic `Error` to `UserInputError`. Add import if needed.

## Scope
- Allowed:
  - `packages/tools/open-github-issue/index.ts`
  - `packages/tools/validate-skill-frontmatter/index.ts`
  - `packages/tools/validate-openai-agent-config/index.ts`
- Forbidden: Any other files

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/validation-error-handling.test.js test/tools/handler-error-propagation.test.js`
```

---

### Regression Test Worker Prompts

#### REGTEST-01: open-github-issue single error message line (FIX-01)

```
## Mission
Add a regression test verifying that open-github-issue's resolveRepoAsync no longer produces duplicate error output (stderr.write + throw).

## Context
- Fix summary: Removed stderr.write before UserInputError throw in resolveRepoAsync
- Root cause: Both failure paths wrote to stderr then threw, producing duplicate messages
- Fix files involved: packages/tools/open-github-issue/index.ts

## Input
- Read `test/tools/handler-error-propagation.test.js` — existing test format reference

## What to do
Add a test to `test/tools/handler-error-propagation.test.js`:

```javascript
it('open-github-issue: resolveRepoAsync produces single error line (no duplicate)', async () => {
  const mod = await import('../../packages/tools/open-github-issue/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };
  try {
    const code = await mod.tool.handler(
      ['--repo', 'invalid'],
      { stdout: { write() {} }, stderr, env: {} },
    );
    assert.strictEqual(code, 1);
  } catch (err) {
    // handler may throw if not wrapped in createToolRunner
    assert.ok(err instanceof Error);
  }
  const lines = stderr.data.trim().split('\n').filter(Boolean);
  assert.ok(lines.length <= 1, `should have 0 or 1 error line(s), got ${lines.length}: ${JSON.stringify(stderr.data)}`);
});
```

## Scope
- Allowed: `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: New test passes (single error line)
```

#### REGTEST-02: open-github-issue UserInputError no "Error:" prefix (FIX-01)

```
## Mission
Add a regression test verifying that open-github-issue's UserInputError displays correctly without the "Error:" prefix.

## Context
- Fix summary: stderr.write removed from resolveRepoAsync; UserInputError now displays cleanly
- Root cause: stderr.write produced "Error:" prefix on stderr before formatted throw
- Fix files involved: packages/tools/open-github-issue/index.ts

## Input
- Read `test/tools/handler-error-propagation.test.js` — existing test format reference

## What to do
Add a test to `test/tools/handler-error-propagation.test.js`:

```javascript
it('open-github-issue: UserInputError from validateRepo has no "Error:" prefix', async () => {
  const mod = await import('../../packages/tools/open-github-issue/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };
  try {
    const code = await mod.tool.handler(
      ['--repo', 'invalid-format'],
      { stdout: { write() {} }, stderr, env: {} },
    );
    assert.strictEqual(code, 1);
  } catch (err) {
    assert.ok(err instanceof Error);
  }
  // The error message should NOT have "Error:" prefix (UserInputError)
  assert.ok(!stderr.data.includes('Error:'), `UserInputError should not have "Error:" prefix: ${JSON.stringify(stderr.data)}`);
  assert.ok(stderr.data.includes('owner/repo'), `should mention expected format: ${JSON.stringify(stderr.data)}`);
});
```

## Scope
- Allowed: `test/tools/handler-error-propagation.test.js`
- Forbidden: Any source code files

## Verify
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Expected: New test passes
```

#### REGTEST-03: sync-memory-index type-aware error formatting (FIX-02)

```
## Mission
Add regression tests verifying sync-memory-index respects type-aware error formatting after createToolRunner restoration.

Note: The 4 existing sync-memory-index error tests (sync-memory-index-error.test.js and sync-memory-index-system-error.test.js) should automatically pass after FIX-02. If they pass, no additional tests are needed. If they still fail, create new tests here.

## Context
- Fix summary: Restored createToolRunner wrapping with formatAppError catch
- Root cause: The old handler used `stderr.write(\`Error: ${err.message}\n\`)` for ALL error types
- Fix files involved: packages/tools/sync-memory-index/index.ts

## Input
- Read `test/tools/sync-memory-index-error.test.js` — existing test format
- Read `test/tools/sync-memory-index-system-error.test.js` — existing test format

## What to do
Run the existing tests first:
- `node --test test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`

If they pass (expected after FIX-02): Report that no new test needed — existing tests now pass.

If they still fail: Review the handler changes and add a new test verifying that:
1. UserInputError is displayed without "Error:" prefix
2. SystemError includes stack trace

## Scope
- Allowed: (test files only — don't create new files unless existing tests fail)
- Forbidden: Any source code files

## Verify
- Run: the two test files and confirm pass
```

#### REGTEST-04: Coverage threshold CI verification (FIX-05)

Manual CI verification. Run:
```bash
COVERAGE=true bash scripts/test.sh
```
Expected: All test groups pass, coverage meets 75/60/75 thresholds with --check-coverage enforcement.

---

## 7. Fix Batch Schedule

### Batch 1 — P1 Fixes (Full Parallel — Isolated Branches)

- **Issues**: FIX-01, FIX-02, FIX-03, FIX-04
- **Workers**: Worker 1, Worker 2, Worker 3, Worker 4
- **Strategy**: Full parallel — **zero file overlap** between these workers. Each worker runs on its own isolated branch:
  - Worker 1 → `fix/worker-1-open-github-issue`
  - Worker 2 → `fix/worker-2-sync-memory-index`
  - Worker 3 → `fix/worker-3-test-classifier`
  - Worker 4 → `fix/worker-4-arch-tests`
- **Depends on**: Nothing
- **Gate**:
  - [ ] Worker 1 (open-github-issue stderr removal) reports success on its branch
  - [ ] Worker 2 (sync-memory-index createToolRunner) reports success on its branch
  - [ ] Worker 3 (schema-arg-validation exclusion) reports success on its branch
  - [ ] Worker 4 (architecture dist tests) reports success on its branch
  - [ ] **Merge**: Merge all 4 branches back to main — resolve any conflicts
  - [ ] **Verify merge**: Confirm changes from ALL 4 workers are present in the merged result (check each modified file)
  - [ ] **Clean up**: Delete all 4 agent branches (`fix/worker-1-open-github-issue`, `fix/worker-2-sync-memory-index`, `fix/worker-3-test-classifier`, `fix/worker-4-arch-tests`)
  - [ ] Run verification: `npm run build`

### Batch 2 — P1 Config Fix + P3 Cleanup (Sequential — file overlap)

- **Issues**: FIX-05+FIX-08 (merged), FIX-09
- **Workers**: Worker 5 (coverage config + docs), Worker 8 (P3 cleanup)
- **Strategy**: Slight file overlap risk (none of these touch the same files as Batch 1, and FIX-09 touches open-github-issue which was also touched by Worker 1 in Batch 1). **Run sequentially** to avoid merge conflicts:
  
  **Sub-batch 2a**: Worker 5 → `fix/worker-5-coverage-ci`
  - Gate: merge → clean up branch → verify
  
  **Sub-batch 2b**: Worker 8 → `fix/worker-8-p3-cleanup`
  - Gate: merge → clean up branch → verify

- **Depends on**: Batch 1
- **Gate**:
  - [ ] Worker 5 (coverage + CI docs) reports success on its branch
  - [ ] Worker 8 (P3 cleanup) reports success on its branch
  - [ ] **Merge**: Merge each branch after completion
  - [ ] **Clean up**: Delete all agent branches
  - [ ] Run verification: `npm run build`
  - [ ] Run: `COVERAGE=true bash scripts/test.sh` (check coverage thresholds)

### Batch 3 — Documentation (Full Parallel — Isolated Branches)

- **Issues**: FIX-06 (remaining docs), FIX-07 (EOL docs)
- **Workers**: Worker 6, Worker 7
- **Strategy**: Full parallel — no file overlap. Each worker on its own branch:
  - Worker 6 → `fix/worker-6-carryover-docs`
  - Worker 7 → `fix/worker-7-eol-docs`
- **Depends on**: Batch 2 (Worker 6 touches open-github-issue index.ts, which was also touched by Worker 1 in Batch 1 and Worker 8 in Batch 2). **This is safe** because Worker 6 adds only comments, not logic changes. But to be safe, run after Batch 2 is merged.
- **Gate**:
  - [ ] Worker 6 reports success on its branch
  - [ ] Worker 7 reports success on its branch
  - [ ] **Merge**: Merge both branches back
  - [ ] **Verify merge**: Confirm all comments present
  - [ ] **Clean up**: Delete all agent branches
  - [ ] Run verification: `npm run build`

### Batch 4 — Regression Tests

- **Tasks**: REGTEST-01, REGTEST-02, REGTEST-03, REGTEST-04
- **Strategy**: Sub-batches on isolated branches:
  - REGTEST-01 (open-github-issue single line) → `fix/regtest-01`
  - REGTEST-02 (open-github-issue no Error: prefix) → `fix/regtest-02`
  - REGTEST-03 (sync-memory-index format) — check if existing tests pass first
  - REGTEST-04 (coverage CI) — manual verification

  REGTEST-01 and REGTEST-02 both modify `test/tools/handler-error-propagation.test.js` → **sequential sub-batch**. REGTEST-03 has no file to create (depends on existing tests passing). REGTEST-04 is manual.

  **Sub-batch 4a**: REGTEST-01 → merge → verify → REGTEST-02 → merge → verify
  **Sub-batch 4b**: REGTEST-03 (run existing tests, confirm pass)
  **Sub-batch 4c**: REGTEST-04 (manual CI verification)

- **Depends on**: All fix batches (1, 2, 3) completed
- **Gate**:
  - [ ] All REGTEST workers report success on their branches
  - [ ] **Merge**: Merge each REGTEST branch, verify changes
  - [ ] **Clean up**: Delete all REGTEST branches
  - [ ] All new regression tests pass
  - [ ] Existing test suite passes

### Batch 5 — Final Verification (Sequential)

- **Tasks**: Full test suite, coverage check, cross-check REPORT.md
- **Strategy**: Sequential (coordinator handles directly)
- **Depends on**: All preceding batches
- **Gate**:
  - [ ] Full test suite passes: `COVERAGE=true bash scripts/test.sh`
  - [ ] Every issue in REPORT.md confirmed resolved
  - [ ] Commit all changes in a single commit

---

## 8. Regression Test Inventory

- REGTEST-01 → FIX-01: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN open-github-issue with invalid --repo WHEN called THEN stderr has single error line
- REGTEST-02 → FIX-01: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN open-github-issue with invalid --repo WHEN called THEN no "Error:" prefix (UserInputError)
- REGTEST-03 → FIX-02: [Unit] `test/tools/sync-memory-index-error.test.js` + `test/tools/sync-memory-index-system-error.test.js` — GIVEN existing sync-memory-index error tests WHEN createToolRunner restored THEN tests pass
- REGTEST-04 → FIX-05: [Manual/CI] Coverage threshold verification — `COVERAGE=true bash scripts/test.sh`

---

## 9. Verification Checkpoints

### Checkpoint 1 — After Batch 1 (P1 source fixes)
- Run: `npm run build`
- Expected: Workers 1-4 report success, build compiles without errors
- Run: `node --test test/tools/handler-error-propagation.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js test/tools/schema-arg-validation.test.js packages/tools/architecture/dist/index.test.js`
- Expected: All formerly-failing tests now pass (8 failures → 0)

### Checkpoint 2 — After Batch 2 (Config + P3 cleanup)
- Run: `npm run build`
- Expected: Workers 5 and 8 report success
- Run: `COVERAGE=true bash scripts/test.sh`
- Expected: All groups pass with new 75/60/75 thresholds

### Checkpoint 3 — After Batch 3 (Documentation)
- Run: `npm run build`
- Expected: Workers 6 and 7 report success

### Checkpoint 4 — After Batch 4 (Regression Tests)
- Run: `node --test test/tools/handler-error-propagation.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`
- Expected: All new and existing regression tests pass

### Checkpoint 5 — Final verification
- Run: `COVERAGE=true bash scripts/test.sh`
- Cross-check REPORT.md: every issue resolved
- Commit all changes in a single commit

---

## 10. Error Recovery

- **If a fix worker fails**: Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry.
- **If a fix worker fails twice**: Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user.
- **If a regression test worker reports failure (test cannot pass)**: Check whether the test code is wrong or the fix is incomplete. If the test code is wrong, continue the worker to fix it. If the fix is incomplete, go back to the corresponding fix worker.
- **If a regression test passes on the unfixed code**: The test design is invalid — redesign the oracle and dispatch a new worker.
- **If merge conflicts occur**: The coordinator resolves the conflict, then re-runs the batch gate verification.
- **If a fix or regression test breaks existing tests**: Pause. Report which test failed and which worker's change caused it.
- **For FIX-02 (sync-memory-index)**: The createToolRunner schema options must correctly handle the `--instruction-line` multi-value flag. Verify that repeated `--instruction-line` flags produce the same merged array as the original for-loop.
- **For FIX-05 (coverage thresholds)**: If `COVERAGE=true bash scripts/test.sh` fails with 75/60/75 thresholds, report the exact metric that failed. Do NOT lower thresholds without coordinator approval. Consider whether Group 2 package tests can be individually improved to reach thresholds.

---

## 11. Fix History

### Round 13 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-09 (P1: 4, P2: 5, P3: 6)
- **Outcome**: TBD
- **Key notes**: FIX-02 (sync-memory-index) is the most impactful fix — it restores createToolRunner wrapping lost in Round 12 and automatically resolves 4 test failures. FIX-05 (coverage) raises thresholds from 69→75 and adds --check-coverage enforcement for the first time. FIX-03 and FIX-04 fix test infrastructure bugs causing 4 of the 8 failures.

### Round 12 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-10 (P1: 7, P2: 16, P3: 11) — applied in commit `52a42a6`
- **Outcome**: 30/34 issues resolved. Remaining: open-github-issue stderr.write (not actually removed despite commit claim), coverage threshold at 69% (re-appears as Round 13 FIX-05), sync-memory-index createToolRunner regression (new issue — Round 13 FIX-02), test fix regressions (new issues — Round 13 FIX-03, FIX-04)
- **Key notes**: The Round 12 fix commit accidentally removed sync-memory-index's createToolRunner wrapper while fixing the homeDir cross-platform issue. This created 4 new test failures and the P1-2 regression.

### Round 11 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-13 (P1:3, P2:10, P3:5)
- **Outcome**: All resolved in commit `8f2d6a1`

### Round 10 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-16 (P1:2, P2:6, P3:8)
- **Outcome**: All resolved in commit `ddb9863`

### Round 9 — 2026-06-04
- **Issues fixed**: FIX-01 through FIX-13 (P2:5, P3:8)
- **Outcome**: All resolved in commit `17f7e49`

### Round 8 — 2026-06-04
- **Issues fixed**: FIX-01 through FIX-21 (P2:8, P3:13)
- **Outcome**: All resolved in commit `a2e8877`

### Round 7 — 2026-06-04
- **Issues fixed**: FIX-01 through FIX-23 (P1:1, P2:12, P3:10)
- **Outcome**: All resolved in commit `d8ecb99`

### Rounds 1-6 — 2026-06-04
- **Issues fixed**: All Round 1-6 issues resolved
- **Outcome**: Progressive resolution across rounds

---

## 12. Boundaries

### ALWAYS

- Run gate verification immediately after every batch
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them. This is coordination, not implementation.
- **Branch isolation**: Every worker must run on its own isolated branch (named `fix/worker-*` or `fix/regtest-*`). Workers commit their changes to their isolated branch. Never dispatch two workers to the same branch.
- **Merge after each batch**: After every batch completes, merge ALL workers' branches back to the main branch and **verify that all changes from all subagents have been implemented** in the merged result. Do not proceed until every committed change is confirmed present.
- **Clean up agent branches**: After merging a batch, delete all agent branches that were created for that batch's workers. Do not leave any `fix/worker-*` or `fix/regtest-*` branches behind. A clean repo is required before starting the next batch.
- **For FIX-02 (sync-memory-index)**: ensure the worker reads the full file before making changes. The createToolRunner schema must handle the same args as the old for-loop.
- **For FIX-05 (coverage)**: Adding `--check-coverage` will cause CI to fail if thresholds aren't met. If this fails, report the exact metric. Do not silently remove `--check-coverage`.

### ASK FIRST — pause and confirm with the user

- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- **FIX-05 coverage threshold causes CI failure** — if raising to 75/75 fails CI, present options: (a) keep 75/75 and improve coverage for the failing tools, (b) adjust to a compromise threshold
- **FIX-02 (sync-memory-index)**: If createToolRunner's option handling can't support the `--instruction-line` multi-value flag, present alternatives (keep manual for-loop but use formatAppError catch)

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- **Defer any REPORT.md issue to a future round** — every issue has a complete fix plan in this FIX.md
- **Leave agent branches behind** — always clean up after each batch before starting the next
- **Merge without verifying** — always confirm every subagent's changes are present in the merged result
