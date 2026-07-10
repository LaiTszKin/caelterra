---
name: create-skill
description: >
  Guides the agent through creating a new Agent Skill from scratch.
  Use when the user wants to build a skill, create a new skill,
  scaffold a skill directory, or author a SKILL.md.
  Follows a 6-phase workflow: Discover → Design → Plan → Build →
  Validate → Deliver.
  Do NOT use for optimising or rewriting existing skills — use
  'optimise-skill' for that.
  Do NOT use for editing files that are already part of a skill.
  Do NOT use for creating non-skill content like documentation, scripts,
  or project files.
---

# Create Skill

This skill guides you step by step through building a new Agent Skill — from
understanding what the user needs, to delivering a complete, validated skill
directory.

## Core Principles

### Skill Anatomy (What we're building)

Every skill is a folder with this structure:

```
skill-name/
├── SKILL.md              # Required: metadata + core instructions (< 500 lines)
├── scripts/              # Executable code for fragile/repetitive operations
├── references/           # Supplementary context loaded on demand
└── assets/               # Templates or static files used in output
```

- `SKILL.md` is the "brain" — behavioural guidance only (what to do and why).
- `scripts/` are for deterministic, fragile operations where variation is a bug.
- `references/` are look-up material (API schemas, CLI flags) — never marked as required reading.
- `assets/` are output templates — structure only, no behavioural instructions.

### Three-Layer Separation

Every piece of content belongs in exactly one layer:

| Layer          | What it contains                               | Where it lives  |
| -------------- | ---------------------------------------------- | --------------- |
| **Behavioural** | How to think, what to check, what principles   | SKILL.md        |
| **Format**      | What the output structure looks like           | assets/         |
| **Tool**        | CLI flags, API params, external commands       | references/     |

The most common mistake in new skills is mixing these layers. Your job is to
keep them clean from the start.

### Degrees of Freedom

Match instruction tightness to task fragility:

- **High freedom (text guidance)** — multiple approaches valid, decisions
  depend on context. Use for heuristic-driven workflows.
- **Medium freedom (pseudocode / scripts with params)** — a preferred pattern
  exists, some variation is acceptable, configuration affects behaviour.
- **Low freedom (specific scripts, few params)** — operations are fragile and
  error-prone, consistency is critical, a specific sequence must be followed.

### CSO Rule for Descriptions

The description is the **only metadata the agent sees** to decide whether to
load the skill. Never summarise the skill's workflow in the description —
the agent reads the summary and skips the body.

Good description:
```
Guides the agent through creating a new Agent Skill from scratch.
Use when the user wants to build a skill. Do NOT use for editing
existing skills.
```

Bad description:
```
First we ask the user what they want. Then we create a directory.
Then we write the files. Then we validate them...
```

---

## Workflow

### Phase 1: DISCOVER — Understand the Skill's Purpose

Before writing anything, establish a clear picture of what the skill should do.

#### Step 1 — Ask the 5 Core Questions

Ask the user these questions. Collect answers before moving on.

1. **One-liner**: What does this skill do, in one sentence?
2. **Inputs**: What does the skill read or receive? (files, user prompts, data sources)
3. **Outputs**: What does the skill produce? (files, analysis, transformed content)
4. **Consumer**: Who or what consumes the output? (another skill, a human, a downstream tool)
5. **Known pitfalls**: Are there environment-specific facts or common mistakes the skill must guard against?

#### Step 2 — Determine Degrees of Freedom

For each operation the skill will perform, decide the right level of tightness.
Use `references/degrees-of-freedom.md` for the full decision tree.

Ask the user:

- "Should the agent have flexibility in HOW it does this, or must it follow an exact sequence?"
- "Is this operation fragile (deleting files, writing to production) or exploratory (analysing data, suggesting improvements)?"
- "Are there multiple valid approaches, or exactly one correct way?"

Map each operation to High / Medium / Low freedom and record the result.

---

### Phase 2: DESIGN — Preview the Expected Interaction

This is the signature phase of `create-skill`. Before building anything, show
the user what the skill will look like in practice.

#### Step 3 — Generate a Mock Dialogue

