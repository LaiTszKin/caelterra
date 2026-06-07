# Regression Test Worker Prompt: REGTEST-32-edge-target-validation

- **Related fix**: FIX-08 — target existence validation for --data-flow-to/--implements/--deployed-on

---

## 1. Mission & Rules

### Mission

Write a regression test verifying that `--data-flow-to`, `--implements`, and `--deployed-on` flags are validated against existing targets, similar to the existing `--depends-on` validation.

### Context

FIX-08 adds target existence validation for `--data-flow-to`, `--implements`, and `--deployed-on` flags on both module and relation entities. Before the fix, referencing a non-existent target with these flags silently creates dangling edges. The test must fail before the fix (edge created silently) and pass after (command rejected with clear error).

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied
- Follow the existing test patterns in `test/atlas-cli.test.js`
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` L793-816 — module implements/deployed-on edge creation (before fix: no validation)
- `skills/init-project-html/lib/atlas/cli.js` L751-758 — existing --depends-on validation pattern (the model to follow)
- `test/atlas-cli.test.js` — follow test patterns

### Test Design

- **Test ID**: REGTEST-32
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js` (append after REGTEST-31)
- **Scenario**: GIVEN a project with architecture initialized AND a feature "featA" exists WHEN running `apltk architecture add module modX --part-of featA --data-flow-to nonexistent` THEN the command fails with error mentioning the target was not found
- **Oracle**: Before FIX-08, the command succeeds (dangling edge created). After FIX-08, the command fails with a clear error listing available features.

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Find where the last REGTEST ends. After it, add:

   ```javascript
   // REGTEST-32: --data-flow-to/--implements/--deployed-on should reject non-existent targets
   {
     const dir = prepareIsolatedAtlas();
     const io = runCli(['architecture', 'add', 'feature', 'featA'], { cwd: dir });
     assert.equal(io.code, 0, 'add feature featA');
     
     // --data-flow-to non-existent target
     const io2 = runCli(['architecture', 'add', 'module', 'modX', '--part-of', 'featA', '--data-flow-to', 'nonexistent'], { cwd: dir });
     assert.notEqual(io2.code, 0, '--data-flow-to nonexistent should fail');
     assert.ok(io2.stderr_text.includes('not found'), 'error should mention target not found');
     
     // --implements non-existent target
     const io3 = runCli(['architecture', 'add', 'module', 'modY', '--part-of', 'featA', '--implements', 'nonexistent'], { cwd: dir });
     assert.notEqual(io3.code, 0, '--implements nonexistent should fail');
     
     // --deployed-on non-existent target
     const io4 = runCli(['architecture', 'add', 'module', 'modZ', '--part-of', 'featA', '--deployed-on', 'nonexistent'], { cwd: dir });
     assert.notEqual(io4.code, 0, '--deployed-on nonexistent should fail');
   }
   ```

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Test name**: REGTEST-32
- **Oracle confirmed**: Test fails before FIX-08 (edges created silently), passes after FIX-08 (commands rejected)
- **Risks or concerns**: None

---

## 4. Verification

1. Run before fix: `node --test --test-name-pattern="REGTEST-32" test/atlas-cli.test.js`
   - Expected: Test fails (commands succeed when they should fail)
2. Run after fix: `node --test --test-name-pattern="REGTEST-32" test/atlas-cli.test.js`
   - Expected: Test passes
3. Run full suite: `node --test test/atlas-cli.test.js`
   - Expected: All tests pass

---

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — write the regression test here

### Forbidden Files

- All source code files — do not modify

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-cli-simple-fixes.md` — Task 4
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P3-4 finding
