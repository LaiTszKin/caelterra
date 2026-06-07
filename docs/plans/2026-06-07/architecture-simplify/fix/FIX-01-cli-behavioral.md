# Fix Worker Prompt: FIX-01 — cli.js behavioral fixes

- **Related issue**: FIX-01 — 17 behavioral fixes across relation handling, batch mode, and dispatch ordering

---

## 1. Mission & Rules

### Mission

Fix all 17 behavioral issues in `skills/init-project-html/lib/atlas/cli.js` identified in REPORT.md Round 3. These span relation entity handling (P2-1, P2-2, P2-6, P3-2, P3-8, P3-9), batch mode correctness (P2-3, P2-4, P2-5, P3-4, P3-5, P3-7), and independent fixes (P2-7, P2-10 export, P3-1, P3-3, P3-11).

### Context

All 17 issues are in a single file (`cli.js`) across multiple functions. The fixes are non-conflicting (different line ranges, different functions). Apply them in the order specified below to minimize merge friction.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed
- Preserve existing test semantics — do not weaken, skip, or remove existing tests
- If the fix approach conflicts with the original spec design intent, pause and report to the coordinator
- Do not add new dependencies without reporting to the coordinator first
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — the only file to modify (1656 lines)
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — review findings (for severity and dimension context)

### Root Cause

The 17 issues break into three functional clusters:

**Relation entity (6 issues):** The `processAddEntity` relation case only handles `--data-flow-to`/`--implements`/`--deployed-on`. `--depends-on` is ignored. The change summary output doesn't filter by entity type, so it claims flags were applied when they weren't. The `verbRemove` relation path doesn't forward `--kind` or `--id`, making edge-kind filtering impossible on remove. No duplicate detection exists for relation entities.

**Batch mode (6 issues):** The simple pair batch path doesn't capture `processAddEntity` return values, so skipped entities are misreported as added. It also lacks pre-validation. The interleaved batch path produces no output when all entities are skipped. Edge calls within `processAddEntity` don't forward `skipUndo`. Dry-run mode still says "add applied". Output format differs between interleaved and simple pair modes.

**Standalone (5 issues):** Error message in single-entity mode shows batch syntax. Passthrough flags undocumented. `removeFeature` doesn't clean up `dependsOn` references. `apply`/`template` intercept runs after `resolveProjectRoot`. `MULTI_VERBS` not exported for sync testing.

---

## 3. Tasks

Apply the following changes to `skills/init-project-html/lib/atlas/cli.js` in order.

### Task 1: Move `apply`/`template` intercept before `resolveProjectRoot` (P3-11)

**File**: `cli.js`, lines 1581-1592 — the `dispatch()` function

**Current code (L1581-1592):**
```javascript
  let projectRoot;
  try {
    projectRoot = resolveProjectRoot(flags);
  } catch (e) {
    io.stderr.write(`${e.message}\n\n${buildArchitectureHelpPage()}\n`);
    return 1;
  }

  if (verb === 'apply' || verb === 'template') {
    io.stderr.write(`Error: "${verb}" has been removed. Use "apltk architecture add <feature|module|relation>" instead.\n`);
    return 1;
  }
```

**Change**: Move the `apply`/`template` intercept before `resolveProjectRoot`:

```javascript
  if (verb === 'apply' || verb === 'template') {
    io.stderr.write(`Error: "${verb}" has been removed. Use "apltk architecture add <feature|module|relation>" instead.\n`);
    return 1;
  }

  let projectRoot;
  try {
    projectRoot = resolveProjectRoot(flags);
  } catch (e) {
    io.stderr.write(`${e.message}\n\n${buildArchitectureHelpPage()}\n`);
    return 1;
  }
```

### Task 2: Fix single-entity error message (P3-1)

**File**: `cli.js`, line 953 — inside `verbAdd()`

**Current code (L953):**
```javascript
    throw new Error('Usage: apltk architecture add <feature|module|relation> <name> [entity-type entity-name ...]');
```

