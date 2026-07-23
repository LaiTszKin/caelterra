---
name: optimise-skill
description: Audits and rewrites Agent Skills (SKILL.md + supporting files) for clarity, token efficiency, and progressive disclosure. Use when the user asks to optimize, improve, review, or clean up a skill. Do NOT use for creating new skills from scratch or for editing files that are not part of a skill directory.
---

## Goal

Analyze a skill's full directory and produce an optimized rewrite. The goal is not to change what the skill does — it is to make the skill easier for an LLM to understand and execute effectively. Achieve this by removing redundancy, separating concerns, and replacing rigid instructions with guiding principles. Every change must survive independent adversarial verification via a fresh Hermes instance.

## Acceptance Criteria

- The skill's core deliverable and workflow are preserved unchanged.
- The description in frontmatter includes negative triggers that state when the skill should NOT be loaded.
- Behavioral guidance lives in SKILL.md only and is never placed in templates or reference files.
- Templates contain only format content — the structure of the output, never instructions on how to fill it.
- Reference files are optional lookups and are never marked as required reading.
- Token count is reduced compared to the original.
- Every workflow step serves a distinct purpose with no overlapping or duplicate steps.
- All cross-file references remain valid.
- The optimized skill passes adversarial verification by an independent Hermes instance without the agent guessing or hallucinating.
- A `## Gotchas` section captures environment-specific facts that break model defaults.

## Core Principle: Three-Layer Separation

A well-structured skill separates three distinct concerns:

| Layer          | What it contains                                       | Where it lives  |
| -------------- | ------------------------------------------------------ | --------------- |
| **Behavioral** | How to think, what to check, what principles to follow | SKILL.md        |
| **Format**     | What the output structure looks like                   | Template files  |
| **Tool**       | CLI flags, API params, external commands               | Reference files |

The most common problem in unoptimized skills is mixing these layers together — templates that tell the agent what to do, SKILL.md sections that describe output formats, and reference files that contain behavioral rules. Your job is to untangle them so that each piece of content lives in exactly the right layer.

---

## Phase 1: Audit and Map

### Step 1 — Read and Map

Read the full skill directory, including SKILL.md, templates, and reference files. Before optimizing, understand three things about this skill: what it produces and who consumes it downstream, what it reads from upstream stages, and which parts actually get used downstream versus which are decorative.

### Step 2 — Audit the Description

The description in the YAML frontmatter is the only metadata the agent uses to decide whether to load this skill. If the description is wrong, the skill is invisible regardless of how good the body is.

Check the existing description against these criteria:

- Is it specific enough to avoid matching unrelated tasks? If the description would also trigger on tasks the skill does not handle, tighten it.
- Does it include negative triggers? Add a "Do NOT use for X, Y, Z" clause to prevent over-triggering.
- Does it use third-person imperative voice? Describe what the skill does, not what the user does. Write "Audits and rewrites Agent Skills for clarity and token efficiency" rather than "You should use this when you want to optimize a skill."
- Is it under 1,024 characters? Shorter descriptions route more reliably.
- Does it include concrete trigger keywords? Use words the user would actually say when asking for this task.

If the description fails any criterion, rewrite it. A bad description makes the entire skill body invisible — it is the highest-leverage single change you can make.

**Description anti-patterns** (see `references/description-patterns.md` for before and after examples):

- **Implementation-detail opening.** The first sentence describes how the skill works internally ("5-phase evidence-driven debugging", "Structured git commits grouped by category") instead of what it does for the user. The routing system matches trigger words, not implementation structure. Fix this by opening with a user-facing action statement.
- **Missing user-language keywords.** If the user communicates in a non-English language, the description needs trigger keywords in that language. An English-only description will miss queries like 提交, 文檔, or 幫我整.
- **Stale negative triggers.** After broadening a skill's scope (for example, expanding from AGENTS.md-only to all project spec files), old exclusion clauses may contradict the new scope and cause false negatives. Re-audit every exclusion after a scope change.
- **Exclusionary descriptions on fuzzy boundaries.** When the description says "NOT for: trivial changes" but the boundary between trivial and non-trivial is fuzzy, the model will skip the skill on borderline cases that should have been routed. Fix this by triggering on everything and adding an explicit Phase 0 triage checklist in the body — move the decision from the model's implicit judgment to the skill's explicit logic. See Pattern 4 in `references/description-patterns.md`.

### Step 3 — Prune What the Model Already Knows

For each instruction in SKILL.md, ask: would a frontier model do this correctly without being told?

If the answer is yes, delete the instruction. Instructions the model would follow anyway waste tokens and dilute the rules that actually matter.

