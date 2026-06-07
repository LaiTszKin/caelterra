# Review Report: 簡化 apltk architecture 指令

- **Spec**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- **Design**: `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
- **Date**: 2026-06-08
- **Reviewer**: Review Skill
- **Round**: 5
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 1 P1 finding: `validateEntity` at `cli.js:1216` rejects `relation --depends-on`-only specs in batch mode, while `processAddEntity` at `cli.js:882` correctly accepts the same spec in single-entity mode. This causes identical commands to fail or succeed depending on whether they are batched, violating Req 2's consistency requirement. All 5 Round 4 P1 findings are fixed, 12 of 12 P2 findings are fixed or recategorized to P3, and 9 of 10 P3 findings are fixed.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1: Unified `add` — single entity | ✅ Complete | `cli.js:714-1209` (verbAdd, processAddEntity), `state.js:50-142` | P2-2, P3-2, P3-3 |
| Req 2: Unified `add` — batch mode | ⚠️ Partial | `cli.js:856-1094` (interleaved + simple pair batch), `cli.js:1211-1219` (validateEntity) | P1-1, P2-1, P2-2, P3-1, P3-3, P3-4, P3-5 |
| Req 3: Unified `remove` | ✅ Complete | `cli.js:1221-1278` (verbRemove), `state.js:311-328` (deriveOverlay removed.submodules) | P3-6, P3-7 |
| Req 4: Retire legacy commands | ✅ Complete | `cli.js:1853-1856` (apply/template intercept), `cli-help.js:6` (hiddenVerbs), SKILL.md files | P3-8, P3-9 |
| Req 5: Compatibility of existing commands | ✅ Complete | `cli.js:1458` (verbDiff), `cli.js:1746` (verbMerge), `cli.js:1422` (verbOpen), `cli.js:269` (runRender) | P2-3, P3-10 |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **`validateEntity` rejects `relation --depends-on`-only specs in batch mode** — `validateEntity` at L1216 requires `--data-flow-to`, `--implements`, or `--deployed-on` for a `relation` entity, but `processAddEntity` at L882 also accepts `--depends-on` as a standalone alternative (`if (!to && !dependsOn)`). Batch mode calls `validateEntity` first (L1063, L1138), rejecting valid commands that single-entity mode (no `validateEntity` call) accepts. | `apltk architecture add relation myEdge --depends-on target` succeeds in single-entity mode but fails in batch with "Missing required flag --data-flow-to, --implements, or --deployed-on for relation". Causes identical entity specs to behave differently based solely on batching. | `cli.js` | 1216 | Spec implementation deviation | Req 2, Req 1 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **No batch-level undo support** — All batch entities set `skipUndo: true` (L1082), preventing `performMutation` from writing undo snapshots (L256-259) or history entries (L263-266). No aggregate history entry is written for the batch. `apltk architecture undo` reverts whatever mutation preceded the batch, not the batch itself. | Users cannot undo a completed batch operation. Batch operations are invisible in the history log. Contradicts the undo pattern used by all other mutation operations. | `cli.js` | 1082 | Architecture consistency | Req 2 |
| 2 | **`validateEntity` bypassed in single-entity mode** — `validateEntity` (L1211) is only called in batch-mode loops (L1063, L1138). Single-entity mode (L1186) calls `processAddEntity` directly with no structural pre-validation. Validation rules (--part-of, relation flags) are duplicated between `validateEntity` and `processAddEntity` (L777, L881-882), creating two maintenance points that can diverge (as they already have for `--depends-on` in P1-1). | If `validateEntity` is updated with new constraints, single-entity mode silently skips them. Already evidenced by P1-1 divergence. | `cli.js` | 1178 | Architecture defect | Req 1, Req 2 |
| 3 | **REGTEST-14 `diff --spec` filtering assertion is vacuous** — The test at L1736-1737 checks `!diffIo.stdout_text.includes(specBIndex)` where `specBIndex` is an absolute filesystem path. The diff verb's stdout never contains filesystem paths — it only prints a viewer path and count line. The assertion vacuously passes regardless of whether `--spec` filtering works. | The filtering logic in `collectDiffChanges` is correct, but a regression in `--spec` filtering would not be caught by this test. | `test/atlas-cli.test.js` | 1736 | Redundant code | Req 5 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Process crash mid-batch leaves partial state on disk** — The batch rollback wraps entity processing in try/catch (L1086-1093), but `performMutation` with `skipUndo: true` still writes to disk after each entity. A SIGKILL/power loss between entities leaves partial state committed, violating the spec's all-or-nothing guarantee. | Unrecoverable partial state after hard crash. Requires manual reconstruction. Edge case with very low probability in developer tooling. | `cli.js` | 1080 | Spec implementation omission | Req 2 |
| 2 | **Inconsistent "already exists" messages between modes** — Batch mode uses plural "already exist" (L1104, L1108), single-entity mode uses singular "already exists" (L1191). Both grammatically correct in context but stylistically inconsistent. | Cosmetic inconsistency in user-facing output. | `cli.js` | 1104 | Architecture consistency | Req 1 |
| 3 | **Validation logic duplicated between `validateEntity` and `processAddEntity`** — `validateEntity` (L1211-1219) and `processAddEntity` (L777, L881-882) independently encode the same structural constraints (--part-of required for module; relation flags validated). Two maintenance points increase risk of divergence. | If only one location is updated, batch and single-entity modes diverge. Minor maintenance burden. | `cli.js` | 1211 | Redundant code | Req 1, Req 2 |
| 4 | **No target existence validation for `--data-flow-to`, `--implements`, `--deployed-on`** — These three flags create edges without verifying that targets exist. In contrast, `--depends-on` targets ARE validated (per P1-2 fix). Example: `apltk architecture add module api --part-of payment --data-flow-to nonexistent` silently creates a dangling edge. | Dangling edges can be created, causing broken visualizations. Inconsistency with the existing `--depends-on` validation. | `cli.js` | 793 | Spec implementation omission | Req 1, Req 2 |
| 5 | **Duplicate `--depends-on` detection only checks first comma-separated target** — L916-926 only inspects `dependsOnItems[0]`. For `--depends-on a,b,c`, only target `a` is checked for duplicate edges. Targets `b` and `c` always create new edges. `feature` and `module` entity types have no duplicate edge check at all. | Repeated commands with multi-target `--depends-on` create duplicate edges for targets 2+. Low probability in practice. | `cli.js` | 916 | Spec implementation omission | Req 2 |
| 6 | **Missing `--spec` directory existence validation in `verbRemove`** — `verbAdd` validates `--spec` directory existence at L722-730 (per P1-3 fix), but `verbRemove` (L1221) has no equivalent check. Running `remove --spec nonexistent-dir` silently creates the directory structure via `fs.mkdirSync` with `recursive: true` instead of rejecting. | Spec edge case ("`--spec` 缺少对应 spec 目录 → 拒绝操作") not enforced for remove. Accepted silently. | `cli.js` | 1221 | Spec implementation omission | Req 3 |
| 7 | **Submodule remove error for non-existent parent lacks similar-name suggestions** — When removing a submodule and the parent feature doesn't exist, L452-453 prints `Feature "${featureSlug}" not found for submodule removal` without listing available features. Inconsistent with feature removal (L414-416) which uses `sortBySimilarity` for top-5 close matches. | User gets no guidance toward valid feature names when the parent feature is wrong. | `cli.js` | 452 | Architecture consistency | Req 3 |
| 8 | **`formatFix` leaks hidden verb syntax in validation messages** — `formatFix` (L53-70) generates fix commands using hidden fine-grained verb syntax (`apltk architecture function add`). These appear in `validate` and `status --json` output. Documented trade-off at L54-59. | Agents receiving validation errors could discover hidden verb syntax. Fixable only if unified `add` is extended to all entity types. Known limitation. | `cli.js` | 53 | Architecture consistency | Req 4 |
| 9 | **`apply`/`template` `--help` bypasses removal error** — `apltk architecture apply --help` triggers the `--help` check at L1845 before the removal intercept at L1853, showing general usage instead of the removal error. Standard CLI convention but means `apply --help` doesn't tell the user the command was removed. | Minor discoverability issue. Standard CLI flag precedence behavior. | `cli.js` | 1845 | Architecture consistency | Req 4 |
| 10 | **`diff --spec` with batch member path may miss state-based overlay** — `collectDiffChanges` at L1474 computes `overlayDir` directly from `specPath` without using `specOverlayDir()` (L184) which handles batch root resolution via `findBatchRoot()`. Running `diff --spec docs/plans/batch/member-a` uses `<member-a>/architecture_diff/` instead of `<batch-root>/architecture_diff/`. Falls back to HTML-manifest-based diffing which still works but loses state-based diff precision. | Minor: falls back gracefully but loses precision for nested batch members. | `cli.js` | 1474 | Architecture consistency | Req 5 |

**Dimension summary**: Spec implementation deviation (1), Architecture defect (1), Architecture consistency (5), Spec implementation omission (3), Redundant code (2).

---

## Review History

### Round 5 — 2026-06-08
- **Verdict**: Needs Work
- **Issues**: P1:1, P2:3, P3:10
- **Key findings**: 20 of 27 Round 4 findings confirmed fixed in commit `a502cb6`. New P1: `validateEntity` at L1216 rejects `relation --depends-on`-only specs in batch mode while `processAddEntity` accepts them in single-entity mode — a one-line omission (`--depends-on` not checked alongside `--data-flow-to`/`--implements`/`--deployed-on`). Cross-cutting concerns: `validateEntity` and `processAddEntity` maintain duplicated validation logic with batch/single divergence risk; target existence validation exists for `--depends-on` but not for `--data-flow-to`/`--implements`/`--deployed-on`; `--spec` directory validation was added to `verbAdd` but missed in `verbRemove`.

### Round 4 — 2026-06-08
- **Verdict**: Needs Work
- **Issues**: P1:5, P2:12, P3:10
- **Key findings**: All 24 Round 3 issues confirmed resolved in commit `f3812b7`. New findings: duplicate entity edge creation after skip, missing `--depends-on` target validation, missing `--spec` directory validation, `deriveOverlay` submodule removal tracking gap, `diff --spec` not supported. All resolved in commit `a502cb6`.

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
  - `docs/plans/2026-06-07/architecture-simplify/PROPOSAL.md` — Feature proposal
  - `docs/plans/2026-06-07/architecture-simplify/architecture_diff/ARCHITECTURE_DIFF.md` — Architecture baseline diff
  - `docs/plans/2026-06-07/architecture-simplify/FIX.md` — Round 4 fix plan

- **Key code file paths** (code reviewed):
  - `skills/init-project-html/lib/atlas/cli.js` — Verb dispatch, `verbAdd`, `verbRemove`, `processAddEntity`, `validateEntity`, batch mode, legacy intercept
  - `skills/init-project-html/lib/atlas/cli-help.js` — Help page builders, `hiddenVerbs` filtering
  - `skills/init-project-html/lib/atlas/state.js` — State loading/saving/overlay, `deriveOverlay`, `diffPages`
  - `packages/tools/architecture/index.ts` — TS handler (pass-through delegation)
  - `test/atlas-cli.test.js` — CLI integration tests (REGTEST-01 through REGTEST-27)
  - `skills/init-project-html/SKILL.md` — Agent skill instructions
  - `skills/design/SKILL.md` — Design skill agent instructions
