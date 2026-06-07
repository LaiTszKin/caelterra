# Regression Test Worker Prompt: REGTEST-30-diff-spec-filtering

- **Related fix**: FIX-04 — REGTEST-14 diff --spec filtering assertion

---

## 1. Mission & Rules

### Mission

Write a stronger regression test for `diff --spec` filtering that meaningfully validates only the specified spec's changes appear in the diff output.

### Context

The existing REGTEST-14 assertion checks that stdout doesn't contain a filesystem path — which stdout never contains. The new test (REGTEST-24 in Round 4) already added deeper assertions for the add-spec-then-diff flow. This test (REGTEST-30) specifically targets the FILTERING correctness: two specs with different entities, diff --spec on one should only show that spec's changes.

### Rules

- Only create or modify test files — never modify source code
- The test must meaningfully validate --spec filtering
- Follow the existing test patterns in `test/atlas-cli.test.js`
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `test/atlas-cli.test.js` — REGTEST-14 (~L1710), REGTEST-24 (~L1924) for patterns
- `skills/init-project-html/lib/atlas/cli.js` L1458-1494 — verbDiff and collectDiffChanges

### Test Design

- **Test ID**: REGTEST-30
- **Type**: Integration
- **Location**: `test/atlas-cli.test.js` (replace or enhance REGTEST-14)
- **Scenario**: GIVEN two specs (specA with featureA, specB with featureB) WHEN running `diff --spec specA` THEN the diff output references spec A's changes but NOT spec B's changes
- **Oracle**: The diff viewer HTML for spec A contains "featureA" but not "featureB"

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Locate REGTEST-14 (search for "REGTEST-14" or the two-spec diff test)
3. Read the current REGTEST-14 to understand the setup
4. Replace or enhance the test. The key change: instead of checking stdout path inclusion (which is vacuous), check the DIFF HTML OUTPUT content:

   Read the diff viewer HTML file for the spec, and verify:
   - The HTML file exists for spec A's architecture_diff
   - The HTML content references spec A's entities (featureA)
   - The HTML content does NOT reference spec B's entities (featureB)

   Adapt to match the actual test setup variables. Example:
   ```javascript
   // Check diff viewer HTML only includes spec A's changes
   const diffHtmlPath = path.join(tmpDir, specADir, 'architecture_diff', 'index.html');
   assert.ok(fs.existsSync(diffHtmlPath), 'diff HTML should exist for spec A');
   const diffContent = fs.readFileSync(diffHtmlPath, 'utf8');
   assert.ok(diffContent.includes('featureA'), 'diff HTML should reference spec A entity');
   assert.ok(!diffContent.includes('featureB'), 'diff HTML should NOT reference spec B entity');
   ```

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Test name**: REGTEST-30 (replaces/enhances REGTEST-14)
- **Oracle confirmed**: Meaningful content-based assertion replaces vacuous path-based assertion
- **Risks or concerns**: The entity names must match what the test setup creates

---

## 4. Verification

1. Run: `node --test --test-name-pattern="REGTEST-14" test/atlas-cli.test.js`
   - Expected: Test passes with meaningful assertion
2. Run full suite: `node --test test/atlas-cli.test.js`
   - Expected: All tests pass

---

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — modify the REGTEST-14 test

### Forbidden Files

- All source code files — do not modify

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-03-test-diff-spec.md` — the fix worker prompt
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P2-3 finding
