# Regression Test Worker Prompt: REGTEST-31-remove-spec-dir-validation

- **Related fix**: FIX-10 — --spec directory validation in verbRemove

---

## 1. Mission & Rules

### Mission

Write a regression test verifying that `apltk architecture remove --spec <nonexistent-dir>` fails with a clear error message.

### Context

FIX-10 adds `--spec` directory existence validation to `verbRemove`, matching the pattern already in `verbAdd`. Before the fix, `remove --spec nonexistent-dir` silently creates the directory. The test must fail before the fix (command succeeds or creates dir) and pass after (command fails with "Spec directory not found").

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied
- Follow the existing test patterns in `test/atlas-cli.test.js`
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` L1221-1278 — verbRemove (before fix: no --spec dir check)
- `skills/init-project-html/lib/atlas/cli.js` L722-730 — verbAdd --spec dir check (the pattern to match)
- `test/atlas-cli.test.js` — follow test patterns

### Test Design

- **Test ID**: REGTEST-31
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js` (append after REGTEST-30)
- **Scenario**: GIVEN a project with architecture initialized WHEN running `apltk architecture remove feature someFeature --spec nonexistent-dir` THEN the command fails with non-zero exit code AND error mentions "Spec directory not found"
- **Oracle**: Before FIX-10, the command succeeds or creates the directory. After FIX-10, the command fails with the spec error.

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Find where the last REGTEST ends. After it, add:

   ```javascript
   // REGTEST-31: remove --spec with non-existent directory should fail
   {
     const dir = prepareIsolatedAtlas();
     const io = runCli(['architecture', 'remove', 'feature', 'someFeature', '--spec', path.join(dir, 'nonexistent')], { cwd: dir });
     assert.notEqual(io.code, 0, 'remove --spec nonexistent-dir should fail');
     assert.ok(io.stderr_text.includes('Spec directory not found'), 'error should mention spec directory');
   }
   ```

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Test name**: REGTEST-31
- **Oracle confirmed**: Test fails before FIX-10 (command succeeds), passes after FIX-10 (command fails with spec error)
- **Risks or concerns**: None

---

## 4. Verification

1. Run before fix: `node --test --test-name-pattern="REGTEST-31" test/atlas-cli.test.js`
   - Expected: Test fails (command succeeds when it should fail)
2. Run after fix: `node --test --test-name-pattern="REGTEST-31" test/atlas-cli.test.js`
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

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-cli-simple-fixes.md` — Task 6
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P3-6 finding
