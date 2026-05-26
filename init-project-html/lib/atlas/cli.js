'use strict';

// cli.js — declarative atlas command tree under `apltk architecture`.
//
// Verbs (always operate on the resolved atlas; --spec switches reads
// and writes to the overlay snapshot under <spec_dir>/architecture_diff/):
//
//   open                                          open base atlas in browser
//   diff                                          render paginated before/after viewer
//   merge --spec <dir>|--all [--clean]            merge spec overlay(s) into base atlas
//   render                                        force-regenerate HTML from current state
//   feature add|set|remove                        feature lifecycle
//   submodule add|set|remove                      sub-module lifecycle
//   function add|remove                           function I/O rows
//   variable add|remove                           variable rows
//   dataflow add|remove|reorder                   ordered internal flow steps
//   error add|remove                              error rows
//   edge add|remove                               edges (intra-feature if both endpoints share a feature, otherwise cross-feature)
//   meta set                                      meta.title / meta.summary
//   actor add|remove                              top-level actors
//   validate                                      schema + referential integrity check
//   scan                                          scan directory for feature candidates
//   undo                                          revert the most recent mutation
//   help / --help / -h                            usage
//
// Global flags:
//   --project <root>     project root; creates resources/project-architecture/ if missing
//   --spec <spec_dir>    single specs write to <spec_dir>/architecture_diff/atlas/; batch member paths resolve to the coordination.md root
//   --no-render          skip auto-render after a mutation
//   --no-open            for open/diff: skip launching the browser
//   --dry-run            preview mutation changes as JSON diff without writing to disk
//   --json               request structured JSON output (used by status)
//   --out <dir>          for diff: override viewer output directory
//   --clean              for merge: remove spec overlays after successful merge
//   --all                for merge: merge all pending spec overlays under docs/plans/

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const schema = require('./schema');
const stateLib = require('./state');
const renderLib = require('./render');
const { parseEvidence } = schema;
const { computeDiff } = stateLib;

// formatFix generates apltk CLI commands from structured params,
// injected into schema.validate() so schema stays decoupled from CLI syntax.
function formatFix({ type, action, feature, submodule, name, side, scope, slug, kind }) {
  const parts = [`apltk architecture ${type} ${action}`];
  if (feature !== undefined) parts.push(`--feature ${feature}`);
  if (submodule !== undefined) parts.push(`--submodule ${submodule}`);
  if (slug !== undefined) parts.push(`--slug ${slug}`);
  if (name !== undefined) parts.push(`--name ${name}`);
  if (side !== undefined) parts.push(`--side ${side}`);
  if (scope !== undefined) parts.push(`--scope ${scope}`);
  if (kind !== undefined) parts.push(`--kind ${kind}`);
  return parts.join(' ');
}

