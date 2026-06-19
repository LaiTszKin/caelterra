---
name: test-case-strategy
description: Designs test strategy based on risk analysis — selects the right test level and method for the current context. Not for exploratory tasks without tests, nor for tasks where the test type is already predetermined.
---

## Goal

Plan a complete test strategy based on the current requirements and architecture context.

## Acceptance Criteria

- Every requirement and implementation task has a corresponding verification test
- Test selection decisions are recorded with rationale
- No redundant tests without a corresponding risk

## Workflow

### 1. Understand Requirements and Read Related Code

Understand the requirements. Read the relevant code to understand available test approaches and current architecture.

### 2. Identify Risks and Boundaries

For each requirement, assess the following:

**Likelihood × Impact = Risk Level**

- Likelihood: How likely is this functionality to fail? (complexity, change frequency, historical defects)
- Impact: What is the cost of failure? (financial loss, user experience, security)

**Test boundary heuristics** — determine where each behavior should be verified:

- Can the behavior be verified within a single function? → Unit test
- Does the behavior require cross-module collaboration? → Integration test
- Is the behavior only observable in a complete user flow? → E2E test
- Does the behavior have a describable invariant? → Property-based test
- Does the behavior involve **multi-step state transitions** with **describable invariants**? → Integrated PBT (stateful / state machine testing) — see `references/integrated-pbt.md`

Read relevant reference files to understand common test strategy patterns for different scenarios.

### 3. Record Decisions

For each test case, record:

- Test ID (UT-xx / IT-xx / E2E-xx / PBT-xx)
- Target scope (function / module / API / flow)
- Verification oracle (pass condition)
- Corresponding requirement number

If skipping a test level, record the reason.

### 4. Self-Review

Before delivering, verify:

- Every requirement has at least one corresponding test case
- Every test case has a defined oracle (pass condition)
- Every skip of a test level has a documented reason
- No test case exists without a corresponding risk or requirement (no redundant tests)

## References

- `references/unit-tests.md` — Unit test and drift check design
- `references/property-based-tests.md` — Property-based test selection and oracle design
- `references/integrated-pbt.md` — Integrated PBT (stateful / state machine testing)
- `references/integration-tests.md` — Integration test and external state scenario design
- `references/e2e-tests.md` — E2E decisions and substitution rules
- `references/contract-tests.md` — Contract tests and API boundary verification
