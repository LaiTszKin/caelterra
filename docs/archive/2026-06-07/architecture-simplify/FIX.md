# Fix Coordinator Prompt: 簡化 apltk architecture 指令 (Round 7)

- **Date**: 2026-06-09
- **Source REPORT**: `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- **Source Spec**: `docs/plans/2026-06-07/architecture-simplify/`
- **Total Issues**: P1:3, P2:1, P3:2
- **Total Regression Tests**: 5 automated, 1 structural/manual verification

---

## 1. Your Role & Rules

### Mission

Fix all six Round 7 findings from `REPORT.md`: three requirement defects, one atomicity risk, and two suggestions. The plan uses six fix workers, five automated regression-test workers, and one structural/manual verification worker. Most implementation fixes touch `skills/init-project-html/lib/atlas/cli.js`, so the coordinator must enforce sequential execution for those workers.

**Success looks like**: all Round 7 findings are resolved, all new regression tests pass, the architecture-related test subset passes, full `npm test` passes, and active agent-facing docs no longer expose hidden fine-grained architecture commands.

### Your Role

**You are the fix coordinator.** You do not write code. Your job is to understand the issue inventory, dispatch workers using the prompt files listed below, digest each worker result, and verify that every issue is resolved without introducing regressions.

**What you do:**
- Read the issue inventory, dependency analysis, fix details, and worker prompt files.
- Dispatch each worker with the exact prompt file listed in Section 3.
- Enforce the file-overlap gate: workers that edit the same file run sequentially.
- Run verification commands after every batch.
- Start regression-test workers only after their related fixes are complete.
- Resolve merge conflicts if workers touch disjoint files but produce integration conflicts.
- Commit all changes in a single commit only after final verification passes.

**What you NEVER do:**
- Modify implementation or test files directly, except to resolve conflict markers.
- Skip a verification checkpoint.
- Start regression tests before the corresponding fixes pass.
- Let workers spawn sub-workers.
- Defer any `REPORT.md` issue to a later round.

### Boundaries

**ALWAYS**
- Keep changes scoped to files listed in each worker prompt.
- Preserve existing CLI behavior unless `REPORT.md` identifies it as defective.
- Preserve backward compatibility for hidden fine-grained verbs; hide discovery, do not block legacy execution.
- Use existing `node:test` style in `test/atlas-cli.test.js` and `test/architecture-script.test.js`.
- Ensure every automated regression test would fail against the Round 7 reviewed code and pass after its fix.

**ASK FIRST**
- A worker concludes a fix requires a new external dependency.
- A worker concludes the spec/design contradicts the required fix.
- The same worker fails twice.
- A regression test cannot be made to fail on the unfixed code.

**NEVER**
- Weaken, skip, or delete existing tests to make a batch pass.
- Install uncommitted skill changes directly.
- Modify `.codegraph/codegraph.db`.
- Refactor unrelated `cli.js` behavior while fixing targeted paths.
- Reintroduce `apply` or `template` routing.

### Error Recovery

| Scenario | Response |
|---|---|
| Fix worker reports failure | Send one retry to the same worker with failing command/output and exact file/function to re-check. |
| Same fix worker fails twice | Stop the flow and report the blocked worker, completed workers, and failing verification. |
| Regression test fails after fix | Determine whether the test oracle is wrong or the related fix is incomplete. Return to the responsible worker. |
| Regression test passes on unfixed code | Reject the test and redesign the oracle before proceeding. |
| Merge conflicts | Coordinator resolves conflict markers, then reruns the current batch gate. |
| Existing tests regress | Stop and identify the worker and file that introduced the regression. |

---

## 2. Context

### Issue Inventory

- FIX-01 (P1-1, Simple): `add relation <endpoint> ...` validates relation targets but not the source endpoint — `skills/init-project-html/lib/atlas/cli.js`.
- FIX-02 (P1-2, Simple): `remove relation` can fail without listing similar available names when an intra-feature source feature is missing — `skills/init-project-html/lib/atlas/cli.js`.
- FIX-03 (P1-3, Documentation): active agent-facing atlas reference docs still expose hidden fine-grained commands — `skills/init-project-html/references/TEMPLATE_SPEC.md`, `test/architecture-script.test.js`.
- FIX-04 (P2-1, Complex): batch atomicity is rollback-based rather than a true single transaction — `skills/init-project-html/lib/atlas/cli.js`.
- FIX-05 (P3-1, Simple): hidden fine-grained help pages remain defined but unreachable — `skills/init-project-html/lib/atlas/cli-help.js`.
- FIX-06 (P3-2, Test-only): no positive regression test asserts successful batch auto-render without `--no-render` — `test/atlas-cli.test.js`.

### Fix Dependency Analysis

**Logical dependencies:**
- FIX-01 should run before FIX-02 because both touch relation endpoint behavior in `cli.js`.
- FIX-04 should run after FIX-01 because staged batch processing must preserve relation source validation semantics.
- FIX-03 and FIX-05 both support Req 4 but touch different files; they can run in parallel only after any current `test/architecture-script.test.js` worker dependency is considered.
- REGTEST workers depend on their related fixes.

**File overlaps:**
- FIX-01, FIX-02, and FIX-04 all modify `skills/init-project-html/lib/atlas/cli.js`; run sequentially.
- REGTEST-44, REGTEST-45, and REGTEST-49 all modify `test/atlas-cli.test.js`; run sequentially.
- REGTEST-46 and REGTEST-48 both modify `test/architecture-script.test.js`; run sequentially.
- FIX-03 modifies `skills/init-project-html/references/TEMPLATE_SPEC.md`; no source overlap with FIX-05.
- FIX-05 modifies `skills/init-project-html/lib/atlas/cli-help.js`; no source overlap with FIX-03.

### Fix Details (with Regression Test Design)

#### FIX-01: Validate relation source endpoint before writing unified relation edges (P1-1)

**Root cause**: In `processAddEntity()` relation mode, the code validates only the target endpoint (`to`) at `cli.js:999-1001`. The source endpoint (`entityName`) is parsed and written by `verbEdge('add')` without referential checks, allowing invalid state that schema validation rejects later.

**Files involved**: `skills/init-project-html/lib/atlas/cli.js` > `assertEndpointExists()` (`378-394`), `processAddEntity()` relation branch (`926-1032`).

**Fix approach**: Reuse `assertEndpointExists(currentState, entityName, 'relation source')` before duplicate checks and before dependency-only relation writes. Validate source for both primary `to` relations and dependency-only relations. Keep legacy `verbEdge()` behavior unchanged for backward compatibility unless the worker finds a direct need.

**Complexity**: Simple.

**Regression test**: REGTEST-44 (Integration -> `test/atlas-cli.test.js`)
- GIVEN target feature/module `b/api` exists and source `a/missing` does not exist
- WHEN running `add relation a/missing --data-flow-to b/api`
- THEN the command exits non-zero, stderr identifies the missing source endpoint, and no edge referencing `a/missing` is written.
- Oracle: fails on Round 7 reviewed code because the invalid edge is written; passes after FIX-01.

#### FIX-02: Include available-edge suggestions when removing relation with missing intra-feature source (P1-2)

**Root cause**: `verbEdge('remove')` enters the intra-feature branch, then throws `Feature "<feature>" not found for edge removal` before constructing an available-edge suggestion list.

**Files involved**: `skills/init-project-html/lib/atlas/cli.js` > `verbEdge()` remove branch (`644-690`), helper area near `sortBySimilarity()` (`349-376`).

**Fix approach**: Add a small helper to format all available edges from `state.edges` and feature-local `feature.edges`, or inline equivalent logic in the missing-feature branch. Replace the early missing-feature error with a clear missing-entity message containing `Available edges: ...` and similar available relation strings.

**Complexity**: Simple.

**Regression test**: REGTEST-45 (Integration -> `test/atlas-cli.test.js`)
- GIVEN feature `payment` has modules `ui` and `api` with an intra-feature edge `ui -> api`
- WHEN running `remove relation paymint/ui --to paymint/api`
- THEN the command exits non-zero and stderr includes `Available edges:` plus a similar existing relation.
- Oracle: fails on Round 7 reviewed code because stderr lacks the available-edge list; passes after FIX-02.

#### FIX-03: Rewrite active atlas reference docs to unified command surface (P1-3)

**Root cause**: `skills/init-project-html/references/TEMPLATE_SPEC.md` remains active agent-facing reference material and still lists hidden commands such as `meta set`, `actor add`, `feature add`, `submodule add`, `function add`, and `edge add`.

**Files involved**: `skills/init-project-html/references/TEMPLATE_SPEC.md` (`30-130`), `test/architecture-script.test.js` active-doc scan (`114-129`).

**Fix approach**: Replace fine-grained CLI examples in `TEMPLATE_SPEC.md` with unified `apltk architecture add ...` / `remove ...` examples where supported. For meta/actor/function/variable/dataflow/error rows, describe YAML fields and say to consult `apltk architecture --help` for currently supported public commands; do not show hidden verb syntax. Extend the active-doc scan to include `skills/init-project-html/references/TEMPLATE_SPEC.md`.

**Complexity**: Documentation + test update.

**Regression test**: REGTEST-46 (Documentation scan -> `test/architecture-script.test.js`)
- GIVEN active docs include `skills/design/references/architecture.md`, `skills/update-project-html/SKILL.md`, and `skills/init-project-html/references/TEMPLATE_SPEC.md`
- WHEN the docs scan runs
- THEN no file contains `apltk architecture (feature|submodule|function|variable|dataflow|error|edge|meta|actor) (add|set|remove|reorder)`.
- Oracle: fails on Round 7 reviewed code because `TEMPLATE_SPEC.md` contains forbidden examples; passes after FIX-03.

#### FIX-04: Replace rollback-only batch mutation with staged commit semantics (P2-1)

**Root cause**: Both batch branches call mutation verbs sequentially, each of which saves YAML/overlay state. The catch block restores state on normal exceptions, but a process crash between writes can leave partial state.

**Files involved**: `skills/init-project-html/lib/atlas/cli.js` > `performMutation()` (`217-259`), `processAddEntity()` (`748-1036`), interleaved batch branch (`1039-1195`), simple-pair batch branch (`1198-1278`).

**Fix approach**: Introduce staged batch execution for `verbAdd()` batch modes. The worker should stage mutations against an in-memory state or temporary atlas/overlay directory and commit once after all entities succeed. Preserve undo/history behavior as one batch-level entry and preserve existing rollback tests. If a true temp-dir staging design is too invasive, report back before changing state.js.

**Complexity**: Complex.

**Structural/manual verification**: REGTEST-47 (Structural/manual -> no automatic source mutation required)
- Inspect the resulting batch implementation and confirm it no longer relies on per-entity durable saves followed by rollback for normal batch success.
- Confirm the old `Batch atomicity is best-effort` crash-risk comment is removed or replaced with wording that matches the implemented staged commit semantics.
- Run existing rollback regressions and new relation-source tests.
- Oracle: Round 7 reviewed code fails structural inspection because it explicitly uses rollback-based sequential writes; fixed code passes inspection.

#### FIX-05: Remove unreachable hidden fine-grained help pages from help builder (P3-1)

**Root cause**: `buildArchitectureHelpPage()` still defines `familyPages` and `actionPages` for hidden fine-grained verbs even though hidden-verb requests redirect before those pages are returned.

**Files involved**: `skills/init-project-html/lib/atlas/cli-help.js` > `familyPages` (`54-237`), `actionPages` (`239-788`), hidden redirect (`789-793`), public `add`/`remove` pages (`1010-1080`).

**Fix approach**: Remove hidden fine-grained `familyPages` and hidden action-page entries from `cli-help.js`. Keep public top-level help and unified `add`/`remove` pages. Keep hidden verb redirects so `feature add --help` and similar still point to public unified help.

**Complexity**: Simple.

**Regression test**: REGTEST-48 (Unit/source scan -> `test/architecture-script.test.js`)
- GIVEN `cli-help.js` is loaded
- WHEN scanning source or invoking hidden help cases
- THEN public help still works and the help builder source no longer contains hidden command usage strings such as `apltk architecture feature add --slug`.
- Oracle: fails on Round 7 reviewed code because hidden help strings remain; passes after FIX-05.

#### FIX-06: Add positive batch auto-render regression coverage (P3-2)

**Root cause**: Batch render code exists in both batch paths, but tests cover only no-render and skipped-render behavior, not the positive successful render path.

**Files involved**: `test/atlas-cli.test.js` near `REGTEST-22` / `REGTEST-23` render behavior (`1906-1945`).

**Fix approach**: Add one integration test that runs successful batch `add` without `--no-render`, then asserts `resources/project-architecture/index.html` exists. No source change is expected for this issue.

**Complexity**: Test-only.

**Regression test**: REGTEST-49 (Integration -> `test/atlas-cli.test.js`)
- GIVEN a fresh project
- WHEN running `add feature f1 feature f2 --project <root>` without `--no-render`
- THEN the command exits 0 and `resources/project-architecture/index.html` exists.
- Oracle: this is a coverage regression; it should pass on current behavior, but it closes the reported missing assertion.

---

## 3. Execution Plan

### Worker Prompt Index

**Fix Worker Prompts:**

| Fix ID | Worker Prompt File | Description |
|---|---|---|
| FIX-01 | `fix/FIX-01-relation-source-validation.md` | Validate unified relation source endpoints before writing edges |
| FIX-02 | `fix/FIX-02-remove-relation-suggestions.md` | Include available-edge suggestions for missing intra-feature source removal |
| FIX-03 | `fix/FIX-03-template-spec-docs.md` | Remove hidden fine-grained commands from active atlas reference docs |
| FIX-04 | `fix/FIX-04-staged-batch-atomicity.md` | Replace rollback-only batch mutation with staged commit semantics |
| FIX-05 | `fix/FIX-05-remove-hidden-help-pages.md` | Remove unreachable hidden fine-grained help pages from help builder |
| FIX-06 | `fix/FIX-06-batch-auto-render-coverage.md` | Add positive batch auto-render coverage |

**Regression / Verification Worker Prompts:**

| Test ID | Worker Prompt File | Related Fix | Description |
|---|---|---|---|
| REGTEST-44 | `fix/REGTEST-44-relation-source-validation.md` | FIX-01 | Missing source endpoint is rejected and no edge is written |
| REGTEST-45 | `fix/REGTEST-45-remove-relation-suggestions.md` | FIX-02 | Missing intra-feature relation source reports available edges |
| REGTEST-46 | `fix/REGTEST-46-template-spec-doc-scan.md` | FIX-03 | Active-doc scan includes `TEMPLATE_SPEC.md` |
| REGTEST-47 | `fix/REGTEST-47-batch-atomicity-structural.md` | FIX-04 | Structural/manual verification of staged batch atomicity |
| REGTEST-48 | `fix/REGTEST-48-hidden-help-source-scan.md` | FIX-05 | Hidden help strings are removed while public help still works |
| REGTEST-49 | `fix/REGTEST-49-batch-auto-render.md` | FIX-06 | Successful batch add auto-renders without `--no-render` |

### Batch Schedule

#### Batch 1 — Relation CLI Defects

- **Workers**: FIX-01 -> FIX-02
- **Strategy**: Sequential; both edit `skills/init-project-html/lib/atlas/cli.js`.
- **Gate**:
  - [ ] FIX-01 and FIX-02 report success.
  - [ ] `node --test test/atlas-cli.test.js --test-name-pattern "add relation|remove relation"` passes.

#### Batch 2 — Batch Atomicity

- **Workers**: FIX-04
- **Strategy**: Single complex worker; depends on Batch 1 because it touches `verbAdd()` relation processing.
- **Gate**:
  - [ ] FIX-04 reports success.
  - [ ] `node --test test/atlas-cli.test.js --test-name-pattern "batch|REGTEST-38|REGTEST-39"` passes.
  - [ ] Coordinator reads the diff and confirms batch mode no longer uses durable per-entity saves plus rollback as the success-path atomicity mechanism.

#### Batch 3 — Documentation and Help Cleanup

- **Workers**: FIX-03 and FIX-05 may run in parallel; they edit different files.
- **Strategy**: Parallel if no local file overlap exists.
- **Gate**:
  - [ ] FIX-03 and FIX-05 report success.
  - [ ] `node --test test/architecture-script.test.js` passes.
  - [ ] `rg "apltk architecture (feature|submodule|function|variable|dataflow|error|edge|meta|actor) (add|set|remove|reorder)" skills/init-project-html/references/TEMPLATE_SPEC.md skills/design/references/architecture.md skills/update-project-html/SKILL.md` returns no active hidden-command examples.

#### Batch 4 — Test-Only Coverage

- **Workers**: FIX-06
- **Strategy**: Single worker; modifies `test/atlas-cli.test.js`.
- **Gate**:
  - [ ] FIX-06 reports success.
  - [ ] `node --test test/atlas-cli.test.js --test-name-pattern "batch auto-renders"` passes.

#### Batch 5 — Regression / Verification Workers

- **Workers, sequential by file overlap**:
  - `test/atlas-cli.test.js`: REGTEST-44 -> REGTEST-45 -> REGTEST-49
  - `test/architecture-script.test.js`: REGTEST-46 -> REGTEST-48
  - Structural/manual: REGTEST-47
- **Strategy**: Run sub-batches sequentially per target file; `REGTEST-47` can run after FIX-04.
- **Depends on**: All fix batches.
- **Gate**:
  - [ ] Each REGTEST worker reports the oracle status.
  - [ ] `node --test test/atlas-cli.test.js` passes.
  - [ ] `node --test test/architecture-script.test.js` passes.

#### Batch 6 — Final Integration

- **Tasks**: Full suite, build, report cross-check.
- **Gate**:
  - [ ] `npm test` passes.
  - [ ] `npm run build` passes.
  - [ ] `git diff --check` reports no whitespace errors.
  - [ ] Every Round 7 `REPORT.md` finding maps to a completed fix/verification item.

---

## 4. Final Verification

- [ ] Every issue in Round 7 `REPORT.md` has a completed fix or verification outcome.
- [ ] Every P1 issue has an automated regression test that fails on the reviewed code and passes after the fix.
- [ ] P2 batch atomicity has structural/manual verification and existing rollback tests still pass.
- [ ] P3 coverage/help cleanup workers have completed.
- [ ] All worker prompts in Section 3 have been dispatched and returned success.
- [ ] Full test suite passes with no regressions.
- [ ] All changes are committed in a single commit after verification.

---

## 5. References

- **Worker prompt files**:
  - `fix/FIX-01-relation-source-validation.md`
  - `fix/FIX-02-remove-relation-suggestions.md`
  - `fix/FIX-03-template-spec-docs.md`
  - `fix/FIX-04-staged-batch-atomicity.md`
  - `fix/FIX-05-remove-hidden-help-pages.md`
  - `fix/FIX-06-batch-auto-render-coverage.md`
  - `fix/REGTEST-44-relation-source-validation.md`
  - `fix/REGTEST-45-remove-relation-suggestions.md`
  - `fix/REGTEST-46-template-spec-doc-scan.md`
  - `fix/REGTEST-47-batch-atomicity-structural.md`
  - `fix/REGTEST-48-hidden-help-source-scan.md`
  - `fix/REGTEST-49-batch-auto-render.md`
- **Code files to modify**:
  - `skills/init-project-html/lib/atlas/cli.js`
  - `skills/init-project-html/lib/atlas/cli-help.js`
  - `skills/init-project-html/references/TEMPLATE_SPEC.md`
  - `test/atlas-cli.test.js`
  - `test/architecture-script.test.js`
- **Project context files**:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `docs/architecture/cli-architecture.md`
- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md`
  - `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- **Fix History**:

### Round 6 — 2026-06-08
- **Issues planned**: P1:11
- **Outcome**: Superseded by Round 7 review after implementation addressed the broad Round 6 defects.
- **Key notes**: Round 6 planned fixes for schema-invalid relation kinds, endpoint validation, add atomicity, batch flag scoping, module cascade removal, hidden help/docs, and `diff --spec` after-page rendering. Round 7 confirms most of those broad issues are resolved and narrows remaining work to six findings.