const ATLAS_REL = path.join('resources', 'project-architecture');
const ATLAS_INDEX_REL = path.join(ATLAS_REL, 'index.html');
const ATLAS_DIRNAME = stateLib.ATLAS_DIRNAME;
const DIFF_DIRNAME = 'architecture_diff';
const PLANS_REL = path.join('docs', 'plans');
const COORDINATION_FILE = 'coordination.md';
const REMOVED_TXT = '_removed.txt';
const DEFAULT_DIFF_OUT_REL = path.join('.apollo-toolkit', 'architecture-diff');

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
  ];

  const familyPages = {
    feature: buildHelpPage({
      title: 'apltk architecture feature — manage feature modules.',
      summary: 'Add, update, or remove top-level feature records in the atlas state.',
      usageLines: [
        'apltk architecture feature add --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b]',
        'apltk architecture feature set --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b]',
        'apltk architecture feature remove --slug <feature>',
      ],
      useWhen: [
        'You need to create or rename the high-level feature inventory before editing its submodules.',
      ],
      notes: [
        'Run `apltk architecture feature add --help`, `set --help`, or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture feature add --slug register --title "User registration"',
          result: 'Creates the feature YAML entry and prints `atlas: feature add applied` unless validation fails.',
        },
      ],
    }),
    submodule: buildHelpPage({
      title: 'apltk architecture submodule — manage feature sub-modules.',
      summary: 'Add, update, or remove submodules inside a feature.',
      usageLines: [
        'apltk architecture submodule add --feature <feature> --slug <submodule> [--kind service] [--role "..."]',
        'apltk architecture submodule set --feature <feature> --slug <submodule> [--kind service] [--role "..."]',
        'apltk architecture submodule remove --feature <feature> --slug <submodule>',
      ],
      useWhen: [
        'You need to model the internal components that belong to one feature.',
      ],
      notes: [
        'Run `apltk architecture submodule add --help`, `set --help`, or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture submodule add --feature register --slug api --kind api --role "HTTP endpoint"',
          result: 'Adds the submodule and prints `atlas: submodule add applied` after the atlas state is updated.',
        },
      ],
    }),
    function: buildHelpPage({
      title: 'apltk architecture function — manage function rows on one submodule.',
      summary: 'Add or remove function I/O rows that internal dataflow steps can reference.',
      usageLines: [
        'apltk architecture function add --feature <feature> --submodule <submodule> --name <function> [--in "..."] [--out "..."] [--side "..."] [--purpose "..."]',
        'apltk architecture function remove --feature <feature> --submodule <submodule> --name <function>',
      ],
      useWhen: [
        'You need declared function names before attaching them to internal dataflow steps.',
      ],
      notes: [
        'Run `apltk architecture function add --help` or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture function add --feature register --submodule api --name handlePost --side network',
          result: 'Adds the function row and prints `atlas: function add applied`.',
        },
      ],
    }),
    variable: buildHelpPage({
      title: 'apltk architecture variable — manage variable rows on one submodule.',
      summary: 'Add or remove variable rows that dataflow steps can read from or write to.',
      usageLines: [
        'apltk architecture variable add --feature <feature> --submodule <submodule> --name <variable> [--type "..."] [--scope "..."] [--purpose "..."]',
        'apltk architecture variable remove --feature <feature> --submodule <submodule> --name <variable>',
      ],
      useWhen: [
        'You need declared variable names before referencing them through `--reads` or `--writes` in dataflow steps.',
      ],
      notes: [
        'Run `apltk architecture variable add --help` or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture variable add --feature register --submodule api --name token --type string --scope call',
          result: 'Adds the variable row and prints `atlas: variable add applied`.',
        },
      ],
    }),
    dataflow: buildHelpPage({
      title: 'apltk architecture dataflow — manage ordered internal flow steps.',
      summary: 'Add, remove, or reorder the internal dataflow of one submodule.',
      usageLines: [
        'apltk architecture dataflow add --feature <feature> --submodule <submodule> --step "..." [--at <index>] [--fn <name>] [--reads a,b] [--writes x,y]',
        'apltk architecture dataflow remove --feature <feature> --submodule <submodule> (--step "..." | --at <index>)',
        'apltk architecture dataflow reorder --feature <feature> --submodule <submodule> --from <index> --to <index>',
      ],
      useWhen: [
        'You need the submodule page to show its ordered internal execution steps instead of only static tables.',
      ],
      notes: [
        'Run `apltk architecture dataflow add --help`, `remove --help`, or `reorder --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture dataflow add --feature register --submodule api --step "Validate body" --fn handlePost --reads body --writes token',
          result: 'Adds an annotated dataflow step and prints `atlas: dataflow add applied`.',
        },
      ],
    }),
    error: buildHelpPage({
      title: 'apltk architecture error — manage local error rows.',
      summary: 'Add or remove named error rows for a submodule.',
      usageLines: [
        'apltk architecture error add --feature <feature> --submodule <submodule> --name <error> [--when "..."] [--means "..."]',
        'apltk architecture error remove --feature <feature> --submodule <submodule> --name <error>',
      ],
      useWhen: [
        'You need a submodule page to declare local errors that stay within that submodule boundary.',
      ],
      notes: [
        'Run `apltk architecture error add --help` or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture error add --feature register --submodule api --name ErrInviteCode --when "invite code missing"',
          result: 'Adds the error row and prints `atlas: error add applied`.',
        },
      ],
    }),
    edge: buildHelpPage({
      title: 'apltk architecture edge — manage cross-submodule or cross-feature edges.',
      summary: 'Add or remove `call`, `return`, `data-row`, or `failure` edges between atlas endpoints.',
      usageLines: [
        'apltk architecture edge add --from <feature[/submodule]> --to <feature[/submodule]> [--kind call] [--label "..."] [--id <edge-id>]',
        'apltk architecture edge remove --from <feature[/submodule]> --to <feature[/submodule]> [--id <edge-id>]',
      ],
      useWhen: [
        'You need to represent a dependency, response path, data hand-off, or failure path across boundaries.',
      ],
      notes: [
        'Run `apltk architecture edge add --help` or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture edge add --from register/ui --to register/api --kind call --label "POST /register"',
          result: 'Adds the edge and prints `atlas: edge add applied`.',
        },
      ],
    }),
    meta: buildHelpPage({
      title: 'apltk architecture meta — edit atlas title and summary.',
      summary: 'Update the top-level `meta.title` and `meta.summary` fields of the atlas state.',
      usageLines: [
        'apltk architecture meta set [--title "..."] [--summary "..."]',
      ],
      useWhen: [
        'You need to record scanned roots, omissions, or a clearer title for the rendered atlas.',
      ],
      notes: [
        'Run `apltk architecture meta set --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture meta set --summary "Scanned src/, jobs/, and db/; skipped legacy/."',
          result: 'Updates atlas metadata and prints `atlas: meta set applied`.',
        },
      ],
    }),
    actor: buildHelpPage({
      title: 'apltk architecture actor — manage top-level actor nodes.',
      summary: 'Add or remove actor declarations that appear at the atlas level.',
      usageLines: [
        'apltk architecture actor add --id <actor-id> [--label "..."]',
        'apltk architecture actor remove --id <actor-id>',
      ],
      useWhen: [
        'You need a named actor node to represent an external user or system in the macro diagram.',
      ],
      notes: [
        'Run `apltk architecture actor add --help` or `remove --help` for action-specific details.',
      ],
      examples: [
        {
          command: 'apltk architecture actor add --id customer --label "Customer"',
          result: 'Adds the actor node and prints `atlas: actor add applied`.',
        },
      ],
    }),
  };

  const actionPages = {
    'feature:add': buildHelpPage({
      title: 'apltk architecture feature add — create or replace one feature record.',
      summary: 'Ensure a feature exists, optionally with title, story, and dependency metadata.',
      usageLines: [
        'apltk architecture feature add --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need a new feature entry before adding submodules, edges, or feature-local content.',
      ],
      requiredFlags: [
        '`--slug <feature>`',
      ],
      optionalFlags: [
        '`--title "..."` to set the feature title.',
        '`--story "..."` to store a one-line user story or summary.',
        '`--depends-on a,b` to declare feature dependencies.',
        ...mutationFlags,
      ],
      notes: [
        'Reusing an existing slug updates that feature record rather than creating a duplicate.',
      ],
      examples: [
        {
          command: 'apltk architecture feature add --slug register --title "User registration" --story "New users create an account"',
          result: 'Writes the feature entry, renders unless `--no-render` is set, and prints `atlas: feature add applied`.',
        },
      ],
    }),
    'feature:set': buildHelpPage({
      title: 'apltk architecture feature set — update one existing feature record.',
      summary: 'Apply field updates to a feature while keeping its slug stable.',
      usageLines: [
        'apltk architecture feature set --slug <feature> [--title "..."] [--story "..."] [--depends-on a,b] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to change metadata on a feature that already exists in the atlas.',
      ],
      requiredFlags: [
        '`--slug <feature>`',
      ],
      optionalFlags: [
        '`--title`, `--story`, and `--depends-on` update the stored metadata fields.',
        ...mutationFlags,
      ],
      notes: [
        'If the slug does not exist yet, the CLI will still ensure the feature record exists before applying the fields.',
      ],
      examples: [
        {
          command: 'apltk architecture feature set --slug register --depends-on auth,billing',
          result: 'Updates the feature metadata and prints `atlas: feature set applied`.',
        },
      ],
    }),
    'feature:remove': buildHelpPage({
      title: 'apltk architecture feature remove — remove one feature and its related edges.',
      summary: 'Delete a feature record from the base atlas or record the removal inside a spec overlay.',
      usageLines: [
        'apltk architecture feature remove --slug <feature> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to retire a feature from the atlas or mark it for removal in a spec overlay.',
      ],
      requiredFlags: [
        '`--slug <feature>`',
      ],
      optionalFlags: mutationFlags,
      notes: [
        'Removing a feature also removes cross-feature edges that reference that feature.',
      ],
      examples: [
        {
          command: 'apltk architecture feature remove --slug legacy-auth --spec docs/plans/2026-05-11/drop-legacy',
          result: 'Records the removal in the spec overlay and prints `atlas: feature remove applied`.',
        },
      ],
    }),
    'submodule:add': buildHelpPage({
      title: 'apltk architecture submodule add — create or replace one submodule record.',
      summary: 'Ensure one submodule exists under a feature, optionally with kind and role metadata.',
      usageLines: [
        'apltk architecture submodule add --feature <feature> --slug <submodule> [--kind service] [--role "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to model a new service, API, UI, worker, or external component inside a feature.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--slug <submodule>`',
      ],
      optionalFlags: [
        '`--kind <kind>` to control the rendered submodule style.',
        '`--role "..."` to store a one-line responsibility summary.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture submodule add --feature register --slug api --kind api --role "HTTP endpoint"',
          result: 'Writes the submodule record and prints `atlas: submodule add applied`.',
        },
      ],
    }),
    'submodule:set': buildHelpPage({
      title: 'apltk architecture submodule set — update one submodule record.',
      summary: 'Update the metadata of an existing submodule.',
      usageLines: [
        'apltk architecture submodule set --feature <feature> --slug <submodule> [--kind service] [--role "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to refine the kind or role of a submodule that already exists.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--slug <submodule>`',
      ],
      optionalFlags: [
        '`--kind <kind>` and `--role "..."` update the stored metadata.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture submodule set --feature register --slug api --role "REST and invitation validation endpoint"',
          result: 'Updates the submodule record and prints `atlas: submodule set applied`.',
        },
      ],
    }),
    'submodule:remove': buildHelpPage({
      title: 'apltk architecture submodule remove — remove one submodule and its local edges.',
      summary: 'Delete a submodule from a feature or record that deletion in a spec overlay.',
      usageLines: [
        'apltk architecture submodule remove --feature <feature> --slug <submodule> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to remove a component from a feature while keeping the rest of the feature intact.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--slug <submodule>`',
      ],
      optionalFlags: mutationFlags,
      notes: [
        'Removing a submodule also removes feature-local edges that reference it.',
      ],
      examples: [
        {
          command: 'apltk architecture submodule remove --feature register --slug legacy-job',
          result: 'Removes the submodule and prints `atlas: submodule remove applied`.',
        },
      ],
    }),
    'function:add': buildHelpPage({
      title: 'apltk architecture function add — declare one function row.',
      summary: 'Add or replace a named function row on a submodule.',
      usageLines: [
        'apltk architecture function add --feature <feature> --submodule <submodule> --name <function> [--in "..."] [--out "..."] [--side "..."] [--purpose "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need a dataflow step to reference a real function or side-effect owner.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--name <function>`',
      ],
      optionalFlags: [
        '`--in`, `--out`, `--side`, and `--purpose` enrich the rendered function row.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture function add --feature register --submodule api --name handlePost --side network --purpose "Create a new account"',
          result: 'Adds the function row and prints `atlas: function add applied`.',
        },
      ],
    }),
    'function:remove': buildHelpPage({
      title: 'apltk architecture function remove — delete one function row.',
      summary: 'Remove a named function row from a submodule.',
      usageLines: [
        'apltk architecture function remove --feature <feature> --submodule <submodule> --name <function> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to drop a function row that should no longer appear in the submodule page.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--name <function>`',
      ],
      optionalFlags: mutationFlags,
      examples: [
        {
          command: 'apltk architecture function remove --feature register --submodule api --name handleLegacyPost',
          result: 'Removes the function row and prints `atlas: function remove applied`.',
        },
      ],
    }),
    'variable:add': buildHelpPage({
      title: 'apltk architecture variable add — declare one variable row.',
      summary: 'Add or replace a named variable row on a submodule.',
      usageLines: [
        'apltk architecture variable add --feature <feature> --submodule <submodule> --name <variable> [--type "..."] [--scope "..."] [--purpose "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need a declared variable before attaching it through `--reads` or `--writes` in the internal flow.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--name <variable>`',
      ],
      optionalFlags: [
        '`--type`, `--scope`, and `--purpose` enrich the rendered variable row.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture variable add --feature register --submodule api --name inviteCode --type string --scope call',
          result: 'Adds the variable row and prints `atlas: variable add applied`.',
        },
      ],
    }),
    'variable:remove': buildHelpPage({
      title: 'apltk architecture variable remove — delete one variable row.',
      summary: 'Remove a named variable row from a submodule.',
      usageLines: [
        'apltk architecture variable remove --feature <feature> --submodule <submodule> --name <variable> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to remove a variable that should no longer appear in the submodule page.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--name <variable>`',
      ],
      optionalFlags: mutationFlags,
      examples: [
        {
          command: 'apltk architecture variable remove --feature register --submodule api --name legacyToken',
          result: 'Removes the variable row and prints `atlas: variable remove applied`.',
        },
      ],
    }),
    'dataflow:add': buildHelpPage({
      title: 'apltk architecture dataflow add — append or insert one internal flow step.',
      summary: 'Create an ordered dataflow step, optionally annotated with a function reference and variable reads/writes.',
      usageLines: [
        'apltk architecture dataflow add --feature <feature> --submodule <submodule> --step "..." [--at <index>] [--fn <function>] [--reads a,b] [--writes x,y] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to express how a submodule works internally, not just what tables and edges it owns.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--step "..."`',
      ],
      optionalFlags: [
        '`--at <index>` inserts the step at a specific position instead of appending.',
        '`--fn <function>`, `--reads a,b`, and `--writes x,y` annotate the step with declared symbols.',
        ...mutationFlags,
      ],
      notes: [
        'Validation fails later if `--fn`, `--reads`, or `--writes` reference undeclared symbols.',
      ],
      examples: [
        {
          command: 'apltk architecture dataflow add --feature register --submodule api --step "Validate body" --fn handlePost --reads body --writes token',
          result: 'Adds the annotated step and prints `atlas: dataflow add applied`.',
        },
      ],
    }),
    'dataflow:remove': buildHelpPage({
      title: 'apltk architecture dataflow remove — delete one internal flow step.',
      summary: 'Remove a step either by its text or by its numeric position.',
      usageLines: [
        'apltk architecture dataflow remove --feature <feature> --submodule <submodule> --step "..." [--project <root>] [--spec <spec_dir>] [--no-render]',
        'apltk architecture dataflow remove --feature <feature> --submodule <submodule> --at <index> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to delete a stale or incorrect step from one submodule dataflow.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        'Either `--step "..."` or `--at <index>`',
      ],
      optionalFlags: mutationFlags,
      examples: [
        {
          command: 'apltk architecture dataflow remove --feature register --submodule api --at 0',
          result: 'Removes the selected step and prints `atlas: dataflow remove applied`.',
        },
      ],
    }),
    'dataflow:reorder': buildHelpPage({
      title: 'apltk architecture dataflow reorder — move one step to a new position.',
      summary: 'Reorder an existing dataflow sequence by moving one index to another index.',
      usageLines: [
        'apltk architecture dataflow reorder --feature <feature> --submodule <submodule> --from <index> --to <index> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'The steps are correct but the displayed execution order is wrong.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--from <index>`',
        '`--to <index>`',
      ],
      optionalFlags: mutationFlags,
      notes: [
        'Both indexes must point to existing steps.',
      ],
      examples: [
        {
          command: 'apltk architecture dataflow reorder --feature register --submodule api --from 2 --to 0',
          result: 'Moves the selected step and prints `atlas: dataflow reorder applied`.',
        },
      ],
    }),
    'error:add': buildHelpPage({
      title: 'apltk architecture error add — declare one local error row.',
      summary: 'Add or replace a named error row on a submodule.',
      usageLines: [
        'apltk architecture error add --feature <feature> --submodule <submodule> --name <error> [--when "..."] [--means "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to describe a local error state that belongs on the submodule page.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--name <error>`',
      ],
      optionalFlags: [
        '`--when` and `--means` store the trigger and interpretation.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture error add --feature register --submodule api --name ErrInviteCode --when "invite code missing"',
          result: 'Adds the error row and prints `atlas: error add applied`.',
        },
      ],
    }),
    'error:remove': buildHelpPage({
      title: 'apltk architecture error remove — delete one local error row.',
      summary: 'Remove a named error row from a submodule.',
      usageLines: [
        'apltk architecture error remove --feature <feature> --submodule <submodule> --name <error> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to delete an error row that is no longer relevant to the submodule.',
      ],
      requiredFlags: [
        '`--feature <feature>`',
        '`--submodule <submodule>`',
        '`--name <error>`',
      ],
      optionalFlags: mutationFlags,
      examples: [
        {
          command: 'apltk architecture error remove --feature register --submodule api --name ErrLegacyInvite',
          result: 'Removes the error row and prints `atlas: error remove applied`.',
        },
      ],
    }),
    'edge:add': buildHelpPage({
      title: 'apltk architecture edge add — create one edge between atlas endpoints.',
      summary: 'Add a `call`, `return`, `data-row`, or `failure` edge between two feature or feature/submodule endpoints.',
      usageLines: [
        'apltk architecture edge add --from <feature[/submodule]> --to <feature[/submodule]> [--kind call] [--label "..."] [--id <edge-id>] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to represent a dependency, response path, data hand-off, or failure path across boundaries.',
      ],
      requiredFlags: [
        '`--from <feature[/submodule]>`',
        '`--to <feature[/submodule]>`',
      ],
      optionalFlags: [
        '`--kind` chooses `call`, `return`, `data-row`, or `failure`.',
        '`--label "..."` stores a human-readable edge label.',
        '`--id <edge-id>` gives the edge a stable identifier for future removal.',
        ...mutationFlags,
      ],
      notes: [
        'If both endpoints stay inside the same feature and include submodules, the edge is stored on that feature rather than the atlas index.',
      ],
      examples: [
        {
          command: 'apltk architecture edge add --from register/ui --to register/api --kind call --label "POST /register" --id register-call',
          result: 'Adds the edge and prints `atlas: edge add applied`.',
        },
      ],
    }),
    'edge:remove': buildHelpPage({
      title: 'apltk architecture edge remove — delete one edge between atlas endpoints.',
      summary: 'Remove an edge by endpoint pair, optionally narrowed by a stable edge id.',
      usageLines: [
        'apltk architecture edge remove --from <feature[/submodule]> --to <feature[/submodule]> [--id <edge-id>] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to remove a dependency or flow edge that should no longer appear in the atlas.',
      ],
      requiredFlags: [
        '`--from <feature[/submodule]>`',
        '`--to <feature[/submodule]>`',
      ],
      optionalFlags: [
        '`--id <edge-id>` removes only the matching edge when multiple edges share the same endpoints.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture edge remove --from register/ui --to register/api --id register-call',
          result: 'Removes the edge and prints `atlas: edge remove applied`.',
        },
      ],
    }),
    'meta:set': buildHelpPage({
      title: 'apltk architecture meta set — update atlas title or summary.',
      summary: 'Write top-level metadata into the atlas index.',
      usageLines: [
        'apltk architecture meta set [--title "..."] [--summary "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to record what was scanned, what was skipped, or a clearer top-level atlas title.',
      ],
      optionalFlags: [
        '`--title "..."` updates `meta.title`.',
        '`--summary "..."` updates `meta.summary`.',
        ...mutationFlags,
      ],
      notes: [
        'Provide at least one of `--title` or `--summary` for a meaningful change.',
      ],
      examples: [
        {
          command: 'apltk architecture meta set --summary "Scanned app/, jobs/, and db/; skipped legacy/."',
          result: 'Updates the metadata and prints `atlas: meta set applied`.',
        },
      ],
    }),
    'actor:add': buildHelpPage({
      title: 'apltk architecture actor add — create one top-level actor.',
      summary: 'Add or replace a named actor node on the macro diagram.',
      usageLines: [
        'apltk architecture actor add --id <actor-id> [--label "..."] [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to represent an external user or system on the macro diagram.',
      ],
      requiredFlags: [
        '`--id <actor-id>`',
      ],
      optionalFlags: [
        '`--label "..."` overrides the rendered label while keeping a stable actor id.',
        ...mutationFlags,
      ],
      examples: [
        {
          command: 'apltk architecture actor add --id customer --label "Customer"',
          result: 'Adds the actor node and prints `atlas: actor add applied`.',
        },
      ],
    }),
    'actor:remove': buildHelpPage({
      title: 'apltk architecture actor remove — delete one top-level actor.',
      summary: 'Remove an actor node from the macro diagram.',
      usageLines: [
        'apltk architecture actor remove --id <actor-id> [--project <root>] [--spec <spec_dir>] [--no-render]',
      ],
      useWhen: [
        'You need to remove a top-level actor that should no longer appear in the atlas.',
      ],
      requiredFlags: [
        '`--id <actor-id>`',
      ],
      optionalFlags: mutationFlags,
      examples: [
        {
          command: 'apltk architecture actor remove --id customer',
          result: 'Removes the actor node and prints `atlas: actor remove applied`.',
        },
      ],
    }),
  };

  if (!verb) {
    return buildHelpPage({
      title: 'apltk architecture — declarative atlas CLI.',
      summary: 'Inspect, mutate, validate, diff, and merge the project architecture atlas without hand-editing the rendered HTML output.',
      usageLines: [
        'apltk architecture [verb] [options]',
        'apltk architecture help',
      ],
      useWhen: [
        'You need to browse or update `resources/project-architecture/` through YAML-backed atlas state.',
        'You need to render, compare, or merge spec overlays under `docs/plans/**/architecture_diff/`.',
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
        'Mutation families include `feature add|set|remove`, `submodule add|set|remove`, `function add|remove`, `variable add|remove`, `dataflow add|remove|reorder`, `error add|remove`, `edge add|remove`, `meta set`, and `actor add|remove`.',
        'Top-level verbs include `open`, `diff`, `merge`, `render`, `validate`, `status`, `scan`, and `undo`.',
        '`feature`, `submodule`, `function`, `variable`, `dataflow`, `error`, `edge`, `meta`, and `actor` all support deeper help such as `apltk architecture edge add --help`.',
        'Run `apltk architecture validate` before declaring atlas work done.',
      ],
      examples: [
        {
          command: 'apltk architecture',
          result: 'Prints the base atlas HTML path and opens it unless `--no-open` is set.',
        },
        {
          command: 'apltk architecture feature add --slug register --title "User registration"',
          result: 'Creates or updates the feature entry and prints `atlas: feature add applied`.',
        },
        {
          command: 'apltk architecture merge --spec docs/plans/2026-05-11/add-2fa',
          result: 'Merges a spec overlay into the base atlas and re-renders.',
        },
        {
          command: 'apltk architecture validate',
          result: 'Prints `atlas: OK` when the atlas state passes validation.',
        },
        {
          command: 'apltk architecture scan --src lib/',
          result: 'Outputs a JSON array of directory entries in `lib/` with suggested feature slugs.',
        },
        {
          command: 'apltk architecture diff',
          result: 'Builds the paginated diff viewer and prints its generated HTML path.',
        },
      ],
    });
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
    default:
      return null;
  }
}

