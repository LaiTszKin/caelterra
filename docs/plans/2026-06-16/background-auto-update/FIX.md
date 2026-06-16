# background-auto-update fix plan

- `docs/plans/2026-06-16/background-auto-update` — Context
- `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md` — Verification checklist
- `docs/plans/2026-06-16/background-auto-update/REPORT.md` — Review findings

## ROLE

You are the coordinator for the Apollo Toolkit background auto-update fix.

Your job is to read the planning artifacts, dispatch fix and regression-test workers in the correct order, verify each batch, and stop only when every issue from REPORT.md is resolved or a real blocker is reported.

You do not write source code yourself. You only coordinate workers, inspect their results, enforce batch boundaries, and run final verification.

Success means:
- the scheduler uses a runnable executable entrypoint,
- Windows task registration preserves spaced arguments,
- the regression tests prove both fixes,
- and the relevant test suite passes.

## RULES

- Keep the spec boundary intact. Do not expand scope beyond `SPEC.md` and `DESIGN.md`.
- Never write source code directly; only workers modify code or tests.
- Never dispatch workers in parallel if they touch the same file or if one worker depends on another worker's output.
- Fix workers always run before their corresponding regression test workers.
- Regression tests must fail on unfixed code and pass after the fix is applied.
- If a worker reports a missing file, missing symbol, or design conflict, pause and inspect rather than guessing.
- Do not add new dependencies.
- Do not touch generated `dist/**` files by hand.
- Preserve the existing CLI package update behavior; only background auto-update behavior is in scope.

## WORKING STEPS

### 1. PREPARATION

Read these files before starting coordination:

- `docs/plans/2026-06-16/background-auto-update/SPEC.md` — business requirements and in/out of scope.
- `docs/plans/2026-06-16/background-auto-update/DESIGN.md` — module boundaries and platform expectations.
- `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md` — test mapping and verification targets.
- `docs/plans/2026-06-16/background-auto-update/REPORT.md` — current review findings to fix.
- `docs/plans/2026-06-16/background-auto-update/references/os-scheduled-tasks.md` — scheduler command-shape reference.
- `docs/plans/2026-06-16/background-auto-update/references/node-process-execution.md` — process execution reference.
- `docs/plans/2026-06-16/background-auto-update/fix/FIX-01-scheduled-runner-entrypoint.md` — worker prompt for the scheduled entrypoint bug.
- `docs/plans/2026-06-16/background-auto-update/fix/FIX-02-windows-schtasks-quoting.md` — worker prompt for the Windows quoting bug.
- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-01-scheduled-runner-entrypoint.md` — regression test worker prompt for FIX-01.
- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-02-windows-schtasks-quoting.md` — regression test worker prompt for FIX-02.

### 2. COORDINATION

#### Batch 1: Source fixes

Run these workers in parallel. Their file sets do not overlap and they have no logical dependency on each other:

- `docs/plans/2026-06-16/background-auto-update/fix/FIX-01-scheduled-runner-entrypoint.md`
- `docs/plans/2026-06-16/background-auto-update/fix/FIX-02-windows-schtasks-quoting.md`

Batch 1 gate:
- `npm run build`
- `node --test dist/test/cli/auto-update-scheduler.test.js`
- `node --test dist/test/cli/interactive-paths.test.js`

Proceed only if:
- the scheduled runner command now points at the executable bin wrapper,
- the Windows `/TR` command shape preserves quoted arguments,
- and the build stays clean.

#### Batch 2: Regression tests

Run these workers after Batch 1 passes:

- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-01-scheduled-runner-entrypoint.md`
- `docs/plans/2026-06-16/background-auto-update/fix/REGTEST-02-windows-schtasks-quoting.md`

Batch 2 gate:
- `npm run build`
- `node --test dist/test/cli/auto-update-cli-wiring.test.js`
- `node --test dist/test/cli/auto-update-scheduler.test.js`

Proceed only if:
- the entrypoint regression fails before FIX-01 and passes after FIX-01,
- the Windows quoting regression fails before FIX-02 and passes after FIX-02,
- and both tests are stable in the built output.

#### Batch 3: Final verification

Run the relevant selected suite after both fix and regression batches pass:

- `npm run build`
- `npm test`

Final checks:
- `auto-update enable`, `disable`, `status`, and `run` remain wired through the CLI.
- The scheduler helper still registers macOS, Linux, and Windows tasks correctly.
- The runner continues to update only managed skills and does not touch CLI self-update behavior.
- No new warnings or broken paths appear in the CLI output.

### 3. FINAL VERIFICATION

Before closing the plan, confirm all of the following:

- Every issue in REPORT.md has a corresponding fix worker prompt.
- Every fix has a corresponding regression test worker prompt.
- No two workers in the same batch touch the same file.
- No worker is scheduled before its dependency batch finishes.
- `npm run build` passes after all code changes.
- `npm test` passes after the regression tests are added.
- If any blocker remains, report it clearly instead of patching around it.
