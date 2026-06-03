# Review Report: CodeGraph Integration — Round 2

- **Date**: 2026-06-03
- **Reviewer**: Claude Code (subagent-assisted per-requirement re-review)
- **Feature**: codegraph-integration
- **Batch**: 3 sub-specs (lifecycle, discovery, validation) — 12 requirements total

---

## Verdict

**Needs Work** — P1 findings exist, indicating at least one requirement is only partially satisfied.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| **Lifecycle** | | | |
| L1: `codegraph init` | ✅ Complete | `cmd-init.ts`, `cg-instance.ts` | — |
| L2: `codegraph init --index` | ✅ Complete | `cmd-init.ts` | — |
| L3: `codegraph sync` | ✅ Complete | `cmd-sync.ts` | — |
| L4: `codegraph status` / `search` | ✅ Complete | `cmd-status.ts`, `cmd-search.ts` | #32 (P3) |
| **Discovery** | | | |
| D1: `codegraph explore` | ✅ Complete | `cmd-explore.ts` | — |
| D2: `codegraph survey` | ✅ Complete | `cmd-survey.ts`, `grouper.ts`, `scanner.ts` | — |
| D3: `codegraph list-apis` | ⚠️ Partial | `cmd-list-apis.ts`, `index.ts` | #33 (P1) |
| **Validation** | | | |
| V1: `codegraph verify --spec` | ✅ Complete | `cmd-verify.ts`, `checker.ts` | — |
| V2: `architecture apply` | ✅ Complete | `architecture/index.ts` | — |
| V3: `architecture template --spec` | ✅ Complete | `architecture/index.ts` | — |
| **Skill Workflows** | | | |
| V4: Update design skill | ⚠️ Partial | `skills/design/SKILL.md` | #28 (P2) |
| V5: Update init-project-html skill | ⚠️ Partial | `skills/init-project-html/SKILL.md` | #29 (P1) |

---

## Findings

Total findings: 5 (0 P0, 2 P1, 2 P2, 1 P3)

### P1 — Requirement Defect

#### #29 V5: init-project-html workflow still uses subagent grep/Read instead of `codegraph survey`

- **Files**: `skills/init-project-html/SKILL.md:55-72`
- **Dimension**: Spec Implementation Omission
- **Requirements**: V5

**Description**: The V5 spec requires the init-project-html skill workflow to be updated so Step 1 uses `apltk codegraph survey` to obtain a project structure report, replacing the current subagent-based grep/Read approach. The current Step 1 (lines 55-72) still dispatches subagents to deep-read each feature module via manual code reading. The `codegraph survey` command is never mentioned anywhere in the skill file. While Step 2 was correctly updated in the fix commit to reference `apltk architecture apply <proposal.yaml>`, the upstream step that should feed structured data into the LLM's design decisions remains the old manual approach. This means the core optimization that survey was designed to provide — deterministic code structure data replacing LLM-driven file discovery — is not realized for the init-project-html workflow.

#### #33 D3: `--all` flag leaks as path argument in `codegraph list-apis`

- **Files**: `packages/tools/codegraph/index.ts:38-41`
- **Dimension**: Spec Implementation Omission
- **Requirements**: D3

**Description**: When running `apltk codegraph list-apis --all`, the `--all` flag is detected at line 39 via `rest.includes('--all')` and `isAll` is correctly set to `true`. However, unlike `--feature` (spliced at line 49), `--spec` (spliced at line 35), and `--limit` (spliced at line 57), `--all` is **never removed from `rest`**. The `pathArg` variable at line 96 captures `rest[0]` which is `'--all'`, and `handleListApis` filters nodes by `filePath.startsWith('--all/')`. The result: `apltk codegraph list-apis --all` returns **no results** — the entire project's API listing, which is the core purpose of the `--all` flag, is silently empty. Without `--all`, the command works correctly for filtered queries.

---

### P2 — Requirement Risk

#### #28 V4: design skill missing explicit `list-apis --all` workflow step

- **Files**: `skills/design/SKILL.md:168-192`
- **Dimension**: Spec Implementation Omission
- **Requirements**: V4

**Description**: The V4 spec requires Step 5 (Generate Architecture Diff) to begin with `apltk codegraph list-apis --all` to obtain integration reference data (replacing subagent grep). The current Step 5e "New flow" section (lines 170-192) jumps straight to "Fill the proposal skeleton" using `apltk architecture template`. While `architecture template` internally enriches the proposal with CodeGraph API data (at `architecture/index.ts:558-583`, up to 50 function nodes written as YAML comments), this is not the standalone, user-visible `list-apis --all` step the spec describes. The LLM running the design skill does not see the full API listing before making design decisions. Functionally the requirement is partially met through template enrichment, but the workflow structure deviates from the spec.

