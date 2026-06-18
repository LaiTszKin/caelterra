# Regression Test Worker Prompt: REGTEST-02-precommit-pnpm

- **Related fix**: FIX-02 — pre-commit pnpm invocation

---

## 1. Mission & Rules

### Mission

Add regression coverage that prevents `.husky/pre-commit` from reintroducing npm/npx package-manager fetching.

### Context

FIX-02 changes the pre-commit hook from `npx --yes pnpm@11.6.0 lint-staged` to `pnpm lint-staged`. The test should protect `quality-gate-setup Req 4` by asserting the hook invokes lint-staged through pnpm and contains no npm/npx fallback.

### Rules

- Only modify test files. Do not modify `.husky/pre-commit`, `.lintstagedrc.json`, source code, package metadata, or lockfiles.
- The test must fail on the unfixed hook and pass after FIX-02.
- Follow existing `node:test` and `assert/strict` patterns in `test/quality-gate-workflows.test.js`.
- Workers are leaf nodes. Do not spawn sub-workers.

---

## 2. Context

### Input Files

- `.husky/pre-commit` — hook file under test.
- `test/quality-gate-workflows.test.js` — existing quality-gate regression test file and style reference.
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-02-precommit-pnpm.md` — fix context.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P2-001 details.

### Test Design

- **Test ID**: REGTEST-07
- **Type**: Static hook regression test
- **Location**: `test/quality-gate-workflows.test.js`
- **Scenario**: GIVEN the pre-commit hook enforces staged-file checks WHEN reading `.husky/pre-commit` THEN it runs `pnpm lint-staged` and does not contain `npx`, `npm exec`, or `npm `.
- **Oracle**: On unfixed hook content, the test fails because the file contains `npx --yes pnpm@11.6.0 lint-staged`. After FIX-02, the test passes.

---

## 3. Tasks

1. Open `test/quality-gate-workflows.test.js`.
2. Add a new test after the lint-staged config test or near other hook quality-gate tests. Use `REGTEST-07` unless that ID already exists; if it exists, use the next available REGTEST number.
3. The test should:
   - Read `.husky/pre-commit`.
   - Trim whitespace.
   - Assert the content includes `pnpm lint-staged`.
   - Assert the content does not include `npx`.
   - Assert the content does not match `/\bnpm\s/`.
4. Keep existing tests unchanged.

### Output

When done, report back to the coordinator:

- **Test file**: `test/quality-gate-workflows.test.js`
- **Test name**: `REGTEST-07: pre-commit hook uses pnpm without npx fallback` or the next available REGTEST number
- **Oracle confirmed**: fails before FIX-02 / passes after FIX-02
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before FIX-02 is applied, if possible: `node --test test/quality-gate-workflows.test.js`
   - Expected: the new pre-commit hook test fails.
2. Run after FIX-02 is applied: `node --test test/quality-gate-workflows.test.js`
   - Expected: all tests in the file pass.
3. Run after FIX-02 is applied: `node -e "const fs=require('fs'); const s=fs.readFileSync('.husky/pre-commit','utf8').trim(); if (s.includes('npx') || /\\bnpm\\s/.test(s)) throw new Error('hook still uses npm/npx'); if (!s.includes('pnpm lint-staged')) throw new Error('hook must run pnpm lint-staged');"`
   - Expected: exits 0.

---

## 5. Scope & References

### Allowed Files

- `test/quality-gate-workflows.test.js` — add hook regression coverage here.

### Forbidden Files

- `.husky/pre-commit` — source fix is owned by FIX-02.
- `.lintstagedrc.json`, `package.json`, `pnpm-lock.yaml` — not owned by this regression worker.
- All TypeScript source files — regression test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-02-precommit-pnpm.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md`
