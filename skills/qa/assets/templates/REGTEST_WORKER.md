# Regression Test Worker Prompt: REGTEST-{sequence}-{kebab-case-name}

- **Related fix**: FIX-{sequence} — [fix title]

---

## 1. Mission & Rules

[P1: Goal of this regression test and behavioral rules.]

### Mission

[Which fix needs a regression test and why.]

### Context

[What the fix addressed — summary, root cause.]

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied — this is the core oracle
- Follow the existing test patterns and style of the reference test files
- If the test cannot be designed to fail before the fix, report to the coordinator — do not write a weak test
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

[P2: Files to read before starting, test design.]

### Input Files

- Fix-related files: [path to the fixed code — understand what was changed]
- Existing test files (as format reference): [path — follow the same style and patterns]

### Test Design

- **Test ID**: REGTEST-{sequence}
- **Type**: [Unit / Integration / E2E]
- **Location**: [file path where the test will be written]
- **Scenario**: GIVEN [precondition] WHEN [trigger] THEN [expected result]
- **Oracle**: Must fail on unfixed code, must pass after fix

---

## 3. Tasks

[P3: Concrete steps for writing the regression test.]

1. Create the test at `[test file path]`
   - Write the test according to the Test Design above
   - Follow the format and naming conventions of [reference test file]
2. Run the test on the unfixed code — confirm it fails
3. [If the fix is already applied: temporarily revert the fix, run the test to confirm failure, then restore the fix]
4. [Additional steps if needed]

### Output

When done, report back to the coordinator:

- **Test file**: [path]
- **Test name**: [test name or description]
- **Oracle confirmed**: [test fails before fix / test passes after fix]
- **Risks or concerns**: [or "None"]

---

## 4. Verification

[P4: How to verify the regression test is valid.]

1. Run: `[test command for the specific test]` before the fix is applied
   - Expected: Test fails (confirming the oracle detects the bug)
2. Run: `[test command for the specific test]` after the fix is applied
   - Expected: Test passes (proving the fix resolves the issue)
3. Run: `[relevant subset of the full test suite]`
   - Expected: All tests pass (no regression to other tests)

---

## 5. Scope & References

[P5: Allowed/forbidden files and related references.]

### Allowed Files

- [test file path] — write the regression test here
- [reference test file] — use as format reference

### Forbidden Files

- All source code files (`.ts`, `.js`, `.py`, etc.) — the regression test worker must not modify source code

### Related Documents

- [path to FIX_WORKER prompt for the related fix — understand what was fixed]
- [path to SPEC.md or DESIGN.md — understand the expected behavior]
