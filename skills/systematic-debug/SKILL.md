---
name: systematic-debug
description: Systematically investigates unexpected behavior — reproduces the issue by writing a test, fixes the root cause, and establishes a regression test. Not for simple fixes where the root cause is already known, nor for intuitive fixes without test verification.
---

## Goal

Reproduce unexpected behavior through a structured process.
Fix the root cause, then establish a regression test to prevent recurrence.

## Acceptance Criteria

- The unexpected behavior is fixed
- A regression test is established (must fail on unfixed code, pass after fix)
- The root cause is confirmed — not just the symptom patched

## Workflow

### 1. Analyze the Problem

**Classify the error type** to select the right approach:

| Type          | Characteristics                             | Approach                                          |
| ------------- | ------------------------------------------- | ------------------------------------------------- |
| Syntax / type | Compiler or linter points directly at it    | Fix the indicated location directly               |
| Logic         | Wrong output, test failure                  | Hypothesis-driven debugging + binary search       |
| State         | Intermittent, order-dependent               | Track state transitions, identify mutation points |
| Integration   | Works in isolation, fails when connected    | Check boundaries, contracts, formats              |
| Environment   | Works in some environments, fails in others | Compare environment differences, check config     |
| Performance   | Correct result but slow or resource-heavy   | Profile, find hotspots, check complexity          |

Read the relevant code based on the user's report. Collect evidence from error messages, recent changes, and logs.

Form a falsifiable hypothesis using the chosen method.

### 2. Reproduce the Issue

Write a test case to reproduce the issue based on your hypothesis.

**Change one variable at a time.** Changing multiple conditions simultaneously makes it impossible to attribute causality.

If none of the hypothesized causes reproduce the behavior, formulate a new hypothesis and repeat.

### 3. Fix the Code

Apply the fix until the reproduction test passes.

Fix the root cause, not the symptom. After fixing, keep the reproduction test as the regression test.

### 4. Self-Review

Before delivering, verify:

- The reproduction test fails on the unfixed code and passes after the fix (oracle confirmed)
- The fix addresses the root cause, not just the symptom
- The regression test covers the actual failure mode — not a trivial or unrelated scenario
- All investigative hypotheses are either confirmed (led to the fix) or documented as ruled out

## Debugging Method Guide

Choose the method that best fits the error type and context:

### Hypothesis-Driven Debugging

Best for **production incidents**, **logic errors**. Test hypotheses in cheapest-first order.

1. Form a falsifiable hypothesis: "I believe X is the root cause because Y"
2. Predict: "If correct, I will observe Z"
3. Test: Verify with the smallest possible change
4. Converge: Prediction matches → found it; doesn't match → new hypothesis
   Reference: Google SRE, Zeller's "Why Programs Fail"

### Five Whys

Best for **simple, linear failures**. Repeatedly ask "why" along a single causal chain.
Caution: When multiple causes interact, Five Whys may miss branching causes.

### Fault Tree Analysis (FTA)

Best for **multi-cause interaction**, **architecture-level prevention**. Start from the top-level failure, decompose all contributing causes downward to observable, testable leaf nodes. Identify minimal cut sets — address single-point failures first.
Reference: NASA SW Handbook, Chaos Engineering

### Kepner-Tregoe IS / IS NOT

Best for **cross-team, cross-service complex problems**. Force structured analysis through four dimensions:

| Dimension | IS (problem is here) | IS NOT (problem is not here) | Difference (cause lies here) |
| --------- | -------------------- | ---------------------------- | ---------------------------- |
| What      |                      |                              |                              |
| Where     |                      |                              |                              |
| When      |                      |                              |                              |
| Extent    |                      |                              |                              |

A valid root cause must explain all IS and all IS NOT. Best for stable environments with clear boundaries; not for cascading disasters.
Reference: Kepner-Tregoe Problem Solving

**Method selection principle**: When multiple possible root causes exist, start with the cheapest to verify.

## Defensive Mechanisms

### Red Flags — Stop and return to analysis

If you notice any of the following patterns, you are skipping investigation. Stop immediately and go back to Step 1:

1. **Skipping investigation, jumping to fix**: "Let me just quickly try X," "Let me try changing Y and see if it works," "It's probably Z, let me just fix it"
2. **Skipping verification**: "I'll skip the test and verify manually"
3. **Repeated blind attempts**: Retrying the same approach 2+ times without new evidence

### Rule of Three — Architecture challenge mechanism

If the same error survives 3 fix attempts:

1. **Stop** — do not attempt a 4th fix
2. Review: What fixes have been tried? What is the failure pattern?
3. Challenge: Is the current architectural assumption wrong? Are you fixing at the wrong abstraction level?
4. Escalate: Submit an investigation report to the user — include ruled-out hypotheses and suggested architectural adjustments
5. Do not continue iterating until the user decides

### Assumption Log

Record each hypothesis during debugging:

```
Hypothesis: [Root cause guess]
Status: [Unverified / Confirmed / Ruled out]
Verification: [What check was performed]
Evidence: [Observed result]
```

Every new hypothesis must explain all observed symptoms before being tested.

### When Root Cause Cannot Be Found

If systematic investigation still cannot identify the root cause (environmental, timing, external dependency):

1. Acknowledge that a complete investigation was performed
2. Record which directions were investigated
3. Implement appropriate safeguards (retry, timeout, improved error messages)
4. Add monitoring or logging so the issue can be reinvestigated with more evidence later

95% of "cannot find root cause" cases are insufficient depth. Confirm all available evidence has been exhausted before concluding.

## Examples

- "The checkout page sometimes returns a 500 error" → Classify (state/integration error) → Investigate coupon validation, pricing calculation, and external discount service → Write a reproduction test → Confirm root cause → Fix → Retain the test as a regression test
