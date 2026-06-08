# Regression Test Worker Prompt: REGTEST-48-hidden-help-source-scan

- **Related fix**: FIX-05 — remove hidden help pages

## 1. Mission & Rules

### Mission

Add or extend tests proving hidden fine-grained help strings are removed from `cli-help.js` while runtime hidden help still redirects to public unified help.

### Context

FIX-05 removes unreachable hidden `familyPages` and `actionPages` content.

### Rules

- Only modify `test/architecture-script.test.js`.
- The source-scan assertion must fail on Round 7 reviewed code and pass after FIX-05.
- Do not modify source code.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `test/architecture-script.test.js` — hidden help tests.
- `skills/init-project-html/lib/atlas/cli-help.js` — context only.
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-05-remove-hidden-help-pages.md`.

### Test Design

- **Test ID**: REGTEST-48
- **Type**: Unit/source scan
- **Location**: `test/architecture-script.test.js`
- **Scenario**: GIVEN `cli-help.js`, WHEN scanning for hidden command usage strings, THEN strings like `apltk architecture feature add --slug` are absent, and runtime hidden help still returns public `add` help.
- **Oracle**: Must fail on Round 7 reviewed code because hidden command strings remain in `cli-help.js`; must pass after FIX-05.

## 3. Tasks

1. Add a test near `atlas CLI redirects hidden verb action help to public unified help`.
2. Read `skills/init-project-html/lib/atlas/cli-help.js` as text.
3. Assert it does not contain hidden command usage strings:
   - `apltk architecture feature add`
   - `apltk architecture submodule add`
   - `apltk architecture edge add`
   - other hidden command/action examples if present.
4. Keep or reuse the existing runtime redirect test to ensure behavior remains public.

## 4. Verification

1. Before FIX-05, run the new test.
   - Expected: fails because source contains hidden help strings.
2. After FIX-05, run: `node --test test/architecture-script.test.js --test-name-pattern "hidden"`
   - Expected: passes.

## 5. Scope & References

### Allowed Files

- `test/architecture-script.test.js` — add source-scan assertion.

### Forbidden Files

- All source files — test worker must not modify source code.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-05-remove-hidden-help-pages.md`
