---
name: spec
description: Transforms user requirements into strictly-scoped business specification documents (SPEC.md). Deeply explores the codebase to calibrate every requirement against actual code. Produces batch specs when requirements exceed 5 BDD items. Not for discussion without PROPOSAL.md, nor for single-file changes that don't need a spec.
---

## Goal

Transform user requirements into pure business specifications (SPEC.md). Answer only "what business goal to achieve" and "what is in/out of scope" — no technical implementation. Ground every requirement's scope and boundary in the actual repository state through CodeGraph-assisted exploration.

Technical architecture belongs to `design`. Execution methodology belongs to `plan`.

## Acceptance Criteria

- SPEC.md follows the template format: business goal, scope (In/Out), BDD behaviors, error/edge cases, clarification questions
- References section cites key code file paths affected by the requirements
- High-uncertainty requirements marked with Uncertainty Level and reflected in Clarification Questions
- For non-greenfield repos: CodeGraph-assisted repo exploration completed, every requirement's boundary calibrated against actual code
- Work started on a `feature/<spec-name>` branch
- Output at `docs/plans/<YYYY-MM-DD>/<spec_name>/SPEC.md` (single) or `docs/plans/<YYYY-MM-DD>/<batch-name>/<spec_name>/SPEC.md` (batch)

## Workflow

### 1. Explore the Repo with CodeGraph

**Greenfield repo (no existing code)**: Skip to Step 2.

**Non-greenfield repo**: Establish code-level understanding of module boundaries, existing APIs, and data structures BEFORE reading requirements. This ensures every BDD requirement is scoped correctly against real code.

Before choosing commands, run `apltk codegraph --help` and `apltk codegraph <subcommand> --help`. Use the live help output to pick suitable exploration commands for files, symbols, callers/callees, context, or impact analysis. Record findings that affect requirement scope.

### 2. Read PROPOSAL.md and Understand Requirements

Analyze the user's requirements from PROPOSAL.md. Compare CodeGraph findings against what PROPOSAL.md describes — if actual code contradicts or constrains the proposal, note these calibrations explicitly.

Deeply explore the codebase to find relevant code:
- Affected modules and responsibility boundaries
- Existing data structures and persistence patterns
- Existing API contracts and call relationships
- Features that overlap or conflict with the requirements

### 3. Refine Requirements into BDD

Transform requirements into GIVEN/WHEN/THEN BDD items. Use codegraph findings to correctly scope each one.

- **Refine**: Convert vague descriptions into precise BDD behavior statements
- **Combine**: Merge related requirements to avoid fragmentation
- **Split**: Separate oversized requirements into independently verifiable items

**Output structure**: ≤ 5 BDD items → single SPEC.md. > 5 BDD items → batch spec with one subdirectory per 3-5 related requirements, each with its own SPEC.md. Group by business flow or user role. Coordination is defined later in the `plan` phase.

For each requirement, mark **Uncertainty Level**:
- **Known**: Team has experience; low risk
- **Exploratory**: Team is unfamiliar or depends on external systems; high risk. Must be reflected in Clarification Questions; suggest spike/prototype if warranted.

Define **Error and Edge Cases** covering five categories: authorization boundaries, data boundaries (input length, type, uniqueness, format), external dependency anomalies (API failure, timeout, degraded response), abuse/invalid state transitions, and failure handling.

If a requirement remains unclear after research and affects scope, record it and wait for the user's answer before proceeding.

### 4. Ensure Dedicated Branch (Before File Creation)

Before generating the file, check the current git branch. If on `main`, `master`, `develop`, or any non-dedicated branch:
1. Derive the branch type prefix from the work's nature (e.g., `feature` for new capabilities, `refactor` for restructuring, `fix` for bug fixes, `chore` for maintenance)
2. Derive a kebab-case name from the spec/feature name
3. Run `git checkout -b <type>/<kebab-case-name>`
4. Confirm the branch was created before proceeding

### 5. Generate SPEC.md

Use `assets/templates/SPEC.md`. Before creating files, run `apltk create-specs --help` and follow the live CLI guidance. Create structure with:
```
apltk create-specs <feature_name> [--batch-name <name>]
```
See `references/create-specs.md` for all flags.

Fill each section:
- **Goal** → One sentence: business goal, not implementation
- **Scope (In/Out)** → From Step 3. Be precise — ambiguous boundaries cause scope creep
- **Functional Behaviors** → One BDD block per requirement. GIVEN states precondition/role, WHEN describes trigger, THEN describes an observable verifiable outcome. Each requirement must be independently testable. No technical implementation details.
- **Uncertainty Level** → Known or Exploratory per requirement
- **Error and Edge Cases** → Free-form list of specific cases (the five categories guide your thinking, not the output format)
- **Clarification Questions** → Required when any requirement is Exploratory. Omit only if all requirements are Known and unambiguous.
- **References** → Code file paths affected by requirements (traceability anchors), project context files, official docs

For batch specs, repeat template-filling per group.

### 5. Pre-delivery Verification

Verify all of the following before delivering. Fix any issues found.

- **BDD verifiability**: Every THEN is observable and specific, not vague. Each requirement has a clear verification condition independent of other requirements.
- **Business-value clarity**: Each requirement states business value, not technical implementation detail.
- **Scope clarity**: In/Out of Scope are unambiguous and do not overlap.
- **Error case completeness**: All five categories from Step 3 are substantively covered (individual cases, not category names). Authorization boundaries, data boundaries, external anomalies, abuse scenarios, and failure handling are all addressed.
- **Uncertainty reflected**: Exploratory requirements appear in Clarification Questions. Spike/prototype suggested where warranted.
- **Internal consistency**: No contradictions or overlaps between requirements.
- **Code traceability**: References cite specific code file paths mapping to each requirement. Boundary scoping decisions reference CodeGraph findings.

## Examples

- "Build a Texas Hold'em game" → CodeGraph survey for existing game engine → 4 BDD items → single SPEC.md → References cite game engine paths
- "Rewrite user system: register, login, permissions, password reset, 2FA, sessions" → CodeGraph survey auth modules → 6 BDD items → batch spec: Auth spec (3 items) + Security spec (3 items) → References cite auth module paths

## References

- `assets/templates/SPEC.md` — SPEC.md template
- `references/create-specs.md` — `apltk create-specs` CLI reference
