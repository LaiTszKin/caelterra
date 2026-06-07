# Review Report: 簡化 apltk architecture 指令

- **Spec**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- **Design**: `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
- **Date**: 2026-06-08
- **Reviewer**: Review Skill
- **Round**: 4
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 5 P1 findings indicate that some requirements are only partially satisfied. The Round 3 issues have all been resolved in commit `f3812b7`, but new P1 findings emerged concerning duplicate entity edge creation, missing existence validation for entity references, missing `--spec` directory validation, `deriveOverlay()` not tracking submodule removals, and `diff` ignoring the `--spec` flag. These affect Req 1, Req 3, and Req 5.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1: Unified `add` — single entity | ⚠️ Partial | `cli.js:674-1075` (verbAdd, processAddEntity), `cli.js:179-190` (specOverlayDir) | P1-1, P1-2, P1-3, P2-1, P3-1, P3-2 |
| Req 2: Unified `add` — batch mode | ⚠️ Partial | `cli.js:856-1041` (interleaved + simple pair batch), `cli.js:1077-1085` (validateEntity) | P1-2, P2-2, P2-3, P2-4, P3-3, P3-4, P3-5 |
| Req 3: Unified `remove` | ⚠️ Partial | `cli.js:1087-1144` (verbRemove), `state.js:311` (deriveOverlay), `state.js:247-251` (mergeOverlay) | P1-4, P2-5, P2-6, P2-12, P3-9, P3-10 |
| Req 4: Retire legacy commands | ✅ Complete | `cli.js:1685-1688` (apply/template intercept), `cli-help.js:791` (hiddenVerbs), SKILL.md files | P2-7, P3-6 |
| Req 5: Compatibility of existing commands | ⚠️ Partial | `cli.js:1301-1314` (verbDiff), `cli.js:1287-1299` (verbOpen), `cli.js:269-282` (runRender) | P1-5, P2-8, P2-9, P2-10, P2-11, P3-7, P3-8 |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Duplicate entity + relation flags create edges despite skipped entity** — In `processAddEntity` for `feature` (L695) and `module` (L727), the `'skipped'` return from `verbFeature`/`verbSubmodule` is never checked before processing relation flags (`--depends-on`, `--implements`, `--deployed-on`, `--data-flow-to`). The SPEC says duplicate entities should be skipped, but relation edges are silently created while the output says "no change". For `relation` (L802), the duplicate check is gated by `if (to)` so when only `--depends-on` is provided, no duplicate check runs at all. | User sees "no change" message but state is silently mutated with relation edges. Violates the SPEC's "skip on duplicate" semantics. | `cli.js` | 695 | Spec implementation deviation | Req 1, Req 2 |
| 2 | **No entity existence validation for `--depends-on` targets** — The SPEC edge case requires: "referencing a non-existent entity via `--part-of` or `--depends-on` must be rejected with available names listed". While `--part-of` is validated by `verbSubmodule` (L406), `--depends-on` targets are processed via `verbEdge` which never validates whether the target exists. Affects feature (L698), module (L759), and relation (L836) paths. The `validateEntity` pre-validation (L1077-1085) only checks structural flag presence. | Dependency edges to non-existent entities are silently created, leaving dangling references. Only caught later by `verbValidate`. | `cli.js` | 698 | Spec implementation omission | Req 1, Req 2, Req 3 |
| 3 | **No validation for `--spec <dir>` non-existent directory** — The SPEC edge case says: if `--spec <dir>` specifies a directory that does not exist, the system must reject the operation and prompt. Neither `verbAdd`, `processAddEntity`, `specOverlayDir` (L179), nor `loadResolvedState` (L200) validate that the directory exists. The mutation silently creates an orphan overlay directory. | Silently creates overlay state in a non-existent spec directory instead of rejecting, contrary to the SPEC's explicit edge case requirement. | `cli.js` | 1048 | Spec implementation omission | Req 1 |
| 4 | **`deriveOverlay()` never populates `overlay.removed.submodules`** — `state.js` L311 pushes to `removed.features` but never to `removed.submodules`. Submodule removals in `--spec` mode work functionally because the parent feature is stored in the overlay without the removed submodule and `diffPages` detects the change for `_removed.txt`, but `_removed.yaml` has no explicit submodule entries and `mergeOverlay`'s second-pass `removed.submodules` filter (L247-251) is never exercised. | Consumers of `_removed.yaml` cannot determine which submodules were removed. The overlay infrastructure has an explicit `removed.submodules` field that is never written. | `state.js` | 311 | Spec implementation omission | Req 3 |
| 5 | **`diff` verb does not support `--spec` filter** — `verbDiff` (L1301) calls `collectDiffChanges({ projectRoot, outDir })` which only takes `projectRoot` and `outDir`, never reading `flags.spec`. The `--spec` flag is silently ignored. `collectDiffChanges` always walks all directories under `docs/plans/`. The SPEC (Req 5) shows `apltk architecture diff --spec` as the expected usage. | Users cannot filter diff to a single spec. Specs created via `add --spec` with non-`docs/plans/` paths are invisible to `diff`. | `cli.js` | 1301 | Spec implementation omission | Req 5 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Non-error "skipped" message written to stderr** — When an entity already exists, the message `"atlas: no change — <type> \"<name>\" already exists"` is written to `io.stderr` (L1057). The SPEC says duplicate is "not treated as an error", implying stdout for informational output, not stderr. | Non-error informational output goes to stderr, making it harder for callers to distinguish actual errors from informational skips. | `cli.js` | 1057 | Spec implementation deviation | Req 1 |
| 2 | **History entries not cleaned up on batch rollback** — `appendHistory` (L254, 261 in `performMutation`) accumulates entries during batch processing and is not gated by `skipUndo`. When the batch catches a failure and restores the state/overlay file (interleaved L955-963, simple pair L1019-1027), history entries from successfully-processed entities remain. | History file contains phantom entries for entities that were processed before a failure and then rolled back. Inconsistency between recorded history and actual state. | `cli.js` | 955 | Architecture consistency | Req 2 |
| 3 | **Intra-feature duplicate edge detection missing** — The duplicate edge check for relations in `processAddEntity` (L802-813) only examines `state.edges` (cross-feature edges). Intra-feature edges are stored in `feature.edges` with `from`/`to` as plain submodule-name strings. The `endpointEquals` function returns `false` for string-typed values. | Adding a relation between submodules within the same feature can silently create a duplicate edge. | `cli.js` | 802 | Spec implementation omission | Req 2 |
| 4 | **`--depends-on` flag parser does not require a value in interleaved batch mode** — When `--depends-on` is the last flag or is followed by another `--` flag (L884-891), the parser sets it to boolean `true`. This propagates through `splitList(String(true))` producing `['true']`, creating a dependency edge to a non-existent entity named `"true"`. | A malformed command like `apltk architecture add feature payment --depends-on --no-render` silently creates a dangling edge to entity `"true"` instead of producing a clear error. | `cli.js` | 884 | Spec implementation omission | Req 2 |
| 5 | **`verbRemove` relation `--id` validation misleading** — L1124 uses `if (!flags.to && !flags.id)`, implying `--id` alone is sufficient. However, `verbEdge` (L560) always calls `requireFlag(flags, 'to')`, which throws even when `--id` is provided. `--id` is precision targeting alongside `from`/`to` matching (L619-623), not a standalone lookup key. | User running `apltk architecture remove relation svc --id e-abc123` passes the `verbRemove`-level check but immediately fails inside `verbEdge` with "Missing required flag --to". | `cli.js` | 1124 | Architecture consistency | Req 3 |
| 6 | **Error messages list ALL available names instead of similar matches** — When removing a non-existent entity, error messages (feature L380-381, submodule L422-423) list ALL available names rather than similar/close matches as the SPEC requires ("列出相近可用名稱"). No fuzzy or string-similarity filtering is applied. | On a project with dozens of features, dumping all names is overwhelming and contradicts the SPEC's intent of guiding the user to the correct name. | `cli.js` | 381 | Spec implementation deviation | Req 3 |
| 7 | **`hiddenVerbs` and `MULTI_VERBS` are independently maintained duplicates** — `hiddenVerbs` (cli-help.js:791) and `MULTI_VERBS` (cli.js:51) contain identical sets of 9 fine-grained verbs. Any addition or removal requires coordinated updates to both files across separate modules, with no automated consistency enforcement. | If one set is updated without the other, a verb could become unroutable or incorrectly shown in help, violating Req 4. | `cli-help.js` | 791 | Architecture consistency | Req 4 |
| 8 | **`verbOpen` silently strips `--spec` flag** — L1290 explicitly passes `flags: { ...flags, spec: undefined }` to `runRender`. Calling `apltk architecture open --spec <dir>` always renders and opens the base atlas, breaking the consistent `--spec` pattern established by `add`, `remove`, `render`, and `merge`. | Users who expect `open --spec` to open the spec overlay HTML get the base atlas with no warning. Inconsistent with the rest of the CLI. | `cli.js` | 1290 | Architecture consistency | Req 5 |
| 9 | **REGTEST-09 assertions for add `--spec` + `diff` are too shallow** — The end-to-end test (L1600) only checks that stdout contains "Diff pages" and that `index.html` exists. It does not verify overlay content, diff viewer accuracy, or `render --spec` output. | A regression in overlay content or diff computation would not be caught by this test. | `test/atlas-cli.test.js` | 1600 | Redundant code | Req 5 |
| 10 | **No test for `render --spec` output location** — Calling `apltk architecture render --spec <dir>` should generate HTML in `<spec_dir>/architecture_diff/`. No existing test verifies this output path or correct content. | `render --spec` output could be wrong (e.g., writing to the base directory) without detection. This is the primary mechanism for generating overlay HTML consumed by `diff`. | `cli.js` | 269 | Redundant code | Req 5 |
| 11 | **All `merge --spec` tests use `--no-render`** — Every merge test (L787-856) suppresses auto-render. The post-merge HTML output is never verified. | Post-merge rendering could produce wrong output (missing merged changes, stale overlay HTML pages) without test detection. | `test/atlas-cli.test.js` | 1578 | Redundant code | Req 5 |
| 12 | **No test for `submodule remove --spec` `_removed.yaml` content** — Feature remove `--spec` has a recording test (L240), but there is no equivalent test for submodule removal. The related test (L455) only tests base mode. | Combined with the `deriveOverlay removed.submodules` gap (P1-4), submodule removal tracking in `--spec` mode is both unimplemented and untested. | `test/atlas-cli.test.js` | 455 | Redundant code | Req 3 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Render triggered unconditionally after skipped entity** — In single-entity mode (L1053-1054), `runRender` is called even when the entity was skipped. Since no state changed, the render is wasted work. | Minor performance waste on the skipped path; render runs against an unmodified state producing identical output. | `cli.js` | 1053 | Performance concern | Req 1 |
| 2 | **No `skipUndo` mechanism in single-entity mode** — In batch mode, `skipUndo` is set (L951) so only the batch-level render writes one undo snapshot. In single-entity mode, each `verbEdge` call writes separate undo snapshots via `performMutation` (L251/258), so `undo` would only revert the last edge, not the entire add operation. | Undo in single-entity mode reverts only the last sub-operation (edge) rather than the entire add as a single atomic step. | `cli.js` | 706 | Architecture consistency | Req 1 |
| 3 | **Entity-level `--no-render` ignored in batch mode** — The post-batch render decision (L965, L1028) checks global `flags['no-render']` only, ignoring any `--no-render` parsed at the entity level (L906). | A user specifying `--no-render` on an individual entity within a batch still triggers a full render after the batch completes. | `cli.js` | 965 | Spec implementation deviation | Req 2 |
| 4 | **Batch mode detection heuristic is fragile** — L858 uses `args.some(t => t.startsWith('--'))` to distinguish interleaved vs simple pair batch. Any `--flag` triggers interleaved parsing. Simple pair mode accepts no flags beyond `skipUndo`. | In edge cases where global flags are present but entity definitions are pure type/name pairs, parser mode may mismatch user intent. | `cli.js` | 858 | Architecture consistency | Req 2 |
| 5 | **DESIGN.md batch non-atomicity statement is outdated** — §7 states "Batch 非原子性: 若中間 entity 失敗，已處理的部分已寫入磁碟", but the actual code (L940-963, L1019-1027) implements full rollback that restores pre-batch state. | Design documentation inaccuracy may mislead future developers about batch guarantees. Code provides stronger guarantees than documented. | `cli.js` | 940 | Architecture consistency | Req 2 |
| 6 | **`formatFix` leaks hidden verb syntax** — `formatFix` (L55) generates repair commands like `apltk architecture feature add --slug <name>` using hidden verb syntax. These are emitted through `schema.validate()` calls in `verbValidate` (L1148) and `verbStatus` (L1165). | Partially undermines Req 4's "agent should not discover" intent by exposing hidden verb syntax through validation messages. Inherent limitation — `add` does not cover all entity types that schema validation needs. | `cli.js` | 55 | Architecture consistency | Req 4 |
| 7 | **`collectDiffChanges` signature doesn't accept flags** — L1316 only accepts `{ projectRoot, outDir }`, making it impossible to add `--spec` filtering without a signature change. | Adding future flag-based filtering to `diff` requires an API-breaking change to `collectDiffChanges` and all call sites. | `cli.js` | 1316 | Architecture consistency | Req 5 |
| 8 | **`verbOpen` default shows empty atlas when only spec overlays exist** — When `apltk architecture` is run with no arguments (default: `open`, L1658), if the base atlas doesn't exist but spec overlays do (common after `add --spec`), the auto-render in L1290 strips `--spec` and renders an empty/minimal base atlas. | Initial developer experience friction: running plain `apltk architecture` after `add --spec` shows an empty atlas instead of the spec overlay. | `cli.js` | 1290 | Architecture consistency | Req 5 |
| 9 | **No test for non-existent entity remove error path** — No test verifies the error output format, exit code, or available-name listing when removing a non-existent entity. | Regressions in error message quality or behavior for this error path would not be caught. | `test/atlas-cli.test.js` | — | Redundant code | Req 3 |
| 10 | **REGTEST-05/06 only test base mode, not `--spec` mode** — The cascade cleanup tests (kind filter L1525, dependsOn cleanup L1550) only verify base mode behavior. `--spec` mode follows a different code path (overlay mechanism). | Spec-mode cascade removal behavior is untested. The overlay mechanism appears correct based on review but has no test confirmation. | `test/atlas-cli.test.js` | 1525 | Redundant code | Req 3 |

**Dimension summary**: Spec implementation omission (5), Spec implementation deviation (3), Architecture consistency (8), Redundant code (6), Performance concern (1).

---

## Review History

### Round 4 — 2026-06-08
- **Verdict**: Needs Work
- **Issues**: P1:5, P2:12, P3:10
- **Key findings**: All 24 Round 3 issues confirmed resolved in commit `f3812b7`. New findings include: P1 issues with duplicate entity edge creation (relation flags applied after skip), missing entity existence validation for `--depends-on` targets, missing `--spec` directory validation, `deriveOverlay()` not tracking submodule removals, and `diff` ignoring `--spec`. Cross-cutting concerns: entity reference validation is a systemic gap across add/single, add/batch, and remove operations; test coverage for `--spec` mode workflows has significant gaps. All P2 risks from Round 3 (relation `--depends-on`, change summary, batch pre-validation, skip tracking) have been resolved.

### Round 3 — 2026-06-07
- **Verdict**: Needs Attention
- **Issues**: P1:0, P2:10, P3:14
- **Previously fixed**: All 24 issues resolved in commit `f3812b7`. Key resolved items: relation `--depends-on` now creates dependency edges; change summary now filters flags by entity type; batch pre-validation and skip tracking implemented; remove relation forwards `--kind`; remove feature cleans up `dependsOn` references; SKILL.md files updated; `apply`/`template` intercept moved before `resolveProjectRoot`.

### Round 2 — 2026-06-07
- **Verdict**: Needs Work
- **Issues**: P1:3, P2:6, P3:4
- **Previously fixed**: All 13 issues resolved in commit `e695ef4`. Module add render timing, `--data-flow-to` for module, batch spec-mode rollback, feature `--depends-on` edge creation, duplicate entity output, change summary, empty entity list validation, global flag copying in batch, and fine-grained verb `--help` hiding all addressed.

### Round 1 — 2026-06-07
- **Verdict**: Needs Work
- **Issues**: P1:5, P2:8, P3:7
- **Key findings**: Batch per-entity flags not scoped, module relation flags not supported, non-existent entity removal silently successful, various output and help text issues. All resolved in commit `f9ae733`.

---

## References

- **Project context files**:
  - `CLAUDE.md` (project instructions, testing commands)
  - `docs/architecture/cli-architecture.md` (CLI command dispatch and tool registration)
  - `packages/cli/help-text-builder.ts` (help text builder)

- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md` — Verification strategy
  - `docs/plans/2026-06-07/architecture-simplify/architecture_diff/ARCHITECTURE_DIFF.md` — Architecture baseline diff
  - `docs/plans/2026-06-07/architecture-simplify/FIX.md` — Round 3 fix plan

- **Key code file paths** (code reviewed):
  - `skills/init-project-html/lib/atlas/cli.js` — Verb dispatch, `verbAdd`, `verbRemove`, `processAddEntity`, `performMutation`, batch mode
  - `skills/init-project-html/lib/atlas/cli-help.js` — Help page builders, `hiddenVerbs` filtering
  - `skills/init-project-html/lib/atlas/state.js` — State loading/saving/overlay, `deriveOverlay`, `diffPages`
  - `packages/tools/architecture/index.ts` — TS handler (pass-through delegation)
  - `test/atlas-cli.test.js` — CLI integration tests
  - `skills/init-project-html/SKILL.md` — Agent skill instructions
  - `skills/design/SKILL.md` — Design skill agent instructions
