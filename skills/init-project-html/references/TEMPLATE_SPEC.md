# Atlas component schema — reference cheat sheet

> Reference material only. The binding rules (read strategy, evidence requirements, what each verb means) live in `SKILL.md`. This file lists the exact fields and enum values that `apltk architecture` accepts; the renderer applies them to consistent DOM/CSS/ARIA hooks so agents never need to touch HTML.
> Before using any CLI example here, run `apltk architecture --help` and relevant subcommand help; live CLI guidance is authoritative.

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

| Field     | Type         | Required | Notes                                                                        |
| --------- | ------------ | -------- | ---------------------------------------------------------------------------- |
| title     | string       | yes      | Macro page H1 + diff viewer title.                                           |
| summary   | string       | no       | Renders below the title; record scanned roots and deliberate omissions here. |
| updatedAt | string (ISO) | auto     | Touched on every save; do not set manually.                                  |

These are YAML/schema reference details. Run `apltk architecture --help` for the exact public command spelling.

### `actors`

| Field | Type            | Required | Notes            |
| ----- | --------------- | -------- | ---------------- |
| id    | kebab-case slug | yes      | Stable identity. |
| label | string          | yes      | Display name.    |

These are YAML/schema reference details. Run `apltk architecture --help` for the exact public command spelling.

### `feature`

| Field      | Type                   | Required | Notes                                              |
| ---------- | ---------------------- | -------- | -------------------------------------------------- |
| slug       | kebab-case             | yes      | Matches the directory name `features/<slug>/`.     |
| title      | string                 | yes      | User-language capability name.                     |
| story      | string                 | no       | 1–3 sentence user story shown on the feature page. |
| dependsOn  | array of feature slugs | no       | Shown as "Depends on:" links on the feature page.  |
| submodules | array of submodule     | yes      | Render-order matches list order.                   |
| edges      | array of edge          | no       | Intra-feature edges (see below).                   |

CLI: `apltk architecture add feature <kebab> [--depends-on a,b]`

### `submodule`

| Field     | Type                                                        | Required | Notes                                                                                       |
| --------- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| slug      | kebab-case                                                  | yes      | Matches the HTML filename `features/<feature>/<slug>.html`.                                 |
| kind      | enum `ui` `api` `service` `db` `pure-fn` `queue` `external` | yes      | Drives node colour + label.                                                                 |
| role      | string                                                      | no       | Own responsibility in one sentence. Renders as macro node footnote + feature card subtitle. |
| functions | array of function row                                       | no       | Renders the `sub-io` table.                                                                 |
| variables | array of variable row                                       | no       | Renders the `sub-vars` table.                                                               |
| dataflow  | array of dataflow step (string OR object — see below)       | no       | Renders the `sub-dataflow` internal flow SVG.                                               |
| errors    | array of error row                                          | no       | Renders the `sub-errors` table.                                                             |

CLI: `apltk architecture add module <slug> --part-of <feature> [--kind service]`

### `function` row

| Field   | Type                                           | Required | Notes                                               |
| ------- | ---------------------------------------------- | -------- | --------------------------------------------------- |
| name    | string                                         | yes      | Function or method name.                            |
| in      | string                                         | no       | Comma-separated signature parts; rendered verbatim. |
| out     | string                                         | no       | May include `\|` to denote error returns.           |
| side    | enum `pure` `io` `write` `tx` `lock` `network` | no       | Side-effect chip.                                   |
| purpose | string                                         | no       | One-line business purpose.                          |

These are YAML/schema reference details. Run `apltk architecture --help` for the exact public command spelling.

### `variable` row

| Field   | Type                                         | Required | Notes                                                                                             |
| ------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| name    | string                                       | yes      | Parameter / field / column / counter name.                                                        |
| type    | string                                       | no       | Free-form.                                                                                        |
| scope   | enum `call` `tx` `persist` `instance` `loop` | no       | Lifetime/scope chip.                                                                              |
| purpose | string                                       | no       | **Business** purpose — why this identifier exists, which branch it gates, what breaks without it. |

These are YAML/schema reference details. Run `apltk architecture --help` for the exact public command spelling.

### `dataflow` step

Each step is either a plain string OR an object with one required and three optional fields. The renderer arranges them top-to-bottom inside a pan/zoom viewport; `--fn` becomes a function pill at the top of the step box, `--reads` becomes a green chip on the bottom-left, `--writes` becomes an orange chip on the bottom-right.

| Field  | Type                    | Required | Notes                                                                                                                                                               |
| ------ | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| step   | string                  | yes      | The action / observation in one short sentence.                                                                                                                     |
| fn     | string                  | no       | Name of a `function` already declared in the SAME sub-module. `validate` fails otherwise. Use it to surface function-to-function transitions inside the sub-module. |
| reads  | array of variable names | no       | Each name must be a `variable` declared in the SAME sub-module. Shows up as `← reads: …` chip.                                                                      |
| writes | array of variable names | no       | Same constraint as `reads`. Shows up as `→ writes: …` chip.                                                                                                         |

Appended at the tail by default. `--reads` / `--writes` accept comma-separated lists.

These are YAML/schema reference details. Run `apltk architecture --help` for the exact public command spelling.

### `error` row

| Field | Type   | Required | Notes                                            |
| ----- | ------ | -------- | ------------------------------------------------ |
| name  | string | yes      | Symbolic name (e.g. `ErrInvalidCode`).           |
| when  | string | no       | Condition that raises this error.                |
| means | string | no       | Observable outcome (HTTP status, user feedback). |

These are YAML/schema reference details. Run `apltk architecture --help` for the exact public command spelling.

### `edge`

| Field | Type                                                                                                         | Required             | Notes                                       |
| ----- | ------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------- |
| id    | kebab-case                                                                                                   | no (auto if omitted) | Stable so cross-references survive renames. |
| from  | `feature/submodule` (cross-feature) or `submodule` (intra-feature, when `--from` and `--to` share a feature) | yes                  |                                             |
| to    | same shape                                                                                                   | yes                  |                                             |
| kind  | enum `call` `return` `data-row` `failure`                                                                    | yes                  | Drives stroke/dash/colour and arrow head.   |
| label | string                                                                                                       | no                   | Rendered at the middle of the edge path.    |

CLI: `apltk architecture add relation <feature/submodule> --data-flow-to <feature/submodule>`

### `evidence` (shared, optional on every entity above)

| Field      | Type                                 | Required | Notes                                                                                                        |
| ---------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| level      | enum `observed` `inferred` `assumed` | yes      | Quality tier — drives badge colour (green/amber/red).                                                        |
| source     | string                               | no       | Free-text evidence description.                                                                              |
| sourceFile | string                               | no       | Extracted file path (e.g. `src/auth/controller.ts`). Auto-parsed from `--evidence observed:path/file.ts:42`. |
| sourceLine | number                               | no       | Extracted line number. Auto-parsed from `--evidence observed:path/file.ts:42`.                               |

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

| Hook                                                                                                                                                                                                                                                                                                                                          | Page            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `.atlas-header`, `.atlas-summary`, `.atlas-canvas`, `.atlas-submodule-index`, `.atlas-legend`                                                                                                                                                                                                                                                 | macro           |
| `.m-cluster`, `.m-cluster__title`, `.m-node`, `.m-node--<kind>`, `.m-node__title/__kind/__role`, `.m-edge`, `.m-edge--<kind>`, `.m-edge__label`                                                                                                                                                                                               | macro SVG       |
| `.feature-header`, `.feature-story`, `.submodule-nav`, `.submodule-card`, `.feature-edges`                                                                                                                                                                                                                                                    | feature page    |
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
