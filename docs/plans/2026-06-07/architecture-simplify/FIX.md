# Fix Coordinator Prompt: 簡化 apltk architecture 指令 (Round 4)

- **Date**: 2026-06-08
- **Source REPORT**: `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- **Source Spec**: `docs/plans/2026-06-07/architecture-simplify/`
- **Total Issues**: P1:5, P2:12, P3:10
- **Total Regression Tests**: 18

---

## 1. Your Role & Rules

### Mission

Fix all 27 issues identified in REPORT.md Round 4 for the architecture CLI simplification. The fixes span three source areas: `cli.js` + `cli-help.js` (18 fixes in FIX-01), `state.js` (1 fix in FIX-02), and `DESIGN.md` (1 docs update in FIX-03). 18 regression tests in `test/atlas-cli.test.js` verify correctness and close test coverage gaps.

**Success looks like**: All 27 REPORT.md issues are resolved, all 18 regression tests pass on the fixed code, and the full test suite passes with no regressions.

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
- For fixes marked as Complex: ensure the worker performs systematic debugging (reading related code, tracing execution paths) before applying the fix
- After each batch completes, clean up any temporary branches or worktrees created by workers
- Read the existing test file before dispatching the REGTEST worker to understand the insertion point

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

| Fix ID | REPORT Issues | Severity | File | Description |
|---|---|---|---|---|
| FIX-01 | P1-1, P1-2, P1-3, P1-5, P2-1, P2-2, P2-3, P2-4, P2-5, P2-6, P2-7, P2-8, P3-1, P3-2, P3-3, P3-4, P3-6, P3-8 | P1/P2/P3 | `cli.js`, `cli-help.js` | Behavioral fixes for cli.js + cli-help.js (18 issues) |
| FIX-02 | P1-4 | P1 | `state.js` | `deriveOverlay()` doesn't populate `removed.submodules` |
| FIX-03 | P3-5 | P3 | `DESIGN.md` | Batch atomicity statement outdated in DESIGN.md |

### Cross-cutting Notes

- **P3-7** (collectDiffChanges doesn't accept flags) is resolved as part of FIX-01's P1-5 fix (which adds `flags` parameter to `collectDiffChanges`).
- **P2-9, P2-10, P2-11, P2-12, P3-9, P3-10** are test-coverage gaps addressed by the REGTEST worker, not fix workers.

### Fix Dependency Analysis

**File overlaps (hard constraint for parallelization):**

| Worker | Files | Overlap with others |
|---|---|---|
| FIX-01 | `cli.js`, `cli-help.js` | Zero overlap with FIX-02, FIX-03, REGTEST-ALL |
| FIX-02 | `state.js` | Zero overlap with FIX-01, FIX-03, REGTEST-ALL |
| FIX-03 | `DESIGN.md` | Zero overlap with all others |
| REGTEST-ALL | `test/atlas-cli.test.js` | Zero overlap with all others |

**All three fix workers have ZERO file overlap → they can run in parallel.**

**Logical dependencies:**
- REGTEST-ALL depends on all fix workers (FIX-01, FIX-02, FIX-03) completing first
- No dependency between FIX-01, FIX-02, and FIX-03 (independent files, independent fixes)

### Fix Details (with Regression Test Design)

#### FIX-01: cli.js + cli-help.js behavioral fixes (18 issues)

**Root cause**: 18 issues in `cli.js` spanning missing guards (`'skipped'` not checked, missing `--depends-on` existence validation, missing `--spec` dir validation, `diff` ignores `--spec`), incorrect output routing (stderr vs stdout, history cleanup), flawed validation predicates (intra-feature dupes, flag parser, verbRemove validation), and dispatch inconsistencies (`open` strips `--spec`).

**Files involved**: `skills/init-project-html/lib/atlas/cli.js`, `skills/init-project-html/lib/atlas/cli-help.js`

**Fix approach**: See `fix/FIX-01-cli-r4.md` for the complete worker prompt with all 18 fixes.

**Complexity**: Complex — multiple interrelated changes in `processAddEntity`, `verbAdd`, `verbRemove`, `verbDiff`, `verbOpen`, `performMutation`, flag parsing, and help display.

**Regression tests**: REGTEST-10 through REGTEST-23 (14 tests), REGTEST-24, REGTEST-25, REGTEST-27 (3 more) — 17 total for FIX-01 behavioral issues + coverage gaps.

#### FIX-02: state.js deriveOverlay removed.submodules (P1-4)

**Root cause**: `deriveOverlay()` at `state.js` L311 computes `removed.features` by diffing feature sets but never performs the equivalent check for submodules within features that exist in both states. The `removed.submodules` field exists in the schema and `mergeOverlay` has code to consume it, but it's never populated.

**Files involved**: `skills/init-project-html/lib/atlas/state.js`

**Fix approach**: See `fix/FIX-02-state-r4.md` for details. Add submodule diff logic to `deriveOverlay`.

**Complexity**: Complex — requires understanding `deriveOverlay`'s diff algorithm and how `mergeOverlay` consumes the data.

**Regression tests**: REGTEST-13, REGTEST-26 — 2 tests specifically for this fix.

#### FIX-03: DESIGN.md batch atomicity update (P3-5)

**Root cause**: DESIGN.md §7 was written before the batch rollback mechanism was implemented. The document describes non-atomicity that the code no longer has.

**Files involved**: `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`

**Fix approach**: See `fix/FIX-03-docs-r4.md` for details. Update §7 to describe the rollback mechanism accurately.

**Complexity**: Simple — documentation-only update.

**Regression tests**: None (documentation-only; manual verification).

---

## 3. Execution Plan

### Worker Prompt Index

**Fix Worker Prompts:**

| Fix ID | Worker Prompt File | Description |
|---|---|---|
| FIX-01 | `fix/FIX-01-cli-r4.md` | All cli.js + cli-help.js behavioral fixes (18 issues) |
| FIX-02 | `fix/FIX-02-state-r4.md` | state.js deriveOverlay removed.submodules fix (P1-4) |
| FIX-03 | `fix/FIX-03-docs-r4.md` | DESIGN.md batch atomicity update (P3-5) |

**Regression Test Worker Prompts:**

| Test ID | Worker Prompt File | Related Fix | Description |
|---|---|---|---|
| REGTEST-ALL | `fix/REGTEST-ALL-r4.md` | FIX-01, FIX-02 | 18 regression tests in atlas-cli.test.js |

### Batch Schedule

#### Batch 1 — All Fix Workers (Parallel — zero file overlap)

**FIX-01 Worker**: 18 cli.js + cli-help.js behavioral fixes
**FIX-02 Worker**: state.js deriveOverlay fix
**FIX-03 Worker**: DESIGN.md doc update

- **Strategy**: **Parallel** — zero file overlap between all three workers
- **Gate**:
  - [ ] FIX-01 worker reports success
  - [ ] FIX-02 worker reports success
  - [ ] FIX-03 worker reports success
  - [ ] Verification: `node --test test/atlas-cli.test.js` → all existing tests pass
  - [ ] Verification: `node --test packages/tools/architecture/index.test.ts` → all tests pass
  - [ ] Verification: `node --test test/architecture-script.test.js` → all tests pass

#### Batch 2 — Regression Test Implementation

**REGTEST-ALL Worker**: 18 regression tests in `atlas-cli.test.js`

- **Strategy**: Sequential (single worker)
- **Depends on**: Batch 1 completed (all fix workers)
- **Gate**:
  - [ ] REGTEST-ALL worker reports success
  - [ ] `node --test test/atlas-cli.test.js` → all 18 new tests pass + all existing tests pass
  - [ ] Logical check: each REGTEST oracle is "fails on unfixed code, passes after fix"
  - [ ] Existing test suite passes: `node --test packages/tools/architecture/index.test.ts`
  - [ ] Existing test suite passes: `node --test test/architecture-script.test.js`

#### Batch 3 — Final Integration

- **Tasks**: Full test suite, cross-check REPORT.md
- **Strategy**: Sequential
- **Depends on**: Batch 2 completed
- **Gate**:
  - [ ] Full test suite passes: `npm test`
  - [ ] Every issue in REPORT.md (P1:5, P2:12, P3:10) confirmed resolved

---

## 4. Final Verification

- [ ] Every issue in REPORT.md (P1: 5, P2: 12, P3: 10) has a completed fix
- [ ] Every fix has a corresponding regression test that passes (or manual verification for documentation-only fixes)
- [ ] All worker prompts in Section 3 have been dispatched and returned success
- [ ] `npm test` passes with no regressions
- [ ] All changes committed in a single commit

---

## 5. References

- **Worker prompt files**:
  - `fix/FIX-01-cli-r4.md` — 18 cli.js + cli-help.js behavioral fixes
  - `fix/FIX-02-state-r4.md` — state.js deriveOverlay removed.submodules fix
  - `fix/FIX-03-docs-r4.md` — DESIGN.md batch atomicity update
  - `fix/REGTEST-ALL-r4.md` — 18 regression tests in atlas-cli.test.js

- **Code files to modify** (across all fixes and regression tests):
  - `skills/init-project-html/lib/atlas/cli.js` — FIX-01 worker (18 behavioral fixes)
  - `skills/init-project-html/lib/atlas/cli-help.js` — FIX-01 worker (hiddenVerbs export)
  - `skills/init-project-html/lib/atlas/state.js` — FIX-02 worker (deriveOverlay removed.submodules)
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — FIX-03 worker (batch atomicity update)
  - `test/atlas-cli.test.js` — REGTEST-ALL worker (18 new regression tests)

- **Project context files**:
  - `CLAUDE.md` — Project instructions
  - `docs/architecture/cli-architecture.md` — CLI architecture docs
  - `packages/cli/help-text-builder.ts` — Help text builder

- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Review findings (source of all issues)
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md` — Verification strategy

