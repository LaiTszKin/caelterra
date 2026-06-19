---
name: init-project-html
description: Initialize the project architecture atlas. Use the apltk CLI to map feature and submodule relationships into a renderable HTML architecture diagram following the C4 model (Context → Container → Component → Code).
---

## Goal

Produce a project architecture diagram via the `apltk` CLI.
Help users understand the project's software architecture.

## Acceptance Criteria

- The diagram covers all four C4 levels: System Context → Container (feature) → Component (submodule) → Code (function row)
- All cross-module and intra-module edges are fully defined
- Every declared component is backed by source code evidence (`evidence.sourceFile:sourceLine`); unresolved ones are tagged `inferred`
- Every submodule must declare its `functions` and `variables` arrays (mandatory, may not be left empty)

## C4 Mapping

This skill's "feature" and "submodule" map to the C4 model as follows:

| C4 Level       | Skill Equivalent | Description                                                            | When to Use                                                                                  |
| -------------- | ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| System Context | Whole system     | System boundaries, external actors, and external systems               | Step 1 — establish baseline awareness                                                        |
| Container      | Feature          | High-level functional boundary (e.g. Login, Payment)                   | Primary abstraction level                                                                    |
| Component      | Submodule        | Implementation unit inside a feature (controller, service, repository) | Primary detail level                                                                         |
| Code           | Function row     | Function-level detail with source file and line evidence               | Mandatory — every submodule must declare its functions with `evidence.sourceFile:sourceLine` |

## Mode Detection

At load time, check the project state to select the correct mode:

- **design** — No `resources/project-architecture/atlas/` directory exists.
  Run full C4 initialization. Use `--evidence observed` for source-confirmed components.

- **record** — Atlas directory exists but is near-empty (< 2 features).
  Run quick feature-by-feature recording using `apltk architecture scan` to discover candidates.
  Use `--evidence inferred` for structurally inferred components.

- **update** — Atlas has substantive content and source code has changed.
  Delegate to `update-project-html` skill for drift measurement and incremental update.

- **review** — An `architecture_diff/` overlay directory exists.
  Run diff comparison workflow. If no diff found, fallback to update mode.

- **guard** — If you are explicitly instructed to run design/init mode but the atlas
  directory already exists and is non-empty, pause and ask the user whether to:
  (a) overwrite the existing atlas, (b) switch to update mode, or (c) abort.

## Workflow

Applicable modes: design (full initialization), record (quick recording)

### 1. Analyze the project with `apltk codegraph`

**Prerequisite** before any architecture work. The code graph provides the source-code evidence that powers the atlas.

Before choosing commands, run `apltk codegraph --help` and `apltk codegraph <subcommand> --help`. Use the live help output to initialize/index if needed, then inspect files, symbols, call relationships, contextual flows, or impact radius relevant to the architecture atlas.

Based on CodeGraph findings, partition features (C4 Container level):

- Group interconnected function clusters into the same feature's submodules
- Identify feature boundaries and cross-feature call relationships

Then read `sample-demo/` to understand the expected output format and abstraction level before writing the atlas.

Consult `references/codegraph.md` for detailed flags.

### 2. Write the atlas with `apltk architecture add`

Before invoking any `apltk architecture` command, run `apltk architecture --help` and the relevant subcommand help, then follow the live CLI guidance.

Generate the atlas incrementally by C4 level:
Consult `references/architecture.md` for CLI flag details when needed (parameter reference, mutation series).

1. **System Context**: Define external actors, system boundaries, and cross-system edges
2. **Container level**: Define features and their inter-feature edges
3. **Component level**: Define submodules with their internal elements (function, variable, dataflow, error)
4. **Code level**: Declare `functions` and `variables` for every submodule, attaching `evidence` (source file and line number via `--evidence observed:path/file.ts:42`)

Use `apltk architecture add` for incremental atlas writes (one entity per command).
Transform the codebase knowledge gathered in the previous step into a clear architecture diagram.
After completion, verify the atlas format is valid and renders correctly.

### 3. Self-review

Confirm the following before finishing:

- [ ] All four C4 levels are populated (Context → Container → Component → Code)
- [ ] Every submodule has at least one function declared with source evidence
- [ ] All cross-feature and intra-feature edges are defined
- [ ] Evidence level is correctly set (`observed` for source-confirmed, `inferred` otherwise)
- [ ] Atlas passes `apltk architecture validate`

## Evidence Traceability

Every component declared via the CLI must carry source evidence:

- Feature → corresponding directory path or entry point file
- Submodule → list of files implementing the module
- Function row → source file and line number (`evidence.sourceFile` + `evidence.sourceLine`)
- Edge → code location triggering the call relationship

If time or context constraints prevent full traceability, record the scanned scope and known gaps in `meta.summary`.

## References

- `references/codegraph.md` — `apltk codegraph` CLI reference; verify current usage with `apltk codegraph --help`.
- `references/architecture.md` — `apltk architecture` CLI reference; verify current usage with `apltk architecture --help`.
- `references/TEMPLATE_SPEC.md` — Atlas field reference, enum values, and CLI shape cheat sheet.
- `references/definition.md` — Detailed definitions of feature and submodule.
- `assets/architecture-page.template.html` — HTML template.
- `references/architecture.css` — Style template.
- `sample-demo/` — Complete example output for understanding the final atlas shape and C4 level mapping.
