# Fix Worker Prompt: FIX-01-cli-r4

- **Related issue**: FIX-01 — All cli.js + cli-help.js behavioral fixes (18 issues)

---

## 1. Mission & Rules

### Mission

Fix 18 issues in `cli.js` and `cli-help.js` spanning duplicate entity edge creation, missing existence validation, output routing, batch consistency, error messages, and verb dispatch. These fixes resolve 3 P1, 7 P2, and 8 P3 findings from Round 4.

### Context

All 18 issues affect `skills/init-project-html/lib/atlas/cli.js`. One issue (P2-7) also requires a supporting change to `cli-help.js`. The fixes span: `processAddEntity`, `verbAdd` (single and batch), `verbRemove`, `verbDiff`, `verbOpen`, `performMutation`, `removeFeature`, `removeSubmodule`, `verbEdge`, and flag parsing logic.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed
- Preserve existing test semantics — do not weaken, skip, or remove existing tests
- If the fix approach conflicts with the original spec design intent, pause and report to the coordinator
- Do not add new dependencies without reporting to the coordinator first
- Workers are leaf nodes — do not spawn sub-workers
- After completing all 18 fixes, run the full test suite and report results

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — Main file for all 17 behavioral fixes
- `skills/init-project-html/lib/atlas/cli-help.js` — P2-7: hiddenVerbs synchronization
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 4 review report (all findings)
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
- `test/atlas-cli.test.js` — Existing test patterns (do not modify in this worker)

### Root Cause Summary

All 18 issues are in the CLI dispatch layer (`cli.js`). The three root cause categories are:

1. **Missing guards**: `processAddEntity` doesn't check `'skipped'` returns before creating edges (P1-1). `verbDiff` doesn't read `--spec` flag (P1-5). No validation for `--spec` directory existence (P1-3) or `--depends-on` target existence (P1-2).
2. **Incorrect output routing**: Skipped entity message goes to stderr (P2-1). History entries survive rollback (P2-2).
3. **Flawed validation/predicates**: Intra-feature edge duplicates not detected (P2-3). `--depends-on` flag accepts boolean value (P2-4). `verbRemove` relation allows `--id` without `--to` (P2-5). Hidden verbs duplicated between files (P2-7). `open` strips `--spec` (P2-8).

---

## 3. Tasks

### P1-1: Duplicate entity + relation flags create edges despite skip

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `processAddEntity`, `case 'feature'` (L682-712) and `case 'module'` (L713-788)

1. In the `case 'feature'` block (L682), change from:
   ```javascript
   const featResult = await verbFeature('add', { ... }, projectRoot, io);
   // Create dependency edges if --depends-on specified
   const featDependsOn = entityFlags['depends-on'];
   if (featDependsOn) {
     ...
   }
   return featResult;
   ```
   To:
   ```javascript
   const featResult = await verbFeature('add', { ... }, projectRoot, io);
   if (featResult === 'skipped') return 'skipped';
   // Create dependency edges if --depends-on specified
   const featDependsOn = entityFlags['depends-on'];
   if (featDependsOn) {
     ...
   }
   return featResult;
   ```

2. In the `case 'module'` block, add a similar early return after the `verbSubmodule` call (L715):
   ```javascript
   const result = await verbSubmodule('add', { ... }, projectRoot, io);
   if (result === 'skipped') return 'skipped';
   ```
   Place this immediately after the `verbSubmodule` call and before the edge creation blocks for `--implements`, `--deployed-on`, `--depends-on`, and `--data-flow-to`.

3. For the `case 'relation'` block (L789-850): The duplicate check at L802 is gated by `if (to)`. When only `--depends-on` is provided without `--data-flow-to`/`--implements`/`--deployed-on`, `to` is undefined and no duplicate check runs. Add a duplicate check for the dependency-only case:
   - After the existing `if (to)` duplicate check block (L802-813), add:
   ```javascript
   // Check for duplicate dependency-only relation
   if (!to && dependsOn) {
     const { base, merged } = loadResolvedState(projectRoot, entityFlags);
     const currentState = entityFlags.spec ? merged : base;
     const edges = currentState.edges || [];
     const fromEndpoint = parseEndpoint(entityName);
     const toEndpoint = parseEndpoint(String(dependsOn).split(',')[0].trim());
     const hasExistingDep = edges.some(e =>
       endpointEquals(e.from, fromEndpoint) && endpointEquals(e.to, toEndpoint) && e.kind === 'dependency'
     );
     if (hasExistingDep) return 'skipped';
   }
   ```

### P1-2: No existence validation for --depends-on targets

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `processAddEntity`

