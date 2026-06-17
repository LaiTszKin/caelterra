# Quality Gate Upgrade fix plan

- `docs/plans/2026-06-17/quality-gate-upgrade` — Context
- `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md` — Verification checklist
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — Review report

## ROLE

You are the fix coordinator for the current Quality Gate Upgrade review. Your mission is to resolve the single current finding in `REPORT.md`: P1-001, where root `package.json` scripts still invoke npm after the pnpm migration. You coordinate the fix worker and its regression test worker, verify their outputs, and ensure the final pnpm quality gates are satisfied. Do not revive stale findings from previous review rounds unless the current report reintroduces them.

## RULES

- Read `REPORT.md`, the three SPEC files, `DESIGN.md`, `CHECKLIST.md`, `package.json`, and the worker prompts under `fix/` before starting.
- Use only the worker prompt files named in this plan. The current report has one finding, so the current fix set has one fix worker and one regression test worker.
- Fix workers run before their paired regression test workers.
- The regression test worker may modify tests only. If it needs source changes, stop and report the mismatch.
- Preserve unrelated package metadata and existing scripts. Only change npm invocations that are part of the reported pnpm migration defect.
- Do not use `git reset`, `git checkout --`, or destructive cleanup. Preserve user changes.
- Use pinned pnpm through `npx --yes pnpm@11.6.0 ...` if `pnpm` is not available directly.
- If a verification command cannot run because the local environment lacks pnpm/Corepack or network access, record the exact command and error; do not mark the gate as passed.

## WORKING STEPS

### 1. PREPARATION

Read these files first:

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — current issue inventory and severity.
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — root script and pnpm migration requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md` — post-refactor build/test requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md` — quality gate context.
- `docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md` — intended pnpm architecture and invariant that npm paths should not drive migrated flows.
- `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md` — final verification gates.
- `package.json` — affected script definitions.
- `test/quality-gate-workflows.test.js` — config-level regression test location.
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-root-scripts-pnpm.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/fix/REGTEST-01-root-scripts-pnpm.md`

### 2. COORDINATION

Batch 1: apply the source/config fix.

- Run `fix/FIX-01-root-scripts-pnpm.md`.
- File overlap: only `package.json`.
- Batch gate:
  - `node -e "const pkg=require('./package.json'); if (/npm /.test(pkg.scripts.prepublishOnly) || /npm /.test(pkg.scripts['test:coverage'])) process.exit(1)"`
  - `npx --yes pnpm@11.6.0 run build`

Batch 2: add the regression test after the fix is complete.

- Run `fix/REGTEST-01-root-scripts-pnpm.md`.
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

- `package.json` has no root script values containing `npm run build` or `npm test`.
- `prepublishOnly` executes the pnpm build path.
- `test:coverage` executes the pnpm test path with `COVERAGE=true`.
- `test/quality-gate-workflows.test.js` contains a regression assertion that root scripts do not invoke npm.

Run the checklist-derived gates:

- `npx --yes pnpm@11.6.0 install --frozen-lockfile`
- `npx --yes pnpm@11.6.0 run build`
- `node dist/bin/apollo-toolkit.js --version`
- `npx --yes pnpm@11.6.0 lint`
- `npx --yes pnpm@11.6.0 format:check`
- `npx --yes pnpm@11.6.0 test`
- `COVERAGE=true npx --yes pnpm@11.6.0 test`

If all gates pass, report the files changed, tests run, and any residual CI-only verification that still requires GitHub Actions.