- **Fix History**:

  ### Round 3 — 2026-06-07
  - **Issues fixed**: FIX-01, FIX-02, REGTEST-01 (P1:0, P2:10, P3:14)
  - **Outcome**: All 24 issues resolved in commit `f3812b7`
  - **Key notes**: Relation --depends-on, change summary filtering, batch pre-validation, skip tracking, SKILL.md updates, apply/template intercept ordering, MULTI_VERBS export, dry-run output, edge kind filtering, dependsOn cleanup on remove. All Round 3 issues verified resolved in Round 4 review.

  ### Round 2 — 2026-06-07
  - **Issues fixed**: FIX-01, FIX-02, REGTEST-01 (P1:3, P2:6, P3:4)
  - **Outcome**: All 13 issues resolved in commit e695ef4
  - **Key notes**: Module render timing, --data-flow-to for module, batch spec-mode rollback, feature --depends-on edge creation, duplicate entity output, change summary, empty entity list validation, global flag copying in batch, and fine-grained verb --help hidden.

  ### Round 1 — 2026-06-07
  - **Issues fixed**: FIX-01, FIX-02, REGTEST-01, REGTEST-02, REGTEST-03 (P1:5, P2:8, P3:7)
  - **Outcome**: All 20 issues resolved in commit f9ae733
  - **Key notes**: Batch per-entity flags not scoped, module relation flags not supported, non-existent entity removal silently successful, various output and help text issues.