Before creating `--depends-on` edges in any entity type case, validate that each target entity exists:

1. **For feature `--depends-on`** (after L694): Add target existence validation:
   ```javascript
   const featDependsOn = entityFlags['depends-on'];
   if (featDependsOn) {
     const targets = String(featDependsOn).split(',').map(s => s.trim()).filter(Boolean);
     const { base, merged } = loadResolvedState(projectRoot, entityFlags);
     const currentState = entityFlags.spec ? merged : base;
     const availableFeatures = (currentState.features || []).map(f => f.slug);
     for (const target of targets) {
       if (!availableFeatures.includes(target)) {
         throw new Error(`Dependency target "${target}" not found. Available features: ${availableFeatures.join(', ') || '(none)'}`);
       }
     }
   }
   ```
   Place this after the `if (featResult === 'skipped') return 'skipped'` line you added in P1-1.

2. **For module `--depends-on`** (after L755): Same pattern, but also check for feature/submodule endpoints (`feature/submodule` format):
   - For plain feature targets: check features list
   - For `feature/submodule` targets: check that the feature exists and the submodule exists within it

3. **For relation `--depends-on`** (after L833): Same as feature — validate dependency targets exist before creating edges.

### P1-3: No validation for --spec non-existent directory

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `verbAdd`

In `verbAdd`, before any processing path (single-entity or batch), add a check for `--spec` directory existence:

```javascript
// In verbAdd, after the isBatchMode check (L677) and before any entity processing:
if (flags.spec) {
  const specPath = path.isAbsolute(String(flags.spec))
    ? String(flags.spec)
    : path.resolve(projectRoot, String(flags.spec));
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec directory not found: ${flags.spec}`);
  }
}
```

Note: `projectRoot` is already resolved by `resolveProjectRoot(flags)` before `verbAdd` is called. Verify this by checking the dispatch flow in `dispatch()`.

### P1-5: diff ignores --spec flag

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `verbDiff` (L1301-1314) and `collectDiffChanges` (L1316-1335)

1. Modify `verbDiff` to pass `flags` to `collectDiffChanges`:
   ```javascript
   async function verbDiff(flags, projectRoot, io) {
     const outDir = flags.out ? path.resolve(String(flags.out)) : path.join(projectRoot, DEFAULT_DIFF_OUT_REL);
     fs.mkdirSync(outDir, { recursive: true });
     const changes = await collectDiffChanges({ projectRoot, outDir, flags });
     // ... rest unchanged
   }
   ```

2. Modify `collectDiffChanges` to accept `flags` and filter by `--spec` when provided:
   ```javascript
   async function collectDiffChanges({ projectRoot, outDir, flags = {} }) {
     if (flags.spec) {
       // Single spec mode: only collect changes for the specified spec
       const specPath = path.isAbsolute(String(flags.spec)) ? String(flags.spec) : path.resolve(projectRoot, String(flags.spec));
       const overlayDir = path.join(specPath, DIFF_DIRNAME, ATLAS_DIRNAME);
       if (hasOverlayState(overlayDir)) {
         return collectSingleSpecChanges({ projectRoot, specDir: specPath, specLabel: String(flags.spec) });
       }
       // Fallback to HTML manifest
       return collectHtmlManifestChanges({ projectRoot, diffDir: path.join(specPath, DIFF_DIRNAME), specLabel: String(flags.spec) });
     }
     // Existing behavior: walk all plans directories
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
     changes.sort((a, b) => { ... });
     return changes;
   }
   ```

3. Update the dispatch call at L1325 (inside verbDiff) — it currently calls `collectDiffChanges({ projectRoot, outDir })`, change to `collectDiffChanges({ projectRoot, outDir, flags })`.

### P2-1: Non-error 'skipped' message to stderr

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Line**: L1057

Change `io.stderr.write` to `io.stdout.write`:

```javascript
// Before:
io.stderr.write(`atlas: no change — ${type} "${name}" already exists\n`);
// After:
io.stdout.write(`atlas: no change — ${type} "${name}" already exists\n`);
```

### P2-2: History entries not cleaned up on batch rollback

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `performMutation` (L222-267)

Gate `appendHistory` with `skipUndo`, matching the pattern used for `writeUndoSnapshot`:

In `performMutation`, at L254 (spec mode):
```javascript
// Before:
stateLib.appendHistory(overlayDir, { action, args, mode: 'spec' });
// After:
if (!flags.skipUndo) stateLib.appendHistory(overlayDir, { action, args, mode: 'spec' });
```

At L261 (base mode):
```javascript
// Before:
stateLib.appendHistory(baseAtlasDir(projectRoot), { action, args, mode: 'base' });
// After:
if (!flags.skipUndo) stateLib.appendHistory(baseAtlasDir(projectRoot), { action, args, mode: 'base' });
```

### P2-3: Intra-feature duplicate edge detection missing

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `processAddEntity`, relation duplicate check (L802-813)

Extend the duplicate edge check to also scan intra-feature edges:

```javascript
// Replace the existing duplicate check (L802-813) with:
const { base, merged } = loadResolvedState(projectRoot, entityFlags);
const currentState = entityFlags.spec ? merged : base;

