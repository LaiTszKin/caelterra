# Checklist: Quality Gate Upgrade

- **Date**: 2026-06-17
- **Feature**: quality-gate-upgrade (unified batch)
- **Source SPEC**:
  - `pnpm-migration/SPEC.md`
  - `quality-gate-setup/SPEC.md`
  - `codebase-refactoring/SPEC.md`

> **Purpose:** Verification strategy — defines how to confirm that the migration and quality gate setup satisfy the SPEC.md business requirements.

---

## Behavior-to-Test Checklist

### pnpm Migration

| ID    | Observable Behavior                                          | SPEC Requirement     | Corresponding Test                                        | Result          |
| ----- | ------------------------------------------------------------ | -------------------- | --------------------------------------------------------- | --------------- | ----- |
| CL-01 | `pnpm install` resolves all packages without errors          | pnpm-migration Req 1 | Manual: `pnpm install && pnpm build`                      | `[ ]`           |
| CL-02 | `pnpm install --frozen-lockfile` succeeds in CI              | pnpm-migration Req 4 | CI run on push                                            | `[ ]`           |
| CL-03 | `pnpm build` produces valid dist output                      | pnpm-migration Req 3 | `pnpm build && node dist/bin/apollo-toolkit.js --version` | `[ ]`           |
| CL-04 | `pnpm test` passes all test groups (G1, G2, G3)              | pnpm-migration Req 3 | `pnpm test`                                               | `[ ]`           |
| CL-05 | CI test workflow passes on ubuntu-latest and windows-latest  | pnpm-migration Req 4 | CI matrix run                                             | `[ ]`           |
| CL-06 | `pnpm publish` (dry-run) shows no `workspace:*` in output    | pnpm-migration Req 2 | `pnpm publish --dry-run --no-git-checks 2>&1              | grep workspace` | `[ ]` |
| CL-07 | Lockfile is `pnpm-lock.yaml`, no `package-lock.json` remains | pnpm-migration Req 1 | `ls pnpm-lock.yaml && test ! -f package-lock.json`        | `[ ]`           |

### Quality Gate Setup

| ID    | Observable Behavior                                                             | SPEC Requirement         | Corresponding Test                                                                                 | Result |
| ----- | ------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- | ------ |
| CL-08 | `pnpm lint` runs ESLint and exits 0                                             | quality-gate-setup Req 2 | `pnpm lint`                                                                                        | `[ ]`  |
| CL-09 | ESLint uses type-aware rules (verifiable by introducing a deliberate violation) | quality-gate-setup Req 2 | `echo "const x: any = 1" > /tmp/test.ts && eslint /tmp/test.ts` should flag `no-unsafe-assignment` | `[ ]`  |
| CL-10 | `pnpm format:check` reports zero diffs                                          | quality-gate-setup Req 3 | `pnpm format:check`                                                                                | `[ ]`  |
| CL-11 | `pnpm format` rewrites files without error                                      | quality-gate-setup Req 3 | `pnpm format` then `pnpm format:check`                                                             | `[ ]`  |
| CL-12 | Pre-commit hook triggers on staged `.ts` files                                  | quality-gate-setup Req 4 | `echo "const  x=1" > test.ts && git add test.ts && git commit -m "test"` should fail               | `[ ]`  |
| CL-13 | `git commit --no-verify` bypasses hooks                                         | quality-gate-setup Req 4 | `git commit --no-verify -m "bypass"` should succeed                                                | `[ ]`  |
| CL-14 | CI fails when lint violation exists in changed files                            | quality-gate-setup Req 5 | Push branch with deliberate lint violation; CI should fail on lint step                            | `[ ]`  |
| CL-15 | CI fails when formatting is inconsistent                                        | quality-gate-setup Req 5 | Push branch with bad formatting; CI should fail on format-check step                               | `[ ]`  |
| CL-16 | `tsc --build` passes with new strict flags                                      | quality-gate-setup Req 1 | `pnpm build`                                                                                       | `[ ]`  |

