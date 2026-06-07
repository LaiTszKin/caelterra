# Regression Test Worker Prompt: REGTEST-28-relation-batch-depends-on

- **Related fix**: FIX-01 — validateEntity add --depends-on check for relation in batch mode

---

## 1. Mission & Rules

### Mission

Write a regression test verifying that `apltk architecture add relation <name> --depends-on <target>` works correctly in batch mode (it currently fails because `validateEntity` omits `--depends-on`).

### Context

FIX-01 adds `--depends-on` to `validateEntity`'s relation flag check. Before the fix, batch mode rejects `relation --depends-on` commands that single-entity mode accepts. The test must fail before the fix and pass after.

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied
- Follow the existing test patterns in `test/atlas-cli.test.js`
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` L1211-1219 — validateEntity (before fix: rejects --depends-on-only relation)
- `test/atlas-cli.test.js` — follow test patterns (REGTEST-05 for batch, REGTEST-01 for add)

### Test Design

- **Test ID**: REGTEST-28
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js` (append after existing REGTEST-27)
- **Scenario**: GIVEN a project with architecture initialized AND at least one feature exists WHEN running `apltk architecture add relation testRel --depends-on existingFeature feature newFeat` (batch mode with a relation using only --depends-on) THEN the command succeeds AND outputs "add applied" with the relation entity
- **Oracle**: Must fail before FIX-01 (validateEntity rejects with "Missing required flag"), must pass after FIX-01

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Find the end of the last REGTEST (search for "REGTEST-27")
3. After REGTEST-27, add a new test:

   ```javascript
   // REGTEST-28: relation --depends-on in batch mode should succeed
   {
     const dir = prepareIsolatedAtlas();
     const io = runCli(['architecture', 'add', 'feature', 'featA'], { cwd: dir });
     assert.equal(io.code, 0, 'add feature featA');
     
     const io2 = runCli([
       'architecture', 'add',
       'relation', 'relX', '--depends-on', 'featA',
       'feature', 'featB',
     ], { cwd: dir });
     assert.equal(io2.code, 0, 'batch with relation --depends-on should succeed');
     assert.ok(io2.stdout_text.includes('add applied'), 'should report add applied');
     assert.ok(io2.stdout_text.includes('relX'), 'should mention relation name');
   }
   ```

4. Run the test BEFORE the fix is applied to confirm it fails:
   ```
   node --test --test-name-pattern="REGTEST-28" test/atlas-cli.test.js
   ```
   Expected: Test FAILS with "Missing required flag --data-flow-to, --implements, or --deployed-on for relation"

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Test name**: REGTEST-28
- **Oracle confirmed**: Test fails before FIX-01, passes after FIX-01
- **Risks or concerns**: None

---

## 4. Verification

1. Run before fix: `node --test --test-name-pattern="REGTEST-28" test/atlas-cli.test.js`
   - Expected: Test fails (oracle detects the bug)
2. Run after fix: `node --test --test-name-pattern="REGTEST-28" test/atlas-cli.test.js`
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

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-cli-simple-fixes.md` — the fix this test validates
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P1-1 finding