**Change**: Replace `[entity-type entity-name ...]` with `[relation-flags...]`:

```javascript
    throw new Error('Usage: apltk architecture add <feature|module|relation> <name> [relation-flags...]');
```

### Task 3: Add `--depends-on` handling for `relation` entity type (P2-1)

**File**: `cli.js`, lines 762-781 — inside `processAddEntity()`, the `relation` case

**Current code (L762-781):**
```javascript
      case 'relation': {
        const dataFlowTo = entityFlags['data-flow-to'];
        const implementsTarget = entityFlags.implements;
        const deployedOn = entityFlags['deployed-on'];
        const to = dataFlowTo || implementsTarget || deployedOn;
        if (!to) throw new Error('Missing required flag --data-flow-to, --implements, or --deployed-on for relation');
        let kind = 'call';
        if (dataFlowTo) kind = 'data-row';
        else if (implementsTarget) kind = 'implements';
        else if (deployedOn) kind = 'deployed-on';
        return verbEdge('add', {
          from: entityName,
          to,
          kind,
          spec: entityFlags.spec,
          'no-render': true,
          project: entityFlags.project,
          'dry-run': entityFlags['dry-run'],
          id: entityFlags.id,
        }, projectRoot, io);
      }
```

**Change**: Add `--depends-on` handling. If `--depends-on` is provided, create a separate dependency edge. The existing data-flow/implements/deployed-on edge is created as before. The `--depends-on` is an additional edge, not an alternative:

```javascript
      case 'relation': {
        const dataFlowTo = entityFlags['data-flow-to'];
        const implementsTarget = entityFlags.implements;
        const deployedOn = entityFlags['deployed-on'];
        const dependsOn = entityFlags['depends-on'];
        const to = dataFlowTo || implementsTarget || deployedOn;
        if (!to && !dependsOn) throw new Error('Missing required flag --data-flow-to, --implements, --deployed-on, or --depends-on for relation');
        let kind = 'call';
        if (dataFlowTo) kind = 'data-row';
        else if (implementsTarget) kind = 'implements';
        else if (deployedOn) kind = 'deployed-on';

        // Create the primary edge (data-flow, implements, or deployed-on)
        let result;
        if (to) {
          result = await verbEdge('add', {
            from: entityName,
            to,
            kind,
            spec: entityFlags.spec,
            'no-render': true,
            project: entityFlags.project,
            'dry-run': entityFlags['dry-run'],
            id: entityFlags.id,
            skipUndo: entityFlags.skipUndo,
          }, projectRoot, io);
        }

        // Create dependency edge if --depends-on specified
        if (dependsOn) {
          const targets = String(dependsOn).split(',').map(s => s.trim()).filter(Boolean);
          for (const target of targets) {
            await verbEdge('add', {
              from: entityName,
              to: target,
              kind: 'dependency',
              spec: entityFlags.spec,
              'no-render': true,
              project: entityFlags.project,
              'dry-run': entityFlags['dry-run'],
              skipUndo: entityFlags.skipUndo,
            }, projectRoot, io);
          }
        }

        return result;
      }
```

### Task 4: Guard change summary flags by entity type (P2-2)

**File**: `cli.js`, lines 960-971 — inside `verbAdd()`, single-entity mode output

**Current code (L960-971):**
```javascript
  if (addResult === 'skipped') {
    io.stderr.write(`atlas: no change — ${type} "${name}" already exists\n`);
  } else {
    const addedFlags = [];
    if (type === 'module' && flags['part-of']) addedFlags.push(`part-of: ${flags['part-of']}`);
    if (flags['depends-on']) addedFlags.push(`depends-on: ${flags['depends-on']}`);
    if (flags['data-flow-to']) addedFlags.push(`data-flow-to: ${flags['data-flow-to']}`);
    if (flags.implements) addedFlags.push(`implements: ${flags.implements}`);
    if (flags['deployed-on']) addedFlags.push(`deployed-on: ${flags['deployed-on']}`);
    const summary = addedFlags.length > 0 ? ` (${addedFlags.join(', ')})` : '';
    io.stdout.write(`atlas: add applied — ${type} "${name}"${summary}\n`);
  }
```

