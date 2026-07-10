---
name: {{skill-name}}
description: >
  TODO: Write a one-line description with concrete trigger phrases and
  negative triggers. See references/degrees-of-freedom.md and
  references/anti-patterns.md for guidance.
  Use when the user wants to ...
  Do NOT use for ...
---

# {{Skill Name}}

## Goal

TODO: What does this skill produce? Who consumes the output?

## Acceptance Criteria

- TODO: Measurable, verifiable items
- Every criterion must be checkable by the agent running this skill

## Workflow

### Phase 1: ...

Step-by-step instructions here.

- Behavioural guidance only (describes *what* to do and *why*, not which
  exact CLI flag to use)
- Every input accounted for, every output produced
- Self-review included as the final step

### Phase 2: ...

...

## Gotchas

- Environment-specific facts that break model defaults go here.
- These are the highest-value content per token.
- Good: "This API returns HTTP 200 even on failure — check the response body,
  not the status code."
- Bad: "Handle errors appropriately."

## References

- `references/...` — TODO: One-line description, loaded conditionally

## Scripts

- `scripts/...` — TODO: What this script does, how to invoke it
