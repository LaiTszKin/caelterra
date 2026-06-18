# Regression Test Worker Prompt: REGTEST-01-no-npm-lockfile

- **Related fix**: FIX-01 — remove stale npm lockfile

---

## 1. Mission & Rules

### Mission

Add a regression test that fails whenever the repository reintroduces a tracked or present `package-lock.json`.

### Context

`FIX-01` removes `package-lock.json` to satisfy `pnpm-migration Req 1`. The regression test must protect the pnpm migration from drifting back to dual lockfiles.

### Rules

- Only create or modify test files — never modify source/config files.
- The test must fail on the unfixed code where `package-lock.json` exists and is tracked, and pass after `FIX-01`.
- Follow the existing `test/quality-gate-workflows.test.js` style: `node:test`, `node:assert/strict`, plain filesystem/process checks.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- Fix-related files: `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- Existing test file: `test/quality-gate-workflows.test.js` — append a new `node:test` case using the existing `projectRoot` helper.
- Related fix prompt: `docs/archive/2026-06-17/quality-gate-upgrade/fix/FIX-01-remove-npm-lockfile.md`.

### Test Design

- **Test ID**: REGTEST-08
- **Type**: Integration / repository metadata
- **Location**: `test/quality-gate-workflows.test.js`
- **Scenario**: GIVEN the repository has migrated to pnpm WHEN quality-gate workflow tests inspect lockfiles THEN `pnpm-lock.yaml` exists and `package-lock.json` is neither present nor tracked.
- **Oracle**: On the unfixed code, the test fails because `package-lock.json` exists and `git ls-files package-lock.json` reports it. After `FIX-01`, the test passes.

---

## 3. Tasks

1. Open `test/quality-gate-workflows.test.js`.
2. Add `import { spawnSync } from 'node:child_process';` near the existing imports.
3. Append a new test named exactly `REGTEST-08: pnpm migration has no npm lockfile`.
4. In the test:
   - Assert `fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))` is true.
   - Assert `fs.existsSync(path.join(projectRoot, 'package-lock.json'))` is false.
   - Run `spawnSync('git', ['ls-files', 'package-lock.json'], { cwd: projectRoot, encoding: 'utf-8' })`.
   - Assert the command exits 0.
   - Assert `stdout.trim()` is an empty string.
5. Do not modify any source or config file.

### Output

When done, report back to the coordinator:

- **Test file**: `test/quality-gate-workflows.test.js`
- **Test name**: `REGTEST-08: pnpm migration has no npm lockfile`
- **Oracle confirmed**: test fails before `FIX-01`, passes after `FIX-01`
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before `FIX-01`: `node --test test/quality-gate-workflows.test.js --test-name-pattern "REGTEST-08"`
   - Expected: test fails because `package-lock.json` exists and is tracked.
2. Run after `FIX-01`: `node --test test/quality-gate-workflows.test.js --test-name-pattern "REGTEST-08"`
   - Expected: test passes.
3. Run: `node --test test/quality-gate-workflows.test.js`
   - Expected: all quality-gate workflow tests pass.

---

## 5. Scope & References

### Allowed Files

- `test/quality-gate-workflows.test.js` — add the regression test here.

### Forbidden Files

- All source and config files, including `package.json`, `pnpm-lock.yaml`, `package-lock.json`, and `pnpm-workspace.yaml`.

### Related Documents

- `docs/archive/2026-06-17/quality-gate-upgrade/fix/FIX-01-remove-npm-lockfile.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/REPORT.md`
