# Fix Coordinator Prompt: 簡化 apltk architecture 指令 (Round 5)

- **Date**: 2026-06-08
- **Source REPORT**: `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- **Source Spec**: `docs/plans/2026-06-07/architecture-simplify/`
- **Total Issues**: P1:1, P2:3, P3:10
- **Total Regression Tests**: 5

---

## 1. Your Role & Rules

### Mission

Fix all 14 issues identified in REPORT.md Round 5 for the architecture CLI simplification. 20 of 27 Round 4 issues were already fixed in commit `a502cb6`. The remaining gaps are small — the key P1 is a one-line omission in `validateEntity`. Fixes span two source files (`cli.js` and `test/atlas-cli.test.js`) across 3 fix workers and 5 regression test workers.

**Success looks like**: All 14 REPORT.md issues are resolved, all 5 new regression tests pass (failing before fix, passing after), and the full test suite passes with no regressions.

### Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

**What you do:**
- Read and understand the issue inventory, dependency analysis, and fix details below
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in `fix/*.md` files)
- After all fixes pass verification, spawn workers to implement regression tests
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, updating lockfiles
- Commit all changes in a single commit after the final verification gate passes

**What you NEVER do:**
- Write, edit, or modify any source-code or test file directly
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)
- Start regression tests before all fixes in scope are verified
- Defer any REPORT.md issue to a future round — every issue has a complete plan here

### Boundaries

**ALWAYS**
- Run gate verification immediately after every batch
- Extract worker prompts verbatim from `fix/*.md` files — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Fixes must not conflict with the original spec requirements
- Regression tests must not start before all fix batches pass
- Resolve merge conflicts yourself — the coordinator handles them

**ASK FIRST** — pause and confirm with the user:
- Fix approach conflicts with spec design intent
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed

**NEVER**
- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Modify spec documents (unless the fix reveals a spec error — report it instead)
- Start regression tests before all fixes are verified
- Defer any REPORT.md issue to a future round

### Error Recovery

| Scenario | Response |
|---|---|
| Fix worker reports failure | Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry. |
| Same fix worker fails twice | Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user. |
| Regression test worker reports failure (test cannot pass) | Check whether the test code is wrong or the fix is incomplete. If test code is wrong, continue the worker to fix it. If the fix is incomplete, go back to the corresponding fix worker. |
| Regression test passes on the unfixed code | The test design is invalid — redesign the oracle and dispatch a new worker. |
| Merge conflicts | Coordinator resolves the conflict, then re-runs the batch gate verification. |
| Fix or regression test breaks existing tests | Pause. Report which test failed and which worker's change caused it. |

---

## 2. Context

### Issue Inventory

**P1 — Requirement Defect (1):**
- FIX-01 (P1-1, Simple): `validateEntity` rejects `relation --depends-on`-only specs in batch mode — `cli.js` L1216

**P2 — Requirement Risk (3):**
- FIX-02 (P2-1, Complex): No batch-level undo support — `cli.js` L1082, L256-266
- FIX-03 (P2-2, Simple): `validateEntity` bypassed in single-entity mode — `cli.js` L1178
- FIX-04 (P2-3, Simple): REGTEST-14 diff `--spec` filtering assertion vacuous — `test/atlas-cli.test.js` L1736

**P3 — Suggestion (10):**
- FIX-05 (P3-1, Comment): Process crash mid-batch leaves partial state — `cli.js` L1080 (documented limitation, add comment)
- FIX-06 (P3-2, Simple): Inconsistent "already exists" messages — `cli.js` L1104
- FIX-07 (P3-3, Refactor): Validation logic duplicated — `cli.js` L1211 vs L777/L882 (addressed by FIX-01 + FIX-03)
- FIX-08 (P3-4, Medium): No target existence validation for `--data-flow-to`/`--implements`/`--deployed-on` — `cli.js` L793, L861, L940
- FIX-09 (P3-5, Simple): Duplicate `--depends-on` only checks first comma target — `cli.js` L916
- FIX-10 (P3-6, Simple): Missing `--spec` dir validation in `verbRemove` — `cli.js` L1221
- FIX-11 (P3-7, Simple): Submodule remove error lacks similar-name suggestions — `cli.js` L452
- FIX-12 (P3-8, Comment): `formatFix` leaks hidden verb syntax — `cli.js` L53-70 (documented trade-off, clarify comment)
- FIX-13 (P3-9, Simple): `apply`/`template` `--help` bypasses removal error — `cli.js` L1845-1856
- FIX-14 (P3-10, Medium): `diff --spec` with batch member path may miss state-based overlay — `cli.js` L1474

### Fix Dependency Analysis

**Logical dependencies:**
- FIX-02 (batch undo) depends on FIX-01 (validateEntity fix) because FIX-02's undo snapshot code runs after the batch loop which calls validateEntity via processAddEntity. FIX-01 must be correct first.

**File overlaps:**
- FIX-01, FIX-02, FIX-03, FIX-05 through FIX-14 all modify `cli.js` → all cli.js fixes must be sequential (same file)
- FIX-04 modifies `test/atlas-cli.test.js` → no overlap with cli.js fixes, can run in parallel
- REGTEST-28 through REGTEST-32 all modify `test/atlas-cli.test.js` → same file, must be sequential

**Resolution**: All cli.js fixes (FIX-01 through FIX-14) are combined into Worker 1 (FIX-01-cli-simple-fixes) and Worker 2 (FIX-02-batch-undo). Workers 1 and 2 share cli.js → sequential. Worker 3 (FIX-03-test-diff-spec) touches a different file → can run in parallel with Workers 1/2.

### Fix Details (with Regression Test Design)

#### FIX-01: validateEntity rejects relation --depends-on in batch (P1)

**Root cause**: `validateEntity` at L1216 checks `--data-flow-to`, `--implements`, `--deployed-on` but omits `--depends-on`. `processAddEntity` at L882 correctly accepts `--depends-on` standalone. Batch calls `validateEntity` first, causing divergence.

**Files involved**: `cli.js` > `validateEntity()` (L1216)
**Fix approach**: Add `&& !entity.flags['depends-on']` to the condition at L1216, update error message at L1217 to include `--depends-on`
**Complexity**: Simple

**Regression test:** REGTEST-28 (Integration → `test/atlas-cli.test.js`)
- GIVEN initialized architecture with a feature WHEN batch-adding a relation with only `--depends-on` THEN command succeeds
- Oracle: Before fix: fails with "Missing required flag". After fix: succeeds.

#### FIX-02: No batch-level undo support (P2)

**Root cause**: All batch entities set `skipUndo: true` (L1082), preventing `performMutation` from writing undo snapshots. No aggregate undo/history is recorded after batch completion.

**Files involved**: `cli.js` > interleaved batch completion (~L1094), simple pair batch completion (~L1140+)
**Fix approach**: After successful batch completion (in both interleaved and simple pair paths), write a single aggregate undo snapshot using the pre-batch state (already saved in `preBatchState`/`preBatchOverlayState`) and history entry
**Complexity**: Complex — needs understanding of `performMutation` undo format and both batch code paths

**Regression test:** REGTEST-29 (Integration → `test/atlas-cli.test.js`)
- GIVEN a pre-batch feature exists WHEN batch adds entities THEN undo reverts the batch but preserves the pre-batch feature
- Oracle: Before fix: undo doesn't revert batch. After fix: undo fully reverts batch entities.

#### FIX-03: validateEntity bypassed in single-entity mode (P2)

**Root cause**: `validateEntity` is only called in batch-mode loops. Single-entity mode calls `processAddEntity` directly with no structural pre-validation.

**Files involved**: `cli.js` > single-entity path (L1185)
**Fix approach**: Add `validateEntity({ type, name, flags })` before `processAddEntity` call in single-entity mode
**Complexity**: Simple

**Regression test:** Covered by REGTEST-28 (the P1 test also validates single-entity mode consistency)

#### FIX-04: REGTEST-14 diff --spec assertion vacuous (P2)

**Root cause**: REGTEST-14 checks that stdout doesn't contain a filesystem path — but diff stdout never contains filesystem paths
**Files involved**: `test/atlas-cli.test.js` > REGTEST-14
**Fix approach**: Replace vacuous assertion with HTML content check (verify diff HTML only contains the filtered spec's entities)
**Complexity**: Simple

**Regression test:** REGTEST-30 (Integration → `test/atlas-cli.test.js`)
- GIVEN two specs with different entities WHEN diff --spec on spec A THEN diff HTML contains spec A entities but not spec B
- Oracle: The new assertion is the regression test itself (replaces the vacuous one)

#### FIX-05 — FIX-14: P3 issues

All P3 fixes are detailed in Worker 1's prompt (`fix/FIX-01-cli-simple-fixes.md`). Key regression tests:

- **REGTEST-31**: FIX-10 — `remove --spec nonexistent-dir` must fail
- **REGTEST-32**: FIX-08 — `--data-flow-to`/`--implements`/`--deployed-on` non-existent targets must be rejected

---

## 3. Execution Plan

### Worker Prompt Index

**Fix Worker Prompts:**

| Fix ID | Worker Prompt File | Description |
|---|---|---|
| FIX-01 — FIX-14 (except FIX-02, FIX-04) | `fix/FIX-01-cli-simple-fixes.md` | 11 simple/medium fixes in cli.js: validateEntity, validation gate, messages, target validation, comma-target check, --spec dir, similar-name, legacy reorder, diff path, comments |
| FIX-02 | `fix/FIX-02-batch-undo.md` | Complex: batch-level undo snapshot and history entries |
| FIX-04 | `fix/FIX-03-test-diff-spec.md` | Test fix: replace vacuous REGTEST-14 assertion with HTML content check |

**Regression Test Worker Prompts:**

| Test ID | Worker Prompt File | Related Fix | Description |
|---|---|---|---|
| REGTEST-28 | `fix/REGTEST-28-relation-batch-depends-on.md` | FIX-01 | Relation --depends-on in batch mode must succeed |
| REGTEST-29 | `fix/REGTEST-29-batch-undo.md` | FIX-02 | Undo must revert batch operations |
| REGTEST-30 | `fix/REGTEST-30-diff-spec-filtering.md` | FIX-04 | Diff --spec filtering must be content-verified |
| REGTEST-31 | `fix/REGTEST-31-remove-spec-dir-validation.md` | FIX-10 | Remove --spec nonexistent-dir must fail |
| REGTEST-32 | `fix/REGTEST-32-edge-target-validation.md` | FIX-08 | --data-flow-to/--implements/--deployed-on must reject nonexistent targets |

### Batch Schedule

*Tasks within the same batch must have no file overlap to run in parallel.*

#### Batch 1 — CLI Simple Fixes

- **Worker**: `fix/FIX-01-cli-simple-fixes.md` (FIX-01, 03, 05-14)
- **Strategy**: Single worker (one file)
- **Gate**:
  - [ ] Worker reports success
  - [ ] Verification: `node --test test/atlas-cli.test.js` → all existing tests pass (no regressions)
  - [ ] Manual: `node dist/bin/apollo-toolkit.js architecture add relation testRel --depends-on someFeature feature testFeat` → succeeds (P1-1 fixed)

#### Batch 2 — Batch Undo Fix

- **Worker**: `fix/FIX-02-batch-undo.md` (FIX-02)
- **Strategy**: Single worker (same file as Batch 1, sequential required)
- **Depends on**: Batch 1 (validateEntity must be correct)
- **Gate**:
  - [ ] Worker reports success
  - [ ] Verification: `node --test test/atlas-cli.test.js` → all existing tests pass
  - [ ] Manual: batch add then undo → batch reverted, pre-batch state preserved

#### Batch 3 — Test Fix (parallel with Batches 1-2)

- **Worker**: `fix/FIX-03-test-diff-spec.md` (FIX-04)
- **Strategy**: Single worker (different file from Batches 1-2, can run in parallel)
- **Gate**:
  - [ ] Worker reports success
  - [ ] Verification: `node --test --test-name-pattern="REGTEST-14" test/atlas-cli.test.js` → passes

#### Batch 4 — Regression Test Implementation

- **Tasks**: REGTEST-28, REGTEST-29, REGTEST-30, REGTEST-31, REGTEST-32
- **Strategy**: Sequential (all modify `test/atlas-cli.test.js` — same file overlap)
- **Depends on**: All fix batches (1-3) completed
- **Gate**:
  - [ ] All REGTEST workers report success
  - [ ] Each REGTEST fails on unfixed code (logical check — coordinator verifies)
  - [ ] Each REGTEST passes on fixed code
  - [ ] All existing tests still pass: `node --test test/atlas-cli.test.js`
  - [ ] Architecture script tests pass: `node --test test/architecture-script.test.js`

> Note: Since all 5 REGTEST workers write to the same file, the coordinator may optionally combine them into a single worker that applies all 5 test additions. Read each worker prompt and dispatch a combined worker if practical.

#### Batch 5 — Final Integration

- **Tasks**: Full test suite, cross-check REPORT.md
- **Strategy**: Sequential
- **Depends on**: All preceding batches
- **Gate**:
  - [ ] Full test suite passes: `npm test`
  - [ ] Every issue in REPORT.md Round 5 confirmed resolved
  - [ ] No regressions in existing behavior
  - [ ] All changes committed in a single commit

---

## 4. Final Verification

- [ ] Every issue in REPORT.md Round 5 (P1:1, P2:3, P3:10) has a completed fix
- [ ] Every P1/P2 fix has a regression test that passes (REGTEST-28 through 32)
- [ ] All worker prompts in Section 3 have been dispatched and returned success
- [ ] Full test suite passes with no regressions
- [ ] All changes committed in a single commit

---

## 5. References

- **Worker prompt files**:
  - `fix/FIX-01-cli-simple-fixes.md`
  - `fix/FIX-02-batch-undo.md`
  - `fix/FIX-03-test-diff-spec.md`
  - `fix/REGTEST-28-relation-batch-depends-on.md`
  - `fix/REGTEST-29-batch-undo.md`
  - `fix/REGTEST-30-diff-spec-filtering.md`
  - `fix/REGTEST-31-remove-spec-dir-validation.md`
  - `fix/REGTEST-32-edge-target-validation.md`

- **Code files to modify** (across all fixes and regression tests):
  - `skills/init-project-html/lib/atlas/cli.js` — all cli.js fixes (FIX-01 through FIX-14)
  - `test/atlas-cli.test.js` — test fix (FIX-04) + regression tests (REGTEST-28 through 32)

- **Project context files**:
  - `CLAUDE.md` (project instructions, testing commands)
  - `docs/architecture/cli-architecture.md` (CLI command dispatch)
  - `packages/cli/help-text-builder.ts` (help text builder)

- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 5 review findings
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md` — Verification strategy

- **Fix History**:

  ### Round 4 — 2026-06-08
  - **Issues fixed**: FIX-01 (18 cli.js/cli-help.js fixes), FIX-02 (state.js deriveOverlay), FIX-03 (DESIGN.md docs) — P1:5, P2:12, P3:10
  - **Outcome**: All 27 Round 4 issues resolved in commit `a502cb6`. 20 confirmed fixed in Round 5 review.
  - **Key notes**: Major improvements: duplicate entity skip prevents edge creation, --depends-on target validation, --spec dir validation in verbAdd, deriveOverlay submodule tracking, diff --spec support, verbOpen --spec handling, sortBySimilarity for error messages. 7 findings recategorized or partially addressed in Round 5.

  ### Round 3 — 2026-06-07
  - **Issues fixed**: 24 issues — P2:10, P3:14
  - **Outcome**: All resolved in commit `f3812b7`
  - **Key notes**: Relation --depends-on edge creation, change summary flag filtering, batch pre-validation, remove relation --kind, remove feature dependsOn cleanup, SKILL.md updates, apply/template intercept ordering

  ### Round 2 — 2026-06-07
  - **Issues fixed**: 13 issues — P1:3, P2:6, P3:4
  - **Outcome**: All resolved in commit `e695ef4`

  ### Round 1 — 2026-06-07
  - **Issues fixed**: 20 issues — P1:5, P2:8, P3:7
  - **Outcome**: All resolved in commit `f9ae733`
