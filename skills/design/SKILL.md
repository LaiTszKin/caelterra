---
name: design
description: Reads SPEC.md, validates technical feasibility through web research, finds quality reference implementations, confirms tech stack compatibility, then produces DESIGN.md (architecture design, external dependencies), CHECKLIST.md (verification strategy), and Architecture Diff. Not for use without a SPEC.md.
---

## Goal

Transform business specifications (SPEC.md) into technical design.
Research first, design second — avoid reinventing wheels and ground every decision in evidence.

## Acceptance Criteria

- Three web research passes completed and recorded
- `docs/plans/<YYYY-MM-DD>/<spec_name>/DESIGN.md` produced, covering: architecture design, external dependencies (with API facts and limits), data persistence, invariants, technical trade-offs
- `docs/plans/<YYYY-MM-DD>/<spec_name>/CHECKLIST.md` produced, covering: behavior-to-test mapping, hardening requirements, test level choices
- Architecture Diff produced using the C4 model hierarchy

## Workflow

### 1. Determine Spec Type and Read All SPEC.md

Determine whether the current spec is a single spec or a batch spec:
- **Single spec**: The path points directly to a SPEC.md file, or the directory contains exactly one SPEC.md
- **Batch spec**: The path is a batch directory with multiple subdirectories, each containing its own SPEC.md

Read all relevant SPEC.md files to understand:
- Overall business goal and scope (for batch specs, distill the common goal from all SPEC.md files)
- Each SPEC.md's BDD behavioral requirements
- Error and edge cases
- Uncertainty markers and Clarification Questions

### 2. Web Research (Research-First)

Before designing the architecture, complete three web research passes. Use the `deep-research` skill or direct web search.

#### 2a. Technical Feasibility

For each requirement in SPEC.md:
- Verify feasibility under the current tech stack
- Flag high-risk or uncertain technical points
- Record key limitations

Output: Feasibility assessment + risk checklist

**⚠️ Decision gate — STOP if blocking issues are found.**

| Assessment | Meaning | Action |
|---|---|---|
| ✅ All feasible | Every requirement is achievable under the current or extendable tech stack | Continue to Step 3 |
| ⚠️ Partial validation needed | Some areas are uncertain; the path is unclear but there is no confirmed blocker | Continue, but mark all uncertain items as Exploratory-level risks in DESIGN.md. Suggest a spike or prototype where warranted |
| 🛑 **Blocking issues found** | At least one requirement cannot be implemented under any reasonable tech stack extension within the project's constraints | **STOP.** Do NOT proceed to architecture design. Document the specific infeasibility with supporting evidence (API limitations, licensing, missing platform capabilities, etc.). Report to the user and request SPEC.md revision |

**Why this gate exists**: The spec phase validates requirements against the repo's existing code only — it does not verify external technical feasibility. This is the first and only time in the pipeline that technical feasibility is checked against real-world constraints. Proceeding with architecture design on infeasible requirements produces wasted work. If you hit a blocking issue, escalate before designing.

#### 2b. Existing Quality References

Search for mature open-source solutions or community best practices:
- Search for implementation patterns for similar functionality
- Find officially recommended approaches
- Record design decisions worth referencing

Output: Reference implementation list + reusable design patterns

#### 2c. Tech Stack Compatibility

Verify external dependency compatibility with the repo's existing dependencies:
- Check version conflict risks
- Compare alternatives (when multiple libraries are available)
- Confirm license compatibility

Output: Recommended tech stack + compatibility report

### 3. Design Architecture → DESIGN.md

Based on the research findings, design the architecture. Use `assets/templates/DESIGN.md`.

Transfer the research outputs from Steps 2a-2c into the **Research Summary** section of DESIGN.md (feasibility table, reference patterns table, tech stack compatibility table).

Cover the following sections:
- **Research Summary**: Feasibility per requirement, existing references, tech stack compatibility (from Step 2)
- **Architecture Overview**: Module list with responsibilities, entry points, trust boundary, target vs baseline comparison
- **Interaction Design**: Module call relationships, coupling patterns (route / RPC / event / sync), failure propagation, ordering constraints
- **External Dependencies**: API facts, limits and failure modes, security and keys (absorbs what was formerly in contract.md)
- **Data Persistence**: Storage resources, consistency expectations
- **System Invariants**: Architectural constraints that must not be violated, plus violation symptoms
- **Technical Trade-offs**: Each decision with rejected alternatives and lock-in effects

