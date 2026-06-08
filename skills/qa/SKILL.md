---
name: qa
description: Reads spec documents and the review output REPORT.md, then generates a self-contained fix coordinator prompt (FIX.md) with issue inventory, dependency analysis, batch scheduling, regression test design, and pre-written worker prompts. The generated FIX.md is consumed directly by the fix skill.
---

## Goal

Transform the review findings from REPORT.md into a **fix coordinator prompt** (FIX.md).

This prompt defines a fix coordinator agent:
- The **main agent** only coordinates and supervises: understands issues, dispatches workers to fix them, dispatches workers to write regression tests, checks results, merges, verifies
- **Workers** handle fixes and test writing: each receives a pre-written self-contained prompt and reports back

This skill is responsible for "planning the fix strategy" — extracting information from REPORT.md + SPEC/DESIGN/CHECKLIST, writing worker prompts for each fix and regression test, and scheduling batch execution order.

Worker prompts are written to individual files under `<spec_dir>/fix/` (single spec) or `<batch_dir>/fix/` (batch spec) instead of inline in FIX.md. This keeps FIX.md focused on coordination strategy while each fix/regression worker prompt is independently dispatchable.

## Acceptance Criteria

- `docs/plans/<YYYY-MM-DD>/<spec_name>/FIX.md` is produced in the spec directory (same level as REPORT.md)
- FIX.md is a **self-contained fix coordinator prompt** — the coordinator can execute it without referring back to any other document
- Every issue in REPORT.md (P0–P3) has a corresponding fix worker prompt under `fix/`
- Every fix has a corresponding regression test worker prompt under `fix/`
- Every worker prompt is self-contained with concrete file-level instructions and verification commands
- All code file paths that need modification are referenced somewhere in FIX.md or the worker prompts

## Workflow

### 1. Read Input Documents

**If a previous FIX.md exists**: Before reading new inputs, condense the old FIX.md's fix summary into one history entry. Prepend it to the Fix History section, keeping all past rounds. Then proceed with a fresh plan — do not let prior results bias the new assessment.

Read all of the following:

- **SPEC.md + DESIGN.md + CHECKLIST.md**: Full spec and design documentation
- **REPORT.md**: Review findings (verdict + P0-P3 issue list + dimension summary)
- `<spec_dir>/references/` or `<batch_dir>/references/` — External method/API reference documents

Understand the original design intent of the spec and the nature of each issue in REPORT.md.

### 2. Read Affected Code

Based on the file paths marked in REPORT.md, dispatch subagents in parallel to read the affected code.
Each subagent understands the actual code context of their assigned issue to enable precise fix and test design.

### 3. Analyze Each Issue and Design the Fix

**No-defer rule**: Every issue in REPORT.md — P0, P1, P2, and P3 — must have a complete fix plan in this FIX.md. There is no "handle later" or "defer to next round." If the number of issues is large, use batch scheduling to distribute them across phases, but every issue must be assigned to a specific batch with a complete worker prompt.

For each issue in REPORT.md (in P0 → P1 → P2 → P3 order), do root cause analysis through code reading, design the fix approach, classify complexity (simple vs cross-file), and define how to verify it. Fix details are encoded into worker prompts, not stored inline in FIX.md.

### 4. Design Regression Tests for Each Fix

For every fix issue, design a concrete regression test. Each regression test should have a clear oracle that fails on the unfixed code and passes after the fix is applied. Choose the test type based on the issue: unit tests for logic errors, integration tests for state/contract errors, etc. The test design is encoded into the REGTEST worker prompt.

### 5. Analyze Fix Dependencies

- **File overlap dependency**: Multiple issues touch the same file → must be sequential. This is a hard constraint — parallel workers are only permitted when file sets have ZERO overlap, regardless of logical independence
- **Logical dependency**: Fix B depends on Fix A being completed first
- **Independent issues**: No file overlap and no logical dependency → can be parallel
- **Regression test dependency**: Regression tests must run after their corresponding fix is complete (tests verify the fixed code)

### 6. Parallelism Gate (File Overlap + Logical Dependency)

File overlap detection and dependency analysis form the **dual gate that determines parallel vs sequential execution**. Parallel execution is only permitted when BOTH conditions are met:

1. Collect the file list for each fix and regression test
2. Compare file lists and mark overlaps — zero overlap is required for parallel execution. Any file overlap at all → must be sequential. This is a hard constraint — never dispatch parallel workers for tasks sharing a file.
3. Check for logical dependencies between fixes — even with no file overlap, a fix that depends on another fix's output must run sequentially.

### 7. Write Worker Prompts

#### 7a. Fix Worker Prompts

Write a self-contained worker prompt for each fix issue. Save each prompt to a separate file under `<spec_dir>/fix/` or `<batch_dir>/fix/`.

**Worker prompt file naming**: `fix/FIX-{sequence}-{kebab-case-name}.md`

Use `assets/templates/FIX_WORKER.md`. The template follows the P1-P5 architecture:

