---
name: plan
description: Converts SPEC.md + DESIGN.md + CHECKLIST.md into a self-contained coordinator prompt (PROMPT.md) with complete task decomposition, dependency analysis, batch scheduling, and pre-written worker prompts. The generated PROMPT.md is consumed directly by the implement skill.
---

## Goal

Transform business specifications (SPEC.md) and technical design (DESIGN.md + CHECKLIST.md) into a **coordinator prompt** (PROMPT.md).

This prompt defines a coordinator agent:
- The **main agent** only coordinates and supervises: reads tasks, dispatches workers, checks results, merges, verifies
- **Workers** handle implementation: each receives a pre-written self-contained task prompt and reports back

This skill is responsible for "planning the coordination strategy" — extracting information from SPEC/DESIGN/CHECKLIST, decomposing into concrete tasks, pre-writing worker prompts, and scheduling batch execution order.

Worker prompts are written to individual files under `<spec_dir>/plan/` (single spec) or `<batch_dir>/plan/` (batch spec) instead of inline in PROMPT.md. This keeps PROMPT.md focused on coordination strategy while each worker prompt is independently dispatchable.

## Acceptance Criteria

- `docs/plans/<YYYY-MM-DD>/<spec_name>/PROMPT.md` is produced and placed at the root of the spec or batch spec directory
- PROMPT.md is a **self-contained coordinator prompt** — the coordinator can execute it without referring back to any other document
- The coordinator's role, rules, and execution plan are clear enough that the coordinator can dispatch workers, verify results, and handle failures without ambiguity
- Worker prompts are stored under `<spec_dir>/plan/*.md` or `<batch_dir>/plan/*.md`, one per file
- Every worker prompt is self-contained (workers don't need access to the coordinator's context or source documents)
- Every worker prompt has concrete file-level instructions (which files, which functions, what to change) and a verification command
- All code file paths that need modification are referenced somewhere in PROMPT.md or the worker prompts

## Workflow

### 1. Identify Spec Type

Read the specified directory and determine the type:

- **Single Spec**: The directory contains one set of SPEC.md + DESIGN.md + CHECKLIST.md
- **Batch Spec**: The directory contains multiple subdirectories, each with its own SPEC.md + DESIGN.md + CHECKLIST.md

### 2. Read and Understand All Documents

