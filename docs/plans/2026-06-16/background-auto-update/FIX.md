# background-auto-update fix plan

- `docs/plans/2026-06-16/background-auto-update` - Context
- `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md` - Verification checklist
- `docs/plans/2026-06-16/background-auto-update/REPORT.md` - Review findings

## ROLE

You are the coordinator for the Apollo Toolkit background auto-update fix round.

Your job is to read the planning artifacts, dispatch the source-fix and regression-test workers in the exact order below, inspect their results, enforce verification gates, and stop only when every current P1 issue from `REPORT.md` is resolved or a real blocker is reported.

You do not write source code yourself. Workers modify code or tests; you coordinate, verify, and reconcile their outputs.

Success means:
- manual `auto-update run` remains usable after `auto-update disable` without flipping persisted state back to enabled,
- runner status and config visibility preserve the configured enabled/disabled state,
- scheduled/manual runner target scope is limited to existing Apollo Toolkit-managed target manifests,
- absent OpenClaw workspaces do not break updates for other installed managed targets,
- regression tests prove both fixes, and
- `npm run build` plus the relevant and full test suites pass.

## RULES

- Keep the spec boundary intact. Do not expand scope beyond `SPEC.md` and `DESIGN.md`.
- Never write source code directly; only workers modify source or test files.
- Never dispatch workers in parallel if they touch the same file or if one depends on another worker's output.
- Current source fixes overlap on `packages/cli/index.ts` and `packages/cli/auto-update-runner.ts`, so run FIX-01 and FIX-02 sequentially.
- Regression test workers both modify `test/cli/auto-update-runner.test.js`, so run REGTEST-01 and REGTEST-02 sequentially.
- Fix workers always run before their corresponding regression test workers.
- Regression tests must fail on unfixed code and pass after the fix is applied; if a worker cannot demonstrate that oracle, pause and inspect.
- If a worker reports a missing file, missing symbol, type conflict, or design conflict, pause and inspect rather than guessing.
- Do not add new dependencies.
- Do not touch generated `dist/**` files by hand.
- Preserve the existing CLI package self-update behavior; only background auto-update behavior is in scope.
- Preserve existing explicit install/uninstall target behavior; target narrowing applies to background auto-update runner scope only.

## WORKING STEPS

### 1. PREPARATION

Read these files before starting coordination:

- `docs/plans/2026-06-16/background-auto-update/SPEC.md` - business requirements and in/out of scope.
- `docs/plans/2026-06-16/background-auto-update/DESIGN.md` - module boundaries, scheduler expectations, runner invariants, and managed-skill ownership rules.
- `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md` - test mapping and verification targets, especially CL-02, CL-04, CL-06, IT-02, IT-04, and IT-06.
- `docs/plans/2026-06-16/background-auto-update/REPORT.md` - current two P1 findings to fix.
- `docs/plans/2026-06-16/background-auto-update/references/os-scheduled-tasks.md` - scheduler context; no current fix should alter scheduler command quoting/entrypoint behavior.
- `docs/plans/2026-06-16/background-auto-update/references/npm-package-extraction.md` - package extraction context; no current fix should introduce network-dependent tests.
- `docs/plans/2026-06-16/background-auto-update/references/node-process-execution.md` - process execution context.
- `packages/cli/index.ts` - CLI `auto-update` command dispatch and runner invocation.
- `packages/cli/auto-update-runner.ts` - one-shot update runner, config/status writes, sync/install call path.
- `packages/cli/auto-update-state.ts` - config/status read/write helpers and lock handling.
- `packages/cli/installer.ts` - manifest tracking, target-root resolution, install link behavior.
- `packages/cli/types.ts` - shared install mode, target, and manifest types.
- `test/cli/auto-update-runner.test.js` - runner test location for both regressions.
- `test/cli/interactive-paths.test.js` - existing disabled-state install coverage.
- `test/installer.test.js` - installer manifest/target behavior coverage.
- `docs/plans/2026-06-16/background-auto-update/fix/FIX-01-preserve-disabled-state.md` - worker prompt for P1 finding 1.
- `docs/plans/2026-06-16/background-auto-update/fix/FIX-02-installed-target-scope.md` - worker prompt for P1 finding 2.
- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-01-preserve-disabled-state.md` - regression test worker prompt for FIX-01.
- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-02-installed-target-scope.md` - regression test worker prompt for FIX-02.