Based on the answers from Phase 1, construct a realistic 3–4 turn dialogue
between a user and the agent running this skill. Format it clearly:

```
┌─ Mock Dialogue ─────────────────────────────────────┐
│                                                      │
│ User: <a realistic user request that triggers this   │
│        skill>                                        │
│                                                      │
│ Agent: <how the agent should respond>                │
│                                                      │
│ User: <a follow-up or edge case>                     │
│                                                      │
│ Agent: <how the agent handles it>                    │
│                                                      │
│ User: <a final confirmation or refinement>           │
│                                                      │
│ Agent: <the final output or handoff>                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Include at least one edge case that tests the skill's boundaries (e.g. missing
input, unexpected format, failure recovery).

**Present this to the user and ask: "Is this the interaction you expect?"**

- If YES → proceed to Phase 3.
- If NO → ask what should change, revise the dialogue, and reconfirm.

This step catches misunderstandings early, before any code or files are written.

---

### Phase 3: PLAN — Map Content to Files

Now that the purpose and interaction model are confirmed, plan what goes where.

#### Step 4 — Classify Every Piece of Content

Take the confirmed scope and classify each element into one of four buckets:

| Bucket       | When to use                                                  | Examples                                      |
| ------------ | ------------------------------------------------------------ | --------------------------------------------- |
| **SKILL.md** | Behavioural guidance: principles, steps, gotchas             | "Verify every API call returns 200"           |
| **scripts/** | Deterministic, fragile operations where variation is a bug   | PDF rotation, data parsing, git operations    |
| **references/** | Look-up material: schemas, API docs, CLI flags           | Database schema, API endpoint list            |
| **assets/**  | Output structure: templates, boilerplate, output format       | Report template, JSON schema, HTML skeleton   |

For each item, decide which bucket it belongs to. **One item → one bucket.**
No mixing.

#### Step 5 — Design the Directory Structure

Based on the classification, sketch the final directory:

```
proposed-skill-name/
├── SKILL.md
├── scripts/           # (only if Step 4 produced script items)
│   └── <script-name>.py
├── references/        # (only if Step 4 produced reference items)
│   └── <ref-name>.md
└── assets/            # (only if Step 4 produced asset items)
    └── <template-name>.md
```

Minimal viable skill: just `SKILL.md`. Add subdirectories only when needed.

---

### Phase 4: BUILD — Create the Skill

Now write the actual files.

#### Step 6 — Create the Directory Scaffold

Create the skill directory under the project's `skills/` folder:

```bash
mkdir -p skills/<skill-name>/{scripts,references,assets}
```

Remove any empty directories that aren't needed.

#### Step 7 — Write the SKILL.md

Follow the template in `assets/skill-template.md` as the structure reference.

Key rules:
- **Frontmatter**: `name` must match the directory name. `description` must
  follow the CSO Rule — include concrete trigger phrases and negative triggers.
- **Body**: Use third-person imperative ("Verify every API call..." not "You
  should verify...").
- **Keep it under 500 lines**. Split dense content into references/.
- **Add a `## Gotchas` section** at the end with environment-specific facts
  that break model defaults. These are the highest-value content per token.
- **Reference files explicitly**: tell the agent when to read each reference
  (e.g. "See `references/schema.md` for the full table structure").

#### Step 8 — Write Supporting Files

For each item classified as scripts/references/assets in Step 4:

