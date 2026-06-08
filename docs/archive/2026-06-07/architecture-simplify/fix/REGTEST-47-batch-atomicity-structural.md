# Verification Worker Prompt: REGTEST-47-batch-atomicity-structural

- **Related fix**: FIX-04 — staged batch atomicity

## 1. Mission & Rules

### Mission

Perform structural/manual verification that batch `add` no longer relies on sequential durable writes plus rollback as its success-path atomicity mechanism.

### Context

The P2 finding is crash-window risk. A true crash oracle would require intrusive fault injection. This worker performs structural verification and runs existing rollback tests.

### Rules

- Do not modify source code unless the coordinator explicitly asks.
- You may inspect diffs and run commands.
- Report pass/fail with evidence lines.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — inspect batch implementation after FIX-04.
- `test/atlas-cli.test.js` — existing rollback/batch tests.
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-04-staged-batch-atomicity.md`.

### Verification Design

- **Test ID**: REGTEST-47
- **Type**: Structural/manual verification
- **Location**: report-only; no test file required unless coordinator requests one.
- **Scenario**: GIVEN FIX-04 is applied, WHEN inspecting batch code, THEN success path stages mutations and commits once after all entities pass.
- **Oracle**: Round 7 reviewed code fails because it contains explicit rollback-only crash-risk comment and per-entity durable writes; fixed code passes structural inspection.

## 3. Tasks

1. Inspect `skills/init-project-html/lib/atlas/cli.js`.
2. Confirm both batch branches:
   - stage mutations before durable commit;
   - commit once on success;
   - discard staged state on failure;
   - write one undo/history entry.
3. Confirm the old comment `Batch atomicity is best-effort via JS-level try/catch rollback` is removed or replaced with accurate staged-commit wording.
4. Run existing batch/rollback tests.

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js --test-name-pattern "batch|REGTEST-37|REGTEST-38|REGTEST-39"`
   - Expected: passes.
2. Run: `rg "Batch atomicity is best-effort|SIGKILL.*partial state" skills/init-project-html/lib/atlas/cli.js`
   - Expected: no stale rollback-only crash-risk wording remains.

## 5. Scope & References

### Allowed Files

- No file modifications expected.

### Forbidden Files

- All source/test files unless coordinator changes scope.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-04-staged-batch-atomicity.md`
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
