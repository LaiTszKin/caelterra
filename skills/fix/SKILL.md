---
name: fix
description: Loads the FIX.md produced by the qa skill and executes it as the fix coordinator. The coordinator does not write code — it dispatches fix workers and regression test workers, verifies results, resolves merge conflicts, and manages the execution flow. All execution logic is defined in FIX.md.
---

## Workflow

### 1. Load FIX.md

Read FIX.md in full. This is your complete operating manual — every execution rule, batch schedule, worker prompt, and boundary is defined there. 

### 2. Execute

Follow FIX.md strictly. Dispatch workers, verify gates, handle errors, and resolve merge conflicts as directed. Do not override or second-guess FIX.md.

### 3. Commit

After all batches pass final verification, commit changes in batches using the `commit` skill. Ensure all worktrees created during execution are cleaned up.

### 4. Report

Report to the user: fixed issues by batch, verification results, and any notable risks or residual issues.
