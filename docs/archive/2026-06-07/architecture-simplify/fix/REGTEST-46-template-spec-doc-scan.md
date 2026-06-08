# Regression Test Worker Prompt: REGTEST-46-template-spec-doc-scan

- **Related fix**: FIX-03 — active atlas reference docs

## 1. Mission & Rules

### Mission

Extend the active-doc scan so it fails when `TEMPLATE_SPEC.md` exposes hidden fine-grained architecture commands.

### Context

FIX-03 rewrites `TEMPLATE_SPEC.md`. The existing active-doc scan did not include that file.

### Rules

- Only modify `test/architecture-script.test.js`.
- The test must fail on Round 7 reviewed docs and pass after FIX-03.
- Do not modify docs or source code.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `test/architecture-script.test.js` — read `REGTEST-42`.
- `skills/init-project-html/references/TEMPLATE_SPEC.md` — context only.
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-03-template-spec-docs.md`.

### Test Design

- **Test ID**: REGTEST-46
- **Type**: Documentation scan
- **Location**: `test/architecture-script.test.js`
- **Scenario**: GIVEN active docs include `TEMPLATE_SPEC.md`, WHEN scanning hidden command syntax, THEN no hidden examples are present.
- **Oracle**: Must fail on Round 7 reviewed code because `TEMPLATE_SPEC.md` contains hidden examples; must pass after FIX-03.

## 3. Tasks

1. Open `test/architecture-script.test.js`.
2. In `REGTEST-42: active docs do not expose fine-grained architecture verbs`, add `skills/init-project-html/references/TEMPLATE_SPEC.md` to `filesToScan`.
3. Keep the forbidden regex.
4. Do not add broad exclusions that would let hidden command examples pass.

## 4. Verification

1. Before FIX-03, run: `node --test test/architecture-script.test.js --test-name-pattern "REGTEST-42"`
   - Expected: fails because `TEMPLATE_SPEC.md` contains forbidden examples.
2. After FIX-03, run the same command.
   - Expected: passes.

## 5. Scope & References

### Allowed Files

- `test/architecture-script.test.js` — extend docs scan.

### Forbidden Files

- `skills/init-project-html/references/TEMPLATE_SPEC.md` — owned by FIX-03.
- All source files.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-03-template-spec-docs.md`
