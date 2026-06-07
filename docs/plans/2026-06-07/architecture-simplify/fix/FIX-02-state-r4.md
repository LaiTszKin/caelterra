# Fix Worker Prompt: FIX-02-state-r4

- **Related issue**: FIX-02 — `deriveOverlay()` never populates `removed.submodules` (P1-4)

---

## 1. Mission & Rules

### Mission

Fix `deriveOverlay()` in `state.js` to correctly populate `overlay.removed.submodules` when submodules are removed in `--spec` mode.

### Context

P1-4 in REPORT.md: `deriveOverlay()` (state.js L311) pushes removed feature slugs to `overlay.removed.features` but never tracks submodule-level removals. `overlay.removed.submodules` exists in the schema (state.js L154) and `mergeOverlay` (L247-251) has code to consume it, but it's never populated. Submodule removals work functionally because the parent feature in the overlay lacks the removed submodule, but the explicit tracking field is dead code.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed
- Preserve existing test semantics — do not weaken, skip, or remove existing tests
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/state.js` — The `deriveOverlay` function (around L290-315)
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — P1-4 finding
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Req 3: remove in `--spec` mode

### Root Cause

`deriveOverlay(base, merged)` computes the overlay from the difference between `base` and `merged` states. It correctly computes `removed.features` by finding features present in `base` but absent in `merged`. However, it never performs the equivalent check for submodules within features that exist in both states. The `removed.submodules` array on the overlay object is always left as an empty array, making the explicit tracking infrastructure dead code.

The functional behavior (the feature in the overlay simply lacks the removed submodule) works correctly because `mergeOverlay` replaces feature-level state entirely. But the explicit `removed.submodules` tracking is never populated, meaning:
1. Consumers of `_removed.yaml` cannot see submodule-level removals
2. `mergeOverlay`'s second pass for removed submodules (L247-251) is never exercised

---

## 3. Tasks

### [state.js] — Fix `deriveOverlay` to populate `removed.submodules`

1. Open `skills/init-project-html/lib/atlas/state.js`
2. Locate the `deriveOverlay` function (around L290-315)
3. Find where `removed.features` is populated and extend it to also compute `removed.submodules`:

**Before** (current code at L308-315):
```javascript
const result = { features: featureDiffs, removed: { features: [], submodules: [] } };
for (const slug of baseFeatures.keys()) {
  if (!mergedFeatures.has(slug)) {
    result.removed.features.push(slug);
  }
}
```

**After** (modified code):
```javascript
const result = { features: featureDiffs, removed: { features: [], submodules: [] } };
for (const slug of baseFeatures.keys()) {
  if (!mergedFeatures.has(slug)) {
    result.removed.features.push(slug);
  } else {
    // Check for removed submodules within features that exist in both states
    const baseFeat = baseFeatures.get(slug);
    const mergedFeat = mergedFeatures.get(slug);
    if (baseFeat && mergedFeat) {
      const baseSubs = new Set((baseFeat.submodules || []).map(s => s.slug));
      const mergedSubs = new Set((mergedFeat.submodules || []).map(s => s.slug));
      for (const subSlug of baseSubs) {
        if (!mergedSubs.has(subSlug)) {
          result.removed.submodules.push({ feature: slug, submodule: subSlug });
        }
      }
    }
  }
}
```

4. Also check if `mergeOverlay` (around L247-251) is correctly consuming `removed.submodules`. If it is (the code review confirmed it has the loop but it's never exercised), no change needed there. If the loop logic is incorrect, fix it to match the data format.

5. Read `mergeOverlay` to verify. The current code at L247-251 should be similar to:
```javascript
for (const { feature: fslug, submodule: sslug } of overlay.removed.submodules) {
  const f = featureMap.get(fslug);
  if (f) f.submodules = (f.submodules || []).filter((s) => s.slug !== sslug);
}
```
If this loop exists and destructures `{ feature, submodule }` correctly, it's ready to consume the data from step 3. If the destructuring is different, adjust accordingly.

### Output

When done, report back to the coordinator:
- **Files modified**: [list of files]
- **Change summary**: brief description of what was changed
- **Test results**: all existing tests pass
- **Risks or concerns**: or "None"

---

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js`
   - Expected: All existing tests pass (no regressions). Look for tests at L240 (feature remove --spec) and L259 (spec re-add submodule) — these should still pass.
2. Run: `node --test packages/tools/architecture/index.test.ts`
   - Expected: All tests pass

---

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/state.js` — `deriveOverlay` function

### Forbidden Files

- `skills/init-project-html/lib/atlas/cli.js` — Modified by FIX-01 worker
- `skills/init-project-html/lib/atlas/cli-help.js` — Modified by FIX-01 worker
- `test/atlas-cli.test.js` — Modified by REGTEST worker
- `skills/*/SKILL.md`, `DESIGN.md` — Modified by other workers

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 4 findings (P1-4)
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Req 3: remove behavior
