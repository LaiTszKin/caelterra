'use strict';

// cli-help.js — help page builders for the atlas CLI command tree.

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
  get USAGE() {
    const value = buildArchitectureHelpPage();
    Object.defineProperty(module.exports, 'USAGE', { value, enumerable: true, writable: false, configurable: false });
    return value;
  },
};
