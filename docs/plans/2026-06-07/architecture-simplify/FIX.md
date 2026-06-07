# Fix Coordinator Prompt: 簡化 apltk architecture 指令 (Round 3)

- **Date**: 2026-06-07
- **Source REPORT**: `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- **Source Spec**: `docs/plans/2026-06-07/architecture-simplify/`
- **Total Issues**: P0:0, P1:0, P2:10, P3:14
- **Total Regression Tests**: 9

---

## 1. Your Role & Rules

### Mission

Fix all 24 issues identified in REPORT.md Round 3 for the architecture CLI simplification. The fixes span three source areas: `cli.js` (17 behavioral fixes in one worker), `cli-help.js` (1 localization export — same worker as cli.js since `MULTI_VERBS` export is added to cli.js), `skills/*/SKILL.md` and `DESIGN.md` (documentation updates in a separate worker). 9 regression tests in `test/atlas-cli.test.js` verify correctness.

**Success looks like**: All 24 REPORT.md issues are resolved, all 9 regression tests pass on the fixed code, and the full test suite passes with no regressions.

### Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issues found in code review, delegate each fix and regression test to a worker, and verify that every issue is resolved without introducing regressions.

**What you do:**
- Read and understand the issue inventory, dependency analysis, and fix details below
- Spawn workers to execute individual fixes, giving each a self-contained prompt (provided in `fix/*.md` files referenced in Section 3)
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

| Fix ID | REPORT Issue | Severity | File | Description |
|---|---|---|---|---|
| FIX-01 | P2-1 | P2 | cli.js | `--depends-on` silently ignored for `relation` entity type |
| FIX-01 | P2-2 | P2 | cli.js | Change summary shows flags not applied for relation |
| FIX-01 | P2-3 | P2 | cli.js | Simple pair batch mode discards `'skipped'` return value |
| FIX-01 | P2-4 | P2 | cli.js | Simple pair batch lacks pre-validation |
| FIX-01 | P2-5 | P2 | cli.js | No output when all entities skipped in interleaved batch |
| FIX-01 | P2-6 | P2 | cli.js | Relation flag naming asymmetry (no `--kind` forwarding on remove) |
| FIX-01 | P2-7 | P2 | cli.js | Feature `--depends-on` leaves orphaned YAML references after remove |
| FIX-01 | P2-10 | P2 | cli.js | Export `MULTI_VERBS` constant for sync verification |
| FIX-01 | P3-1 | P3 | cli.js | Error message references batch syntax |
| FIX-01 | P3-2 | P3 | cli.js | No duplicate detection for relation entity |
| FIX-01 | P3-3 | P3 | cli.js | Passthrough flags undocumented in help |
| FIX-01 | P3-4 | P3 | cli.js | Edge creation in batch omits `skipUndo` |
| FIX-01 | P3-5 | P3 | cli.js | Dry-run output misleading in batch mode |
| FIX-01 | P3-7 | P3 | cli.js | Output format mismatch between batch modes |
| FIX-01 | P3-8 | P3 | cli.js | Relation remove lacks available edges in error |
| FIX-01 | P3-9 | P3 | cli.js | Unified remove relation doesn't forward `--id` |
| FIX-01 | P3-11 | P3 | cli.js | `apply`/`template` intercept ordered after `resolveProjectRoot` |
| FIX-02 | P2-8 | P2 | SKILL.md | SKILL.md teaches retired apply/template commands |
| FIX-02 | P2-9 | P2 | SKILL.md | SKILL.md teaches `diff --spec` but diff ignores it |
| FIX-02 | P3-10 | P3 | DESIGN.md | DESIGN.md omits `--data-flow-to` for modules |
| FIX-02 | P3-14 | P3 | DESIGN.md | DESIGN.md says 6 verbs but help lists 10 |
| — | P3-6 | P3 | test file | No test for batch dry-run (regression test only) |
| — | P3-12 | P3 | SPEC.md | SPEC mentions `diff --spec` but no such flag (spec error — report only) |
| — | P3-13 | P3 | test file | No end-to-end test for unified `add --spec` + `diff` (regression test only) |

### Fix Dependency Analysis

**File overlaps (hard constraint for parallelization):**

- **`cli.js`**: FIX-01 — all 17 behavioral fixes in one worker. This worker modifies cli.js only.
- **`skills/*/SKILL.md`, `DESIGN.md`**: FIX-02 — documentation updates. No overlap with FIX-01.
- **`test/atlas-cli.test.js`**: REGTEST-01 — all 9 regression tests. No overlap with any fix worker.

Fix Worker A (cli.js) and Fix Worker B (SKILL.md + DESIGN.md) have **zero file overlap** → they can run in parallel.

All regression tests go in `test/atlas-cli.test.js` → single REGTEST worker.

**Logical dependencies:**
- REGTEST-01 depends on both FIX-01 and FIX-02 completing first
- No dependency between FIX-01 and FIX-02 (independent files)

### Fix Details (with Regression Test Design)

#### FIX-01: All cli.js behavioral fixes (P2-1 through P3-11)

**Root cause**: 17 interrelated issues in `cli.js` across relation entity handling, batch mode correctness, and dispatch ordering. All fixed in one worker due to shared file.

**Files involved**: `skills/init-project-html/lib/atlas/cli.js` — multiple functions across the file

**Fix approach** (17 tasks in one worker):

1. **P2-1**: In `processAddEntity` relation case (L762-781), add `--depends-on` handling — create a dependency edge when flag is present, similar to the module case (L729-743)
2. **P2-2**: In `verbAdd` single-entity output (L963-968), guard flag display by entity type — for `relation`, only show `--data-flow-to`/`--implements`/`--deployed-on`; for `feature`, show `--depends-on`; for `module`, show all
3. **P2-3/P3-7**: In simple pair batch mode, capture `processAddEntity` return value (L927), track skipped entities, adjust output message
4. **P2-4**: Add pre-validation phase to simple pair batch mode (L922-928) — validate each entity via `validateEntity` before processing any
5. **P2-5**: In interleaved batch output (L900-905), add fallback branch for `applied === 0` case
6. **P2-6**: In `verbRemove` relation path (L1021-1034), forward `--kind` flag to `verbEdge('remove')`; in `verbEdge('remove')`, when `kind` is provided, add it to the filter predicate
7. **P2-7**: In `removeFeature` (L297-304), add cleanup of `dependsOn` references on remaining features
8. **P3-1**: Fix error message in single-entity mode (L953) to show `[relation-flags...]` instead of batch syntax
9. **P3-2**: Check if edge already exists on relation add — before calling `verbEdge('add')`, check if identical endpoints + kind edge exists
10. **P3-3**: In `buildArchitectureHelpPage` add case, add `--evidence` and `--kind` to optional flags
11. **P3-4**: Forward `skipUndo` to all `verbEdge('add')` calls in `processAddEntity`
12. **P3-5**: In batch mode output (L897-910, L938-944), check `flags['dry-run']` and produce appropriate message
13. **P3-8**: In `verbEdge('remove')` error (L600-614), compute and include list of existing edge descriptions
14. **P3-9**: In `verbRemove` relation path (L1021-1034), forward `--id` flag
15. **P3-11**: Move `apply`/`template` intercept (L1589-1592) before `resolveProjectRoot` (L1581-1587)
16. **P2-10 (export)**: Export `multiVerbs` set as `MULTI_VERBS` in `module.exports` for sync test
17. **P3-3 (help)**: Ensure `--id`, `--evidence`, `--kind` appear in architecture diff or add help page

**Complexity**: Complex — requires systematic understanding of dispatch flow, processAddEntity, performMutation, batch parsing, and relation entity handling. Several changes are interdependent (relation entity handling, batch mode output).

**Regression tests**: REGTEST-01 (Tests F01 through F09)

#### FIX-02: Documentation updates (P2-8, P2-9, P3-10, P3-14)

**Root cause**: Skill files still reference retired commands; design docs contain imprecise claims.

**Files involved**:
- `skills/init-project-html/SKILL.md` (L69, L79)
- `skills/design/SKILL.md` (L214, L217, L220)
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` (§2, §3.1)

