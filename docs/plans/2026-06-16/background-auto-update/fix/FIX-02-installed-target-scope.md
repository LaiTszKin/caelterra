# Fix Worker Prompt: FIX-02-installed-target-scope

- **Related issue**: REPORT.md P1 finding 2 - Scheduled update runs target every supported install mode instead of the user's managed install scope.

---

## 1. Mission & Rules

### Mission

Make the auto-update runner reinstall only the targets already managed by Apollo Toolkit manifests, without expanding to every supported mode and without failing on absent target families such as OpenClaw.

### Context

Review dimension: spec implementation deviation. This affects Req 1 default background updates, Req 2 scheduled update control, and Req 3 scope of updates. The CLI currently passes `modes: [...VALID_MODES]` into `runAutoUpdate()`, which forwards every mode to `installLinks()`. `installLinks()` resolves all target roots and throws when OpenClaw has no workspace directories.

### Rules

- Follow the Scope in Section 5 - only modify files listed as Allowed.
- Preserve existing install/uninstall behavior for explicit user commands.
- Do not update non-Apollo user skills; target selection must be based on existing Apollo Toolkit manifests.
- Do not add new dependencies.
- Workers are leaf nodes - do not spawn sub-workers.

---

## 2. Context

### Input Files

- `packages/cli/index.ts` - read `auto-update run` around lines 411-421.
- `packages/cli/auto-update-runner.ts` - read how `modes` are used for `syncToolkitHome()` and `installLinks()` around lines 71-157.
- `packages/cli/installer.ts` - read `VALID_MODES`, `getTargetRoots()`, `readManifest()`, and `installLinks()` around lines 23-26, 110-117, 269-337, and 377-443.
- `packages/cli/types.ts` - read `InstallMode`, `InstallTarget`, and `ManifestData`.
- `docs/plans/2026-06-16/background-auto-update/SPEC.md` - Req 1, Req 2, Req 3.
- `docs/plans/2026-06-16/background-auto-update/REPORT.md` - P1 finding 2.

### Root Cause

The runner receives every supported mode instead of discovering which target roots are already Apollo Toolkit-managed. Because `getTargetRoots([...VALID_MODES])` includes modes the user may never have installed, the runner can fail or create/update target directories outside the user's selected install scope.

---

## 3. Tasks

### `packages/cli/installer.ts` - expose managed target discovery

1. Open `packages/cli/installer.ts`.
2. Add an exported helper near `getUninstallTargetRoots()` or near `listAllKnownSkillNames()`:
   - Suggested signature: `export async function getManagedInstallTargets(modes: string[] = [...VALID_MODES], env: NodeJS.ProcessEnv = process.env): Promise<InstallTarget[]>`.
3. The helper must:
   - normalize candidate modes,
   - call `getTargetRoots([mode], env)` per mode inside a `try/catch`,
   - ignore modes whose roots cannot be resolved, matching `getUninstallTargetRoots()` best-effort behavior,
   - read each candidate root's `.apollo-toolkit-manifest.json` with `readManifest(target.root!)`,
   - include only targets with a manifest,
   - return the resulting `InstallTarget[]`.
4. Do not change `getTargetRoots()` throwing behavior for explicit install/update calls.

### `packages/cli/auto-update-runner.ts` - use managed targets instead of all mode roots

1. Open `packages/cli/auto-update-runner.ts`.
2. Update imports from `./installer.js`:
   - Add `getManagedInstallTargets`.
   - Keep `syncToolkitHome`, `installLinks`, and `listSkillNames`.
3. In `runAutoUpdate()`, before `syncToolkitHome()` mutates `toolkitHome`, compute the existing managed targets:
   - `const managedTargets = modes.length > 0 ? await getManagedInstallTargets(modes, env) : [];`
4. Use a derived mode list for staging and link installation:
   - Suggested name: `const managedModes = [...new Set(managedTargets.map((target) => target.id))];`
5. Pass `managedModes` to `syncToolkitHome({ ..., modes: managedModes })` so codex-only content is staged only when codex is actually managed.
6. Replace the `if (modes.length > 0)` guard around `installLinks()` with `if (managedModes.length > 0)`.
7. Pass `managedModes` to `listSkillNames()` and `installLinks()`.
8. This issue does not require preserving per-target symlink vs copy mode. Keep current `linkMode: 'copy'` unless a regression fails for an existing expectation.

### `packages/cli/index.ts` - stop passing all modes directly to runner

1. Open `packages/cli/index.ts`.
2. Locate the `runAutoUpdate({ ... })` call in the `if (action === 'run')` block.
3. Keep passing `modes: [...VALID_MODES]` only as a candidate scan list if `runAutoUpdate()` now filters it through `getManagedInstallTargets()`. If you choose to move target discovery into `index.ts` instead, the runner must still receive only manifest-backed modes.
4. Ensure the `autoUpdateEnabled` value added by FIX-01 remains present in the options object.

### Output

When done, report back to the coordinator:
- **Files modified**: `packages/cli/installer.ts`, `packages/cli/auto-update-runner.ts`, and possibly `packages/cli/index.ts`
- **Change summary**: how managed target discovery avoids absent OpenClaw failures and unselected target writes
- **Test results**: pass/fail for verification commands
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `npm run build`
   - Expected: TypeScript build succeeds.
2. Run: `node --test dist/test/cli/auto-update-runner.test.js`
   - Expected: Existing runner tests pass.
3. Run: `node --test dist/test/installer.test.js`
   - Expected: Installer manifest and target-root tests pass.

---

## 5. Scope & References

### Allowed Files

- `packages/cli/installer.ts` - add manifest-backed managed target discovery.
- `packages/cli/auto-update-runner.ts` - filter runner target scope before sync/install.
- `packages/cli/index.ts` - preserve runner call compatibility after FIX-01.
- `packages/cli/types.ts` - only if a type export is needed for the helper.

### Forbidden Files

- `test/**` - regression tests are owned by REGTEST workers.
- `dist/**` - generated output; never edit by hand.

### Related Documents

- `docs/plans/2026-06-16/background-auto-update/SPEC.md`
- `docs/plans/2026-06-16/background-auto-update/DESIGN.md`
- `docs/plans/2026-06-16/background-auto-update/REPORT.md`
