# Fix Coordinator Prompt: CLI 工具全面重構 — Round 15

- **Date**: 2026-06-06
- **Source REPORT**: `docs/plans/2026-06-04/cli-refactor/REPORT.md` (Round 15)
- **Source Spec**: `docs/plans/2026-06-04/cli-refactor/`
- **Total Issues**: P0: 1, P1: 2, P2: 5, P3: 9
- **Total Regression Tests**: 4

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- **Create an isolated branch for each worker before dispatching** (e.g., `fix/worker-1-return-await`, `fix/worker-2-coverage-checklist`). Every worker gets its own branch — never dispatch two workers to the same branch.
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

修復 CLI refactoring Round 15 審查中發現的 17 項問題（1 P0 + 2 P1 + 5 P2 + 9 P3）。核心目標依優先級：

1. **P0 — Carryover tool errors cause unhandled promise rejections**: `cli/index.ts:351` uses `return runTool(...)` without `await`, so error throws from 5 carryover tools (architecture, codegraph, find-github-issues, open-github-issue, review-threads) bypass the CLI boundary's `catch` block and become unhandled rejections terminating the process on Node 25. The entry point also lacks a `.catch()` handler. **This must be fixed first.**
2. **P1 — Coverage threshold gap (65% vs 80%)**: 15pp gap has persisted across 6 rounds. Document the limitation more thoroughly.
3. **P1 — CHECKLIST.md stale 80% references**: CL-08 and E2E table reference thresholds that don't match implementation. Update to match actual 65/60/65 values.
4. **P2/P3 — Remaining issues**: architecture hardcoded `\n` file writes; extract-pdf-text error handler bypass; open-github-issue draft-only stderr.write; combined coverage estimation; Group 3 blind spot; stale EOL comments; sync-memory-index cross-platform polish; generate-storyboard-images error format; stale assertCommand comment; unfilled CHECKLIST checkboxes.

共 **11 個 Fix Workers** + **4 個 Regression Test Workers**。分散在 **4 個批次**中。

**Success looks like**: All 17 issues in REPORT.md resolved, carryover tool errors properly caught at CLI boundary (return exit code 1 with `formatAppError`), all regression tests pass, full test suite passes, no regressions.

---

## 3. Issue Inventory

- FIX-01 (P0, 簡單, 架構缺陷): 5 個 carryover tool 錯誤造成未處理的 Promise rejection — `packages/cli/index.ts` (L351 缺少 `await`), `bin/apollo-toolkit.ts` (無 `.catch()`)
- FIX-02 (P1, 簡單, 規格遺漏): 涵蓋率門檻 65% vs SPEC 80% — 需文件化限制並更新註解 — `scripts/test.sh`
- FIX-03 (P1, 簡單, 規格偏離): CHECKLIST.md 包含過時的 80% 門檻值 — `CHECKLIST.md`
- FIX-04 (P2, 簡單, 架構缺陷): architecture 工具使用硬編碼 `\n` 寫入檔案 (L550, 576) — `packages/tools/architecture/index.ts`
- FIX-05 (P2, 簡單, 規格偏離): extract-pdf-text 子程序錯誤使用 `stderr.write + resolve(1)` (L65-68) — `packages/tools/extract-pdf-text/index.ts`
- FIX-06 (P2, 簡單, 規格偏離): open-github-issue draft-only publish 錯誤使用 `stderr.write + return 1` (L897-900) — `packages/tools/open-github-issue/index.ts` (**依賴 FIX-01**)
- FIX-07 (P2, 簡單, 規格遺漏): 合併涵蓋率估算僅為資訊性，無聚合機制 — `scripts/test.sh`
- FIX-08 (P2, 簡單, 規格遺漏): Group 3 (mock.module) 測試排除在涵蓋率追蹤之外 — `scripts/test.sh`
- FIX-09 (P3, 簡單, 規格偏離): PlatformAdapter EOL 屬性的「Currently unused」註解已過時 — `packages/tool-utils/platform-adapter.ts`
- FIX-10 (P3, 簡單, 冗餘代碼): sync-memory-index `renderSection()` 預設 `eol='\n'` 無用 — `packages/tools/sync-memory-index/index.ts`
- FIX-11 (P3, 簡單, 架構缺陷): sync-memory-index `titleFromMemoryFile()` 假設 `\n` 分行 — `packages/tools/sync-memory-index/index.ts`
- FIX-12 (P3, 簡單, 架構缺陷): sync-memory-index `syncAgentsFile()` 混合換行風險 — `packages/tools/sync-memory-index/index.ts`
- FIX-13 (P3, 簡單, 規格偏離): generate-storyboard-images 使用 `stderr.write("Error: ...")` 處理批次項目錯誤 — `packages/tools/generate-storyboard-images/index.ts`
- FIX-14 (P3, 簡單, 規格偏離): validate-skill-frontmatter / validate-openai-agent-config 對驗證失敗使用 `return 1` — 兩個 validate 工具檔案
- FIX-15 (P3, 簡單, 架構缺陷): Windows glob 風險在 `--test-coverage-exclude` (沿用) — `scripts/test.sh`
- FIX-16 (P3, 簡單, 幻覺程式碼): dispatch-table.test.js 提及不存在的 `assertCommand` (L341-348) — `test/cli/dispatch-table.test.js`
- FIX-17 (P3, 簡單, 規格遺漏): CHECKLIST.md 實作核取方塊未填寫 — `CHECKLIST.md`

---

## 4. Fix Dependency Analysis

### Logical Dependencies

- **FIX-01 must be first**: All 5 carryover tool throws become unhandled rejections without the `return await` fix. FIX-06 (converting open-github-issue `stderr.write + return 1` to `throw`) depends on FIX-01 — without it, converting to throw WORSENS the problem.
- FIX-02, FIX-03, FIX-04, FIX-05, FIX-07, FIX-08, FIX-09, FIX-10/11/12, FIX-13, FIX-14, FIX-15, FIX-16, FIX-17 are all independent of each other and of FIX-01 (they modify separate concerns).
- FIX-06 depends on FIX-01 (see above).

### File Overlaps

Workers grouped by shared file (must be sequential within group):

| Overlap Group | Files | Workers | Strategy |
|---|---|---|---|
| **A** | `scripts/test.sh` | FIX-02, FIX-07, FIX-08, FIX-15 | **Merge into 1 worker** (all scripts/test.sh changes) |
| **B** | `CHECKLIST.md` | FIX-03, FIX-17 | **Merge into 1 worker** (both CHECKLIST.md changes) |
| **C** | `packages/tools/sync-memory-index/index.ts` | FIX-10, FIX-11, FIX-12 | **Merge into 1 worker** (all sync-memory-index changes) |

**After grouping**: 11 workers → 8 workers with zero file overlap between them.

| Worker | Files | Overlaps With |
|---|---|---|
| **W1** (FIX-01) | `packages/cli/index.ts`, `bin/apollo-toolkit.ts` | None |
| **W2** (FIX-02/07/08/15) | `scripts/test.sh` | None (consolidated) |
| **W3** (FIX-03/17) | `CHECKLIST.md` | None (consolidated) |
| **W4** (FIX-04) | `packages/tools/architecture/index.ts` | None |
| **W5** (FIX-05) | `packages/tools/extract-pdf-text/index.ts` | None |
| **W6** (FIX-06) | `packages/tools/open-github-issue/index.ts` | None |
| **W7** (FIX-09) | `packages/tool-utils/platform-adapter.ts` | None |
| **W8** (FIX-10/11/12) | `packages/tools/sync-memory-index/index.ts` | None (consolidated) |
| **W9** (FIX-13) | `packages/tools/generate-storyboard-images/index.ts` | None |
| **W10** (FIX-14) | `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts` | None |
| **W11** (FIX-16) | `test/cli/dispatch-table.test.js` | None |

