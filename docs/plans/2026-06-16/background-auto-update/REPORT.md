# Review Report

- **Spec**: 背景自動更新
- **Date**: 2026-06-16
- **Reviewer**: Codex
- **Verdict**: Needs Work

---

## Verdict

Needs Work

The implementation now registers the scheduled runner through the executable bin wrapper and quotes Windows scheduled-task paths, addressing the prior scheduler-entry findings. A fresh review found two remaining requirement defects: manual one-off runs can flip a disabled auto-update configuration back to enabled, and scheduled runs attempt to update every supported target rather than the targets actually managed by the user's install.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 - Default background updates after install | ⚠️ Partial | `packages/cli/index.ts` L499-L532 preserves disabled config and registers default-enabled scheduling; `packages/cli/index.ts` L411-L421 runs scheduled/manual updates with all `VALID_MODES` | 1 P1 |
| Req 2 - Scheduled update control | ⚠️ Partial | `packages/cli/index.ts` L352-L383 exposes enable/disable; `packages/cli/auto-update-runner.ts` L144-L155 rewrites config during a run; `packages/cli/installer.ts` L269-L337 resolves requested targets | 2 P1 |
| Req 3 - Scope of updates | ⚠️ Partial | `packages/cli/index.ts` L413-L419 passes all supported modes to the runner; `packages/cli/auto-update-runner.ts` L131-L140 re-installs links for supplied modes; `packages/cli/installer.ts` L393-L440 writes target manifests | 1 P1 |
| Req 4 - Overwrite behavior for local modifications | ✅ Complete | `packages/cli/auto-update-runner.ts` L123-L140 calls `syncToolkitHome` and `installLinks`; `packages/cli/installer.ts` L355-L359 and L417-L430 replace managed skill directories | 0 |
| Req 5 - Failure handling and status visibility | ⚠️ Partial | `packages/cli/index.ts` L387-L407 prints configured enabled/disabled state; `packages/cli/auto-update-runner.ts` L158-L183 records runner failures; `packages/cli/auto-update-runner.ts` L152-L155 can make status report enabled after a disabled manual run | 1 P1 |

---

## Findings

### P1 - Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Manual `auto-update run` can re-enable a previously disabled configuration.** The disable command persists `{ enabled: false }`, but the runner writes `{ enabled: true }` after a successful update and also records enabled status on no-op/failure paths. The `auto-update run` command invokes this runner directly, so a user who disabled scheduled background updates can run a one-off update and then see the CLI report auto-update as enabled again. | The spec requires users to be able to turn scheduled background update behavior off and keep manual updating usable after disable. This behavior makes the disabled state only partially reliable and makes CLI status visibility incorrect after a manual run. | `packages/cli/auto-update-runner.ts`; `packages/cli/index.ts` | L96-L101, L144-L155, L161-L165; L411-L421 | Spec implementation deviation | Req 2, Req 5 |
| 2 | **Scheduled update runs target every supported install mode instead of the user's managed install scope.** The `auto-update run` command passes `modes: [...VALID_MODES]` to the runner, and the runner forwards those modes to `installLinks`. `installLinks` resolves all target roots for those modes; on a machine without OpenClaw workspaces, the OpenClaw branch throws, and on machines with other agent directories present it can create/update targets that were never selected during install. | A scheduled daily update can fail before updating the user's actual installed targets, or can expand the update surface beyond the Apollo Toolkit-managed destinations created by the user's install. Default background updates and scheduled update scope are therefore only partially satisfied. | `packages/cli/index.ts`; `packages/cli/auto-update-runner.ts`; `packages/cli/installer.ts` | L413-L419; L131-L140; L304-L315, L393-L440 | Spec implementation deviation | Req 1, Req 2, Req 3 |

---

## Review History

### Round 1 - 2026-06-16

- **Verdict**: Needs Work
- **Issues**: P0:0, P1:2, P2:0, P3:0
- **Key findings**: Scheduled execution was not requirement-complete because registered OS tasks pointed at a non-executing library module, and the Windows `/TR` command shape did not preserve paths with spaces.

### Round 2 - 2026-06-16

- **Verdict**: Needs Work
- **Issues**: P0:0, P1:2, P2:0, P3:0
- **Key findings**: The prior scheduler-entry defects are no longer present. Remaining defects are disabled-state persistence during manual runs and scheduled update scope across install targets.

---

## References

- **Project context files**: `AGENTS.md`, `CLAUDE.md`, `resources/project-architecture/**`
- **Related documents**: `docs/plans/2026-06-16/background-auto-update/SPEC.md`, `docs/plans/2026-06-16/background-auto-update/DESIGN.md`, `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md`, `docs/plans/2026-06-16/background-auto-update/PROMPT.md`
