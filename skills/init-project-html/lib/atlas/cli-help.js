'use strict';

// cli-help.js — help page builders for the atlas CLI command tree.

// Hidden fine-grained verbs shared with cli.js MULTI_VERBS (Req 4: hidden from --help)
const hiddenVerbs = new Set(['feature', 'submodule', 'function', 'variable', 'dataflow', 'error', 'edge', 'meta', 'actor']);

function buildHelpPage({ title, summary, usageLines, useWhen, requiredFlags, optionalFlags, notes, examples }) {
  const lines = [title];

  if (summary) {
    lines.push('', summary);
  }

  if (usageLines?.length) {
    lines.push('', 'Usage:', ...usageLines.map((line) => `  ${line}`));
  }

  if (useWhen?.length) {
    lines.push('', 'Use this when:', ...useWhen.map((line) => `  - ${line}`));
  }

  if (requiredFlags?.length) {
    lines.push('', 'Required flags:', ...requiredFlags.map((line) => `  - ${line}`));
  }

  if (optionalFlags?.length) {
    lines.push('', 'Optional flags:', ...optionalFlags.map((line) => `  - ${line}`));
  }

  if (notes?.length) {
    lines.push('', 'Notes:', ...notes.map((line) => `  - ${line}`));
  }

  if (examples?.length) {
    lines.push('', 'Examples:');
    for (const { command, result } of examples) {
      lines.push(`  ${command}`, `    Result: ${result}`);
    }
  }

  return lines.join('\n');
}