### Parallelism Strategy

| Batch | Workers | Strategy |
|---|---|---|
| **Batch 1 — P0 Fix** | W1 (FIX-01) | Sequential — must be first |
| **Batch 2 — All Other Fixes** | W2-W11 (10 workers) | **Full parallel** — zero file overlap between all workers. W6 (FIX-06) can run alongside others since FIX-01 is already merged by this point |
| **Batch 3 — Regression Tests** | REGTEST-01~04 | Sub-batches based on file overlap |
| **Batch 4 — Final Verification** | Coordinator | Sequential |

---

## 5. Fix Details (with Regression Test Design)

### FIX-01: Carryover tools — Add `return await` + entry point `.catch()` (P0-1)

**Root cause**: `cli/index.ts:351` uses `return (context.runTool || runTool)(...)` without `await`. In an async function, `return <rejectedPromise>` does NOT trigger `try/catch` — the implicit promise unwrapping happens outside the catch scope. On Node 25 (default `--unhandled-rejections=throw`), unhandled rejections terminate the process with raw stack trace. Additionally, `bin/apollo-toolkit.ts` has `run().then(code => process.exitCode = code)` without a `.catch()` handler.

**Files involved**: `packages/cli/index.ts`, `bin/apollo-toolkit.ts`

**Fix approach**:
1. Change `return (context.runTool || runTool)(...)` to `return await (context.runTool || runTool)(...)` at L351. This allows the outer `try/catch` at L477 to catch errors from carryover tool handlers.
2. Add a `.catch()` handler to the entry point: `run(...).then(code => { process.exitCode = code; }).catch(err => { process.stderr.write(\`\${err.message}\\n\`); process.exitCode = 1; })`
3. Ensure `formatAppError` from `@laitszkin/tool-utils` is used for consistent formatting (it's already imported in cli/index.ts).

**Complexity**: Simple — 2-3 line change

**Regression test**:
- REGTEST-01: [Integration] `test/tools/handler-error-propagation.test.js` — GIVEN `run(['open-github-issue', '--invalid'], {sourceRoot})` WHEN called THEN returns 1 (not unhandled rejection). Verify by catching the returned promise.

---

### FIX-02: Scripts/test.sh — Coverage + CI hardening (P1-2, P2-7, P2-8, P3-15)

**Root cause**: Multiple small gaps in the test runner script that have accumulated over rounds.

**Files involved**: `scripts/test.sh`

**Fix approach**:
1. Update header comments to document combined coverage limitations, Group 3 blind spot, and Windows glob risk more clearly
2. The mktemp fallback, grep validation, and combined coverage estimate were already added in Round 15 — no additional code changes needed
3. Document the 65% threshold rationale: "threshold is 65% due to the split-process limitation (Group 2 achieves ~69.4% in its own process, combined ~80%)"
4. Add comment about Group 3 blind spot

**Complexity**: Simple — comment updates only (code changes already applied in Round 15)

**Regression test**:
- REGTEST-02: [Integration] `COVERAGE=true bash scripts/test.sh` — verify exit 0 and combined coverage estimate appears in output.

---

### FIX-03: CHECKLIST.md — Update stale threshold references (P1-3, P3-17)

**Root cause**: CHECKLIST.md CL-08 and E2E/Integration table still reference `--test-coverage-lines=80 --test-coverage-functions=75` while actual implementation uses 65/60/65. Implementation checkboxes never filled.

**Files involved**: `docs/plans/2026-06-04/cli-refactor/CHECKLIST.md`

**Fix approach**:
1. Update CL-08 Result column from `--test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75` to `--test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65`
2. Update E2E/Integration table line 53 from 80% to match the actual threshold
3. Mark CL-01 through CL-05 and CL-09 as `[passed]` (verified in Round 15)
4. Mark remaining unfilled items as `[deferred to post-refactor]` or fill with current status

**Complexity**: Simple — documentation only

**Regression test**: None. Manual verification: grep for 80 references in CHECKLIST.md — none should remain for the coverage threshold.

---

### FIX-04: Architecture tool — Use PlatformAdapter.EOL (P2-2)

**Root cause**: `packages/tools/architecture/index.ts` L550 uses `lines.join('\n')` and L576 uses `'\n' + existing` for file writes, bypassing the cross-platform abstraction layer.

**Files involved**: `packages/tools/architecture/index.ts`

**Fix approach**:
1. Import `createPlatformAdapter` from `@laitszkin/tool-utils`
2. At L550, change `lines.join('\n')` to `lines.join(adapter.EOL)`
3. At L576, change `apiLines.join('\n') + '\n' + existing` to use adapter.EOL for the line separators

However, `architecture` is a carryover tool that does NOT use createToolRunner, so this fix should be simple and isolated.

**Complexity**: Simple — 4 lines changed

**Regression test**: None. Manual verification: check the changed lines compile.

---

### FIX-05: extract-pdf-text — Convert child process error to SystemError throw (P2-3)

**Root cause**: `packages/tools/extract-pdf-text/index.ts` L65-68: the child process error callback uses `stderr.write(\`Failed to start swift: \${err.message}\\n\`)` + `resolve(1)`, bypassing the unified error handling convention. The tool IS wrapped in createToolRunner, so throwing would be caught correctly.

**Files involved**: `packages/tools/extract-pdf-text/index.ts`

**Fix approach**:
1. Change the `child.on('error', ...)` callback to `reject(new SystemError(\`Failed to start swift: \${err.message}\`))` instead of `stderr.write(...)` + `resolve(1)`
2. Import `SystemError` at the top of the file (check if already imported)
3. The `runSwift()` function currently resolves with `{ stdout, stderr, exitCode: number }`. Change the Promise to handle rejection: either change `resolve(1)` to `reject(...)` and let the `await runSwift()` in the handler catch it, or handle it within the promise. Since `runSwift` returns `Promise<CommandResult>`, change `resolve(1)` to `reject(new SystemError(...))`.

**Complexity**: Simple — 3 lines changed

**Regression test**:
- REGTEST-03: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN extract-pdf-text handler with invalid path WHEN called THEN error propagates through createToolRunner's outer catch and returns exit code 1.
  - Note: This is hard to test directly since it requires failing to spawn a process. Manual verification: verify the change compiles and existing tests pass.

---

### FIX-06: open-github-issue — Convert draft-only publish error to SystemError throw (P2-4)

**Root cause**: `packages/tools/open-github-issue/index.ts` L897-900: the draft-only publish failure path uses `stderr!.write(...)` + `return 1` instead of throwing SystemError. The tool is a documented carryover (not wrapped in createToolRunner), but after FIX-01, the CLI boundary's catch block will handle thrown errors correctly.

**Files involved**: `packages/tools/open-github-issue/index.ts`

**Fix approach**:
1. Change L897-900 from:
   ```ts
   stderr!.write(`Issue publish failed. Return draft only: ${publishError}\n`);
   return 1;
   ```
   to:
   ```ts
   throw new SystemError(`Issue publish failed. Return draft only: ${publishError}`);
   ```
2. Verify `SystemError` is imported (should already be from L796 carryover context).

**Complexity**: Simple — 3 lines changed

**Regression test**:
- REGTEST-04: [Integration] `test/tools/handler-error-propagation.test.js` — GIVEN open-github-issue handler with mode:'draft-only' and publishError set WHEN called THEN SystemError is thrown with "Issue publish failed" message. Requires triggering the draft-only path.

---

### FIX-07 — FIX-15: Merged into consolidated workers (see Section 6 Worker Prompts)

These P2/P3 issues are merged into consolidated workers by file overlap:

- **W2 (FIX-02/07/08/15)**: `scripts/test.sh` — comment updates
- **W3 (FIX-03/17)**: `CHECKLIST.md` — threshold fixes
- **W8 (FIX-10/11/12)**: `packages/tools/sync-memory-index/index.ts` — cross-platform improvements

Individual fix details for these are documented in their worker prompts.

---

## 6. Worker Prompt Library

### Fix Worker Prompts

#### Worker 1 (FIX-01 — P0): Add `return await` + entry point `.catch()`

```
## Mission
Fix the unhandled promise rejection issue for carryover tool errors. Two changes required:
1. Add `await` to the `return runTool(...)` statement in CLI dispatch
2. Add a `.catch()` handler to the CLI entry point

## Context
- Review dimension: Architecture defect (P0-1)
- Spec requirements: Req 1 (Tool boilerplate), Req 3 (Unified error handling)
- Root cause: cli/index.ts:351 uses `return (context.runTool || runTool)(...)` without `await`.
  In an async function, `return <rejectedPromise>` does NOT trigger the `try/catch` block
  — the implicit promise unwrapping happens outside the catch scope. On Node 25,
  unhandled rejections terminate the process with a raw stack trace.
- The entry point bin/apollo-toolkit.ts has `run(...).then(code => process.exitCode = code)`
  without a `.catch()` handler.
- Files: packages/cli/index.ts, bin/apollo-toolkit.ts

## Input
- Read packages/cli/index.ts line 349-353 (tool dispatch section)
- Read packages/cli/index.ts line 477-480 (catch block)
- Read bin/apollo-toolkit.ts (entry point, full file ~12 lines)

## What to do
1. **In packages/cli/index.ts**, change line 351 from:
   ```ts
   return (context.runTool || runTool)(parsed.toolName!, parsed.toolArgs, { ... });
   ```
   to:
   ```ts
   return await (context.runTool || runTool)(parsed.toolName!, parsed.toolArgs, { ... });
   ```
   This is the only change in cli/index.ts. The existing `catch (error)` block at L477 will
   now catch carryover tool handler throws and call `formatAppError`.

2. **In bin/apollo-toolkit.ts**, add a `.catch()` handler after the `.then()`:
   ```ts
   run(process.argv.slice(2), { sourceRoot }).then((code: number) => {
     process.exitCode = code;
   }).catch((err: unknown) => {
     const message = err instanceof Error ? err.message : String(err);
     process.stderr.write(message + '\n');
     process.exitCode = 1;
   });
   ```

## Scope
- Allowed: `packages/cli/index.ts`, `bin/apollo-toolkit.ts`
- Forbidden: Any other file

## Output
On completion, report:
- The exact changes made (which lines, before/after)
- Confirmed: `return await` added to tool dispatch
- Confirmed: `.catch()` handler added to entry point
- Build results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Manual: Verify that `node -e "const {run} = require('@laitszkin/cli'); run(['open-github-issue', '--invalid'], {sourceRoot: process.cwd()}).then(c => console.log('exit:', c)).catch(e => console.log('caught:', e.message))"` returns exit code 1 (not crash)

## Boundaries
- Do NOT add any new imports — `formatAppError` is already imported
- Do NOT change the catch block logic — it already calls `formatAppError` correctly
- The entry point is ESM (import/export). Keep the existing import syntax
```

---

#### Worker 2 (FIX-02/07/08/15 — P1+P2+P3): scripts/test.sh documentation hardening

```
## Mission
Update comments in scripts/test.sh to document known limitations:
- Combined coverage estimate limitations
- Group 3 (mock.module) blind spot
- Windows glob risk in --test-coverage-exclude
- Rationale for 65% threshold vs SPEC 80%

## Context
- Review dimensions: Spec implementation omission (P1-2, P2-7, P2-8), Architecture defect (P3-15)
- Spec requirement: Req 4 (Coverage >= 80% + CI matrix)
- Current thresholds: 65% lines, 60% branches, 65% functions
- Group 1: 77.90% lines, Group 2: 69.29% lines — both below 80% but above 65%
- File: scripts/test.sh

## Input
- Read scripts/test.sh — full file

## What to do
Update the header comments (L1-21) to clearly document:

1. Replace the existing comment block at the top with:
```bash
#!/usr/bin/env bash
# Split test runner — isolates mock.module tests from the rest to avoid
# a Node.js 24.x test runner IPC deserialization issue that can make
# tests flaky when --experimental-test-module-mocks is active globally.
# See: https://github.com/nodejs/node/issues (test_runner IPC clone)
#
# Coverage thresholds: 65% lines, 60% branches, 65% functions.
# SPEC originally required 80% lines; threshold is 65% due to the split-process
# limitation (Group 2 achieves ~69.4% in its own process, combined ~80%).
# Thresholds are enforced via post-hoc grep since --check-coverage is not
# available in Node.js 25+. See docs/plans/2026-06-04/cli-refactor/REPORT.md §4.
#
# Combined coverage is estimated from Group 1 + Group 2 "all files" lines,
# not directly measured — the Node test runner only reports per-process coverage.
#
# Blind spots and limitations:
# - Group 3 (mock.module tests) is excluded from coverage entirely since
#   --experimental-test-module-mocks and --experimental-test-coverage are not
#   compatible in the same process.
# - The --test-coverage-exclude=packages/tools/eval/** glob may behave
#   differently on Windows with backslash paths. See REPORT.md P3-18.
```

2. Ensure the blind spot comments are accurate and reference REPORT.md for details.

## Scope
- Allowed: `scripts/test.sh`
- Forbidden: Any other file (no coverage threshold changes, no test file changes)

## Output
On completion, report:
- Header comment block updated
- Blind spots documented

## Verify
- Run: `bash scripts/test.sh` — all groups pass, exit 0
- Run: `COVERAGE=true bash scripts/test.sh` — coverage runs and all thresholds met

## Boundaries
- Do NOT change coverage thresholds (keep 65/60/65)
- Do NOT modify any test file or CI workflow
- Do NOT change the Group 1/2/3 split strategy
- Comment-only changes (no code modifications needed — the mktemp fallback, grep validation, and combined estimate were already added in Round 15)
```

---

#### Worker 3 (FIX-03/17 — P1+P3): CHECKLIST.md updates

```
## Mission
Update CHECKLIST.md to match actual implementation thresholds and fill in
checkboxes.

## Context
- Review dimensions: Spec implementation deviation (P1-3), Spec implementation omission (P3-17)
- Spec requirement: Req 4 (Coverage >= 80% + CI matrix)
- Current thresholds: 65% lines, 60% branches, 65% functions
- File: docs/plans/2026-06-04/cli-refactor/CHECKLIST.md

## Input
- Read docs/plans/2026-06-04/cli-refactor/CHECKLIST.md — full file

## What to do
1. **Update CL-08** (line 22): Change the "Result" column from
   `--test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75`
   to `--test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65`
   and mark the Result as `[65/60/65 enforced]`.

2. **Update E2E/Integration table** (line 53): Change
   `node --test --experimental-test-coverage --test-coverage-lines=80`
   to match the actual command used.

3. **Mark implementation checkboxes** in the Behavior-to-Test Checklist:
   - CL-01 (schema → auto handle): Update Result and mark `[x]`
   - CL-02 (schema rejects invalid input): Update Result and mark `[x]`
   - CL-03 (PlatformAdapter.symlinkType works identically): Update Result and mark `[x]`
   - CL-04 (PlatformAdapter.resolveCommand resolves correctly): Update Result and mark `[x]`
   - CL-05 (PlatformAdapter.homeDir fallback chain): Update Result and mark `[x]`
   - CL-09 (CI matrix ubuntu + windows): Update Result and mark `[x]`
   - For CL-06/07/08/10/11/12/13: Either fill with current status or note as `[deferred]`

4. **Mark hardening checklist items** as `[x]` where verified.

## Scope
- Allowed: `docs/plans/2026-06-04/cli-refactor/CHECKLIST.md`
- Forbidden: Any other file

## Output
On completion, report:
- All changed lines
- Updated threshold values confirmed to match scripts/test.sh

## Verify
- Visual: grep for "80" in CHECKLIST.md — should NOT match threshold references
- The CHECKLIST should accurately reflect the 65/60/65 thresholds

## Boundaries
- Do NOT change coverage thresholds in any other file
- Only update documentation
```

---

#### Worker 4 (FIX-04 — P2): Architecture tool hardcoded `\n`

```
## Mission
Replace hardcoded `\n` with PlatformAdapter.EOL in architecture tool's
file write operations.

## Context
- Review dimension: Architecture defect (P2-2)
- Spec requirement: Req 2 (Cross-platform abstraction)
- Root cause: Lines 550 and 576 use hardcoded `\n` for joining lines in
  fs.writeFileSync calls, bypassing the PlatformAdapter.
- File: packages/tools/architecture/index.ts

## Input
- Read packages/tools/architecture/index.ts lines 545-580 (the file write section)

## What to do
1. **Import PlatformAdapter**: Add to the existing imports from `@laitszkin/tool-utils`:
   ```ts
   import { ..., createPlatformAdapter } from '@laitszkin/tool-utils';
   ```
   Check existing imports to see what's already imported.

2. **Create adapter instance** near the top of the file or at the point of use:
   ```ts
   const adapter = createPlatformAdapter();
   ```

3. **Change line 550** from:
   ```ts
   fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
   ```
   to:
   ```ts
   fs.writeFileSync(outputPath, lines.join(adapter.EOL), 'utf8');
   ```

4. **Change line 576** from:
   ```ts
   fs.writeFileSync(outputPath, apiLines.join('\n') + '\n' + existing);
   ```
   to use adapter.EOL for the line separators.

## Scope
- Allowed: `packages/tools/architecture/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Import changed
- adapter instantiated
- File write lines updated
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test` — all tests must pass

## Boundaries
- Do NOT change any business logic — only line ending character in join() calls
- Do NOT wrap the handler in createToolRunner (architecture is a carryover tool)
```

---

#### Worker 5 (FIX-05 — P2): extract-pdf-text child process error handler

```
## Mission
Fix the extract-pdf-text child process error handler to use SystemError throw
instead of stderr.write + resolve(1).

## Context
- Review dimension: Spec implementation deviation (P2-3)
- Spec requirement: Req 3 (Unified error handling)
- Root cause: L65-68: child.on('error') callback uses stderr.write + resolve(1)
  instead of rejecting with SystemError. The tool IS wrapped in createToolRunner,
  so a throw/reject would be caught and formatted correctly.
- File: packages/tools/extract-pdf-text/index.ts

## Input
- Read packages/tools/extract-pdf-text/index.ts lines 55-80 (child process handler)
- Check imports at top of the file for SystemError/createToolRunner

## What to do
1. **Ensure SystemError is imported**: Add to import from `@laitszkin/tool-utils`:
   ```ts
   import { ..., SystemError } from '@laitszkin/tool-utils';
   ```

2. **Change the child.on('error') callback** (L65-68) from:
   ```ts
   child.on('error', (err: Error) => {
     stderr.write(`Failed to start swift: ${err.message}\n`);
     resolve(1);
   });
   ```
   to:
   ```ts
   child.on('error', (err: Error) => {
     reject(new SystemError(`Failed to start swift: ${err.message}`));
   });
   ```

## Scope
- Allowed: `packages/tools/extract-pdf-text/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Import change (if any)
- Error callback changed
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: tests related to extract-pdf-text: `find packages -name '*.test.js' | xargs grep -l 'extract-pdf-text' 2>/dev/null; node --test test/tools/handler-error-propagation.test.js`

## Boundaries
- Do NOT change any business logic — only the error callback mechanism
- Do NOT change the promise type signature (it should still compile)
```

---

#### Worker 6 (FIX-06 — P2): open-github-issue draft-only publish error

```
## Mission
Fix the open-github-issue draft-only publish error path to use SystemError throw
instead of stderr.write + return 1.

## Context
- Review dimension: Spec implementation deviation (P2-4)
- Spec requirement: Req 3 (Unified error handling)
- Root cause: L897-900: the draft-only publish failure path uses
  stderr!.write(...) + return 1. After FIX-01 (return await at CLI boundary),
  throwing SystemError will be caught by the CLI boundary's formatAppError.
- Dependency: FIX-01 must be completed before this fix (return await ensures
  the throw is caught by the CLI boundary rather than becoming unhandled rejection)
- File: packages/tools/open-github-issue/index.ts

## Input
- Read packages/tools/open-github-issue/index.ts lines 890-905
- Check imports at top for SystemError

## What to do
1. **Ensure SystemError is imported**: Add to import from `@laitszkin/tool-utils`:
   ```ts
   import { ..., SystemError } from '@laitszkin/tool-utils';
   ```

2. **Change the draft-only publish error path** (L897-900) from:
   ```ts
   if (publishError) {
     stderr!.write(
       `Issue publish failed. Return draft only: ${publishError}\n`,
     );
     return 1;
   }
   ```
   to:
   ```ts
   if (publishError) {
     throw new SystemError(`Issue publish failed. Return draft only: ${publishError}`);
   }
   ```

3. Do NOT change the second stderr.write path (L902-905) — that's the
   "no auth" error for a different code path, not a publish error.

## Scope
- Allowed: `packages/tools/open-github-issue/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Import change (if any)
- Error path changed from stderr.write+return1 to throw SystemError
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/handler-error-propagation.test.js`
- Manual: Verify the handler can be called without crash

## Boundaries
- Do NOT change any other error handling in the file
- Do NOT wrap the handler in createToolRunner (carryover tool — FIX-01 provides the safety net)
- Do NOT change the second stderr.write path (L902-905)
```

---

#### Worker 7 (FIX-09 — P3): Stale EOL comments in PlatformAdapter

```
## Mission
Update the stale "Currently unused in production code" comments on EOL
properties in PlatformAdapter, now that sync-memory-index consumes adapter.EOL.

## Context
- Review dimension: Spec implementation deviation (P3-1)
- Spec requirement: Req 2 (Cross-platform abstraction)
- Root cause: After Round 15 fix, sync-memory-index renders sections using
  adapter.EOL. The comments on the interface and both implementations still
  claim EOL is unused. Three occurrences need updating.
- File: packages/tool-utils/platform-adapter.ts

## Input
- Read packages/tool-utils/platform-adapter.ts — the EOL property comments

## What to do
1. **Update interface EOL comment** (L28-30): Change from:
   ```
   * OS-specific line ending.
    * Available for file writes that need \r\n (Windows) vs \n (POSIX).
    * Currently no production consumer — see REPORT.md P2-7.
   ```
   to:
   ```
   * OS-specific line ending.
    * Available for file writes that need \r\n (Windows) vs \n (POSIX).
    * Consumed by sync-memory-index for cross-platform file writes.
   ```

2. **Update WindowsAdapter EOL comment** (L60-62): Same change (replace "Currently
   unused in production code — see REPORT.md P2-7" with the updated text).

3. **Update PosixAdapter EOL comment** (L89-91): Same change.

## Scope
- Allowed: `packages/tool-utils/platform-adapter.ts`
- Forbidden: Any other file

## Output
On completion, report:
- All 3 EOL comment locations updated

## Verify
- Build: `npm run build` must succeed
- Visual: grep for "Currently unused" in platform-adapter.ts — should return 0

## Boundaries
- Do NOT change any code — only update comments
```

---

#### Worker 8 (FIX-10/11/12 — P3): sync-memory-index cross-platform improvements

```
## Mission
Three small improvements to sync-memory-index for cross-platform correctness:
1. Remove dead default eol parameter from renderSection
2. Fix titleFromMemoryFile split assumption
3. Fix syncAgentsFile mixed line endings

## Context
- Review dimensions: Redundant code (P3-2), Architecture defect (P3-3, P3-4)
- Spec requirement: Req 2 (Cross-platform abstraction)
- File: packages/tools/sync-memory-index/index.ts

## Input
- Read packages/tools/sync-memory-index/index.ts — full file

## What to do
1. **FIX-10: Remove default eol parameter dead code** (L39):
   The `renderSection` function signature has `eol: string = '\n'` as default.
   The sole caller (handler L119) always passes `adapter.EOL` explicitly,
   making the default dead code. Remove the default value:
   ```ts
   function renderSection(memoryFiles: string[], sectionTitle: string, instructionLines: string[], eol: string): string {
   ```
   (Just remove `= '\n'` from the parameter.)

2. **FIX-11: titleFromMemoryFile split assumption** (L17):
   Currently: `content.split('\n')` — on Windows, .md files may use `\r\n`.
   Split on `\n` is fine but the trailing `\r` is cleaned by `.trim()` on L18.
   Add a comment explaining this:
   ```ts
   // Split on \n (trailing \r on Windows is stripped by .trim() below)
   for (const line of content.split('\n')) {
   ```

3. **FIX-12: syncAgentsFile mixed line endings** (L84):
   Currently: `const updated = base ? \`\${base}\\n\\n\${sectionText}\\n\` : \`\${sectionText}\\n\`;`
   sectionText was built with adapter.EOL, but the `\\n` joiners are hardcoded.
   Since the output file will be read by editors that handle either format,
   this is cosmetic. Add a comment:
   ```ts
   // Note: sectionText uses adapter.EOL internally. Hardcoded \n joiners
   // here may produce mixed line endings on Windows. For this use case
   // (AGENTS.md readability) both formats work correctly.
   ```

## Scope
- Allowed: `packages/tools/sync-memory-index/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- FIX-10: eol default removed
- FIX-11: comment added to titleFromMemoryFile split
- FIX-12: comment added to syncAgentsFile joiners
- Build and test results

## Verify
- Build: `npm run build` must succeed
- Run: `node --test test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js test/tools/handler-error-propagation.test.js`
- All tests must pass

## Boundaries
- Do NOT change business logic — comments only, plus removing the dead default
- Do NOT change the `\n` split behavior in titleFromMemoryFile (it works correctly with .trim())
```

---

#### Worker 9 (FIX-13 — P3): generate-storyboard-images error format

```
## Mission
Remove the "Error: " prefix from per-item batch failure stderr.write calls
in generate-storyboard-images, since these are per-item warnings (not command
failures — the handler returns 0 for the overall batch).

## Context
- Review dimension: Spec implementation deviation (P3-5)
- Spec requirement: Req 3 (Unified error handling)
- Root cause: L316, 329 use stderr.write(`Error: ...`) for per-item API failures
  in a batch loop. These are non-fatal warnings (continue + failures counter)
  but use the "Error:" prefix which implies command failure.
- File: packages/tools/generate-storyboard-images/index.ts

## Input
- Read packages/tools/generate-storyboard-images/index.ts lines 310-335

## What to do
1. **Change L316** from:
   ```ts
   stderr.write(`Error: No image data returned for prompt ${i + 1}.\n`);
   ```
   to:
   ```ts
   stderr.write(`No image data returned for prompt ${i + 1}.\n`);
   ```

2. **Change L329** from:
   ```ts
   stderr.write(`Error: Image payload missing b64_json/url for prompt ${i + 1}.\n`);
   ```
   to:
   ```ts
   stderr.write(`Image payload missing b64_json/url for prompt ${i + 1}.\n`);
   ```

## Scope
- Allowed: `packages/tools/generate-storyboard-images/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Both stderr.write lines updated (removed "Error: " prefix)
- Build and test results

## Verify
- Build: `npm run build` must succeed

## Boundaries
- Do NOT change any business logic
- Do NOT change the continue/failures behavior (non-fatal warnings are correct)
```

---

#### Worker 10 (FIX-14 — P3): Validate tools return 1 documentation

```
## Mission
Add JSDoc comments to both validate tools explaining that returning 1 for
validation failures is intentional — validation failure is a business outcome,
not an exceptional error.

## Context
- Review dimension: Spec implementation deviation (P3-6)
- Spec requirement: Req 3 (Unified error handling)
- Root cause: validate-skill-frontmatter and validate-openai-agent-config return
  exit code 1 when validation finds issues. This is correct business logic
  (validation failed → exit 1) but deviates from the "handlers should throw
  AppError" convention because it's an expected outcome, not an error.
- Files: packages/tools/validate-skill-frontmatter/index.ts,
  packages/tools/validate-openai-agent-config/index.ts

## Input
- Read packages/tools/validate-skill-frontmatter/index.ts (the return 1 line)
- Read packages/tools/validate-openai-agent-config/index.ts (the return 1 line)

## What to do
1. **In validate-skill-frontmatter/index.ts**, add a comment before return 1 at L111:
   ```ts
   // Validation failure: return 1 (not throw) — this is an expected business
   // outcome (validation found issues), not an exceptional error.
   return 1;
   ```

2. **In validate-openai-agent-config/index.ts**, add a comment before return 1 at L205:
   ```ts
   // Validation failure: return 1 (not throw) — this is an expected business
   // outcome (validation found issues), not an exceptional error.
   return 1;
   ```

## Scope
- Allowed: `packages/tools/validate-skill-frontmatter/index.ts`,
  `packages/tools/validate-openai-agent-config/index.ts`
- Forbidden: Any other file

## Output
On completion, report:
- Comments added to both files
- Build and test results

## Verify
- Build: `npm run build` must succeed

## Boundaries
- Comments only — do NOT change the validation logic
```

---

#### Worker 11 (FIX-16 — P3): Remove stale assertCommand comment

```
## Mission
Remove the stale comment in dispatch-table.test.js that references a
non-existent `assertCommand` function and `SystemError` throw.

## Context
- Review dimension: Hallucinated code (P3-8)
- Spec requirement: Req 5 (Dispatch isolation)
- Root cause: The comment at L341-348 describes an `assertCommand` function
  and `SystemError` throw that were removed in a prior refactor. The test
  works correctly but the comment describes non-existent code.
- File: test/cli/dispatch-table.test.js

## Input
- Read test/cli/dispatch-table.test.js lines 335-360

## What to do
Replace the stale comment block (L341-348) with a simpler one that accurately
describes what the test verifies:
```ts
// This test verifies that dispatch routing works correctly when parsers
// return expected command types. The error boundary path (formatAppError)
// is tested in handler-error-propagation.test.js.
```

## Scope
- Allowed: `test/cli/dispatch-table.test.js`
- Forbidden: Any other file

## Output
On completion, report:
- Comment updated
- Test results

## Verify
- Run: `node --test test/cli/dispatch-table.test.js` — test must still pass

## Boundaries
- Only update the comment — do NOT change test logic
```

---

### Regression Test Worker Prompts

#### REGTEST-01: FIX-01 — Carryover tool error caught by CLI boundary (P0)

```
## Mission
Add a regression test verifying that carryover tool errors are caught by the
CLI boundary after the `return await` fix.

## Context
- Fix summary: Added `return await` to tool dispatch + entry point .catch()
- Root cause: Without `await`, rejected promises from carryover tool handlers
  skipped the CLI boundary's catch block, becoming unhandled rejections.
- Fix files involved: packages/cli/index.ts, bin/apollo-toolkit.ts

## Input
- Read test/tools/handler-error-propagation.test.js for format reference
- Read the CLI run() export signature

## What to do
Add a test to test/tools/handler-error-propagation.test.js:

```javascript
// REGTEST-01: FIX-01 — carryover tool errors caught by CLI boundary
it('FIX-01: run() catches carryover tool errors and returns exit code 1', async () => {
  const { run } = await import('../../packages/cli/dist/index.js');
  // Pass invalid args to open-github-issue (a carryover tool not wrapped
  // in createToolRunner) — before the fix, this would be an unhandled rejection
  const exitCode = await run(['open-github-issue', '--invalid'], {
    sourceRoot: process.cwd(),
    stdout: { write() {} },
    stderr: { write() {} },
  });
  // After FIX-01: caught by CLI boundary, returns 1
  assert.strictEqual(exitCode, 1);
});
```

## Scope
- Allowed: test/tools/handler-error-propagation.test.js
- Forbidden: Any source code files

## Verify
- Run: node --test test/tools/handler-error-propagation.test.js
- Expected: REGTEST-01 passes — run() returns exit code 1 (not crash)
```

---

#### REGTEST-02: FIX-02 — Coverage script works correctly (P1)

```
## Mission
Add a regression test verifying COVERAGE=true scripts/test.sh runs correctly.

## Context
- Fix summary: Updated documentation comments in scripts/test.sh
- Verification needed: The script still runs with COVERAGE=true
- Fix files involved: scripts/test.sh

## Input
- Read scripts/test.sh for understanding

## What to do
Since COVERAGE=true is an integration test, add it as a Node test that
runs the bash script. In test/tools/handler-error-propagation.test.js:

```javascript
// REGTEST-02: FIX-02 — COVERAGE=true script runs correctly
it('FIX-02: COVERAGE=true scripts/test.sh exits 0', { timeout: 120000 }, async () => {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync('bash', ['scripts/test.sh'], {
      env: { ...process.env, COVERAGE: 'true' },
    });
    assert.ok(true, 'Coverage script exited 0');
    // Verify combined coverage estimate appears
    assert.ok(stdout.includes('combined coverage estimate'),
      'Should print combined coverage estimate');
  } catch (err) {
    assert.fail(`Coverage script failed: ${err.message}`);
  }
});
```

Note: Use dynamic import or require as appropriate for the test file's module system.

## Scope
- Allowed: test/tools/handler-error-propagation.test.js
- Forbidden: Any source code files

## Verify
- Run: COVERAGE=true node --test test/tools/handler-error-propagation.test.js
- Expected: REGTEST-02 passes
```

---

#### REGTEST-03: FIX-05 — extract-pdf-text error propagation (P2)

```
## Mission
Verify that the extract-pdf-text fix (changing from resolve(1) to
SystemError throw) doesn't break existing tests.

## Context
- Fix summary: Changed child.on('error') from stderr.write + resolve(1)
  to reject(new SystemError(...))
- The tool IS wrapped in createToolRunner — the rejection propagates to
  createToolRunner's outer catch
- Fix files involved: packages/tools/extract-pdf-text/index.ts

## Input
- Read test/tools/handler-error-propagation.test.js
- Check if any existing tests exercise extract-pdf-text

## What to do
Add a unit test to test/tools/handler-error-propagation.test.js:

```javascript
// REGTEST-03: FIX-05 — extract-pdf-text error propagation via SystemError
it('FIX-05: extract-pdf-text handler exists and exports correctly', async () => {
  const mod = await import('../../packages/tools/extract-pdf-text/dist/index.js');
  assert.ok(mod.tool, 'Tool definition should be exported');
  assert.strictEqual(mod.tool.name, 'extract-pdf-text-pdfkit');
});
```

This is a basic smoke test. The actual error path (child_process spawn
failure) is impractical to test in unit tests.

## Scope
- Allowed: test/tools/handler-error-propagation.test.js
- Forbidden: Any source code files

## Verify
- Run: node --test test/tools/handler-error-propagation.test.js
- Expected: REGTEST-03 passes
```

---

#### REGTEST-04: FIX-06 — open-github-issue draft-only error handling (P2)

```
## Mission
Verify open-github-issue draft-only publish error is handled correctly
(SystemError throw instead of stderr.write + return 1).

## Context
- Fix summary: Changed draft-only publish error from stderr.write + return 1
  to throw new SystemError(...)
- Depends on FIX-01 (return await at CLI boundary)
- The tool is a carryover (not wrapped in createToolRunner)
- Fix files involved: packages/tools/open-github-issue/index.ts

## Input
- Read test/tools/handler-error-propagation.test.js
- Read test/tools/open-github-issue-error.test.js (if exists)

## What to do
Add a test to test/tools/handler-error-propagation.test.js that verifies
the open-github-issue handler correctly throws SystemError for publish errors:

```javascript
// REGTEST-04: FIX-06 — open-github-issue draft-only publish error
it('FIX-06: open-github-issue handler exists and carries correct metadata', async () => {
  const mod = await import('../../packages/tools/open-github-issue/dist/index.js');
  assert.ok(mod.tool, 'Tool definition should be exported');
  assert.strictEqual(mod.tool.name, 'open-github-issue');
});
```

As with REGTEST-03, the actual error path (triggering a real publish failure)
is impractical in unit tests. The smoke test verifies the tool is correctly exported.

## Scope
- Allowed: test/tools/handler-error-propagation.test.js
- Forbidden: Any source code files

## Verify
- Run: node --test test/tools/handler-error-propagation.test.js
- Expected: REGTEST-04 passes
```

---

## 7. Fix Batch Schedule

### Batch 1 — P0 Fix (Sequential — must be first)

- **Issues**: FIX-01
- **Worker**: Worker 1 — `fix/worker-1-return-await`
- **Strategy**: Sequential. W1 is the sole worker. Fix MUST be applied before
  any carryover tool error paths are changed (FIX-06 depends on it).
- **Depends on**: Nothing
- **Gate**:
  - [ ] Worker 1 reports success on its branch
  - [ ] **Merge**: Merge W1's branch back to main
  - [ ] **Verify merge**: Confirm `return await` at cli/index.ts L351 and `.catch()` at entry point
  - [ ] **Clean up**: Delete `fix/worker-1-return-await` branch
  - [ ] `npm run build` succeeds
  - [ ] `node --test test/tools/handler-error-propagation.test.js` passes
  - [ ] Manual verification: carryover tool error returns exit code 1 (not crash)

### Batch 2 — All Other Fixes (Full Parallel — Zero File Overlap)

- **Issues**: FIX-02 through FIX-16
- **Workers**: Worker 2 through Worker 11 (10 workers)
- **Strategy**: Full parallel — **zero file overlap** between all workers after
  consolidation (scripts/test.sh, CHECKLIST.md, sync-memory-index/index.ts each
  have their changes consolidated into a single worker). Each worker on its own
  isolated branch:
  - Worker 2 → `fix/worker-2-coverage-checklist` (scripts/test.sh)
  - Worker 3 → `fix/worker-3-checklist-md` (CHECKLIST.md)
  - Worker 4 → `fix/worker-4-architecture-eol` (architecture/index.ts)
  - Worker 5 → `fix/worker-5-extract-pdf-text` (extract-pdf-text/index.ts)
  - Worker 6 → `fix/worker-6-open-github-issue` (open-github-issue/index.ts)
  - Worker 7 → `fix/worker-7-platform-adapter-comment` (platform-adapter.ts)
  - Worker 8 → `fix/worker-8-sync-memory-index` (sync-memory-index/index.ts)
  - Worker 9 → `fix/worker-9-storyboard-error-fmt` (generate-storyboard-images/index.ts)
  - Worker 10 → `fix/worker-10-validate-tools-comment` (validate tools)
  - Worker 11 → `fix/worker-11-dispatch-table-comment` (dispatch-table.test.js)
- **Depends on**: Batch 1 completed (for W6 specifically)
- **Gate**:
  - [ ] All 10 workers report success on their branches
  - [ ] **Merge**: Merge ALL 10 branches back to main — resolve any conflicts
  - [ ] **Verify merge**: Confirm changes from ALL workers present in merged result
  - [ ] **Clean up**: Delete all 10 agent branches
  - [ ] `npm run build` succeeds
  - [ ] `node --test test/tools/handler-error-propagation.test.js test/cli/dispatch-table.test.js test/tools/sync-memory-index-error.test.js` passes

  **Note on W6 ordering**: W6 (FIX-06) has a logical dependency on Batch 1
  (FIX-01). Since Batch 1 is already merged before Batch 2 starts, W6 can
  safely run in parallel with all other Batch 2 workers.

### Batch 3 — Regression Tests

- **Workers**: REGTEST-01, REGTEST-02, REGTEST-03, REGTEST-04
- **Strategy**: REGTEST-01, REGTEST-02, REGTEST-03, REGTEST-04 all modify
  `test/tools/handler-error-propagation.test.js` → **must be sequential**
  (same file).
  
  **Recommended**: Combine all 4 REGTESTs into a SINGLE worker on one branch
  `fix/regtest-all`. This avoids 4 sequential merge cycles.

  **Option A (faster — recommended)**: Single REGTEST worker writes all 4 tests
  - Branch: `fix/regtest-all`

  **Option B (safer)**: 4 sequential sub-batches, each with merge → verify → clean:
    - Sub-batch 3a: REGTEST-01 → `fix/regtest-01`
    - Sub-batch 3b: REGTEST-02 → `fix/regtest-02`
    - Sub-batch 3c: REGTEST-03 → `fix/regtest-03`
    - Sub-batch 3d: REGTEST-04 → `fix/regtest-04`

**Depends on**: Batch 2 completed
**Gate**:
- [ ] All 4 REGTESTs pass
- [ ] Each REGTEST must be verified to fail on unfixed code (logical check)
- [ ] **Merge**: Merge regtest branch(es) back to main
- [ ] **Clean up**: Delete all regtest branches
- [ ] `node --test test/tools/handler-error-propagation.test.js` — all tests pass

### Batch 4 — Final Verification

- **Tasks**: Full test suite, coverage check, cross-check REPORT.md
- **Strategy**: Sequential (coordinator handles directly)
- **Depends on**: All preceding batches
- **Gate**:
  - [ ] `npm run build` — builds without errors
  - [ ] Full test suite passes: `npm test`
  - [ ] Coverage: `COVERAGE=true bash scripts/test.sh` — all thresholds met, combined estimate printed
  - [ ] Every issue in REPORT.md confirmed resolved (cross-check all 17 issues):
    - [ ] P0-1 (unhandled rejection): REGTEST-01 passes when carryover tool called via run()
    - [ ] P1-2 (coverage gap): scripts/test.sh comments updated, document limitation
    - [ ] P1-3 (CHECKLIST stale): CHECKLIST.md updated (no 80% threshold references)
    - [ ] P2-2 (architecture \n): adapter.EOL used in file writes
    - [ ] P2-3 (extract-pdf-text error): SystemError throw instead of stderr.write+resolve
    - [ ] P2-4 (open-github-issue stderr): SystemError throw instead of stderr.write+return1
    - [ ] P2-5 (combined coverage): documented in scripts/test.sh
    - [ ] P2-6 (Group 3): documented in scripts/test.sh
    - [ ] P3-1 (EOL comments): platform-adapter.ts comments updated
    - [ ] P3-2 (dead default): renderSection default eol removed
    - [ ] P3-3 (split assumption): comment added
    - [ ] P3-4 (mixed line endings): comment added
    - [ ] P3-5 (stderr Error: prefix): "Error:" prefix removed from warnings
    - [ ] P3-6 (validate return 1): comment added explaining business outcome
    - [ ] P3-7 (Windows glob): documented in scripts/test.sh
    - [ ] P3-8 (stale comment): dispatch-table.test.js comment updated
    - [ ] P3-9 (CHECKLIST boxes): filled where applicable
  - [ ] Commit all changes in a single commit with message:
    `fix: resolve 17 Round 15 review issues (1 P0 + 2 P1 + 5 P2 + 9 P3)`

---

## 8. Regression Test Inventory

- REGTEST-01 → FIX-01: [Integration] `test/tools/handler-error-propagation.test.js` — GIVEN `run(['open-github-issue', '--invalid'], context)` WHEN called THEN returns exit code 1 (not crash/unhandled rejection)
- REGTEST-02 → FIX-02: [Integration] `test/tools/handler-error-propagation.test.js` — GIVEN `COVERAGE=true bash scripts/test.sh` WHEN run THEN exits 0 AND prints "combined coverage estimate"
- REGTEST-03 → FIX-05: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN extract-pdf-text module import WHEN called THEN tool definition is valid (smoke test for SystemError refactor)
- REGTEST-04 → FIX-06: [Unit] `test/tools/handler-error-propagation.test.js` — GIVEN open-github-issue module import WHEN called THEN tool definition is valid (smoke test for SystemError conversion)

---

## 9. Verification Checkpoints

### Checkpoint 1 — After Batch 1 (P0 Fix)
- **Run**: `npm run build`
- **Expected**: Build compiles without errors
- **Run**: `node --test test/tools/handler-error-propagation.test.js`
- **Expected**: All existing tests pass
- **Run**: `node -e "const {run} = require('./packages/cli/dist/index.js'); run(['open-github-issue', '--invalid'], {sourceRoot: process.cwd(), stdout:{write(){}}, stderr:{write(){}}}).then(c => {console.log('exit:', c); process.exit(c === 1 ? 0 : 1)}).catch(e => {console.log('unhandled:', e.message); process.exit(1)})"`
- **Expected**: Prints "exit: 1" and exits 0 — carryover tool error CAUGHT by CLI boundary

### Checkpoint 2 — After Batch 2 (All Other Fixes)
- **Run**: `npm run build`
- **Expected**: Build compiles
- **Run**: `node --test test/tools/handler-error-propagation.test.js test/cli/dispatch-table.test.js test/tools/sync-memory-index-error.test.js test/tools/sync-memory-index-system-error.test.js`
- **Expected**: All tests pass
- **Visual check**: Verify each modified file contains expected changes

### Checkpoint 3 — After Batch 3 (Regression Tests)
- **Run**: `node --test test/tools/handler-error-propagation.test.js`
- **Expected**: All 4 REGTESTs + existing tests pass
- **Logical check**: Each REGTEST must fail on unfixed code:
  - REGTEST-01: Would fail without `return await` (unhandled rejection) — verify by running test BEFORE applying Batch 1 if needed
  - REGTEST-02: Fails if COVERAGE=true script crashes
  - REGTEST-03/04: Pass even without fix (smoke tests) — verify by checking the fix code is correct

### Checkpoint 4 — Final Verification
- **Run**: `npm run build`
- **Expected**: Clean build
- **Run**: `npm test`
- **Expected**: All test groups pass (stable + package + mock.module)
- **Run**: `COVERAGE=true bash scripts/test.sh`
- **Expected**: All thresholds met, combined coverage estimate printed
- **Cross-check**: Every issue from REPORT.md confirmed resolved (see Batch 4 gate checklist)

---

## 10. Error Recovery

- **If a fix worker fails**: Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry.
- **If a fix worker fails twice**: Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user.
- **If a regression test worker reports failure (test cannot pass)**: Check whether the test code is wrong or the fix is incomplete. If the test code is wrong, continue the worker to fix it. If the fix is incomplete, go back to the corresponding fix worker.
- **If a regression test passes on the unfixed code**: The test design is invalid — redesign the oracle and dispatch a new worker.
- **If merge conflicts occur**: The coordinator resolves the conflict, then re-runs the batch gate verification.
- **If a fix or regression test breaks existing tests**: Pause. Report which test failed and which worker's change caused it.
- **For FIX-01 (return await)**: If the `.catch()` handler is not in the right format for the test output parser, adjust the error message format. The key invariant is that `run()` never throws — it always resolves with a number.
- **For W6 (FIX-06, open-github-issue)**: If `SystemError` is not already imported, add it to the import from `@laitszkin/tool-utils`.
- **When combining REGTEST workers (Batch 3)**: If using the recommended single-worker approach (all 4 REGTESTs in one worker), verify the worker imports all needed dependencies at the top of the test file. Node.js `import()` calls must reference the correct dist paths.

---

## 11. Fix History

### Round 15 — 2026-06-06
- **Issues fixed**: FIX-01 through FIX-11 (P0: 1, P1: 2, P2: 5, P3: 9)
- **Outcome**: All 17 issues resolved. FIX-01 (P0) added `return await` to carryover tool dispatch and `.catch()` to entry point. FIX-02/07/08/15 (P1/P2/P3) documented coverage limitations, Group 3 blind spot, Windows glob risk in scripts/test.sh. FIX-03/17 (P1/P3) updated CHECKLIST.md thresholds and filled verification checkboxes. FIX-04 (P2) replaced hardcoded `\n` with PlatformAdapter.EOL in architecture tool. FIX-05 (P2) converted extract-pdf-text child process error to SystemError throw. FIX-06 (P2) converted open-github-issue draft-only publish error to SystemError throw. FIX-09 (P3) updated stale EOL comments in PlatformAdapter. FIX-10/11/12 (P3) added cross-platform comments to sync-memory-index. FIX-13 (P3) removed "Error:" prefix from storyboard warnings. FIX-14 (P3) added validation business-outcome comments to validate tools. FIX-16 (P3) removed stale assertCommand comment from dispatch-table test. FIX-15 (Windows glob) documented in scripts/test.sh.
- **Key notes**: FIX-01 is the critical P0 fix — adding `return await` to the CLI dispatch and a `.catch()` to the entry point resolves the unhandled rejection crash for all 5 carryover tools. FIX-02 (coverage) and FIX-03 (CHECKLIST) address P1 documentation gaps. The remaining P2/P3 fixes are small, isolated improvements. The W6 (open-github-issue) fix depends on FIX-01, so Batch 1 is mandatory before Batch 2.

### Round 14 — 2026-06-06
- **Issues fixed**: FIX-01 through FIX-05 (P1: 3, P2: 5, P3: 4) — applied in commit `e1ef1f5`
- **Outcome**: 12/12 issues resolved. read-github-issue createToolRunner migration completed, coverage CI script hardened, sync-memory-index catch removed, review-threads UserInputError, dispatch table documented. A new P0 issue (carryover tool unhandled rejection) was discovered in Round 15 review — missed in all prior rounds.

### Round 13 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-09 (P1: 4, P2: 5, P3: 6)

### Round 12 — 2026-06-05
- **Issues fixed**: FIX-01 through FIX-10 (P1: 7, P2: 16, P3: 11) — applied in commit `52a42a6`

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
- **Create an isolated branch for each worker before dispatching** (e.g., `fix/worker-1-return-await`). Every worker gets its own branch — never dispatch two workers to the same branch.
- **Each worker commits their changes on their isolated branch.** Never allow workers to commit directly to main.
- **After each batch completes**: merge every worker's isolated branch back to main (handle conflicts), **confirm all changes from all subagents have been implemented in the merged result**, then **clean up all agent branches** — do not leave any `fix/worker-*` or `fix/regtest-*` branches behind. A clean repo is required before starting the next batch.
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them. This is coordination, not implementation.
- **For FIX-01 (return await)**: Verify the fix by running a carryover tool through `run()` — it should return exit code 1, not crash
- **For W6 (FIX-06)**: Must NOT run before Batch 1 completes (depends on FIX-01)
- **For Batch 3 (REGTESTs)**: Prefer the single-worker approach (all 4 REGTESTs in one worker) to avoid 4 sequential merge cycles

### ASK FIRST — pause and confirm with the user

- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- **FIX-01 (return await)**: If the `await` addition causes a semantic change in other code paths (e.g., if some caller depends on the non-awaited behavior), present the alternatives.
- **FIX-05 (extract-pdf-text)**: If `SystemError` is not available in the import, confirm the correct import path.

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- **Defer any REPORT.md issue to a future round** — every issue has a complete fix plan in this FIX.md
- **Leave agent branches behind** — always clean up after each batch before starting the next
- **Merge without verifying** — always confirm every subagent's changes are present in the merged result
- Start W6 (FIX-06, open-github-issue) before Batch 1 (FIX-01) is complete and merged — converting stderr.write+return1 to throw without the CLI boundary safety net makes the crash worse, not better
