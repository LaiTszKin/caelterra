# Regression Test Worker Prompt: REGTEST-01 — Integration tests

- **Related fix**: FIX-01, FIX-02 — all 24 issues in REPORT.md Round 3

---

## 1. Mission & Rules

### Mission

Write 9 regression tests in `test/atlas-cli.test.js` that verify the Round 3 fixes. These tests must fail on the unfixed code and pass after FIX-01 and FIX-02 are applied.

### Context

The tests cover: relation `--depends-on`, relation change summary accuracy, simple pair batch duplicate counting, batch all-skipped output, remove relation with `--kind`, feature dependsOn cleanup on remove, multiVerbs/hiddenVerbs sync, batch dry-run, and unified `add --spec` + `diff` end-to-end.

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied — this is the core oracle
- Follow the existing test patterns and style of the tests in `test/atlas-cli.test.js`
- If the test cannot be designed to fail before the fix, report to the coordinator — do not write a weak test
- Workers are leaf nodes — do not spawn sub-workers

---

## 2. Context

### Input Files

- Fix-related files: `skills/init-project-html/lib/atlas/cli.js` — understand what was changed to design accurate oracles
- Existing test file (as format reference): `test/atlas-cli.test.js` — follow the same `import test`, `import assert`, `makeIo()`, `mkProject()`, and cleanup patterns

### Test Designs

#### REGTEST-01: Relation `--depends-on` creates dependency edge (P2-1)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js` (append near the end, before the final closing)
- **Scenario**: GIVEN a project with features `a` and `b` WHEN running `add relation a --depends-on b` THEN a dependency-kind edge exists in the atlas index
- **Oracle**: Before fix: the edge is NOT created (`--depends-on` silently ignored). After fix: the edge IS created with kind `dependency`.

#### REGTEST-02: Relation change summary only shows applied flags (P2-2)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a project with features `a` and `b` WHEN running `add relation a --depends-on b` THEN the stdout must NOT claim `depends-on` was applied (before fix it would show it despite being ignored)
- **Oracle**: Before fix: stdout contains `depends-on: b` even though no edge was created. After fix: stdout either omits it or shows a different correct message.

#### REGTEST-03: Simple pair batch mode pre-validation + skip count (P2-3, P2-4)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a project with feature `payment` WHEN running `add module m1 --part-of nonexistent` in batch mode THEN the command fails BEFORE any mutations (test by verifying that if there's a valid feature before the invalid module, it's NOT created)
- **Oracle**: Before fix: the simple pair batch mode writes entity 1 before entity 2 fails (no pre-validation). After fix: pre-validation catches the error before any write.

**Alternative oracle**: GIVEN a project WHEN running `add feature f1 feature f1` (duplicate in simple pair batch) THEN the output must report 1 added and 1 skipped, not "2 entities".

#### REGTEST-04: Batch all-skipped outputs message (P2-5)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a project with feature `existing` WHEN running `add feature existing feature existing` in batch mode THEN stdout must contain a message indicating all were skipped, even though results are 0 added
- **Oracle**: Before fix: no message (neither branch in L900-905 executed). After fix: message like "all 2 entities already exist, skipped".

#### REGTEST-05: Remove relation with `--kind` filters by kind (P2-6)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a project with two edges between the same endpoints (one `data-row`, one `call`) WHEN running `remove relation a --to b --kind call` THEN only the `call`-kind edge is removed, the `data-row` edge remains
- **Oracle**: Before fix: The `--kind` flag is not forwarded, so ALL edges between the endpoints are removed regardless of kind. After fix: Only the matching-kind edge is removed.

**Setup**: Create feature `a` with submodule `svc`, feature `b` with submodule `api`. Add edge `a/svc` -> `b/api` with kind `data-row`. Add edge `a/svc` -> `b/api` with kind `call`. Then remove with `--kind call`. Verify only the call edge is gone.

#### REGTEST-06: Feature remove cleans up `dependsOn` on other features (P2-7)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN features `X` and `Y` where X has `dependsOn: ['Y']` WHEN removing feature `Y` THEN feature X's `dependsOn` array no longer contains `'Y'`
- **Oracle**: Before fix: X's `dependsOn` still contains `'Y'` after removing Y (orphaned reference). After fix: `dependsOn` is cleaned up.

