# Regression Test Worker Prompt: REGTEST-01-preserve-disabled-state

- **Related fix**: FIX-01 - preserve disabled auto-update state during manual/scheduled runs

---

## 1. Mission & Rules

### Mission

Add regression coverage proving `auto-update run` and `runAutoUpdate()` preserve a disabled auto-update configuration while still allowing a manual one-off update.

### Context

FIX-01 changes the runner to carry the current config `enabled` value through status and config writes. The unfixed code writes `{ enabled: true }` after a successful runner update, so this regression must fail on that behavior.

### Rules

- Only create or modify test files - never modify source code.
- The test must fail on the unfixed code and pass after FIX-01.
- Follow existing `node:test` patterns in the reference files.
- Do not weaken, skip, or remove existing assertions.
- Workers are leaf nodes - do not spawn sub-workers.

---

## 2. Context

### Input Files

- Fix-related files: `packages/cli/auto-update-runner.ts`, `packages/cli/index.ts`.
- Existing test files: `test/cli/auto-update-runner.test.js`, `test/cli/interactive-paths.test.js`.
- State helper reference: `packages/cli/auto-update-state.ts`.

### Test Design

- **Test ID**: REGTEST-01
- **Type**: Integration/unit hybrid using fake package source and temp filesystem.
- **Location**: `test/cli/auto-update-runner.test.js`
- **Scenario**: GIVEN `.apollo-toolkit-auto-update.json` contains `{ enabled: false }` and the runner is invoked with `autoUpdateEnabled: false`, WHEN a fake package source updates managed toolkit content, THEN the config file remains disabled and the status file records `enabled: false`.
- **Oracle**: On unfixed code, the config and status will be rewritten with `enabled: true`; after FIX-01, both remain false.

---

## 3. Tasks

1. Open `test/cli/auto-update-runner.test.js`.
2. Add a helper if needed to read `.apollo-toolkit-auto-update.json`, similar to existing `readStatusFile()`.
3. Add a new test near the managed overwrite/status tests:
   - Name: `preserves disabled config during manual auto-update run`.
   - Create a temp `toolkitHome` fixture with version `1.0.0` using `createSourceFixture()`.
   - Write `.apollo-toolkit-auto-update.json` in `toolkitHome` with `{ enabled: false, updatedAt: '2026-06-16T00:00:00.000Z' }`.
   - Use a fake package source that resolves and extracts version `2.0.0` with a valid `package.json` and `skills/test-skill/SKILL.md`.
   - Call `runAutoUpdate({ sourceRoot: tmp, toolkitHome, packageName: '@laitszkin/cli', currentVersion: '1.0.0', modes: [], packageSource: fakeSource, autoUpdateEnabled: false })`.
   - Assert `result.updated === true`.
   - Read the config file and assert `config.enabled === false`.
   - Read the status file and assert `status.enabled === false`, `status.lastSuccessAt` exists, and `status.lastVersion === '2.0.0'`.
4. Do not add a CLI-level network/pacote test; this regression should stay deterministic with the fake package source.

### Output

When done, report back to the coordinator:
- **Test file**: `test/cli/auto-update-runner.test.js`
- **Test name**: `preserves disabled config during manual auto-update run`
- **Oracle confirmed**: fails before FIX-01 and passes after FIX-01
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before FIX-01 is applied: `npm run build && node --test dist/test/cli/auto-update-runner.test.js`
   - Expected: New test fails because config/status are rewritten to enabled.
2. Run after FIX-01 is applied: `npm run build && node --test dist/test/cli/auto-update-runner.test.js`
   - Expected: New test passes.
3. Run: `node --test dist/test/cli/interactive-paths.test.js`
   - Expected: Existing install disabled-state tests still pass.

---

## 5. Scope & References

### Allowed Files

- `test/cli/auto-update-runner.test.js` - write the regression test here.

### Forbidden Files

- All source code files under `packages/**` - this worker is test-only.
- `dist/**` - generated output; never edit by hand.

### Related Documents

- `docs/plans/2026-06-16/background-auto-update/fix/FIX-01-preserve-disabled-state.md`
- `docs/plans/2026-06-16/background-auto-update/SPEC.md`
- `docs/plans/2026-06-16/background-auto-update/REPORT.md`
