# Implementation Coordinator Prompt: CodeGraph Integration

- **Date**: 2026-06-03
- **Type**: Batch Spec（3 sub-specs）
- **Source Specs**:
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-lifecycle/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-discovery/SPEC.md`
  - `docs/plans/2026-06-03/codegraph-integration/codegraph-validation/SPEC.md`
- **Source Design**: `docs/plans/2026-06-03/codegraph-integration/DESIGN.md`
- **Source Checklist**: `docs/plans/2026-06-03/codegraph-integration/CHECKLIST.md`

---

## 1. Your Role

**You are the implementation coordinator.** You do not write code. Your job is to think, plan, delegate, synthesize, and verify.

### What you do

- Read and understand the mission, scope, technical context, and task definitions below
- Spawn workers to execute individual tasks, giving each a self-contained prompt (provided in Section 6)
- Wait for all workers in a batch to complete, then digest their results
- Run verification commands at each checkpoint
- Decide whether to proceed to the next batch, retry a failed worker, or halt
- Handle lightweight coordination tasks: resolving merge conflicts, updating lockfiles
- Commit all changes in a single commit after the final verification gate passes

### What you NEVER do

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Skip a verification checkpoint
- Proceed to the next batch when the current batch has not passed verification
- Delegate comprehension — digest every worker result yourself before deciding next steps
- Let workers spawn their own workers (workers are leaf nodes)

---

## 2. Mission

Embed `@colbymchenry/codegraph` (37.9k stars) into the `apltk` CLI via its programmatic API, providing LLM agents with deterministic code structure data. This eliminates ~80% of the token consumption and hallucination risk in architecture diagram generation by replacing manual grep/Read discovery with tree-sitter parsed knowledge graph queries.

**Success looks like**: LLM agents can run `apltk codegraph survey` instead of spawning grep/Read subagents, and `apltk codegraph verify` catches every "referenced symbol does not exist" hallucination before it enters the atlas.

---

## 3. Scope & Boundaries

### What we WILL implement

- New npm package `@laitszkin/tool-codegraph` at `packages/tools/codegraph/`
- CLI commands: `codegraph init`, `sync`, `status`, `search`, `explore`, `survey`, `list-apis`, `verify`
- Existing tool enhancement: `architecture apply <yaml>` (batch mutations), `architecture template --spec <dir>` (skeleton generation)
- CLI registration in `packages/cli/tool-registration.ts`
- Node.js engine upgrade to `>=22.5.0`
- Skill workflow updates: `skills/design/SKILL.md` step 5, `skills/init-project-html/SKILL.md` workflow

### What we will NOT implement

- No file watcher or daemon mode (CLI is short-lived process)
- No semantic search (vector search) — FTS5 only
- No atlas YAML schema changes — `apply` is compatible with existing mutations
- No ELK.js layout or rendering pipeline changes
- No automatic architecture inference from SPEC.md — LLM still makes design decisions

---

## 4. Technical Context

### Modules involved

| Module | Responsibility | Key files |
|---|---|---|
| `@laitszkin/tool-codegraph` | All `codegraph`-prefixed CLI commands | `packages/tools/codegraph/*` |
| `@laitszkin/tool-architecture` (enhanced) | `apply` + `template` new commands | `packages/tools/architecture/index.ts` |
| `@colbymchenry/codegraph` | External dependency — programmatic API | `node_modules/@colbymchenry/codegraph` |

### Invariants — must never be broken

1. Spec overlay references to existing features must be verifiable against CodeGraph index — `verify` must catch `symbol_not_found`
2. `architecture apply` must preserve existing undo snapshot mechanism — all batch mutations must be recoverable
3. Each CLI command opens and closes a fresh CodeGraph instance — no shared state between commands

### Technical decisions to follow

- **Decision**: Each command creates its own `CodeGraph` instance (`init()` or `open()`) and calls `.close()` after completion. Workers must: use `cg-instance.ts` helper for consistent instance lifecycle.
- **Decision**: All query commands support `--json` flag + auto-detect non-TTY for JSON output. Workers must: use `formatter.ts` for output formatting.
- **Decision**: survey submodule grouping uses call-graph connectivity analysis + directory structure. Workers must: implement `survey/grouper.ts` with the hybrid algorithm described in DESIGN.md Section 7.2.
- **Decision**: Node.js engine upgraded to `>=22.5.0`. Workers must: update `package.json` engines field AND `.nvmrc` if present.
- **Decision**: `verify` automatically skips symbols belonging to features declared as `action: add` in the spec overlay. Workers must: implement the skip-new logic in `verify/checker.ts`.

### CodeGraph API Mapping

| Wrapper command | CodeGraph API to call |
|---|---|
| `codegraph init` | `CodeGraph.init(root)` |
| `codegraph init --index` | `CodeGraph.init(root, {index: true})` |
| `codegraph sync` | `CodeGraph.open(root)` + `.sync()` |
| `codegraph status` | `CodeGraph.open(root)` + `.getStats()` |
| `codegraph search` | `CodeGraph.open(root)` + `.searchNodes(query)` |
| `codegraph explore` | `.searchNodes()` + `.getCallers()` + `.getCallees()` + `.buildContext()` |
| `codegraph survey` | `.getFiles()` + `.searchNodes()` + `.getCallers()` + `.getCallees()` + grouper logic |
| `codegraph list-apis` | `.searchNodes()` + `.getCallers()` |
| `codegraph verify` | `state.loadOverlay()` + `.searchNodes()` + `.getCallers()` |

---

## 5. Task Units

### T1.1: Create core codegraph package

- **Goal**: Create `packages/tools/codegraph/` with all command implementations
- **Files**:
  - `packages/tools/codegraph/package.json` (new)
  - `packages/tools/codegraph/tsconfig.json` (new)
  - `packages/tools/codegraph/index.ts` (new — ToolDefinition + dispatch)
  - `packages/tools/codegraph/lib/cg-instance.ts` (new)
  - `packages/tools/codegraph/lib/formatter.ts` (new)
  - `packages/tools/codegraph/lib/cmd-init.ts` (new)
  - `packages/tools/codegraph/lib/cmd-sync.ts` (new)
  - `packages/tools/codegraph/lib/cmd-status.ts` (new)
  - `packages/tools/codegraph/lib/cmd-search.ts` (new)
  - `packages/tools/codegraph/lib/cmd-explore.ts` (new)
  - `packages/tools/codegraph/lib/cmd-survey.ts` (new)
  - `packages/tools/codegraph/lib/cmd-list-apis.ts` (new)
  - `packages/tools/codegraph/lib/cmd-verify.ts` (new)
  - `packages/tools/codegraph/lib/survey/scanner.ts` (new)
  - `packages/tools/codegraph/lib/survey/grouper.ts` (new)
  - `packages/tools/codegraph/lib/verify/checker.ts` (new)
- **Depends on**: — (no dependency)
- **Verify**:
  - Command: `node -e "import('./dist/index.js').then(m => console.log(m.tool.name))"`
  - Expected: prints `codegraph`

### T1.2: Add apply + template to architecture tool

- **Goal**: Add `architecture apply <yaml>` and `architecture template --spec <dir>` as new commands to existing tool
- **Files**: `packages/tools/architecture/index.ts` (modify — add new command handlers)
- **Depends on**: — (no dependency — independent of T1.1)
- **Verify**:
  - Command: `node -e "import('./dist/index.js').then(m => console.log('apply' in m))"`
  - Expected: tool can parse `apply` subcommand

### T1.3: Register codegraph tool in CLI

- **Goal**: Add codegraph to tool registry AND update Node.js engine requirement
- **Files**:
  - `packages/cli/tool-registration.ts` (modify — add `@laitszkin/tool-codegraph` to TOOL_MODULE_NAMES)
  - `package.json` (modify — engines.node from >=20.19.0 to >=22.5.0)
  - `.nvmrc` (modify if exists — set to 22.5.0)
- **Depends on**: — (no dependency — string-only change, no build-time import needed)
- **Verify**:
  - Command: `grep -c "tool-codegraph" packages/cli/tool-registration.ts`
  - Expected: ≥1 match

### T1.4: Update skill documentation

- **Goal**: Update design + init-project-html skills to use new CodeGraph tools
- **Files**:
  - `skills/design/SKILL.md` (modify — update step 5 workflow)
  - `skills/init-project-html/SKILL.md` (modify — update workflow)
- **Depends on**: — (no dependency — pure documentation changes)
- **Verify**:
  - Command: `grep -c "codegraph" skills/design/SKILL.md skills/init-project-html/SKILL.md`
  - Expected: multiple matches showing tool integration

---

## 6. Worker Prompt Library

### T1.1: Create core codegraph package

```
## Mission
Create the `@laitszkin/tool-codegraph` npm package under `packages/tools/codegraph/` with all CLI command implementations. This package wraps `@colbymchenry/codegraph`'s programmatic API to provide `apltk codegraph *` commands for deterministic code structure discovery.

## Input
- Read these existing files for reference patterns:
  - `packages/tools/architecture/index.ts` — existing tool handler pattern (ToolDefinition + handler export)
  - `packages/tools/architecture/package.json` — existing tool package.json pattern
  - `packages/tool-registry/types.ts` — ToolDefinition interface
  - `packages/tool-registry/registry.ts` — registerTool function
- Read for state management (verify command needs this):
  - `skills/init-project-html/lib/atlas/state.js` — loadOverlay function
  - `skills/init-project-html/lib/atlas/schema.js` — schema validation

## What to do

### Step 1: Create package scaffolding

1. Create `packages/tools/codegraph/package.json` following the same pattern as `packages/tools/architecture/package.json`:
   - name: `@laitszkin/tool-codegraph`
   - Add dependency: `"@colbymchenry/codegraph": "^0.9.0"`
   - Add dependency: `"@laitszkin/tool-registry": "*"`

2. Create `packages/tools/codegraph/tsconfig.json` referencing the project's root tsconfig.

3. Create `packages/tools/codegraph/index.ts`:
   - Export `tool: ToolDefinition` with name `codegraph`, category `"Code analysis"`, description `"CodeGraph code intelligence — init, sync, status, search, explore, survey, list-apis, verify"`
   - Implement `handler(args, context)` that dispatches to sub-commands based on first argument
   - Import all command handlers from `./lib/cmd-*.ts`

### Step 2: Create shared infrastructure

4. Create `packages/tools/codegraph/lib/cg-instance.ts`:
   - Export `async function createOrOpenIndex(projectRoot: string, options?: {index?: boolean}): Promise<CodeGraph>`
   - Wraps `CodeGraph.init()` and `CodeGraph.open()` with proper error handling
   - Auto-discover project root from cwd (walk up for `.codegraph/` or package.json)
   - Export `function closeIndex(cg: CodeGraph): void`

5. Create `packages/tools/codegraph/lib/formatter.ts`:
   - Export `function formatOutput(data: unknown, options: {json?: boolean, tty?: boolean}): string`
   - TTY mode: human-readable tables/headings
   - Non-TTY/--json: JSON.stringify with 2-space indent
   - Auto-detect TTY via `process.stdout.isTTY`

### Step 3: Implement lifecycle commands

6. Create `packages/tools/codegraph/lib/cmd-init.ts`:
   - Export `async function handleInit(projectRoot: string, options: {index?: boolean}): Promise<number>`
   - Call `cg-instance.ts` createOrOpenIndex with appropriate options
   - If `--index`, show progress via `onProgress` callback printed to stdout
   - Report success with summary

7. Create `packages/tools/codegraph/lib/cmd-sync.ts`:
   - Export `async function handleSync(projectRoot: string): Promise<number>`
   - Open existing index, call `.sync()`, show delta summary

8. Create `packages/tools/codegraph/lib/cmd-status.ts`:
   - Export `async function handleStatus(projectRoot: string): Promise<number>`
   - Open existing index, call `.getStats()`, format output

9. Create `packages/tools/codegraph/lib/cmd-search.ts`:
   - Export `async function handleSearch(projectRoot: string, query: string, options: {limit?: number, json?: boolean}): Promise<number>`
   - Open existing index, call `.searchNodes(query)`, format results

### Step 4: Implement discovery commands

10. Create `packages/tools/codegraph/lib/cmd-explore.ts`:
    - Export `async function handleExplore(projectRoot: string, query: string, options: {json?: boolean}): Promise<number>`
    - Search for symbols, then for each result call `.getCallers()` and `.getCallees()`
    - Call `.buildContext(query)` for markdown/JSON context
    - Output: source code grouped by file + relationship map (callers/callees per symbol)

11. Create `packages/tools/codegraph/lib/cmd-list-apis.ts`:
    - Export `async function handleListApis(projectRoot: string, feature?: string, options: {json?: boolean, all?: boolean}): Promise<number>`
    - If `--all`: scan whole project for public functions (exported symbols)
    - If specific feature: search within that directory
    - For each symbol found, call `.getCallers()` to list who uses it
    - Output: API directory with function name, params (from CodeGraph node), file path, line number, caller list

12. Create `packages/tools/codegraph/lib/survey/scanner.ts`:
    - Export `async function scanDirectory(cg: CodeGraph, dirPath: string): Promise<ScanResult>`
    - Get all files in directory via `.getFiles()`
    - For each file, search for exported/defined symbols
    - Return structured file + symbol list

13. Create `packages/tools/codegraph/lib/survey/grouper.ts`:
    - Export `function groupIntoSubmodules(scan: ScanResult): SubmoduleSuggestion[]`
    - Algorithm (hybrid — see DESIGN.md Section 7.2):
      a. Build call graph from all symbols in the scan result
      b. Use simple connectivity analysis: if function A calls B and B calls A (mutual), group them
      c. If a function is called by many others in the same directory, mark it as a submodule entry point
      d. If a group of functions share a common prefix or are in the same file, prefer grouping them
      e. If no clear connectivity clusters emerge, fall back to per-file grouping
    - Each suggestion has: slug, kind (infer from content: "api" for handlers, "service" for business logic, "db" for data access), role text, list of member functions

14. Create `packages/tools/codegraph/lib/cmd-survey.ts`:
    - Export `async function handleSurvey(projectRoot: string, dirPath: string, options: {feature?: string, json?: boolean}): Promise<number>`
    - Call `scanner.scanDirectory()` to get raw scan
    - Call `grouper.groupIntoSubmodules()` to get suggestions
    - Build edge suggestions from cross-directory call relationships
    - Output: SurveyReport with files, entryPoints, suggestedSubmodules, suggestedEdges

### Step 5: Implement validation command

15. Create `packages/tools/codegraph/lib/verify/checker.ts`:
    - Export `async function verifyOverlay(cg: CodeGraph, overlay: any): Promise<VerifyReport>`
    - For each feature/submodule/function/edge in the overlay:
      - If the referenced feature slug is declared as `action: add` in the overlay itself → SKIP (new feature, no code yet)
      - If referencing an existing feature → call `.searchNodes()` to confirm the symbol exists
      - If referencing an edge (caller/callee) → confirm both symbols exist
    - Return VerifyReport with passed count, failed items (type, location, suggestion), skipped count

16. Create `packages/tools/codegraph/lib/cmd-verify.ts`:
    - Export `async function handleVerify(projectRoot: string, specDir: string, options: {json?: boolean}): Promise<number>`
    - Read spec overlay from `specDir/architecture_diff/atlas/` using state.js patterns (loadOverlay)
    - Call `checker.verifyOverlay()` with the overlay data
    - Exit 0 if all passed, exit 1 if any failures

### Step 6: Wire dispatch in index.ts

17. In `packages/tools/codegraph/index.ts`, add dispatch logic:
    - `init` → `cmd-init.handleInit()`
    - `sync` → `cmd-sync.handleSync()`
    - `status` → `cmd-status.handleStatus()`
    - `search <query>` → `cmd-search.handleSearch()`
    - `explore <query>` → `cmd-explore.handleExplore()`
    - `survey [dir]` → `cmd-survey.handleSurvey()`
    - `list-apis [feature]` → `cmd-list-apis.handleListApis()`
    - `verify --spec <dir>` → `cmd-verify.handleVerify()`
    - Unknown subcommand → print help listing available commands

## Scope
- Allowed files:
  - `packages/tools/codegraph/**` (new files — you create all of them)
  - `skills/init-project-html/lib/atlas/state.js` (read only — for verify overlay parsing)
  - `skills/init-project-html/lib/atlas/schema.js` (read only — for schema reference)
  - `packages/tools/architecture/index.ts` (read only — for pattern reference)
  - `packages/tools/architecture/package.json` (read only — for pattern reference)
  - `packages/tool-registry/types.ts` (read only — for ToolDefinition reference)
  - `packages/tool-registry/registry.ts` (read only — for registerTool reference)
- Forbidden files:
  - `packages/tools/architecture/index.ts` (do not modify — belongs to T1.2)
  - `packages/cli/tool-registration.ts` (do not modify — belongs to T1.3)
  - `package.json` (do not modify engines — belongs to T1.3)
  - `skills/design/SKILL.md` (do not modify — belongs to T1.4)
  - `skills/init-project-html/SKILL.md` (do not modify — belongs to T1.4)

## Output
On completion, report:
- All files created (absolute paths)
- Command dispatch table (which subcommand maps to which handler)
- Test results from running the verify step below
- Any blockers or risks encountered

## Verify
- Run: `cd packages/tools/codegraph && npx tsc --noEmit`
- Expected: TypeScript compiles without errors (all imports resolve correctly)
- Run: `cd /tmp && mkdir test-cg && cd test-cg && echo "export const x = 1" > test.ts && apltk codegraph init --index`
- Expected: index creates successfully with "test.ts" counted in summary

## Boundaries
- Do not modify any file in the forbidden list
- Do not add external dependencies beyond `@colbymchenry/codegraph` and `@laitszkin/tool-registry`
- Each command handler must be a separate file in `lib/`
- If `@colbymchenry/codegraph` types or API don't match expectations, stop and report — do not guess
- Use async/await consistently — all CodeGraph API methods return Promises
```

### T1.2: Add apply + template to architecture tool

```
## Mission
Add two new subcommands to the existing `apltk architecture` tool: `apply <yaml>` for batch atlas mutations, and `template --spec <dir> --output <dir>` for generating proposal skeletons from SPEC.md.

## Input
- Read the existing architecture tool:
  - `packages/tools/architecture/index.ts` — current handler and dispatch logic
  - `skills/init-project-html/references/architecture.md` — existing CLI mutation reference
  - `skills/init-project-html/lib/atlas/state.js` — state management API (load, save, loadOverlay, saveOverlay)
  - `skills/init-project-html/lib/atlas/schema.js` — emptyState, schema validation
  - `skills/init-project-html/references/TEMPLATE_SPEC.md` — atlas spec schema reference
  - `skills/init-project-html/lib/atlas/cli.js` — how existing mutations work (for pattern reference)

## What to do

### Step 1: Add `architecture apply <yaml>` handler

Add a new handler function in `packages/tools/architecture/index.ts`:

1. Parse a YAML file containing batch mutation declarations (see format below)
2. For each `action: add` entry, call the equivalent mutation that the existing CLI does
3. For each `action: remove` entry, call the equivalent removal mutation
   - Removing a feature cascades to all its submodules
   - Removing an edge removes only that edge
4. For each `action: modify` entry, call the equivalent set mutation
5. Process in order: features → submodules → functions → edges (maintain referential integrity)
6. If any step fails, abort remaining changes — preserve undo snapshot for full rollback
7. Auto-render after completion (same as existing mutations)

Supported YAML format:
```yaml
features:
  - slug: password-reset
    title: "Password Reset"
    action: add             # add | modify | remove
    submodules:
      - slug: reset-service
        kind: service
        action: add
        functions:
          - name: requestReset
            action: add
edges:
  - from: password-reset/reset-service
    to: user/user-repository
    kind: call
    action: add
```

### Step 2: Add `architecture template --spec <dir> --output <dir>` handler

Add a handler that:

1. Reads `SPEC.md` from `--spec <dir>`  
2. Extracts the Goal and title to generate a feature slug
3. (Optional) If CodeGraph index exists, runs `list-apis --all` to retrieve existing API directory and attach it as comments
4. Generates a minimal proposal.yaml with:
   - Feature slug + title from SPEC.md
   - Empty submodules array with comment `# LLM: fill in submodules`
   - Empty edges array
   - If CodeGraph data available, API directory appended as reference comments
5. Writes to `--output <dir>/proposal.yaml`

If SPEC.md doesn't exist at the path, generate a fully empty skeleton with placeholder comments.

## Scope
- Allowed files:
  - `packages/tools/architecture/index.ts` (modify — add new handler code)
  - `skills/init-project-html/lib/atlas/state.js` (read only — understand mutation API)
  - `skills/init-project-html/lib/atlas/schema.js` (read only — schema reference)
  - `skills/init-project-html/lib/atlas/cli.js` (read only — pattern reference)
  - `skills/init-project-html/references/architecture.md` (read only)
  - `skills/init-project-html/references/TEMPLATE_SPEC.md` (read only)
- Forbidden files:
  - Any file outside `packages/tools/architecture/index.ts` (do not modify)
  - `packages/tools/architecture/index.ts` is the only file you modify

## Output
On completion, report:
- Summary of changes to `packages/tools/architecture/index.ts`
- The YAML format decided for `apply`
- How template reads SPEC.md (simple path heuristic or actual markdown parsing)
- Test results

## Verify
- Run: `cd packages/tools/architecture && npx tsc --noEmit`
- Expected: TypeScript compiles without errors
- Review the modified `index.ts` to confirm:
  - `apply` subcommand parses YAML and calls mutation functions
  - `template` subcommand reads a directory and produces a YAML file
  - Error handling: format errors give file+line, mid-batch failures trigger undo

## Boundaries
- Do not modify state.js or cli.js — import/reuse their exported functions
- `apply` must be a new subcommand, not a wrapper that calls the CLI as subprocess
- Reuse the existing emptyState() and normalizeFeature()/normalizeSubmodule() from schema.js
- The undo snapshot mechanism must work: if apply fails mid-batch, state must be recoverable via `apltk architecture undo`
```

### T1.3: Register codegraph tool in CLI

```
## Mission
Register the new `@laitszkin/tool-codegraph` package in the CLI tool registry, and update the project's Node.js engine requirement to `>=22.5.0` (required by `@colbymchenry/codegraph`'s programmatic API for `node:sqlite`).

## Input
- Read `packages/cli/tool-registration.ts` — the TOOL_MODULE_NAMES array and TOOL_NAMES Set
- Read `package.json` — the engines field
- Check if `.nvmrc` exists at project root

## What to do

### Step 1: Register tool
1. In `packages/cli/tool-registration.ts`:
   - Add `'@laitszkin/tool-codegraph'` to the TOOL_MODULE_NAMES array (alphabetical order)

### Step 2: Update Node.js engine
2. In `package.json`:
   - Change `"engines": { "node": ">=20.19.0" }` to `"engines": { "node": ">=22.5.0" }`

3. If `.nvmrc` exists at project root:
   - Update its content to `22.5.0` or `lts/iron` (Node 22 LTS codename)

## Scope
- Allowed files:
  - `packages/cli/tool-registration.ts` (modify — one-line addition)
  - `package.json` (modify — engines.node value only)
  - `.nvmrc` (modify if exists)
- Forbidden files:
  - Any other file

## Output
On completion, report:
- The exact line added to TOOL_MODULE_NAMES
- The engines.node change
- Whether .nvmrc was updated

## Verify
- Run: `grep "tool-codegraph" packages/cli/tool-registration.ts`
- Expected: shows the package name in TOOL_MODULE_NAMES
- Run: `grep '"node"' package.json`
- Expected: `"node": ">=22.5.0"`

## Boundaries
- Do not modify any other aspect of package.json (version, scripts, dependencies, etc.)
- Do not touch the TOOL_NAMES Set — codegraph commands don't need aliases
```

### T1.4: Update skill documentation

```
## Mission
Update the `design` and `init-project-html` skills to integrate the new CodeGraph CLI tools into their workflows, replacing the current grep/Read-heavy manual discovery steps with deterministic CodeGraph queries.

## Input
- Read `skills/design/SKILL.md` — focus on Step 5 (Generate Architecture Diff, lines ~130-180)
- Read `skills/init-project-html/SKILL.md` — focus on Workflow sections

## What to do

### Step 1: Update design skill (skills/design/SKILL.md)

In Step 5 (Generate Architecture Diff), add CodeGraph tools between the current Step 5b and 5c:

After "5b. Measure Baseline Drift", insert:
```
### 5b.1 Query CodeGraph for integration surface

If the project has been indexed with CodeGraph (`.codegraph/` exists):

```bash
apltk codegraph list-apis --all
```

This returns the complete public API directory of the existing system—every symbol, its parameters, callers, and file location—deterministically parsed by tree-sitter. Use this data to understand which existing services and repositories the new feature can integrate with.

For deeper context on a specific area:

```bash
apltk codegraph explore "feature-name"
```
```

Also update Step 5c introduction to note that feature/submodule definitions should reference CodeGraph data where possible.

### Step 2: Update init-project-html skill (skills/init-project-html/SKILL.md)

In the Workflow section (Step 1, "閱讀並理解代碼庫"), add a CodeGraph step before the subagent dispatch:

After "按照功能模塊定義，全面檢索代碼庫。" insert:

```
### CodeGraph 加速（如已安裝 CodeGraph）

如果專案已安裝 `@colbymchenry/codegraph`，可以使用：

```bash
apltk codegraph survey
```

取得整個專案的結構調查報告——包含所有檔案、公開函式、呼叫關係，以及建議的 submodule 分組。Subagent 不需逐個 grep/Read 檔案，直接分析這份報告即可。

針對特定功能模組：
```bash
apltk codegraph survey src/features/<slug>/
```
```

### Step 3: Add tool reference in both skills

In both skills, add a **References** section note about the new CodeGraph tools (if not already present):

```
- `apltk codegraph` commands: `init`, `sync`, `status`, `search`, `explore`, `survey`, `list-apis`, `verify`
```

## Scope
- Allowed files:
  - `skills/design/SKILL.md` (modify)
  - `skills/init-project-html/SKILL.md` (modify)
- Forbidden files:
  - Any file outside the two SKILL.md files

## Output
On completion, report:
- Which sections were modified in each SKILL.md
- The exact text inserted
- Whether any existing text was removed or just appended

## Verify
- Run: `grep -c "codegraph" skills/design/SKILL.md`
- Expected: ≥2 matches showing CodeGraph tool references
- Run: `grep -c "codegraph" skills/init-project-html/SKILL.md`
- Expected: ≥2 matches showing CodeGraph tool references

## Boundaries
- Do not rewrite or restructure SKILL.md sections beyond the specified insertions
- Do not remove existing workflow steps — CodeGraph is additive, not replacement
- Maintain the existing document style (Chinese for init-project-html, English for design)
```

---

## 7. Batch Schedule

All workers modify completely different files — none share file ownership. Run all in parallel.

### Batch 1 — All implementation (full parallelism)

- **Tasks**: T1.1, T1.2, T1.3, T1.4
- **Strategy**: Dispatch 4 workers in parallel (no file overlap)
- **Gate** (all items must pass before proceeding):
  - [ ] T1.1 worker reports success + TypeScript compiles for codegraph package
  - [ ] T1.2 worker reports success + TypeScript compiles for architecture tool
  - [ ] T1.3 worker reports success + tool-codegraph appears in registry
  - [ ] T1.4 worker reports success + both SKILL.md files reference codegraph
  - [ ] Run `cd packages/tools/codegraph && npx tsc --noEmit` (verify codegraph package builds)
  - [ ] Run `cd packages/tools/architecture && npx tsc --noEmit` (verify architecture tool still builds)

### No Batch 2 needed — all tasks fit in a single parallel batch. No sequential dependencies exist.

### Final Integration (coordinator handles directly)

- **Tasks**: Build + Test + Commit
- **Strategy**: Coordinator handles directly (procedural operations)
- **Depends on**: Batch 1 gate passed
- **Gate**:
  - [ ] Full project build: `npm run build` (from project root)
  - [ ] Full test suite: `npm test` (all existing tests pass)
  - [ ] No regression in architecture tool: `node -e "import('./dist/bin/apollo-toolkit.js').then(m => m.run(['architecture', 'validate']))"` (exit 0)
  - [ ] Commit message: "feat: integrate @colbymchenry/codegraph CLI tools for deterministic code structure discovery"

---

## 8. Verification Checkpoints

### Per-batch

| Batch | Verification Command | Expected Result |
|---|---|---|
| Batch 1 (after all workers) | `npm run build` | Build succeeds |
| Batch 1 (after all workers) | `npm test` | All tests pass |

### Key behavior checks (from CHECKLIST.md)

| ID | Observable Behavior | How to verify |
|---|---|---|
| LC-01 | `codegraph init` creates `.codegraph/` | Run in temp dir, check directory exists |
| LC-04 | `codegraph sync` updates index | init → add file → sync → search shows new symbol |
| LC-06 | `codegraph search` returns matches | Index known file → search by function name → verify output |
| DI-03 | `codegraph survey` returns structured report | Index a small dir → survey → verify JSON has suggestedSubmodules |
| VA-01 | `codegraph verify` passes on correct overlay | Create valid overlay → verify exit 0 |
| VA-02 | `codegraph verify` fails on bad symbol | Overlay with nonexistent function → verify exit 1 + symbol_not_found |
| VA-04 | `architecture apply` batch add | YAML with 1 feature + 2 submodules → apply → atlas shows both |
| VA-05 | `architecture apply` batch remove | YAML with remove action → apply → feature removed |

### Final verification

- [ ] Full test suite passes: `npm test`
- [ ] Build passes: `npm run build`
- [ ] No lint errors: `npx tsc --noEmit`

---

## 9. Error Recovery

| Scenario | Response |
|---|---|
| A single worker reports failure | Retry with the worker's existing context (do not create a new one), giving more specific guidance. At most one retry. |
| Same worker fails twice | Pause the entire flow. Preserve successful results from other workers in the same batch. Report to the user: which task failed, what was tried, suggested next steps. |
| Merge conflict (merging worker results) | Coordinator resolves the conflict, then re-runs the batch gate verification. |
| Test regression (new code breaks existing tests) | Pause. Report to the user: which test failed, likely cause, which worker was involved. Do not weaken the test to make it pass. |
| Contradiction in SPEC/DESIGN or infeasible design found during implementation | Pause. Document the specific contradiction and notify the user. |
| `@colbymchenry/codegraph` import fails at runtime | Check Node version (needs 22.5+). If version is correct, report the error to the user. |

---

## 10. Boundaries

### ALWAYS

- Run gate verification immediately after every batch
- Extract worker prompts verbatim from Section 6 — do not rewrite them
- After a worker reports, digest the results before deciding next steps
- Follow the File Ownership implied by task assignments — do not let two workers modify the same file
- **Resolve merge conflicts yourself** — when combining worker results, the coordinator handles conflict resolution. This is coordination, not implementation.
- After two failures, pause and ask — do not keep retrying

### ASK FIRST — pause and confirm with the user

- Need to modify a file not defined in SPEC/DESIGN
- Need to add a new external dependency beyond `@colbymchenry/codegraph`
- Worker has failed twice
- Test regression cannot be quickly diagnosed

### NEVER

- Write implementation logic or modify source code beyond resolving merge conflict markers
- Workers spawn sub-workers
- Skip verification and proceed to the next batch
- Give workers vague instructions (e.g., "fix it" or "based on what you found")
- Expand implementation scope beyond Section 3
- Proceed to the next batch when the current batch's gate has not passed