Examples of content that should be removed:

- "Use `git diff` to see changes" because the model already knows git.
- "Handle errors appropriately" because this is too vague to act on.
- "Follow best practices for X" because the model already defaults to best practices.
- Explanations of concepts the model already understands, such as what HTTP is or how JSON works.

Keep only what is project-specific, non-obvious, or cases where the model's default behavior would be wrong.

---

## Phase 2: Untangle and Restructure

### Step 4 — Classify and Untangle

Go through every section across all files and classify it as behavioral, format, or tool guidance. When you find content in the wrong layer, move it to the correct one:

- If behavioral content appears in templates, move it to SKILL.md and leave only the format skeleton in the template.
- If behavioral content appears in reference files, move it to SKILL.md or remove it if the same guidance is already covered there.
- If format content appears in SKILL.md, keep a lightweight description in SKILL.md and move the detailed format specification to a template.
- If tool-specific content appears in SKILL.md, move it to a reference file in the `references/` directory.

The key question for any piece of content is: if I removed this file, what would the agent lose? If the answer is "behavioral guidance," that content belongs in SKILL.md. If the answer is "a structure to fill in," it belongs in a template. If the answer is "CLI flags to look up," it belongs in a reference file.

### Step 5 — Trace Consumption

For each field, section, and table in the skill's output, ask who actually reads it downstream. Prune what nobody consumes. This includes tables that duplicate information expressed elsewhere, columns that are never referenced downstream, key-value pairs that would be clearer and shorter as natural language, and speculative fields that ask for predictions or guesses.

### Step 6 — Verify Subagent Prompt Self-Containment

This is the most common bug in skills that dispatch subagents. When a skill instructs the orchestrator to inject a prompt into a subagent via `terminal(command="hermes chat -q ...")`, that prompt is the only content the subagent receives. The subagent has no access to the orchestrator's SKILL.md, templates, or reference files.

Audit every subagent prompt for these broken references:

- References to "above," "below," or "earlier" because the subagent does not have that context. Embed the referenced content directly.
- References like "as described in the Core Principles" because the subagent never saw Core Principles. Restate the principles inline.
- Instructions like "classify by the risk tiers defined earlier" because the tier definitions are not in the subagent's prompt. Inline the tier definitions directly.
- Instructions like "follow the format in references/output.md" because the subagent cannot read reference files. Inline the format or pipe the file content into the prompt.

Fix every instance by making each subagent prompt fully self-contained. Any rule, table, or format the subagent needs must appear verbatim inside the prompt, either in the prompt text itself or piped in via `cat references/checklist.md`. This is the highest-leverage single fix in skills that dispatch subagents — a non-self-contained prompt produces hallucinated output that passes all other verification checks but is wrong.

See `references/subagent-self-containment.md` for a concrete before and after example.

### Step 7 — Eliminate Contradictions

Compare closely related rules across files because contradictions confuse agents. Look for the same rule expressed with different wording in SKILL.md versus a template, a downstream skill assuming a structure that an upstream stage changed, and two steps in the workflow that overlap in purpose or decision logic.

---

## Phase 3: Rewrite

### Step 8 — Restructure SKILL.md for Clarity

After untangling, restructure SKILL.md so it guides the agent's thinking rather than scripting every keystroke. Use `references/example_skill.md` as a format reference.

Principles to apply:

- **Teach concepts, not steps** by explaining the why behind each action, not just listing what to do.
- **Provide frameworks, not scripts** by offering mental models the agent can adapt to varying situations.
- **Ask questions** that prompt the agent to think, such as "What should happen when a worker fails? What is the right retry policy for this kind of task?"
- **Describe outcomes, not methods** by saying "verify every issue is resolved" rather than prescribing "run command X and check for Y."

### Step 9 — Extract Gotchas

Review the original skill for environment-specific facts that would break the model's default assumptions. These are the highest-value content per token in the entire skill. Add a `## Gotchas` section to SKILL.md.

Good gotchas worth keeping:

- "This API returns HTTP 200 even on failure — always check the response body, not the status code."
- "The dev server must be restarted after any YAML config change because hot reload only covers `.tsx` files."
- "Windows paths use backslash but this tool requires forward slash — always normalise before passing."

Bad gotchas that should be deleted because they are too vague:

- "Make sure to handle errors."
- "Follow the project's coding standards."
- "Be careful with file permissions."

---

## Phase 4: Verify