### 2. COORDINATION

#### Batch 1: Preserve disabled state

Run this worker alone:

- `docs/plans/2026-06-16/background-auto-update/fix/FIX-01-preserve-disabled-state.md`

Batch 1 gate:

- `npm run build`
- `node --test dist/test/cli/auto-update-runner.test.js`
- `node --test dist/test/cli/interactive-paths.test.js`

Proceed only if:

- `runAutoUpdate()` preserves the current enabled/disabled state in status writes,
- successful runner config writes do not force disabled configs back to enabled,
- `auto-update run` still works when config is disabled,
- and existing disabled-state install tests continue to pass.

#### Batch 2: Restrict runner target scope

Run this worker after Batch 1 passes:

- `docs/plans/2026-06-16/background-auto-update/fix/FIX-02-installed-target-scope.md`

Batch 2 gate:

- `npm run build`
- `node --test dist/test/cli/auto-update-runner.test.js`
- `node --test dist/test/installer.test.js`

Proceed only if:

- the runner discovers manifest-backed managed targets before mutating `toolkitHome`,
- absent target families such as OpenClaw do not fail an update for existing managed targets,
- unselected target directories are not created or updated by background auto-update,
- and explicit installer target-root behavior remains intact.

#### Batch 3: Disabled-state regression

Run this worker after Batch 2 passes:

- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-01-preserve-disabled-state.md`

Batch 3 gate:

- Confirm the new test fails against the pre-FIX-01 behavior if the worker was able to demonstrate the oracle.
- `npm run build`
- `node --test dist/test/cli/auto-update-runner.test.js`
- `node --test dist/test/cli/interactive-paths.test.js`

Proceed only if:

- the regression proves a disabled config remains disabled after a successful runner update,
- the status file records `enabled: false` for the disabled manual-run scenario,
- and no existing runner tests regress.

#### Batch 4: Installed-target-scope regression

Run this worker after Batch 3 passes:

- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-02-installed-target-scope.md`

Batch 4 gate:

- Confirm the new test fails against the pre-FIX-02 behavior if the worker was able to demonstrate the oracle.
- `npm run build`
- `node --test dist/test/cli/auto-update-runner.test.js`
- `node --test dist/test/installer.test.js`

Proceed only if:

- the regression proves all candidate modes can be supplied without absent OpenClaw failure,
- only a manifest-backed target is updated,
- unselected Codex, Agents, and Claude target skill paths remain absent,
- and installer tests stay clean.

#### Batch 5: Final verification

Run after all fixes and regression tests pass:

- `npm run build`
- `npm test`

Final checks:

- `REPORT.md` P1 finding 1 is resolved: manual `auto-update run` preserves disabled config/status.
- `REPORT.md` P1 finding 2 is resolved: runner target scope is manifest-backed and does not expand to every supported mode.
- Previous review fixes remain intact: scheduler runner command still uses the executable bin wrapper and Windows `/TR` arguments remain quoted.
- The runner continues to update managed skills through package extraction and installer paths, without invoking CLI package self-update.

### 3. FINAL VERIFICATION

Before closing the plan, confirm all of the following:

- Every current issue in `REPORT.md` has a corresponding fix worker prompt.
- Every fix has a corresponding regression test worker prompt.
- No two workers in the same batch touch the same file.
- No worker is scheduled before its dependency batch finishes.
- `npm run build` passes after all code changes.
- `npm test` passes after the regression tests are added.
- `test/cli/auto-update-runner.test.js` includes regression coverage for disabled-state preservation and manifest-backed target scope.
- `test/cli/interactive-paths.test.js` still confirms disabled install config stays disabled.
- `test/installer.test.js` still confirms manifest and target-root behavior.
- If any blocker remains, report it clearly instead of patching around it.

## FIX HISTORY

### Previous Round - 2026-06-16

- **Summary**: The prior fix plan targeted two scheduler defects: scheduled task entrypoint used the CLI library module instead of the executable bin wrapper, and Windows `schtasks /TR` argument paths were not quoted. That plan scheduled two parallel source fixes, two regression workers, and final `npm run build` / `npm test` verification. The current `REPORT.md` marks those defects resolved and identifies two new P1 findings, so this plan replaces the worker prompts and schedule.