// Check cross-feature edges (state.edges)
const edges = currentState.edges || [];
const hasExistingEdge = edges.some(e =>
  endpointEquals(e.from, fromEndpoint) && endpointEquals(e.to, toEndpoint) && (e.kind || 'call') === kind
);

// Check intra-feature edges (feature.edges) if both endpoints share a feature
let hasExistingIntraEdge = false;
if (fromEndpoint && toEndpoint && isIntraFeatureEdge(fromEndpoint, toEndpoint)) {
  const feature = findFeature(currentState, fromEndpoint.feature);
  if (feature) {
    const intraEdges = feature.edges || [];
    hasExistingIntraEdge = intraEdges.some(e => {
      const eFrom = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
      const eTo = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
      return eFrom === fromEndpoint.submodule && eTo === toEndpoint.submodule && (e.kind || 'call') === kind;
    });
  }
}

if (hasExistingEdge || hasExistingIntraEdge) {
  return 'skipped';
}
```

### P2-4: --depends-on flag accepts boolean value

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: Interleaved batch flag parser (L884-891)

After the flag parsing loop for each entity in interleaved batch mode, add validation that `--depends-on` (and other value-required flags) have a non-boolean value:

In the interleaved batch entity parsing (around L903, after copying global flags), add:
```javascript
// Validate that value-required flags have actual values
if (entityFlags['depends-on'] === true) {
  throw new Error(`--depends-on requires a value (e.g., --depends-on feature-name)`);
}
if (entityFlags['part-of'] === true) {
  throw new Error(`--part-of requires a value (e.g., --part-of feature-name)`);
}
```

### P2-5: verbRemove relation --id validation misleading

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Line**: L1124

Change the validation from:
```javascript
if (!flags.to && !flags.id) throw new Error('Missing required flag --to or --id for relation');
```
To:
```javascript
if (!flags.to) throw new Error('Missing required flag --to for relation (--id is optional for precision targeting)');
```

### P2-6: Error messages list ALL names instead of similar matches

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Functions**: `removeFeature` (L377-384), `removeSubmodule` (L415-426)

Add a helper function and update error messages:

1. Add this helper function near the other helpers (around L342):
```javascript
function sortBySimilarity(input, names) {
  if (!names || names.length === 0) return [];
  const lowerInput = input.toLowerCase();
  const scored = names.map(name => {
    const lower = name.toLowerCase();
    let score = 0;
    // Exact match (shouldn't happen in practice since we're listing alternatives)
    if (lower === lowerInput) score += 100;
    // Common prefix length
    for (let i = 0; i < Math.min(lower.length, lowerInput.length); i++) {
      if (lower[i] === lowerInput[i]) score += 2;
      else break;
    }
    // Substring match
    if (lower.includes(lowerInput)) score += 10;
    if (lowerInput.includes(lower)) score += 5;
    // Character overlap (bag of letters)
    const inputChars = new Set(lowerInput);
    const matchChars = [...lower].filter(c => inputChars.has(c)).length;
    score += matchChars;
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5).map(s => s.name);
  const remaining = scored.length - top.length;
  if (remaining > 0) top.push(`and ${remaining} more`);
  return top;
}
```

2. In `removeFeature` (L380-382), change:
```javascript
const available = (state.features || []).map(f => f.slug).join(', ');
throw new Error(`Feature "${slug}" not found. Available features: ${available || '(none)'}`);
```
To:
```javascript
const allFeatures = (state.features || []).map(f => f.slug);
const similar = sortBySimilarity(slug, allFeatures);
throw new Error(`Feature "${slug}" not found. Available features: ${similar.join(', ') || '(none)'}`);
```

3. In `removeSubmodule` (L421-424), apply similar change:
```javascript
const allSubs = (feature.submodules || []).map(s => s.slug);
const similar = sortBySimilarity(slug, allSubs);
throw new Error(`Submodule "${slug}" not found in feature "${featureSlug}". Available submodules: ${similar.join(', ') || '(none)'}`);
```

4. In `verbEdge('remove')`, update the edge-not-found error messages (L608-614 and L624-633) to use similarity sorting for the listed edges.

### P2-7: hiddenVerbs and MULTI_VERBS duplication

**Files**: `skills/init-project-html/lib/atlas/cli.js` and `skills/init-project-html/lib/atlas/cli-help.js`

1. In `cli-help.js`, add an export for `hiddenVerbs` at module scope:
   - At the top of the file (after the imports), add:
   ```javascript
   const hiddenVerbs = new Set(['feature', 'submodule', 'function', 'variable', 'dataflow', 'error', 'edge', 'meta', 'actor']);
   ```
   - In `buildArchitectureHelpPage` (L791), change from `const hiddenVerbs = new Set([...])` to just using the module-scoped `hiddenVerbs`.
   - In `module.exports`, add `hiddenVerbs`.

2. Back in `cli-help.js`, update the `buildArchitectureHelpPage` function to use the module-scoped constant instead of re-creating it each call.

Now the test can import `hiddenVerbs` from `cli-help.js` and compare with `MULTI_VERBS` from `cli.js`.

### P2-8: verbOpen strips --spec flag

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `verbOpen` (L1287-1299)

Modify `verbOpen` to respect the `--spec` flag:

```javascript
async function verbOpen(flags, projectRoot, io) {
  if (flags.spec) {
    const { htmlOutDir } = specOverlayDir(projectRoot, flags.spec);
    // Render spec overlay if needed
    const overlayHtml = path.join(htmlOutDir, 'index.html');
    if (!fs.existsSync(overlayHtml)) {
      await runRender({ projectRoot, flags });
    }
    if (!fs.existsSync(overlayHtml)) {
      io.stderr.write(`Spec overlay not found after render: ${overlayHtml}\n`);
      return 1;
    }
    io.stdout.write(`${overlayHtml}\n`);
    if (!flags['no-open']) openInBrowser(overlayHtml);
    return 0;
  }
  // Existing base atlas logic (L1288-1299 unchanged)
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
```

### P3-1: Render triggered unconditionally after skipped entity

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `verbAdd`, single-entity mode (L1052-1055)

Guard `runRender` behind the skipped check:
```javascript
const addResult = await processAddEntity(type, name, flags);
if (addResult !== 'skipped' && !flags['dry-run'] && !flags['no-render']) {
  await runRender({ projectRoot, flags });
}
```

### P3-2: No skipUndo in single-entity mode

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `processAddEntity`, edge creation calls

In `processAddEntity`, for each `verbEdge` call, pass `skipUndo: true` so that the feature/module's `performMutation` call is the only undo snapshot written:

1. Feature `--depends-on` edge (L698-708): Add `skipUndo: entityFlags.skipUndo || true` to the edge flags
2. Module `--implements` edge (L729-740): Same
3. Module `--deployed-on` edge (L741-752): Same
4. Module `--depends-on` edges (L755-769): Same
5. Module `--data-flow-to` edge (L773-785): Same
6. Relation primary edge (L819-829): Already has `skipUndo: entityFlags.skipUndo`
7. Relation `--depends-on` edges (L833-846): Add `skipUndo: entityFlags.skipUndo || true`

For the entity-level calls (verbFeature, verbSubmodule, verbEdge for relation), the skipUndo from entityFlags is already being passed. The fix is to ensure edge calls within processAddEntity also get skipUndo when the caller didn't set it.

The simplest approach: at the start of processAddEntity, if `entityFlags.skipUndo` is not set, add it:
```javascript
// At the top of processAddEntity, after the switch:
// Ensure edges don't create independent undo snapshots from the entity operation
// (the entity's performMutation call writes the undo snapshot)
```

Actually, looking at this more carefully—in single-entity mode, `flags.skipUndo` is not set (undefined). So `entityFlags.skipUndo` is also undefined. The edge calls (like `skipUndo: entityFlags.skipUndo`) would also be undefined, which means each edge WOULD write an undo snapshot.

Fix: Set `skipUndo: true` on all edge creation calls AND set it on the entity call. Then, in the single-entity path (verbAdd), save pre-state and write one combined undo snapshot before rendering.

But that's complex. Simpler fix: just set `skipUndo: true` on edge calls and let the entity's performMutation write the undo. Since performMutation writes undo with `!flags.skipUndo`, if entityFlags.skipUndo is not set, the entity mutation writes one undo snapshot. The edges (with skipUndo=true) don't write additional ones.

In `processAddEntity`, for each verbEdge call, change to always set skipUndo:
```javascript
await verbEdge('add', {
  ...
  skipUndo: true, // edges don't need individual undo; the entity mutation covers it
}, projectRoot, io);
```

For the entity calls (verbFeature, verbSubmodule, verbEdge for relation), pass `skipUndo: entityFlags.skipUndo` as before.

### P3-3: Entity-level --no-render ignored in batch mode

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `verbAdd`, batch mode render checks (L965, L1028)

After the batch processing loop, check if any entity had `--no-render` set:

In interleaved batch mode (around L965), change the render check:
```javascript
// Determine if any entity requested --no-render
const anyEntityNoRender = entities.some(e => e.flags['no-render']);
if (!flags['dry-run'] && !flags['no-render'] && !anyEntityNoRender) {
  await runRender({ projectRoot, flags });
}
```

In simple pair batch mode (around L1028), add similar logic:
```javascript
const anyEntityNoRender = simpleEntities.some(e => e.flags['no-render']);
if (!flags['dry-run'] && !flags['no-render'] && !anyEntityNoRender) {
  await runRender({ projectRoot, flags });
}
```

### P3-4: Batch mode detection heuristic fragile

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Line**: L858

No functional change. Add a clarifying comment explaining the detection logic:
```javascript
// Batch mode detection: if any arg starts with '--', we have interleaved flags
// and use the interleaved parser. Otherwise, all args are type/name pairs.
// This heuristic works because entity type keywords (feature/module/relation)
// don't start with '--', and flag names always do.
const isBatchMode = args.length > 2;
```

### P3-6: formatFix leaks hidden verb syntax

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `formatFix` (L55-65)

No functional change to formatFix. The hidden verb leak is an inherent limitation. Add a JSDoc comment noting this:
```javascript
/**
 * formatFix generates apltk CLI commands from structured params.
 * NOTE: Uses fine-grained verb syntax (e.g., 'feature add') which are
 * hidden from help per Req 4. This is a known trade-off: the unified
 * 'add' verb doesn't support all entity types (function, variable, etc.)
 * that schema validation may need to suggest fixes for.
 */
function formatFix({ type, action, feature, submodule, name, side, scope, slug, kind }) {
```

### P3-7: collectDiffChanges doesn't accept flags

**File**: `skills/init-project-html/lib/atlas/cli.js`

This is already resolved by the P1-5 fix above which adds `flags` parameter. No additional work needed.

### P3-8: verbOpen default shows empty atlas

**File**: `skills/init-project-html/lib/atlas/cli.js`
**Function**: `dispatch` (L1656) — default verb behavior

When `verbOpen` is called without `--spec` and the base atlas doesn't exist but spec overlays do, the result is an empty atlas. This is already partially addressed by P2-8 (which makes `open --spec` work). Add a check in `verbOpen` for the no-spec, no-base-atlas case:

In `verbOpen`, after determining the base atlas doesn't exist, check for any spec overlays:
```javascript
// In verbOpen, before the fallback render:
if (!fs.existsSync(atlas)) {
  // Before rendering a fresh (empty) base atlas, check if spec overlays exist
  const plansRoot = path.join(projectRoot, PLANS_REL);
  const diffDirs = walkArchitectureDiffDirs(plansRoot);
  if (diffDirs.length > 0) {
    io.stdout.write(`Base atlas not found. Use --spec <dir> to open a spec overlay, or remove spec overlays to start fresh.\n`);
    return 0;
  }
  await runRender({ projectRoot, flags: { ...flags, spec: undefined } });
}
```

### P3-3 MODIFICATION (merge with P3-3 above)

The entity-level no-render issue is described above. Implement as instructed.

### Output

When done, report back to the coordinator:
- **Files modified**: list of files
- **Change summary**: brief description of what was changed
- **Test results**: `node --test test/atlas-cli.test.js` → all pass / failures
- **Risks or concerns**: any new issues discovered during implementation

---

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js`
   - Expected: All existing tests pass (no regressions)
2. Run: `node --test packages/tools/architecture/index.test.ts`
   - Expected: All tests pass
3. Run: `node --test test/architecture-script.test.js`
   - Expected: All tests pass
4. Run: `node --test test/tools/architecture-error-types.test.js`
   - Expected: All tests pass

---

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — All behavioral fixes
- `skills/init-project-html/lib/atlas/cli-help.js` — P2-7: hiddenVerbs export

### Forbidden Files

- `test/atlas-cli.test.js` — Modified by REGTEST worker; do not change
- `state.js`, `render.js`, `schema.js` — Modified by FIX-02 worker; do not change
- `skills/init-project-html/SKILL.md` — Not in scope for this worker
- `skills/design/SKILL.md` — Not in scope for this worker
- `docs/plans/**/DESIGN.md` — Modified by FIX-03 worker; do not change

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 4 findings
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — Technical design