const USAGE = buildArchitectureHelpPage();

function openInBrowser(filePath) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === 'darwin') { command = 'open'; args = [filePath]; }
  else if (platform === 'win32') { command = 'cmd'; args = ['/c', 'start', '""', filePath]; }
  else { command = 'xdg-open'; args = [filePath]; }
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch (_e) { /* best effort */ }
}

function ensureResourcesLayout(projectRoot) {
  fs.mkdirSync(path.join(projectRoot, ATLAS_REL), { recursive: true });
}

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, ATLAS_INDEX_REL))) return dir;
    if (fs.existsSync(path.join(dir, ATLAS_REL, ATLAS_DIRNAME, stateLib.INDEX_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function splitList(value) {
  if (value == null) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function findFirstPositional(args) {
  const booleanFlags = new Set(['no-render', 'no-open', 'help', 'force', 'dry-run', 'json']);
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === '--') return i + 1 < args.length ? i + 1 : -1;
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) { i++; continue; }
      const name = token.slice(2);
      if (booleanFlags.has(name)) { i++; continue; }
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) { i += 2; } else { i++; }
      continue;
    }
    if (token === '-h') { i++; continue; }
    return i;
  }
  return -1;
}

function parseFlags(args) {
  const positional = [];
  const flags = Object.create(null);
  while (args.length > 0) {
    const token = args.shift();
    if (token === '--') { positional.push(...args); break; }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      let name;
      let value;
      if (eq !== -1) { name = token.slice(2, eq); value = token.slice(eq + 1); }
      else {
        name = token.slice(2);
        const nextIsValue = args.length > 0 && !args[0].startsWith('--');
        const booleanFlags = new Set(['no-render', 'no-open', 'help', 'force', 'dry-run', 'json']);
        if (booleanFlags.has(name) || !nextIsValue) value = true;
        else value = args.shift();
      }
      if (flags[name] !== undefined) {
        flags[name] = Array.isArray(flags[name]) ? [...flags[name], value] : [flags[name], value];
      } else {
        flags[name] = value;
      }
    } else if (token === '-h') {
      flags.help = true;
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

function requireFlag(flags, name) {
  if (flags[name] === undefined || flags[name] === null || flags[name] === true) {
    throw new Error(`Missing required flag --${name}`);
  }
  return flags[name];
}

function resolveProjectRoot(flags) {
  const finish = (root) => {
    ensureResourcesLayout(root);
    return root;
  };
  if (flags.project) return finish(path.resolve(String(flags.project)));
  const discovered = findProjectRoot(process.cwd());
  if (discovered) return finish(discovered);
  // No marker walking parents — use cwd and create resources/project-architecture/.
  return finish(process.cwd());
}

function specOverlayDir(projectRoot, specFlag) {
  const specDir = path.isAbsolute(String(specFlag)) ? String(specFlag) : path.resolve(projectRoot, String(specFlag));
  const plansRoot = path.join(projectRoot, PLANS_REL);
  const batchRoot = fs.existsSync(path.join(specDir, COORDINATION_FILE)) ? specDir : findBatchRoot(specDir, plansRoot);
  const rootDir = batchRoot || specDir;
  return {
    specDir,
    rootDir,
    overlayDir: path.join(rootDir, DIFF_DIRNAME, ATLAS_DIRNAME),
    htmlOutDir: path.join(rootDir, DIFF_DIRNAME),
  };
}

function baseAtlasDir(projectRoot) {
  return path.join(projectRoot, ATLAS_REL, ATLAS_DIRNAME);
}

function baseHtmlOutDir(projectRoot) {
  return path.join(projectRoot, ATLAS_REL);
}

function loadResolvedState(projectRoot, flags) {
  const base = stateLib.load(baseAtlasDir(projectRoot));
  if (!flags.spec) return { base, merged: base, overlay: null };
  const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
  const overlay = stateLib.loadOverlay(overlayDir);
  const merged = stateLib.mergeOverlay(base, overlay);
  return { base, merged, overlay };
}

function findFeature(state, slug) {
  return (state.features || []).find((f) => f.slug === slug);
}

function findSubmodule(feature, slug) {
  return ((feature && feature.submodules) || []).find((s) => s.slug === slug);
}

function ensureBaseAtlasDir(projectRoot) {
  const dir = baseAtlasDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
}

async function performMutation(projectRoot, flags, action, args, mutate, io) {
  // --dry-run: clone resolved state, apply mutation, print JSON diff, return
  if (flags['dry-run']) {
    const { base, merged, overlay } = loadResolvedState(projectRoot, flags);
    const before = merged;
    const dryRunState = JSON.parse(JSON.stringify(merged));
    if (flags.spec) {
      mutate(dryRunState, base, overlay);
    } else {
      mutate(dryRunState, dryRunState, null);
    }
    const diff = computeDiff(before, dryRunState);
    try {
      (io || process).stdout.write(JSON.stringify({ action: 'dry-run', diff }) + '\n');
    } catch (err) {
      (io || process).stderr.write(`dry-run error: ${err.message}\n`);
    }
    return;
  }
  const isSpec = Boolean(flags.spec);
  const base = stateLib.load(baseAtlasDir(projectRoot));
  let merged = base;

  if (isSpec) {
    const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
    const overlay = stateLib.loadOverlay(overlayDir);
    merged = stateLib.mergeOverlay(base, overlay);
    const before = JSON.parse(JSON.stringify({ base, overlay }));
    mutate(merged, base, overlay);
    stateLib.writeUndoSnapshot(overlayDir, before);
    stateLib.saveOverlay(overlayDir, stateLib.deriveOverlay(base, merged));
    stateLib.appendHistory(overlayDir, { action, args, mode: 'spec' });
  } else {
    ensureBaseAtlasDir(projectRoot);
    const before = JSON.parse(JSON.stringify({ base }));
    mutate(base, base, null);
    stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), before);
    stateLib.save(baseAtlasDir(projectRoot), base);
    stateLib.appendHistory(baseAtlasDir(projectRoot), { action, args, mode: 'base' });
  }

  if (!flags['no-render']) {
    await runRender({ projectRoot, flags });
  }
}