Verification is mandatory. An unverified optimization is indistinguishable from degradation. If any check fails, go back to the relevant phase, fix the issue, and then re-run the check. Verification uses independent Hermes instances via `hermes chat -q` so that an agent with no memory of the optimization process evaluates the result from scratch.

### Batch Optimization (5 or more skills)

When optimizing a batch of 5 or more skills, running the full Check A through Check D protocol per skill is impractical. Instead, apply structural patterns uniformly across all skills (three-layer separation, removing what the model already knows, compressing frameworks), run a structural validator per skill such as `create-skill`'s `validate-skill.py`, and reserve the full adversarial verification for the most complex or ambiguous skill in the batch — the one with the highest behavioral density. The structural patterns provide the primary value at batch scale while the full verification protocol is most valuable for individual deep rewrites.

### Per-Skill Verification (1 to 4 skills)

#### Check A — Discovery Validation

Run an independent Hermes instance to evaluate the skill's frontmatter. This check confirms that the description triggers correctly — neither missing relevant queries nor matching irrelevant ones.

```bash
hermes chat -q "You are evaluating an Agent Skill's frontmatter. Agents decide whether to load this skill based entirely on the YAML metadata below. Based strictly on this metadata, do the following. First, generate 3 realistic user prompts that SHOULD trigger this skill. Second, generate 3 user prompts that sound similar but should NOT trigger. Third, critique the description: is it too broad, too narrow, or missing negative triggers? Fourth, propose a revised description if improvements are needed.

---
name: <skill-name>
description: <description>
---"
```

Replace `<skill-name>` and `<description>` with the actual values from the optimized skill. If the independent agent identifies false positives or false negatives, fix the description before proceeding.

#### Check B — Simulated Execution

Run an independent Hermes instance with the full optimized SKILL.md to simulate execution. This check reveals ambiguities, missing steps, and hallucination risks.

The prompt for the independent agent must include the full SKILL.md content. Embed it directly:

```bash
hermes chat -q "Act as an autonomous agent that has just triggered this skill. Simulate execution step-by-step on a typical input.

For each step, write your internal monologue covering four things. First, what exactly are you doing? Second, which specific file are you reading or running? Third, flag any Execution Blockers: exact lines where you must guess or hallucinate because the instructions are ambiguous. Fourth, if the skill dispatches subagents, check whether the injected prompt is self-contained — does it reference anything the subagent cannot see such as tables, sections, or files from the orchestrator's SKILL.md?

Here is the full skill:

<PASTE FULL SKILL.md HERE>"
```

Replace `<PASTE FULL SKILL.md HERE>` with the complete content of the optimized SKILL.md. If the independent agent guesses or hallucinates at any step, that instruction needs to be clearer. Fix it and re-run this check.

#### Check C — Edge Case Attack

Run an independent Hermes instance in adversarial mode to probe for missing fallbacks and brittle assumptions:

```bash
hermes chat -q "Act as a ruthless QA tester. Your goal is to break this skill. Ask 3 to 5 highly specific questions about edge cases, failure states, or missing fallbacks. Focus on four areas. What if a referenced file is missing or renamed? What if the input violates assumptions baked into the skill? Are there implicit environment or toolchain assumptions? What happens if a script fails mid-execution? Do not fix these issues yet — just ask the numbered questions and wait for me to answer them.

Here is the full skill:

<PASTE FULL SKILL.md HERE>"
```

Answer each question the independent agent raises, then apply the corresponding fixes to the skill.

#### Check D — Consistency Self-Check

Final manual pass through this checklist. Every item must be confirmed:

- [ ] Core deliverable preserved — mentally run the skill's original examples and confirm the same inputs produce the same outputs.
- [ ] Description includes negative triggers.
- [ ] No behavioral guidance in templates — templates show structure only.
- [ ] No references marked as required reading.
- [ ] Token count and section count reduced from original.
- [ ] No duplicate or overlapping steps in the workflow.
- [ ] Cross-file references all valid.
- [ ] Gotchas section present with concrete, environment-specific facts.
- [ ] No instructions the model would follow correctly without being told.

---

## Phase 5: Deliver

Output the complete optimized skill. If the original skill had supporting files such as templates, reference files, or scripts, include the updated versions of those too. Flag any files that should be deleted because their content was merged into SKILL.md or pruned entirely.

## References

- `references/example_skill.md` — Format reference for optimized SKILL.md structure.
- `references/subagent-self-containment.md` — Concrete before and after example of the most common subagent-prompt bug.
- `references/description-patterns.md` — Before and after examples of description optimization, covering implementation-detail openings, missing user-language triggers, stale negative triggers, and exclusionary descriptions on fuzzy boundaries.
