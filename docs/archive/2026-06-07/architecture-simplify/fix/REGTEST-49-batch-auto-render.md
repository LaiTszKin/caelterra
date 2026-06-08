# Regression Test Worker Prompt: REGTEST-49-batch-auto-render

- **Related fix**: FIX-06 — batch auto-render coverage

## 1. Mission & Rules

### Mission

Verify the positive batch auto-render test added for FIX-06.

### Context

The P3 finding is a coverage gap. FIX-06 adds the regression test; this worker confirms the test exists and passes.

### Rules

- Only modify `test/atlas-cli.test.js` if FIX-06 did not already add the test correctly.
- Do not modify source code.
- Follow existing `node:test` patterns.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `test/atlas-cli.test.js` — expected location of REGTEST-49.
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-06-batch-auto-render-coverage.md`.

### Test Design

- **Test ID**: REGTEST-49
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a fresh project, WHEN successful batch `add` runs without `--no-render`, THEN base atlas `index.html` exists.
- **Oracle**: This closes a coverage gap; the test should pass on current behavior if implementation is correct.

## 3. Tasks

1. Confirm `test/atlas-cli.test.js` contains `REGTEST-49: successful batch add auto-renders when no no-render flag is present`.
2. If absent, add it using the exact design from FIX-06.
3. Run the test.

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js --test-name-pattern "REGTEST-49"`
   - Expected: passes.

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — verify or add REGTEST-49 only if missing.

### Forbidden Files

- All source files.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-06-batch-auto-render-coverage.md`