**Fix approach** (4 tasks in one worker):
1. **P2-8**: In both SKILL.md files, replace `apltk architecture apply` and `apltk architecture template` instructions with `apltk architecture add` equivalents
2. **P2-9**: In `skills/design/SKILL.md` (L220), remove `--spec <spec_dir>` from diff instruction (diff auto-discovers all overlays)
3. **P3-10**: In `DESIGN.md`, add `--data-flow-to` to the module relation flags documentation (§2 and §3.1)
4. **P3-14**: In `DESIGN.md` (§2.3), clarify that `validate`, `status`, `scan`, `undo` are retained alongside the 6 core verbs

**Complexity**: Simple — straightforward text replacements.

**Regression tests**: None (documentation-only changes; manual verification)

#### P3-12: SPEC mentions `diff --spec` but no such flag exists

This is a **spec error**. The SPEC example (L113) shows `diff --spec` which doesn't match the implementation. Per the coordinator's rules: "Do not modify spec documents (unless the fix reveals a spec error — report it instead)." This should be **reported to the user**, not fixed. No worker prompt needed.

---

## 3. Execution Plan

### Worker Prompt Index

**Fix Worker Prompts:**

| Fix ID | Worker Prompt File | Description |
|---|---|---|
| FIX-01 | `fix/FIX-01-cli-behavioral.md` | All 17 cli.js behavioral fixes (17 issues) |
| FIX-02 | `fix/FIX-02-documentation.md` | SKILL.md + DESIGN.md documentation updates (4 issues) |

