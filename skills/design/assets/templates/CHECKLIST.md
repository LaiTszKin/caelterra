# Checklist: [Feature Name]

- **Date**: [YYYY-MM-DD]
- **Feature**: [Feature Name]
- **Source SPEC**: [SPEC.md path]

> **Purpose:** Verification strategy — defines how to confirm that the implementation satisfies the SPEC.md business requirements. Produced using the `test-case-strategy` skill.

---

## Behavior-to-Test Checklist

Map each BDD requirement from SPEC.md to one or more tests:

| ID    | Observable Behavior    | SPEC Requirement | Corresponding Test | Result     |
| ----- | ---------------------- | ---------------- | ------------------ | ---------- |
| CL-01 | [Behavior description] | Req 1            | [Test IDs]         | `[status]` |
| CL-02 | [Behavior description] | Req 1            | [Test IDs]         | `[status]` |

---

## Hardening Checklist

- [ ] Regression tests for bug-prone / high-risk behavior (or `N/A` + reason)
- [ ] Unit drift checks for non-trivial logic (or `N/A` + reason)
- [ ] Property-based coverage for business logic (or `N/A` + reason)
- [ ] External services mocked / faked (or `N/A` + reason)
- [ ] Adversarial cases for abuse paths (or `N/A` + reason)
- [ ] Authorization, idempotency, and concurrency risks assessed (or `N/A` + reason)
- [ ] Assertions verify outcomes and side-effects, not just "returns 200"
- [ ] Fixtures are reproducible (fixed seed / clock) (or `N/A` + reason)

---

## E2E / Integration Decisions

| Flow / Risk        | Test Level                                    | Rationale |
| ------------------ | --------------------------------------------- | --------- |
| [Flow description] | [E2E / Integration / Existing coverage / N/A] | [why]     |

---

## References

- **Designed code file paths**: [List code file paths that this design touches or references — e.g., `src/auth/login.ts`, `src/api/routes.ts`]
- **Project context files**: [List important project files the LLM will need — e.g., `CLAUDE.md`, `AGENTS.md`, `resources/project-architecture/**`]
- **Related documents**: [Links to related SPEC.md, DESIGN.md, or external documentation]