**Change**: Guard each flag by whether the entity type actually consumes it. This prevents showing flags that were silently ignored:

```javascript
  if (addResult === 'skipped') {
    io.stderr.write(`atlas: no change — ${type} "${name}" already exists\n`);
  } else {
    const addedFlags = [];
    const flagConsumed = {
      feature: new Set(['depends-on']),
      module: new Set(['part-of', 'depends-on', 'data-flow-to', 'implements', 'deployed-on']),
      relation: new Set(['data-flow-to', 'implements', 'deployed-on', 'depends-on']),
    };
    const consumed = flagConsumed[type] || new Set();
    if (consumed.has('part-of') && flags['part-of']) addedFlags.push(`part-of: ${flags['part-of']}`);
    if (consumed.has('depends-on') && flags['depends-on']) addedFlags.push(`depends-on: ${flags['depends-on']}`);
    if (consumed.has('data-flow-to') && flags['data-flow-to']) addedFlags.push(`data-flow-to: ${flags['data-flow-to']}`);
    if (consumed.has('implements') && flags.implements) addedFlags.push(`implements: ${flags.implements}`);
    if (consumed.has('deployed-on') && flags['deployed-on']) addedFlags.push(`deployed-on: ${flags['deployed-on']}`);
    const summary = addedFlags.length > 0 ? ` (${addedFlags.join(', ')})` : '';
    io.stdout.write(`atlas: add applied — ${type} "${name}"${summary}\n`);
  }
```

### Task 5: Forward `--kind` and `--id` in unified remove relation path (P2-6, P3-9)

**File**: `cli.js`, lines 1021-1034 — inside `verbRemove()`, the `relation` case

**Current code (L1021-1034):**
```javascript
    case 'relation': {
      if (!flags.to) throw new Error('Missing required flag --to for relation');
      await verbEdge('remove', {
        from: name,
        to: flags.to,
        spec: flags.spec,
        'no-render': flags['no-render'],
        project: flags.project,
        'dry-run': flags['dry-run'],
      }, projectRoot, io);
      if (!flags['dry-run']) {
        io.stdout.write(`atlas: remove applied — relation "${name}"\n`);
      }
      return 0;
    }
```

**Change**: Forward `--kind` and `--id` flags. Also make `--to` required only if not specifying `--id` alone:

```javascript
    case 'relation': {
      if (!flags.to && !flags.id) throw new Error('Missing required flag --to or --id for relation');
      await verbEdge('remove', {
        from: name,
        to: flags.to,
        kind: flags.kind,
        id: flags.id,
        spec: flags.spec,
        'no-render': flags['no-render'],
        project: flags.project,
        'dry-run': flags['dry-run'],
      }, projectRoot, io);
      if (!flags['dry-run']) {
        const detail = flags.kind ? ` (kind: ${flags.kind})` : '';
        io.stdout.write(`atlas: remove applied — relation "${name}"${detail}\n`);
      }
      return 0;
    }
```

### Task 6: Add available edge list to relation remove error (P3-8)

**File**: `cli.js`, lines 610-614 — inside `verbEdge()`, remove cross-feature edge error

**Current code (L610-614):**
```javascript
      if ((state.edges ? state.edges.length : 0) >= before) {
        const fromStr = from.submodule ? `${from.feature}/${from.submodule}` : from.feature;
        const toStr = to.submodule ? `${to.feature}/${to.submodule}` : to.feature;
        throw new Error(`Edge "${fromStr}" -> "${toStr}" not found`);
      }
```

**Change**: Include list of existing edges in the error message:

