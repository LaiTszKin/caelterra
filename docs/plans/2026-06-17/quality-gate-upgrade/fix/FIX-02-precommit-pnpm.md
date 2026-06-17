# Fix Worker Prompt: FIX-02-precommit-pnpm

- **Related issue**: P2-001

---

## 1. Mission & Rules

### Mission

Make the pre-commit hook use the repository package-manager command path instead of fetching pnpm through npm/npx.

### Context

The review flagged an architecture risk for `quality-gate-setup Req 4`. `.husky/pre-commit` currently contains `npx --yes pnpm@11.6.0 lint-staged`, which depends on npm/npx network resolution during commit. The quality gate design expects the migrated pnpm workspace to run local staged-file checks through the project package-manager flow.

### Rules

- Follow the Scope in Section 5. Only modify `.husky/pre-commit`.
- Preserve the behavior that commits run `lint-staged`.
- Do not change `.lintstagedrc.json`, lint-staged patterns, package versions, CI workflows, or lockfiles.
- Do not add a network-fetching fallback to npm or npx.
- Workers are leaf nodes. Do not spawn sub-workers.

---

## 2. Context

### Input Files

- `.husky/pre-commit` — current hook command.
- `.lintstagedrc.json` — staged-file command mapping that the hook must continue to invoke.
- `package.json` — root `packageManager: pnpm@11.6.0` and `lint-staged` script.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P2-001 details.
- `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md` — pre-commit hook requirement.

### Root Cause

The hook was made robust to environments without `pnpm` on PATH by shelling through `npx`, but that reintroduces npm into the local quality gate and can fetch package-manager code during commit. The hook should rely on the project package-manager invocation.

---

## 3. Tasks

### `.husky/pre-commit` — remove npm/npx package-manager fetch

1. Open `.husky/pre-commit`.
2. Replace the current command:

   ```sh
   npx --yes pnpm@11.6.0 lint-staged
   ```

   with:

   ```sh
   pnpm lint-staged
   ```

3. Do not add a shebang unless the existing project convention requires it. Husky v9 hook files can be command-only.
4. Leave `.lintstagedrc.json` unchanged.

### Output

When done, report back to the coordinator:

- **Files modified**: `.husky/pre-commit`
- **Change summary**: pre-commit uses local pnpm invocation for lint-staged
- **Test results**: command outcomes from Section 4
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `node -e "const fs=require('fs'); const s=fs.readFileSync('.husky/pre-commit','utf8').trim(); if (s.includes('npx') || s.includes('npm ')) throw new Error('hook still shells through npm/npx'); if (!/^pnpm\\s+lint-staged\\s*$/.test(s)) throw new Error('hook must run pnpm lint-staged');"`
   - Expected: exits 0.
2. Run: `npx --yes pnpm@11.6.0 exec lint-staged --help`
   - Expected: exits 0 and prints lint-staged help.
3. If `pnpm` is available on PATH, run: `pnpm lint-staged --help`
   - Expected: exits 0 and prints lint-staged help. If `pnpm` is unavailable locally, report that the hook requires the standard pnpm/corepack developer setup.

---

## 5. Scope & References

### Allowed Files

- `.husky/pre-commit` — hook command named in P2-001.

### Forbidden Files

- `.lintstagedrc.json` — no pattern changes required.
- `package.json`, `pnpm-lock.yaml` — no dependency or script changes required for this issue.
- `.github/workflows/**` — CI already invokes pnpm directly.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md`
