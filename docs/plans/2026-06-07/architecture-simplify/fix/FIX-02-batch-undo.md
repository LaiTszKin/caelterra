# Fix Worker Prompt: FIX-02-batch-undo

- **Related issue**: FIX-02 (P2-1) — No batch-level undo support

---

## 1. Mission & Rules

### Mission

Add undo snapshot and history entry support for successful batch operations. Currently batch entities use `skipUndo: true` preventing any undo/history recording, making batch operations invisible to `apltk architecture undo`.

### Context

The spec requires batch operations to be "all-or-nothing" (Req 2). While the rollback mechanism handles failures, there is no way to undo a successfully completed batch. This is a P2 — Requirement Risk (architecture consistency).

### Rules

- Follow the Scope in Section 5 — only modify `cli.js`
- Preserve existing test semantics — do not weaken, skip, or remove existing tests
- The undo snapshot must capture the complete pre-batch state so undo fully restores it
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — batch processing (interleaved ~L1075-1115, simple pair ~L1118+) and performMutation (L245-272)
- `skills/init-project-html/lib/atlas/cli.js` L256-266 — how `writeUndoSnapshot` and `appendHistory` work for single mutations

### Root Cause

In `performMutation` (L245-272), `writeUndoSnapshot` and `appendHistory` are gated by `!flags.skipUndo`. Batch entities set `skipUndo: true` at L1082, so no individual entity records undo/history. No aggregate recording is done after the batch completes.

### Understanding the undo snapshot format

From `performMutation`:
- **Spec mode** (L255-259): `writeUndoSnapshot(overlayDir, { base, overlay })` + `appendHistory(overlayDir, { action, args, mode: 'spec' })`
- **Base mode** (L262-266): `writeUndoSnapshot(baseAtlasDir(projectRoot), { base })` + `appendHistory(baseAtlasDir(projectRoot), { action, args, mode: 'base' })`

The `before` snapshot for spec mode captures `{ base, overlay }`. For base mode it captures `{ base }`.

### Pre-batch state is already saved

In both batch paths, pre-batch state is saved before the loop:
- Interleaved (L1075-1078): `preBatchState` / `preBatchOverlayState`
- Simple pair (L1119+): same pattern

---

## 3. Tasks

### Task 1: Add undo snapshot + history for interleaved batch mode (~L1094-1099)

1. Open `skills/init-project-html/lib/atlas/cli.js`
2. Locate the interleaved batch completion code after the try/catch block (after L1094, before the render call at L1098)
3. After the try/catch and before the render check, add undo/history recording:

   ```javascript
       } // end catch

       // Write batch-level undo snapshot and history entry
       if (!flags['dry-run']) {
         if (flags.spec) {
           const base = stateLib.load(baseAtlasDir(projectRoot));
           stateLib.writeUndoSnapshot(overlayDir, { base, overlay: preBatchOverlayState });
           stateLib.appendHistory(overlayDir, {
             action: `batch add (${entities.length} entities: ${entities.map(e => `${e.type}:${e.name}`).join(', ')})`,
             args: entities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
             mode: 'spec',
           });
         } else {
           stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), { base: preBatchState });
           stateLib.appendHistory(baseAtlasDir(projectRoot), {
             action: `batch add (${entities.length} entities: ${entities.map(e => `${e.type}:${e.name}`).join(', ')})`,
             args: entities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
             mode: 'base',
           });
         }
       }

       // Determine if any entity requested --no-render
       const anyEntityNoRender = entities.some(e => e.flags['no-render']);
   ```

   Note: The `overlayDir` variable is already available in scope (defined around L1070-1072 for the interleaved batch path). Verify the variable name by reading the context around L1068-1078.

### Task 2: Add undo snapshot + history for simple pair batch mode

1. Locate the simple pair batch completion code (after the try/catch around L1140-1160 area).
2. Apply the same pattern — after the try/catch block, before the render check, add identical undo/history recording:

   ```javascript
       } // end catch

       // Write batch-level undo snapshot and history entry
       if (!flags['dry-run']) {
         if (flags.spec) {
           const base = stateLib.load(baseAtlasDir(projectRoot));
           stateLib.writeUndoSnapshot(overlayDir, { base, overlay: preBatchOverlayState });
           stateLib.appendHistory(overlayDir, {
             action: `batch add (${simpleEntities.length} entities: ${simpleEntities.map(e => `${e.type}:${e.name}`).join(', ')})`,
             args: simpleEntities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
             mode: 'spec',
           });
         } else {
           stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), { base: preBatchState });
           stateLib.appendHistory(baseAtlasDir(projectRoot), {
             action: `batch add (${simpleEntities.length} entities: ${simpleEntities.map(e => `${e.type}:${e.name}`).join(', ')})`,
             args: simpleEntities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
             mode: 'base',
           });
         }
       }
   ```

   Note: Verify the variable names by reading the simple pair batch context. Variables may use `simpleEntities` instead of `entities`. The `overlayDir` may need to be computed via `specOverlayDir()` if not already in scope.

### Output

When done, report back to the coordinator:
- **Files modified**: `skills/init-project-html/lib/atlas/cli.js`
- **Change summary**: Added batch-level undo snapshot and history entry for both interleaved and simple pair batch modes
- **Test results**: Run `node --test test/atlas-cli.test.js` and confirm all existing tests pass
- **Risks or concerns**: The history entry format includes entity flags which may contain sensitive data. The undo snapshot size grows linearly with batch size

---

## 4. Verification

1. Run existing tests: `node --test test/atlas-cli.test.js`
   - Expected: All existing tests pass (no regressions)
2. Manual verification — run from project root:
   ```bash
   # Create a batch
   node dist/bin/apollo-toolkit.js architecture add feature testUndoBatch module testMod --part-of testUndoBatch
   # Check undo works
   node dist/bin/apollo-toolkit.js architecture undo
   # Verify the batch was reverted (feature testUndoBatch should be gone)
   node dist/bin/apollo-toolkit.js architecture validate
   ```

---

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — only modify this file

### Forbidden Files

- All other files — do not modify

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Req 2 (batch mode)
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P2-1 finding
- `docs/plans/2026-06-07/architecture-simplify/DESIGN.md` — §7 batch atomicity