```javascript
      if ((state.edges ? state.edges.length : 0) >= before) {
        const fromStr = from.submodule ? `${from.feature}/${from.submodule}` : from.feature;
        const toStr = to.submodule ? `${to.feature}/${to.submodule}` : to.feature;
        const existing = (state.edges || []).map(e => {
          const ef = e.from && (e.from.submodule ? `${e.from.feature}/${e.from.submodule}` : e.from.feature);
          const et = e.to && (e.to.submodule ? `${e.to.feature}/${e.to.submodule}` : e.to.feature);
          return `"${ef}" -> "${et}"${e.kind ? ` (${e.kind})` : ''}`;
        }).join(', ') || '(none)';
        throw new Error(`Edge "${fromStr}" -> "${toStr}" not found. Available edges: ${existing}`);
      }
```

Also update the intra-feature edge error at L600-602:

**Current code (L600-602):**
```javascript
        if (feature.edges.length >= before) {
          throw new Error(`Edge "${from.feature}/${from.submodule}" -> "${to.feature}/${to.submodule}" not found`);
        }
```

**Change**:
```javascript
        if (feature.edges.length >= before) {
          const existing = (feature.edges || []).map(e => {
            const ef = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
            const et = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
            return `"${ef}" -> "${et}"${e.kind ? ` (${e.kind})` : ''}`;
          }).join(', ') || '(none)';
          throw new Error(`Edge "${from.feature}/${from.submodule}" -> "${to.feature}/${to.submodule}" not found. Available edges: ${existing}`);
        }
```

### Task 7: Add duplicate detection for relation entity type (P3-2)

**File**: `cli.js`, inside `processAddEntity()`, the `relation` case — after the changes from Task 3

Add a check before creating the edge. If an identical edge (same from/to/kind) already exists, return 'skipped' instead of calling verbEdge. This mirrors the feature/module duplicate check pattern.

After the `const dependsOn = ...` line and before creating edges, add:

```javascript
        // Check for duplicate edge before mutation
        if (to) {
          const { base, merged } = loadResolvedState(projectRoot, entityFlags);
          const currentState = entityFlags.spec ? merged : base;
          const hasExistingEdge = (currentState.edges || []).some(
            e => e.from && e.to &&
              ((typeof e.from === 'object' && e.from.feature === fromEndpoint.feature && (e.from.submodule || null) === (fromEndpoint.submodule || null)) ||
               (typeof e.from === 'string' && e.from === entityName)) &&
              ((typeof e.to === 'object' && e.to.feature === toEndpoint.feature && (e.to.submodule || null) === (toEndpoint.submodule || null)) ||
               (typeof e.to === 'string' && e.to === toEndpoint)) &&
              (e.kind || 'call') === kind
          );
          if (hasExistingEdge) {
            return 'skipped';
          }
        }
```

Where `fromEndpoint` and `toEndpoint` are the parsed endpoint objects. You'll need to require parseEndpoint or compute them inline.

**Simpler approach**: Instead of the complex edge comparison, add a pre-check using `parseEndpoint`:

At the top of the relation case, parse the endpoints:
```javascript
        const fromEndpoint = parseEndpoint(entityName);
        const toEndpoint = to ? parseEndpoint(to) : null;
        const dependsOnEndpoint = dependsOn ? parseEndpoint(dependsOn) : null;
```

Then use `endpointEquals` (which already exists at L621-624) to check for duplicates:
```javascript
        if (to) {
          const { base, merged } = loadResolvedState(projectRoot, entityFlags);
          const currentState = entityFlags.spec ? merged : base;
          const edges = currentState.edges || [];
          const hasExistingEdge = edges.some(e =>
            endpointEquals(e.from, fromEndpoint) && endpointEquals(e.to, toEndpoint) && (e.kind || 'call') === kind
          );
          if (hasExistingEdge) {
            return 'skipped';
          }
        }
```

### Task 8: Fix simple pair batch mode — capture skipped return, add pre-validation (P2-3, P2-4)

**File**: `cli.js`, lines 914-945 — inside `verbAdd()`, simple pair batch path

