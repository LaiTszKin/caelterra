# Fix Worker Prompt: FIX-01-relation-source-validation

- **Related issue**: FIX-01 / P1-1

## 1. Mission & Rules

### Mission

Make unified `apltk architecture add relation <endpoint> ...` reject missing source endpoints before writing any edge.

### Context

Requirement 1 requires unified `add relation` to create valid architecture relationships. Round 7 review found that the target endpoint is validated, but the source endpoint represented by `<endpoint>` is not.

### Rules

- Modify only files listed in Section 5.
- Preserve legacy fine-grained `edge add` compatibility unless explicitly needed for this fix.
- Do not weaken schema validation or existing endpoint validation.
- Do not add dependencies.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — read `assertEndpointExists()`, `processAddEntity()` relation branch, and `verbEdge()`.
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — read P1-1.
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — read Requirement 1.

### Root Cause

`processAddEntity()` validates only `to` at `cli.js:999-1001`, then calls `verbEdge('add')`, which parses and writes `from` without checking that the source feature/submodule exists.

## 3. Tasks

### `skills/init-project-html/lib/atlas/cli.js` — validate source endpoint in unified relation add

1. Open `skills/init-project-html/lib/atlas/cli.js`.
2. Locate `assertEndpointExists()` around lines `378-394`; keep or lightly adjust the helper so it produces a clear label for source validation.
3. Locate `processAddEntity()` relation branch around lines `926-1032`.
4. Before duplicate checks and before any `verbEdge('add')` call, add source validation:
   - For all relation modes, call `assertEndpointExists(currentState, entityName, 'relation source')` or an equivalent clear context label.
   - Ensure dependency-only relations (`--depends-on` without `--data-flow-to` / `--implements` / `--deployed-on`) also validate `entityName`.
5. Keep existing target validation intact.
6. Do not change `schema.js`; it remains evidence only for this issue.

### Output

Report:
- Files modified
- Change summary
- Test results
- Risks or concerns

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js --test-name-pattern "add relation"`
   - Expected: all matching tests pass.
2. Run a manual smoke command in a temp project or via existing test helper if convenient:
   - `add relation a/missing --data-flow-to b/api` after creating only `b/api`
   - Expected: non-zero exit and no edge written.

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — source endpoint validation.

### Forbidden Files

- `skills/init-project-html/lib/atlas/schema.js` — evidence only; do not modify for this fix.
- `test/atlas-cli.test.js` — owned by REGTEST-44.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
