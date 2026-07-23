# Subagent Prompt Self-Containment

## Problem

When a skill instructs the orchestrator to spawn subagents via
`terminal(command="hermes chat -q '<prompt>'", ...)`, the subagent
receives only the injected prompt text. It has **no access** to the
orchestrator's SKILL.md, templates, or reference files.

Cross-references that assume shared context break silently because the subagent
hallucinates plausible content that passes all verification checks but is
wrong.

## Concrete Example (from `simplify` skill)

### Before (broken)

The orchestrator's SKILL.md defined risk tiers in a `## Risk Tiers` section.
The subagent prompt referenced it:

```
PHASE 2 — Identify (do NOT apply yet):
Classify every finding by the Risk Tiers table above. Work systemically:
```

The subagent never saw "the Risk Tiers table above" because it was not in the
injected prompt. Result: the subagent guessed risk tier boundaries.

### After (fixed)

The risk tier definitions are embedded directly into the subagent prompt:

```
PHASE 2 — Identify (do NOT apply yet):
Classify every finding into one of three risk tiers:

SAFE — proven not to affect behaviour. Examples: unused imports, dead code
(git-blame confirmed), redundant comments, pass-through wrappers, unnecessary
type casts. STRATEGY: apply all at once, verify once.

CAREFUL — improves clarity without changing semantics. Examples: flatten
nested conditions with guard clauses, rename ambiguous locals, extract helper
from ≥2 duplicates, replace deep ternaries with if/else. STRATEGY: apply ONE
at a time, verify after each, revert any that break.

RISKY — may affect behaviour or public contracts. Examples: public API renames,
concurrency restructuring, error-handling changes, architectural abstraction
removal. STRATEGY: DO NOT APPLY — document for human review only.

Work through these categories:
```

## Detection Pattern

During Check B (Simulated Execution), ask for each subagent prompt:

- Does it reference "above", "below", "earlier", or "as described"?
- Does it reference a section name that exists only in the orchestrator's SKILL.md?
- Does it say "see references/X.md" or "load the template"?
- Does it refer to tables, checklists, or formats not inline in the prompt?

If yes to any: **embed the referenced content directly in the prompt**, or
have the orchestrator pipe the file content into the prompt with `cat`.
