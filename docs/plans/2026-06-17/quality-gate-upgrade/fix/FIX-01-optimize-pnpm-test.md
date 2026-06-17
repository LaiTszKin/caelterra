# Fix Worker Prompt: FIX-01-optimize-pnpm-test

- **Related issue**: P1-001

---

## 1. Mission & Rules

### Mission

Update the optimizer's post-change validation command so the migrated pnpm project no longer shells out through npm.

### Context

The review flagged a spec implementation deviation for `pnpm-migration Req 3` and `codebase-refactoring Req 3`. `scripts/optimize.mjs` still runs `execSync('npm test', ...)` when validating real optimization changes, even though the repository now pins `packageManager: pnpm@11.6.0` and all migrated build/test flows should use pnpm.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed.
- Preserve the validation behavior: after real optimization changes, the script must still run the project test suite with the same `cwd`, `stdio`, and `timeout` options.
- Do not change output paths, optimization logic, CLI behavior, package metadata, workflows, lockfiles, or tests.
- Do not add new dependencies.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- `scripts/optimize.mjs` — affected validation command near line 1483.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P1-001 details.
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — pnpm build/test pipeline requirement.
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md` — post-refactor build/test verification requirement.

### Root Cause

The package manager migration updated root scripts and CI paths, but a source-level validation path inside `scripts/optimize.mjs` still delegates to `npm test`. When `anyRealChange` is true, this path exercises npm rather than the pinned pnpm workspace flow.

---

## 3. Tasks

### `scripts/optimize.mjs` — migrate the validation command

1. Open `scripts/optimize.mjs`.
2. Locate the `if (anyRealChange)` validation block around lines 1479-1488.
3. Change the test command passed to `execSync`:
   - **Before**:

     ```js
     execSync('npm test', {
       cwd: sourceRoot,
       stdio: 'inherit',
       timeout: 120000,
     });
     ```

   - **After**:

     ```js
     execSync('pnpm test', {
       cwd: sourceRoot,
       stdio: 'inherit',
       timeout: 120000,
     });
     ```

4. Leave the surrounding log messages, `cwd`, `stdio`, `timeout`, CLI help validation, and error handling unchanged.

### Output

When done, report back to the coordinator:

- **Files modified**: `scripts/optimize.mjs`
- **Change summary**: optimizer validation now runs tests through pnpm
- **Test results**: command outcomes from Section 4
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `node -e "const fs=require('fs'); const s=fs.readFileSync('scripts/optimize.mjs','utf8'); if (s.includes(\"execSync('npm test'\")) throw new Error('optimizer still invokes npm test'); if (!s.includes(\"execSync('pnpm test'\")) throw new Error('optimizer does not invoke pnpm test')"`
   - Expected: exits 0.
2. Run: `node --check scripts/optimize.mjs`
   - Expected: exits 0 with no syntax errors.
3. Run: `npx --yes pnpm@11.6.0 run build`
   - Expected: `tsc --build` and `postbuild` complete successfully. If local pnpm/network availability blocks this, report the exact error for coordinator final verification.

---

## 5. Scope & References

### Allowed Files

- `scripts/optimize.mjs` — fix the command named in P1-001.

### Forbidden Files

- `package.json` — current report does not identify a root script defect.
- `pnpm-lock.yaml` — no dependency changes are required.
- `.github/workflows/**` — current report does not identify workflow defects.
- `test/**` — regression test is owned by `REGTEST-01-optimize-pnpm-test.md`.
- `packages/**`, `bin/**` — no runtime package source changes are required.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md`