async function runRender({ projectRoot, flags }) {
  if (flags.spec) {
    const { overlayDir, htmlOutDir } = specOverlayDir(projectRoot, flags.spec);
    const base = stateLib.load(baseAtlasDir(projectRoot));
    const overlay = stateLib.loadOverlay(overlayDir);
    const merged = stateLib.mergeOverlay(base, overlay);
    const diff = stateLib.diffPages(base, merged);
    const scope = renderLib.scopeFromDiff(diff);
    const removedPaths = renderLib.removedPagePathsFromDiff(diff);
    fs.mkdirSync(htmlOutDir, { recursive: true });
    return renderLib.renderAll({ outDir: htmlOutDir, state: merged, scope, removedPaths });
  }
  const state = stateLib.load(baseAtlasDir(projectRoot));
  return renderLib.renderAll({ outDir: baseHtmlOutDir(projectRoot), state });
}

// ---- mutation helpers ---------------------------------------------------

function ensureFeature(state, slug, init) {
  let feature = findFeature(state, slug);
  if (!feature) {
    feature = { slug, title: slug, story: '', dependsOn: [], submodules: [], edges: [], ...init };
    state.features = state.features || [];
    state.features.push(feature);
  } else if (init) {
    Object.assign(feature, init);
  }
  return feature;
}

function removeFeature(state, slug) {
  if (!state.features) return false;
  const before = state.features.length;
  state.features = state.features.filter((f) => f.slug !== slug);
  // also drop cross-feature edges that reference this slug
  state.edges = (state.edges || []).filter((e) => !endpointReferences(e.from, slug) && !endpointReferences(e.to, slug));
  return state.features.length < before;
}

function endpointReferences(endpoint, slug) {
  if (!endpoint || typeof endpoint === 'string') return false;
  return endpoint.feature === slug;
}

function ensureSubmodule(feature, slug, init) {
  let sub = findSubmodule(feature, slug);
  if (!sub) {
    sub = { slug, kind: 'service', role: '', functions: [], variables: [], dataflow: [], errors: [], ...init };
    feature.submodules = feature.submodules || [];
    feature.submodules.push(sub);
  } else if (init) {
    Object.assign(sub, init);
  }
  return sub;
}

function removeSubmodule(feature, slug) {
  if (!feature.submodules) return false;
  const before = feature.submodules.length;
  feature.submodules = feature.submodules.filter((s) => s.slug !== slug);
  feature.edges = (feature.edges || []).filter((e) => {
    const f = typeof e.from === 'string' ? e.from : e.from && e.from.submodule;
    const t = typeof e.to === 'string' ? e.to : e.to && e.to.submodule;
    return f !== slug && t !== slug;
  });
  return feature.submodules.length < before;
}

function parseEndpoint(value) {
  // accepts "feature" or "feature/submodule"
  const [feat, sub] = String(value).split('/').map((s) => s && s.trim()).filter(Boolean).concat([undefined])
    .slice(0, 2);
  if (!feat) throw new Error(`Invalid endpoint: ${value}`);
  return sub ? { feature: feat, submodule: sub } : { feature: feat };
}

function isIntraFeatureEdge(from, to) {
  return from && to && from.feature && to.feature && from.feature === to.feature && from.submodule && to.submodule;
}

// ---- verb dispatch ------------------------------------------------------

async function verbFeature(action, flags, projectRoot, io) {
  const slug = String(requireFlag(flags, 'slug'));
  if (action === 'add' || action === 'set') {
    const init = {};
    if (flags.title !== undefined) init.title = String(flags.title);
    if (flags.story !== undefined) init.story = String(flags.story);
    if (flags['depends-on'] !== undefined) init.dependsOn = splitList(flags['depends-on']);
    if (flags.evidence !== undefined) init.evidence = parseEvidence(flags.evidence);
    return performMutation(projectRoot, flags, `feature ${action}`, { slug, ...init }, (state) => {
      ensureFeature(state, slug, init);
      return { touchedFeatures: new Set([slug]) };
    }, io);
  }
  if (action === 'remove') {
    return performMutation(projectRoot, flags, 'feature remove', { slug }, (state) => {
      removeFeature(state, slug);
      return { removalsHint: { features: [slug] } };
    }, io);
  }
  throw new Error(`Unknown feature subverb: ${action}`);
}

async function verbSubmodule(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const slug = String(requireFlag(flags, 'slug'));
  if (action === 'add' || action === 'set') {
    const init = {};
    if (flags.kind !== undefined) init.kind = String(flags.kind);
    if (flags.role !== undefined) init.role = String(flags.role);
    if (flags.evidence !== undefined) init.evidence = parseEvidence(flags.evidence);
    return performMutation(projectRoot, flags, `submodule ${action}`, { feature: featureSlug, slug, ...init }, (state) => {
      const feature = ensureFeature(state, featureSlug);
      ensureSubmodule(feature, slug, init);
      return { touchedFeatures: new Set([featureSlug]) };
    }, io);
  }
  if (action === 'remove') {
    return performMutation(projectRoot, flags, 'submodule remove', { feature: featureSlug, slug }, (state) => {
      const feature = findFeature(state, featureSlug);
      if (feature) removeSubmodule(feature, slug);
      return { touchedFeatures: new Set([featureSlug]), removalsHint: { submodules: [{ feature: featureSlug, submodule: slug }] } };
    }, io);
  }
  throw new Error(`Unknown submodule subverb: ${action}`);
}

