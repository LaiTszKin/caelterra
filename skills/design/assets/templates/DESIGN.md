# Design: [Feature Name]

- **Date**: [YYYY-MM-DD]
- **Feature**: [Feature Name]
- **Source SPEC**: [SPEC.md path]

> **Purpose:** Technical design document — defines architecture, external dependencies, data flow, invariants, and trade-offs. Provides technical decision basis for the `plan` phase's PROMPT.md.

---

## 1. Research Summary

### 1.1 Technical Feasibility

| Requirement | Feasibility | Risk           |
| ----------- | ----------- | -------------- |
| Req 1       | Feasible    | [Risk or None] |
| Req 2       | Feasible    | [Risk or None] |

**Overall assessment**: [All feasible / Partial validation needed / Blocking issues found]

### 1.2 Existing Reference Implementations

| Source               | Reusable Design Patterns                      |
| -------------------- | --------------------------------------------- |
| [URL / Project name] | [Specific design decisions worth referencing] |

### 1.3 Tech Stack Compatibility

| Candidate   | Repo Dependency Compatibility            | License | Decision                |
| ----------- | ---------------------------------------- | ------- | ----------------------- |
| [Library A] | Compatible / Version conflict (vX vs vY) | MIT     | ✅ Recommended          |
| [Library B] | Compatible                               | GPL     | ❌ License incompatible |

---

## 2. Architecture Overview

### 2.1 Module List

| Module Key | Responsibility (one sentence) | Owned Artifacts (types, tables, queues) |
| ---------- | ----------------------------- | --------------------------------------- |
| `[key]`    | [...]                         | [none / list]                           |

### 2.2 Boundaries

- **Entry points**: [HTTP · CLI · job · subscriber · FFI]
- **Trust boundary**: [`None` / brief description]
- **External → Internal**: `[Actor]` → `[entry]` → `[…]`

### 2.3 Target vs Baseline

|                       | Baseline (current) | Target (after change) |
| --------------------- | ------------------ | --------------------- |
| Structure / Ownership | […]                | […]                   |

---

## 3. Interaction Design

### 3.1 Interaction Anchors (`INT-###`)

| ID        | Intent (when this coupling matters) | Caller → Callee | Coupling Type (route / RPC / event / sync call) | Information / State Crossing | Failure Propagation Expectation |
| --------- | ----------------------------------- | --------------- | ----------------------------------------------- | ---------------------------- | ------------------------------- |
| `INT-001` | […]                                 | `A` → `B`       | […]                                             | […]                          | […]                             |

### 3.2 Ordering / Concurrency Constraints (Design Level)

[Parallelism rules, critical sections, or `None`]

### 3.3 Requirement Links (Coarse-Grained Ordering)

Map to SPEC.md requirement numbers:

- **Req 1 cluster**: `INT-001` → `INT-002` → …
- **Req 2 cluster**: …

---

## 4. External Dependencies

### 4.1 Dependency Overview

| Dependency | Purpose   | Official Documentation |
| ---------- | --------- | ---------------------- |
| [Name]     | [Purpose] | [URL]                  |

If none, write **None** and note the scope (e.g., stdlib only / in-process calls).

### 4.2 [Dependency Name]

#### Factual Basis

| Required Capability | Documentation Location |
| ------------------- | ---------------------- |
| […]                 | […]                    |

**Version assumption**: [Pinned / Floating / Unpinned]

#### Limits and Failure Modes

| Category                            | Documented Fact | Coding Obligation             |
| ----------------------------------- | --------------- | ----------------------------- |
| Quota · Size · Timeout · Pagination | […]             | [Backoff / batching strategy] |
| Error / Degradation Modes           | […]             | [Application-level mapping]   |

#### Security and Keys

| Concern                | Constraint |
| ---------------------- | ---------- |
| Authentication / Scope | […]        |
| Key Name               | […]        |

#### Integration Anchors (`EXT-###`)

| ID        | Integration Surface (as named in docs) | Non-Negotiable Handling (retry, idempotency) | Prohibited Assumptions |
| --------- | -------------------------------------- | -------------------------------------------- | ---------------------- |
| `EXT-001` | [endpoint · SDK symbol · topic]        | […]                                          | […]                    |

---

## 5. Data Persistence

| Resource                   | Typical Readers / Writers (module key) | Consistency Expectation (ordering, idempotency) |
| -------------------------- | -------------------------------------- | ----------------------------------------------- |
| [store · schema · queue …] | […]                                    | […]                                             |

---

## 6. System Invariants

| Invariant | How Architecture Could Violate It  | Symptoms of Violation |
| --------- | ---------------------------------- | --------------------- |
| […]       | [Wrong coupling / wrong owner / …] | […]                   |

---

## 7. Technical Trade-offs

| Decision | Rejected Alternatives | Lock-in Effect on Implementation |
| -------- | --------------------- | -------------------------------- |
| […]      | […]                   | […]                              |

---

## 8. Design-Time Refactoring

Code health findings identified during architecture survey, classified by module boundary scope.

| Finding | Affected Module | Tier (T1/T2/T3) | Disposition (Refactored / Scheduled / Deferred) | Test Evidence |
| ------- | --------------- | --------------- | ----------------------------------------------- | ------------- |
| […]     | […]             | […]             | […]                                             | […]           |

If none, write **None**.

---

## 9. References

- **Designed code file paths**: [List code file paths that this design touches or references — e.g., `src/auth/login.ts`, `src/api/routes.ts`]
- **Project context files**: [List important project files the LLM will need — e.g., `CLAUDE.md`, `AGENTS.md`, `resources/project-architecture/**`]
- **Related documents**: [Links to related SPEC.md, other design docs, or external documentation]
