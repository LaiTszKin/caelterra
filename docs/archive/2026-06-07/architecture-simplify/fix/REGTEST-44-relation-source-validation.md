# Regression Test Worker Prompt: REGTEST-44-relation-source-validation

- **Related fix**: FIX-01 — relation source validation

## 1. Mission & Rules

### Mission

Add a regression test proving unified `add relation` rejects a missing source endpoint and does not write an invalid edge.

### Context

FIX-01 validates `entityName` in `add relation <entityName> ...` before writing an edge.

### Rules

- Only modify `test/atlas-cli.test.js`.
- The test must fail on the Round 7 reviewed code and pass after FIX-01.
- Do not modify source code.
- Follow existing `node:test` patterns.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `test/atlas-cli.test.js` — use existing add relation tests as format reference.
- `skills/init-project-html/lib/atlas/cli.js` — read relation branch for context only.
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-relation-source-validation.md`.

### Test Design

- **Test ID**: REGTEST-44
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN target `b/api` exists and source `a/missing` does not, WHEN running `add relation a/missing --data-flow-to b/api`, THEN command exits non-zero and no edge references `a/missing`.
- **Oracle**: Must fail on unfixed code because the invalid edge is written; must pass after FIX-01.

## 3. Tasks

1. Add test `REGTEST-44: add relation rejects missing source endpoint`.
2. Build fixture:
   - create temp project;
   - add feature `b`;
   - add module `api --part-of b`.
3. Run `cli.dispatch(['add', 'relation', 'a/missing', '--data-flow-to', 'b/api', '--project', root, '--no-render'], io)`.
4. Assert:
   - code is non-zero;
   - stderr mentions missing source, target, or available features clearly enough to diagnose `a/missing`;
   - loaded state contains no edge with `from.feature === 'a'`.

## 4. Verification

1. Before FIX-01, run the new test.
   - Expected: fails because code is `0` or invalid edge is written.
2. After FIX-01, run: `node --test test/atlas-cli.test.js --test-name-pattern "REGTEST-44"`
   - Expected: passes.
3. Run: `node --test test/atlas-cli.test.js --test-name-pattern "add relation"`
   - Expected: passes.

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — add regression test.

### Forbidden Files

- All source files — test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-relation-source-validation.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
