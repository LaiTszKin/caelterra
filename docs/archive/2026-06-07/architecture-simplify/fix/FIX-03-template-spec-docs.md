# Fix Worker Prompt: FIX-03-template-spec-docs

- **Related issue**: FIX-03 / P1-3

## 1. Mission & Rules

### Mission

Remove hidden fine-grained architecture command examples from active atlas reference documentation.

### Context

Requirement 4 says agents should not discover or use fine-grained architecture verbs. Round 7 found `skills/init-project-html/references/TEMPLATE_SPEC.md` still exposes hidden command syntax.

### Rules

- Modify only allowed documentation/test files.
- Do not remove schema field documentation from `TEMPLATE_SPEC.md`; only update CLI command examples/guidance.
- Use unified `apltk architecture add` / `remove` examples where supported.
- For meta/actor/internal rows without public unified verbs, document fields without exposing hidden commands.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `skills/init-project-html/references/TEMPLATE_SPEC.md` — active atlas field reference.
- `test/architecture-script.test.js` — active-doc scan.
- `skills/init-project-html/agents/openai.yaml` — confirms `TEMPLATE_SPEC.md` is agent-facing.
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — read P1-3.

### Root Cause

`TEMPLATE_SPEC.md` remains active agent-facing reference material and still includes examples such as `apltk architecture feature add`, `submodule add`, `function add`, and `edge add`.

## 3. Tasks

### `skills/init-project-html/references/TEMPLATE_SPEC.md` — remove hidden command examples

1. Open `skills/init-project-html/references/TEMPLATE_SPEC.md`.
2. Replace hidden CLI examples at lines `30`, `39`, `52`, `66`, `78`, `89`, `107`, `118`, and `130`.
3. For public entity operations, use unified examples:
   - feature: `apltk architecture add feature <kebab> [--depends-on a,b]`
   - submodule: `apltk architecture add module <slug> --part-of <feature> [--kind service]`
   - edge/relation: `apltk architecture add relation <feature/submodule> --data-flow-to <feature/submodule>`
4. For meta, actors, function, variable, dataflow, and error rows, remove hidden syntax and say these fields are YAML/schema reference details; exact public command spelling must come from `apltk architecture --help`.

### `test/architecture-script.test.js` — include TEMPLATE_SPEC in active-doc scan

1. Locate `REGTEST-42: active docs do not expose fine-grained architecture verbs`.
2. Add `skills/init-project-html/references/TEMPLATE_SPEC.md` to `filesToScan`.
3. Keep the forbidden regex covering hidden verbs and actions.

### Output

Report:
- Files modified
- Change summary
- Test results
- Risks or concerns

## 4. Verification

1. Run: `node --test test/architecture-script.test.js --test-name-pattern "REGTEST-42"`
   - Expected: test passes.
2. Run: `rg "apltk architecture (feature|submodule|function|variable|dataflow|error|edge|meta|actor) (add|set|remove|reorder)" skills/init-project-html/references/TEMPLATE_SPEC.md`
   - Expected: no matches.

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/references/TEMPLATE_SPEC.md` — remove hidden CLI examples.
- `test/architecture-script.test.js` — extend active-doc scan.

### Forbidden Files

- `skills/init-project-html/lib/atlas/cli.js` — owned by CLI fix workers.
- `skills/init-project-html/lib/atlas/cli-help.js` — owned by FIX-05.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
