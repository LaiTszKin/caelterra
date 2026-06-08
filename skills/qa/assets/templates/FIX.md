# [spec name/batch name] fix plan

- `<spec_dir>`/`<batch_dir>` — Context
- `<checklist_dir>` — Verification checklist
- `<report_dir>` — Review report

## ROLE

[describe the role and the goal(s) of the agent here]

## RULES

[describe the rules here]

## WORKING STEPS

### 1. PREPARATION

[list out all the files which agent needs to read, and what information could be obtained from those files.]

### 2. COORDINATION

[describe the order of tasks. e.g.: "Batch 1: fix P0 issues FIX-01 and FIX-03 in parallel using prompts `<fix_worker_1>` and `<fix_worker_2>`. After that, verify <verification>. Batch 2: fix FIX-02. Batch 3: implement regression tests REGTEST-01, REGTEST-02 in parallel. Ensure each test fails on unfixed code and passes after fix."]

### 3. FINAL VERIFICATION

[describe the final verification gates here. Should be extracted from the checklist.]
