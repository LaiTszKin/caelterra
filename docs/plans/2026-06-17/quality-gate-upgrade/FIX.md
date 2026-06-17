# Quality Gate Upgrade fix plan

- `docs/plans/2026-06-17/quality-gate-upgrade` — Context
- `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md` — Verification checklist
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — Review report

## ROLE

You are the fix coordinator for the current Quality Gate Upgrade review. Your mission is to close the single current P1 finding in `REPORT.md`: `scripts/optimize.mjs` still shells out through `npm test` after the repository migrated to pnpm. You coordinate one source fix worker and one regression test worker, verify their results, and then run the final pnpm quality gates where the local environment permits. Do not revive stale findings from previous review rounds unless the current report reintroduces them.

## RULES

- Read `REPORT.md`, the three SPEC files, `DESIGN.md`, `CHECKLIST.md`, `scripts/optimize.mjs`, `test/quality-gate-workflows.test.js`, and the worker prompts under `fix/` before starting.
- Use only the current worker prompts named in this plan. The current report has one finding, so the current fix set has one fix worker and one regression test worker.
- Fix workers run before their paired regression test workers.
- The regression test worker may modify tests only. If it needs source changes, stop and report the mismatch.
- Preserve unrelated script behavior. Only change the npm invocation that is part of the reported pnpm migration defect.
- Do not change dependency versions, package metadata, workflows, lockfiles, or generated artifacts for this fix.
- Do not use `git reset`, `git checkout --`, or destructive cleanup. Preserve user changes.
- Use pinned pnpm through `npx --yes pnpm@11.6.0 ...` if `pnpm` is not available directly.
- If a verification command cannot run because the local environment lacks pnpm/Corepack or network access, record the exact command and error; do not mark the gate as passed.

## WORKING STEPS

### 1. PREPARATION

Read these files first:

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — current issue inventory and severity.
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — pnpm migration and build/test pipeline requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md` — post-refactor build/test requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md` — quality gate context.
- `docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md` — intended pnpm architecture and invariant that npm paths should not drive migrated flows.
- `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md` — final verification gates.
- `scripts/optimize.mjs` — affected validation command.
- `test/quality-gate-workflows.test.js` — config-level regression test location.
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-optimize-pnpm-test.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/REGTEST-01-optimize-pnpm-test.md`

### 2. COORDINATION

Batch 1: apply the source fix.

- Run `fix/FIX-01-optimize-pnpm-test.md`.
- File overlap: only `scripts/optimize.mjs`.
- Batch gate:
  - `node -e "const fs=require('fs'); const s=fs.readFileSync('scripts/optimize.mjs','utf8'); if (s.includes(\"execSync('npm test'\")) process.exit(1); if (!s.includes(\"execSync('pnpm test'\")) process.exit(1)"`
  - `node --check scripts/optimize.mjs`

Batch 2: add the regression test after the fix is complete.

- Run `fix/REGTEST-01-optimize-pnpm-test.md`.
- File overlap: only `test/quality-gate-workflows.test.js`; no overlap with Batch 1.
- Batch gate:
  - `node --test test/quality-gate-workflows.test.js`

Batch 3: final integration check.

- Run after the fix and regression test are in place:
  - `npx --yes pnpm@11.6.0 install --frozen-lockfile`
  - `npx --yes pnpm@11.6.0 run build`
  - `npx --yes pnpm@11.6.0 lint`
  - `npx --yes pnpm@11.6.0 format:check`
  - `npx --yes pnpm@11.6.0 test`

### 3. FINAL VERIFICATION

Confirm P1-001 is closed:

- `scripts/optimize.mjs` no longer contains `execSync('npm test'`.
- `scripts/optimize.mjs` uses `execSync('pnpm test'` for post-optimization validation.
- `test/quality-gate-workflows.test.js` contains a regression assertion that the optimizer validation path uses pnpm and does not invoke npm.

Run the checklist-derived gates:

- `node --check scripts/optimize.mjs`
- `node --test test/quality-gate-workflows.test.js`
- `npx --yes pnpm@11.6.0 install --frozen-lockfile`
- `npx --yes pnpm@11.6.0 run build`
- `node dist/bin/apollo-toolkit.js --version`
- `npx --yes pnpm@11.6.0 lint`
- `npx --yes pnpm@11.6.0 format:check`
- `npx --yes pnpm@11.6.0 test`
- `COVERAGE=true npx --yes pnpm@11.6.0 test`

If all gates pass, report the files changed, tests run, and any residual CI-only verification that still requires GitHub Actions.

## Fix History

### Round 1 — 2026-06-17

- **Verdict addressed**: Needs Work
- **Issues planned**: P1-001 for root `package.json` scripts invoking npm.
- **Summary**: The prior fix plan targeted `prepublishOnly` and `test:coverage` in `package.json`. The current review report supersedes that with a new P1-001 in `scripts/optimize.mjs`.
