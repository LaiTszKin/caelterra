# apltk architecture — Declarative Architecture Diagram CLI

## Purpose

Manages architecture diagrams under `resources/project-architecture/` via YAML state files, supporting baseline diagrams, spec overlay diffing, and merge.

## Usage

Before using this tool, run `apltk architecture --help` and the relevant subcommand help, then follow the live CLI guidance.

```
apltk architecture [verb] [options]
```

## Global Flags

| Flag                          | Effect                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| `--project <root>`            | Specify project root (defaults to upward search from cwd)             |
| `--spec <spec_dir>`           | Write to spec overlay rather than base architecture                   |
| `--no-render`                 | Skip auto-re-render after a change (batch multiple commands)          |
| `--no-open`                   | Suppress browser open on `open` and `diff`                            |
| `--dry-run`                   | Preview changes as JSON diff, do not write                            |
| `--out <dir>`                 | Output directory for `diff`                                           |
| `--clean`                     | Remove spec overlay directory after successful `merge`                |
| `--all`                       | Select all pending spec overlays on `merge`                           |
| `--json`                      | Output JSON on `status`                                               |
| `--evidence <level[:source]>` | Mark a component's evidence quality level (observed/inferred/assumed) |

## Top-Level Verbs

- **`open`** — Open the base architecture diagram HTML (bootstraps if not yet rendered)
- **`diff`** — Collect all overlays under `docs/plans/`, produce a before/after viewer
- **`render`** — Regenerate HTML from current YAML state
- **`validate`** — Validate architecture diagram structural integrity (schema + referential integrity)
- **`status`** — Show summary (feature/submodule/edge/actor counts, timestamps, validation state)
- **`scan --src <dir>`** — Scan a directory tree, output JSON candidate feature list
- **`undo [--steps <n>]`** — Undo the most recent mutation(s)
- **`merge --spec <dir> \| --all`** — Merge spec overlay(s) back into the base architecture

## Mutation Commands

All mutation commands share `--project`, `--spec`, `--no-render`, `--dry-run`, and `--evidence`.

### add — add entities to the architecture diagram

```
apltk architecture add feature <slug> [--depends-on <feature>]
apltk architecture add module <slug> --part-of <feature> [--depends-on <feature>]
apltk architecture add relation <endpoint> --data-flow-to <endpoint> [--kind call|return|data-row|failure]
apltk architecture add relation <endpoint> --implements <endpoint>
apltk architecture add relation <endpoint> --deployed-on <endpoint>
```

**Module flags:**

- `--part-of <feature>` (required) — parent feature this module belongs to
- `--kind <kind>` — submodule kind (service, api, ui, worker, external)
- `--depends-on <feature>` — comma-separated dependency targets
- `--implements <endpoint>` — endpoint this module implements
- `--data-flow-to <endpoint>` — target endpoint for data flow

**Relation flags:**

- `--data-flow-to <endpoint>` — data flows from source to target
- `--implements <endpoint>` — implements an interface
- `--deployed-on <endpoint>` — deployment target
- `--depends-on <feature>` — comma-separated dependency targets

### remove — remove entities from the architecture diagram

```
apltk architecture remove feature <slug>
apltk architecture remove module <slug> --part-of <feature>
apltk architecture remove relation <from-endpoint> --to <to-endpoint> [--id <edge-id>]
```

### Batch add

Multiple entities can be added in a single command:

```
apltk architecture add feature <slug> [--depends-on <feature>] \
  module <slug> --part-of <feature> \
  relation <endpoint> --data-flow-to <endpoint>
```

## Notes

- Auto-renders after each mutation (unless `--no-render`)
- Each mutation creates an undo snapshot; run `undo` to revert
- Work is not complete until validation passes
