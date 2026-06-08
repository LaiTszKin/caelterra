# Implementation Coordinator Prompt: 簡化 apltk architecture 指令

- **Date**: 2026-06-07
- **Type**: Single Spec
- **Source Spec**: `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- **Source Design**: `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
- **Source Checklist**: `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md`

---

## 1. Your Role & Rules

### Mission

Simplify the `apltk architecture` CLI tool from 19+ subcommands to 6 intuitive verbs (`add`/`remove`/`diff`/`merge`/`render`/`open`), so AI agents can operate the architecture diagram tool without memorizing fine-grained entity commands. All changes are confined to the CLI dispatch layer — the underlying YAML state format, diff viewer, render engine, and merge logic remain untouched.

**Success looks like**: After all batches complete, `apltk architecture help` shows only `add`, `remove`, `diff`, `merge`, `render`, `open`; `apltk architecture add feature X --depends-on Y` works via delegation to existing verb functions; `apltk architecture apply` and `apltk architecture template` return errors; and all existing tests pass with no regressions.

### Your Role

**You are the implementation coordinator.** You do not write code. Your job is to think, plan, delegate, synthesize, and verify.

**What you do:**
- Read and understand the mission, scope, technical context, and task definitions below
- Spawn workers to execute individual tasks, giving each a self-contained prompt (provided in Section 3 Worker Prompt Index)
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, cleaning up worktrees
- Commit all changes in a single commit after final verification passes

**What you NEVER do:**
- Write implementation logic or modify source code beyond resolving merge conflict markers
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)

### Boundaries

**ALWAYS**
- Run gate verification immediately after every batch
- Extract worker prompts verbatim from `plan/*.md` files — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Follow the File Ownership implied by task assignments — do not let two workers modify the same file
- Resolve merge conflicts yourself — the coordinator handles them
- After each batch completes, clean up any temporary branches or worktrees created by workers
- After two failures, pause and ask — do not keep retrying

**ASK FIRST** — pause and confirm with the user:
- Need to modify a file not defined in SPEC/DESIGN
- Need to add a new external dependency
- Worker has failed twice
- Test regression cannot be quickly diagnosed

**NEVER**
- Write implementation logic or modify source code beyond resolving merge conflict markers
- Let workers spawn sub-workers
- Skip verification and proceed to the next batch
- Give workers vague instructions (e.g., "fix it" or "based on what you found")
- Expand implementation scope beyond what is defined in Section 2 Scope
- Proceed to the next batch when the current batch's gate has not passed

### Error Recovery

| Scenario | Response |
|---|---|
| A single worker reports failure | Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry. |
| Same worker fails twice | Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user: which task failed, what was tried, suggested next steps. |
| Merge conflict (merging worker results) | Coordinator resolves the conflict, then re-runs the batch gate verification. |
| Test regression (new code breaks existing tests) | Pause. Report to the user: which test failed, likely cause, which worker was involved. Do not weaken the test to make it pass. |
| Contradiction in SPEC/DESIGN or infeasible design found during implementation | Pause. Document the specific contradiction and notify the user. |

---

## 2. Context

### Scope

**What we WILL implement:**
- Unified `add` command: `apltk architecture add feature|module|relation <name> [--part-of <f>] [--depends-on <f>] [--data-flow-to <f>] [--implements <f>] [--deployed-on <f>]`
- Unified `remove` command: `apltk architecture remove feature|module|relation <name> [--part-of <f>]`
- Batch mode for `add`: multiple entities in a single command, processed with single final render
- `--spec` flag support for `add`/`remove` to write to spec overlay instead of baseline
- Updated help text showing only 6 public verbs (`add`/`remove`/`diff`/`merge`/`render`/`open`)
- Retired CLI routes: `apply` and `template` no longer reachable via CLI
- Fine-grained verbs (`feature`, `submodule`, `edge`, etc.) hidden from help but still work if called directly

