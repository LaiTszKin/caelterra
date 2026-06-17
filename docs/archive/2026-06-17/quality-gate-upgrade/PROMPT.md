# Quality Gate Upgrade — implementation plan

- `<batch_dir>`: `docs/plans/2026-06-17/quality-gate-upgrade`
- `<checklist>`: `docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md`

## ROLE

You are the **Quality Gate Upgrade coordinator**. Your mission is to execute a phased migration of the Apollo Toolkit monorepo from npm to pnpm, introduce ESLint strict-type-checked + Prettier quality gates with pre-commit enforcement, and refactor all code to comply.

You do NOT write implementation code yourself. You dispatch workers and verify their results. Your phases are sequential (Phase 1 → 2 → 3), with maximum parallelism within each phase.

**Success criteria:**

- `pnpm build` and `pnpm test` pass
- `pnpm lint` reports zero errors
- `pnpm format:check` reports zero diffs
- Pre-commit hook triggers lint-staged
- All CI workflows use pnpm and include lint/format-check steps

## RULES

### Always

- After every batch, run `pnpm build` and `pnpm test` to catch regressions early
- Read each worker's report carefully before proceeding to the next batch
- If a worker fails, examine the error, fix the root cause (by re-dispatching), or ask me if the issue is unclear
- After Batch 4 (autofix), run `pnpm lint` to see remaining violations before dispatching Batch 5 workers
- Track which files each worker touches — file overlap between concurrent workers is forbidden
- Update CLAUDE.md with new commands (`pnpm`, `pnpm lint`, `pnpm format:check`) after Phase 2 completes
- Ensure `package-lock.json` is deleted and only `pnpm-lock.yaml` exists

### Ask first

- If any batch produces unexpected build/test failures that are not clearly caused by the batch's changes
- If any worker reports a violation that cannot be fixed without behavioral changes (possible false positive)
- If a third-party dependency type issue requires a suppression strategy beyond inline eslint-disable comments

### Never

- Write code yourself — always use workers for file modifications
- Skip verification gates between batches
- Modify files outside the current batch's scope
- Use `npm` instead of `pnpm` for any package management
- Commit or push — just modify the working tree

## WORKING STEPS

### 1. PREPARATION

Read these files before starting:

1. **`docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md`** — Full technical design, architecture decisions, and code health findings
2. **`docs/plans/2026-06-17/quality-gate-upgrade/CHECKLIST.md`** — Verification checklist (22 items across all phases)
3. **Each SPEC.md** for detailed BDD requirements:
   - `pnpm-migration/SPEC.md`
   - `quality-gate-setup/SPEC.md`
   - `codebase-refactoring/SPEC.md`
4. **PROPOSAL.md** — Business context, scope decisions, constraints
5. **`CLAUDE.md`** — Project conventions (will update after Phase 2)

### 2. COORDINATION

#### Batch 1 — pnpm Migration (Phase 1)

**Gate**: All pnpm infrastructure working. `pnpm install`, `pnpm build`, `pnpm test` pass.

**Step 1.1 — Create workspace config (parallel + T1.2)**
Run worker agent using `plan/T1.1-pnpm-workspace.md`:

- Creates `pnpm-workspace.yaml`
- Updates `package.json` (remove workspaces, add packageManager)

**Step 1.2 — Update CI workflows (parallel + T1.1)**
Run worker agent using `plan/T1.2-ci-pnpm.md`:

- Updates all 4 `.github/workflows/*.yml` files for pnpm

**Step 1.3 — Lockfile conversion (coordinator)**
After both workers complete:

1. Run: `rm -rf node_modules package-lock.json`
2. Run: `pnpm import` (converts existing lockfile)
3. Run: `pnpm install`
4. Run: `pnpm build` — verify it passes
5. Run: `pnpm test` — verify all test groups pass

**Verification gate**: CL-01 through CL-07 from CHECKLIST.md

---

#### Batch 2 — Install DevDependencies (Phase 2a)

**Gate**: All new dev dependencies installed, scripts registered, pnpm install clean.

**Step 2.1 — Install devDeps + add scripts (sequential)**
Run worker agent using `plan/T2.1-install-devdeps.md`:

- Adds eslint, typescript-eslint, prettier, husky, lint-staged to devDependencies
- Adds lint, format, prepare scripts to package.json
- Runs `pnpm install` and `pnpm exec husky init`
- **Must complete before Batch 3** (husky init needs husky installed)

**Verification gate**: Dependencies installed, `.husky/` directory exists, `pnpm install` clean

---

#### Batch 3 — Config Files (Phase 2b, parallel)

**Gate**: All config files created and CI updated. Note: `pnpm lint` and `pnpm format:check` may fail due to pre-refactoring code — this is expected.

