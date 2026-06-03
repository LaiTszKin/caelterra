# Fix Coordinator Prompt: CodeGraph Integration — Round 2

- **Date**: 2026-06-03
- **Source Report**: `docs/plans/2026-06-03/codegraph-integration/REPORT.md`
- **Source Specs**:
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-lifecycle/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-discovery/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-validation/SPEC.md`
- **Source Design**: `docs/plans/2026-06-03/codegraph-integration/DESIGN.md`
- **Total Issues**: 0 P0, 2 P1, 2 P2, 1 P3 (6 issues total, 5 distinct fix tasks + 1 repeat)
- **Total Regression Tests**: 4

---

## 1. Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

### What you do

- Read and understand the issue inventory, dependency analysis, and fix details below
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in Section 6)
- After all fixes pass verification, spawn workers to implement regression tests
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

---

## 2. Mission

This is Round 2 of the codegraph-integration fix cycle. Round 1 (27 issues, all now resolved) was completed in commit `9363284`. The current REPORT.md identifies 5 new issues found during re-review: 2 P1, 2 P2, 1 P3.

The core problems remain in two areas:
1. **Code infrastructure** (4 issues): `--all` flag leaks as path argument, MODULE_NOT_FOUND error handler unreachable, status/search skip initialization checks
2. **Skill workflows** (2 issues): init-project-html still uses subagent grep instead of `codegraph survey`; design skill missing explicit `list-apis --all` step

**Success looks like**: All 5 open issues in REPORT.md are fixed, all regression tests pass, full test suite passes, no regressions.

---

## 3. Issue Inventory

### P1 — Requirement Defect (2 issues)

| ID | Requirement | Summary | Affected Files |
|---|---|---|---|
| #29 | V5 | init-project-html workflow Step 1 still uses subagent grep/Read instead of `codegraph survey` | `skills/init-project-html/SKILL.md:55-72` |
| #33 | D3 | `--all` flag detected but never spliced from `rest`; leaks as `pathArg` → `list-apis --all` returns no results | `packages/tools/codegraph/index.ts:38-41` |

### P2 — Requirement Risk (2 issues)

| ID | Requirement | Summary | Affected Files |
|---|---|---|---|
| #28 | V4 | design skill Step 5e missing explicit `apltk codegraph list-apis --all` step | `skills/design/SKILL.md:168-192` |
| #30 | L1+L2 | MODULE_NOT_FOUND handler unreachable — top-level `require()` fires at module eval time, not in handler catch | `packages/tools/codegraph/lib/cg-instance.ts:5`, `packages/tools/codegraph/index.ts:115-122` |

### P3 — Suggestion (2 issues, combined into one fix worker)

| ID | Requirement | Summary | Affected Files |
|---|---|---|---|
| #31 | L2 | `--index` flag not spliced from `rest` (inconsistent with other flags) | `packages/tools/codegraph/index.ts:42-44` |
| #32 | L3+L4 | `status` and `search` skip `isInitialized()` check (unlike `sync`) | `packages/tools/codegraph/lib/cmd-status.ts:12`, `packages/tools/codegraph/lib/cmd-search.ts:17` |

---

## 4. Fix Dependency Analysis

### File Overlap Matrix (Round 2 issues only)

| Fix Group | Files Touched | Overlaps With |
|---|---|---|
| FG-R2-1 (--all splice) | `index.ts:38-41` | FG-R2-3, FG-R2-4 (same `index.ts`) |
| FG-R2-2 (--index splice) | `index.ts:42-44` | FG-R2-3, FG-R2-4 (same `index.ts`) |
| FG-R2-3 (lazy import) | `cg-instance.ts`, `cmd-sync.ts`, `cmd-status.ts`, `cmd-search.ts`, `cmd-explore.ts`, `cmd-survey.ts`, `cmd-list-apis.ts`, `cmd-verify.ts`, `survey/scanner.ts`, `index.ts:115-122` | FG-R2-1, FG-R2-2 (same `index.ts`); FG-R2-4 (same `cmd-status.ts`, `cmd-search.ts`) |
| FG-R2-4 (init check) | `cmd-status.ts`, `cmd-search.ts` | FG-R2-3 (same files) |
| FG-R2-5 (init-project-html skill) | `skills/init-project-html/SKILL.md` | — |
| FG-R2-6 (design skill) | `skills/design/SKILL.md` | — |

### Merge Decision

**FG-R2-1, FG-R2-2, FG-R2-3, FG-R2-4** all touch overlapping files (`index.ts`, `cmd-status.ts`, `cmd-search.ts`) → **merge into one code worker**: FIX-R2-CODE.

**FG-R2-5 (init-project-html skill)** and **FG-R2-6 (design skill)** touch only SKILL.md files → independent, can be their own workers.

### Merged Worker Map

| Worker | Merged FG | Issues | Files |
|---|---|---|---|
| FIX-R2-CODE | FG-R2-1 + 2 + 3 + 4 | #33 P1, #30 P2, #31 P3, #32 P3 | All source files |
| FIX-R2-SKILL-INIT | FG-R2-5 | #29 P1 | `skills/init-project-html/SKILL.md` |
| FIX-R2-SKILL-DESIGN | FG-R2-6 | #28 P2 | `skills/design/SKILL.md` |

### Batch Scheduling

| Batch | Workers | Strategy | Depends On |
|---|---|---|---|
| **Batch 1** | FIX-R2-CODE, FIX-R2-SKILL-INIT, FIX-R2-SKILL-DESIGN | **Parallel** (no file overlap between code and skills) | Nothing |
| **Batch 2** | REGTEST-R2-01, REGTEST-R2-02, REGTEST-R2-03, REGTEST-R2-04 | **Parallel** (no file overlap in test files) | Batch 1 |

---

## 5. Fix Details (with Regression Test Design)

### FIX-R2-CODE: Code infrastructure fixes — lazy import, flag splice, init checks (P1 + P2 + P3)

- **Issue IDs**: #33 (P1), #30 (P2), #31 (P3), #32 (P3)
- **Root cause**: Four independent defects:
  1. `index.ts:38-41`: `--all` flag detected via `includes()` but never spliced from `rest`, leaks as `pathArg`
  2. `cg-instance.ts:5` + 8 `cmd-*.ts` files: `require('@colbymchenry/codegraph')` at module top level → error fires at import time, unreachable by handler catch
  3. `index.ts:42-44`: `--index` flag detected but never spliced from `rest` (inconsistency)
  4. `cmd-status.ts:12`, `cmd-search.ts:17`: `CodeGraph.open()` called without `isInitialized()` check
- **Fix approach**:
  1. **--all splice** (`index.ts`): Replace `const isAll = rest.includes('--all')` with `indexOf` + `splice` pattern
  2. **--index splice** (`index.ts`): Add `splice` after detection for consistency
  3. **Lazy import** (ALL source files): Move top-level `require('@colbymchenry/codegraph')` inside handler functions. In `cg-instance.ts`, create a `getCodeGraphModule()` lazy getter. In each `cmd-*.ts`, move require into the handler function body.
  4. **Init checks** (`cmd-status.ts`, `cmd-search.ts`): Add `CodeGraph.isInitialized()` check before `CodeGraph.open()`, emit clear error if not initialized
- **Complexity**: Medium — cross-file, but mechanical changes

**Regression tests:**

**REGTEST-R2-01** (Unit → existing codegraph test files):
- Scenario: GIVEN `rest` array containing `['--all']` or `['--index']` WHEN dispatch parsing runs THEN those flags are removed from the array
- Oracle: `assert.ok(!rest.includes('--all'))` after parsing
- Related fix: FIX-R2-CODE

**REGTEST-R2-02** (Unit → `cmd-status.test.ts`):
- Scenario: GIVEN `CodeGraph.isInitialized()` returns false for the project root WHEN `handleStatus()` is called THEN exit code is 1 with error containing "init"
- Oracle: `assert.strictEqual(exitCode, 1)` and stderr includes "init" message
- Related fix: FIX-R2-CODE (init check part)

**REGTEST-R2-03** (Unit → `cmd-search.test.ts`):
- Scenario: Same as REGTEST-R2-02 but for `handleSearch()`
- Oracle: Same as REGTEST-R2-02
- Related fix: FIX-R2-CODE (init check part)

**REGTEST-R2-04** (Manual verification — lazy import):
- Verification: Run `node -e "require('./packages/tools/codegraph/lib/cg-instance.js')"` after ensuring `@colbymchenry/codegraph` is installed → should succeed
- This confirms the module can still be loaded after refactoring
- Hard to automate the negative case (module not installed) as a regression test since it depends on project state

---

### FIX-R2-SKILL-INIT: Update init-project-html workflow with codegraph survey integration (P1)

- **Issue ID**: #29 (P1)
- **Root cause**: V5 spec requires Step 1 to use `codegraph survey` to obtain project structure, replacing subagent grep/Read. Current Step 1 still dispatches subagents to manually deep-read code.
- **Fix approach**: Replace Step 1's content to describe the survey-driven workflow:
  1. Run `apltk codegraph survey` to obtain project structure report
  2. LLM subagent decides feature groupings based on survey output
  3. Proceed to Step 2: `architecture apply`
- **Complexity**: Simple — documentation-only
- **Verification**: `grep -c "codegraph survey" skills/init-project-html/SKILL.md` returns ≥ 1

**No automated regression test** — documentation-only change.

---

### FIX-R2-SKILL-DESIGN: Add explicit list-apis step to design skill workflow (P2)

- **Issue ID**: #28 (P2)
- **Root cause**: V4 spec requires "Execute `apltk codegraph list-apis --all` to get integration references" as the first step of the new flow. Current Step 5e jumps straight to template.
- **Fix approach**: In Step 5e "New flow (CodeGraph-integrated)", add Step 5b.1 before the existing step 1:
  - "Run `apltk codegraph list-apis --all` to get the full API directory for integration reference"
- **Complexity**: Simple — documentation-only
- **Verification**: `grep -c "list-apis" skills/design/SKILL.md` returns ≥ 1

**No automated regression test** — documentation-only change.

---

## 6. Worker Prompt Library

### FIX-R2-CODE: Code infrastructure fixes (lazy import, flag splice, init checks)

```
## Mission — Fix 4 code infrastructure issues: lazy CodeGraph import, --all/--index flag splicing, init checks

