# Fix Worker Prompt: FIX-{sequence}-{kebab-case-name}

- **Related issue**: [FIX ID from coordinator — e.g., FIX-01]

---

## 1. Mission & Rules

[P1: Goal of this fix and behavioral rules.]

### Mission

[One sentence — which issue to fix and why.]

### Context

[Which review dimension flagged this issue, which spec requirement it relates to.]

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed
- Preserve existing test semantics — do not weaken, skip, or remove existing tests
- If the fix approach conflicts with the original spec design intent, pause and report to the coordinator
- Do not add new dependencies without reporting to the coordinator first
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

[P2: Files to read before starting, root cause analysis.]

### Input Files

- [File path] — [what to read from it]
- [File path] — [what to read from it]

### Root Cause

[Brief description of the root cause, determined during QA analysis.]

---

## 3. Tasks

[P3: Concrete fix steps. Each entry specifies the exact file path, function or line range, and what to add/delete/modify.]

### [File path] — [what to fix]

1. Open `[file path]`
2. Locate `[function / class / line range]`
3. [Add / Modify / Delete] the following:
   - **Before** (current code): [current code or description]
   - **After** (fixed code): [new code or description]
4. [Additional step if needed]

[Repeat for each file or logical change group.]

### Output

When done, report back to the coordinator:

- **Files modified**: [list of files]
- **Change summary**: [brief description]
- **Test results**: [pass/fail]
- **Risks or concerns**: [or "None"]

---

## 4. Verification

[P4: How to confirm the fix works correctly.]

1. Run: `[command]`
   - Expected: [result]
2. Run: `[command]`
   - Expected: [result]

---

## 5. Scope & References

[P5: Allowed/forbidden files and related reference files.]

### Allowed Files

- [file path] — [reason]
- [file path] — [reason]

### Forbidden Files

- [file path] — [reason, e.g., "owned by another fix worker"]
- [file path] — [reason]

### Related Documents

- [path to SPEC.md, DESIGN.md, or relevant files]
