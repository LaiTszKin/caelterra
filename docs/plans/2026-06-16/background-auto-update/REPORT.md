# Review Report

- **Spec**: 背景自動更新
- **Date**: 2026-06-16
- **Reviewer**: Codex
- **Verdict**: Needs Work

---

## Verdict

Needs Work

The implementation adds config, scheduler, runner, CLI controls, package extraction, and tests for the planned background auto-update flow. However, the scheduled command is registered against the CLI library module rather than the executable bin wrapper, so OS-triggered daily checks can exit successfully without running the auto-update action. A Windows scheduler command-shape defect also leaves the daily task unable to run in common installed paths that contain spaces.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 - Default background updates after install | ⚠️ Partial | `packages/cli/index.ts` L509-L527 writes default-enabled config and registers a task; `packages/cli/auto-update-scheduler.ts` L104-L106 builds the registered runner command | 1 P1 |
| Req 2 - Scheduled update control | ⚠️ Partial | `packages/cli/index.ts` L347-L427 exposes enable/disable/status/run; `packages/cli/auto-update-scheduler.ts` L211-L291 registers daily platform tasks | 2 P1 |
| Req 3 - Scope of updates | ✅ Complete | `packages/cli/auto-update-runner.ts` L91-L157 resolves/extracts package contents, syncs toolkit home, and re-installs managed targets without invoking CLI self-update | 0 |
| Req 4 - Overwrite behavior for local modifications | ✅ Complete | `packages/cli/auto-update-runner.ts` L123-L140 calls `syncToolkitHome` and `installLinks` using forceful managed-content replacement semantics | 0 |
| Req 5 - Failure handling and status visibility | ✅ Complete | `packages/cli/auto-update-runner.ts` L158-L183 records failures without throwing through normal CLI work; `packages/cli/index.ts` L382-L403 prints enabled/disabled and scheduler status | 0 |

---

## Findings

### P1 - Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Scheduled task invokes the CLI library module, which does not execute `run()` when called as a script.** The install and enable flows set `cliPath = fileURLToPath(import.meta.url)` from `packages/cli/index.ts`, then schedule `[nodePath, cliPath, 'auto-update', 'run', '--home', toolkitHome]`. The module exports `run()` but has no top-level invocation; the actual executable wrapper is `dist/bin/apollo-toolkit.js`, which calls `run(process.argv.slice(2), ...)`. Directly running `node packages/cli/dist/index.js auto-update status --home /tmp/apltkk-test-home` exits 0 with no output, confirming the scheduled target does not dispatch the CLI command. | Daily OS scheduler executions can report process success while performing no update check, so default background updates and scheduled updates are only partially satisfied. | `packages/cli/index.ts` | L349-L351, L519-L521 | Spec implementation deviation | Req 1, Req 2 |
| 2 | **Windows scheduled task command is joined without quoting argument paths.** The Windows registration path uses `options.runnerCommand.join(' ')` for `/TR`, while `buildRunnerCommand()` includes node path, CLI path, and toolkit home path. Installed paths under `Program Files` or user home paths such as `C:\Users\Jane Doe\.apollo-toolkit` are split by `schtasks` command parsing. DESIGN.md explicitly lists quoted runner command handling as non-negotiable for Windows. | On Windows installs with spaces in Node, CLI, or home paths, the daily task is registered with a broken action and cannot execute the background update check. | `packages/cli/auto-update-scheduler.ts` | L274-L281 | Spec implementation deviation | Req 2 |

---

## Review History

### Round 1 - 2026-06-16

- **Verdict**: Needs Work
- **Issues**: P0:0, P1:2, P2:0, P3:0
- **Key findings**: Scheduled execution is not yet requirement-complete because registered OS tasks point at a non-executing library module, and the Windows `/TR` command shape does not preserve paths with spaces.

---

## References

- **Project context files**: `AGENTS.md`, `CLAUDE.md`, `resources/project-architecture/**`
- **Related documents**: `docs/plans/2026-06-16/background-auto-update/SPEC.md`, `docs/plans/2026-06-16/background-auto-update/DESIGN.md`, `docs/plans/2026-06-16/background-auto-update/CHECKLIST.md`, `docs/plans/2026-06-16/background-auto-update/PROMPT.md`
