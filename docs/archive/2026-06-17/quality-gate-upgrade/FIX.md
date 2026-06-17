# Quality Gate Upgrade fix plan

- `docs/plans/2026-06-17/quality-gate-upgrade` — Context
- `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md` — Verification checklist
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — Review report

## ROLE

You are the fix coordinator for the current Quality Gate Upgrade review. Your mission is to close all current findings in `REPORT.md`: two P1 requirement defects in the pnpm/lint/test gates and one P2 pre-commit hook reliability risk. You coordinate source fix workers, regression test workers, and verification gates. You do not directly implement fixes unless a worker prompt explicitly assigns that work to the coordinator.

## RULES

- Treat `REPORT.md` as the current issue inventory. Prior optimizer/npm findings are history only; do not revive them unless current verification reintroduces them.
- Every current issue must be handled:
  - P1-001 and P1-002 are handled by `fix/FIX-01-root-workspace-links.md` and `fix/REGTEST-01-root-workspace-links.md`.
  - P2-001 is handled by `fix/FIX-02-precommit-pnpm.md` and `fix/REGTEST-02-precommit-pnpm.md`.
- Fix workers run before their paired regression test workers.
- Regression test workers may modify tests only. If a regression worker needs source changes, stop and report the mismatch.
- Respect file-overlap constraints:
  - `FIX-01` modifies `package.json` and `pnpm-lock.yaml`.
  - `FIX-02` modifies `.husky/pre-commit`.
  - `REGTEST-01` and `REGTEST-02` both modify `test/quality-gate-workflows.test.js`, so they must run sequentially.
- Do not weaken lint rules, skip tests, add broad pnpm hoisting, or add `eslint-disable` comments to satisfy the gates.
- Do not use `git reset`, `git checkout --`, or destructive cleanup. Preserve user changes.
- Use pinned pnpm through `npx --yes pnpm@11.6.0 ...` if `pnpm` is not available directly.
- If a verification command cannot run because the local environment lacks network access or a required tool, record the exact command and error; do not mark the gate as passed.

## WORKING STEPS

### 1. PREPARATION

Read these files first:

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — current issue inventory, severity, evidence locations.
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — workspace migration, strict dependency resolution, build/test behavior.
- `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md` — ESLint, Prettier, pre-commit, and CI quality gate requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md` — zero lint errors, zero format diffs, full build/test requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md` — intended pnpm workspace architecture and no-hoisting invariant.
- `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md` — final verification gates.
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — workspace importer state.
- `bin/apollo-toolkit.ts` — root TypeScript source that imports `@laitszkin/cli`.
- `scripts/test.sh` — root test runner that executes `node --test test/**/*.test.js`.
- `.husky/pre-commit`, `.lintstagedrc.json` — pre-commit hook behavior.
- `test/quality-gate-workflows.test.js` — target for regression tests.
- Worker prompts:
  - `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-01-root-workspace-links.md`
  - `docs/plans/2026-06-17/quality-gate-upgrade/fix/FIX-02-precommit-pnpm.md`
  - `docs/plans/2026-06-17/quality-gate-upgrade/fix/REGTEST-01-root-workspace-links.md`
  - `docs/plans/2026-06-17/quality-gate-upgrade/fix/REGTEST-02-precommit-pnpm.md`

### 2. COORDINATION

Batch 1: apply independent source/config fixes.

- Run `fix/FIX-01-root-workspace-links.md`.
- Run `fix/FIX-02-precommit-pnpm.md`.
- These can run in parallel because their file sets do not overlap.
- Batch gate:
  - `npx --yes pnpm@11.6.0 install --frozen-lockfile`
  - `node -e "const fs=require('fs'); for (const p of ['cli','tui','tool-registry','tool-utils','tool-create-specs','tool-create-review-report','tool-read-github-issue','tool-validate-openai-agent-config','tool-validate-skill-frontmatter']) { if (!fs.existsSync('node_modules/@laitszkin/'+p)) throw new Error('missing workspace link '+p); }"`
  - `node -e "const fs=require('fs'); const s=fs.readFileSync('.husky/pre-commit','utf8').trim(); if (s !== 'lint-staged') throw new Error('hook must run lint-staged directly'); if (s.includes('npx') || /\\bnpm\\s/.test(s)) throw new Error('hook still uses npm/npx');"`

