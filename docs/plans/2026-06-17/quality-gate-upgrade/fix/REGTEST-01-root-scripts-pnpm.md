# Regression Test Worker Prompt: REGTEST-01-root-scripts-pnpm

- **Related fix**: FIX-01 — root scripts pnpm migration

---

## 1. Mission & Rules

### Mission

Add a regression test that prevents root `package.json` scripts from reintroducing npm command delegation after the pnpm migration.

### Context

FIX-01 changes `prepublishOnly` and `test:coverage` from npm commands to pnpm commands. The regression oracle should fail on the unfixed code because those script values contain `npm run build` and `npm test`, and pass after the fix because they use pnpm.

### Rules

- Only create or modify test files — never modify source code or `package.json`.
- The test must fail on the unfixed code and pass after the fix is applied.
- Follow existing `node:test` and `assert/strict` patterns in `test/quality-gate-workflows.test.js`.
- If the test cannot be designed to fail before the fix, report to the coordinator — do not write a weak test.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- `package.json` — fixed script values to validate.
- `test/quality-gate-workflows.test.js` — existing config/workflow regression test file and style reference.
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-root-scripts-pnpm.md` — fix context.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P1-001 details.

### Test Design

- **Test ID**: REGTEST-01
- **Type**: Config regression test
- **Location**: `test/quality-gate-workflows.test.js`
- **Scenario**: GIVEN the root package declares pnpm as its package manager WHEN reading root scripts THEN publish and coverage aliases use pnpm and do not contain npm commands.
- **Oracle**: On unfixed code, the test fails because `prepublishOnly` equals `npm run build` and `test:coverage` equals `COVERAGE=true npm test`. After FIX-01, both assertions pass.

---

## 3. Tasks

1. Open `test/quality-gate-workflows.test.js`.
2. Reuse existing imports; the file already imports `node:test`, `node:assert/strict`, `node:fs`, and `node:path`.
3. Add a new test after `const projectRoot = path.resolve(__dirname, '..');` or near the other config regression tests:

   ```js
   test('REGTEST-01: root scripts use pnpm after package manager migration', () => {
     const pkg = JSON.parse(
       fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
     );

     assert.equal(pkg.packageManager, 'pnpm@11.6.0');
     assert.equal(pkg.scripts.prepublishOnly, 'pnpm run build');
     assert.equal(pkg.scripts['test:coverage'], 'COVERAGE=true pnpm test');
     assert.ok(!pkg.scripts.prepublishOnly.includes('npm '));
     assert.ok(!pkg.scripts['test:coverage'].includes('npm '));
   });
   ```

4. Keep existing REGTEST-03/04/05 tests unchanged.

### Output

When done, report back to the coordinator:

- **Test file**: `test/quality-gate-workflows.test.js`
- **Test name**: `REGTEST-01: root scripts use pnpm after package manager migration`
- **Oracle confirmed**: fails before fix / passes after fix
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before FIX-01 is applied, if possible: `node --test test/quality-gate-workflows.test.js`
   - Expected: new REGTEST-01 fails on `npm run build` / `COVERAGE=true npm test`.
2. Run after FIX-01 is applied: `node --test test/quality-gate-workflows.test.js`
   - Expected: all tests in the file pass.
3. Run after build if dist-dependent tests are needed by the coordinator: `npx --yes pnpm@11.6.0 test`
   - Expected: full test suite passes.

---

## 5. Scope & References

### Allowed Files

- `test/quality-gate-workflows.test.js` — add the config regression test.

### Forbidden Files

- `package.json` — source/config fix is owned by `FIX-01-root-scripts-pnpm.md`.
- `.github/workflows/**` — current report does not identify workflow defects.
- `packages/**`, `bin/**`, `scripts/**` — regression test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-root-scripts-pnpm.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
