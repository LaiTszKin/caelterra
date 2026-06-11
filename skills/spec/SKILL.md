---
name: spec
description: Transforms user requirements into strictly-scoped business specification documents (SPEC.md). Deeply explores the codebase to calibrate every requirement against actual code. Produces batch specs when requirements exceed 5 BDD items. Not for discussion without PROPOSAL.md, nor for single-file changes that don't need a spec.
---

## Goal

Transform user requirements into pure business specifications (SPEC.md). Answer only "what business goal to achieve" and "what is in/out of scope" — no technical implementation. Ground every requirement's scope in the actual repository state through CodeGraph-assisted exploration.

Technical architecture belongs to `design`. Execution methodology belongs to `plan`.

## Acceptance Criteria

- SPEC.md follows `assets/templates/SPEC.md` with all sections populated
- References cite key code file paths affected by each requirement
- Exploratory requirements are marked with Uncertainty Level and have Clarification Questions in enriched format (background, impact, recommendation)
- Non-greenfield repos: CodeGraph exploration completed, boundary decisions reference actual code
- Work started on a dedicated branch (`feature/<spec-name>` or similar)
- Output at `docs/plans/<YYYY-MM-DD>/<spec_name>/SPEC.md` (single) or `docs/plans/<YYYY-MM-DD>/<batch-name>/<spec_name>/SPEC.md` (batch)

## Workflow

### 1. Explore Repo with CodeGraph

**Greenfield repo (no code)**: Skip to Step 2.

**Non-greenfield**: Establish code-level understanding BEFORE reading requirements. Run `apltk codegraph --help` then `apltk codegraph <subcommand> --help`. Use the live help output to pick suitable commands for files, symbols, callers/callees, context, or impact analysis. Record findings that affect requirement scope.

### 2. Read PROPOSAL.md and Understand Requirements

Analyze requirements from PROPOSAL.md. Compare CodeGraph findings against what PROPOSAL.md describes — if actual code contradicts or constrains the proposal, note these calibrations explicitly.

Deeply explore the codebase for:
- Affected modules and responsibility boundaries
- Existing data structures, persistence patterns, API contracts, and call relationships
- Features that overlap or conflict with the requirements

### 3. Refine Requirements into BDD

Transform requirements into GIVEN/WHEN/THEN BDD items scoped against codegraph findings:

- **Refine**: Convert vague descriptions into precise behavior statements
- **Combine**: Merge related requirements to avoid fragmentation
- **Split**: Separate oversized requirements into independently verifiable items

**Batch threshold**: ≤ 5 BDD items → single SPEC.md. > 5 → group by business flow or user role, 3-5 related items per subdirectory, each with its own SPEC.md.

For each requirement, assess **Uncertainty Level**:
- **Known**: Team has experience; low risk
- **Exploratory**: Team is unfamiliar or depends on external systems; high risk. Must produce Clarification Questions; suggest spike/prototype if warranted.

Define **Error and Edge Cases** covering: authorization boundaries, data boundaries (input length, type, format, uniqueness), external dependency anomalies (API failure, timeout, degraded response), abuse/invalid state transitions, and failure handling.

If a requirement remains unclear after research and affects scope, record it for the Clarification Questions section — do not proceed without user input.

### 4. Create Branch

Before generating files, check the current git branch. If on `main`, `master`, `develop`, or any non-dedicated branch:
- Derive branch type prefix from work nature (`feature`, `refactor`, `fix`, `chore`)
- Derive a kebab-case name from the spec/feature name
- Run `git checkout -b <type>/<kebab-case-name>`

### 5. Generate SPEC.md

Run `apltk create-specs --help` first, then:
```
apltk create-specs <feature_name> [--batch-name <name>]
```
See `references/create-specs.md` for all flags.

Fill each section according to `assets/templates/SPEC.md`. Each BDD block must be independently testable with an observable THEN outcome. For batch specs, repeat template-filling per group.

### 6. Clarification Questions (Enriched Format)

For every Exploratory requirement or significant ambiguity, present Clarification Questions to the user. **Each question must include:**

- **Background**: Why this question exists — what's uncertain, what code or constraint triggered it, what context the user may lack
- **Impact**: How the user's choice affects requirements scope, downstream design decisions, or implementation complexity
- **Recommendation**: The agent's suggested direction

**Before writing the recommendation, the agent must:**
1. Self-ask: *What option am I considering recommending?*
2. Self-ask: *What are the benefits and drawbacks of this option?*
3. Self-ask: *Is there a better alternative?* If yes, adopt the best one as the recommendation.

Only omit Clarification Questions when all requirements are Known and unambiguous.

### 7. Pre-delivery Verification

Check each item before delivering. Fix any issues found.

- **BDD verifiability**: Every THEN is observable and specific. Each requirement has a clear verification condition independent of others.
- **Business-value clarity**: Each requirement states business value, not implementation detail.
- **Scope clarity**: In/Out of Scope are unambiguous with no overlap.
- **Error case completeness**: All five categories (authorization, data boundaries, dependency anomalies, abuse, failure handling) are substantively covered with specific cases — not just category labels.
- **Uncertainty reflected**: Exploratory requirements have corresponding Clarification Questions. Spike/prototype suggested when warranted.
- **Internal consistency**: No contradictions or overlaps between requirements.
- **Code traceability**: References cite specific code file paths. Boundary decisions reference CodeGraph findings where applicable.
- **CQ enrichment**: Each Clarification Question includes background context, impact analysis, and agent recommendation.

## Examples

- "Build a Texas Hold'em game" → CodeGraph survey for existing game engine → 4 BDD items → single SPEC.md → References cite game engine paths
- "Rewrite user system: register, login, permissions, password reset, 2FA, sessions" → CodeGraph survey auth modules → 6 BDD items → batch spec: Auth (3 items) + Security (3 items) → References cite auth module paths

## References

- `assets/templates/SPEC.md` — SPEC.md output format
- `references/create-specs.md` — `apltk create-specs` CLI reference
