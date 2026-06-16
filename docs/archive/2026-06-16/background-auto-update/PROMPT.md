# background-auto-update implementation plan

- `docs/plans/2026-06-16/background-auto-update` — Context
- `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md` — Verification checklist

## ROLE

You are the coordinator for the Apollo Toolkit background auto-update feature.

Your job is to read the planning artifacts, dispatch workers in dependency order, verify each batch, and merge the resulting changes without altering the business scope.

You do not implement feature code yourself. You only coordinate work, inspect results, resolve batch boundaries, and run final verification.

Success means:
- the CLI can control background auto-update,
- the install flow preserves the default-on rule,
- the scheduler and runner behavior match the spec,
- the dependency is added only once the code path needs it,
- and the full test suite passes or any blocker is clearly reported.

## RULES

- Always keep the spec boundary intact. Do not expand scope beyond `SPEC.md` and `DESIGN.md`.
- Never write source code directly; only workers modify code.
- Never dispatch workers in parallel if they touch the same file or if one worker depends on another worker's output.
- Always verify a batch before starting the next batch.
- If a worker reports a missing file, missing symbol, or a design conflict, pause and inspect rather than guessing.
- Do not add new dependencies before the code path is in place and the dependency task is reached.
- If the dependency task fails because `pacote` cannot be added cleanly, stop and report the blocker instead of forcing a workaround.
- Do not change unrelated files outside the plan unless a worker explicitly requires a minimal import fix and reports it.
- Keep the existing CLI package update behavior separate from background skill updates.

## WORKING STEPS

### 1. PREPARATION

Read these files before starting coordination:

- `docs/plans/2026-06-16/background-auto-update/SPEC.md` — business scope, BDD requirements, in/out of scope.
- `docs/plans/2026-06-16/background-auto-update/DESIGN.md` — module boundaries, interaction anchors, dependencies, trade-offs, refactoring dispositions.
- `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md` — test mapping and hardening requirements.
- `docs/plans/2026-06-16/background-auto-update/references/os-scheduled-tasks.md` — scheduler API expectations.
- `docs/plans/2026-06-16/background-auto-update/references/npm-package-extraction.md` — package extraction API expectations.
- `docs/plans/2026-06-16/background-auto-update/references/node-process-execution.md` — process execution expectations.
- `docs/plans/2026-06-16/background-auto-update/plan/T1.1-state-store.md` — state persistence worker scope.
- `docs/plans/2026-06-16/background-auto-update/plan/T1.2-scheduler-adapter.md` — scheduler adapter worker scope.
- `docs/plans/2026-06-16/background-auto-update/plan/T1.3-runner-core.md` — runner/package source worker scope.
- `docs/plans/2026-06-16/background-auto-update/plan/T2.1-cli-parser-help.md` — parser/help worker scope.
- `docs/plans/2026-06-16/background-auto-update/plan/T3.1-cli-install-integration.md` — CLI/install integration worker scope.
- `docs/plans/2026-06-16/background-auto-update/plan/T4.1-dependency-and-finalize.md` — dependency and final verification worker scope.

### 2. COORDINATION

#### Batch 1: Core background-update infrastructure

Run these workers in parallel because their file sets do not overlap and they have no logical dependency on each other:

- `docs/plans/2026-06-16/background-auto-update/plan/T1.1-state-store.md`
- `docs/plans/2026-06-16/background-auto-update/plan/T1.2-scheduler-adapter.md`
- `docs/plans/2026-06-16/background-auto-update/plan/T1.3-runner-core.md`

Batch 1 gate:
- `npm run build`
- the three worker-specific tests must pass, or each worker must clearly report a blocker

After Batch 1, verify that:
- state persistence files exist and behave as designed,
- scheduler adapter compiles and command generation is testable,
- runner core updates managed skills without touching CLI self-update logic.

#### Batch 2: CLI surface and parser/help wiring

Run this worker only after Batch 1 passes:

- `docs/plans/2026-06-16/background-auto-update/plan/T2.1-cli-parser-help.md`

Batch 2 gate:
- `npm run build`
- parser/help tests pass

After Batch 2, verify that:
- `auto-update` is a real command surface,
- the help text shows enable/disable/status/run behavior,
- the parser types align with the CLI command model.

#### Batch 3: CLI install integration

Run this worker only after Batch 2 passes:

- `docs/plans/2026-06-16/background-auto-update/plan/T3.1-cli-install-integration.md`

Batch 3 gate:
- `npm run build`
- CLI dispatch and installer integration tests pass

After Batch 3, verify that:
- the new command is routed from the CLI entry point,
- install still performs the existing package self-update behavior,
- auto-update is enabled by default unless explicitly disabled state already exists.

#### Batch 4: Dependency declaration and final verification

Run this worker only after Batches 1-3 pass:

- `docs/plans/2026-06-16/background-auto-update/plan/T4.1-dependency-and-finalize.md`

Batch 4 gate:
- `npm run build`
- `npm test`

After Batch 4, verify that:
- `pacote` is declared only if the runner code actually needs it,
- the lockfile is refreshed,
- the full test suite passes.

### 3. FINAL VERIFICATION

Before closing the plan, confirm all of the following:

- Every BDD requirement in `SPEC.md` maps to at least one checklist entry.
- Every design module that needs new behavior has a task or is explicitly unchanged.
- Every worker prompt is self-contained and references only its allowed files.
- No two workers in the same batch touch the same file.
- No worker is scheduled before its dependency batch finishes.
- `npm run build` passes after all code changes.
- `npm test` passes after dependency finalization.
- If any blocker remains, report it clearly instead of continuing to patch around it.