**Regression Test Worker Prompts:**

| Test ID | Worker Prompt File | Related Fix | Description |
|---|---|---|---|
| REGTEST-01 | `fix/REGTEST-01-integration.md` | FIX-01, FIX-02 | 9 integration tests in atlas-cli.test.js |

### Batch Schedule

#### Batch 1 — Fix Source Code (Parallel — zero file overlap)

**FIX-01 Worker**: All `cli.js` behavioral fixes (17 issues)
**FIX-02 Worker**: Skill + design documentation updates (4 issues)

- **Strategy**: **Parallel** — zero file overlap between cli.js and documentation files
- **Gate**:
  - [ ] FIX-01 worker reports success
  - [ ] FIX-02 worker reports success
  - [ ] Verification: `node --test test/atlas-cli.test.js` → all existing tests pass
  - [ ] Verification: `node --test packages/tools/architecture/index.test.ts` → all tests pass
  - [ ] Verification: `node --test test/tools/architecture-error-types.test.js` → all tests pass
  - [ ] Verification: `node --test test/architecture-script.test.js` → all tests pass

#### Batch 2 — Regression Test Implementation

**REGTEST-01 Worker**: 9 integration tests in `atlas-cli.test.js`

- **Strategy**: Sequential (single file, single worker)
- **Depends on**: Batch 1 completed
- **Gate**:
  - [ ] REGTEST-01 worker reports success
  - [ ] `node --test test/atlas-cli.test.js` → all tests pass (new + existing)
  - [ ] Logical check: each REGTEST oracle is "fails on unfixed code, passes after fix"
  - [ ] Existing test suite passes: `node --test packages/tools/architecture/index.test.ts`
  - [ ] Existing test suite passes: `node --test test/tools/architecture-error-types.test.js`
  - [ ] Existing test suite passes: `node --test test/architecture-script.test.js`

#### Batch 3 — Final Integration

- **Tasks**: Full test suite, cross-check REPORT.md
- **Strategy**: Sequential
- **Depends on**: Batch 2 completed
- **Gate**:
  - [ ] Full test suite passes: `npm test`
  - [ ] Every issue in REPORT.md (P2:10, P3:14) confirmed resolved

---

## 4. Final Verification

- [ ] Every issue in REPORT.md (P2: 10, P3: 14) has a completed fix
- [ ] Every fix has a corresponding regression test that passes (or manual verification for documentation-only fixes)
- [ ] All worker prompts in Section 3 have been dispatched and returned success
- [ ] `npm test` passes with no regressions
- [ ] All changes committed in a single commit

---

## 5. References

- **Worker prompt files**:
  - `fix/FIX-01-cli-behavioral.md` — All 17 cli.js behavioral fixes (P2-1 through P3-11)
  - `fix/FIX-02-documentation.md` — SKILL.md and DESIGN.md documentation updates (P2-8, P2-9, P3-10, P3-14)
  - `fix/REGTEST-01-integration.md` — 9 integration tests in atlas-cli.test.js

- **Code files to modify** (across all fixes and regression tests):
  - `skills/init-project-html/lib/atlas/cli.js` — FIX-01 worker (17 behavioral fixes)
  - `skills/init-project-html/SKILL.md` — FIX-02 worker (replace apply/template references)
  - `skills/design/SKILL.md` — FIX-02 worker (replace apply/template/diff --spec references)
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — FIX-02 worker (add module --data-flow-to, clarify verb count)
  - `test/atlas-cli.test.js` — REGTEST-01 worker (9 new integration tests)

- **Project context files**:
  - `CLAUDE.md` — Project instructions
  - `docs/architecture/cli-architecture.md` — CLI architecture docs

- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Review findings (source of all issues)
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md` — Verification strategy

- **Fix History**:

  ### Round 2 — 2026-06-07
  - **Issues fixed**: FIX-01, FIX-02, REGTEST-01 (P1:3, P2:6, P3:4)
  - **Outcome**: All 13 issues resolved in commit e695ef4
  - **Key notes**: Module render timing, --data-flow-to for module, batch spec-mode rollback, feature --depends-on edge creation, duplicate entity output, change summary, empty entity list validation, global flag copying in batch, and fine-grained verb --help hidden.

  ### Round 1 — 2026-06-07
  - **Issues fixed**: FIX-01, FIX-02, REGTEST-01, REGTEST-02, REGTEST-03 (P1:5, P2:8, P3:7)
  - **Outcome**: All 20 issues resolved in commit f9ae733
  - **Key notes**: Batch per-entity flags not scoped, module relation flags not supported, non-existent entity removal silently successful, various output and help text issues.
