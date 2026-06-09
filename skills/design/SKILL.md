---
name: design
description: Reads SPEC.md, validates technical feasibility through web research, finds quality reference implementations, confirms tech stack compatibility, then produces DESIGN.md (architecture design, external dependencies), CHECKLIST.md (verification strategy), Architecture Diff, and design-time refactoring plan. Not for use without a SPEC.md.
---

## Goal

Transform SPEC.md business requirements into a technical design grounded in evidence — verify feasibility, find reference implementations, confirm tech stack compatibility before designing. Identify refactoring opportunities during code survey and classify by module boundary scope (T1–T3).

## Acceptance Criteria

- Three web research passes completed and recorded in DESIGN.md
- CodeGraph survey run on affected modules; findings reflected in design decisions
- T1–T3 refactoring opportunities identified and dispositioned (refactored / scheduled / deferred with rationale)
- DESIGN.md at `docs/plans/<YYYY-MM-DD>/<spec_name>/DESIGN.md` covering all required sections
- CHECKLIST.md produced: behavior-to-test mapping, hardening requirements, test level choices
- `references/` folder populated with external method/API reference documents
- Architecture Diff produced using C4 model hierarchy
- DESIGN.md and CHECKLIST.md References sections cite designed code file paths

## Single vs Batch Specs

- **Single spec**: One SPEC.md file → one DESIGN.md, one CHECKLIST.md, one Architecture Diff, one `references/` folder
- **Batch spec**: Multiple subdirectories each with their own SPEC.md → **one unified** DESIGN.md, CHECKLIST.md, Architecture Diff, and `references/` at the batch root covering all constituent specs. Distill the common goal from all SPEC.md files during ingestion.

## Workflow

### 1. Ingest SPEC.md

Read all SPEC.md files. Understand: business goal, BDD requirements, error/edge cases, uncertainty markers, clarification questions.

### 2. Web Research

Complete three passes before designing. Do deep research to obtain required information.

**2a. Technical Feasibility** — For each requirement, verify feasibility under the current tech stack. Flag high-risk points. Record key limitations.

**⚠️ Decision gate — STOP if blocking issues found:**

| Assessment | Action |
|---|---|
| ✅ All feasible | Continue |
| ⚠️ Partial validation needed | Continue; mark uncertain items as Exploratory; suggest spike/prototype where warranted |
| 🛑 Blocking issues found | **STOP.** Document infeasibility with evidence (API limits, licensing, platform gaps). Request SPEC.md revision. |

This gate is critical: the spec phase validates against existing code only — it does not check external feasibility. This is the pipeline's only chance to catch real-world constraints before design.

**2b. Existing Quality References** — Search for mature open-source solutions, community best practices, officially recommended approaches for similar functionality. Record reusable design patterns.

**2c. Tech Stack Compatibility** — Verify external dependency compatibility: version conflict risks, alternatives comparison, license compatibility.

### 3. CodeGraph Survey & Code Health

**3a. Survey** — `apltk codegraph survey --json` for entry points, function clusters, cross-boundary edges.

**3b. List APIs** — `apltk codegraph list-apis` in affected modules to understand existing contracts and callers.

See `references/codegraph.md` for all flags and subcommands.

**3c. Code Health Assessment** — While reading code, identify smells, dead code, legacy patterns. Classify using the T1–T3 framework (see `references/code-smells.md` for patterns):

| Tier | Scope | Validate with |
|------|-------|---------------|
| T1 | Single function/file; no API change | Existing unit tests |
| T2 | Crosses files within same module | Existing integration tests |
| T3 | Crosses module boundaries | New test coverage (define in CHECKLIST.md) |

T1 items are safe to refactor inline. T2 and T3 feed into the design and task plan.

### 4. Design Architecture → DESIGN.md

Use `assets/templates/DESIGN.md`. Transfer research outputs from Step 2 into the **Research Summary** section. Cover all template sections. Use `Req 1`, `Req 2` numbering matching SPEC.md.

**Scale awareness** — Adapt depth to the change, not every section requires full treatment:

