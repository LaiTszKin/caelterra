---
name: design
description: Reads SPEC.md, validates technical feasibility through web research, finds quality reference implementations, confirms tech stack compatibility, then produces DESIGN.md (architecture design, external dependencies), CHECKLIST.md (verification strategy), Architecture Diff, and design-time refactoring plan. Not for use without a SPEC.md.
---

## Goal

Transform business specifications (SPEC.md) into technical design.
Research first, design second — avoid reinventing wheels and ground every decision in evidence.
During architecture survey, identify and classify refactoring opportunities by module boundary scope — include them as standard design output.

## Acceptance Criteria

- Three web research passes completed and recorded
- `apltk codegraph` survey run on affected modules, with findings recorded
- Brownfield assessment completed: T1–T3 refactoring opportunities identified and dispositioned
- `docs/plans/<YYYY-MM-DD>/<spec_name>/DESIGN.md` produced, covering: architecture design, external dependencies (with API facts and limits), data persistence, invariants, technical trade-offs, design-time refactoring
- `docs/plans/<YYYY-MM-DD>/<spec_name>/CHECKLIST.md` produced, covering: behavior-to-test mapping, hardening requirements, test level choices
- `docs/plans/<YYYY-MM-DD>/<spec_name>/references/` populated with external method/API reference documents (name, purpose, required parameters)
- Architecture Diff produced using the C4 model hierarchy
- DESIGN.md and CHECKLIST.md References sections cite all designed code file paths (not just project context files)
- Design-time refactoring classified by module boundary scope (T1–T3) and dispositioned (refactored / scheduled / deferred with rationale)

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

| Assessment | Action |
|---|---|
| ✅ All feasible | Continue to Step 3 |
| ⚠️ Partial validation needed | Continue, mark uncertain items as Exploratory-level risks; suggest spike/prototype where warranted |
| 🛑 **Blocking issues found** | **STOP.** Do not proceed. Document infeasibility with evidence (API limits, licensing, platform gaps). Request SPEC.md revision |

**Why this gate exists**: The spec phase validates against existing code only — it does not check external feasibility. This is the pipeline's only chance to catch real-world constraints before design. If blocking, escalate before designing.

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

### 3. CodeGraph Survey

Deeply investigate the repo using `apltk codegraph` before designing.

#### 3a. Survey the Project

Run `apltk codegraph survey --json` to get entry points, function clusters, and cross-boundary edges.

Consult `references/codegraph.md` for detailed flags.

#### 3b. List APIs in Affected Areas

Use `apltk codegraph list-apis` to review the full project API directory in the affected modules — function names, file paths, callers. Understand what existing modules and functions the new feature will interact with.

#### 3c. Code Health Assessment

While reading code via codegraph, actively assess code quality:
- Identify code smells, dead code, legacy patterns, and unnecessary complexity in the affected modules
- Classify findings using the T1–T3 framework (see `references/code-smells.md` for patterns to recognize)
- T1 items (module-internal simplification) are safe to refactor immediately — existing tests validate behavioral preservation
- T2 and T3 items feed into the target architecture design

### 4. Read Spec and Design Architecture → DESIGN.md

Based on web research (Step 2) and codegraph findings (Step 3), design the architecture. Use `assets/templates/DESIGN.md`.

#### 4a. Brownfield Assessment

If this is a brownfield change (modifying existing code), design a refactoring plan:
- Identify which existing modules need restructuring to accommodate the new feature
- Classify refactoring by T1–T3 scopes (see `references/code-smells.md`)
- T1: Safe to refactor inline — existing unit tests validate behavior
- T2: Schedule in task decomposition — existing integration tests validate
- T3: Define migration strategy with dedicated test coverage

#### 4b. Fill DESIGN.md

Transfer the research outputs from Steps 2a-2c into the **Research Summary** section of DESIGN.md (feasibility table, reference patterns table, tech stack compatibility table).

Cover the following sections:
- **Research Summary**: Feasibility per requirement, existing references, tech stack compatibility (from Step 2)
- **Architecture Overview**: Module list with responsibilities, entry points, trust boundary, target vs baseline comparison
- **Interaction Design**: Module call relationships, coupling patterns (route / RPC / event / sync), failure propagation, ordering constraints
- **External Dependencies**: API facts, limits and failure modes, security and keys
- **Data Persistence**: Storage resources, consistency expectations
- **System Invariants**: Architectural constraints that must not be violated, plus violation symptoms
- **Technical Trade-offs**: Each decision with rejected alternatives and lock-in effects
- **Design-Time Refactoring**: T1–T3 code health findings classified and dispositioned
- **References**: List designed code file paths, project context files, and related documents