**Current code (L914-945):**
```javascript
    // Batch mode without interleaved flags — simple sequential pairs
    let preBatchState, preBatchOverlayState;
    if (flags.spec) {
      const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
      preBatchOverlayState = JSON.parse(JSON.stringify(stateLib.loadOverlay(overlayDir)));
    } else {
      preBatchState = stateLib.load(baseAtlasDir(projectRoot));
    }
    try {
      for (let i = 0; i < args.length; i += 2) {
        const entityType = args[i];
        const entityName = args[i + 1];
        if (!entityName) throw new Error(`Missing name for entity type: ${entityType}`);
        await processAddEntity(entityType, entityName, {...flags, skipUndo: true});
      }
    } catch (e) {
      if (flags.spec) {
        const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
        stateLib.saveOverlay(overlayDir, preBatchOverlayState);
      } else {
        stateLib.save(baseAtlasDir(projectRoot), preBatchState);
      }
      throw e;
    }
    if (!flags['dry-run'] && !flags['no-render']) {
      await runRender({ projectRoot, flags });
    }
    io.stdout.write(`atlas: add applied — ${args.length / 2} entities\n`);
    for (let i = 0; i < args.length; i += 2) {
      io.stdout.write(`  ${args[i]}: "${args[i + 1]}"\n`);
    }
    return 0;
```

**Change**: Add pre-validation phase and capture skipped return values. Model the output after the interleaved batch mode:

```javascript
    // Batch mode without interleaved flags — simple sequential pairs
    let preBatchState, preBatchOverlayState;
    if (flags.spec) {
      const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
      preBatchOverlayState = JSON.parse(JSON.stringify(stateLib.loadOverlay(overlayDir)));
    } else {
      preBatchState = stateLib.load(baseAtlasDir(projectRoot));
    }

    // Pre-validate all entities before processing
    const simpleEntities = [];
    for (let i = 0; i < args.length; i += 2) {
      const entityType = args[i];
      const entityName = args[i + 1];
      if (!entityName) throw new Error(`Missing name for entity type: ${entityType}`);
      simpleEntities.push({ type: entityType, name: entityName, flags: { ...flags, skipUndo: true } });
    }
    let preError;
    for (const entity of simpleEntities) {
      try {
        validateEntity(entity);
      } catch (e) {
        preError = e;
        break;
      }
    }
    if (preError) throw preError;

    let skipped = 0;
    try {
      for (const entity of simpleEntities) {
        const result = await processAddEntity(entity.type, entity.name, entity.flags);
        if (result === 'skipped') skipped++;
      }
    } catch (e) {
      if (flags.spec) {
        const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
        stateLib.saveOverlay(overlayDir, preBatchOverlayState);
      } else {
        stateLib.save(baseAtlasDir(projectRoot), preBatchState);
      }
      throw e;
    }
    if (!flags['dry-run'] && !flags['no-render']) {
      await runRender({ projectRoot, flags });
    }
    const applied = simpleEntities.length - skipped;
    if (skipped > 0) {
      io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)\n`);
    } else {
      io.stdout.write(`atlas: add applied — ${applied} entities\n`);
    }
    for (const entity of simpleEntities) {
      io.stdout.write(`  ${entity.type}: "${entity.name}"\n`);
    }
    return 0;
```

### Task 9: Fix output when all entities skipped in interleaved batch mode (P2-5)

**File**: `cli.js`, lines 900-910 — inside `verbAdd()`, interleaved batch output

**Current code (L900-910):**
```javascript
      const applied = entities.length - skipped;
      if (skipped > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)\n`);
      } else if (applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entities\n`);
      }
      if (entities.length > 0) {
        for (const e of entities) {
          io.stdout.write(`  ${e.type}: "${e.name}"\n`);
        }
      }
```

**Change**: Add fallback for the case where `applied === 0 && skipped === 0` (shouldn't normally happen) and the `skipped === entities.length` case:

```javascript
      const applied = entities.length - skipped;
      if (skipped > 0 && applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)\n`);
      } else if (applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entities\n`);
      } else if (skipped > 0) {
        io.stdout.write(`atlas: add — all ${skipped} entities already exist, skipped\n`);
      }
      if (entities.length > 0) {
        for (const e of entities) {
          io.stdout.write(`  ${e.type}: "${e.name}"\n`);
        }
      }