**Step 3.1 — TS strict flags (parallel)**
Run worker agent using `plan/T3.1-ts-strict-flags.md`:

- Adds 3 strict flags to all 16 tsconfig.json files

**Step 3.2 — ESLint + Prettier config (parallel)**
Run worker agent using `plan/T3.2-eslint-prettier-config.md`:

- Creates `eslint.config.mjs`, `.prettierrc`, `.lintstagedrc.json`

**Step 3.3 — Husky pre-commit hook (parallel)**
Run worker agent using `plan/T3.3-husky-lintstaged.md`:

- Updates `.husky/pre-commit` to run `pnpm lint-staged`

**Step 3.4 — CI lint/format steps (parallel)**
Run worker agent using `plan/T3.4-ci-lint-format.md`:

- Adds lint and format-check steps to 3 workflow files

**Verification gate**: CL-08 through CL-16 from CHECKLIST.md (config existence, pre-commit hook, CI updates)

---

#### Batch 4 — Autofix (Phase 2c, coordinator procedural)

**Gate**: Codebase is auto-formatted and auto-fixed. Remaining violations are only non-autofixable manual ones.

**Step 4.1 — Coordinator runs autofix tools**

1. Run: `pnpm format` (prettier --write across all files)
2. Run: `pnpm format:check` — verify zero diffs
3. Run: `pnpm lint:fix` (eslint --fix across all files with cache)
4. Run: `pnpm lint` — inspect remaining violations (these need manual fixing)
5. Run: `pnpm build` — verify build still works (may have TS errors from new strict flags — note these for Batch 5)
6. Run: `pnpm test` — verify no test regressions

**Verification gate**: CL-17, CL-18 (partial — non-autofixable remaining okay), CL-19

---

#### Batch 5 — Manual Refactoring (Phase 3, parallel workers)

**Gate**: All source code passes `pnpm lint`, `pnpm format:check`, `pnpm build`.

**Step 5.1 — Fix CLI + bin (parallel)**
Run worker agent using `plan/T5.1-refactor-cli.md`:

- Fixes `packages/cli/*.ts` and `bin/apollo-toolkit.ts`

**Step 5.2 — Fix utils (parallel)**
Run worker agent using `plan/T5.2-refactor-utils.md`:

- Fixes `packages/tool-utils/`, `packages/tool-registry/`, `packages/tui/`

**Step 5.3 — Fix codegraph + eval (parallel)**
Run worker agent using `plan/T5.3-refactor-codegraph-eval.md`:

- Fixes `packages/tools/codegraph/` and `packages/tools/eval/`

**Step 5.4 — Fix other tools (parallel)**
Run worker agent using `plan/T5.4-refactor-other-tools.md`:

- Fixes all remaining tool packages

**Step 5.5 — Fix scripts + tests (parallel)**
Run worker agent using `plan/T5.5-refactor-scripts-tests.md`:

- Fixes `scripts/*.mjs` and formats `test/*.test.js`

**Note**: Workers in Batch 5 touch separate directory trees with zero file overlap, so all 5 can run in parallel.

**Verification gate**: After all workers report back, run:

1. `pnpm lint` — must be 0 errors
2. `pnpm format:check` — must be 0 diffs
3. `pnpm build` — must pass
4. `pnpm test` — must pass

---

### 3. FINAL VERIFICATION

After all batches complete, confirm the following from CHECKLIST.md:

**pnpm Migration (CL-01 through CL-07)**:

- [ ] `pnpm install` clean, lockfile is `pnpm-lock.yaml`
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes on all groups
- [ ] No `npm ci` / `npm publish` in CI workflows (all `pnpm`)

**Quality Gate Setup (CL-08 through CL-16)**:

- [ ] `pnpm lint` reports 0 errors
- [ ] `pnpm format:check` reports 0 diffs
- [ ] Pre-commit hook runs `pnpm lint-staged`
- [ ] CI workflows have lint + format-check steps

**Codebase Refactoring (CL-17 through CL-22)**:

- [ ] `eslint --fix .` and `prettier --write .` complete cleanly
- [ ] `pnpm lint` = 0 errors + 0 warnings
- [ ] `pnpm format:check` = "All matched files use Prettier code style!"
- [ ] `pnpm build` + `pnpm test` pass
- [ ] Coverage thresholds still met (`COVERAGE=true pnpm test`)
- [ ] No unapproved `eslint-disable` comments added (run grep audit)

**Final cleanups**:

- [ ] Update `CLAUDE.md` to reflect pnpm commands and quality gates (`pnpm lint`, `pnpm format:check` in the common commands section)
- [ ] If `scripts/test.sh` references `npm`, update to `pnpm` (check if any remain)
- [ ] Verify `pnpm test:ts` still works (compiled JS tests via node --test)
- [ ] CI-simulate: `pnpm install --frozen-lockfile` should work
