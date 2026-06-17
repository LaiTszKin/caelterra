# apltk architecture — Declarative Architecture Diagram CLI

## Purpose

Manage architecture diagrams under `resources/project-architecture/` via YAML state files. Supports base atlas and spec overlay diff/merge comparison.

## Usage

Before using this tool, run `apltk architecture --help` and the relevant subcommand help, then follow the live CLI guidance.

```
apltk architecture [verb] [options]
```

## Global Flags

| Flag                          | Effect                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `--project <root>`            | Specify project root (defaults to upward search from cwd)                                                                        |
| `--spec <spec_dir>`           | Write to spec overlay instead of base atlas                                                                                      |
| `--no-render`                 | Skip auto-render after mutations for batch operations                                                                            |
| `--no-open`                   | Skip browser launch for `open` and `diff`                                                                                        |
| `--dry-run`                   | Preview changes as JSON diff without writing                                                                                     |
| `--out <dir>`                 | Output directory for `diff`                                                                                                      |
| `--clean`                     | Remove spec overlay directory after successful `merge`                                                                           |
| `--all`                       | Select all pending spec overlays for `merge`                                                                                     |
| `--json`                      | JSON output for `status`                                                                                                         |
| `--evidence <level[:source]>` | Mark component quality tier (observed/inferred/assumed); source supports auto-parsed `file:line` (e.g. `observed:src/foo.ts:42`) |

## Top-Level Verbs

- **`open`** — Open base atlas HTML in browser; bootstrap if not rendered
- **`diff`** — Collect all overlays under `docs/plans/`, generate before/after viewer
- **`render`** — Regenerate HTML from current YAML state
- **`validate`** — Validate atlas structural integrity (schema + referential integrity)
- **`status`** — Show summary (feature/submodule/edge/actor counts, timestamp, validation status)
- **`scan --src <dir>`** — Scan directory structure, output JSON candidate feature list
- **`undo [--steps <n>]`** — Revert the most recent mutation(s)
- **`merge --spec <dir> | --all`** — Merge spec overlay(s) into base atlas

## Mutation Commands

All mutations share `--project`, `--spec`, `--no-render`, `--dry-run`, `--evidence` flags.

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

- Auto-render after every mutation (unless `--no-render`)
- Each mutation creates an undo snapshot — revert with `undo`
- Atlas work is not complete until validation passes
