# Fix Worker Prompt: FIX-01-cli-simple-fixes

- **Related issues**: FIX-01 (P1-1), FIX-03 (P2-2), FIX-06 (P3-2), FIX-08 (P3-4), FIX-09 (P3-5), FIX-10 (P3-6), FIX-11 (P3-7), FIX-13 (P3-9), FIX-14 (P3-10), FIX-05 (P3-1 comment), FIX-12 (P3-8 comment)

---

## 1. Mission & Rules

### Mission

Apply 11 simple-to-medium fixes in `cli.js` covering validateEntity divergence, missing validation, inconsistent messages, --spec directory checks, and testability improvements.

### Context

Round 5 review found these issues all in `skills/init-project-html/lib/atlas/cli.js`. They are non-conflicting (different line ranges) and can be applied sequentially by one worker. The fixes address: Spec implementation deviation (P1), Architecture defect (P2), Architecture consistency (P3), Spec implementation omission (P3).

### Rules

- Follow the Scope in Section 5 — only modify `cli.js`
- Preserve existing test semantics — do not weaken, skip, or remove existing tests
- Workers are leaf nodes — do not spawn sub-workers
- Apply fixes in the order listed in Section 3

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — all fixes are in this file
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — spec requirements
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 5 findings

---

## 3. Tasks

### Task 1: FIX-01 — Add `--depends-on` to validateEntity (P1, cli.js L1216)

**Root cause**: `validateEntity` checks `--data-flow-to`, `--implements`, `--deployed-on` for relation but omits `--depends-on`. `processAddEntity` at L882 accepts `--depends-on` standalone. This causes batch mode to reject valid commands that single-entity mode accepts.

1. Open `skills/init-project-html/lib/atlas/cli.js`
2. Locate line 1216:
   ```javascript
   if (entity.type === 'relation' && !entity.flags['data-flow-to'] && !entity.flags.implements && !entity.flags['deployed-on']) {
   ```
3. Add `&& !entity.flags['depends-on']` to the condition:
   ```javascript
   if (entity.type === 'relation' && !entity.flags['data-flow-to'] && !entity.flags.implements && !entity.flags['deployed-on'] && !entity.flags['depends-on']) {
   ```
4. Update the error message on line 1217 to include `--depends-on`:
   ```javascript
   throw new Error('Missing required flag --data-flow-to, --implements, --deployed-on, or --depends-on for relation');
   ```

### Task 2: FIX-03 — Call validateEntity in single-entity mode (P2, cli.js L1185)

**Root cause**: `validateEntity` is only called in batch-mode loops (L1063, L1138). Single-entity mode calls `processAddEntity` directly without structural pre-validation.

1. Locate line 1185 (after `if (!type || !name)` check, before `const addResult = await processAddEntity(...)`).
2. Insert `validateEntity({ type, name, flags });` immediately before the `processAddEntity` call:

   **Before** (L1185-1186):
   ```javascript
     if (!type || !name) {
       throw new Error('Usage: apltk architecture add <feature|module|relation> <name> [relation-flags...]');
     }

     const addResult = await processAddEntity(type, name, flags);
   ```

   **After**:
   ```javascript
     if (!type || !name) {
       throw new Error('Usage: apltk architecture add <feature|module|relation> <name> [relation-flags...]');
     }

     validateEntity({ type, name, flags });
     const addResult = await processAddEntity(type, name, flags);
   ```

### Task 3: FIX-06 — Consistent "already exists" messages (P3, cli.js L1104)

**Root cause**: Batch mode uses "already exist" (plural), single-entity mode uses "already exists" (singular).

1. Locate line 1104. Change `already exist` to `already exists`:
   ```javascript
   // Before:
   io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)${dryRunPrefix}\n`);
   // After:
   io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exists)${dryRunPrefix}\n`);
   ```

### Task 4: FIX-08 — Target existence validation for --data-flow-to/--implements/--deployed-on (P3, cli.js L793, L861, L940)

**Root cause**: `--depends-on` targets are validated (per P1-2 fix in Round 4), but `--data-flow-to`, `--implements`, and `--deployed-on` targets are not. Dangling edges can be created silently.

1. **Module `--implements`** (around L793): After the `if (implementsTarget)` block starts, before `verbEdge('add', ...)`, add validation:
   ```javascript
   if (implementsTarget) {
     // Validate implements target exists
     const { base: vBase, merged: vMerged } = loadResolvedState(projectRoot, entityFlags);
     const vState = entityFlags.spec ? vMerged : vBase;
     const allFeats = (vState.features || []).map(f => f.slug);
     if (!allFeats.includes(implementsTarget)) {
       throw new Error(`Target "${implementsTarget}" not found for --implements. Available features: ${allFeats.join(', ') || '(none)'}`);
     }
     await verbEdge('add', { ... });
   }
   ```

