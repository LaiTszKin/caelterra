---
name: discuss
description: Helps users clarify vague requirements through structured conversation, producing a high-level design (PROPOSAL.md) with requirement summaries. Does not read any repo files — relies entirely on conversation. Suitable for requirement discussions, feature ideation, or greenfield project planning.
---

## Goal

Help users transform vague ideas into a structured high-level design. Assume the user has no technical background — use plain language to surface ambiguities, contradictions, and missing details. **Do not read any repo files** — base everything solely on the conversation.

**Core deliverable: PROPOSAL.md**, covering: scope (in/out), user scenarios, constraints, business value, requirement summaries, and open questions. Define only "what" and "why" — no technical implementation.

## Acceptance Criteria

- All ambiguous points identified and clarified through conversation
- No unverified assumptions or guesses remain in the stated requirements
- PROPOSAL.md covers all required dimensions with no internal contradictions
- User explicitly confirms they have no remaining questions
- Work started on a `feature/<topic>` branch

## Workflow

### 1. Receive and Paraphrase

Paraphrase your understanding in plain language to confirm you haven't fundamentally misunderstood. If the description contains multiple independent directions, ask the user to prioritize one.

### 2. Structured Clarification (Round-based)

Ask questions across four dimensions in priority order. **Limit: 1-3 questions per round.** Complete one dimension before moving to the next.

**Dimension 1: Scope** (highest priority) — What to build, what not to build, boundaries.

**Dimension 2: User Scenarios** — Who uses it, how, typical flows, success/failure definitions.

**Dimension 3: Constraints** — Timeline, budget, region, legal/security, data sensitivity.

**Dimension 4: Business Value** — Problem solved, beneficiaries, why existing solutions aren't enough, success metrics.

**Per-round rules:**
- Each question must include **2-4 concrete options + a recommendation + rationale**. Let the user choose or confirm, not answer from scratch.
- Skip dimensions already sufficiently clear.
- Only ask what's directly relevant to the current dimension.

### 3. Behavioral Rules (Always Active)

1. **No guessing** — Any information you cannot 100% confirm from the user must be asked. Even "obvious" things.
2. **Always provide defaults** — Every question includes a recommended option with rationale. This primes thinking, not decides.
3. **No repo reading** — All content comes exclusively from the conversation.
4. **Distinguish "must ask" from "decide later"** — Business scope, scenarios, constraints, success criteria → ask now. Technical implementation, code structure, library choices → later phases.
5. **Challenge necessity** — When the user describes a feature, ask: "Is this necessary? Is there a simpler way?" (YAGNI + KISS, in plain language).
6. **Detect contradictions** — Flag contradictions immediately. Do not let them accumulate.

### 4. Summarize Requirements

After completing all four dimensions, distill the conversation into **3-7 requirement summary areas**. Each area is a one-sentence description of what the user wants — plain language, no technical jargon, no module design. Group related needs together so anyone can understand the scope at a glance.

This becomes the **Requirement Summary** section of PROPOSAL.md, consumed by the `spec` skill.

### 5. Ensure Dedicated Branch (Before File Creation)

Before generating the file, check the current git branch. If on `main`, `master`, `develop`, or any non-dedicated branch:
1. Derive the branch type prefix from the work's nature (e.g., `feature` for new capabilities, `refactor` for restructuring, `fix` for bug fixes, `chore` for maintenance)
2. Derive a kebab-case name from the converged topic
3. Run `git checkout -b <type>/<kebab-case-name>`
4. Confirm the branch was created before proceeding

### 6. Termination and PROPOSAL.md Generation

Continue rounds until: all relevant dimensions covered, no contradictions remain, user explicitly confirms "that's enough."

Generate PROPOSAL.md using `assets/templates/PROPOSAL.md` at:
`docs/plans/{YYYY-MM-DD}/{feature_name}/PROPOSAL.md`

### 7. Optional Handoff

After generating PROPOSAL.md, ask: "Would you like me to pass this to the `spec` skill to transform it into formal business requirement documents (SPEC.md)?" If agreed, invoke `spec` with the PROPOSAL.md path.

## Examples

- "I want to build a budgeting app" → Paraphrase → Scope (personal or multi-user? Sync?) → Scenarios (who? mobile or desktop?) → Constraints (online required? storage?) → `docs/plans/2026-01-15/personal-finance-app/PROPOSAL.md`
- "Improve my company website's performance" → Paraphrase → Scope (which pages? concurrent users?) → Challenge necessity (measured bottleneck, or feeling?) → Constraints (budget, timeline?) → PROPOSAL.md
- "Build something like Uber" → Paraphrase → Scope first (full app or specific features?) → Challenge KISS → Full dimension scan → PROPOSAL.md

## References

- `assets/templates/PROPOSAL.md` — PROPOSAL.md template
