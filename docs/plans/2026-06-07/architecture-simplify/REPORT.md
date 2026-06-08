# Review Report: 簡化 apltk architecture 指令

- **Spec**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- **Design**: `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
- **Date**: 2026-06-09
- **Reviewer**: Review Skill
- **Round**: 7
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — The change does not yet satisfy the planned business requirements. Requirements 1, 3, and 4 each have current P1 defects.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1: Unified `add` — single entity | Partial | `skills/init-project-html/lib/atlas/cli.js:730-1312`, `skills/init-project-html/lib/atlas/schema.js:398-414`, `test/atlas-cli.test.js:967-980` | P1-1 |
| Req 2: Unified `add` — batch mode | Complete with risk | `skills/init-project-html/lib/atlas/cli.js:1039-1278`, `test/atlas-cli.test.js:985-995`, `test/atlas-cli.test.js:1932-1941` | P2-1, P3-2 |
| Req 3: Unified `remove` | Partial | `skills/init-project-html/lib/atlas/cli.js:1325-1382`, `skills/init-project-html/lib/atlas/cli.js:644-669`, `test/atlas-cli.test.js:1708-1725`, `test/atlas-cli.test.js:2304-2327` | P1-2 |
| Req 4: Retire legacy commands | Partial | `packages/tools/architecture/index.ts:18-41`, `skills/init-project-html/lib/atlas/cli.js:1960-2008`, `skills/init-project-html/lib/atlas/cli-help.js:789-793`, `skills/init-project-html/references/TEMPLATE_SPEC.md:30-130` | P1-3, P3-1 |
| Req 5: Compatibility of existing commands | Complete | `skills/init-project-html/lib/atlas/cli.js:1525-1574`, `skills/init-project-html/lib/atlas/cli.js:1577-1668`, `skills/init-project-html/lib/atlas/cli.js:1861-1936`, `test/atlas-cli.test.js:2335-2355` | None |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | `add relation <endpoint> ...` validates the target endpoint but not the source endpoint represented by `<endpoint>`. | A relation can be written with a missing source feature/submodule and only be rejected later by schema validation, so single-entity relation add can leave invalid atlas state. | `skills/init-project-html/lib/atlas/cli.js`, `skills/init-project-html/lib/atlas/schema.js` | `999-1012`, `610-623`, `398-414` | Spec implementation omission / deviation | Req 1 |
| 2 | `remove relation` can fail without listing similar available names when the requested intra-feature relation's source feature does not exist. | The Req 3 nonexistent-entity behavior is not met for this relation-removal edge case. | `skills/init-project-html/lib/atlas/cli.js` | `647-650` | Spec implementation deviation | Req 3 |
| 3 | Active agent-facing atlas reference documentation still exposes fine-grained commands such as `meta set`, `actor add`, `feature add`, `submodule add`, `function add`, and `edge add`. | Agents can still discover the retired fine-grained command surface from active documentation despite Req 4 requiring those verbs to be hidden from agent use. | `skills/init-project-html/references/TEMPLATE_SPEC.md` | `30`, `39`, `52`, `66`, `78`, `130` | Spec implementation omission | Req 4 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | Batch atomicity is implemented as sequential writes with rollback on caught errors, not as a true single transaction. | Normal validation/runtime failures are rolled back, but a process crash during the batch can leave partial YAML state despite the strict all-or-nothing requirement wording. | `skills/init-project-html/lib/atlas/cli.js` | `1126-1154`, `1137-1139` | Architecture defect | Req 2 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | Hidden fine-grained help pages remain defined in the help builder even though hidden-verb requests redirect before those pages are returned. | Runtime help is not currently exposed, but obsolete help content remains embedded in code. | `skills/init-project-html/lib/atlas/cli-help.js` | `54-75`, `789-793` | Redundant code | Req 4 |
| 2 | Tests cover batch creation, rollback, spec rollback, history/undo cleanup, and `--no-render` suppression, but do not directly assert successful batch auto-render when `--no-render` is absent. | Current implementation contains the render path, but the positive auto-render behavior has no direct regression assertion. | `skills/init-project-html/lib/atlas/cli.js`, `test/atlas-cli.test.js` | `1176-1180`, `1264-1267`, `985-995`, `1932-1941` | Spec coverage gap | Req 2 |

---

## Review History

### Round 7 — 2026-06-09
- **Verdict**: Needs Work
- **Issues**: P1:3, P2:1, P3:2
- **Key findings**: Current implementation resolves the Round 6 broad add/remove/diff compatibility defects, but remaining requirement-level defects exist in relation source validation, relation-removal missing-entity messaging, and active documentation exposure of fine-grained verbs.

### Round 6 — 2026-06-08
- **Verdict**: Needs Work
- **Issues**: P1:11
- **Key findings**: Reported schema-invalid relation kinds, partial writes on failed single-entity add, `add --spec` batch completion failure, incomplete module cascade removal, fine-grained command discovery through help/docs, and incomplete `diff --spec` output after `--no-render`.

### Round 5 — 2026-06-08
- **Verdict**: Needs Work
- **Issues**: P1:1, P2:3, P3:10
- **Key findings**: Reported batch `relation --depends-on` validation divergence.

### Round 4 — 2026-06-08
- **Verdict**: Needs Work
- **Issues**: P1:5, P2:12, P3:10
- **Key findings**: Reported duplicate edge creation after skip, missing dependency target validation, missing `--spec` directory validation, submodule removal tracking gap, and missing `diff --spec` support.

### Round 3 — 2026-06-07
- **Verdict**: Needs Attention
- **Issues**: P1:0, P2:10, P3:14
- **Key findings**: Reported relation `--depends-on`, change summary, batch pre-validation, skip tracking, remove relation kind forwarding, remove feature cleanup, skill docs, and legacy intercept concerns.

### Round 2 — 2026-06-07
- **Verdict**: Needs Work
- **Issues**: P1:3, P2:6, P3:4
- **Key findings**: Reported module add render timing, module data-flow behavior, batch spec-mode rollback, feature dependency edge creation, duplicate entity output, empty entity list validation, global flag copying, and fine-grained help hiding concerns.

### Round 1 — 2026-06-07
- **Verdict**: Needs Work
- **Issues**: P1:5, P2:8, P3:7
- **Key findings**: Reported batch flag scoping, module relation flag support, non-existent entity removal behavior, output, and help text issues.

---

## References

- `AGENTS.md`
- `CLAUDE.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
- `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md`
- `skills/init-project-html/lib/atlas/cli.js`
- `skills/init-project-html/lib/atlas/cli-help.js`
- `skills/init-project-html/lib/atlas/schema.js`
- `skills/init-project-html/lib/atlas/state.js`
- `skills/init-project-html/references/TEMPLATE_SPEC.md`
- `skills/design/references/architecture.md`
- `skills/update-project-html/SKILL.md`
- `packages/tools/architecture/index.ts`
- `test/atlas-cli.test.js`
- `test/architecture-script.test.js`
- `packages/tools/architecture/index.test.ts`
