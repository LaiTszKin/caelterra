# Fix Worker Prompt: FIX-04-staged-batch-atomicity

- **Related issue**: FIX-04 / P2-1

## 1. Mission & Rules

### Mission

Replace rollback-only batch `add` mutation with staged commit semantics so normal batch success writes durable state once after all entities pass.

### Context

Requirement 2 says batch add is atomic/all-or-nothing. Round 7 found current implementation writes each entity sequentially and rolls back on caught errors, leaving crash-window risk.

### Rules

- This is a complex fix; read the full `verbAdd()` flow before editing.
- Preserve existing single-entity behavior.
- Preserve `--spec`, `--dry-run`, `--no-render`, undo, and history semantics.
- Do not modify `state.js` unless the staged design cannot be done inside `cli.js`; report before broadening scope.
- Do not add dependencies.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — read `performMutation()`, `processAddEntity()`, both batch branches, and `runRender()`.
- `test/atlas-cli.test.js` — read existing batch/rollback tests around REGTEST-37/38/39.
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — read P2-1.
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — read Section 7 trade-off on batch atomicity.

### Root Cause

Batch mode calls mutation verbs that save after each entity, then restores pre-batch YAML/overlay state on caught errors. This handles normal errors but not a process crash after a partial durable write.

## 3. Tasks

### `skills/init-project-html/lib/atlas/cli.js` — stage batch state before one commit

1. Open `skills/init-project-html/lib/atlas/cli.js`.
2. Locate `performMutation()` around lines `217-259` and understand how base/spec saves are performed.
3. Locate `processAddEntity()` around lines `748-1036` and both batch branches around `1039-1278`.
4. Implement staged batch processing for both interleaved and simple-pair batch modes:
   - load base/merged state once at batch start;
   - apply every entity mutation to staged in-memory state or a temporary atlas/overlay directory;
   - if any entity fails, discard staged state without durable writes;
   - after all entities succeed, save base state or overlay once;
   - write one batch undo snapshot/history entry.
5. Remove or update the `Batch atomicity is best-effort` crash-risk comment so it accurately reflects the new staged commit behavior.
6. Preserve final render behavior: render once after successful batch unless `--dry-run`, `--no-render`, or any entity-level `--no-render` is present.
7. Preserve existing success/skip summary output.

### Output

Report:
- Files modified
- Change summary
- Test results
- Remaining atomicity risks, if any

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js --test-name-pattern "batch|REGTEST-37|REGTEST-38|REGTEST-39"`
   - Expected: all matching tests pass.
2. Run: `node --test test/atlas-cli.test.js --test-name-pattern "add relation rejects missing source|add relation"`
   - Expected: relation tests still pass after staging changes.

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — staged batch implementation.

### Forbidden Files

- `test/atlas-cli.test.js` — owned by REGTEST workers and FIX-06.
- `skills/init-project-html/lib/atlas/state.js` — ask coordinator before modifying.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