async function verbFunction(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  const name = String(requireFlag(flags, 'name'));
  return performMutation(projectRoot, flags, `function ${action}`, { feature: featureSlug, submodule: subSlug, name }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    if (action === 'add') {
      sub.functions = (sub.functions || []).filter((f) => f.name !== name);
      const fn = { name };
      if (flags.in !== undefined) fn.in = String(flags.in);
      if (flags.out !== undefined) fn.out = String(flags.out);
      if (flags.side !== undefined) fn.side = String(flags.side);
      if (flags.purpose !== undefined) fn.purpose = String(flags.purpose);
      if (flags.evidence !== undefined) fn.evidence = parseEvidence(flags.evidence);
      sub.functions.push(fn);
    } else if (action === 'remove') {
      sub.functions = (sub.functions || []).filter((f) => f.name !== name);
    } else {
      throw new Error(`Unknown function subverb: ${action}`);
    }
    return { touchedFeatures: new Set([featureSlug]) };
  }, io);
}

async function verbVariable(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  const name = String(requireFlag(flags, 'name'));
  return performMutation(projectRoot, flags, `variable ${action}`, { feature: featureSlug, submodule: subSlug, name }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    if (action === 'add') {
      sub.variables = (sub.variables || []).filter((v) => v.name !== name);
      const v = { name };
      if (flags.type !== undefined) v.type = String(flags.type);
      if (flags.scope !== undefined) v.scope = String(flags.scope);
      if (flags.purpose !== undefined) v.purpose = String(flags.purpose);
      if (flags.evidence !== undefined) v.evidence = parseEvidence(flags.evidence);
      sub.variables.push(v);
    } else if (action === 'remove') {
      sub.variables = (sub.variables || []).filter((v) => v.name !== name);
    } else {
      throw new Error(`Unknown variable subverb: ${action}`);
    }
    return { touchedFeatures: new Set([featureSlug]) };
  }, io);
}

async function verbDataflow(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  return performMutation(projectRoot, flags, `dataflow ${action}`, { feature: featureSlug, submodule: subSlug, step: flags.step, at: flags.at }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    sub.dataflow = sub.dataflow || [];
    if (action === 'add') {
      const step = String(requireFlag(flags, 'step'));
      const item = buildDataflowItem(step, flags);
      const atRaw = flags.at;
      if (atRaw !== undefined) {
        const at = Number(atRaw);
        if (!Number.isFinite(at) || at < 0) throw new Error('--at must be a non-negative integer');
        sub.dataflow.splice(at, 0, item);
      } else {
        sub.dataflow.push(item);
      }
    } else if (action === 'remove') {
      if (flags.at !== undefined) {
        const at = Number(flags.at);
        if (!Number.isFinite(at) || at < 0 || at >= sub.dataflow.length) throw new Error('--at out of range');
        sub.dataflow.splice(at, 1);
      } else {
        const step = String(requireFlag(flags, 'step'));
        sub.dataflow = sub.dataflow.filter((s) => stepText(s) !== step);
      }
    } else if (action === 'reorder') {
      const from = Number(requireFlag(flags, 'from'));
      const to = Number(requireFlag(flags, 'to'));
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0 || from >= sub.dataflow.length || to >= sub.dataflow.length) {
        throw new Error('--from / --to out of range');
      }
      const [moved] = sub.dataflow.splice(from, 1);
      sub.dataflow.splice(to, 0, moved);
    } else {
      throw new Error(`Unknown dataflow subverb: ${action}`);
    }
    return { touchedFeatures: new Set([featureSlug]) };
  }, io);
}

function stepText(item) {
  return typeof item === 'string' ? item : (item && typeof item.step === 'string' ? item.step : '');
}

function parseNameList(raw) {
  if (raw === undefined || raw === null) return undefined;
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDataflowItem(step, flags) {
  const fn = flags.fn === undefined ? undefined : String(flags.fn).trim();
  const reads = parseNameList(flags.reads);
  const writes = parseNameList(flags.writes);
  const annotated = (fn && fn.length > 0) || (reads && reads.length > 0) || (writes && writes.length > 0);
  if (!annotated) return step;
  const item = { step };
  if (fn) item.fn = fn;
  if (reads && reads.length > 0) item.reads = reads;
  if (writes && writes.length > 0) item.writes = writes;
  return item;
}

async function verbError(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  const name = String(requireFlag(flags, 'name'));
  return performMutation(projectRoot, flags, `error ${action}`, { feature: featureSlug, submodule: subSlug, name }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    if (action === 'add') {
      sub.errors = (sub.errors || []).filter((e) => e.name !== name);
      const err = { name };
      if (flags.when !== undefined) err.when = String(flags.when);
      if (flags.means !== undefined) err.means = String(flags.means);
      if (flags.evidence !== undefined) err.evidence = parseEvidence(flags.evidence);
      sub.errors.push(err);
    } else if (action === 'remove') {
      sub.errors = (sub.errors || []).filter((e) => e.name !== name);
    } else {
      throw new Error(`Unknown error subverb: ${action}`);
    }
    return { touchedFeatures: new Set([featureSlug]) };
  }, io);
}

async function verbEdge(action, flags, projectRoot, io) {
  const from = parseEndpoint(requireFlag(flags, 'from'));
  const to = parseEndpoint(requireFlag(flags, 'to'));
  return performMutation(projectRoot, flags, `edge ${action}`, { from, to, kind: flags.kind, label: flags.label, id: flags.id }, (state) => {
    if (action === 'add') {
      const edge = {
        id: flags.id ? String(flags.id) : undefined,
        from,
        to,
        kind: flags.kind ? String(flags.kind) : 'call',
        label: flags.label !== undefined ? String(flags.label) : '',
      };
      if (!edge.id) edge.id = `e-${Math.random().toString(36).slice(2, 8)}`;
      const intra = isIntraFeatureEdge(from, to);
      if (intra) {
        const feature = ensureFeature(state, from.feature);
        feature.edges = feature.edges || [];
        feature.edges = feature.edges.filter((e) => e.id !== edge.id);
        feature.edges.push({
          id: edge.id,
          from: from.submodule,
          to: to.submodule,
          kind: edge.kind,
          label: edge.label,
        });
        return { touchedFeatures: new Set([from.feature]) };
      }
      state.edges = state.edges || [];
      state.edges = state.edges.filter((e) => e.id !== edge.id);
      state.edges.push(edge);
      return { touchedFeatures: new Set([from.feature, to.feature]) };
    }
    if (action === 'remove') {
      const id = flags.id ? String(flags.id) : null;
      const intra = isIntraFeatureEdge(from, to);
      if (intra) {
        const feature = findFeature(state, from.feature);
        if (feature) {
          feature.edges = (feature.edges || []).filter((e) => {
            if (id && e.id === id) return false;
            const f = typeof e.from === 'string' ? e.from : e.from && e.from.submodule;
            const t = typeof e.to === 'string' ? e.to : e.to && e.to.submodule;
            return !(f === from.submodule && t === to.submodule);
          });
          return { touchedFeatures: new Set([from.feature]) };
        }
        return { touchedFeatures: new Set([from.feature]) };
      }
      state.edges = (state.edges || []).filter((e) => {
        if (id && e.id === id) return false;
        return !(endpointEquals(e.from, from) && endpointEquals(e.to, to));
      });
      return { touchedFeatures: new Set([from.feature, to.feature]) };
    }
    throw new Error(`Unknown edge subverb: ${action}`);
  }, io);
}

function endpointEquals(a, b) {
  if (typeof a === 'string' || typeof b === 'string') return false;
  if (!a || !b) return false;
  return a.feature === b.feature && (a.submodule || null) === (b.submodule || null);
}

async function verbMeta(action, flags, projectRoot, io) {
  if (action !== 'set') throw new Error(`Unknown meta subverb: ${action}`);
  const update = {};
  if (flags.title !== undefined) update.title = String(flags.title);
  if (flags.summary !== undefined) update.summary = String(flags.summary);
  return performMutation(projectRoot, flags, 'meta set', update, (state) => {
    state.meta = { ...state.meta, ...update };
  }, io);
}

async function verbActor(action, flags, projectRoot, io) {
  const id = String(requireFlag(flags, 'id'));
  return performMutation(projectRoot, flags, `actor ${action}`, { id, label: flags.label }, (state) => {
    state.actors = state.actors || [];
    if (action === 'add') {
      state.actors = state.actors.filter((a) => a.id !== id);
      state.actors.push({ id, label: flags.label !== undefined ? String(flags.label) : id });
    } else if (action === 'remove') {
      state.actors = state.actors.filter((a) => a.id !== id);
    } else {
      throw new Error(`Unknown actor subverb: ${action}`);
    }
  }, io);
}

async function verbValidate(flags, projectRoot, io) {
  const { merged } = loadResolvedState(projectRoot, flags);
  const result = schema.validate(merged, formatFix);
  if (result.valid) {
    io.stdout.write('atlas: OK\n');
    return 0;
  }
  for (const err of result.errors) {
    io.stderr.write(`${err.message}\n`);
    if (err.fixCommand) {
      io.stderr.write(`  → fix: ${err.fixCommand}\n`);
    }
  }
  return 1;
}

