# Atlas component schema — reference cheat sheet

> Reference material only. The binding rules (read strategy, evidence requirements, what each verb means) live in `SKILL.md`. This file lists the exact fields and enum values that `apltk architecture` accepts; the renderer applies them to consistent DOM/CSS/ARIA hooks so agents never need to touch HTML.

## State files on disk

```
resources/project-architecture/
├── atlas/
│   ├── atlas.index.yaml          # meta + actors + feature slug order + cross-feature edges
│   ├── features/<slug>.yaml      # one file per feature (submodules + intra-feature edges)
│   ├── atlas.history.log         # append-only audit log (JSONL)
│   └── atlas.history.undo.json   # single-step undo snapshot
├── index.html                    # rendered (do not hand-edit)
├── features/<slug>/index.html    # rendered
├── features/<slug>/<sub>.html    # rendered
└── assets/                       # architecture.css + viewer.client.js (copied by the renderer)
```

## Components

### `meta`

| Field   | Type   | Required | Notes |
| ------- | ------ | -------- | ----- |
| title   | string | yes      | Macro page H1 + diff viewer title. |
| summary | string | no       | Renders below the title; record scanned roots and deliberate omissions here. |
| updatedAt | string (ISO) | auto | Touched on every save; do not set manually. |

CLI: `apltk architecture meta set --title "..." --summary "..."`

### `actors`

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| id    | kebab-case slug | yes | Stable identity. |
| label | string | yes | Display name. |

CLI: `apltk architecture actor add --id end-user --label "End user"`

### `feature`

| Field      | Type | Required | Notes |
| ---------- | ---- | -------- | ----- |
| slug       | kebab-case | yes | Matches the directory name `features/<slug>/`. |
| title      | string | yes | User-language capability name. |
| story      | string | no  | 1–3 sentence user story shown on the feature page. |
| dependsOn  | array of feature slugs | no | Shown as "Depends on:" links on the feature page. |
| submodules | array of submodule | yes | Render-order matches list order. |
| edges      | array of edge | no | Intra-feature edges (see below). |

CLI: `apltk architecture feature add --slug <kebab> --title "..." --story "..." [--depends-on a,b]`

### `submodule`

| Field      | Type | Required | Notes |
| ---------- | ---- | -------- | ----- |
| slug       | kebab-case | yes | Matches the HTML filename `features/<feature>/<slug>.html`. |
| kind       | enum `ui` `api` `service` `db` `pure-fn` `queue` `external` | yes | Drives node colour + label. |
| role       | string | no | Own responsibility in one sentence. Renders as macro node footnote + feature card subtitle. |
| functions  | array of function row | no | Renders the `sub-io` table. |
| variables  | array of variable row | no | Renders the `sub-vars` table. |
| dataflow   | array of dataflow step (string OR object — see below) | no | Renders the `sub-dataflow` internal flow SVG. |
| errors     | array of error row | no | Renders the `sub-errors` table. |

CLI: `apltk architecture submodule add --feature X --slug Y --kind api --role "..."`

### `function` row

| Field   | Type | Required | Notes |
| ------- | ---- | -------- | ----- |
| name    | string | yes | Function or method name. |
| in      | string | no  | Comma-separated signature parts; rendered verbatim. |
| out     | string | no  | May include `\|` to denote error returns. |
| side    | enum `pure` `io` `write` `tx` `lock` `network` | no | Side-effect chip. |
| purpose | string | no | One-line business purpose. |

CLI: `apltk architecture function add --feature X --submodule Y --name fn --in "..." --out "..." --side tx --purpose "..."`

### `variable` row

| Field   | Type | Required | Notes |
| ------- | ---- | -------- | ----- |
| name    | string | yes | Parameter / field / column / counter name. |
| type    | string | no  | Free-form. |
| scope   | enum `call` `tx` `persist` `instance` `loop` | no | Lifetime/scope chip. |
| purpose | string | no  | **Business** purpose — why this identifier exists, which branch it gates, what breaks without it. |

CLI: `apltk architecture variable add --feature X --submodule Y --name v --type T --scope call --purpose "..."`

### `dataflow` step

Each step is either a plain string OR an object with one required and three optional fields. The renderer arranges them top-to-bottom inside a pan/zoom viewport; `--fn` becomes a function pill at the top of the step box, `--reads` becomes a green chip on the bottom-left, `--writes` becomes an orange chip on the bottom-right.

