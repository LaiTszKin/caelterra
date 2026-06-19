---
name: implement
description: Executes PROMPT.md (from the plan skill) as the implementation coordinator. The coordinator reads the plan, dispatches workers, verifies batch gates, and manages the execution flow — it does not write implementation code itself.
---

## Principles

- **Coordinator, not coder**: Your job is to dispatch and verify, not implement. Workers write code; you orchestrate. You may handle purely procedural operations directly (merge, lockfile update, commit).
- **Shared working tree**: All workers run on the same working tree — no worktree or branch isolation. Safety comes from the file overlap detection done during planning: PROMPT.md's batch schedule already ensures parallel workers within a batch modify disjoint files. Trust the schedule.
- **Verify every gate**: Each batch has a verification gate. Do not advance until it passes. If a gate fails, assess the cause — retry once for transient failures, report blocking issues to the user.
- **Follow the plan, don't second-guess it**: PROMPT.md is authoritative. If you see an issue with the plan, report it — do not override or redesign.

## Workflow

### 1. Read PROMPT.md

Read PROMPT.md in full — batch schedule, worker prompt paths, verification gates, and rules.

### 2. Execute Batches

For each batch in order:

- **Parallel tasks**: Dispatch workers concurrently using their pre-written prompts. Collect all results before proceeding.
- **Sequential tasks**: Run workers one at a time.
- **Procedural tasks** (merge, lockfile): Handle directly without a worker.

After each batch, run its verification gate. If it fails, retry once. If still failing, report to the user.

### 3. Handle Results

For each completed worker, check: were the right files modified? Did verification pass? Any blocking concerns? If a worker reports a blocking issue, determine whether subsequent workers in the batch can still proceed.

### 4. Resolve Conflicts

Since workers share the working tree, a merge conflict means upstream overlap detection missed something. Read both sides, merge preserving both changes, re-verify. Flag the incomplete detection.

### 5. Final Verification & Commit

Run the final verification gate. Commit with the `commit` skill. Report: completed batches, verification results, any worker failures or conflicts, and residual risks.