2. **Module `--deployed-on`** (around L805): Same pattern — validate before `verbEdge`:
   ```javascript
   if (deployedOnTarget) {
     const { base: vBase, merged: vMerged } = loadResolvedState(projectRoot, entityFlags);
     const vState = entityFlags.spec ? vMerged : vBase;
     const allFeats = (vState.features || []).map(f => f.slug);
     if (!allFeats.includes(deployedOnTarget)) {
       throw new Error(`Target "${deployedOnTarget}" not found for --deployed-on. Available features: ${allFeats.join(', ') || '(none)'}`);
     }
     await verbEdge('add', { ... });
   }
   ```

3. **Module `--data-flow-to`** (around L861): Same pattern:
   ```javascript
   if (dataFlowTo) {
     const { base: vBase, merged: vMerged } = loadResolvedState(projectRoot, entityFlags);
     const vState = entityFlags.spec ? vMerged : vBase;
     const allFeats = (vState.features || []).map(f => f.slug);
     if (!allFeats.includes(dataFlowTo)) {
       throw new Error(`Target "${dataFlowTo}" not found for --data-flow-to. Available features: ${allFeats.join(', ') || '(none)'}`);
     }
     await verbEdge('add', { ... });
   }
   ```

4. **Relation `to` target** (around L940): Same pattern — validate target feature exists:
   ```javascript
   if (to) {
     const allFeats = (currentState.features || []).map(f => f.slug);
     const toFeat = parseEndpoint(to).feature;
     if (!allFeats.includes(toFeat)) {
       throw new Error(`Target "${to}" not found. Available features: ${allFeats.join(', ') || '(none)'}`);
     }
     // existing edge creation code...
   }
   ```

### Task 5: FIX-09 — Check all comma-separated --depends-on targets for duplicates (P3, cli.js L916)

**Root cause**: The duplicate edge check for `--depends-on` on relation type only inspects the first comma-separated target.

1. Locate the duplicate check block around L916-926.
2. Change from checking only `dependsOnItems[0]` to iterating all items:

   **Before** (L916-926):
   ```javascript
   if (dependsOn) {
     const dependsOnItems = splitList(dependsOn);
     const existingDepEdges = currentState.edges.filter(e => ...);
     const firstTarget = dependsOnItems[0]; // only checks first
     // ...
   }
   ```

   **After** — iterate all targets:
   ```javascript
   if (dependsOn) {
     const dependsOnItems = splitList(dependsOn);
     const existingDepEdges = currentState.edges.filter(e =>
       e.kind === 'depends-on' &&
       endpointEquals(e.from, parseEndpoint(entityName))
     );
     for (const depTarget of dependsOnItems) {
       const depEndpoint = parseEndpoint(depTarget);
       const hasExistingDep = existingDepEdges.some(e =>
         endpointEquals(e.to, depEndpoint)
       );
       if (hasExistingDep) return 'skipped';
     }
   }
   ```

Note: Read the actual current code around L916-926 to understand the exact structure before making changes. The intent is to check ALL comma-separated targets, not just the first.

### Task 6: FIX-10 — --spec directory validation in verbRemove (P3, cli.js L1221)

**Root cause**: `verbAdd` validates `--spec` directory existence at L722-730, but `verbRemove` has no equivalent check.

1. Locate `async function verbRemove(args, flags, projectRoot, io)` at L1221.
2. After the `if (!type || !name)` check (L1225-1227), add the same validation as verbAdd:

   ```javascript
   async function verbRemove(args, flags, projectRoot, io) {
     const type = args[0];
     const name = args[1];

     if (!type || !name) {
       throw new Error('Usage: apltk architecture remove <feature|module|relation> <name>');
     }

     // Validate --spec directory exists before any entity processing
     if (flags.spec) {
       const specPath = path.isAbsolute(String(flags.spec))
         ? String(flags.spec)
         : path.resolve(projectRoot, String(flags.spec));
       if (!fs.existsSync(specPath)) {
         throw new Error(`Spec directory not found: ${flags.spec}`);
       }
     }

     switch (type) {
     // ... rest of function
   ```

### Task 7: FIX-11 — Similar-name suggestions for submodule remove parent error (P3, cli.js L452)

**Root cause**: When removing a submodule and the parent feature doesn't exist, the error message at L452 doesn't list available features.

1. Locate L452-453:
   ```javascript
   throw new Error(`Feature "${featureSlug}" not found for submodule removal`);
   ```
2. Replace with similarity-sorted listing (matching the pattern at L443-444 for add):
   ```javascript
   const available = (state.features || []).map(f => f.slug);
   const similar = sortBySimilarity(featureSlug, available);
   throw new Error(`Feature "${featureSlug}" not found for submodule removal. Available features: ${similar.join(', ') || '(none)'}`);
   ```