Use `Req 1`, `Req 2` numbering to reference SPEC.md requirements (matching the SPEC.md template's `Requirement 1`, `Requirement 2`).

**Scale awareness** — Not every section applies at full depth. Adapt based on the change's scope:

- **Interaction Design**: If the change is confined to a single module with no new cross-module coupling, mark this section as `None`. Do not fabricate INT-### entries.
- **External Dependency deep-dives**: For simple utility libraries (e.g., date formatting, UUID generation) with no API quotas, authentication, or failure modes, skip the sub-tables. A one-line entry in the overview suffices.
- **Target vs Baseline**: If the change touches multiple dimensions (new modules, removed modules, ownership shifts, deployment changes), expand to multiple rows. A single-dimension change needs only one row.
- **System Invariants**: If the change does not modify any architectural constraint, explicitly write `None` with brief justification.
- **Design-Time Refactoring**: If no code health issues were identified during the architecture survey, write `None`. Do not fabricate findings.

**Design self-challenge** — Before finalizing the design, step back and ask three questions:

1. **Is every module necessary?** Could the same functionality live inside an existing module without adding a new one? Unnecessary modules increase cognitive load and maintenance cost.
2. **Is this the simplest viable design?** Have I introduced abstractions, indirections, or intermediate layers that are not justified by the current requirements? Prefer the simplest structure that works.
3. **Are there rejected alternatives?** For every major architectural decision (module split, dependency choice, communication pattern), if you have not considered and explicitly rejected at least one alternative, you may be settling on the first workable solution rather than the best one.

**Single spec**: Produce one DESIGN.md for one SPEC.md.
**Batch spec**: Produce **one** unified DESIGN.md covering the scope of all SPEC.md files in the batch.

### 5. Define Verification Strategy → CHECKLIST.md

Use the `test-case-strategy` skill to design the verification strategy.
Use `assets/templates/CHECKLIST.md`.

The CHECKLIST.md defines the **test plan** — it maps SPEC.md requirements to tests, defines hardening requirements, and records test-level decisions.

Cover the following sections:
- **Behavior-to-Test Checklist**: Each BDD requirement mapped to one or more tests
- **Hardening Requirements**: Regression tests, drift checks, property-based tests, edge cases, authorization checks
- **E2E / Integration Decisions**: Per flow, choose the appropriate test level with rationale
- **Design-Time Refactoring (T3)**: If T3 refactoring is planned, define its test coverage requirements here
- **References**: List designed code file paths, project context files, and related documents

**Mandatory test coverage** (applies when the SPEC.md describes changes other than pure documentation or pure test changes):

1. **Every function must have a unit test** — each new or modified public function (including helpers and utilities) must have a corresponding unit test case
2. **All medium-risk business paths must have integration or property-based tests** — prefer property-based testing (PBT) when applicable; otherwise use integration tests
3. **All high-risk paths must have end-to-end or integrated PBT** — cross-module core business flows must be validated through E2E tests or integrated property-based tests

Risk definitions: **Medium risk** = paths involving I/O, external dependencies, or state changes; **High risk** = paths crossing multiple modules, or involving money, permissions, or data consistency.

**Single spec**: Produce one CHECKLIST.md for one SPEC.md.
**Batch spec**: Produce **one** unified CHECKLIST.md covering the behavioral requirements of all SPEC.md files in the batch.

### 6. Generate Architecture Diff

Use the `apltk architecture` CLI tool to generate the Architecture Diff, following the C4 model hierarchy.

#### 6a. Read the Existing Architecture

Read the project's existing architecture files (`resources/project-architecture/atlas/atlas.index.yaml` + the affected feature YAML files).
Do not read unrelated features or modules — maintain context economy.

If no existing architecture exists, skip the baseline comparison and start defining the boundary from System Context level.

#### 6b. Measure Baseline Drift

Compare the existing architecture diagram against the current code to assess its reliability:
- If the baseline atlas differs significantly from the code (> 20% entries inconsistent), flag the risk in the architecture diff
- If the baseline atlas is reliable, the diff can be layered directly on top of it

#### 6c. Define the Diff by C4 Level

1. **System Context**: Define external actors, system boundaries, cross-system edges
2. **Container level** (features): Define new or modified features and the edges between them
3. **Component level** (submodules): Define functions, variables, dataflows, and error rows within each submodule
4. **Code level** (selective): Only supplement function-level details for critical paths

C4 level mapping: System Context → system boundary, Container → feature, Component → submodule, Code → function (selective). See `references/definition.md` for full definitions.

#### 6d. Evidence Tracing

Each component should link to:
- The requirement number from SPEC.md (requirement → module)
- The technical decision from research findings (decision → dependency choice)

#### 6e. Generate the Diff and Validate

Two alternative workflows — use the **Classic flow** when `codegraph` is not installed, or the **CodeGraph-integrated flow** when it is available.

**Classic flow** (manual):
Generate and validate the architecture diff using `apltk architecture` commands. Confirm validation passes, then produce a visual comparison. See `references/architecture.md` for all CLI flags.

**CodeGraph-integrated flow:**

1. **Define the architecture** — Based on design decisions from steps 6a–6d, use `apltk architecture add` to define the feature, its submodules, their functions, and cross-feature edges.

2. **Apply and verify** — Apply the mutations and verify correctness:
   - Use `apltk architecture add` to create entities and relationships
   - `apltk codegraph verify` confirms every symbol and edge reference exists in actual code

3. **Render diff** (optional) — `apltk architecture diff` for visual confirmation of all pending spec overlays.

See `references/architecture.md` for exact CLI flags and mutation commands.

**Single spec**: Produce one Architecture Diff for one SPEC.md.
**Batch spec**: Produce **one** unified Architecture Diff covering all SPEC.md files in the batch.

### 7. Populate references/ Folder

Under `<spec_dir>/references/` (single spec) or `<batch_dir>/references/` (batch spec), create reference documents for every external method and API used in the design:

#### External Methods

For each external method referenced in the design, document:
- **Method name**: The method or function name
- **Purpose**: What it does, why it is needed
- **Required parameters**: Input parameters with types and descriptions
- **Source**: Where this method is documented (URL or code path)

#### External APIs

For each external API referenced in the design, document:
- **API name**: The API or service name
- **Purpose**: What it does, why it is needed
- **Required parameters**: Request payload structure, query parameters, headers
- **Authentication**: How to authenticate (key location, scope)
- **Rate limits / quotas**: Documented limits

**Why this step exists**: Explicit external method/API reference documentation reduces the chance of hallucinated code during implementation. Workers and coordinators can consult these files instead of guessing API shapes.

### 8. Pre-delivery Verification

Before delivering, run two passes — completeness then quality.

#### Completeness checks (documentation integrity)

- Research results are recorded in DESIGN.md as evidence for technical decisions
- Every architecture decision has a trade-off record (rejected alternatives + lock-in effects)
- External dependency API facts are traceable to official documentation
- CHECKLIST.md completely covers all BDD requirements from SPEC.md
- Architecture Diff covers the full change scope
- Design-time refactoring is documented in DESIGN.md with T1–T3 findings classified and dispositioned
- `references/` folder exists with external method and API reference documents
- DESIGN.md and CHECKLIST.md References sections cite designed code file paths

#### Design quality checks (architectural soundness)

- **Requirement traceability**: Can every BDD behavior from SPEC.md be traced to a module, interaction, data flow, or invariant in this design?
- **Internal consistency**: Do the modules listed in the architecture appear as callers or callees in the interaction design? Do the dependencies correspond to module responsibilities?
- **Design simplicity**: Is this the simplest design that satisfies all requirements? Could any module, abstraction, or dependency be removed without breaking functionality?
- **Risk transparency**: Are all feasibility risks, compatibility concerns, or uncertain technical points either addressed in the design or explicitly documented as accepted risks?
- **Refactoring disposition**: Are all identified code health findings accounted for — either refactored, scheduled in the task plan, or explicitly deferred with rationale?

## Examples

- "SPEC.md defines a real-time messaging feature" → Research WebSocket vs SSE vs Polling → CodeGraph survey to find existing socket infrastructure → Confirm compatibility → Choose SSE → Design architecture → Produce DESIGN.md + CHECKLIST.md + Architecture Diff → During code survey, identify legacy socket wrapper (T2) → schedule extraction in task plan → Populate references/ with external API docs
- "SPEC.md requires CSV export, repo has no CSV library" → Research Node.js CSV libraries (json2csv vs csv-writer vs papaparse) → CodeGraph survey to understand export module boundaries → Confirm compatibility → Choose the lightest option → Design export flow architecture → Document CSV library API in references/
- "Batch spec: docs/plans/2026-05-29/auth-redesign/ with 3 SPEC.md files (login, permissions, 2FA)" → Read all 3 SPEC.md files → Unified research → CodeGraph survey of auth modules → Unified DESIGN.md + CHECKLIST.md + Architecture Diff → Brownfield assessment: identify dead auth middleware during survey (T1) → remove and verify with existing tests → Populate references/ with auth API docs

## References

- `assets/templates/DESIGN.md` — DESIGN.md template
- `assets/templates/CHECKLIST.md` — CHECKLIST.md template
- `references/architecture.md` — `apltk architecture` CLI reference (all mutation commands)
- `references/codegraph.md` — `apltk codegraph` CLI reference (consult for subcommand flags)
- `references/definition.md` — C4 model level definitions
- `references/code-smells.md` — Common code smell patterns to spot during architecture survey
- `references/module-internal-simplification.md` — T1: module-internal simplification patterns
- `references/module-internal-restructuring.md` — T2: module-internal restructuring patterns
- `references/module-boundary-adjustment.md` — T3: module boundary adjustment patterns