## Context
Four issues from REPORT.md Round 2:

1. **--all flag leak (P1, #33, D3)**: `index.ts:38-41` detects `--all` via `rest.includes('--all')` but never removes it from `rest`. When `rest[0]` is used as `pathArg` for list-apis, `--all` becomes the path filter, returning no results.

2. **MODULE_NOT_FOUND unreachable (P2, #30, L1+L2)**: `require('@colbymchenry/codegraph')` executes at module evaluation time in ALL source files. The error handler in `index.ts:115-122` never catches it because the module fails to load before the handler is called. Must use lazy (deferred) imports inside handler functions.

3. **--index flag not spliced (P3, #31, L2)**: `index.ts:42-44` detects `--index` but never splices it from `rest`. Inconsistent with other flags.

4. **Init check missing (P3, #32, L3+L4)**: `cmd-status.ts:12` and `cmd-search.ts:17` call `CodeGraph.open()` without checking `CodeGraph.isInitialized()` first. `cmd-sync.ts` has this check; these two don't.

## Input — Read the following files

Read ALL of these files completely before making changes:
- `packages/tools/codegraph/lib/cg-instance.ts`
- `packages/tools/codegraph/lib/cmd-sync.ts`
- `packages/tools/codegraph/lib/cmd-status.ts`
- `packages/tools/codegraph/lib/cmd-search.ts`
- `packages/tools/codegraph/lib/cmd-explore.ts`
- `packages/tools/codegraph/lib/cmd-survey.ts`
- `packages/tools/codegraph/lib/cmd-list-apis.ts`
- `packages/tools/codegraph/lib/cmd-verify.ts`
- `packages/tools/codegraph/lib/survey/scanner.ts`
- `packages/tools/codegraph/index.ts`

Also read for reference:
- `packages/tools/codegraph/lib/cg-instance.test.ts` — existing test for init check

## What to do

### Step 1: Lazy CodeGraph import in `cg-instance.ts`

Replace the top-level `require('@colbymchenry/codegraph')` with a lazy getter function:

```typescript
// REMOVE this line at top:
// const { CodeGraph, findNearestCodeGraphRoot } = require('@colbymchenry/codegraph');

// ADD a lazy getter:
let _codeGraphModule: any = null;
function getCodeGraphModule(): { CodeGraph: any; findNearestCodeGraphRoot: any } {
  if (!_codeGraphModule) {
    _codeGraphModule = require('@colbymchenry/codegraph');
  }
  return _codeGraphModule;
}
```

Then in `findProjectRoot()`:
- Change `findNearestCodeGraphRoot(cwd)` to `getCodeGraphModule().findNearestCodeGraphRoot(cwd)`

In `createOrOpenIndex()`:
- Change `CodeGraph.isInitialized(projectRoot)` to `getCodeGraphModule().CodeGraph.isInitialized(projectRoot)`
- Change `CodeGraph.init(projectRoot, {...})` to `getCodeGraphModule().CodeGraph.init(projectRoot, {...})`

In `closeIndex()`:
- No change needed — `cg.close()` doesn't need CodeGraph module

### Step 2: Lazy require in each `cmd-*.ts` file

For each of the following files, REPLACE the top-level `const { CodeGraph } = require('@colbymchenry/codegraph');` by moving the require INSIDE the handler function.

Files to modify:
- `cmd-sync.ts` — move inside `handleSync()`
- `cmd-status.ts` — move inside `handleStatus()`
- `cmd-search.ts` — move inside `handleSearch()`
- `cmd-explore.ts` — move inside `handleExplore()`
- `cmd-survey.ts` — move inside `handleSurvey()`
- `cmd-list-apis.ts` — move inside `handleListApis()`
- `cmd-verify.ts` — move inside `handleVerify()`
- `survey/scanner.ts` — move inside `scanDirectory()`

Keep the `createRequire` import at the top — only move the `require('@colbymchenry/codegraph')` line.

For scanners.ts: `const { CodeGraph } = require('@colbymchenry/codegraph')` uses `createRequire` from before its first use. Move the destructured object inside `scanDirectory()` function.

### Step 3: Fix --all flag splice in `index.ts`

Replace:
```typescript
const isAll = rest.includes('--all');
```
With:
```typescript
const allIndex = rest.indexOf('--all');
const isAll = allIndex >= 0;
if (allIndex >= 0) rest.splice(allIndex, 1);
```

### Step 4: Fix --index flag splice in `index.ts`

After `const shouldIndex = rest.includes('--index');` (around line 42), add:
```typescript
const indexIdx = rest.indexOf('--index');
if (indexIdx >= 0) rest.splice(indexIdx, 1);
```

Note: The existing `shouldIndex` check is already correct. Just add the splice.

### Step 5: Add init checks to `cmd-status.ts` and `cmd-search.ts`

In `cmd-status.ts` `handleStatus()`, before `CodeGraph.open()` (which is now a lazy require), add:
```typescript
if (!getCodeGraphModule().CodeGraph.isInitialized(projectRoot)) {
  process.stderr.write('CodeGraph is not initialized. Run `apltk codegraph init` first.\n');
  return 1;
}
```

In `cmd-search.ts` `handleSearch()`, same check:
```typescript
const { CodeGraph } = require('@colbymchenry/codegraph');
if (!CodeGraph.isInitialized(projectRoot)) {
  process.stderr.write('CodeGraph is not initialized. Run `apltk codegraph init` first.\n');
  return 1;
}
```

### Step 6: Update index.ts catch block

Ensure the catch block in `codegraphHandler` at `index.ts:115-122` properly detects the lazy import error. Since the `require()` now runs inside the handler, the MODULE_NOT_FOUND error will be caught by this catch block. Update it to check:
```typescript
if (error.code === 'MODULE_NOT_FOUND' || (error.message && error.message.includes('Cannot find module'))) {
  stderr.write('`@colbymchenry/codegraph` is not installed. Run `npm install @colbymchenry/codegraph` in your project directory.\n');
}
```

## Scope
- Allowed: All files listed in Input section
- Read-only: `packages/tools/codegraph/lib/cg-instance.test.ts`
- Forbidden: Any file outside `packages/tools/codegraph/` or test files (skills, etc.)

## Output
On completion, report:
- Number of files modified
- For each modified file: what changed (lazy import, flag splice, init check)
- Verification results

## Verify
- `cd packages/tools/codegraph && npx tsc --noEmit` — must pass without errors
- `cd packages/tools/architecture && npx tsc --noEmit` — must pass (architecture tools share no deps)
- `node -e "require('./packages/tools/codegraph/lib/cg-instance.js')"` — must load without error

## Boundaries
- Preserve all existing function signatures and export interfaces
- The lazy import pattern must NOT change the behavior of any function when `@colbymchenry/codegraph` is installed
- Do NOT modify test files (they are handled by regression test workers)
- Do NOT modify SKILL.md files (they are handled by other workers)
- After lazy import refactor, the MODULE_NOT_FOUND error should propagate as a normal JavaScript error from inside the handler, which the `try/catch` in the dispatcher will catch
```

### FIX-R2-SKILL-INIT: Update init-project-html workflow with survey integration

```
## Mission — Update skills/init-project-html/SKILL.md Step 1 to use codegraph survey

## Context
V5 spec (#29 in REPORT.md) requires:
- Step 1 should use `apltk codegraph survey` to get project structure, replacing subagent grep/Read
- LLM decides feature groupings based on survey output
- Then proceed to Step 2 (architecture apply)

The current Step 1 (lines 55-72) still dispatches subagents to deep-read each feature module manually.

## Input — Files to read
- `skills/init-project-html/SKILL.md` — entire file

## What to do

1. In the Workflow section, locate Step 1 (starting around line 55). Currently it says:
   ```markdown
   ### 1. 閱讀並理解代碼庫 — 先建立 System Context
   ...
   並行調度 subagents，並為每一個功能模塊分配一個 subagent 進行深度閱讀...
   ```

2. REPLACE the subagent-based approach with a CodeGraph survey-driven workflow:
   ```markdown
   ### 1. 使用 codegraph survey 取得專案結構

   使用 `apltk codegraph survey` 取得專案的結構化調查報告：
   - 專案目錄下的所有檔案清單與函式數量
   - Entry points（被外部檔案呼叫的公開函式）
   - 建議的 submodule 分組與跨邊界 edge
   - 支援 `--json` 輸出供 LLM 程式化消費

   根據 survey 報告，決定功能模塊的劃分（對應 C4 Container 層級）：
   - 將高度互相呼叫的函式群歸類為同一功能模塊的子模塊
   - 識別功能模塊之間的邊界與跨模塊呼叫關係
   - 記錄每個功能模塊對應的目錄路徑與 entry point
   ```

3. Move the existing "System Context" content (reading `sample-demo/`, reading external actor descriptions) into a preliminary sub-step before the survey step, or merge it concisely.

4. Ensure the workflow still makes sense flowing from Step 1 (survey) → Step 2 (architecture apply). The LLM should use survey data to design the feature grouping, then pass that to `architecture apply`.

## Scope
- Allowed: `skills/init-project-html/SKILL.md`
- Forbidden: Any other file

## Verify
- `grep -c "codegraph survey" skills/init-project-html/SKILL.md` — should return ≥ 1

## Boundaries
- Do not remove the C4 model reference, mode detection, or evidence tracing sections (they are still needed)
- Do not modify Step 2 (architecture apply) — it was already correctly updated in Round 1
- Keep the existing Chinese language and style
```

### FIX-R2-SKILL-DESIGN: Add explicit list-apis step to design skill

```
## Mission — Add `apltk codegraph list-apis --all` as the first step of the new CodeGraph-integrated workflow in design skill

## Context
V4 spec (#28 in REPORT.md) requires Step 5 (Generate Architecture Diff) to start with `apltk codegraph list-apis --all` to get integration references. Currently the new flow jumps straight to filling the proposal skeleton via `apltk architecture template`.

## Input — Files to read
- `skills/design/SKILL.md` — the Step 5e section around lines 168-200

## What to do

1. In Step 5e "New flow (CodeGraph-integrated)" (around lines 170-192), add a new first step BEFORE the existing "Fill the proposal skeleton":

   ```markdown
   1. **Survey the existing API landscape**:
      ```bash
      apltk codegraph list-apis --all
      ```
      This returns the full project API directory (function names, file paths, callers) as a reference for integration points. Use this data to understand what existing modules, services, and functions your new feature will interact with.
   ```

2. Renumber the existing steps 1-4 to 2-5:
   - 1 (survey API landscape) — NEW
   - 2 (Fill the proposal skeleton) — existing step 1
   - 3 (Apply batch mutations) — existing step 2
   - 4 (Verify correctness) — existing step 3
   - 5 (Render and validate) — existing step 4

3. Keep the "Classic flow" section unchanged.

## Scope
- Allowed: `skills/design/SKILL.md`
- Forbidden: Any other file

## Verify
- `grep -c "list-apis" skills/design/SKILL.md` — should return ≥ 1
- The new step should mention `list-apis --all` with the bash code block

## Boundaries
- Do not remove the classic flow (it's needed as fallback when CodeGraph is not installed)
- Do not modify any other part of the skill file
```

---

## 7. Fix Batch Schedule

### Batch 1 — All Code + Skill Fixes (parallel dispatch)

| Worker | Issues | Files | Complexity |
|---|---|---|---|
| FIX-R2-CODE | #33 P1, #30 P2, #31 P3, #32 P3 | All source files in `packages/tools/codegraph/` | Medium |
| FIX-R2-SKILL-INIT | #29 P1 | `skills/init-project-html/SKILL.md` | Simple |
| FIX-R2-SKILL-DESIGN | #28 P2 | `skills/design/SKILL.md` | Simple |

**Strategy**: Dispatch 3 workers in parallel (no file overlap between code and skills).

**Gate checks:**
- [ ] FIX-R2-CODE reports success
- [ ] FIX-R2-SKILL-INIT reports success (or manual grep ≥ 1 match)
- [ ] FIX-R2-SKILL-DESIGN reports success (or manual grep ≥ 1 match)
- [ ] `cd /Users/tszkinlai/apollo-toolkit && npm test` — all tests pass (existing tests + new code)
- [ ] `cd packages/tools/codegraph && npx tsc --noEmit` — no type errors

---

### Batch 2 — Regression Tests (parallel dispatch, after Batch 1)

| Worker | Test Files | Tests |
|---|---|---|
| REGTEST-R2-01 | New test file or inline | --all/--index flag splice |
| REGTEST-R2-02 | `packages/tools/codegraph/lib/cmd-status.test.ts` | status init check |
| REGTEST-R2-03 | `packages/tools/codegraph/lib/cmd-search.test.ts` | search init check |
| REGTEST-R2-04 | Manual verification | lazy import loads correctly |

**Strategy**: Dispatch REGTEST-R2-01, REGTEST-R2-02, REGTEST-R2-03 in parallel (no file overlap). REGTEST-R2-04 is manual.

**Gate checks:**
- [ ] All REGTEST workers report success
- [ ] `npm test` passes (from project root)

---

### Batch 3 — Final Verification

- [ ] `npm run build` — full project build
- [ ] `npm test` — all tests pass
- [ ] `npx tsc --noEmit` — no type errors
- [ ] All 5 REPORT.md issues confirmed resolved:
  - [ ] #29: `grep -c "codegraph survey" skills/init-project-html/SKILL.md` ≥ 1
  - [ ] #33: --all flag spliced from rest (code review)
  - [ ] #28: `grep -c "list-apis" skills/design/SKILL.md` ≥ 1
  - [ ] #30: lazy import pattern implemented (code review)
  - [ ] #31: --index flag spliced (code review)
  - [ ] #32: status/search have init checks (code review)
- [ ] Commit: `fix: address codegraph-integration round-2 review findings — lazy imports, flag splice, init checks, skill workflows`

---

## 8. Regression Test Inventory

4 regression tests across 3 test files + 1 manual verification:

| Test ID | Type | File | Related Fix | Oracle |
|---|---|---|---|---|
| REGTEST-R2-01 | Unit | codegraph test area | FIX-R2-CODE | --all/--index removed from rest after parsing |
| REGTEST-R2-02 | Unit | `cmd-status.test.ts` | FIX-R2-CODE | Exit 1 with "init" message on uninitialized project |
| REGTEST-R2-03 | Unit | `cmd-search.test.ts` | FIX-R2-CODE | Exit 1 with "init" message on uninitialized project |
| REGTEST-R2-04 | Manual | N/A | FIX-R2-CODE | Lazy import module loads without error |

---

## 9. Verification Checkpoints

### Checkpoint 1 — After Batch 1 (all fixes)
- `cd /Users/tszkinlai/apollo-toolkit && npm test` — all existing tests pass
- `cd packages/tools/codegraph && npx tsc --noEmit` — no compile errors
- `cd packages/tools/architecture && npx tsc --noEmit` — no compile errors
- Verify MODULE_NOT_FOUND by temporarily commenting out node_modules codegraph (optional, manual)

### Checkpoint 2 — After Batch 2 (regression tests)
- `npm test` — all tests including new regression tests pass
- Logical check: Each new regression test covers code that would fail without the fix

### Checkpoint 3 — Final
- `npm run build` — full build
- `npx tsc --noEmit` — no type errors
- Cross-check all 5 REPORT.md issues resolved

---

## 10. Error Recovery

- **If a fix worker fails**: Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry.
- **If a fix worker fails twice**: Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user.
- **If a regression test worker reports failure (test cannot pass)**: Check whether the test code is wrong or the fix is incomplete. If the fix is incomplete, go back to FIX-R2-CODE.
- **If merge conflicts occur**: The coordinator resolves the conflict, then re-runs the batch gate verification.
- **If a fix breaks existing tests**: Pause. Report which test failed and which worker's change caused it.

---

## 11. Fix History

### Round 1 — 2026-06-03
- **Issues fixed**: 27 issues total (2 P0, 10 P1, 14 P2, 1 P3)
- **Commit**: `9363284` — fix: address codegraph-integration review findings — verify parser, survey grouping, explore output, skill workflows
- **Key changes**: Replaced custom YAML parser with `js-yaml`; added edge relationship verification; implemented survey connectivity analysis; fixed explore file grouping; added duration/languages/init checks; updated skill workflows; added 28 test files with 1887 lines of test code
- **Remaining issues (Round 2)**: 5 new findings discovered during re-review

---

## 12. Boundaries

### ALWAYS
- Run gate verification immediately after every batch
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them. This is coordination, not implementation.
- The lazy import refactor (FIX-R2-CODE) must preserve all function signatures and behaviors when `@colbymchenry/codegraph` is installed
- Do NOT re-fix Round 1 issues — they are already resolved in commit `9363284`

### ASK FIRST — pause and confirm with the user
- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed
- `@colbymchenry/codegraph` API doesn't match expectations (check the installed version in `node_modules/@colbymchenry/codegraph/package.json`)
- Round 1 issues reappear after applying Round 2 fixes (regression in previously fixed code)

### NEVER
- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- Defer any REPORT.md issue to a future round — every issue has a complete fix plan in this FIX.md
- Revert Round 1 fixes from commit `9363284`
