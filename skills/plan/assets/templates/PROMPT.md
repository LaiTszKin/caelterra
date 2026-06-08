# [spec name/batch name] implementation plan

- `<spec_dir>`/`<batch_dir>` — Context
- `<checklist_dir>` — Verification checklist

## ROLE

[describe the role and the goal(s) of the agent here]

## RULES

[describe the rules here]

## WORKING STEPS

### 1. PREPARATION

[list out all the files which agent needs to read, and what information could be obtained from those files. e.g.: "read `<spec_dir>/SPEC.md` to understand the requirement of the user."]

### 2. COORDINATION

[describe the order of tasks. e.g.: "Batch 1: create 2 parallel worker agents using prompts `<worker_prompt_1_dir>` and `<worker_prompt_2_dir>` and wait for their completion. After that, verify <describe the verification requirement here>. Once verified, go to the next batch. Batch 2: create worker 2.1 first and create worker 2.2 after worker 2.1's completion."]

### 3. FINAL VERIFICATION

[describe the final verification gates here. Should be extracted from the checklist.]
