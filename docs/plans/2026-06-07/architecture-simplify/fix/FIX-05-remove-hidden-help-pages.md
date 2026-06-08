# Fix Worker Prompt: FIX-05-remove-hidden-help-pages

- **Related issue**: FIX-05 / P3-1

## 1. Mission & Rules

### Mission

Remove unreachable hidden fine-grained help page definitions from `cli-help.js` while preserving public unified help behavior.

### Context

Runtime help redirects hidden verbs to public unified help, but `cli-help.js` still embeds obsolete hidden command pages and examples.

### Rules

- Modify only `skills/init-project-html/lib/atlas/cli-help.js`.
- Preserve `hiddenVerbs` export and redirect behavior.
- Preserve public `add`, `remove`, `diff`, `merge`, `render`, `open`, `validate`, `status`, `scan`, and `undo` help.
- Do not change CLI dispatch behavior.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli-help.js` — read `familyPages`, `actionPages`, hidden redirect, public pages.
- `test/architecture-script.test.js` — read hidden-help tests for expected behavior.
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — read P3-1.

### Root Cause

`buildArchitectureHelpPage()` defines `familyPages` and `actionPages` for hidden verbs even though hidden-verb requests return before those pages are reachable.

## 3. Tasks

### `skills/init-project-html/lib/atlas/cli-help.js` — remove hidden page bodies

1. Open `skills/init-project-html/lib/atlas/cli-help.js`.
2. Remove `familyPages` entries for hidden verbs (`feature`, `submodule`, `function`, `variable`, `dataflow`, `error`, `edge`, `meta`, `actor`).
3. Remove `actionPages` entries for hidden verb/action pairs such as `feature:add`.
4. Keep the hidden redirect around lines `789-793`, adjusted only as needed to continue returning public `add` or `remove` help.
5. Keep public unified help pages intact.

### Output

Report:
- Files modified
- Change summary
- Test results
- Risks or concerns

## 4. Verification

1. Run: `node --test test/architecture-script.test.js --test-name-pattern "hidden verb"`
   - Expected: hidden verb help still redirects to public unified help.
2. Run: `node -e "const h=require('./skills/init-project-html/lib/atlas/cli-help.js'); console.log(h.buildArchitectureHelpPage('feature','add'))"` from repo root.
   - Expected: output contains public `apltk architecture add` help, not `apltk architecture feature add`.

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli-help.js` — remove unreachable hidden help definitions.

### Forbidden Files

- `skills/init-project-html/lib/atlas/cli.js` — not needed for this issue.
- `test/architecture-script.test.js` — owned by REGTEST-48.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
