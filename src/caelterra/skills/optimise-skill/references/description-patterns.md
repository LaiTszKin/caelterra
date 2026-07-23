# Description Optimization Patterns

Concrete before and after examples from real description fixes. Use these when
Check A (Discovery Validation) reveals false negatives or false positives.

## Pattern 1: Implementation-Detail Opening vs Action-Oriented Opening

**Root cause:** The first 1-2 sentences describe HOW the skill works, not WHAT
it does for the user. The routing system matches on user-facing trigger words,
not implementation details.

### Before (broken — too narrow)
```
5-phase evidence-driven debugging for agent-authored code bugs.
Phases: (1) reproduce deterministically...
```
User says "個app crash咗" and gets no match because the description contains
neither "agent-authored" nor "5-phase".

### After (fixed — broad trigger surface)
```
Evidence-driven debugging for bugs, errors, crashes, test failures,
regressions, and unexpected output. Use when something is broken,
not working as expected, or producing wrong results...
```

### Before (broken — too narrow)
```
Structured git commits grouped by change category and semantic version
releases with changelog + annotated tags.
```
User says "幫我commit" and the routing system sees "grouped by change category"
instead of "commit".

### After (fixed — broad trigger surface)
```
Git repository management: commit changes, bump versions, create
semantic-version releases with changelogs and annotated tags, push to remotes.
```

**Rule:** The opening must be a user-facing action statement. Implementation
structure (phases, categories, algorithms) goes in the body, never the
first sentence.

---

## Pattern 2: Missing User-Language Trigger Keywords

**Root cause:** Description uses only technical English terms. Bilingual
users issue commands in their native language, and those queries never match.

### Before (broken — English-only)
```
Generates a multi-file docs/ tree from a codebase: architecture diagrams...
Prefer this for full-project documentation suites.
```
User says "幫我寫文檔" or "生成項目文檔" and gets no match.

### After (fixed — bilingual triggers)
```
Generate a structured multi-file docs/ tree from any codebase: ...
Use when the user asks to document a project, generate documentation,
write docs, or create project wiki (寫文檔, 生成文檔, 項目文檔, documentation).
```

### Keywords that matter for bilingual (Cantonese/Mandarin) users

| Domain       | English triggers                    | Chinese triggers              |
| ------------ | ----------------------------------- | ----------------------------- |
| Debugging    | bug, error, crash, fix, broken      | 錯誤, 唔work, debug            |
| Git          | commit, push, tag, release, version | 提交, 推送, 發布, 版本, 合併   |
| Docs         | document, docs, wiki                | 文檔, 寫文檔, 生成文檔         |
| Build/create | build, create, implement, feature   | 開發, 幫我整, 寫一個, 做一個   |
| Spec files   | agent context, coding guidelines    | 項目規範文件, coding rules     |

**Rule:** If the user communicates in a non-English language, every
description MUST include trigger keywords in their language. Test by
translating the user's likely phrasing into the description.

---

## Pattern 3: Stale Negative Triggers After Scope Expansion

**Root cause:** A skill's scope broadens (handles more file types, more
workflows), but the "DO NOT load when" and "NOT for:" clauses were written
for the old scope and now cause false negatives.

### Before (broken — contradicts new scope)
```
name: manage-agents-md
description: Create, audit, update, and maintain AGENTS.md files...

DO NOT load when:
- User asks about CLAUDE.md in isolation
- User asks about .cursorrules or other tool-specific configs
```
After the scope expanded to "all project spec files," the CLAUDE.md and
.cursorrules exclusions are now wrong.

### After (fixed — exclusions match new scope)
```
name: manage-agents-md
description: Create, audit, update, and maintain project specification files
that guide AI coding agents: AGENTS.md, CLAUDE.md, .cursorrules,
.windsurfrules, and similar agent context files...

NOT for: README.md, CONTRIBUTING.md, general project documentation,
or writing docs/ content.
```

**Rule:** After expanding a description's trigger surface, re-audit EVERY
negative trigger. Ask: "Does this exclusion still make sense now that the
skill handles X?" Delete any that contradict the new scope.

---

## Pattern 4: Exclusionary Descriptions vs Broad Trigger with Internal Triage

**Root cause:** The description uses exclusion language ("NOT for: X") to
filter out simple tasks, but the model cannot reliably distinguish X from
non-X. The boundary is inherently fuzzy — "trivial" vs "non-trivial" is a
judgment call the model gets wrong. Result: the skill never loads for
borderline cases that should have been routed.

### Before (broken — false negatives)

```yaml
description: >
  Smart entry-point router for all software engineering tasks.
  Use when the user asks to build, create, implement, add features,
  refactor, or do any non-trivial software engineering work.
  NOT for: bug fixes or debugging, trivial single-function changes,
  one-line edits, or code review on already-built systems.
```

Problem: user says "rename `get_user` to `get_user_by_id` and update all
callers." Is this a trivial rename or a multi-file refactor? The model
reads "NOT for: trivial single-function changes" and skips the skill.
But updating callers makes it non-trivial. False negative.

### After (fixed — always trigger, internal triage)

```yaml
description: >
  Universal entry point for ALL software engineering tasks — always
  trigger first. From one-line fixes to full feature builds: the skill
  internally classifies the task and either fast-passes to direct
  implementation (trivial changes) or routes through the pipeline.
  Trigger on ANY code-related request: build, create, implement, add,
  remove, rename, fix, debug, refactor, change, update, write, edit.
  Never skip — it decides whether you need the pipeline, not the model.
```

Then in the skill body, Phase 0: Triage has an explicit checklist:

```
Direct (skip pipeline):
- Bug fix with known root cause (single function, single file)
- Rename a symbol, function, variable, or file
- Fix lint/type/format error
- One-line or single-expression change
- Config change (one field)
- User says "just do it" / "直接改"

Pipeline:
- New features or capabilities
- Multi-file changes (>2 files)
- Architecture or API changes
- Data model changes
- >50 lines of new code
- Uncertain — default to Pipeline (conservative)
```

**Rule:** When the boundary between classes the model must distinguish is
fuzzy, do not make the model guess at trigger time. Trigger on everything
and let an explicit checklist in the skill body classify. A checklist is
more reliable than the model's off-the-cuff judgment about what counts as
"trivial."

## Pattern 5: The "Too Narrow" Warning Signs

1. **Only one file type mentioned** (such as "AGENTS.md files") when the skill
   actually handles a class of files.
2. **Only "new project/feature" in triggers** when the skill also handles
   refactoring, architecture changes, and adding functionality.
3. **Missing the most common user phrasing.** If users say "not working"
   but the description says "regression," the skill will not trigger.
4. **Opening is a noun phrase describing internal structure.** For example,
   "Core Jovaltus workflow. Smart entry-point routing" versus "Smart entry-point
   router for all software engineering tasks."

## The Effective Description Formula

```
[User-facing action statement — what the skill DOES for the user]
[Concrete trigger actions — "Use when the user asks to X, Y, Z"]
[Trigger keywords in user's language(s)]
[NOT for: specific, narrow exclusions]
```

All in ≤1024 characters. The first 50 characters matter most because they
are what the routing system weighs heaviest.