Batch 2: add regression tests sequentially.

- Run `fix/REGTEST-01-root-workspace-links.md`.
- Then run `fix/REGTEST-02-precommit-pnpm.md`.
- These must run sequentially because both modify `test/quality-gate-workflows.test.js`.
- Batch gate:
  - `node --test test/quality-gate-workflows.test.js`

Batch 3: final integration check.

- Run after both fix and regression batches are complete:
  - `npx --yes pnpm@11.6.0 install --frozen-lockfile`
  - `npx --yes pnpm@11.6.0 run build`
  - `node dist/bin/apollo-toolkit.js --version`
  - `npx --yes pnpm@11.6.0 lint --cache`
  - `npx --yes pnpm@11.6.0 format:check`
  - `npx --yes pnpm@11.6.0 test`
  - `COVERAGE=true npx --yes pnpm@11.6.0 test`

### 3. FINAL VERIFICATION

Confirm every report issue is closed:

- P1-001: `npx --yes pnpm@11.6.0 lint --cache` exits 0; `bin/apollo-toolkit.ts` no longer produces unresolved-type unsafe call/member-access lint errors.
- P1-002: `npx --yes pnpm@11.6.0 test` exits 0; root tests no longer fail with `ERR_MODULE_NOT_FOUND` for `@laitszkin/*` packages.
- P2-001: `.husky/pre-commit` runs `lint-staged` directly and contains no `npx` or npm invocation.

Run checklist-derived gates:

- `npx --yes pnpm@11.6.0 install --frozen-lockfile`
- `npx --yes pnpm@11.6.0 run build`
- `node dist/bin/apollo-toolkit.js --version`
- `npx --yes pnpm@11.6.0 lint --cache`
- `npx --yes pnpm@11.6.0 format:check`
- `npx --yes pnpm@11.6.0 test`
- `COVERAGE=true npx --yes pnpm@11.6.0 test`
- `node --test test/quality-gate-workflows.test.js`
- `node -e "const fs=require('fs'); const s=fs.readFileSync('.husky/pre-commit','utf8').trim(); if (s !== 'lint-staged') throw new Error('hook must run lint-staged directly'); if (s.includes('npx') || /\\bnpm\\s/.test(s)) throw new Error('hook still uses npm/npx');"`
- `node -e "const pkg=require('./package.json'); for (const p of ['@laitszkin/cli','@laitszkin/tui','@laitszkin/tool-registry','@laitszkin/tool-utils','@laitszkin/tool-architecture','@laitszkin/tool-codegraph','@laitszkin/tool-create-review-report','@laitszkin/tool-create-specs','@laitszkin/tool-find-github-issues','@laitszkin/tool-open-github-issue','@laitszkin/tool-read-github-issue','@laitszkin/tool-review-threads','@laitszkin/tool-validate-openai-agent-config','@laitszkin/tool-validate-skill-frontmatter']) { if (pkg.devDependencies?.[p] !== 'workspace:*') throw new Error('missing '+p); }"`

If all gates pass, report files changed, tests run, and any residual CI-only verification that still requires GitHub Actions.

## Fix History

### Round 1 — 2026-06-17

- **Verdict addressed**: Needs Work
- **Issues planned**: P1-001 for root `package.json` scripts invoking npm.
- **Summary**: The prior fix plan targeted `prepublishOnly` and `test:coverage` in `package.json`.

### Round 2 — 2026-06-17

- **Verdict addressed**: Needs Work
- **Issues planned**: P1-001 for `scripts/optimize.mjs` invoking `npm test`.
- **Summary**: The prior fix plan targeted the optimizer validation command. The current review report supersedes that with root workspace link failures and a pre-commit hook pnpm invocation risk.