```

### Task 10: Fix batch mode dry-run output (P3-5)

**File**: `cli.js` — two locations in `verbAdd()`

**Change in interleaved batch mode (L897-910)**: Wrap the output section to note dry-run mode:

After the render check (L897-898) and before the output, add:

```javascript
      const dryRunPrefix = flags['dry-run'] ? ' (dry-run, no changes written)' : '';
```

Then update the output lines to include the prefix:
```javascript
      if (skipped > 0 && applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)${dryRunPrefix}\n`);
      } else if (applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entities${dryRunPrefix}\n`);
      } else if (skipped > 0) {
        io.stdout.write(`atlas: add — all ${skipped} entities already exist, skipped${dryRunPrefix}\n`);
      }
```

**Change in simple pair batch mode (L938-944)**: Same treatment:

```javascript
    const dryRunPrefix = flags['dry-run'] ? ' (dry-run, no changes written)' : '';
    if (skipped > 0) {
      io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)${dryRunPrefix}\n`);
    } else {
      io.stdout.write(`atlas: add applied — ${applied} entities${dryRunPrefix}\n`);
    }
```

### Task 11: Export `MULTI_VERBS` for sync test (P2-10)

**File**: `cli.js`, line 1562 (move to module scope) and line 1637-1655 (add to exports)

**Step 1**: Move the `multiVerbs` Set definition from inside `dispatch()` to module scope. Find line 1562 and replace:

Current (L1562, inside dispatch function):
```javascript
  const multiVerbs = new Set(['feature', 'submodule', 'function', 'variable', 'dataflow', 'error', 'edge', 'meta', 'actor']);
```

Change: Remove from inside `dispatch()` and add at module scope (e.g., after the BOOLEAN_FLAGS definition around L50):

```javascript
const BOOLEAN_FLAGS = new Set(['no-render', 'no-open', 'help', 'dry-run', 'json']);

const MULTI_VERBS = new Set(['feature', 'submodule', 'function', 'variable', 'dataflow', 'error', 'edge', 'meta', 'actor']);
```

Then inside `dispatch()`, change `multiVerbs` to `MULTI_VERBS`:
```javascript
  if (MULTI_VERBS.has(verb)) {
```

**Step 2**: Add `MULTI_VERBS` to module.exports (around L1655):

```javascript
module.exports = {
  dispatch,
  parseFlags,
  ...
  verbMerge,
  MULTI_VERBS,
};
```

### Task 12: Forward `skipUndo` to edge creation calls in `processAddEntity` (P3-4)

**File**: `cli.js`, lines 677-685 (feature edge), 707-715 (module implements edge), 718-726 (module deployed-on edge), 734-742 (module depends-on edge), 749-757 (module data-flow edge), and the relation case (already handled in Task 3).

For each `verbEdge('add', ...)` call within `processAddEntity`, add `skipUndo: entityFlags.skipUndo` to the flags object.

**Feature edge (L677-685)**: Add `skipUndo: entityFlags.skipUndo,` after `'dry-run': entityFlags['dry-run'],`

**Module edges (L707-715, L718-726, L734-742, L749-757)**: Add `skipUndo: entityFlags.skipUndo,` to each after the `'dry-run'` line.

**Relation case edges** (from Task 3): Already includes `skipUndo: entityFlags.skipUndo` — verify it's there.

### Task 13: Clean up `dependsOn` references when removing a feature (P2-7)

**File**: `cli.js`, function `removeFeature()` (L297-304)

**Current code (L297-304):**
```javascript
function removeFeature(state, slug) {
  if (!state.features) return false;
  const before = state.features.length;
  state.features = state.features.filter((f) => f.slug !== slug);
  // also drop cross-feature edges that reference this slug
  state.edges = (state.edges || []).filter((e) => !endpointReferences(e.from, slug) && !endpointReferences(e.to, slug));
  return state.features.length < before;
}
```

