# Optimised Skill — Reference Structure

An optimised skill SKILL.md follows this structure:

```
---
name: skill-name
description: One-line summary covering trigger, inputs, and output.
---

## Goal
Core transformation this skill performs + what the downstream consumer receives.

## Acceptance Criteria
Measurable, verifiable items. Every criterion must be checkable by the agent.

## Workflow
Sequential steps. Each step does one thing. No duplicate logic across steps.
- Behavioral guidance only (describes "what to do", not "which CLI flag to use")
- Every input is accounted for, every output is produced
- Self-review is included as the final step

## Examples (optional)
Before/after states showing the transformation the skill performs.

## References
Tool guidance only. No "required reading" files. Each reference is a one-line index.
```

See the main SKILL.md for the complete 7-step optimisation methodology.