Read all files thoroughly:
- `SPEC.md` — Business requirements and scope (BDD GIVEN/WHEN/THEN), In/Out of Scope
- `DESIGN.md` — Module architecture, interaction anchors (INT-###), external dependencies (EXT-###), system invariants, technical trade-offs
- `CHECKLIST.md` — Behavior-to-test mapping, hardening requirements, test level choices
- `<spec_dir>/references/` or `<batch_dir>/references/` — External method/API reference documents (name, purpose, parameters)

### 3. Task Decomposition

Decompose the architecture design from DESIGN.md into tasks precise to the file or function level.

**Decomposition principles:**
- Each task corresponds to an independently verifiable outcome
- Task granularity: specific files and functions
- Each task defines a clear verification method
- Follow the interaction anchor order (INT-###) defined in DESIGN.md
- Follow the external dependency setup order (EXT-###) defined in DESIGN.md

**Decide whether each task needs an independent worker:**
- Touches ≥2 files → needs independent worker
- **Workers may run in parallel only when BOTH conditions are met:** (1) file lists have ZERO overlap across all workers within the same batch, AND (2) no logical dependency exists between the tasks. If either condition is violated, the tasks must run sequentially.
- File overlap or logical dependency between tasks → must run sequentially
- Purely procedural operations (lockfile update, merge, commit) → no worker needed; coordinator handles directly

### 4. Analyze Dependencies

#### 4a. Single Spec: Task-Level Dependency Analysis

Analyze dependencies between tasks:
- **Same-file dependency**: Multiple tasks touch the same file → must be sequential
- **Module dependency**: Task A's output is Task B's input → A before B
- **INT anchor order**: INT-### sequence constraints defined in DESIGN.md
- **EXT anchor order**: External dependency setup must precede consumption

Output: Task DAG → PROMPT.md Section 5 (Task Units).

#### 4b. Batch Spec: Spec-Level Dependency Analysis

Analyze dependencies between specs:
- Identify cross-spec dependencies from each DESIGN.md's interaction anchors
- Detect files shared between specs
- Identify module ownership overlap from each DESIGN.md's module list

Output: Spec DAG.

### 5. Parallelism Gate (File Overlap + Logical Dependency)

File overlap detection and dependency analysis form the **dual gate that determines parallelism**. Parallel execution is only permitted when BOTH conditions are met:

1. Collect the file list each task unit is expected to modify
2. Compare file lists and mark overlaps — zero overlap is required for parallel execution. Any file overlap at all → must be sequential. This is a hard constraint — never dispatch parallel workers for tasks sharing a file.
3. Check for logical dependencies between task units — even with no file overlap, tasks that depend on each other's output must run sequentially.

### 6. Write Worker Prompts (One Per Dispatchable Task)

For each task that needs an independent worker, write a self-contained worker prompt. Save each prompt to a separate file under `<spec_dir>/plan/` or `<batch_dir>/plan/`.

**Worker prompt file naming**: `plan/T{batch}.{sequence}-{kebab-case-name}.md`

Use `assets/templates/WORKER_PROMPT.md`. The template follows the P1-P5 architecture:

| Section | Purpose (P#) |
|---------|--------------|
| 1. Mission & Rules | Goal + behavioral rules |
| 2. Context | Files to read, background knowledge |
| 3. Tasks | Concrete file-level instructions (file, line range, change) |
| 4. Verification | Commands and expected results |
| 5. Scope & References | Allowed/forbidden files, related references |

**Writing principles (move these to your process, not the template):**
- **Self-contained**: Workers do not see the coordinator's context. The prompt must include everything necessary. Do not rely on shared context or assume the worker has read other documents.
- **Concrete**: For every file the worker must modify, specify: (1) the exact file path, (2) the function or line range, (3) what to add, delete, or change. Do not write "fix it", "update as needed", or "based on your findings".
- **Declarative**: Describe "what to do", not "which tool to use".
- **Clear boundaries**: Explicitly list allowed and forbidden files. A worker should never need to guess which files it can modify.

Tasks that do not need a worker (purely procedural operations) do not get a worker prompt. The coordinator handles these directly in the corresponding batch.

### 7. Create Batch Schedule

Based on dependency analysis and file overlap detection, build the batch schedule → PROMPT.md Section 7 (Batch Schedule).

**Batch partitioning principles (file overlap and logical dependency are the hard gates):**
- Within the same batch: tasks must have ZERO file overlap AND no logical dependency — only then may they dispatch workers in parallel. Tasks with file overlap or logical dependency must be placed in separate sequential batches regardless.
- Between batches: the previous batch must complete and pass its gate before the next batch begins
- A final integration batch handles housekeeping tasks (lockfile update, final test suite)

### 8. Define Error Recovery & Boundaries (→ RULES section)

Populate the RULES section with boundaries and error recovery rules that fit the specific task. Think through:

- **What must the coordinator always do?** (e.g., verify after each batch, digest worker results, clean up temporary state)
- **What should pause and ask the user?** (e.g., scope changes, external dependencies, repeated failures)
- **What must the coordinator never do?** (e.g., write source code, skip verification, spawn nested workers)
- **How should failures be handled?** Consider retry limits, escalation paths, and what happens when a worker fails mid-batch

The ALWAYS / ASK FIRST / NEVER framework is a useful structure, but adapt it as the task demands. The rules should emerge from the coordinator role and the task's specific constraints, not from a fixed template.

### 9. Fill PROMPT.md Sections

Use `assets/templates/PROMPT.md`. The template has three content sections — here is guidance on what each should contain:

**ROLE** — Define the coordinator's mission and responsibilities. Describe what the coordinator does, what it avoids, and what success looks like. Derive the mission from SPEC.md's Goal and business value.

**RULES** — The operating boundaries and error recovery rules you designed in step 8. Structure them clearly so the coordinator can reference them during execution.

**WORKING STEPS → 1. PREPARATION** — List the files the coordinator must read before starting, with brief context on what each file provides. This typically includes SPEC.md (requirements), DESIGN.md (architecture), CHECKLIST.md (verification gates), references/, and all worker prompt files.

**WORKING STEPS → 2. COORDINATION** — The batch execution plan from steps 3-7. Describe each batch, which tasks it contains, whether they run in parallel or sequentially, their dependencies, and the verification gate that must pass before proceeding. Reference worker prompt files by their `plan/*.md` paths. The format should be clear enough that the coordinator can execute without ambiguity.

**WORKING STEPS → 3. FINAL VERIFICATION** — The meta-checks that confirm completeness. Extract these from CHECKLIST.md's verification gates.

The exact format, detail level, and structure of each section should fit the task — a simple spec needs less detail than a complex batch spec.

### 10. Pre-delivery Quality Check

Before delivering, review the following:

**Worker prompts — are they truly self-contained?**
Scan for phrases like "based on your findings", "fix it appropriately", "as discussed above" — these leak context assumptions. Every fact the worker needs should be written inline.
Are file paths and line ranges concrete? Is the verification command precise (not just "run tests")?

**Coverage — is anything missing?**
Every BDD requirement from SPEC.md should map to at least one task. Every DESIGN.md module should be addressed or explicitly noted as unchanged. Every CHECKLIST.md verification gate should appear somewhere in the execution plan.

**Consistency — does the schedule hold together?**
Dependencies and batch ordering should be consistent. No task should be scheduled before its dependencies complete. No task should be orphaned (defined but never scheduled). Every worker prompt should have a matching entry in the execution plan.

### 11. Produce PROMPT.md and Worker Prompts

Place the PROMPT.md at the root of the spec or batch spec directory.
Place worker prompts in `<spec_dir>/plan/` or `<batch_dir>/plan/`.

## Examples

- "Generate a coordinator prompt for a single spec" → Read SPEC.md + DESIGN.md + references/ → Decompose into 3 tasks → T1.1 and T1.2 have no file overlap → parallel → Write worker prompts to `plan/` → Schedule: Batch 1 parallel T1.1+T1.2 → Batch 2 T1.3 → Output PROMPT.md + plan/*.md
- "Generate a coordinator prompt for a batch spec with 4 specs" → Read all SPEC.md + DESIGN.md + references/ → Build spec DAG → Detect cross-spec file overlap → Schedule batches → Write worker prompts to `plan/` → Output PROMPT.md + plan/*.md
- "Two tasks modify the same file" → Assign to different batches, each with an independent worker prompt in `plan/`, sequential execution → Reference both prompt paths in PROMPT.md

## References

- `assets/templates/PROMPT.md` — Coordinator prompt template
- `assets/templates/WORKER_PROMPT.md` — Worker prompt template (used in Step 6)
