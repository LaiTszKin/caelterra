# Regression Test Worker Prompt: REGTEST-02-root-runtime-dependency

- **Related fix**: FIX-02 — root runtime dependency declaration

---

## 1. Mission & Rules

### Mission

Add a regression test that proves the root published package declares the CLI module it imports as a runtime dependency.

### Context

`FIX-02` moves `@laitszkin/cli` into root `dependencies` because `bin/apollo-toolkit.ts` imports it at runtime. The regression test must fail when `@laitszkin/cli` is only a dev dependency and pass once the published package metadata is correct.

### Rules

- Only create or modify test files — never modify source/config files.
- The test must fail on the unfixed code and pass after `FIX-02`.
- Follow the existing `test/quality-gate-workflows.test.js` style.
- Do not remove the existing `REGTEST-06` workspace devDependency test unless it conflicts with the new published-runtime contract; if it conflicts, update it narrowly so it no longer requires `@laitszkin/cli` in `devDependencies`.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- Fix-related files: `package.json`, `pnpm-lock.yaml`, `bin/apollo-toolkit.ts`, `packages/cli/package.json`.
- Existing test file: `test/quality-gate-workflows.test.js` — append or update tests here.
- Related fix prompt: `docs/archive/2026-06-17/quality-gate-upgrade/fix/FIX-02-root-runtime-dependency.md`.

### Test Design

- **Test ID**: REGTEST-09
- **Type**: Integration / package metadata contract
- **Location**: `test/quality-gate-workflows.test.js`
- **Scenario**: GIVEN the root package exposes `dist/bin/apollo-toolkit.js` as its npm bin WHEN tests inspect root package metadata and source imports THEN the root package declares `@laitszkin/cli` as a runtime dependency and does not duplicate it in devDependencies.
- **Oracle**: On the unfixed code, the test fails because `@laitszkin/cli` is only in `devDependencies`. After `FIX-02`, the test passes.

---

## 3. Tasks

1. Open `test/quality-gate-workflows.test.js`.
2. Review existing `REGTEST-06: root package.json has all internal workspace devDependencies`.
3. If `REGTEST-06` includes `@laitszkin/cli` in `requiredWorkspaceDevDeps`, remove only `@laitszkin/cli` from that devDependency-required array because it is now a runtime dependency.
4. Append a new test named exactly `REGTEST-09: root package declares CLI workspace runtime dependency`.
5. In the test:
   - Parse root `package.json`.
   - Read `bin/apollo-toolkit.ts`.
   - Assert the bin source includes `from '@laitszkin/cli'`.
   - Assert `pkg.dependencies['@laitszkin/cli']` equals `'workspace:*'`.
   - Assert `pkg.devDependencies` does not have own property `@laitszkin/cli`.
   - Assert `pkg.bin['apollo-toolkit']` and `pkg.bin.apltk` both equal `'dist/bin/apollo-toolkit.js'`.
6. Do not modify source or config files.

### Output

When done, report back to the coordinator:

- **Test file**: `test/quality-gate-workflows.test.js`
- **Test name**: `REGTEST-09: root package declares CLI workspace runtime dependency`
- **Oracle confirmed**: test fails before `FIX-02`, passes after `FIX-02`
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before `FIX-02`: `node --test test/quality-gate-workflows.test.js --test-name-pattern "REGTEST-09"`
   - Expected: test fails because `@laitszkin/cli` is only in `devDependencies`.
2. Run after `FIX-02`: `node --test test/quality-gate-workflows.test.js --test-name-pattern "REGTEST-09"`
   - Expected: test passes.
3. Run: `node --test test/quality-gate-workflows.test.js`
   - Expected: all quality-gate workflow tests pass.

---

## 5. Scope & References

### Allowed Files

- `test/quality-gate-workflows.test.js` — add/update regression tests here.

### Forbidden Files

- All source and config files, including `package.json`, `pnpm-lock.yaml`, `bin/apollo-toolkit.ts`, and package `package.json` files.

### Related Documents

- `docs/archive/2026-06-17/quality-gate-upgrade/fix/FIX-02-root-runtime-dependency.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/DESIGN.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/REPORT.md`
