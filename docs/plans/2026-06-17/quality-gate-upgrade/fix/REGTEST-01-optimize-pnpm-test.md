# Regression Test Worker Prompt: REGTEST-01-optimize-pnpm-test

- **Related fix**: FIX-01 — optimizer pnpm test validation

---

## 1. Mission & Rules

### Mission

Add a regression test that prevents `scripts/optimize.mjs` from reintroducing npm command delegation after the pnpm migration.

### Context

FIX-01 changes the optimizer's real-change validation command from `npm test` to `pnpm test`. The regression oracle should fail on the unfixed code because `scripts/optimize.mjs` contains `execSync('npm test', ...)`, and pass after the fix because it contains `execSync('pnpm test', ...)`.

### Rules

- Only create or modify test files — never modify source code or `scripts/optimize.mjs`.
- The test must fail on the unfixed code and pass after the fix is applied.
- Follow existing `node:test` and `assert/strict` patterns in `test/quality-gate-workflows.test.js`.
- If the test cannot be designed to fail before the fix, report to the coordinator — do not write a weak test.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- `scripts/optimize.mjs` — fixed command value to validate.
- `test/quality-gate-workflows.test.js` — existing config/workflow regression test file and style reference.
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-optimize-pnpm-test.md` — fix context.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P1-001 details.

### Test Design

- **Test ID**: REGTEST-01
- **Type**: Static config/source regression test
- **Location**: `test/quality-gate-workflows.test.js`
- **Scenario**: GIVEN the optimizer performs post-change validation WHEN reading `scripts/optimize.mjs` THEN the validation command uses `pnpm test` and does not invoke `npm test`.
- **Oracle**: On unfixed code, the test fails because the file contains `execSync('npm test', ...)`. After FIX-01, the test passes because the file contains `execSync('pnpm test', ...)` and no `execSync('npm test'...)` call.

---

## 3. Tasks

1. Open `test/quality-gate-workflows.test.js`.
2. Reuse existing imports; the file already imports `node:test`, `node:assert/strict`, `node:fs`, and `node:path`.
3. Add a new test near the other pnpm migration regression tests:

   ```js
   test('REGTEST-01: optimizer validation runs tests through pnpm', () => {
     const optimizer = fs.readFileSync(
       path.join(projectRoot, 'scripts', 'optimize.mjs'),
       'utf-8',
     );

     assert.ok(
       optimizer.includes("execSync('pnpm test'"),
       'optimizer validation must run pnpm test',
     );
     assert.ok(
       !optimizer.includes("execSync('npm test'"),
       'optimizer validation must not run npm test',
     );
   });
   ```

4. If `test/quality-gate-workflows.test.js` already has another `REGTEST-01` name, rename this new test to `REGTEST-02` or the next available number while keeping the assertion content unchanged.
5. Keep existing workflow, hoisting, lint-staged, and root script tests unchanged.

### Output

When done, report back to the coordinator:

- **Test file**: `test/quality-gate-workflows.test.js`
- **Test name**: `REGTEST-01: optimizer validation runs tests through pnpm` or the next available REGTEST number
- **Oracle confirmed**: fails before fix / passes after fix
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before FIX-01 is applied, if possible: `node --test test/quality-gate-workflows.test.js`
   - Expected: the new optimizer validation test fails on `execSync('npm test'...)`.
2. Run after FIX-01 is applied: `node --test test/quality-gate-workflows.test.js`
   - Expected: all tests in the file pass.
3. Run after build if dist-dependent tests are needed by the coordinator: `npx --yes pnpm@11.6.0 test`
   - Expected: full test suite passes. If local pnpm/network availability blocks this, report the exact error for coordinator final verification.

---

## 5. Scope & References

### Allowed Files

- `test/quality-gate-workflows.test.js` — add the static regression test here.

### Forbidden Files

- `scripts/optimize.mjs` — source fix is owned by `FIX-01-optimize-pnpm-test.md`.
- `package.json` — current report does not identify a root script defect.
- `.github/workflows/**` — current report does not identify workflow defects.
- `packages/**`, `bin/**` — regression test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-optimize-pnpm-test.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