#### #30 L1+L2: `MODULE_NOT_FOUND` error handler is unreachable due to top-level `require()`

- **Files**: `packages/tools/codegraph/lib/cg-instance.ts:5`, `packages/tools/codegraph/index.ts:115-122`
- **Dimension**: Architecture Defect
- **Requirements**: L1+L2

**Description**: The handler in `index.ts` (lines 115-122) includes a catch block that checks for `MODULE_NOT_FOUND` and displays a friendly "run `npm install @colbymchenry/codegraph`" message. However, the `require('@colbymchenry/codegraph')` call at `cg-instance.ts:5` (and in `cmd-sync.ts:3`, `cmd-status.ts:3`) executes at **module evaluation time** — not inside the handler function. These modules are loaded through `packages/cli/tool-registration.ts` dynamic `import()`, so `MODULE_NOT_FOUND` fires during tool registration, not in the handler's try/catch. The result: when `@colbymchenry/codegraph` is not installed, the user sees an unhandled promise rejection rather than the intended helpful error. This could be fixed by deferring the `require()` to inside each handler function (lazy loading).

---

### P3 — Suggestion

#### #31 L1+L2: `--index` flag not spliced from `rest` after parsing

- **Files**: `packages/tools/codegraph/index.ts:42-44`
- **Dimension**: Redundant Code
- **Requirements**: L2

**Description**: The `--index` flag is parsed at line 42 (`rest.includes('--index')`) but, unlike `--feature`, `--spec`, `--limit`, and `--all`, is never removed from `rest` via `splice`. For the `init` subcommand, `rest` is not consumed after this point so there is no functional impact. However, if a user mistakenly passes `--index` to `search` or `explore`, the string would leak into the query argument. Adding `splice` for consistency (matching the pattern established by other flags) would prevent this latent issue.

#### #32 L3+L4: `status` and `search` skip `isInitialized()` check

- **Files**: `packages/tools/codegraph/lib/cmd-status.ts:12`, `packages/tools/codegraph/lib/cmd-search.ts:17`
- **Dimension**: Architecture Defect
- **Requirements**: L3+L4

**Description**: `cmd-sync.ts:12-15` correctly checks `CodeGraph.isInitialized(projectRoot)` before opening, providing a clear error directing the user to run `apltk codegraph init`. However, `cmd-status.ts:12` and `cmd-search.ts:17` call `CodeGraph.open()` directly without this check. On an uninitialized project, users of `status` or `search` receive a generic `CodeGraph.open()` error (routed through the catch handler at `index.ts:115-122`) instead of the targeted "not initialized" message that `sync` provides. Adding consistent `isInitialized()` checks across all lifecycle commands would improve user experience.

---

## Review History

### Round 1 — 2026-06-03
- **Verdict**: Needs Work
- **Issues**: 2 P0, 10 P1, 14 P2, 1 P3 (27 total)
- **Key findings**: Verify parser broke function name extraction (P0); edge relationship verification not implemented (P0); init silently opens instead of erroring on already-initialized project (P1); grouper lacked connectivity analysis (P1); cross-boundary survey calls were inverted (P1); skill workflows missing `architecture apply` steps (P1).

### Round 2 — 2026-06-03
- **Verdict**: Needs Work
- **Issues**: 0 P0, 2 P1, 2 P2, 1 P3 (5 new)
- **Key findings**: All 27 Round 1 findings confirmed fixed by commit `9363284`. New issues: init-project-html still uses subagent grep instead of `codegraph survey` (P1, V5); `list-apis --all` returns empty results due to flag leaking as path argument (P1, D3); design skill missing explicit `list-apis --all` step (P2, V4); MODULE_NOT_FOUND handler unreachable (P2); two minor inconsistencies in flag parsing and initialization checks (P3).

---

## Dimension Summary

Total findings exceed 5. Finding counts by dimension:

| Dimension | Count |
|---|---|
| Spec Implementation Omission | 2 |
| Architecture Defect | 2 |
| Redundant Code | 1 |
| Spec Implementation Deviation | 0 |
| Performance Concern | 0 |
| Hallucinated Code | 0 |

---

*Report generated by the `review` skill. Contains findings only — no fix suggestions or verification methods. Fix planning is handled by the `qa` skill.*
