# Checklist: 背景自動更新

- **Date**: 2026-06-16
- **Feature**: 背景自動更新
- **Source SPEC**: `docs/plans/2026-06-16/background-auto-update/SPEC.md`

> **Purpose:** Verification strategy — defines how to confirm that the implementation satisfies the SPEC.md business requirements. Produced using the `test-case-strategy` skill.

---

## Behavior-to-Test Checklist

Map each BDD requirement from SPEC.md to one or more tests:

| ID | Observable Behavior | SPEC Requirement | Corresponding Test | Result |
|---|---|---|---|---|
| CL-01 | Install defaults auto-update to enabled when the user has not disabled it. | Req 1 | IT-01 install flow creates enabled config and scheduler registration request. | `[pending]` |
| CL-02 | Existing disabled state is preserved across later installs. | Req 1, Req 2 | IT-02 install flow does not re-enable disabled config. | `[pending]` |
| CL-03 | Daily scheduler registration is requested for macOS, Linux, and Windows command shapes. | Req 2 | UT-01 scheduler adapter command generation; IT-03 enable command with mocked platform commands. | `[pending]` |
| CL-04 | CLI can enable, disable, and query auto-update status. | Req 2, Req 5 | UT-02 parser coverage; IT-04 CLI command flow status output. | `[pending]` |
| CL-05 | Scheduler creation or execution failures are visible and persisted. | Req 2, Req 5 | IT-05 mocked command failure records failed status and returns expected code. | `[pending]` |
| CL-06 | Background runner updates only managed Apollo Toolkit skills and never invokes CLI package self-update. | Req 3 | IT-06 runner with fake package source and target manifests; unit assertion no `npm install -g` path. | `[pending]` |
| CL-07 | Local modified managed skill content is overwritten by latest package content. | Req 4 | IT-07 runner fixture modifies installed skill then verifies latest content replaces it. | `[pending]` |
| CL-08 | Update failure does not corrupt previous installed skills. | Req 5 | IT-08 extraction/sync failure preserves previous toolkit home and target skill content. | `[pending]` |
| CL-09 | Concurrent runner invocation does not perform overlapping mutations. | Req 5 | IT-09 lock-file test with fake delayed runner. | `[pending]` |

---

## Hardening Checklist

- [ ] Regression tests for bug-prone / high-risk behavior: scheduler failure visibility, disabled-state preservation, force overwrite behavior.
- [ ] Unit drift checks for non-trivial logic: parser actions, platform command generation, config/status read/write defaults.
- [ ] Property-based coverage for business logic: N/A; schedule/config state space is small and better covered by table-driven unit tests.
- [ ] External services mocked / faked: npm package extraction, platform scheduler commands, clock, filesystem home directories.
- [ ] Adversarial cases for abuse paths: unsafe paths, missing toolkit home, malformed config/status JSON, missing scheduler binary.
- [ ] Authorization, idempotency, and concurrency risks assessed: per-user tasks only, enable/disable idempotency, lock-file runner protection.
- [ ] Assertions verify outcomes and side-effects, not just command exit codes.
- [ ] Fixtures are reproducible: fixed temp homes, fixed package versions, fixed timestamps where status output is asserted.

---

## E2E / Integration Decisions

| Flow / Risk | Test Level | Rationale |
|---|---|---|
| Parser and help output for `auto-update` commands | Unit + CLI integration | Public command behavior must remain stable and help-visible. |
| Install default enablement | Integration | Requires collaboration between install flow, config persistence, and scheduler adapter. |
| Platform scheduler command shapes | Unit | Real OS schedulers should not be mutated in tests; command generation is the stable oracle. |
| Manual enable/disable/status commands | Integration | Verifies parser, controller, persistence, and output formatting together. |
| Runner package extraction and skill overwrite | Integration | Requires filesystem fixtures and existing installer behavior. |
| npm registry access | Mocked integration | Network must be mocked for deterministic tests. |
| Real OS scheduled execution | Manual smoke / documented QA | CI should not create user launchd/systemd/schtasks entries. |
| Concurrent runner protection | Integration | Locking is a cross-module filesystem behavior. |

---

## Test IDs

| ID | Target Scope | Verification Oracle |
|---|---|---|
| UT-01 | `background-task-scheduler` | For each platform, generated registration/removal/status commands contain stable task names, daily cadence, runner command, and log/status paths. |
| UT-02 | `AutoUpdateArgsParser` | `enable`, `disable`, `status`, `run`, and `--help` parse into expected command structures; invalid actions fail with existing parser error style. |
| IT-01 | Install flow | Fresh install writes enabled config and calls scheduler registration without changing existing skill install assertions. |
| IT-02 | Install flow | Disabled config before install remains disabled after install and scheduler registration is not requested. |
| IT-03 | Enable command | Mocked platform command success persists enabled state and reports enabled status. |
| IT-04 | Disable/status command | Disable removes scheduled task, persists disabled state, and status reports disabled. |
| IT-05 | Scheduler failure | Mocked platform command failure persists failure status, prints visible warning/error, and does not claim enabled task success. |
| IT-06 | Runner scope | Fake extracted package refreshes managed skills through installer path and does not call CLI package update. |
| IT-07 | Force overwrite | Modified managed skill fixture is replaced by latest extracted skill contents. |
| IT-08 | Atomic failure | Failed extraction or validation leaves previous toolkit home and target skill directories intact. |
| IT-09 | Concurrency | Second runner detects existing lock and exits with recorded skipped/failed status without mutating files. |

---

## References

- **Designed code file paths**:
  - `packages/cli/index.ts`
  - `packages/cli/help-text-builder.ts`
  - `packages/cli/parsers/types.ts`
  - `packages/cli/parsers/parser-utils.ts`
  - `packages/cli/installer.ts`
  - `packages/cli/updater.ts`
  - `packages/tool-utils/platform-adapter.ts`
  - `test/cli/*.test.js`
  - `test/installer.test.js`
  - `test/updater-extras.test.js`
- **Project context files**:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `docs/plans/2026-06-16/background-auto-update/DESIGN.md`
  - `docs/plans/2026-06-16/background-auto-update/SPEC.md`
- **Related documents**:
  - `docs/plans/2026-06-16/background-auto-update/references/os-scheduled-tasks.md`
  - `docs/plans/2026-06-16/background-auto-update/references/npm-package-extraction.md`
  - `docs/plans/2026-06-16/background-auto-update/references/node-process-execution.md`
