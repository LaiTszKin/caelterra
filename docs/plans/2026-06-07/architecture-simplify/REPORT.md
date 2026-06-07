# Review Report: 簡化 apltk architecture 指令

- **Spec**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- **Design**: `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
- **Date**: 2026-06-07
- **Reviewer**: Review Skill
- **Round**: 3
- **Verdict**: Needs Attention

---

## Verdict

**Needs Attention** — All 5 functional requirements are satisfied with no P0 or P1 findings. 10 P2 findings identify risks that should be reviewed before merging. The Round 2 P1 issues (render timing, `--data-flow-to` for modules, batch spec-mode rollback) have all been resolved. The remaining issues are of lower severity.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1: Unified `add` — single entity | ✅ Complete | `cli.js:655-786` (verbAdd, processAddEntity), `cli.js:948-972` (single-entity output) | P2-1, P2-2, P2-6, P2-7 |
| Req 2: Unified `add` — batch mode | ✅ Complete | `cli.js:788-945` (interleaved + simple pair batch), `cli.js:860-895` (validation + rollback) | P2-3, P2-4, P2-5 |
| Req 3: Unified `remove` | ✅ Complete | `cli.js:985-1039` (verbRemove), tests L979-991, L1098-1142, L1405-1454 | P2-6, P2-7 |
| Req 4: Retire legacy commands | ✅ Complete | `cli.js:1589-1592` (apply/template intercept), `cli-help.js:791` (hiddenVerbs set) | P2-10, P3-11 |
| Req 5: Compatibility of existing commands | ✅ Complete | `cli.js:1196-1209` (diff), `cli.js:1473-1549` (merge), `cli.js:268-281` (render) | P3-12, P3-13 |

---

## Findings

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **`--depends-on` silently ignored for `relation` entity type** — `processAddEntity` relation case (L762-771) only reads `--data-flow-to`, `--implements`, and `--deployed-on`. If a user specifies `--depends-on` alongside one of those flags, the flag is silently dropped — no edge is created and no error is raised. The SPEC lists `--depends-on` as one of the five supported relation flags. | Relation entity cannot be created with a dependency edge; the flag is silently ignored. | `cli.js` | 762-771 | Spec implementation omission | Req 1, Req 2 |
| 2 | **Change summary inaccurately claims flags were applied for `relation` entity** — The output summary (L963-968) shows all relation flags present in `flags` except `--part-of`, without filtering by whether `processAddEntity` actually consumed them. For `add relation a/svc --data-flow-to b/api --depends-on order`, the output reads `(depends-on: order, data-flow-to: b/api)` claiming `--depends-on` was applied when it was silently ignored. | Change summary is misleading; agents relying on it for verification get incorrect signal. | `cli.js` | 963-968 | Spec implementation omission | Req 1 |
| 3 | **Simple pair batch mode discards `'skipped'` return value** — `processAddEntity()` is called without capturing its return value (L927). If an entity already exists, `verbFeature`/`verbSubmodule` returns `'skipped'`, but the success message (L941) still counts it as "added". Interleaved batch mode correctly captures and tracks skipped entities (L884-885). | Duplicate entities in simple pair batch mode are misreported as added. | `cli.js` | 927, 941 | Spec implementation deviation | Req 2 |
| 4 | **Simple pair batch mode lacks pre-validation phase** — The simple pair batch path (L914-936) does not call `validateEntity()` before processing, unlike the interleaved batch mode which validates all entities before any mutation (L860-870). While rollback works correctly, the first entity may be written before rollback is needed on the second. | Inconsistent fast-fail behavior between the two batch modes. Interleaved mode fails clean before any write; simple pair mode makes partial progress on error. | `cli.js` | 914-936 | Spec implementation omission | Req 2 |
| 5 | **No output when all entities in interleaved batch mode are skipped** — When `skipped > 0 && applied === 0` (L900-905), neither the `skipped > 0` branch (L901) nor the `applied > 0` branch (L903) executes. The function returns 0 with no user-facing message at all. | Silent success: user sees nothing and cannot distinguish "all were duplicates" from "nothing happened". | `cli.js` | 900-905 | Spec implementation omission | Req 2 |
| 6 | **Relation flag naming asymmetry between `add` and `remove`** — `add relation` uses semantic flags (`--data-flow-to`, `--implements`, `--deployed-on`) that encode both the target AND edge kind. `remove relation` uses a generic `--to` flag (L1022) that only specifies the target. The edge kind is never forwarded to `verbEdge('remove')`, so if two edges exist between the same endpoints with different kinds (e.g., one `data-row` and one `call`), `remove relation` removes ALL of them indiscriminately. | Edge kind information specified at add time is lost at remove time; no `--kind` flag on unified remove to filter by. | `cli.js` | 1022-1030, 762-781 | Architecture consistency | Req 1, Req 3 |
| 7 | **Feature `--depends-on` dual storage leaves orphaned YAML references after remove** — `add feature X --depends-on Y` writes both a `dependsOn: ['Y']` YAML field on X (L355) AND a `dependency`-kind graph edge (L677-685). `remove feature Y` only cascades graph edge cleanup (L301-302) but does NOT clean up `dependsOn` references on other features pointing to Y. The `validate` command catches this, but remove itself does not maintain referential integrity. | Removing a feature leaves stale `dependsOn` references on other features. Not a crash risk (validate catches it) but a consistency gap. | `cli.js` | 355, 677-685, 297-304 | Architecture consistency | Req 1, Req 3 |
| 8 | **SKILL.md files still teach agents to use retired `apply`/`template` commands** — `skills/init-project-html/SKILL.md` (L69, L79) instructs agents to use `apltk architecture apply` and `apltk architecture apply <proposal.yaml>`. `skills/design/SKILL.md` (L214, L217) references `apltk architecture template` and `apltk architecture apply`. Agents following these instructions hit the retirement error. Additionally, the intercept (L1589-1592) is unreachable when outside a repo because `resolveProjectRoot` throws first (L1581-1587). | Agents following the official skill documentation will encounter retired-command errors with no project-root context, reducing onboarding experience. | `skills/*/SKILL.md` | L69, L79, L214, L217 | Spec implementation omission | Req 4 |
| 9 | **SKILL.md teaches `diff --spec` but `verbDiff` silently ignores the flag** — `skills/design/SKILL.md` (L220) instructs agents to use `apltk architecture diff --spec <spec_dir>`. `verbDiff()` (L1196-1209) has no `--spec` parameter — it auto-discovers all overlays via `collectDiffChanges()`. Any `--spec` flag is parsed by `parseFlags` but never consumed. | Agents following SKILL.md believe they are filtering to one spec when `diff` shows all pending overlays. | `skills/design/SKILL.md`, `cli.js` | L220, 1196-1209 | Spec implementation deviation | Req 4, Req 5 |
| 10 | **`multiVerbs` and `hiddenVerbs` sets duplicated with no sync mechanism** — `cli.js:1562` defines `multiVerbs` (dispatch routing) and `cli-help.js:791` defines `hiddenVerbs` (help visibility) as independent Sets with identical content. There is no shared source of truth or validation check linking them. Adding a verb to one without the other causes dispatch or help display bugs. | Maintenance risk: fine-grained verb list can silently drift between dispatch and help. | `cli.js`, `cli-help.js` | 1562, 791 | Architecture consistency | Req 4 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Single-entity error message references batch syntax** — Usage error (L953) shows `[entity-type entity-name ...]` rather than the SPEC's `[relation-flags...]`. | Minor documentation inaccuracy. | `cli.js` | 953 | Spec implementation deviation | Req 1 |
| 2 | **No duplicate detection for `relation` entity type** — `verbEdge('add')` generates a random ID and always pushes a new edge, never returning `'skipped'`. Unlike feature/module, a duplicate relation add silently creates a duplicate edge. | Unreachable `'skipped'` code path for relations; potential duplicate edges. | `cli.js` | 772-781 | Spec implementation omission | Req 1 |
| 3 | **Undocumented passthrough flags extend the SPEC's CLI surface** — `--evidence` (feature/module, L670, L700), `--kind` (module, L699), and `--id` (relation, L780) work but are not mentioned in the SPEC's CLI signature. | Spec inaccuracy; undocumented flags may confuse agents. | `cli.js` | 670, 700, 780 | Spec implementation deviation | Req 1 |
| 4 | **Edge creation within batch omits `skipUndo`** — `processAddEntity`'s sibling `verbEdge` calls (L677-685, 706-757) do not forward `skipUndo` from the entity flags. Each edge writes an undo snapshot. While the batch rollback mechanism correctly handles failures, per-edge undo snapshots remain on disk after a successful batch. | Subsequent `undo` could partially revert edge operations from a batch. | `cli.js` | 677-685, 706-757 | Architecture consistency | Req 2 |
| 5 | **Dry-run output misleading in batch mode** — Batch mode (both interleaved L897-898 and simple pair L938-939) skips render when `--dry-run` is set, but the success message (L901, L941) still says "add applied — N entities". The dry-run JSON diff from `performMutation` correctly indicates no write, but the batch summary contradicts it. | Minor output inconsistency in dry-run mode. | `cli.js` | 897-910, 938-944 | Spec implementation deviation | Req 2 |
| 6 | **No test for batch mode with `--dry-run`** — There are no tests verifying batch dry-run behavior for either interleaved or simple pair mode. | Regression risk for dry-run correctness in batch mode. | `test/atlas-cli.test.js` | — | Redundant code | Req 2 |
| 7 | **Output format mismatch between interleaved and simple pair batch modes** — Interleaved mode (L901) includes skip count: `atlas: add applied — N entity(ies) added, M skipped`. Simple pair mode (L941) uses a hardcoded count: `atlas: add applied — N entities` with no skip tracking. | Inconsistent agent-facing output for the same operation. | `cli.js` | 901, 941 | Spec implementation deviation | Req 2 |
| 8 | **Relation remove error message lacks available edges list** — When removing a non-existent relation, `verbEdge('remove')` errors (L600-614) state "Edge not found" but do not list available edges. Feature (L372-374) and module (L414-417) remove provide suggestions with available names. | Inconsistent error assistance across entity types. | `cli.js` | 600-614 | Redundant code | Req 3 |
| 9 | **Unified remove relation doesn't forward `--id`** — `verbEdge('remove')` supports precise targeting by `--id` (L586-587, L607). The unified remove relation path (L1021-1034) does not forward an `--id` flag, even though `add relation` does forward `id` (L780). | No precision targeting in unified remove relation. | `cli.js` | 1021-1034 | Spec implementation omission | Req 3 |
| 10 | **DESIGN.md omits `--data-flow-to` for module entities** — Implementation (L747-758) supports `--data-flow-to` for modules, but DESIGN.md interaction anchors and trade-offs only mention `--implements`, `--deployed-on`, and `--depends-on`. | Architecture documentation incomplete. | `DESIGN.md` | §2, §3.1 | Architecture consistency | Req 1 |
| 11 | **`apply`/`template` intercept ordered after `resolveProjectRoot`** — The intercept (L1589-1592) runs after `resolveProjectRoot` (L1581-1587). Outside a repo, the project root error masks the retirement message. Moving the intercept before project root resolution would ensure the migration guidance is always reachable. | Retirement guidance unreachable when outside a project directory. | `cli.js` | 1581-1592 | Architecture consistency | Req 4 |
| 12 | **SPEC mentions `diff --spec` but no such flag exists** — The SPEC example (Req 5, L113) shows `apltk architecture diff --spec`. `verbDiff()` auto-discovers all overlays and does not accept `--spec`. The flag is parsed but silently ignored. | SPEC usage example does not match implementation. | `cli.js` | 1196-1209 | Spec implementation deviation | Req 5 |
| 13 | **No end-to-end test for unified `add --spec` + `diff`** — The existing `diff + --spec` test (L618-653) uses fine-grained verbs (`submodule add --spec`). The unified `add --spec` has YAML-only test coverage (L1017-1035) but no end-to-end test with `diff`. | Regression gap for unified add + diff compatibility. | `test/atlas-cli.test.js` | — | Redundant code | Req 5 |
| 14 | **DESIGN.md says "6 verbs" but help lists 10** — DESIGN.md (L60) claims the target has "6 verbs: add/remove/diff/merge/render/open". The actual help (cli-help.js:732-744) lists 10: the 6 above plus `validate`, `status`, `scan`, `undo` (which the SPEC's Out of Scope allows retaining). | Minor imprecision in design documentation. | `DESIGN.md` | L60 | Architecture consistency | Req 4, Req 5 |

**Dimension summary**: Spec implementation omission (5), Spec implementation deviation (6), Architecture consistency (6), Redundant code (3).

---

## Review History

### Round 3 — 2026-06-07
- **Verdict**: Needs Attention
- **Issues**: P1:0, P2:10, P3:14
- **Key findings**: All Round 2 P1 issues confirmed resolved. New findings primarily in spec implementation gaps (relation `--depends-on` silently ignored, change summary inaccuracies), architecture consistency (feature `--depends-on` dual storage orphaned references, relation flag asymmetry in add vs remove), and documentation alignment (SKILL.md still points to retired commands, DESIGN.md imprecisions). Batch mode has several P2 risks around output accuracy and pre-validation consistency. No P0 or P1 issues found — all functional requirements are satisfied.

### Round 2 — 2026-06-07
- **Verdict**: Needs Work
- **Issues**: P1:3, P2:6, P3:4
- **Previously fixed**: All 13 issues resolved in commit e695ef4. Module add render timing, `--data-flow-to` for module, batch spec-mode rollback, feature `--depends-on` edge creation, duplicate entity output, change summary, empty entity list validation, global flag copying in batch, and fine-grained verb `--help` hiding all addressed.

### Round 1 — 2026-06-07
- **Verdict**: Needs Work
- **Issues**: P1:5, P2:8, P3:7
- **Key findings**: Batch per-entity flags not scoped, module relation flags not supported, non-existent entity removal silently successful, various output and help text issues. All resolved in commit f9ae733.

---

## References

- **Project context files**:
  - `CLAUDE.md` (project instructions, testing commands)
  - `docs/architecture/cli-architecture.md` (CLI command dispatch and tool registration)
  - `skills/init-project-html/lib/atlas/state.js` (state loading/saving/overlay — not modified but relevant for rollback behavior)
  - `packages/cli/help-text-builder.ts` (help text builder — minimal relevance)

- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md` — Verification strategy
  - `docs/plans/2026-06-07/architecture-simplify/architecture_diff/ARCHITECTURE_DIFF.md` — Architecture baseline diff
  - `docs/plans/2026-06-07/architecture-simplify/FIX.md` — Round 2 fix plan
  - `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Previous Round 2 report

- **Key code file paths** (code reviewed):
  - `skills/init-project-html/lib/atlas/cli.js` — Verb dispatch, `verbAdd`, `verbRemove`, `processAddEntity`, `performMutation`, batch mode
  - `skills/init-project-html/lib/atlas/cli-help.js` — Help page builders, hiddenVerbs filtering
  - `packages/tools/architecture/index.ts` — TS handler (pass-through delegation)
  - `test/atlas-cli.test.js` — CLI integration tests
  - `skills/init-project-html/SKILL.md` — Agent-facing skill instructions (documentation gap)
  - `skills/design/SKILL.md` — Design skill agent instructions (documentation gap)