**Note**: The unified add `add feature X --depends-on Y` creates both a `dependsOn` YAML field and a dependency edge. Use the fine-grained verb `feature add --slug X --depends-on Y` to test, which ONLY sets the YAML field (the edge addition is from the unified add path). This test verifies the YAML field cleanup.

#### REGTEST-07: multiVerbs/hiddenVerbs sync (P2-10)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN the cli module's `MULTI_VERBS` export and cli-help module's `hiddenVerbs` GIVEN both contain the same hardcoded list of fine-grained verb names WHEN compared THEN they must contain exactly the same entries
- **Oracle**: Before fix: no test exists (no regression guard). After fix: test confirms both sets are identical.

**How to access**: After FIX-01 adds `MULTI_VERBS` to cli.js's `module.exports`, you can import it:
```javascript
const cli = require('../skills/init-project-html/lib/atlas/cli.js');
const cliHelp = require('../skills/init-project-html/lib/atlas/cli-help.js');
// Compare cli.MULTI_VERBS with cliHelp's hiddenVerbs
```

**But** `hiddenVerbs` is not exported from cli-help.js. You'll need to either:
1. Check that cli-help.js exports `hiddenVerbs` (it might need to be added) — or —
2. Test indirectly by checking that `feature`, `submodule`, etc. are NOT shown in top-level help

For simplicity, test via help output: verify `apltk architecture help` does not show any fine-grained verbs AND that the fine-grained verbs still work (backward compatible).

#### REGTEST-08: Batch dry-run mode (P3-6)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a project WHEN running `add feature f1 feature f2 --dry-run --project <root> --no-render` THEN the state YAML must NOT change after the command AND the output message must indicate dry-run mode
- **Oracle**: Before fix: output says "add applied" without mentioning dry-run. After fix: output contains "(dry-run)" or similar indicator.

#### REGTEST-09: Unified `add --spec` + `diff` end-to-end (P3-13)

- **Type**: Integration
- **Location**: `test/atlas-cli.test.js`
- **Scenario**: GIVEN a project with a base atlas feature WHEN running `add feature new-feature --spec <spec_dir>` THEN create the overlay AND running `diff --project <root> --out <dir> --no-open` must show the new feature as "added" in the diff output
- **Oracle**: Before fix: no test exists (regression gap). After fix: diff output must include `added=1` for the unified-add overlay.

**Pattern to follow**: The existing test `'diff merges batch member overlays into one combined macro view'` (L618-653) shows how to set up spec overlays and verify diff output. The existing test `'add --spec writes to overlay without mutating base files'` (L1017-1035) shows how to use unified add with --spec.

---

## 3. Tasks

1. Open `test/atlas-cli.test.js`
2. Read the existing test structure (imports, `makeIo()`, `mkProject()`, cleanup patterns in `try/finally`)
3. Append the 9 new tests at the end of the file (before the final closing bracket)
4. Each test should follow this structure:
   - Descriptive name prefixed with the REGTEST identifier
   - `const root = mkProject()` at start
   - `try { ... } finally { fs.rmSync(root, { recursive: true, force: true }); }` for cleanup
   - Use `cli.dispatch([...], io)` for commands
   - Use `stateLib.load()` or `fs.readFileSync()`/`fs.existsSync()` for assertions
5. Verify each test oracle fails on unfixed code (you'll need to temporarily revert FIX-01 changes to confirm, or reason about the expected behavior)

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Tests added**: REGTEST-01 through REGTEST-09
- **Oracle confirmed**: each test's expected behavior before and after fix
- **Risks or concerns**: or "None"

---

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js`
   - Expected: All existing tests pass, all 9 new tests pass
2. Run: `node --test packages/tools/architecture/index.test.ts`
   - Expected: All tests pass (no regression)

---

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — write all 9 regression tests here

### Forbidden Files

- All source code files (`.ts`, `.js` except the test file itself) — the regression test worker must not modify source code
- `packages/tools/architecture/index.test.ts` — owned by different test suite

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/FIX.md` — Fix coordinator prompt (fix details)
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Review findings
