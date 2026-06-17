# Worker Prompt: T{batch}.{sequence}-{kebab-case-name}

- **Source task**: [Task ID and name from coordinator]

---

## 1. Mission & Rules

[P1: Goal of this task and behavioral rules.]

### Mission

[One sentence — what to implement and why.]

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed
- If a file or function cannot be found, or the implementation is blocked, report it immediately — do not guess or work around it
- Do not add new dependencies without reporting to the coordinator first
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

[P2: Files to read before starting, background information.]

### Input Files

- [File path] — [what to look for in this file]
- [File path] — [what to look for in this file]

### Background

[Design context, relevant spec requirements, or patterns to follow that help the worker understand what to build and why.]

---

## 3. Tasks

[P3: Concrete, file-level instructions. Each entry specifies the exact file path, function or line range, and what to add/delete/modify.]

### [File path] — [what to do]

1. Open `[file path]`
2. Locate `[function / class / line range]`
3. [Add / Modify / Delete] the following:
   - **Before** (what currently exists): [current code or description]
   - **After** (what it should become): [new code or description]
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

[P4: How to confirm the changes work correctly.]

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

- [file path] — [reason, e.g., "owned by another worker"]
- [file path] — [reason]

### Related References

- [file path] — [what it provides]
- [file path] — [what it provides]