### Codebase Refactoring

| ID    | Observable Behavior                                                             | SPEC Requirement           | Corresponding Test                                                                                      | Result |
| ----- | ------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| CL-17 | `eslint --fix .` and `prettier --write .` complete without errors               | codebase-refactoring Req 1 | Run both commands                                                                                       | `[ ]`  |
| CL-18 | `pnpm lint` reports zero errors and zero warnings                               | codebase-refactoring Req 2 | `pnpm lint`                                                                                             | `[ ]`  |
| CL-19 | `pnpm format:check` reports "All matched files use Prettier code style!"        | codebase-refactoring Req 2 | `pnpm format:check`                                                                                     | `[ ]`  |
| CL-20 | `pnpm build` and `pnpm test` both pass after all refactoring                    | codebase-refactoring Req 3 | `pnpm build && pnpm test`                                                                               | `[ ]`  |
| CL-21 | Coverage thresholds still met per `scripts/test.sh`                             | codebase-refactoring Req 3 | `COVERAGE=true pnpm test`                                                                               | `[ ]`  |
| CL-22 | No `any` type introductions or `eslint-disable` comments added (audit via grep) | codebase-refactoring Req 2 | `grep -r "eslint-disable" --include="*.ts" --include="*.mjs" packages/ bin/ test/` — only expected ones | `[ ]`  |

---

## Hardening Checklist

- [x] **Regression tests for bug-prone / high-risk behavior**: N/A — no runtime behavior changes; strict compilation gates provide equivalent safety
- [ ] **Unit drift checks for non-trivial logic**: Autofix and manual refactors should be verified per-file; use `pnpm test` for full regression
- [x] **Property-based coverage for business logic**: N/A — refactoring does not change business logic
- [x] **External services mocked / faked**: N/A — no new external services introduced
- [ ] **Adversarial cases for abuse paths**: Verify that `--no-verify` is not silently used as a workflow (enforced by CI gates)
- [x] **Authorization, idempotency, and concurrency risks**: N/A — no runtime changes
- [ ] **Assertions verify outcomes and side-effects**: All verification is at the build/lint/test level; config changes verified by running the tools
- [x] **Fixtures are reproducible**: N/A — lint/format behavior is deterministic

---

## E2E / Integration Decisions

| Flow / Risk                                      | Test Level                      | Rationale                                                        |
| ------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------- |
| **pnpm install from scratch**                    | Manual (local) + CI (automated) | Ensure clean checkout and install works with new lockfile format |
| **pre-commit hook behavior**                     | Manual (local)                  | Test once on developer machine; CI gates provide safety net      |
| **Codebase-wide lint/format consistency**        | CI (automated)                  | Enforced in CI via `pnpm lint` and `pnpm format:check` steps     |
| **TypeScript compilation with new strict flags** | CI (automated)                  | `pnpm build` in CI validates compilation                         |
| **Full test suite after refactoring**            | CI (automated)                  | `pnpm test` in CI validates no regression                        |
| **publish workflow**                             | CI (automated)                  | Verify `pnpm publish` via dry-run in publish workflow            |

---

## References

- **Designed code file paths**:
  - `package.json` — root workspace/scripts/dependencies
  - `pnpm-workspace.yaml`, `.prettierrc`, `eslint.config.mjs`, `.lintstagedrc.json`, `.husky/pre-commit`
  - `.github/workflows/test.yml`, `publish-npm.yml`, `eval.yml`, `skill-validation.yml`
  - `tsconfig.json` + per-package tsconfig files
  - All `*.ts` source files across `packages/`, `bin/`, `scripts/`, `test/`

- **Project context files**:
  - `CLAUDE.md` — update to reflect pnpm commands and quality gates
  - `docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md`

- **Related documents**:
  - All three SPEC.md files
  - `scripts/test.sh` — test runner, will need pnpm compatibility check
