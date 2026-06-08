---
name: review
description: Reviews spec-related code changes across six dimensions and produces a structured review report (REPORT.md) with findings only — no fix suggestions. Not for non-spec changes, direct code modification, or contexts without a spec.
---

## Goal

Produce a spec-change review report (REPORT.md) that answers: "Does this change satisfy the planned business requirements?" — then supplements with boundary, security, and code quality findings.

Every critical requirement must have a traceable status judgment, evidence location, gap description, and remaining uncertainty.

**This skill outputs findings only — no fix plans.** Fix planning is handled by the `qa` skill.

## Acceptance Criteria

- REPORT.md covers 6 review dimensions with: verdict, findings (P0-P3), requirement status summary
- No fix suggestions, root cause analysis, or verification methods
- Every finding is traceable to a SPEC.md requirement
- Verdict "Ready to Merge" → every requirement confirmed satisfied
- Verdict "Needs Work" → at least one requirement confirmed NOT satisfied

## Workflow

### 1. Parse Requirements and Locate Code

Read the SPEC.md and parse all `### Requirement N` sections — each is an independent review unit.

For each requirement, identify the implementation scope (affected files from DESIGN.md if available) and locate the relevant code in the repository. Build a clear mapping: **which code files implement which requirement**.

### 2. Review Each Requirement

For each requirement, review the mapped code across these 6 dimensions:

- **Hallucinated code**: Features or logic not defined in the spec
- **Redundant code**: Unused variables, functions, or duplicated implementations
- **Spec implementation deviation**: Code behavior inconsistent with the spec
- **Spec implementation omission**: Spec requirements not implemented
- **Architecture defect**: Violations of DESIGN.md's architecture
- **Performance concern**: Obvious performance issues

Classify each finding using the severity scale (see Severity Scale below). Scope findings to the requirement they affect.

### 3. Cross-Requirement Analysis

After reviewing all requirements individually, examine interactions between them:

- **Shared modules**: Multiple requirements touch the same code modules or utilities
- **Shared data structures**: Multiple requirements read/write the same data structures or state
- **Functional coupling**: One requirement's output feeds into another's input path
- **Same-file modifications**: Multiple requirements modify the same file

Group connected requirements into **Requirement Groups** (connections are transitive). For each group, review interaction-level concerns:

- **Interface mismatch**: One requirement's output consumed by another — does the contract align?
- **Side effect risk**: Changes for one requirement break assumptions of another
- **Merge conflict potential**: Same-file modifications require careful ordering
- **Architecture consistency**: Combined changes maintain DESIGN.md integrity

Classify interaction findings using the same severity scale.

### 4. Synthesize and Generate REPORT.md

1. **Dedup overlapping findings**: Merge identical issues found across requirements. Preserve dimension-specific notes.
2. **Resort by severity**: Reorder all findings P0 → P3 across the entire list.
3. **Collapse empty severity levels**: Skip table headers for levels with zero findings.
4. **Include group-level findings**: Cross-requirement interaction findings sit alongside individual findings.
5. **Conditional dimension summary**: If total findings exceed 5, include a one-line summary of finding counts per dimension. Otherwise omit.

Populate `assets/templates/REPORT.md` with these sections:

- **Verdict**: Ready to Merge / Needs Attention / Needs Work
- **Requirement Status Summary**: Per-requirement completion status, evidence location, open findings
- **Findings**: Issue list sorted P0 → P3 (only levels with findings)
- **Review History**: Previous rounds (if any)
- **References**: Project context files the next skill (qa) will need (e.g., `CLAUDE.md`, `AGENTS.md`, `resources/project-architecture/**`)

**If a previous REPORT.md exists**: Condense its verdict and key findings into one history entry in the Review History section. Then perform a fresh review — do not let prior results bias the new assessment.

**The report must NOT contain** fix suggestions, root cause analysis, or verification methods.

## Severity Scale

Defined by impact on **requirement satisfaction**:

| Level | Definition | Verdict Implication |
|---|---|---|
| **P0 — Requirement Blocked** | Requirement not implemented, behavior fundamentally deviates from spec, or hallucinated code exists. At least one requirement is **NOT** satisfied. | → Needs Work |
| **P1 — Requirement Defect** | Functionality exists but behaves incorrectly under specific conditions, or edge cases are unhandled. At least one requirement is only **PARTIALLY** satisfied. | → Needs Work |
| **P2 — Requirement Risk** | Functionality is correct but potential risks exist (architecture deviation, security weakness, performance bottleneck). Does **NOT** affect current requirement satisfaction. | → Needs Attention |
| **P3 — Suggestion** | Functionality is fully correct. Code can be improved but nothing is blocking. Does **NOT** affect any requirement's satisfaction. | → Ready to Merge |

## Verdict Criteria

| Condition | Verdict |
|---|---|
| Has P0 or P1 findings | Needs Work |
| No P0/P1, has P2 findings | Needs Attention |
| Only P3 or no findings | Ready to Merge |

## References

- `assets/templates/REPORT.md` — Review report template (populate during step 4)
- `references/create-review-report.md` — `apltk create-review-report` CLI tool parameters
- `references/halluciation-review-instruction.md` — Optional: detailed patterns for hallucinated code detection