- **scripts/**: Write tested, self-contained executables. They should:
  - Accept inputs via CLI args or stdin
  - Write results to stdout
  - Return descriptive error messages on failure (so the agent can self-correct)
  - Be tested by actually running them before finalising

- **references/**: Write concise look-up documents. One topic per file.
  - Include a table of contents if the file exceeds 100 lines.
  - Never include behavioural guidance — that belongs in SKILL.md.

- **assets/**: Write output templates showing structure only.
  - Use `{{placeholder}}` tokens for variable content.
  - Never embed instructions, logic, or behavioural rules in templates.

---

### Phase 5: VALIDATE — Ensure Quality

Validation is not optional. An unvalidated skill is indistinguishable from
broken. Run these checks in order. If any fails, go back and fix it.

#### Step 9 — Discovery Validation

Paste this prompt into the conversation and answer it honestly:

```
I am evaluating an Agent Skill's frontmatter. Agents decide whether to load
this skill based entirely on the YAML metadata below.

---
name: <proposed-name>
description: <proposed-description>
---

Based strictly on this metadata:
1. Generate 3 realistic user prompts that SHOULD trigger this skill.
2. Generate 3 user prompts that sound similar but should NOT trigger.
3. Critique the description: too broad? too narrow? missing negative triggers?
4. Propose a revised description if improvements are needed.
```

If the description triggers incorrectly (false positives or false negatives),
fix it now.

#### Step 10 — Simulated Execution

Paste this prompt with the full SKILL.md:

```
Act as an autonomous agent that has just triggered this skill. Simulate
execution step-by-step on a typical input.

For each step, write your internal monologue:
1. What exactly are you doing?
2. Which specific file are you reading or running?
3. Flag any Execution Blockers: exact lines where you must guess or
   hallucinate because the instructions are ambiguous.
```

If the simulated agent guesses or hallucinates, clarify the instruction.

#### Step 11 — Edge Case Attack

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

Answer the questions, then apply the fixes.

#### Step 12 — Structural Validation

Run the validate script if available:

```bash
python scripts/validate-skill.py skills/<skill-name>
```

Check these manually if the script isn't available:

- [ ] Core deliverable preserved: same inputs produce same outputs
- [ ] Description includes negative triggers (Do NOT use for...)
- [ ] No behavioural guidance in templates — templates show structure only
- [ ] No references marked as required reading
- [ ] SKILL.md under 500 lines
- [ ] No duplicate or overlapping steps in the workflow
- [ ] Cross-file references all valid
- [ ] Gotchas section present with concrete, environment-specific facts
- [ ] No instructions the model would follow correctly without being told
- [ ] No README.md, CHANGELOG.md, or other documentation files in the skill dir

---

### Phase 6: DELIVER — Present the Result

#### Step 13 — Final Output

Present the completed skill to the user:

1. List the directory structure
2. Summarise what each file does
3. Note any decisions made during creation (e.g. "I chose a script instead of
   inline instructions because the JSON parsing logic is fragile")
4. Point the user to `optimise-skill` if they want further refinement

Example delivery:

```
✅ Skill created: skills/analytics-report/

analytics-report/
├── SKILL.md           — 187 lines, core workflow + gotchas
├── scripts/
│   └── generate_chart.py — wraps matplotlib with standard sizing
├── references/
│   └── metrics.md     — lookup table for metric definitions
└── assets/
    └── report_template.md — output structure with {{placeholders}}

The script was extracted because the chart configuration is fragile
and error-prone when written from scratch each time. Reference
material was split out to keep SKILL.md under 200 lines.

Run optimise-skill on this for a token-efficiency pass.
```

---

## Gotchas

- **Empty subdirectories confuse agents.** If a `scripts/` or `references/`
  directory exists but is empty, don't create it.
- **The description is the SKILL.md loaded into the user's context in full.**
  Don't add a "When to Use" section in the body — all routing metadata goes
  in the `description` frontmatter field, period.
- **`name` must match the directory name exactly.** The standard enforces this
  (lowercase, hyphens, < 64 chars). If they diverge, some agents won't load
  the skill.
- **Never include human-facing documentation** (README, CHANGELOG, LICENSE)
  inside a skill directory. Skills are for agents, not humans.
- **Default assumption: the model is already very smart.** Don't explain basic
  concepts (HTTP, JSON, git). Only add what's project-specific, non-obvious, or
  where the model's default behaviour would be wrong.
- **Mock dialogues are for the user, not for the final skill.** Remove the
  mock dialogue before delivering — it's a design tool, not part of the output.

## References

- `references/spec.md` — agentskills.io spec summary
- `references/anti-patterns.md` — common skill-writing mistakes with fixes
- `references/degrees-of-freedom.md` — decision tree for instruction tightness
- `assets/skill-template.md` — structure template for the generated SKILL.md

## Scripts

- `scripts/validate-skill.py` — structural validation for generated skills
- `scripts/init-skill.sh` — scaffold an empty skill directory
