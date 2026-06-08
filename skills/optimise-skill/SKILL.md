---
name: optimise-skill
description: Analyzes SKILL.md and supporting files, then produces an optimized rewrite that is clearer, more concise, and gives the agent more freedom to adapt.
---

## Goal

Analyze a skill's full directory and produce an optimized rewrite. The goal is not to change what the skill does — it's to make the skill easier for an LLM to understand and execute effectively, by removing redundancy, separating concerns, and replacing rigid instructions with guiding principles.

## Acceptance Criteria

- The skill's core deliverable and workflow are preserved unchanged
- Behavioral guidance (what to do, how to think) lives in SKILL.md only — not in templates or reference files
- Templates contain format-only content — the structure of the output, not instructions on how to fill it
- Reference files are optional lookup — tool flags, API parameters — never marked as required reading
- Token count is reduced compared to the original (fewer sections, less repetition)
- Every workflow step serves a distinct purpose — no overlapping or duplicate steps
- All cross-file references remain valid after changes

## Core Principle: Three-Layer Separation

A well-structured skill separates three distinct concerns:

| Layer | What it contains | Where it lives |
|---|---|---|
| **Behavioral** | How to think, what to check, what principles to follow | SKILL.md |
| **Format** | What the output structure looks like | Template files |
| **Tool** | CLI flags, API params, external commands | Reference files |

The most common problem in unoptimized skills is mixing these layers — templates that tell the agent what to do, SKILL.md that describes output formats, references that contain behavioral rules. Your job is to untangle them.

## Approach

### 1. Read and Map

Read the full skill directory — SKILL.md, templates, references. Before you can optimize, understand:

- **What does this skill produce** and who consumes it?
- **What does it read** from upstream stages?
- **Which parts actually get used** downstream vs which are decorative?

### 2. Classify and Untangle

Go through every section across all files and classify it as behavioral, format, or tool guidance. When you find content in the wrong layer, move it:

- **Behavioral content in templates** → move to SKILL.md, leave only the format skeleton
- **Behavioral content in references** → move to SKILL.md, or remove if already covered
- **Format content in SKILL.md** → keep lightweight description, move details to template
- **Tool content in SKILL.md** → move to references/

The key question: *"If I removed this file, what would the agent lose?"* If the answer is "behavioral guidance," that content belongs in SKILL.md. If it's "structure to fill," it belongs in a template. "CLI flags to look up" belongs in references.

### 3. Trace Consumption

For each field, section, and table in the skill's output (template), ask who actually reads it downstream. Prune what nobody consumes:

- Tables that duplicate information expressed elsewhere (e.g., an ASCII dependency graph alongside structured `Depends on` fields)
- Columns that are "nice to have" but never referenced by downstream skills
- Key-value pairs that would be clearer and shorter as natural language
- Speculative fields that ask for predictions or guesses

### 4. Eliminate Contradictions

Compare closely related rules across files. Contradictions confuse agents. Look for:

- Same rule expressed with different wording in SKILL.md vs a template
- Downstream skill assuming a structure that upstream changed
- Two steps in the workflow that overlap in purpose or decision logic

### 5. Restructure SKILL.md for Clarity

After untangling, restructure SKILL.md so it guides the agent's thinking rather than scripting every keystroke:

**Good:** "Define error recovery rules that fit the specific task. Think through retry limits, escalation paths, and what happens mid-batch. The ALWAYS / ASK FIRST / NEVER framework is one useful structure — adapt it as needed."

**Avoid:** "Error Recovery: Worker fails → retry once. Fails again → pause. Merge conflict → coordinator resolves."

The former teaches the agent a thought process. The latter gives it text to copy-paste, which is brittle and task-specific.

Principles for writing guidance:
- **Teach concepts, not steps** — explain the *why*, not just the *what*
- **Provide frameworks, not scripts** — offer mental models the agent can adapt
- **Ask questions** — prompt the agent to think ("What should happen when a worker fails? What's the right retry policy for this kind of task?")
- **Describe outcomes, not methods** — "verify every issue is resolved" not "run command X and check for Y"

### 6. Verify Consistency

Before delivering, confirm:

- Every file referenced by downstream consumers still exists with the expected fields
- Section names and file paths referenced across files are still valid
- No contradictions between SKILL.md and templates
- No behavioral guidance leaked into templates during restructuring

### 7. Self-Check

- [ ] Core deliverable preserved (run the skill's original examples mentally — same inputs produce same outputs)
- [ ] No behavioral guidance in templates — templates show structure only
- [ ] No references marked as required reading
- [ ] Token count and section count reduced from original
- [ ] No duplicate or overlapping steps in the workflow
- [ ] Cross-file references all valid

## References

- `references/example_skill.md` — Example of optimized skill structure (optional reference)
