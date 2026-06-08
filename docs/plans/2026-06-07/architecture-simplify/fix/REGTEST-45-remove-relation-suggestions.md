# Regression Test Worker Prompt: REGTEST-45-remove-relation-suggestions

- **Related fix**: FIX-02 — remove relation suggestions

## 1. Mission & Rules

### Mission

Add a regression test proving `remove relation` reports available edges when an intra-feature source feature is missing.

### Context

FIX-02 replaces an early missing-feature error with a clear error that lists similar available edges.

### Rules

- Only modify `test/atlas-cli.test.js`.
- The test must fail on the Round 7 reviewed code and pass after FIX-02.
- Do not modify source code.
- Follow existing temp project cleanup style.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `test/atlas-cli.test.js` — use relation removal tests as format reference.
- `skills/init-project-html/lib/atlas/cli.js` — read `verbEdge()` remove branch for context only.
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-02-remove-relation-suggestions.md`.

### Test Design

- **Test ID**: REGTEST-45
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN `payment/ui -> payment/api` exists, WHEN running `remove relation paymint/ui --to paymint/api`, THEN stderr includes `Available edges:` and a similar existing edge.
- **Oracle**: Must fail on unfixed code because stderr only says feature not found; must pass after FIX-02.

## 3. Tasks

1. Add test `REGTEST-45: remove relation with missing intra-feature source lists available edges`.
2. Build fixture:
   - create feature `payment`;
   - add modules `ui` and `api`;
   - add relation `payment/ui --data-flow-to payment/api`.
3. Run `cli.dispatch(['remove', 'relation', 'paymint/ui', '--to', 'paymint/api', '--project', root, '--no-render'], io)`.
4. Assert:
   - code is non-zero;
   - stderr contains `Available edges:`;
   - stderr includes `payment/ui` or `payment/api`.

## 4. Verification

1. Before FIX-02, run the new test.
   - Expected: fails because `Available edges:` is absent.
2. After FIX-02, run: `node --test test/atlas-cli.test.js --test-name-pattern "REGTEST-45"`
   - Expected: passes.

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — add regression test.

### Forbidden Files

- All source files — test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-02-remove-relation-suggestions.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
