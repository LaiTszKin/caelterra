# Fix Worker Prompt: FIX-01-preserve-disabled-state

- **Related issue**: REPORT.md P1 finding 1 - Manual `auto-update run` can re-enable a previously disabled configuration.

---

## 1. Mission & Rules

### Mission

Prevent `auto-update run` and the runner status path from changing a user-disabled auto-update configuration back to enabled.

### Context

Review dimension: spec implementation deviation. This affects Req 2 scheduled update control and Req 5 status visibility. `auto-update disable` persists `{ enabled: false }`, but `runAutoUpdate()` currently writes `enabled: true` to status on no-op/success/failure paths and writes the config back to `{ enabled: true }` after success.

### Rules

- Follow the Scope in Section 5 - only modify files listed as Allowed.
- Preserve existing test semantics - do not weaken, skip, or remove existing tests.
- Do not change scheduler enable/disable behavior in `packages/cli/index.ts` except where needed to pass the current enabled state into the runner.
- Do not add new dependencies.
- Workers are leaf nodes - do not spawn sub-workers.

---

## 2. Context

### Input Files

- `packages/cli/index.ts` - read the `parsed.command === 'auto-update'` branch, especially lines 370-421.
- `packages/cli/auto-update-runner.ts` - read `AutoUpdateOptions`, `runAutoUpdate()`, and `writeRunnerStatus()` around lines 24-206.
- `packages/cli/auto-update-state.ts` - read `readAutoUpdateConfig()`, `writeAutoUpdateConfig()`, and status types.
- `docs/plans/2026-06-16/background-auto-update/SPEC.md` - Req 2 and Req 5.
- `docs/plans/2026-06-16/background-auto-update/REPORT.md` - P1 finding 1.

### Root Cause

`runAutoUpdate()` has no knowledge of the persisted config state. It hard-codes `enabled: true` when writing status and writes a fresh enabled config after a successful update. The CLI `auto-update run` command invokes the runner without first reading and preserving the disabled state.

---

## 3. Tasks

### `packages/cli/auto-update-runner.ts` - carry current enabled state through runner writes

1. Open `packages/cli/auto-update-runner.ts`.
2. Locate `export interface AutoUpdateOptions` around lines 24-39.
3. Add an optional field to carry the current config state:
   - **Before**: options include `modes?: InstallMode[];`, `env?: NodeJS.ProcessEnv;`, `packageSource?: PackageSource;`.
   - **After**: add `autoUpdateEnabled?: boolean;` with a short comment explaining that it preserves the persisted scheduler setting while a manual or scheduled run records status.
4. Locate the destructuring at the start of `runAutoUpdate()` around lines 71-79.
5. Destructure `autoUpdateEnabled = true`.
6. Replace each hard-coded status `enabled: true` inside `runAutoUpdate()` with `enabled: autoUpdateEnabled`. This includes:
   - no-op status around lines 96-101,
   - success status around lines 144-149,
   - inner failure status around lines 161-165,
   - lock failure status around lines 177-181.
7. Locate the successful update config write around lines 151-155.
8. Change it so it preserves `autoUpdateEnabled`:
   - **Before**: writes `{ enabled: true, updatedAt: ... }`.
   - **After**: writes `{ enabled: autoUpdateEnabled, updatedAt: ... }`.

### `packages/cli/index.ts` - pass the persisted config state to manual/scheduled runs

1. Open `packages/cli/index.ts`.
2. Locate the `if (action === 'run')` block around lines 411-421.
3. Before calling `runAutoUpdate()`, read the current config:
   - `const config = await readAutoUpdateConfig(toolkitHome);`
4. Add `autoUpdateEnabled: config.enabled` to the `runAutoUpdate({ ... })` options object.
5. Do not block manual `run` when config is disabled. The spec says disabling stops scheduled checks; manual updates must remain usable.

### Output

When done, report back to the coordinator:
- **Files modified**: `packages/cli/auto-update-runner.ts`, `packages/cli/index.ts`
- **Change summary**: how disabled state is preserved across no-op, success, and failure runner paths
- **Test results**: pass/fail for verification commands
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `npm run build`
   - Expected: TypeScript build succeeds.
2. Run: `node --test dist/test/cli/auto-update-runner.test.js`
   - Expected: Existing runner tests pass.
3. Run: `node --test dist/test/cli/interactive-paths.test.js`
   - Expected: Existing install disabled-state tests still pass.

---

## 5. Scope & References

### Allowed Files

- `packages/cli/auto-update-runner.ts` - preserve enabled state in runner config/status writes.
- `packages/cli/index.ts` - pass current config state into `runAutoUpdate()`.

### Forbidden Files

- `test/**` - regression tests are owned by REGTEST workers.
- `packages/cli/installer.ts` - target-scope behavior is owned by FIX-02.
- `dist/**` - generated output; never edit by hand.

### Related Documents

- `docs/plans/2026-06-16/background-auto-update/SPEC.md`
- `docs/plans/2026-06-16/background-auto-update/DESIGN.md`
- `docs/plans/2026-06-16/background-auto-update/REPORT.md`