async function verbStatus(flags, projectRoot, io) {
  const { merged } = loadResolvedState(projectRoot, flags);
  const summary = stateLib.summarize(merged);
  const validation = schema.validate(merged, formatFix);

  if (flags.json) {
    const output = {
      meta: summary.meta,
      counts: summary.counts,
      featureList: summary.featureList,
      validation: {
        valid: validation.valid,
        errorCount: validation.errors.length,
        errors: validation.errors.map((e) => e.message),
      },
    };
    try {
      io.stdout.write(JSON.stringify(output) + '\n');
    } catch (err) {
      io.stderr.write(`status error: ${err.message}\n`);
    }
    return 0;
  }

  io.stdout.write('Atlas Status\n');
  io.stdout.write(`  Features: ${summary.counts.features}\n`);
  io.stdout.write(`  Submodules: ${summary.counts.submodules}\n`);
  io.stdout.write(`  Cross-feature edges: ${summary.counts.crossFeatureEdges}\n`);
  io.stdout.write(`  Intra-feature edges: ${summary.counts.intraFeatureEdges}\n`);
  io.stdout.write(`  Actors: ${summary.counts.actors}\n`);
  io.stdout.write(`  Updated: ${summary.meta.updatedAt || 'never'}\n`);

  if (validation.valid) {
    io.stdout.write('  Validation: OK\n');
  } else {
    io.stdout.write(`  Validation: ${validation.errors.length} error(s)\n`);
  }

  io.stdout.write('  Features:\n');
  for (const f of summary.featureList) {
    io.stdout.write(`    ${f.slug}: ${f.title} (${f.submoduleCount} submodules)\n`);
  }

  return 0;
}

async function verbScan(flags, projectRoot, io) {
  const srcSpecified = flags.src !== undefined;
  const srcRaw = srcSpecified ? String(flags.src) : 'src';
  const srcDir = path.resolve(projectRoot, srcRaw);

  let entries;
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch (e) {
    if (!srcSpecified) {
      // Fallback to project root when default src/ doesn't exist
      try {
        entries = fs.readdirSync(projectRoot, { withFileTypes: true });
        srcDir = projectRoot;
      } catch (e2) {
        io.stderr.write(`Cannot read directory: ${projectRoot}\n`);
        return 1;
      }
    } else {
      io.stderr.write(`Cannot read directory: ${srcDir}\n`);
      return 1;
    }
  }

  const skipDirs = new Set(['node_modules', '.git', 'dist', '__tests__', '__test__', 'coverage', '.turbo', 'build']);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (skipDirs.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const suggestion = entry.name
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || entry.name.toLowerCase();

    results.push({
      name: entry.name,
      path: path.relative(projectRoot, path.join(srcDir, entry.name)),
      suggestion,
    });
  }

  try {
    io.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } catch (err) {
    io.stderr.write(`scan error: ${err.message}\n`);
  }
  return 0;
}

async function verbUndo(flags, projectRoot, io) {
  const dir = flags.spec ? specOverlayDir(projectRoot, flags.spec).overlayDir : baseAtlasDir(projectRoot);
  const stepsRaw = flags.steps === undefined ? 1 : Number(flags.steps);
  if (!Number.isInteger(stepsRaw) || stepsRaw < 1) {
    io.stderr.write('--steps must be a positive integer.\n');
    return 1;
  }
  const snapshot = stateLib.consumeUndoSnapshot(dir, stepsRaw);
  if (!snapshot) {
    io.stderr.write(stepsRaw === 1 ? 'No undo snapshot found.\n' : `Unable to undo ${stepsRaw} steps; history is shorter.\n`);
    return 1;
  }
  if (flags.spec) {
    const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
    stateLib.saveOverlay(overlayDir, snapshot.overlay);
    stateLib.appendHistory(overlayDir, { action: 'undo', mode: 'spec' });
  } else {
    stateLib.save(baseAtlasDir(projectRoot), snapshot.base);
    stateLib.appendHistory(baseAtlasDir(projectRoot), { action: 'undo', mode: 'base' });
  }
  if (!flags['no-render']) await runRender({ projectRoot, flags });
  io.stdout.write(`atlas: undo applied (${stepsRaw} step${stepsRaw === 1 ? '' : 's'})\n`);
  return 0;
}

async function verbOpen(flags, projectRoot, io) {
  const atlas = path.join(projectRoot, ATLAS_INDEX_REL);
  if (!fs.existsSync(atlas)) {
    await runRender({ projectRoot, flags: { ...flags, spec: undefined } });
  }
  if (!fs.existsSync(atlas)) {
    io.stderr.write(`Atlas not found after render: ${atlas}\n`);
    return 1;
  }
  io.stdout.write(`${atlas}\n`);
  if (!flags['no-open']) openInBrowser(atlas);
  return 0;
}

async function verbDiff(flags, projectRoot, io) {
  const outDir = flags.out ? path.resolve(String(flags.out)) : path.join(projectRoot, DEFAULT_DIFF_OUT_REL);
  fs.mkdirSync(outDir, { recursive: true });
  const changes = await collectDiffChanges({ projectRoot, outDir });

  const html = renderDiffViewer({ changes, projectRoot, outDir });
  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf8');
  io.stdout.write(`${indexPath}\n`);
  io.stdout.write(`Diff pages: ${changes.length} (modified=${changes.filter((c) => c.kind === 'modified').length}, added=${changes.filter((c) => c.kind === 'added').length}, removed=${changes.filter((c) => c.kind === 'removed').length})\n`);
  if (!flags['no-open']) openInBrowser(indexPath);
  return 0;
}

async function collectDiffChanges({ projectRoot, outDir }) {
  const plansRoot = path.join(projectRoot, PLANS_REL);
  const groups = groupDiffDirsByBatch({ projectRoot, plansRoot });
  const changes = [];

  for (const group of groups) {
    if (group.kind === 'batch') {
      changes.push(...await collectBatchGroupChanges({ projectRoot, outDir, group }));
    } else {
      changes.push(...collectSingleSpecChanges({ projectRoot, specDir: group.specDir, specLabel: group.label }));
    }
  }

  changes.sort((a, b) => {
    if (a.spec !== b.spec) return a.spec.localeCompare(b.spec);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.rel.localeCompare(b.rel);
  });
  return changes;
}

