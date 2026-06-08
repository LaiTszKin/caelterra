---
name: update-project-html
description: Incrementally refresh the architecture atlas when the project diagram drifts from actual code. Measures drift before updating to determine scope, then updates the base atlas and re-renders HTML.
---

## Goal

Incrementally refresh the base atlas and rendered HTML based on code changes in the current branch, working tree, or a specified commit range.
Keep the architecture diagram continuously aligned with the actual codebase.

## Acceptance Criteria

- Architecture drift has been measured before and after the update; the update scope is justified
- All cross-module and intra-module edges reflect the latest code
- Every declared component is backed by source code evidence (`evidence.sourceFile:sourceLine`); unresolved ones are tagged `inferred`
- Non-architectural changes (formatting, config-only, test-only) have been filtered from the diff

## Workflow

### 1. Analyze current code with `apltk codegraph survey`

**Prerequisite** before measuring drift. The code graph provides the structural baseline for comparison with the atlas.

Run `apltk codegraph survey --json` to get a structured view of the current codebase:
- Entry points, function clusters, and suggested submodule groupings
- Cross-boundary edges for identifying architectural relationships

Consult `references/codegraph.md` for detailed flags.

### 2. Review the current atlas

Read the existing architecture diagram.
Capture the relationship between features and submodules.

> Read only `atlas.index.yaml` + the YAML files of affected features. Do not read unrelated features or unchanged modules to preserve context economy.

### 3. Measure architecture drift

Before deciding the update scope, compare the atlas against the current code:

- Compare `atlas.index.yaml` with the current directory structure: are there added / removed directories or modules?
- Compare file paths in each feature YAML against the actual codebase: are any files missing or moved?
- Quantify drift: count of added + removed + modified entries / total entries

Determine the update strategy based on drift severity:
- **Low drift (< 20%)**: Update only the features affected by the diff
- **High drift (≥ 20%)**: Flag as significant divergence, notify the user and recommend a full re-initialization via `init-project-html`

### 4. Filter diff noise

Analyze the diff scope and filter non-architectural changes:

- **Keep**: New or modified API routes, service logic, database operations, module boundary changes
- **Filter**: Formatting adjustments, config value changes (non-structural), test-only files, type definition adjustments (no boundary impact), comment or documentation changes

Map the filtered diff hunks to the affected features.

### 5. Cross-reference code with the current atlas

Dispatch subagents in parallel to cross-reference the code against the architecture diagram and verify whether the atlas has errors or omissions.

### 6. Update the atlas via `apltk` CLI

Use `apltk architecture` commands to update the architecture diagram:

Consult `references/architecture.md` for CLI flag details (parameter reference, mutation series).

1. Define features and their submodules.
2. Define inter-submodule relationships: calls, error handling, data flow, rollback, and other architectural connections.
3. Define intra-submodule functions, variables, data flows, and error handling.

When inferring components from a diff hunk, use `--evidence inferred` with a `file:line` source. For example:
```
apltk architecture add module <slug> --part-of <feature> \
  --evidence inferred:src/auth/controller.ts:42
```

After completing the update, re-measure drift to confirm it has been reduced to an acceptable range.

### 7. Self-review

Confirm the following before finishing:

- [ ] Drift is now within acceptable range (< 20%)
- [ ] Filtered diff noise (formatting, config-only, test-only) did not drive any atlas mutations
- [ ] Every new or modified component carries evidence (`observed` for source-confirmed, `inferred` otherwise)
- [ ] All edges affected by changed code have been reviewed and updated
- [ ] Atlas passes `apltk architecture validate`

## References

- `references/codegraph.md` — `apltk codegraph` CLI reference (consult for subcommand flags).
- `references/architecture.md` — Full parameter reference for the `apltk architecture` tool (consult when CLI flag details are needed).
- `references/definition.md` — Detailed definitions of feature and submodule.