Use `Req 1`, `Req 2` numbering to reference SPEC.md requirements (matching the SPEC.md template's `Requirement 1`, `Requirement 2`).

**Scale awareness** — Not every section applies at full depth. Adapt based on the change's scope:

- **Interaction Design (Section 3)**: If the change is confined to a single module with no new cross-module coupling, mark this section as `None` (no new interaction anchors needed). Do not fabricate INT-### entries for the sake of filling the table.
- **External Dependency deep-dives (Section 4.2)**: For simple utility libraries (e.g., date formatting, UUID generation) that have no API quotas, authentication, or failure modes, skip the sub-tables. A one-line entry in Section 4.1 overview suffices. Reserve the full 4-sub-table format for dependencies with real operational complexity (external APIs, databases, message queues).
- **Target vs Baseline (Section 2.3)**: If the change touches multiple dimensions (new modules, removed modules, ownership shifts, deployment changes), expand the table to multiple rows — one row per dimension. If it is a single-dimension change, a single row is fine.
- **System Invariants (Section 6)**: If the change does not modify any architectural constraint (e.g., purely additive within an existing module), explicitly write `None` with a brief justification. Do not fabricate invariants.

**Design self-challenge** — Before finalizing the design, step back and ask three questions:

1. **Is every module necessary?** Could the same functionality live inside an existing module without adding a new one? Unnecessary modules increase cognitive load and maintenance cost.
2. **Is this the simplest viable design?** Have I introduced abstractions, indirections, or intermediate layers that are not justified by the current requirements? Prefer the simplest structure that works.
3. **Are there rejected alternatives?** For every major architectural decision (module split, dependency choice, communication pattern), if you have not considered and explicitly rejected at least one alternative, you may be settling on the first workable solution rather than the best one.

**Single spec**: Produce one DESIGN.md for one SPEC.md.
**Batch spec**: Produce **one** unified DESIGN.md covering the scope of all SPEC.md files in the batch.

### 4. Define Verification Strategy → CHECKLIST.md

Use the `test-case-strategy` skill to design the verification strategy.
Use `assets/templates/CHECKLIST.md`.

The CHECKLIST.md defines the **test plan** — it maps SPEC.md requirements to tests, defines hardening requirements, and records test-level decisions.
(Do not include execution tracking fields — those belong to the implementation phase.)

Cover the following sections:
- **Behavior-to-Test Checklist**: Each BDD requirement mapped to one or more tests
- **Hardening Requirements**: Regression tests, drift checks, property-based tests, edge cases, authorization checks
- **E2E / Integration Decisions**: Per flow, choose the appropriate test level with rationale

**Mandatory test coverage** (applies when the SPEC.md describes changes other than pure documentation or pure test changes):

1. **Every function must have a unit test** — each new or modified public function (including helpers and utilities) must have a corresponding unit test case
2. **All medium-risk business paths must have integration or property-based tests** — prefer property-based testing (PBT) when applicable; otherwise use integration tests
3. **All high-risk paths must have end-to-end or integrated PBT** — cross-module core business flows must be validated through E2E tests or integrated property-based tests

Risk definitions: **Medium risk** = paths involving I/O, external dependencies, or state changes; **High risk** = paths crossing multiple modules, or involving money, permissions, or data consistency.

**Single spec**: Produce one CHECKLIST.md for one SPEC.md.
**Batch spec**: Produce **one** unified CHECKLIST.md covering the behavioral requirements of all SPEC.md files in the batch.

### 5. Generate Architecture Diff

Use the `apltk architecture` CLI tool to generate the Architecture Diff, following the C4 model hierarchy.

#### 5a. Read the Existing Architecture

Read the project's existing architecture files (`resources/project-architecture/atlas/atlas.index.yaml` + the affected feature YAML files).
Do not read unrelated features or modules — maintain context economy.

If no existing architecture exists, skip the baseline comparison and start defining the boundary from System Context level.

#### 5b. Measure Baseline Drift

Compare the existing architecture diagram against the current code to assess its reliability:
- If the baseline atlas differs significantly from the code (> 20% entries inconsistent), flag the risk in the architecture diff
- If the baseline atlas is reliable, the diff can be layered directly on top of it

#### 5b.1 Query CodeGraph for integration surface

If the project has been indexed with CodeGraph (`.codegraph/` exists):

```bash
apltk codegraph list-apis --all
```

This returns the complete public API directory of the existing system—every symbol, its parameters, callers, and file location—deterministically parsed by tree-sitter. Use this data to understand which existing services and repositories the new feature can integrate with.

For deeper context on a specific area:

```bash
apltk codegraph explore "feature-name"
```

#### 5c. Define the Diff by C4 Level

When defining feature and submodule boundaries, prefer CodeGraph queries (from `apltk codegraph list-apis --all` or `apltk codegraph survey`) over manual grep/Read discovery — CodeGraph produces deterministic, tree-sitter-parsed results that are always consistent with the actual code.

1. **System Context**: Define external actors, system boundaries, cross-system edges
2. **Container level** (features): Define new or modified features and the edges between them
3. **Component level** (submodules): Define functions, variables, dataflows, and error rows within each submodule
4. **Code level** (selective): Only supplement function-level details for critical paths

C4 level reference:
| C4 Level | Maps to | Purpose |
|----------|---------|---------|
| System Context | Overall system + external actors | System boundary and external dependencies |
| Container | Feature (functional module) | High-level functional boundary |
| Component | Submodule (implementation unit) | Internal implementation units |
| Code | Function level | Function-level details (selective) |

#### 5d. Evidence Tracing

Each component should link to:
- The requirement number from SPEC.md (requirement → module)
- The technical decision from research findings (decision → dependency choice)

#### 5e. Generate the Diff and Validate

```bash
apltk architecture --spec <spec_dir> render
apltk architecture --spec <spec_dir> validate
```

Confirm validation passes, then use the diff command to produce a visual comparison:

```bash
apltk architecture diff
```

**Single spec**: Produce one Architecture Diff for one SPEC.md.
**Batch spec**: Produce **one** unified Architecture Diff covering all SPEC.md files in the batch.

### 6. Pre-delivery Self-Review

Before delivering, run two passes — completeness then quality.

**Completeness checks** (documentation integrity):

- Research results are recorded in DESIGN.md as evidence for technical decisions
- Every architecture decision has a trade-off record (rejected alternatives + lock-in effects)
- External dependency API facts are traceable to official documentation
- CHECKLIST.md completely covers all BDD requirements from SPEC.md
- Architecture Diff covers the full change scope

**Design quality checks** (architectural soundness):

- **Requirement traceability**: Can every BDD behavior from SPEC.md be traced to a module, interaction, data flow, or invariant in this design? If a requirement has no home, the design is incomplete.
- **Internal consistency**: Do the modules listed in Section 2 appear as callers or callees in Section 3? Do the dependencies in Section 4 correspond to module responsibilities in Section 2? Unreferenced modules or dependencies indicate dead structure.
- **Design simplicity**: Have I applied the scale awareness guidance from Step 3? Is this the simplest design that satisfies all requirements? Could any module, abstraction, or dependency be removed without breaking functionality?
- **Risk transparency**: Are all feasibility risks, compatibility concerns, or uncertain technical points from Step 2 either addressed in the design or explicitly documented as accepted risks? Undocumented risks will surface during implementation as surprises — document them now.

## Examples

- "SPEC.md defines a real-time messaging feature" → Research WebSocket vs SSE vs Polling trade-offs → Confirm compatibility with existing repo dependencies → Choose SSE → Design architecture → Produce DESIGN.md + CHECKLIST.md + Architecture Diff
- "SPEC.md requires CSV export, repo has no CSV library" → Research Node.js CSV libraries (json2csv vs csv-writer vs papaparse) → Confirm compatibility → Choose the lightest option → Design export flow architecture
- "Batch spec: docs/plans/2026-05-29/auth-redesign/ with 3 SPEC.md files (login, permissions, 2FA)" → Read all 3 SPEC.md files → Unified research across all requirements → Produce **one** DESIGN.md + CHECKLIST.md + Architecture Diff covering the entire auth system

## References

- `assets/templates/DESIGN.md` — DESIGN.md template
- `assets/templates/CHECKLIST.md` — CHECKLIST.md template
- `references/architecture.md` — `apltk architecture` CLI reference (all mutation commands, for when you need more than render/validate/diff)
- `references/definition.md` — C4 model level definitions (if you need more detail than the summary in Step 5c)
- `apltk codegraph` commands: `init`, `sync`, `status`, `search`, `explore`, `survey`, `list-apis`, `verify`