function groupDiffDirsByBatch({ projectRoot, plansRoot }) {
  const groups = new Map();
  for (const diffDir of walkArchitectureDiffDirs(plansRoot)) {
    const specDir = path.dirname(diffDir);
    const batchRoot = findBatchRoot(specDir, plansRoot);
    const isBatchMember = Boolean(batchRoot && batchRoot !== specDir);
    const key = isBatchMember ? batchRoot : specDir;
    if (!groups.has(key)) {
      groups.set(key, {
        kind: isBatchMember ? 'batch' : 'single',
        key,
        label: path.relative(projectRoot, key),
        specDir: isBatchMember ? null : specDir,
        members: [],
      });
    }
    groups.get(key).members.push({ specDir, diffDir, label: path.relative(projectRoot, specDir) });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, members: group.members.sort((a, b) => a.specDir.localeCompare(b.specDir)) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function findBatchRoot(specDir, plansRoot) {
  const absolutePlansRoot = path.resolve(plansRoot);
  let current = path.resolve(path.dirname(specDir));
  while (current.startsWith(`${absolutePlansRoot}${path.sep}`) || current === absolutePlansRoot) {
    if (fs.existsSync(path.join(current, COORDINATION_FILE))) return current;
    if (current === absolutePlansRoot) break;
    current = path.dirname(current);
  }
  return null;
}

function collectSingleSpecChanges({ projectRoot, specDir, specLabel }) {
  const overlayDir = path.join(specDir, DIFF_DIRNAME, ATLAS_DIRNAME);
  if (!hasOverlayState(overlayDir)) {
    return collectHtmlManifestChanges({ projectRoot, diffDir: path.join(specDir, DIFF_DIRNAME), specLabel });
  }
  const base = stateLib.load(baseAtlasDir(projectRoot));
  const overlay = stateLib.loadOverlay(overlayDir);
  const merged = stateLib.mergeOverlay(base, overlay);
  const diff = stateLib.diffPages(base, merged);
  return diffToChanges({
    projectRoot,
    specLabel,
    htmlRoot: path.join(specDir, DIFF_DIRNAME),
    diff,
  });
}

function hasOverlayState(overlayDir) {
  return fs.existsSync(path.join(overlayDir, stateLib.INDEX_FILE))
    || fs.existsSync(path.join(overlayDir, stateLib.FEATURES_DIR))
    || fs.existsSync(path.join(overlayDir, stateLib.REMOVED_FILE));
}

async function collectBatchGroupChanges({ projectRoot, outDir, group }) {
  const batchRootOverlayDir = path.join(group.key, DIFF_DIRNAME, ATLAS_DIRNAME);
  if (hasOverlayState(batchRootOverlayDir)) {
    return collectSingleSpecChanges({ projectRoot, specDir: group.key, specLabel: group.label });
  }

  const memberOverlayDirs = group.members.map((member) => ({
    ...member,
    overlayDir: path.join(member.specDir, DIFF_DIRNAME, ATLAS_DIRNAME),
  }));
  if (memberOverlayDirs.some((member) => !hasOverlayState(member.overlayDir))) {
    return group.members.flatMap((member) => (
      collectSingleSpecChanges({ projectRoot, specDir: member.specDir, specLabel: member.label })
    ));
  }

  const base = stateLib.load(baseAtlasDir(projectRoot));
  let merged = JSON.parse(JSON.stringify(base));
  for (const member of memberOverlayDirs) {
    const overlay = stateLib.loadOverlay(member.overlayDir);
    merged = stateLib.mergeOverlay(merged, overlay);
  }
  const diff = stateLib.diffPages(base, merged);
  const htmlRoot = path.join(outDir, '_batch', group.label);
  await renderLib.renderAll({
    outDir: htmlRoot,
    state: merged,
    scope: renderLib.scopeFromDiff(diff),
    removedPaths: renderLib.removedPagePathsFromDiff(diff),
  });
  return diffToChanges({
    projectRoot,
    specLabel: group.label,
    htmlRoot,
    diff,
  });
}

function diffToChanges({ projectRoot, specLabel, htmlRoot, diff }) {
  const resourcesRoot = path.join(projectRoot, ATLAS_REL);
  const changes = [];
  const add = (kind, rel) => {
    const beforeAbs = path.join(resourcesRoot, rel);
    const afterAbs = kind === 'removed' ? null : path.join(htmlRoot, rel);
    if (kind === 'removed' && !fs.existsSync(beforeAbs)) return;
    changes.push({
      kind,
      rel,
      spec: specLabel,
      beforePath: kind === 'added' ? null : path.relative(projectRoot, beforeAbs),
      afterPath: afterAbs ? path.relative(projectRoot, afterAbs) : null,
    });
  };

  if (diff.macroChanged) {
    add('modified', renderLib.pagePathFor('macro'));
  }
  for (const slug of diff.modifiedFeatures || []) {
    add('modified', renderLib.pagePathFor('feature', { featureSlug: slug }));
  }
  for (const slug of diff.addedFeatures || []) {
    add('added', renderLib.pagePathFor('feature', { featureSlug: slug }));
  }
  for (const item of diff.modifiedSubmodules || []) {
    add('modified', renderLib.pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }
  for (const item of diff.addedSubmodules || []) {
    add('added', renderLib.pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }
  for (const slug of diff.removedFeatures || []) {
    add('removed', renderLib.pagePathFor('feature', { featureSlug: slug }));
  }
  for (const item of diff.removedSubmodules || []) {
    add('removed', renderLib.pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }

  return changes;
}

function collectHtmlManifestChanges({ projectRoot, diffDir, specLabel }) {
  const resourcesRoot = path.join(projectRoot, ATLAS_REL);
  const changes = [];
  for (const after of walkAfterStateHtml(diffDir)) {
    const beforeAbs = path.join(resourcesRoot, after.rel);
    const beforeExists = fs.existsSync(beforeAbs);
    changes.push({
      kind: beforeExists ? 'modified' : 'added',
      rel: after.rel,
      spec: specLabel,
      beforePath: beforeExists ? path.relative(projectRoot, beforeAbs) : null,
      afterPath: path.relative(projectRoot, after.abs),
    });
  }
  for (const removedRel of readRemovedManifest(diffDir)) {
    const beforeAbs = path.join(resourcesRoot, removedRel);
    if (!fs.existsSync(beforeAbs)) continue;
    changes.push({
      kind: 'removed',
      rel: removedRel,
      spec: specLabel,
      beforePath: path.relative(projectRoot, beforeAbs),
      afterPath: null,
    });
  }
  return changes;
}

function walkArchitectureDiffDirs(plansRoot) {
  const result = [];
  if (!fs.existsSync(plansRoot)) return result;
  function recurse(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === DIFF_DIRNAME) { result.push(full); continue; }
      recurse(full);
    }
  }
  recurse(plansRoot);
  return result;
}

function walkAfterStateHtml(diffDir) {
  const out = [];
  function recurse(dir, relParts) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const entry of entries) {
      if (entry.name === 'assets') continue;
      if (entry.name === ATLAS_DIRNAME) continue;
      if (entry.name === REMOVED_TXT) continue;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const nextRel = [...relParts, entry.name];
      if (entry.isDirectory()) recurse(full, nextRel);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        out.push({ abs: full, rel: nextRel.join('/') });
      }
    }
  }
  recurse(diffDir, []);
  return out;
}

function readRemovedManifest(diffDir) {
  const file = path.join(diffDir, REMOVED_TXT);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// ---- merge verb ---------------------------------------------------------

function collectSpecsToMerge(flags, projectRoot) {
  if (flags.spec !== undefined) {
    return Array.isArray(flags.spec) ? flags.spec.map(String) : [String(flags.spec)];
  }

  if (flags.all) {
    const plansRoot = path.join(projectRoot, PLANS_REL);
    const seen = new Set();
    const specs = [];

    for (const diffDir of walkArchitectureDiffDirs(plansRoot)) {
      const specDir = path.dirname(diffDir);
      const { rootDir } = specOverlayDir(projectRoot, path.relative(projectRoot, specDir));
      const key = path.relative(projectRoot, rootDir);
      if (!seen.has(key)) {
        seen.add(key);
        specs.push(key);
      }
    }

    return specs.sort();
  }

  return [];
}

async function verbMerge(flags, projectRoot, io) {
  const specs = collectSpecsToMerge(flags, projectRoot);
  if (specs.length === 0) {
    io.stderr.write('No spec overlays to merge. Use --spec <dir> or --all to select specs.\n');
    return 1;
  }

  const base = stateLib.load(baseAtlasDir(projectRoot));
  let merged = JSON.parse(JSON.stringify(base));
  const applied = [];

  for (const spec of specs) {
    const { overlayDir, rootDir } = specOverlayDir(projectRoot, spec);
    if (!hasOverlayState(overlayDir)) {
      io.stdout.write(`Skipping ${spec} (no overlay state found in ${path.relative(projectRoot, overlayDir)})\n`);
      continue;
    }
    const overlay = stateLib.loadOverlay(overlayDir);
    merged = stateLib.mergeOverlay(merged, overlay);
    applied.push({ spec, rootDir, overlayDir });
  }

  if (applied.length === 0) {
    io.stdout.write('No valid spec overlays to merge.\n');
    return 0;
  }

  const diff = stateLib.diffPages(base, merged);

  // Save undo snapshot before mutating base
  ensureBaseAtlasDir(projectRoot);
  stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), JSON.parse(JSON.stringify({ base })));

  // Write merged state to base
  stateLib.save(baseAtlasDir(projectRoot), merged);
  stateLib.appendHistory(baseAtlasDir(projectRoot), {
    action: 'merge',
    args: { specs: applied.map((a) => a.spec) },
    mode: 'base',
  });

  // Render unless --no-render
  if (!flags['no-render']) {
    await runRender({ projectRoot, flags: { ...flags, spec: undefined } });
  }

  // Clean overlays if --clean
  if (flags.clean) {
    for (const { rootDir } of applied) {
      const diffDir = path.join(rootDir, DIFF_DIRNAME);
      if (fs.existsSync(diffDir)) {
        fs.rmSync(diffDir, { recursive: true, force: true });
        io.stdout.write(`Removed ${path.relative(projectRoot, diffDir)}\n`);
      }
    }
  }

  // Summary
  const featParts = [];
  if (diff.addedFeatures.size > 0) featParts.push(`${diff.addedFeatures.size} added`);
  if (diff.modifiedFeatures.size > 0) featParts.push(`${diff.modifiedFeatures.size} modified`);
  if (diff.removedFeatures.size > 0) featParts.push(`${diff.removedFeatures.size} removed`);
  const featSummary = featParts.length > 0 ? featParts.join(', ') : 'no changes';

  const subParts = [];
  if (diff.addedSubmodules.length > 0) subParts.push(`${diff.addedSubmodules.length} added`);
  if (diff.modifiedSubmodules.length > 0) subParts.push(`${diff.modifiedSubmodules.length} modified`);
  if (diff.removedSubmodules.length > 0) subParts.push(`${diff.removedSubmodules.length} removed`);
  const subSummary = subParts.length > 0 ? subParts.join(', ') : 'no changes';

  io.stdout.write(`atlas: merge applied — ${applied.length} spec overlay(s) merged\n`);
  io.stdout.write(`  Features: ${featSummary}\n`);
  io.stdout.write(`  Submodules: ${subSummary}\n`);
  if (diff.macroChanged) io.stdout.write('  Macro page changed\n');

  return 0;
}

function toViewerRel(outDir, projectRoot, projectRelPath) {
  if (!projectRelPath) return null;
  const absolute = path.resolve(projectRoot, projectRelPath);
  const rel = path.relative(outDir, absolute);
  return rel.split(path.sep).join('/');
}

