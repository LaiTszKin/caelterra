# apltk architecture — Declarative Architecture Diagram CLI

## Purpose
Manage architecture diagrams under `resources/project-architecture/` via YAML state files. Supports base atlas and spec overlay diff/merge comparison.

## Usage
```
apltk architecture [verb] [options]
```

## Global Flags
| Flag | Effect |
|------|--------|
| `--project <root>` | Specify project root (defaults to upward search from cwd) |
| `--spec <spec_dir>` | Write to spec overlay instead of base atlas |
| `--no-render` | Skip auto-render after mutations for batch operations |
| `--no-open` | Skip browser launch for `open` and `diff` |
| `--dry-run` | Preview changes as JSON diff without writing |
| `--out <dir>` | Output directory for `diff` |
| `--clean` | Remove spec overlay directory after successful `merge` |
| `--all` | Select all pending spec overlays for `merge` |
| `--json` | JSON output for `status` |
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

## Mutation Series

All mutations share `--project`, `--spec`, `--no-render`, `--dry-run`, `--evidence` flags.

### feature
```
apltk architecture feature add --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b]
apltk architecture feature set --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b]
apltk architecture feature remove --slug <feature>
```

### submodule
```
apltk architecture submodule add --feature <feature> --slug <submodule> [--kind service|api|ui|worker|external] [--role "..."]
apltk architecture submodule set --feature <feature> --slug <submodule> [--kind ...] [--role "..."]
apltk architecture submodule remove --feature <feature> --slug <submodule>
```

### function
```
apltk architecture function add --feature <feature> --submodule <submodule> --name <fn> [--in "..."] [--out "..."] [--side "..."] [--purpose "..."]
apltk architecture function remove --feature <feature> --submodule <submodule> --name <fn>
```

### variable
```
apltk architecture variable add --feature <feature> --submodule <submodule> --name <var> [--type "..."] [--scope "..."] [--purpose "..."]
apltk architecture variable remove --feature <feature> --submodule <submodule> --name <var>
```

### dataflow
```
apltk architecture dataflow add --feature <feature> --submodule <submodule> --step "..." [--at <index>] [--fn <name>] [--reads a,b] [--writes x,y]
apltk architecture dataflow remove --feature <feature> --submodule <submodule> (--step "..." | --at <index>)
apltk architecture dataflow reorder --feature <feature> --submodule <submodule> --from <index> --to <index>
```

### error
```
apltk architecture error add --feature <feature> --submodule <submodule> --name <error> [--when "..."] [--means "..."]
apltk architecture error remove --feature <feature> --submodule <submodule> --name <error>
```

### edge
```
apltk architecture edge add --from <feature[/submodule]> --to <feature[/submodule]> [--kind call|return|data-row|failure] [--label "..."] [--id <edge-id>]
apltk architecture edge remove --from <feature[/submodule]> --to <feature[/submodule]> [--id <edge-id>]
```

### meta
```
apltk architecture meta set [--title "..."] [--summary "..."]
```

### actor
```
apltk architecture actor add --id <actor-id> [--label "..."]
apltk architecture actor remove --id <actor-id>
```

## Notes
- Auto-render after every mutation (unless `--no-render`)
- Each mutation creates an undo snapshot — revert with `undo`
- Atlas work is not complete until validation passes