function buildArchitectureHelpPage(verb = null, subverb = null) {
  const mutationFlags = [
    '`--project <root>` to target a specific repository root.',
    '`--spec <spec_dir>` to write into a spec overlay instead of the base atlas.',
    '`--no-render` to batch several mutations before one final render.',
    '`--dry-run` to preview mutation changes as JSON diff without writing to disk.',
    '`--evidence <level[:source]>` to tag components with observed/inferred/assumed quality levels.',
  ];

  const familyPages = {};

  const actionPages = {};

  if (!verb) {
    return buildHelpPage({
      title: 'apltk architecture — declarative atlas CLI.',
      summary: 'Inspect, mutate, validate, diff, and merge the project architecture atlas without hand-editing the rendered HTML output.',
      usageLines: [
        'apltk architecture [verb] [options]',
        'apltk architecture add <entity-type> <name> [relation-flags...]',
        'apltk architecture remove <entity-type> <name>',
        'apltk architecture diff',
        'apltk architecture merge --spec <dir>|--all',
        'apltk architecture render',
        'apltk architecture open',
        'apltk architecture validate         # run schema and referential integrity checks',
        'apltk architecture status           # print atlas state summary',
        'apltk architecture scan             # scan directory for feature candidates',
        'apltk architecture undo             # roll back recent mutations',
      ],
      useWhen: [
        'You need to browse or update `resources/project-architecture/` through YAML-backed atlas state.',
        'You need to render, compare, or merge spec overlays under `docs/plans/**/architecture_diff/`.',
        'You need to validate atlas integrity, scan for candidate features, inspect status, or undo recent changes.',
      ],
      optionalFlags: [
        '`--project <root>` targets a specific repository root (otherwise the CLI walks upward from the cwd).',
        '`--spec <spec_dir>` writes to a spec overlay instead of the base atlas.',
        '`--no-render` skips automatic re-render after a mutation so you can batch several commands.',
        '`--no-open` keeps `open` and `diff` from launching a browser window.',
        '`--dry-run` previews mutation changes as JSON diff without writing to disk.',
        '`--out <dir>` overrides the output directory for `diff`.',
        '`--clean` (with `merge`) removes spec overlay directories after a successful merge.',
        '`--all` (with `merge`) selects every pending spec overlay under `docs/plans/`.',
      ],
      notes: [
        'Use `apltk architecture add` to model features, modules, and relations.',
        'Use `apltk architecture remove` to retire entities from the diagram.',
        'Top-level verbs include `add`, `remove`, `diff`, `merge`, `render`, `open`, `validate`, `status`, `scan`, and `undo`.',
      ],
      examples: [
        {
          command: 'apltk architecture add feature payment --depends-on order',
          result: 'Creates a "payment" feature with a dependency on "order", then re-renders.',
        },
        {
          command: 'apltk architecture add module payment-api --part-of payment',
          result: 'Adds a "payment-api" submodule under the "payment" feature, then re-renders.',
        },
        {
          command: 'apltk architecture diff',
          result: 'Builds the paginated diff viewer and prints its generated HTML path.',
        },
        {
          command: 'apltk architecture merge --spec docs/plans/2026-05-11/add-2fa',
          result: 'Merges a spec overlay into the base atlas and re-renders.',
        },
      ],
    });
  }

  // Hidden verbs redirect before any action-specific lookups (Req 4)
  if (verb && hiddenVerbs.has(verb)) {
    if (subverb === 'add' || subverb === 'set') return buildArchitectureHelpPage('add');
    if (subverb === 'remove') return buildArchitectureHelpPage('remove');
    return buildArchitectureHelpPage('add');
  }

  if (actionPages[`${verb}:${subverb}`]) {
    return actionPages[`${verb}:${subverb}`];
  }

  if (familyPages[verb]) {
    return familyPages[verb];
  }

  switch (verb) {
    case 'open':
      return buildHelpPage({
        title: 'apltk architecture open — open the base atlas HTML.',
        summary: 'Open the rendered base atlas in a browser, bootstrapping it first if the HTML has not been rendered yet.',
        usageLines: [
          'apltk architecture open [--project <root>] [--no-open]',
          'apltk architecture [--project <root>] [--no-open]',
        ],
        useWhen: [
          'You want to inspect the base atlas output under `resources/project-architecture/index.html`.',
        ],
        optionalFlags: [
          '`--project <root>` selects the repository root to inspect.',
          '`--no-open` prints the HTML path without opening a browser.',
        ],
        examples: [
          {
            command: 'apltk architecture open --project /repo --no-open',
            result: 'Prints `/repo/resources/project-architecture/index.html` after bootstrapping the atlas if needed.',
          },
        ],
      });
    case 'diff':
      return buildHelpPage({
        title: 'apltk architecture diff — render the paginated before/after viewer.',
        summary: 'Collect every `architecture_diff/` overlay under `docs/plans/` and build one HTML viewer that pairs base pages with proposed-after pages.',
        usageLines: [
          'apltk architecture diff [--project <root>] [--out <dir>] [--no-open]',
        ],
        useWhen: [
          'You need to review architecture overlays from one or more spec directories.',
        ],
        optionalFlags: [
          '`--project <root>` selects the repository root to inspect.',
          '`--out <dir>` overrides the generated viewer output directory.',
          '`--no-open` prints the viewer path without opening a browser.',
        ],
        examples: [
          {
            command: 'apltk architecture diff --project /repo --no-open',
            result: 'Prints the diff viewer HTML path plus a one-line page-count summary.',
          },
        ],
      });
    case 'render':
      return buildHelpPage({
        title: 'apltk architecture render — regenerate atlas HTML from the current state.',
        summary: 'Render the base atlas or the resolved spec overlay HTML from the current YAML state.',
        usageLines: [
          'apltk architecture render [--project <root>] [--spec <spec_dir>]',
        ],
        useWhen: [
          'You batched mutations with `--no-render` and now want one explicit render step.',
        ],
        optionalFlags: [
          '`--project <root>` selects the repository root to render.',
          '`--spec <spec_dir>` renders the spec overlay output instead of the base atlas.',
        ],
        examples: [
          {
            command: 'apltk architecture render --spec docs/plans/2026-05-11/add-2fa',
            result: 'Renders the overlay HTML and prints `atlas: rendered`.',
          },
        ],
      });
    case 'validate':
      return buildHelpPage({
        title: 'apltk architecture validate — run schema and referential checks.',
        summary: 'Validate the base atlas or resolved spec overlay and report whether the atlas state is structurally sound.',
        usageLines: [
          'apltk architecture validate [--project <root>] [--spec <spec_dir>]',
        ],
        useWhen: [
          'You need to confirm that all referenced functions, variables, and pages are valid before finishing atlas work.',
        ],
        optionalFlags: [
          '`--project <root>` selects the repository root to validate.',
          '`--spec <spec_dir>` validates the resolved overlay instead of the base atlas.',
        ],
        examples: [
          {
            command: 'apltk architecture validate',
            result: 'Prints `atlas: OK` on success or one validation error per broken reference.',
          },
        ],
      });
    case 'status':
      return buildHelpPage({
        title: 'apltk architecture status — print atlas state summary.',
        summary: 'Display a structured digest of the current atlas, including feature/submodule counts, edge counts, actor count, last-updated timestamp, and validation status. Supports a `--json` flag for AI-agent-consumable output.',
        usageLines: [
          'apltk architecture status [--json] [--project <root>] [--spec <spec_dir>]',
        ],
        useWhen: [
          'You need a quick overview of the atlas state and its validation health.',
          'An AI agent needs to programmatically read the atlas summary via JSON.',
        ],
        optionalFlags: [
          '`--json` outputs the full summary as a JSON object (meta, counts, featureList, validation).',
          '`--project <root>` selects the repository root to inspect.',
          '`--spec <spec_dir>` reads the resolved spec overlay state instead of the base atlas.',
        ],
        notes: [
          'The exit code is 0 even when validation has errors — non-zero exits are reserved for CLI-level failures.',
          'In --json mode, stdout contains only the JSON payload; all diagnostic messages go to stderr.',
        ],
        examples: [
          {
            command: 'apltk architecture status',
            result: 'Prints a human-readable summary with counts and validation status.',
          },
          {
            command: 'apltk architecture status --json',
            result: 'Outputs a JSON object with meta, counts, featureList, and validation fields.',
          },
          {
            command: 'apltk architecture status --spec docs/plans/2026-05-11/add-2fa',
            result: 'Reads the resolved spec overlay state and prints its status.',
          },
        ],
      });
    case 'scan':
      return buildHelpPage({
        title: 'apltk architecture scan — scan directory structure for feature candidates.',
        summary: 'List the top-level source directories in a target path and output a JSON array of candidate feature slugs for agent-driven atlas modelling.',
        usageLines: [
          'apltk architecture scan [--src <dir>] [--project <root>]',
        ],
        useWhen: [
          'You need to quickly inventory the source directories that likely correspond to architecture features.',
        ],
        optionalFlags: [
          '`--src <dir>` specifies the directory to scan (defaults to `src/` if it exists, otherwise the project root).',
          '`--project <root>` selects the repository root to scan.',
        ],
        notes: [
          'Only the immediate children of the scanned directory are listed; no recursive scanning.',
          'Directories like `node_modules`, `.git`, `dist`, `__tests__`, `coverage`, `.turbo`, and `build` are automatically filtered out.',
          'Directories whose names start with a dot are also skipped.',
          'The output is a JSON array of `{name, path, suggestion}` objects written to stdout.',
        ],
        examples: [
          {
            command: 'apltk architecture scan --src lib/',
            result: 'Outputs a JSON array of directory entries in `lib/` with suggested feature slugs.',
          },
        ],
      });
    case 'undo':
      return buildHelpPage({
        title: 'apltk architecture undo — roll back recent mutations.',
        summary: 'Restore the most recent undo snapshot from the base atlas or the selected spec overlay.',
        usageLines: [
          'apltk architecture undo [--steps <n>] [--project <root>] [--spec <spec_dir>] [--no-render]',
        ],
        useWhen: [
          'A recent atlas mutation was wrong and you want to roll it back from the recorded undo history.',
        ],
        optionalFlags: [
          '`--steps <n>` rolls back multiple snapshots instead of only the latest one.',
          ...mutationFlags,
        ],
        examples: [
          {
            command: 'apltk architecture undo --steps 2 --spec docs/plans/2026-05-11/add-2fa',
            result: 'Restores the requested overlay snapshots and prints `atlas: undo applied (2 steps)`.',
          },
        ],
      });
    case 'merge':
      return buildHelpPage({
        title: 'apltk architecture merge — merge spec overlay(s) into the base atlas.',
        summary: 'Apply the architecture changes proposed in one or more spec overlays (architecture_diff/) to the project\'s main architecture diagram, then re-render the base HTML.',
        usageLines: [
          'apltk architecture merge --spec <spec_dir> [--clean] [--no-render]',
          'apltk architecture merge --all [--clean] [--no-render]',
        ],
        useWhen: [
          'A spec\'s proposed architecture changes have been approved and should become the new baseline.',
          'You want to apply multiple pending spec overlays to the project atlas in one step.',
        ],
        requiredFlags: [
          '`--spec <spec_dir>` or `--all` (one is required).',
        ],
        optionalFlags: [
          '`--clean` removes the spec\'s `architecture_diff/` directory after a successful merge.',
          '`--no-render` skips HTML regeneration so you can batch multiple operations.',
          '`--project <root>` selects the repository root.',
        ],
        notes: [
          'An undo snapshot is taken before the merge so `apltk architecture undo` can revert it.',
          'Overlays are applied in sorted order; later overlays win on conflicts.',
          'Batch specs (with `coordination.md`) are automatically deduplicated.',
        ],
        examples: [
          {
            command: 'apltk architecture merge --spec docs/plans/2026-05-11/add-2fa',
            result: 'Merges the spec overlay into the base atlas, re-renders, and prints a change summary.',
          },
          {
            command: 'apltk architecture merge --all --clean',
            result: 'Merges every pending spec overlay found under docs/plans/ and removes their diff directories.',
          },
        ],
      });
    case 'add':
      return buildHelpPage({
        title: 'apltk architecture add — add entities to the architecture diagram.',
        summary: 'Add features, modules, or relations to the project architecture diagram. Supports both single-entity and batch mode.',
        usageLines: [
          'apltk architecture add feature <slug> [--depends-on <feature>]',
          'apltk architecture add module <slug> --part-of <feature> [--depends-on <feature>]',
          'apltk architecture add relation <endpoint> --data-flow-to <endpoint>',
          '# Batch mode — multiple entities in one command:',
          'apltk architecture add feature <slug> [--depends-on <feature>] module <slug> --part-of <feature>',
        ],
        useWhen: [
          'You need to model a new feature in the architecture diagram.',
          'You need to add a sub-module to an existing feature.',
          'You need to express a dependency, data flow, or deployment relationship.',
          'You need to add multiple entities and relationships in a single command.',
        ],
        optionalFlags: [
          '`--part-of <feature>` — for modules: the parent feature this module belongs to.',
          '`--depends-on <feature>` — for features/modules: declares a dependency.',
          '`--data-flow-to <endpoint>` — for relations: data flows from source to target.',
          '`--implements <endpoint>` — for relations: implements an interface (alternative to --data-flow-to).',
          '`--deployed-on <endpoint>` — for relations: deployment target (alternative to --data-flow-to).',
          '`--spec <spec_dir>` writes to a spec overlay instead of the base atlas.',
          '`--no-render` skips auto-render so you can batch several commands.',
          '`--project <root>` targets a specific repository root.',
          '`--dry-run` previews changes as JSON diff without writing to disk.',
          '`--kind <kind>` — for modules: the submodule kind (service, api, ui, worker, external).',
          '`--evidence <level[:source]>` — tags components with observed/inferred/assumed quality levels.',
        ],
        examples: [
          {
            command: 'apltk architecture add feature payment --depends-on order',
            result: 'Creates a "payment" feature with a dependency on "order", then re-renders.',
          },
          {
            command: 'apltk architecture add module payment-api --part-of payment --depends-on order-service',
            result: 'Adds a "payment-api" submodule under the "payment" feature with a dependency edge.',
          },
        ],
      });
    case 'remove':
      return buildHelpPage({
        title: 'apltk architecture remove — remove entities from the architecture diagram.',
        summary: 'Remove features, modules, or relations from the project architecture diagram.',
        usageLines: [
          'apltk architecture remove feature <slug>',
          'apltk architecture remove module <slug> --part-of <feature>',
          'apltk architecture remove relation <from-endpoint> --to <to-endpoint>',
        ],
        useWhen: [
          'You need to retire a feature from the architecture diagram.',
          'You need to remove a sub-module from an existing feature.',
          'You need to remove a dependency or relationship edge.',
        ],
        optionalFlags: [
          '`--part-of <feature>` — for modules: which feature the module belongs to.',
          '`--to <endpoint>` — for relations: the target endpoint of the edge being removed.',
          '`--spec <spec_dir>` writes to a spec overlay instead of the base atlas.',
          '`--no-render` skips auto-render.',
          '`--project <root>` targets a specific repository root.',
        ],
        examples: [
          {
            command: 'apltk architecture remove feature legacy-auth',
            result: 'Removes the feature and its related edges, then re-renders.',
          },
          {
            command: 'apltk architecture remove module payment-api --part-of payment',
            result: 'Removes the submodule and its local edges, then re-renders.',
          },
        ],
      });
    default:
      return null;
  }
}

module.exports = {
  buildArchitectureHelpPage,
  hiddenVerbs,
  get USAGE() {
    const value = buildArchitectureHelpPage();
    Object.defineProperty(module.exports, 'USAGE', { value, enumerable: true, writable: false, configurable: false });
    return value;
  },
};
