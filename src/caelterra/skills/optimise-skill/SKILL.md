---
name: optimise-skill
description: Audits and rewrites Agent Skills (SKILL.md + supporting files) for clarity, token efficiency, and progressive disclosure. Use when the user asks to optimize, improve, review, or clean up a skill. Do NOT use for creating new skills from scratch or for editing files that are not part of a skill directory.
---

## Goal

Analyze a skill's full directory and produce an optimized rewrite. The goal is not to change what the skill does — it's to make the skill easier for an LLM to understand and execute effectively, by removing redundancy, separating concerns, and replacing rigid instructions with guiding principles. Every change must be gated by verification.

## Acceptance Criteria

- The skill's core deliverable and workflow are preserved unchanged
- Description (frontmatter) includes negative triggers — "Do NOT use for..."
- Behavioral guidance lives in SKILL.md only — not in templates or reference files
- Templates contain format-only content — the structure of the output, not instructions on how to fill it
- Reference files are optional lookup — never marked as required reading
- Token count is reduced compared to the original
- Every workflow step serves a distinct purpose — no overlapping or duplicate steps
- All cross-file references remain valid
- Optimized skill passes simulated execution without the agent guessing or hallucinating
- A "## Gotchas" section captures environment-specific facts that break model defaults

## Core Principle: Three-Layer Separation

A well-structured skill separates three distinct concerns:

| Layer          | What it contains                                       | Where it lives  |
| -------------- | ------------------------------------------------------ | --------------- |
| **Behavioral** | How to think, what to check, what principles to follow | SKILL.md        |
| **Format**     | What the output structure looks like                   | Template files  |
| **Tool**       | CLI flags, API params, external commands               | Reference files |

The most common problem in unoptimized skills is mixing these layers — templates that tell the agent what to do, SKILL.md that describes output formats, references that contain behavioral rules. Your job is to untangle them.

---

## Phase 1: Audit & Map

### Step 1 — Read and Map

Read the full skill directory — SKILL.md, templates, references. Before optimizing, understand:

- **What does this skill produce** and who consumes it downstream?
- **What does it read** from upstream stages?
- **Which parts actually get used** downstream vs which are decorative?

### Step 2 — Audit the Description

The description in YAML frontmatter is the **only metadata the agent uses** to decide whether to load this skill. If it's wrong, the skill is invisible.

Check the existing description against these criteria:

- **Specific enough to avoid false triggers?** If the description would also match unrelated tasks, tighten it.
- **Includes negative triggers?** Add "Do NOT use for X, Y, Z" to prevent over-triggering.
- **Uses third-person imperative?** Describe what the skill does, not what the user does. "Audits and rewrites..." not "You should use this when..."
- **Under 1,024 characters?** Shorter descriptions route more reliably.
- **Uses concrete trigger keywords?** Include words the user would actually say.

If the description fails any criterion, rewrite it. This is the highest-leverage single change you can make to a skill — a bad description makes the entire skill body invisible.

### Step 3 — Prune What the Model Already Knows

For each instruction in SKILL.md, ask: **"Would a frontier model do this correctly without this instruction?"**

If yes → **delete it.** Instructions the model would follow anyway waste tokens and dilute the rules that actually matter.

Examples of content to delete:
- "Use `git diff` to see changes" — the model knows git
- "Handle errors appropriately" — too vague to act on anyway
- "Follow best practices for X" — the model already defaults to best practices
- Explanations of concepts the model already understands (what HTTP is, how JSON works, etc.)

**Keep only what's project-specific, non-obvious, or where the model's default behavior would be WRONG.**

---

## Phase 2: Untangle & Restructure

### Step 4 — Classify and Untangle

Go through every section across all files and classify it as behavioral, format, or tool guidance. When you find content in the wrong layer, move it:

- **Behavioral content in templates** → move to SKILL.md, leave only the format skeleton
- **Behavioral content in references** → move to SKILL.md, or remove if already covered
- **Format content in SKILL.md** → keep lightweight description, move details to template
- **Tool content in SKILL.md** → move to `references/`

The key question: *"If I removed this file, what would the agent lose?"* If the answer is "behavioral guidance," that content belongs in SKILL.md. "Structure to fill" → template. "CLI flags to look up" → references.

### Step 5 — Trace Consumption

For each field, section, and table in the skill's output, ask who actually reads it downstream. Prune what nobody consumes:

- Tables that duplicate information expressed elsewhere
- Columns that are "nice to have" but never referenced downstream
- Key-value pairs that would be clearer and shorter as natural language
- Speculative fields that ask for predictions or guesses

### Step 6 — Eliminate Contradictions

Compare closely related rules across files. Contradictions confuse agents. Look for:

- Same rule expressed with different wording in SKILL.md vs a template
- Downstream skill assuming a structure that upstream changed
- Two steps in the workflow that overlap in purpose or decision logic

---

## Phase 3: Rewrite

### Step 7 — Restructure SKILL.md for Clarity

After untangling, restructure SKILL.md so it guides the agent's thinking rather than scripting every keystroke. Use the structure in `references/example_skill.md` as a format reference.

Principles:

- **Teach concepts, not steps** — explain the *why*, not just the *what*
- **Provide frameworks, not scripts** — offer mental models the agent can adapt
- **Ask questions** — prompt the agent to think ("What should happen when a worker fails? What's the right retry policy for this kind of task?")
- **Describe outcomes, not methods** — "verify every issue is resolved" not "run command X and check for Y"

### Step 8 — Extract Gotchas

Review the original skill for environment-specific facts that would break the model's default assumptions. These are the **highest-value content per token**. Add a `## Gotchas` section to SKILL.md.

Good gotchas (keep):
- "This API returns HTTP 200 even on failure — always check the response body, not the status code"
- "The dev server must be restarted after any YAML config change — hot reload only covers `.tsx` files"
- "Windows paths use backslash but this tool requires forward slash — always normalise before passing"

Bad gotchas (delete — too vague):
- "Make sure to handle errors"
- "Follow the project's coding standards"
- "Be careful with file permissions"

---

## Phase 4: Verify & Iterate

Verification is not optional. An unverified optimization is indistinguishable from degradation. If any check fails, go back to the relevant phase and fix it, then re-run the check.

### Check A — Discovery Validation

Paste this prompt into the conversation and answer it honestly for the optimized skill:

```
I am evaluating an Agent Skill's frontmatter. Agents decide whether to load
this skill based entirely on the YAML metadata below.

---
name: [insert name]
description: [insert description]
---

Based strictly on this metadata:
1. Generate 3 realistic user prompts that SHOULD trigger this skill.
2. Generate 3 user prompts that sound similar but should NOT trigger.
3. Critique the description: too broad? too narrow? missing negative triggers?
4. Propose a revised description if improvements are needed.
```

If the description triggers incorrectly (false positives or false negatives), fix it now.

### Check B — Simulated Execution

Paste this prompt into the conversation with the full optimized SKILL.md:

```
Act as an autonomous agent that has just triggered this skill. Simulate
execution step-by-step on a typical input.

For each step, write your internal monologue:
1. What exactly are you doing?
2. Which specific file are you reading or running?
3. Flag any Execution Blockers: exact lines where you must guess or
   hallucinate because the instructions are ambiguous.
```

If the simulated agent guesses or hallucinates at any step, that instruction needs to be clearer. Fix it.

### Check C — Edge Case Attack

Paste this prompt into the conversation:

```
Switch roles. Act as a ruthless QA tester. Your goal is to break this skill.
Ask 3-5 highly specific questions about edge cases, failure states,
or missing fallbacks.

Focus on:
- What if a referenced file is missing or renamed?
- What if the input violates assumptions baked into the skill?
- Are there implicit environment or toolchain assumptions?
- What happens if a script fails mid-execution?

Do not fix these issues yet. Just ask the numbered questions and wait
for me to answer them.
```

Answer the questions, then apply the fixes to the skill.

### Check D — Consistency & Self-Check

Final pass:

- [ ] Core deliverable preserved (run the skill's original examples mentally — same inputs produce same outputs)
- [ ] Description includes negative triggers
- [ ] No behavioral guidance in templates — templates show structure only
- [ ] No references marked as required reading
- [ ] Token count and section count reduced from original
- [ ] No duplicate or overlapping steps in the workflow
- [ ] Cross-file references all valid
- [ ] Gotchas section present with concrete, environment-specific facts
- [ ] No instructions the model would follow correctly without being told

---

## Phase 5: Deliver

Output the complete optimized skill. If the original skill had supporting files (templates, references, scripts), include the updated versions of those too. Flag any files that should be deleted because their content was merged into SKILL.md or pruned.

## References

- `references/example_skill.md` — Format reference for optimized SKILL.md structure
