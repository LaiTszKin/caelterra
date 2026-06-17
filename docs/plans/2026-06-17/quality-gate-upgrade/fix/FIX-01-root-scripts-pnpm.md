# Fix Worker Prompt: FIX-01-root-scripts-pnpm

- **Related issue**: P1-001

---

## 1. Mission & Rules

### Mission

Update root package scripts so the migrated pnpm project no longer invokes npm for publish-time build or coverage test aliases.

### Context

The review flagged a spec implementation deviation for pnpm-migration Req 3 and codebase-refactoring Req 3. Root `package.json` has `packageManager: pnpm@11.6.0`, but two scripts still run npm commands: `prepublishOnly` and `test:coverage`.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed.
- Preserve script intent: publish still builds first, and coverage still runs the same test suite with `COVERAGE=true`.
- Do not change dependency versions, package metadata, workflow files, lockfiles, or source code.
- Do not weaken or remove existing scripts.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- `package.json` — root scripts requiring pnpm alignment.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P1-001 details.
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — package script migration requirement.
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md` — build/test verification requirement.

### Root Cause

The package manager migration added pnpm workspace configuration and pnpm CI commands, but root lifecycle aliases still delegate through npm. That leaves local publish/coverage flows exercising npm instead of the pinned pnpm package manager.

---

## 3. Tasks

### `package.json` — migrate remaining npm script invocations

1. Open `package.json`.
2. Locate the root `scripts` object around lines 22-35.
3. Change `prepublishOnly`:
   - **Before**: `"prepublishOnly": "npm run build"`
   - **After**: `"prepublishOnly": "pnpm run build"`
4. Change `test:coverage`:
   - **Before**: `"test:coverage": "COVERAGE=true npm test"`
   - **After**: `"test:coverage": "COVERAGE=true pnpm test"`
5. Leave `build`, `postbuild`, `test`, `lint`, `format`, and all other scripts unchanged.

### Output

When done, report back to the coordinator:

- **Files modified**: `package.json`
- **Change summary**: remaining root npm script invocations now use pnpm
- **Test results**: command outcomes from Section 4
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `node -e "const pkg=require('./package.json'); if (pkg.scripts.prepublishOnly !== 'pnpm run build') throw new Error('prepublishOnly not migrated'); if (pkg.scripts['test:coverage'] !== 'COVERAGE=true pnpm test') throw new Error('test:coverage not migrated')"`
   - Expected: exits 0.
2. Run: `npx --yes pnpm@11.6.0 run build`
   - Expected: `tsc --build` and `postbuild` complete successfully.
3. Run: `npx --yes pnpm@11.6.0 run test:coverage`
   - Expected: coverage test suite runs through pnpm. If the full suite is too slow for the worker budget, report that this command remains for coordinator final verification.

---

## 5. Scope & References

### Allowed Files

- `package.json` — fix the two root scripts named in P1-001.

### Forbidden Files

- `pnpm-lock.yaml` — no dependency changes are required.
- `.github/workflows/**` — current report does not identify workflow defects.
- `test/**` — regression test is owned by `REGTEST-01-root-scripts-pnpm.md`.
- `packages/**`, `bin/**`, `scripts/**` — no source changes are required.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md`
