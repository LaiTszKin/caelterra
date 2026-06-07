# Regression Test Worker Prompt: REGTEST-29-batch-undo

- **Related fix**: FIX-02 — batch-level undo support

---

## 1. Mission & Rules

### Mission

Write a regression test verifying that `apltk architecture undo` correctly reverts a completed batch operation.

### Context

FIX-02 adds undo snapshot and history entry after successful batch completion. Before the fix, batch operations leave no undo trail — `undo` reverts whatever mutation preceded the batch. The test must fail before the fix (undo reverts wrong state) and pass after (undo reverts the batch).

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied
- Follow the existing test patterns in `test/atlas-cli.test.js`
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` L1075-1094 — batch processing with skipUndo
- `skills/init-project-html/lib/atlas/cli.js` L245-272 — performMutation undo mechanism
- `test/atlas-cli.test.js` — follow patterns for undo tests

### Test Design

- **Test ID**: REGTEST-29
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js` (append after REGTEST-28)
- **Scenario**: GIVEN a project with architecture initialized WHEN a batch add creates multiple entities AND undo is called THEN the entities created by the batch are reverted
- **Oracle**: Before FIX-02, `undo` does not revert the batch entities (no undo snapshot was written). After FIX-02, `undo` correctly reverts all batch entities.

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Find where REGTEST-28 ends. After it, add:

   ```javascript
   // REGTEST-29: batch undo should revert batch operations
   {
     const dir = prepareIsolatedAtlas();
     
     // First, add a feature before the batch (to establish undo baseline)
     const io1 = runCli(['architecture', 'add', 'feature', 'preFeat'], { cwd: dir });
     assert.equal(io1.code, 0, 'add pre-batch feature');
     
     // Batch add multiple entities
     const io2 = runCli([
       'architecture', 'add',
       'feature', 'batchFeat',
       'module', 'batchMod', '--part-of', 'batchFeat',
     ], { cwd: dir });
     assert.equal(io2.code, 0, 'batch add should succeed');
     
     // Verify batch entities exist
     const stateAfter = readAtlasState(dir);
     const featSlugs = (stateAfter.features || []).map(f => f.slug);
     assert.ok(featSlugs.includes('batchFeat'), 'batch feature should exist before undo');
     
     // Undo should revert the batch
     const io3 = runCli(['architecture', 'undo'], { cwd: dir });
     assert.equal(io3.code, 0, 'undo should succeed');
     
     // Verify batch entities are gone but pre-batch entity remains
     const stateAfterUndo = readAtlasState(dir);
     const featSlugsAfter = (stateAfterUndo.features || []).map(f => f.slug);
     assert.ok(!featSlugsAfter.includes('batchFeat'), 'batch feature should be gone after undo');
     assert.ok(featSlugsAfter.includes('preFeat'), 'pre-batch feature should remain after undo');
   }
   ```

   Note: If `readAtlasState` is not a helper in the test file, use the existing pattern for reading state — search the test file for how other tests load atlas state (e.g., `stateLib.load`, `fs.readFileSync` with YAML parsing).

3. Adapt the test to match existing helper functions in `test/atlas-cli.test.js`

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Test name**: REGTEST-29
- **Oracle confirmed**: Test fails before FIX-02 (undo doesn't revert batch), passes after FIX-02
- **Risks or concerns**: If the test environment doesn't have `readAtlasState` helper, use the state loading pattern from existing tests

---

## 4. Verification

1. Run before fix: `node --test --test-name-pattern="REGTEST-29" test/atlas-cli.test.js`
   - Expected: Test fails (undo doesn't revert batch)
2. Run after fix: `node --test --test-name-pattern="REGTEST-29" test/atlas-cli.test.js`
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

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-02-batch-undo.md` — the fix this test validates
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P2-1 finding