**Change**: After removing the feature and edges, also clean up `dependsOn` references on remaining features:

```javascript
function removeFeature(state, slug) {
  if (!state.features) return false;
  const before = state.features.length;
  state.features = state.features.filter((f) => f.slug !== slug);
  // also drop cross-feature edges that reference this slug
  state.edges = (state.edges || []).filter((e) => !endpointReferences(e.from, slug) && !endpointReferences(e.to, slug));
  // also clean up dependsOn references on remaining features
  for (const feature of state.features) {
    if (feature.dependsOn) {
      feature.dependsOn = feature.dependsOn.filter((d) => d !== slug);
    }
  }
  return state.features.length < before;
}
```

### Task 14: Add passthrough flags to help text for add command (P3-3)

**File**: This is in `cli-help.js`, not cli.js. Locate the `buildArchitectureHelpPage()` `add` case (around L1002-1040).

**Change**: In the add help page, add `--evidence <level[:source]>` and `--kind <kind>` to the optional flags list. The current flags list (L1019-1028) includes relation flags but not `--evidence` or `--kind`.

After the existing optional flags, add:
```javascript
        '`--kind <kind>` — for modules: the submodule kind (service, api, ui, worker, external).',
        '`--evidence <level[:source]>` — tags components with observed/inferred/assumed quality levels.',
```

**Important**: This is in `cli-help.js`, NOT cli.js. The FIX-01 worker is allowed to modify cli-help.js for this single change (no other worker touches it).

### Task 15: Fix feature `--depends-on` in `processAddEntity` to split comma-separated values (part of P2-1 scope)

**File**: `cli.js`, lines 675-686 — feature case in `processAddEntity`

**Current code (L674-686):**
```javascript
          // Create dependency edge if --depends-on specified
          const featDependsOn = entityFlags['depends-on'];
          if (featDependsOn) {
            await verbEdge('add', {
              from: entityName,
              to: featDependsOn,
              kind: 'dependency',
              spec: entityFlags.spec,
              'no-render': true,
              project: entityFlags.project,
              'dry-run': entityFlags['dry-run'],
            }, projectRoot, io);
          }
```

**Change**: Split comma-separated values, matching the module case pattern (L730-743):

```javascript
          // Create dependency edges if --depends-on specified (supports comma-separated)
          const featDependsOn = entityFlags['depends-on'];
          if (featDependsOn) {
            const targets = String(featDependsOn).split(',').map(s => s.trim()).filter(Boolean);
            for (const target of targets) {
              await verbEdge('add', {
                from: entityName,
                to: target,
                kind: 'dependency',
                spec: entityFlags.spec,
                'no-render': true,
                project: entityFlags.project,
                'dry-run': entityFlags['dry-run'],
                skipUndo: entityFlags.skipUndo,
              }, projectRoot, io);
            }
          }
```

Note: This also adds `skipUndo: entityFlags.skipUndo` (Task 12).

### Output

When done, report back to the coordinator:
- **Files modified**: list of files
- **Change summary**: each task completed with brief description
- **Test results**: `node --test test/atlas-cli.test.js` pass/fail
- **Risks or concerns**: or "None"

---

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js`
   - Expected: All tests pass (existing + any new inline tests you added)
2. Run: `node --test packages/tools/architecture/index.test.ts`
   - Expected: All tests pass
3. Run: `node --test test/tools/architecture-error-types.test.js`
   - Expected: All tests pass
4. Run: `node --test test/architecture-script.test.js`
   - Expected: All tests pass

---

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — primary file (17 behavioral fixes)
- `skills/init-project-html/lib/atlas/cli-help.js` — add passthrough flags to add command help (Task 14 only)

### Forbidden Files

- `test/atlas-cli.test.js` — owned by REGTEST-01 worker (do not modify)
- `packages/tools/architecture/*` — not part of this fix scope
- `skills/*/SKILL.md` — owned by FIX-02 worker
- `docs/plans/*` — documentation files owned by FIX-02 worker

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Review findings (source of all issues)
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