- **Interaction Design**: Write `None` if change is confined to a single module with no new cross-module coupling. Do not fabricate INT-### entries.
- **External Dependency deep-dives**: For simple utility libraries (no quotas, auth, or failure modes), a one-line overview entry suffices.
- **Target vs Baseline**: Single-dimension changes need one row; multi-dimension changes expand.
- **System Invariants**: Write `None` with justification if no architectural constraint changes.
- **Design-Time Refactoring**: Write `None` if no code health issues found. Do not fabricate findings.

**Design self-challenge** — Before finalizing:

1. Is every module necessary, or could the same functionality live inside an existing module?
2. Is this the simplest viable design? Have I introduced abstractions not justified by the requirements?
3. For each major decision, have I considered and explicitly rejected at least one alternative?

### 5. Define Verification Strategy → CHECKLIST.md

Use `assets/templates/CHECKLIST.md`. Use `test-case-strategy` skill to guide test level choices. Cover all template sections.

**Mandatory test coverage** (unless SPEC.md describes only documentation or test changes):

1. **Every new/modified public function** → unit test
2. **Medium-risk paths** (I/O, external deps, state changes) → integration or property-based test
3. **High-risk paths** (cross-module, money, permissions, data consistency) → E2E or integrated PBT

### 6. Generate Architecture Diff

Use `apltk architecture` CLI. See `references/architecture.md` for exact mutation commands and flags.

1. Read existing architecture (affected features only — context economy). Skip baseline if none exists.
2. Check baseline drift — if > 20% entries inconsistent with code, flag risk in diff.
3. Define diff by C4 level (see `references/definition.md`): System Context → Container (features) → Component (submodules) → Code (selective).
4. Trace evidence: requirement → module, research decision → dependency choice.
5. Generate and validate. Two flows:
   - **Classic**: `apltk architecture` commands manually; validate after.
   - **CodeGraph-integrated**: `architecture add` → `codegraph verify` → `architecture diff` for visual confirmation.

### 7. Populate references/ Folder

Create reference documents for every external method and API used in the design:

- **External Methods**: name, purpose, required parameters (with types), source URL
- **External APIs**: name, purpose, request payload structure, authentication, rate limits

This reduces hallucinated API shapes during implementation — workers consult these files instead of guessing.

### 8. Pre-delivery Verification

Run two passes before delivering:

**Completeness**: Research recorded as evidence in DESIGN.md. Every architecture decision has a trade-off record. External API facts traceable to official docs. CHECKLIST.md covers all BDD requirements. Architecture Diff covers full scope. T1–T3 findings dispositioned. `references/` populated. References sections cite code file paths.

**Design quality**:
- Every BDD behavior traces to a module, interaction, data flow, or invariant
- Modules in architecture appear as callers/callees in interaction design
- No unnecessary module, abstraction, or dependency
- All feasibility risks addressed or documented as accepted
- All code health findings accounted for (refactored, scheduled, or deferred with rationale)

## Examples

- "SPEC.md defines real-time messaging" → Research WebSocket vs SSE vs Polling → CodeGraph survey for existing socket infra → Choose SSE → Design architecture → During survey, identify legacy socket wrapper (T2), schedule extraction → Populate references/
- "SPEC.md requires CSV export, no CSV library" → Research Node.js CSV libraries → CodeGraph survey export module boundaries → Choose lightest option → Design export flow → Document CSV API in references/
- "Batch spec: auth-redesign with 3 SPEC.md files" → Read all 3 → Unified research → CodeGraph survey auth modules → Unified DESIGN.md + CHECKLIST.md + Architecture Diff → Identify dead auth middleware (T1), remove with existing test validation

## References

- `assets/templates/DESIGN.md` — DESIGN.md template
- `assets/templates/CHECKLIST.md` — CHECKLIST.md template
- `references/architecture.md` — `apltk architecture` CLI reference
- `references/codegraph.md` — `apltk codegraph` CLI reference
- `references/definition.md` — C4 model level definitions
- `references/code-smells.md` — Code smell patterns to spot during survey
- `references/module-internal-simplification.md` — T1 patterns
- `references/module-internal-restructuring.md` — T2 patterns
- `references/module-boundary-adjustment.md` — T3 patterns
