# Fix Worker Prompt: FIX-02-remove-relation-suggestions

- **Related issue**: FIX-02 / P1-2

## 1. Mission & Rules

### Mission

Make `apltk architecture remove relation` include available-edge suggestions when an intra-feature source feature is missing.

### Context

Requirement 3 requires nonexistent remove targets to return a clear error listing similar available names. Round 7 found the missing-source-feature path exits before building suggestions.

### Rules

- Modify only `skills/init-project-html/lib/atlas/cli.js`.
- Preserve existing successful relation removal behavior.
- Preserve `--kind` and `--id` filtering behavior.
- Do not add dependencies.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `skills/init-project-html/lib/atlas/cli.js` — read `sortBySimilarity()` and `verbEdge()` remove branch.
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — read P1-2.
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — read Requirement 3.

### Root Cause

When `isIntraFeatureEdge(from, to)` is true and `findFeature(state, from.feature)` returns null, the code throws `Feature "<feature>" not found for edge removal` immediately. That bypasses available-edge formatting.

## 3. Tasks

### `skills/init-project-html/lib/atlas/cli.js` — add available-edge formatting for missing intra-feature source

1. Open `skills/init-project-html/lib/atlas/cli.js`.
2. Locate `verbEdge()` remove branch around lines `644-690`.
3. Add a small helper near `sortBySimilarity()` or near `verbEdge()` to collect readable available edges from:
   - root-level `state.edges`, formatted as `"feature[/sub]" -> "feature[/sub]" (kind)`;
   - feature-local `feature.edges`, formatted as `"feature/fromSub" -> "feature/toSub" (kind)`.
4. Replace the early missing-feature error at lines `648-650` with an error containing:
   - the missing feature/source context;
   - `Available edges: ...`;
   - similar edge strings ranked with `sortBySimilarity()`.
5. Keep the existing branch for feature exists but edge not found.

### Output

Report:
- Files modified
- Change summary
- Test results
- Risks or concerns

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js --test-name-pattern "remove relation"`
   - Expected: all matching tests pass.

## 5. Scope & References

### Allowed Files

- `skills/init-project-html/lib/atlas/cli.js` — relation removal error formatting.

### Forbidden Files

- `test/atlas-cli.test.js` — owned by REGTEST-45.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md`
