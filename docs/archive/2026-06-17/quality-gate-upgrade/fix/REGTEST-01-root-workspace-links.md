# Regression Test Worker Prompt: REGTEST-01-root-workspace-links

- **Related fix**: FIX-01 — root workspace links

---

## 1. Mission & Rules

### Mission

Add regression coverage that prevents the root importer from dropping the internal workspace dependencies required by root source and root tests.

### Context

FIX-01 adds root `devDependencies` for internal `@laitszkin/*` workspace packages. Without those declarations, pnpm does not create root `node_modules/@laitszkin/*` links, causing strict ESLint resolution and root `node --test test/**/*.test.js` imports to fail.

### Rules

- Only modify test files. Do not modify `package.json`, `pnpm-lock.yaml`, source code, or hook files.
- The test must fail on the unfixed package metadata and pass after FIX-01.
- Follow existing `node:test` and `assert/strict` patterns in `test/quality-gate-workflows.test.js`.
- Do not write a test that depends on the local `node_modules` state; validate committed metadata instead.
- Workers are leaf nodes. Do not spawn sub-workers.

---

## 2. Context

### Input Files

- `package.json` — metadata under test.
- `test/quality-gate-workflows.test.js` — existing quality-gate regression test file and style reference.
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-root-workspace-links.md` — fix context.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P1-001/P1-002 details.

### Test Design

- **Test ID**: REGTEST-06
- **Type**: Static package metadata regression test
- **Location**: `test/quality-gate-workflows.test.js`
- **Scenario**: GIVEN root source/tests import internal workspace package names WHEN reading root `package.json` THEN root `devDependencies` declares each required `@laitszkin/*` package as `workspace:*`.
- **Oracle**: On unfixed metadata, the test fails because required internal package names are absent from root `devDependencies`. After FIX-01, the test passes.

---

## 3. Tasks

1. Open `test/quality-gate-workflows.test.js`.
2. Add a new test after the existing package-manager migration tests. Use `REGTEST-06` unless that ID already exists; if it exists, use the next available REGTEST number.
3. The test should:
   - Read root `package.json`.
   - Build a `requiredWorkspaceDevDeps` array containing:
     - `@laitszkin/cli`
     - `@laitszkin/tui`
     - `@laitszkin/tool-registry`
     - `@laitszkin/tool-utils`
     - `@laitszkin/tool-architecture`
     - `@laitszkin/tool-codegraph`
     - `@laitszkin/tool-create-review-report`
     - `@laitszkin/tool-create-specs`
     - `@laitszkin/tool-find-github-issues`
     - `@laitszkin/tool-open-github-issue`
     - `@laitszkin/tool-read-github-issue`
     - `@laitszkin/tool-review-threads`
     - `@laitszkin/tool-validate-openai-agent-config`
     - `@laitszkin/tool-validate-skill-frontmatter`
   - Assert each entry exists in `pkg.devDependencies`.
   - Assert each entry value equals `workspace:*`.
4. Keep existing tests unchanged.

### Output

When done, report back to the coordinator:

- **Test file**: `test/quality-gate-workflows.test.js`
- **Test name**: `REGTEST-06: root importer declares internal workspace dev dependencies` or the next available REGTEST number
- **Oracle confirmed**: fails before FIX-01 / passes after FIX-01
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before FIX-01 is applied, if possible: `node --test test/quality-gate-workflows.test.js`
   - Expected: the new root workspace devDependency test fails.
2. Run after FIX-01 is applied: `node --test test/quality-gate-workflows.test.js`
   - Expected: all tests in the file pass.
3. Run after FIX-01 is applied: `npx --yes pnpm@11.6.0 install --frozen-lockfile && npx --yes pnpm@11.6.0 lint --cache && npx --yes pnpm@11.6.0 test`
   - Expected: install, lint, and test pass.

---

## 5. Scope & References

### Allowed Files

- `test/quality-gate-workflows.test.js` — add metadata regression coverage here.

### Forbidden Files

- `package.json`, `pnpm-lock.yaml` — source fix is owned by FIX-01.
- `.husky/pre-commit` — owned by FIX-02.
- All TypeScript source files — regression test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-root-workspace-links.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