| Field   | Type | Required | Notes |
| ------- | ---- | -------- | ----- |
| step    | string | yes | The action / observation in one short sentence. |
| fn      | string | no  | Name of a `function` already declared in the SAME sub-module. `validate` fails otherwise. Use it to surface function-to-function transitions inside the sub-module. |
| reads   | array of variable names | no | Each name must be a `variable` declared in the SAME sub-module. Shows up as `← reads: …` chip. |
| writes  | array of variable names | no | Same constraint as `reads`. Shows up as `→ writes: …` chip. |

Appended at the tail by default; pass `--at N` to insert at index N. Reorder with `apltk architecture dataflow reorder --feature X --submodule Y --from i --to j`. `--reads` / `--writes` accept comma-separated lists (`--reads "a, b"`).

CLI:

```
apltk architecture dataflow add --feature X --submodule Y --step "..." [--fn <declared-fn>] [--reads "v1,v2"] [--writes "v3,v4"]
```

### `error` row

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| name  | string | yes | Symbolic name (e.g. `ErrInvalidCode`). |
| when  | string | no | Condition that raises this error. |
| means | string | no | Observable outcome (HTTP status, user feedback). |

CLI: `apltk architecture error add --feature X --submodule Y --name ErrCode --when "..." --means "..."`

### `edge`

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |
| id    | kebab-case | no (auto if omitted) | Stable so cross-references survive renames. |
| from  | `feature/submodule` (cross-feature) or `submodule` (intra-feature, when `--from` and `--to` share a feature) | yes | |
| to    | same shape | yes | |
| kind  | enum `call` `return` `data-row` `failure` | yes | Drives stroke/dash/colour and arrow head. |
| label | string | no | Rendered at the middle of the edge path. |

CLI: `apltk architecture edge add --from <feature>[/sub] --to <feature>[/sub] --kind call --label "..."`

### `evidence` (shared, optional on every entity above)

| Field      | Type | Required | Notes |
| ---------- | ---- | -------- | ----- |
| level      | enum `observed` `inferred` `assumed` | yes | Quality tier — drives badge colour (green/amber/red). |
| source     | string | no | Free-text evidence description. |
| sourceFile | string | no | Extracted file path (e.g. `src/auth/controller.ts`). Auto-parsed from `--evidence observed:path/file.ts:42`. |
| sourceLine | number | no | Extracted line number. Auto-parsed from `--evidence observed:path/file.ts:42`. |

CLI: `--evidence observed:path/to/file.ts:42` (line number parsed automatically when source ends with `:N` and the preceding segment resembles a file path).

In YAML:
```yaml
evidence:
  level: observed
  sourceFile: src/auth/controller.ts
  sourceLine: 42
  source: src/auth/controller.ts:42
```

## Class hooks on rendered HTML

These are emitted automatically by `lib/atlas/render.js`. Agents do **not** write them by hand — they are listed here only so reviewers know which selectors are stable.

| Hook | Page |
| --- | --- |
| `.atlas-header`, `.atlas-summary`, `.atlas-canvas`, `.atlas-submodule-index`, `.atlas-legend` | macro |
| `.m-cluster`, `.m-cluster__title`, `.m-node`, `.m-node--<kind>`, `.m-node__title/__kind/__role`, `.m-edge`, `.m-edge--<kind>`, `.m-edge__label` | macro SVG |
| `.feature-header`, `.feature-story`, `.submodule-nav`, `.submodule-card`, `.feature-edges` | feature page |
| `.submodule-header`, `.submodule-role`, `.sub-io`, `.sub-vars`, `.sub-dataflow`, `.sub-dataflow__canvas`, `.sub-dataflow__toolbar`, `.sub-dataflow__viewport`, `.sub-dataflow__step`, `.sub-dataflow__badge`, `.sub-dataflow__fn-text`, `.sub-dataflow__chip--reads`, `.sub-dataflow__chip--writes`, `.sub-errors`, `.submodule-kind--<kind>` | sub-module page |

## Pan/zoom

The CLI copies `assets/viewer.client.js` into the atlas. Two viewports exist:

- macro `index.html` — one `[data-pan-zoom-viewport]` wrapping the atlas SVG.
- each sub-module page — one `[data-pan-zoom-viewport]` wrapping the sub-dataflow SVG (when the sub-module has any `dataflow` step).

For every viewport the script wires:

- mouse wheel zoom around the cursor,
- click + drag to pan,
- `+` / `−` / `Fit` buttons on the toolbar (scoped to the surrounding `[data-pan-zoom-container]`),
- keyboard `←` `→` `↑` `↓` (pan), `+` `=` (zoom in), `−` `_` (zoom out), `0` (reset) — applied to the page's primary viewport.
