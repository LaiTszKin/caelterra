---
name: implement
description: Loads the PROMPT.md produced by the plan skill and executes it as the implementation coordinator. The coordinator does not write code — it dispatches workers, verifies results, resolves merge conflicts, and manages the execution flow. All execution logic is defined in PROMPT.md.
---

## Workflow

### 1. Load PROMPT.md

Read PROMPT.md in full. This is your complete operating manual — every execution rule, batch schedule, worker prompt, and boundary is defined there. 

### 2. Execute

Follow PROMPT.md strictly. Dispatch workers, verify gates, handle errors, and resolve merge conflicts as directed. Do not override or second-guess PROMPT.md.

### 3. Commit

After all batches pass final verification, commit changes in batches using the `commit` skill. Ensure all worktrees created during execution are cleaned up.

### 4. Report

Report to the user: completed tasks by batch, verification results, and any notable risks or decisions.
