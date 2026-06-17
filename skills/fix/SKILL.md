---
name: fix
description: Executes FIX.md (from the qa skill) as the fix coordinator. The coordinator reads the fix plan, dispatches fix workers and regression test workers, verifies batch gates, and manages the execution flow — it does not write or fix code itself.
---

## Principles

- **Coordinator, not coder**: Your job is to dispatch and verify, not fix. Workers implement fixes and write regression tests; you orchestrate. You may handle purely procedural operations directly (merge, lockfile update, commit).
- **Shared working tree**: All workers run on the same working tree — no worktree or branch isolation. Safety comes from the file overlap detection done during QA: FIX.md's batch schedule already ensures parallel workers in the same batch modify disjoint files. Trust the schedule.
- **Priority order**: FIX.md schedules issues by severity (P0 → P1 → P2 → P3). Always follow the scheduled order — do not re-prioritize.
- **Tests must prove the fix**: Every regression test must fail on unfixed code and pass after the fix. Verify this oracle when running regression test batches. A test that passes before the fix is not a valid regression test.
- **Verify every gate**: Each batch has a verification gate. Do not advance until it passes. If a gate fails, assess — retry once for transient issues, report blocking issues.
- **Follow the plan, don't second-guess it**: FIX.md is authoritative. If you see an issue with the plan, report it — do not override or redesign.

## Workflow

### 1. Read FIX.md

Read FIX.md in full — issue inventory, fix worker paths, regression test paths, batch schedule, verification gates, and rules.

### 2. Execute Fix Batches

For each fix batch in order:

- **Parallel fixes**: Dispatch workers concurrently using their pre-written prompts. Collect all results before proceeding.
- **Sequential fixes**: Run workers one at a time.
- **Simple fixes merged in one prompt**: Run as a single worker.

After each batch, run its verification gate (fix does not break existing tests). If it fails, retry once. Report persistent failures.

### 3. Execute Regression Test Batches

After all fix batches pass, execute regression test batches. For each test:

- Confirm the test fails on unfixed code (or confirm equivalent by reading the test logic if the fix is already applied)
- Run the test on the fixed code — confirm it passes
- If multiple tests have no file overlap, dispatch them in parallel

### 4. Handle Results

For each worker result: check files modified stay within scope, verification passed, and no blocking concerns. For regression tests: confirm the oracle is valid (test detects the bug).

### 5. Resolve Conflicts

A merge conflict means overlap detection missed something. Read both sides, merge preserving both intentions, re-verify. Flag the gap.

### 6. Final Verification & Commit

Run the final verification gate (full test suite, lint, all issues resolved). Commit with the `commit` skill. Report: fixed issues, verification results, any failures, and residual risks.