| Section | Purpose (P#) |
|---------|--------------|
| 1. Mission & Rules | Goal + behavioral rules (preserve tests, no scope creep) |
| 2. Context | Input files, root cause analysis |
| 3. Tasks | Concrete fix steps (file, line range, before/after) |
| 4. Verification | Commands and expected results |
| 5. Scope & References | Allowed/forbidden files, related documents |

**Simple fixes can be merged**: Multiple simple, non-conflicting fixes can be combined into one worker prompt.
**Complex fixes stand alone**: Complex fixes (requiring systematic debug) must have independent worker prompts.

#### 7b. Regression Test Worker Prompts

Write a self-contained worker prompt for each regression test. The regression test worker is responsible for **writing test code**.

**Worker prompt file naming**: `fix/REGTEST-{sequence}-{kebab-case-name}.md`

Use `assets/templates/REGTEST_WORKER.md`. The template follows the P1-P5 architecture:

| Section | Purpose (P#) |
|---------|--------------|
| 1. Mission & Rules | Goal + behavioral rules (test-only, oracle must fail before fix) |
| 2. Context | Input files, test design (type, location, scenario, oracle) |
| 3. Tasks | Concrete test writing steps |
| 4. Verification | Confirm test fails before fix, passes after |
| 5. Scope & References | Allowed test files, forbidden source files |

**Writing principles (move these to your process, not the template):**
- Writing clear worker prompts means being concrete, not declarative. For every file the worker must modify, specify: (1) the exact file path, (2) the function or line range, (3) what to add, delete, or change.
- Workers do not see the coordinator's context. The prompt must include everything necessary.
- A regression test that passes before the fix is not a valid test. Always design the oracle so it fails on unfixed code.

#### 7c. Cases That Do Not Need a Worker

- Single-line typo fixes (multiple typos can be batched into one worker)
- Pure documentation or comment fixes
- Extremely simple fixes that can be combined with their regression test in the same worker

### 8. Create Batch Schedule (→ COORDINATION section)

Design the batch schedule based on dependencies and file overlap. Think through:

- **Fix ordering**: Priority first (P0 before P1 before P2). Fixes with file overlap or logical dependencies must run sequentially. Independent fixes can be parallel in the same batch.
- **Regression tests**: Schedule AFTER all fix batches complete. Tests without file overlap can be parallel.
- **Final batch**: Full test suite, lint, confirmation that every issue is resolved.

The exact batch layout depends on the dependency graph of the specific fixes. Describe the schedule in the COORDINATION section of FIX.md — reference worker prompts by their `fix/*.md` paths and specify verification gates for each batch.

### 9. Define Error Recovery & Boundaries (→ RULES section)

Populate the RULES section with boundaries and error recovery rules. Think through:

- **Verification gates**: Every batch should have a gate that must pass before proceeding. Regression test batches need the additional check that each test fails on unfixed code.
- **Failure handling**: What happens when a fix or test worker fails? Consider retry policies and escalation.
- **Boundaries**: What must the coordinator always do, what should pause and ask the user, and what must it never do?

Adapt the rules to the specific task — don't use a fixed template. The structure and detail should reflect the complexity of the fixes.

### 10. Fill FIX.md Sections

Use `assets/templates/FIX.md`. The template has three content sections — here is guidance on what each should contain:

**ROLE** — Define the fix coordinator's mission and responsibilities. Describe what the coordinator does (understand issues, dispatch fix/test workers, verify results) and what it avoids. Derive the mission from REPORT.md's verdict and issue count.

**RULES** — The operating boundaries and error recovery rules you designed in step 9. Structure them clearly so the coordinator can reference them during execution.

**WORKING STEPS → 1. PREPARATION** — List the files the coordinator must read before starting, with brief context on what each provides. This typically includes REPORT.md (issues), SPEC.md (original requirements), affected source files, references/, and all worker prompt files.

**WORKING STEPS → 2. COORDINATION** — The batch execution plan from steps 7-8. Describe each batch, which fixes/tests it contains, whether they run in parallel or sequentially, their dependencies, and the verification gate that must pass before proceeding. Reference worker prompts by their `fix/*.md` paths. Fix details (root cause, approach) are encoded into the worker prompts themselves, not in FIX.md.

**WORKING STEPS → 3. FINAL VERIFICATION** — The meta-checks that confirm every issue is resolved. Extract these from CHECKLIST.md and the issue inventory.

### 11. Pre-delivery Quality Check

Before delivering, review the following:

**Worker prompts — are they truly self-contained?**
Scan for phrases like "based on your findings", "fix it appropriately" — these leak context. Are file paths and line ranges concrete? Is the verification command precise? Do filenames match the fix IDs?

**Coverage — is anything missing?**
Every issue in REPORT.md (P0–P3) must have a fix worker prompt. Every fix must have a regression test worker prompt (or documented manual verification steps for P2/P3 where automated testing is impractical). No issue may be deferred.

**Consistency — does the schedule hold together?**
Fix dependencies should match the batch ordering. Regression tests must be scheduled after all fix batches complete. No fix scheduled before its dependencies are met.

### 12. Produce FIX.md and Worker Prompts

Place the FIX.md in the spec directory (same level as REPORT.md).
Place worker prompts in `<spec_dir>/fix/` or `<batch_dir>/fix/`.

## Examples

- REPORT.md has 3 P0 issues (hallucinated code, deviation, omission) and 2 P1 issues → Each P0/P1 gets 1+ regression test → FIX.md + fix/ with 3 fix workers + 5 regression test workers → Schedule: Batch 1 parallel fix 3 P0 → Batch 2 fix 2 P1 → Batch 3 parallel 5 regtests → Batch 4 final
- Two P0 issues both modify `src/auth.ts` → File overlap → Separate into sequential batches → Regression tests run after all fix batches complete → Worker prompts in `fix/FIX-01-*.md` and `fix/FIX-02-*.md`
- A P0 logic error: `getDiscount()` does not handle negative input → Regression test: unit test with GIVEN negative input WHEN calling getDiscount THEN return 0 (before fix, returns incorrect negative discount) → Worker prompt in `fix/REGTEST-01-discount.md`

## References

- `assets/templates/FIX.md` — Coordinator prompt template
- `assets/templates/FIX_WORKER.md` — Fix worker prompt template (used in Step 7a)
- `assets/templates/REGTEST_WORKER.md` — Regression test worker prompt template (used in Step 7b)