### Task 8: FIX-13 — Move legacy intercept before --help check (P3, cli.js L1845-1856)

**Root cause**: The `--help` check at L1845 fires before the `apply`/`template` removal intercept at L1853. Running `apltk architecture apply --help` shows general usage instead of the removal error.

1. Move the `apply`/`template` intercept (L1853-1856) to BEFORE the `--help` check (L1845-1851).
2. Reorder so the flow is:
   ```javascript
   // 1. First, block removed commands
   if (verb === 'apply' || verb === 'template') {
     io.stderr.write(`Error: "${verb}" has been removed. Use "apltk architecture add <feature|module|relation>" instead.\n`);
     return 1;
   }

   // 2. Then handle --help for remaining valid verbs
   if (verb === 'help' || verb === '--help' || verb === '-h' || flags.help) {
     // ... existing help code
   }
   ```

### Task 9: FIX-14 — Use specOverlayDir() in collectDiffChanges (P3, cli.js L1474)

**Root cause**: `collectDiffChanges` computes `overlayDir` directly from `specPath` without using `specOverlayDir()` which handles batch root resolution. Running `diff --spec <batch-member>` uses the wrong overlay directory.

1. Locate L1474-1477:
   ```javascript
   if (flags.spec) {
     const specPath = path.isAbsolute(String(flags.spec)) ? String(flags.spec) : path.resolve(projectRoot, String(flags.spec));
     const overlayDir = path.join(specPath, DIFF_DIRNAME, ATLAS_DIRNAME);
   ```
2. Replace the `overlayDir` computation to use `specOverlayDir()`:
   ```javascript
   if (flags.spec) {
     const specPath = path.isAbsolute(String(flags.spec)) ? String(flags.spec) : path.resolve(projectRoot, String(flags.spec));
     const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
   ```

### Task 10: FIX-05 — Add comment about crash risk limitation (P3, cli.js L1080)

**Root cause**: Process crash mid-batch leaves partial state on disk. This is a documented limitation (DESIGN.md §7).

1. At L1080 (before the `try` block), add a comment:
   ```javascript
   // NOTE: Batch atomicity is best-effort via JS-level try/catch rollback.
   // A process crash (SIGKILL) mid-batch can leave partial state on disk.
   // For strict atomicity, use --spec mode + diff + merge workflow instead.
   try {
   ```

### Task 11: FIX-12 — Clarify formatFix trade-off comment (P3, cli.js L54-59)

**Root cause**: `formatFix` uses hidden verb syntax but the existing comment doesn't fully explain the trade-off.

1. Locate the comment at L54-59. Enhance it:
   ```javascript
   // NOTE: formatFix generates CLI commands using fine-grained verb syntax
   // (e.g., "apltk architecture function add") because the unified "add" verb
   // does not support entity types like function, variable, dataflow, error, or edge.
   // These fix suggestions appear only in validation/status error output, not in help.
   // Trade-off: agents reading validation errors may discover hidden verb syntax.
   function formatFix({ type, action, feature, submodule, name, side, scope, slug, kind }) {
   ```

### Output

When done, report back to the coordinator:
- **Files modified**: `skills/init-project-html/lib/atlas/cli.js`
- **Change summary**: 11 fixes applied — validateEntity divergence fix, single-entity validation gate, consistent messages, target existence validation for data-flow-to/implements/deployed-on, duplicate --depends-on comma-target check, --spec dir validation in verbRemove, similar-name suggestions for submodule parent error, legacy intercept reorder, diff batch path resolution, crash risk comment, formatFix comment clarification
- **Test results**: Run `node --test test/atlas-cli.test.js` and confirm all existing tests pass
- **Risks or concerns**: The FIX-08 target validation loads resolved state for each flag individually. Consider consolidating into a single loadResolvedState call if performance is a concern

---

## 4. Verification

1. Run existing tests: `node --test test/atlas-cli.test.js`
   - Expected: All existing tests pass (no regressions)
2. Run the architecture script test: `node --test test/architecture-script.test.js`
   - Expected: All tests pass
3. Manual verification — run these commands from the project root:
   - `node dist/bin/apollo-toolkit.js architecture add relation testRel --depends-on someFeature` (single-entity should succeed or fail with clear message)
   - `node dist/bin/apollo-toolkit.js architecture add relation testRel --depends-on someFeature feature testFeat` (batch should NOT reject with "Missing required flag --data-flow-to")
   - `node dist/bin/apollo-toolkit.js architecture remove feature nonexistent --spec nonexistent-dir` (should fail with "Spec directory not found")
   - `node dist/bin/apollo-toolkit.js architecture apply --help` (should show removal error, not general help)

---

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — all fixes are in this file

### Forbidden Files

- All other files — do not modify

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md`