function renderDiffViewer({ changes, projectRoot, outDir }) {
  const pages = changes.map((change) => ({
    kind: change.kind,
    rel: change.rel,
    spec: change.spec,
    beforeSrc: toViewerRel(outDir, projectRoot, change.beforePath),
    afterSrc: toViewerRel(outDir, projectRoot, change.afterPath),
  }));
  const summary = {
    total: pages.length,
    modified: pages.filter((p) => p.kind === 'modified').length,
    added: pages.filter((p) => p.kind === 'added').length,
    removed: pages.filter((p) => p.kind === 'removed').length,
    projectRoot,
  };
  const payload = JSON.stringify({ pages, summary });

  return `<!DOCTYPE html>
<html lang="en" data-atlas="diff-viewer">
<head>
  <meta charset="utf-8">
  <title>Architecture diff — ${renderLib.htmlEscape(path.basename(projectRoot))}</title>
  <style>
    :root { color-scheme: light dark; --bg: #0f172a; --panel: #1e293b; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --added: #4ade80; --removed: #f87171; --modified: #facc15; }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--text); }
    body { display: flex; flex-direction: column; min-height: 100vh; }
    header { padding: 12px 20px; background: var(--panel); border-bottom: 1px solid #334155; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
    header .title { font-size: 14px; color: var(--muted); }
    header .title strong { color: var(--text); }
    header .summary { display: flex; gap: 12px; font-size: 12px; color: var(--muted); }
    header .summary span.count { font-weight: 600; }
    header .summary .modified { color: var(--modified); }
    header .summary .added { color: var(--added); }
    header .summary .removed { color: var(--removed); }
    main { flex: 1; display: flex; flex-direction: column; }
    .meta { padding: 10px 20px; background: var(--bg); border-bottom: 1px solid #334155; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; font-size: 13px; }
    .meta .left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid currentColor; }
    .badge.modified { color: var(--modified); } .badge.added { color: var(--added); } .badge.removed { color: var(--removed); }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); }
    .spec { color: var(--muted); font-size: 12px; }
    .nav { display: flex; align-items: center; gap: 8px; }
    .nav button { background: transparent; color: var(--text); border: 1px solid #475569; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .nav button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .nav button:disabled { opacity: 0.4; cursor: not-allowed; }
    .nav .counter { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 72px; text-align: center; }
    .frames { flex: 1; display: grid; gap: 1px; background: #334155; padding: 1px; min-height: 0; }
    .frames.split { grid-template-columns: 1fr 1fr; }
    .frames.single { grid-template-columns: 1fr; }
    .pane { background: #ffffff; display: flex; flex-direction: column; min-height: 0; }
    .pane h2 { margin: 0; padding: 8px 14px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; background: #f1f5f9; color: #1e293b; border-bottom: 1px solid #cbd5f5; display: flex; align-items: center; gap: 8px; }
    .pane h2 .side-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #cbd5f5; color: #1e293b; }
    .pane h2.before .side-badge { background: #fee2e2; color: #991b1b; }
    .pane h2.after .side-badge { background: #dcfce7; color: #166534; }
    .pane iframe { flex: 1; width: 100%; border: 0; background: #ffffff; }
    .empty { display: flex; align-items: center; justify-content: center; padding: 32px; font-size: 14px; color: var(--muted); }
    footer { padding: 8px 20px; background: var(--panel); border-top: 1px solid #334155; font-size: 12px; color: var(--muted); }
    footer kbd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #0f172a; padding: 1px 6px; border-radius: 4px; border: 1px solid #475569; }
  </style>
</head>
<body>
  <header>
    <div class="title">Apollo Toolkit · <strong>architecture diff</strong> · ${renderLib.htmlEscape(path.basename(projectRoot))}</div>
    <div class="summary">
      <span><span class="count">${summary.total}</span> change<span>${summary.total === 1 ? '' : 's'}</span></span>
      <span class="modified"><span class="count">${summary.modified}</span> modified</span>
      <span class="added"><span class="count">${summary.added}</span> added</span>
      <span class="removed"><span class="count">${summary.removed}</span> removed</span>
    </div>
  </header>
  <main>
    <div class="meta">
      <div class="left">
        <span id="badge" class="badge modified">modified</span>
        <span class="path" id="path">—</span>
        <span class="spec" id="spec">—</span>
      </div>
      <div class="nav">
        <button id="prev" type="button" aria-label="Previous change">← Prev</button>
        <span class="counter" id="counter">0 / 0</span>
        <button id="next" type="button" aria-label="Next change">Next →</button>
      </div>
    </div>
    <div class="frames" id="frames">
      <div class="empty" id="empty">No architecture diffs found under docs/plans/**/architecture_diff/.</div>
    </div>
  </main>
  <footer>
    Navigate with <kbd>←</kbd> / <kbd>→</kbd> or the buttons above. Each page pairs the current atlas (left) with the proposed-after HTML (right).
  </footer>
  <script id="__diff_payload" type="application/json">${payload.replace(/</g, '\\u003c')}</script>
  <script>
    (function () {
      const data = JSON.parse(document.getElementById('__diff_payload').textContent);
      const pages = data.pages || [];
      const framesEl = document.getElementById('frames');
      const emptyEl = document.getElementById('empty');
      const badgeEl = document.getElementById('badge');
      const pathEl = document.getElementById('path');
      const specEl = document.getElementById('spec');
      const counterEl = document.getElementById('counter');
      const prevBtn = document.getElementById('prev');
      const nextBtn = document.getElementById('next');
      if (pages.length === 0) { counterEl.textContent = '0 / 0'; prevBtn.disabled = true; nextBtn.disabled = true; return; }
      let index = 0;
      function render() {
        const page = pages[index];
        badgeEl.className = 'badge ' + page.kind;
        badgeEl.textContent = page.kind;
        pathEl.textContent = page.rel;
        specEl.textContent = page.spec;
        counterEl.textContent = (index + 1) + ' / ' + pages.length;
        prevBtn.disabled = index === 0;
        nextBtn.disabled = index === pages.length - 1;
        framesEl.innerHTML = '';
        if (page.kind === 'modified') {
          framesEl.className = 'frames split';
          framesEl.appendChild(buildPane('Before', page.beforeSrc, 'before'));
          framesEl.appendChild(buildPane('After', page.afterSrc, 'after'));
        } else if (page.kind === 'added') {
          framesEl.className = 'frames single';
          framesEl.appendChild(buildPane('After (new)', page.afterSrc, 'after'));
        } else if (page.kind === 'removed') {
          framesEl.className = 'frames single';
          framesEl.appendChild(buildPane('Before (removed)', page.beforeSrc, 'before'));
        }
      }
      function buildPane(label, src, side) {
        const pane = document.createElement('div');
        pane.className = 'pane';
        const heading = document.createElement('h2');
        heading.className = side;
        const sideBadge = document.createElement('span');
        sideBadge.className = 'side-badge';
        sideBadge.textContent = side;
        heading.appendChild(sideBadge);
        heading.appendChild(document.createTextNode(' ' + label));
        pane.appendChild(heading);
        const frame = document.createElement('iframe');
        frame.src = src;
        frame.loading = 'lazy';
        frame.title = label;
        pane.appendChild(frame);
        return pane;
      }
      prevBtn.addEventListener('click', () => { if (index > 0) { index--; render(); } });
      nextBtn.addEventListener('click', () => { if (index < pages.length - 1) { index++; render(); } });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') prevBtn.click();
        else if (event.key === 'ArrowRight') nextBtn.click();
      });
      emptyEl.remove();
      render();
    })();
  </script>
</body>
</html>
`;
}

async function dispatch(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const args = [...argv];
  let verb = 'open';
  let explicitVerb = false;
  const verbIdx = findFirstPositional(args);
  if (verbIdx >= 0) {
    verb = args[verbIdx];
    explicitVerb = true;
    args.splice(verbIdx, 1);
  }
  let subverb = null;
  const multiVerbs = new Set(['feature', 'submodule', 'function', 'variable', 'dataflow', 'error', 'edge', 'meta', 'actor']);
  if (multiVerbs.has(verb)) {
    const subverbIdx = findFirstPositional(args);
    if (subverbIdx >= 0) {
      subverb = args[subverbIdx];
      args.splice(subverbIdx, 1);
    }
  }
  const { flags } = parseFlags(args);

  if (verb === 'help' || verb === '--help' || verb === '-h' || flags.help) {
    const helpText = explicitVerb && verb !== 'help' && verb !== '--help' && verb !== '-h'
      ? buildArchitectureHelpPage(verb, subverb)
      : buildArchitectureHelpPage();
    io.stdout.write(`${helpText || USAGE}\n`);
    return 0;
  }

  let projectRoot;
  try {
    projectRoot = resolveProjectRoot(flags);
  } catch (e) {
    io.stderr.write(`${e.message}\n\n${buildArchitectureHelpPage()}\n`);
    return 1;
  }

  try {
    switch (verb) {
      case 'open': return await verbOpen(flags, projectRoot, io);
      case 'diff': return await verbDiff(flags, projectRoot, io);
      case 'render':
        await runRender({ projectRoot, flags });
        io.stdout.write(`atlas: rendered\n`);
        return 0;
      case 'validate': return await verbValidate(flags, projectRoot, io);
      case 'status': return await verbStatus(flags, projectRoot, io);
      case 'scan': return await verbScan(flags, projectRoot, io);
      case 'undo': return await verbUndo(flags, projectRoot, io);
      case 'feature': await verbFeature(subverb, flags, projectRoot, io); break;
      case 'submodule': await verbSubmodule(subverb, flags, projectRoot, io); break;
      case 'function': await verbFunction(subverb, flags, projectRoot, io); break;
      case 'variable': await verbVariable(subverb, flags, projectRoot, io); break;
      case 'dataflow': await verbDataflow(subverb, flags, projectRoot, io); break;
      case 'error': await verbError(subverb, flags, projectRoot, io); break;
      case 'edge': await verbEdge(subverb, flags, projectRoot, io); break;
      case 'meta': await verbMeta(subverb, flags, projectRoot, io); break;
      case 'actor': await verbActor(subverb, flags, projectRoot, io); break;
      case 'merge': return await verbMerge(flags, projectRoot, io);
      default:
        io.stderr.write(`Unknown verb: ${verb}\n\n${buildArchitectureHelpPage()}\n`);
        return 1;
    }
    if (!flags['dry-run']) {
      io.stdout.write(`atlas: ${verb}${subverb ? ` ${subverb}` : ''} applied\n`);
    }
    return 0;
  } catch (e) {
    io.stderr.write(`${e.message}\n`);
    return 1;
  }
}

module.exports = {
  USAGE,
  buildArchitectureHelpPage,
  dispatch,
  parseFlags,
  findProjectRoot,
  resolveProjectRoot,
  loadResolvedState,
  baseAtlasDir,
  baseHtmlOutDir,
  specOverlayDir,
  runRender,
  walkArchitectureDiffDirs,
  collectDiffChanges,
  walkAfterStateHtml,
  readRemovedManifest,
  renderDiffViewer,
  toViewerRel,
  hasOverlayState,
  collectSpecsToMerge,
  verbMerge,
};
