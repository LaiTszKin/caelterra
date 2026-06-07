# Fix Worker Prompt: FIX-03-test-diff-spec

- **Related issue**: FIX-04 (P2-3) — REGTEST-14 diff --spec filtering assertion is vacuous

---

## 1. Mission & Rules

### Mission

Fix REGTEST-14 in `test/atlas-cli.test.js` so it meaningfully validates that `diff --spec` filters output to only the specified spec.

### Context

REGTEST-14 attempts to verify `--spec` filtering by checking that stdout does not contain spec B's absolute filesystem path. The diff verb's stdout never contains filesystem paths — it only prints a viewer path and count line. The assertion vacuously passes. This is a P2 — Requirement Risk (test doesn't catch regressions).

### Rules

- Only modify test files — never modify source code
- The test must fail before the fix is applied (on a broken implementation) and pass after
- Follow the existing test patterns in `test/atlas-cli.test.js`

---

## 2. Context

### Input Files

- `test/atlas-cli.test.js` L1730-1745 — REGTEST-14 current code
- `test/atlas-cli.test.js` — study test patterns (REGTEST-09, REGTEST-24 for diff testing style)

### Root Cause

The assertion at L1736-1737 checks:
```javascript
const diffIo = runCli(['architecture', 'diff', '--spec', path.join(tmpDir, 'specA')]);
assert.ok(!diffIo.stdout_text.includes(specBIndex), 'diff --spec A should not include spec B');
```
`specBIndex` is an absolute filesystem path. The diff stdout never prints filesystem paths — it prints viewer paths like `file:///...` and count lines like `Found N changes`. The `includes` check always returns `false` regardless of filtering correctness.

### Test Design

- The test should verify that diff output for spec A references only spec A content
- After `add --spec specA/featureA` and `add --spec specB/featureB`, running `diff --spec specA` should show changes only for featureA
- The diff viewer HTML is generated — we can check the HTML content or the stdout labels

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Locate REGTEST-14 (search for "REGTEST-14" or the diff --spec assertion around L1730)
3. Replace the vacuous assertion with meaningful checks:

   Read the current REGTEST-14 code to understand the exact setup. The test likely:
   - Creates specA with some entities
   - Creates specB with different entities
   - Runs `diff --spec specA`
   - Checks output

   Replace the assertion with checks that:
   - The diff output references spec A's entities (e.g., by checking the HTML output or stdout labels)
   - If the output format includes spec labels, check that only spec A's label appears (not spec B's)
   - At minimum: check that the diff HTML file for spec A exists and contains expected content, while spec B's content is not in the diff output

   Example approach:
   ```javascript
   // Instead of checking stdout for filesystem paths (which it never contains),
   // verify the diff viewer HTML contains only spec A's change labels
   const diffHtml = fs.readFileSync(path.join(tmpDir, specA, 'architecture_diff', 'index.html'), 'utf8');
   assert.ok(diffHtml.includes('featureA'), 'diff HTML should reference spec A entity');
   assert.ok(!diffHtml.includes('featureB'), 'diff HTML should NOT reference spec B entity');
   ```

4. Read the actual REGTEST-14 code first, then adapt the fix to match the actual test structure

### Output

When done, report back to the coordinator:
- **Files modified**: `test/atlas-cli.test.js`
- **Change summary**: Replaced vacuous stdout path-inclusion check with meaningful HTML content assertion for diff --spec filtering
- **Test results**: Run `node --test test/atlas-cli.test.js` and confirm REGTEST-14 passes
- **Risks or concerns**: None

---

## 4. Verification

1. Run the specific test: `node --test --test-name-pattern="REGTEST-14" test/atlas-cli.test.js`
   - Expected: Test passes
2. Run the full test suite: `node --test test/atlas-cli.test.js`
   - Expected: All tests pass

---

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — only modify this file

### Forbidden Files

- All source code files — do not modify

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P2-3 finding
- `skills/init-project-html/lib/atlas/cli.js` L1458-1494 — collectDiffChanges and verbDiff
