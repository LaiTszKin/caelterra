# Optimised Skill — Reference Structure

An optimised skill SKILL.md follows this structure:

```
---
name: skill-name
description: One-line summary covering trigger, inputs, and output. Include negative triggers (Do NOT use for...).
---

## Goal
Core transformation this skill performs + what the downstream consumer receives.

## Acceptance Criteria
Measurable, verifiable items. Every criterion must be checkable by the agent.

## Core Principles (if applicable)
Mental models or frameworks the agent should apply — not step-by-step scripts.

## Workflow
Phased approach. Each phase does one thing. No duplicate logic across phases.
- Behavioral guidance only (describes "what to do and why", not "which CLI flag to use")
- Every input is accounted for, every output is produced
- Self-review is included as the final step

## Gotchas
Environment-specific facts that break model defaults. Highest-value content per token.
Good: "This API returns 200 on failure — check the body, not status code."
Bad: "Handle errors appropriately."

## References
Tool guidance only. No "required reading" files. Each reference is a one-line index.
```