**What we will NOT implement:**
- No changes to `state.js`, `render.js`, `schema.js`, `layout.js`, `diff-viewer.js`
- No changes to the YAML file format or file paths
- No changes to `diff`/`merge`/`render`/`open` behavior
- No circular dependency detection or other graph algorithms
- No `init` command (doesn't currently exist)

### Technical Context

**Modules involved:**

| Module | Responsibility |
|---|---|
| `cli.js` (JS CLI dispatch) | Parses verb and dispatches to handler functions. Add `verbAdd()`/`verbRemove()` and dispatch cases. |
| `cli-help.js` (JS help builder) | Generates help text. Update to show only 6 public verbs, add `add`/`remove` help pages. |
| `index.ts` (TS handler) | Routes architecture subcommands. Remove `apply`/`template` intercepts. |

**Invariants — must never be broken:**
- YAML file format must remain compatible with schema.js type definitions
- `--spec` mode must write only to the spec overlay directory, never to baseline
- Fine-grained verbs (feature add, submodule add, etc.) must still work when called directly

**Technical decisions to follow:**
- **`add`/`remove` implemented in JS (cli.js), not TS (index.ts)** — Because they wrap existing JS verb functions (`verbFeature`, `verbSubmodule`, `verbEdge`). Workers must: implement verbAdd and verbRemove in cli.js and add them to the dispatch switch.
- **Batch mode: sequential apply with suppressed auto-render** — Each entity is applied independently; if one fails, already-applied entities remain committed. This matches existing sequential CLI behavior. Workers must: inject `--no-render` on intermediate entities and call render once at the end.
- **Fine-grained verbs: hidden but not removed** — Help text hides them but the dispatch switch still handles them. Workers must: not remove any existing case from the switch statement.

---

## 3. Execution Plan

### Task Units

#### T1.1: Implement `verbAdd` and `verbRemove` functions in cli.js

- **Goal**: Add unified `add` and `remove` verbs to the CLI dispatch that delegate to existing verb functions
- **Files**: `skills/init-project-html/lib/atlas/cli.js`
- **Worker prompt**: `plan/T1.1-implement-add-remove-verbs.md`
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `node -c skills/init-project-html/lib/atlas/cli.js` → no syntax errors
  - Command: `npm test` → existing tests pass

#### T1.2: Update architecture help text in cli-help.js

- **Goal**: Update help to show only 6 public verbs; add help pages for `add`/`remove`
- **Files**: `skills/init-project-html/lib/atlas/cli-help.js`
- **Worker prompt**: `plan/T1.2-update-architecture-help.md`
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `node -c skills/init-project-html/lib/atlas/cli-help.js` → no syntax errors
  - Command: `npm test` → existing tests pass

#### T1.3: Remove `apply`/`template` routes from index.ts

- **Goal**: Remove CLI routes for `apply` and `template` while keeping handler functions
- **Files**: `packages/tools/architecture/index.ts`
- **Worker prompt**: `plan/T1.3-remove-apply-template-routes.md`
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `npm run build` → build succeeds
  - Command: `node --test packages/tools/architecture/index.test.ts` → report test status

#### T2.1: Update tests

- **Goal**: Update test files for new architecture CLI surface
- **Files**:
  - `packages/tools/architecture/index.test.ts`
  - `test/atlas-cli.test.js`
  - `test/architecture-script.test.js`
- **Worker prompt**: `plan/T2.1-update-tests.md`
- **Depends on**: T1.1, T1.2, T1.3 (all must complete first)
- **Verify**:
  - Command: `npm test` → all tests pass
  - Command: individual test files pass

### Worker Prompt Index

| Task ID | Worker Prompt File | Description |
|---|---|---|
| T1.1 | `plan/T1.1-implement-add-remove-verbs.md` | Add verbAdd/verbRemove to cli.js |
| T1.2 | `plan/T1.2-update-architecture-help.md` | Update help text in cli-help.js |
| T1.3 | `plan/T1.3-remove-apply-template-routes.md` | Remove apply/template routes from index.ts |
| T2.1 | `plan/T2.1-update-tests.md` | Update all test files |

### Batch Schedule

#### Batch 1 — Implementation (Parallel)

- **Tasks**: T1.1, T1.2, T1.3
- **Strategy**: Parallel — no file overlap (cli.js, cli-help.js, index.ts are all different files) and no logical dependency between the three implementation tasks
- **Gate** (all must pass before next batch):
  - [ ] T1.1 worker reports success: `verbAdd`/`verbRemove` added to cli.js, dispatch switch updated
  - [ ] T1.2 worker reports success: help text updated with 6 public verbs, `add`/`remove` help pages added
  - [ ] T1.3 worker reports success: apply/template routes removed from index.ts
  - [ ] Verification: `npm run build` succeeds

#### Batch 2 — Tests (Sequential)

- **Tasks**: T2.1
- **Strategy**: Sequential (depends on Batch 1)
- **Depends on**: Batch 1
- **Gate**:
  - [ ] T2.1 worker reports success: all test files updated
  - [ ] Verification: `npm test` passes with no regressions

#### Batch 3 — Final Integration

- **Tasks**: Full test suite, build, commit
- **Strategy**: Sequential (coordinator handles directly)
- **Depends on**: Batch 2
- **Gate**:
  - [ ] Full test suite passes: `npm test`
  - [ ] Build passes: `npm run build`
  - [ ] All changes committed in a single descriptive commit

---

## 4. Final Verification

- [ ] Every BDD requirement from SPEC.md is addressed by a completed task
  - Req 1 (add single entity) → T1.1
  - Req 2 (add batch mode) → T1.1
  - Req 3 (remove) → T1.1
  - Req 4 (legacy removal) → T1.3 + T1.2
  - Req 5 (no regression) → T2.1 + Batch 3
- [ ] All worker prompts in Section 3 have been dispatched and returned success
- [ ] No orphaned tasks — every Task Unit defined in Section 3 has been completed
- [ ] All changes committed in a single commit

---

## 5. References

- **Worker prompt files**:
  - `plan/T1.1-implement-add-remove-verbs.md`
  - `plan/T1.2-update-architecture-help.md`
  - `plan/T1.3-remove-apply-template-routes.md`
  - `plan/T2.1-update-tests.md`
- **Code files to modify** (across all tasks):
  - `skills/init-project-html/lib/atlas/cli.js` — T1.1
  - `skills/init-project-html/lib/atlas/cli-help.js` — T1.2
  - `packages/tools/architecture/index.ts` — T1.3
  - `packages/tools/architecture/index.test.ts` — T2.1
  - `test/atlas-cli.test.js` — T2.1
  - `test/architecture-script.test.js` — T2.1
- **Project context files**: `CLAUDE.md`, `packages/cli/help-text-builder.ts`, `packages/cli/tool-registration.ts`
- **Related documents**:
  - `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
  - `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
  - `docs/plans/2026-06-07/architecture-simplify/CHECKLIST.md`
