# Design: 背景自動更新

- **Date**: 2026-06-16
- **Feature**: 背景自動更新
- **Source SPEC**: `docs/plans/2026-06-16/background-auto-update/SPEC.md`

> **Purpose:** Technical design document — defines architecture, external dependencies, data flow, invariants, and trade-offs. Provides technical decision basis for the `plan` phase's PROMPT.md.

---

## 1. Research Summary

### 1.1 Technical Feasibility

| Requirement | Feasibility | Risk |
|---|---|---|
| Req 1 | Feasible | Requires install flow to register default-on state without breaking existing install prompts. |
| Req 2 | Feasible | Cross-platform task registration is medium risk because macOS, Linux, and Windows use different schedulers. |
| Req 3 | Feasible | Existing installer already separates toolkit home syncing from CLI package updates. |
| Req 4 | Feasible | Existing `syncToolkitHome` and `installLinks` already use forceful replacement semantics. |
| Req 5 | Feasible | Requires persistent status/log records; no external blocker found. |

**Overall assessment**: All feasible. No blocking platform or licensing issue found, but scheduler behavior must be adapter-based and fully testable with mocked platform commands.

### 1.2 Existing Reference Implementations

| Source | Reusable Design Patterns |
|---|---|
| macOS launchd user agents | Use a per-user job definition with a stable label, command arguments, calendar interval, and stdout/stderr paths. |
| systemd user timers | Split scheduled trigger from service execution; use `OnCalendar` for the daily cadence and explicit service command for the runner. |
| Windows `schtasks /Create` | Register a named per-user daily task whose action invokes the CLI runner command. |
| npm `pacote` | Resolve and extract a published npm package to a temporary directory without updating the globally installed CLI. |
| Existing Apollo Toolkit installer | Reuse managed toolkit home and manifest ownership boundaries rather than creating a second installer path. |

### 1.3 Tech Stack Compatibility

| Candidate | Repo Dependency Compatibility | License | Decision |
|---|---|---|---|
| OS-native schedulers (`launchd`, `systemd`, `schtasks`) | Compatible with Node CLI through child process adapters; no runtime package dependency. | Platform-provided | Recommended for scheduled execution. |
| `pacote` | Compatible with Node >=22.5.0 and npm package workflows; exact transitive footprint must be confirmed before adding. | npm open-source package; verify SPDX before dependency addition. | Recommended for package extraction. |
| `node-cron` | Technically compatible but requires a long-running Node process, which the product does not otherwise run. | ISC | Rejected. |
| Shelling out to `npm install -g` | Already used for interactive CLI package self-update, but violates SPEC out-of-scope rule for CLI self-update. | npm CLI | Rejected for background skill updates. |

---

## 2. Architecture Overview

### 2.1 Module List

| Module Key | Responsibility (one sentence) | Owned Artifacts (types, tables, queues) |
|---|---|---|
| `cli-dispatch` | Existing CLI command parsing and install/uninstall orchestration. | Parsed argument types, install result output. |
| `installer-core` | Existing managed toolkit home sync and skill installation engine. | `.apollo-toolkit-manifest.json`, `.apollo-toolkit-install.json`. |
| `background-update-controller` | New CLI command surface for status, enable, disable, and manual background-update execution. | Parsed background-update command types. |
| `background-task-scheduler` | New cross-platform registration/removal/status adapter for daily OS scheduled tasks. | Platform task definitions, scheduler status result. |
| `skill-update-runner` | New one-shot update runner that fetches latest skills, syncs toolkit home, updates targets, and records result. | Update status JSON, log files, temp extraction directory. |
| `package-source` | New small package extraction boundary around `pacote`. | Extracted package temp directory metadata. |

### 2.2 Boundaries

- **Entry points**: CLI install flow, CLI `auto-update` commands, OS scheduled task invoking CLI runner.
- **Trust boundary**: Network package contents from npm registry cross into local managed skill directories only after extraction and basic content validation.
- **External → Internal**: OS scheduler → `apltk auto-update run` → `skill-update-runner` → `package-source` → `installer-core`.

### 2.3 Target vs Baseline

| | Baseline (current) | Target (after change) |
|---|---|---|
| Update ownership | `packages/cli/updater.ts` checks and optionally updates the CLI package interactively during install. | CLI package update remains separate; background skill update manages only toolkit home and installed skills. |
| Install behavior | Install syncs toolkit home and target skills, then prints summary. | Install also ensures background auto-update is enabled by default unless previously disabled. |
| CLI controls | No background update command surface. | CLI exposes enable, disable, status, and run commands for background skill updates. |
| Scheduling | No OS-level scheduled task. | Per-user daily scheduled task exists on supported platforms while enabled. |

---

## 3. Interaction Design

### 3.1 Interaction Anchors (`INT-###`)

| ID | Intent (when this coupling matters) | Caller → Callee | Coupling Type | Information / State Crossing | Failure Propagation Expectation |
|---|---|---|---|---|---|
| `INT-001` | Default enablement after install | `run` install flow → `background-update-controller` | sync call | install context, toolkit home, selected modes | Registration failure is reported in install output and persisted, but install does not roll back installed skills. |
| `INT-002` | User toggles auto-update | CLI parser → `background-update-controller` → `background-task-scheduler` | sync call | requested action, persisted enabled flag | Enable/disable returns non-zero on scheduler failure; status remains observable. |
| `INT-003` | Scheduled daily update | OS scheduler → CLI runner → `skill-update-runner` | process invocation | toolkit home, package name, target manifests | Runner records failure and exits non-zero for scheduler logs; no interactive prompt. |
| `INT-004` | Refresh managed skills only | `skill-update-runner` → `package-source` → `installer-core` | sync call | extracted package path, version, target manifests | Package or sync failure preserves previous install and records error. |
| `INT-005` | Status visibility | CLI status command → persisted update status | sync call | enabled flag, last run, last error | Missing status file is interpreted as default enabled with no completed run. |

### 3.2 Ordering / Concurrency Constraints (Design Level)

- Only one update runner may mutate the same toolkit home at a time; use a lock file under Apollo Toolkit home before extraction/sync.
- Package extraction must complete in a temporary directory before replacing toolkit home.
- Disable should prevent future scheduled runs; it does not need to interrupt a currently running update, but status must show the latest completed result.

### 3.3 Requirement Links (Coarse-Grained Ordering)

- **Req 1 cluster**: `INT-001` → `INT-005`
- **Req 2 cluster**: `INT-002` → `INT-003` → `INT-005`
- **Req 3 cluster**: `INT-003` → `INT-004`
- **Req 4 cluster**: `INT-004`
- **Req 5 cluster**: `INT-003` → `INT-005`

---

## 4. External Dependencies

### 4.1 Dependency Overview

| Dependency | Purpose | Official Documentation |
|---|---|---|
| macOS launchd | Register daily user background update task. | https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html |
| systemd timers | Register daily Linux user background update task. | https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html |
| Windows schtasks | Register daily Windows user background update task. | https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create |
| `pacote` | Fetch and extract latest npm package contents without updating CLI. | https://github.com/npm/pacote |
| Node `child_process.spawn` | Invoke platform scheduler commands. | https://nodejs.org/api/child_process.html |

### 4.2 OS Scheduled Tasks

#### Factual Basis

| Required Capability | Documentation Location |
|---|---|
| macOS per-user scheduled jobs | launchd job documentation. |
| Linux calendar timers | systemd timer documentation. |
| Windows daily scheduled task creation | Microsoft `schtasks /Create` documentation. |

**Version assumption**: Platform-provided, no npm package version.

#### Limits and Failure Modes

| Category | Documented Fact | Coding Obligation |
|---|---|---|
| Platform availability | The three OS families expose different scheduler surfaces. | Use a platform adapter and test each command shape with fakes. |
| Error / degradation modes | Registration can fail due to missing service manager, permissions, or unavailable command. | Surface failure in CLI result and persisted status; do not silently mark enabled. |

#### Security and Keys

| Concern | Constraint |
|---|---|
| Authentication / Scope | Per-user tasks only; do not require elevated/system-level task registration. |
| Key Name | None. |

#### Integration Anchors (`EXT-###`)

| ID | Integration Surface (as named in docs) | Non-Negotiable Handling | Prohibited Assumptions |
|---|---|---|---|
| `EXT-001` | launchd user agent plist | Stable label, logs, daily calendar interval. | Do not assume root privileges. |
| `EXT-002` | systemd user timer/service | Separate timer and service units; explicit enable/disable/status. | Do not assume all Linux systems have systemd user services available. |
| `EXT-003` | `schtasks /Create` and `/Delete` | Stable task name, daily schedule, quoted runner command. | Do not assume shell quoting is portable without tests. |

### 4.3 npm Package Extraction

#### Factual Basis

| Required Capability | Documentation Location |
|---|---|
| Resolve package metadata | `pacote.manifest` reference. |
| Extract package contents | `pacote.extract` reference. |

**Version assumption**: Add a pinned semver range after confirming exact license and Node compatibility during implementation.

#### Limits and Failure Modes

| Category | Documented Fact | Coding Obligation |
|---|---|---|
| Network / registry | Package resolution and extraction can fail. | Treat as non-blocking background update failure and persist error. |
| Partial extraction | Extraction writes files to destination. | Always extract to temp dir and validate before sync. |

#### Security and Keys

| Concern | Constraint |
|---|---|
| Authentication / Scope | Public npm package access by default. |
| Key Name | None unless users configure private registry credentials through npm environment. |

#### Integration Anchors (`EXT-004`)

| ID | Integration Surface (as named in docs) | Non-Negotiable Handling | Prohibited Assumptions |
|---|---|---|---|
| `EXT-004` | `pacote.extract` | Temp dir extraction, validation, cleanup. | Do not extract directly over existing toolkit home. |

---

## 5. Data Persistence

| Resource | Typical Readers / Writers (module key) | Consistency Expectation |
|---|---|---|
| Auto-update config JSON under toolkit home | Read by `background-update-controller`; written by enable/disable/install flow. | Atomic writes; missing config means default enabled. |
| Auto-update status JSON under toolkit home | Read by status command; written by scheduler registration and runner. | Last writer wins with timestamp; failed runs must preserve previous successful version metadata if available. |
| Update log files under toolkit home | Read by users/support; written by `skill-update-runner` and scheduler adapters. | Append or replace latest log consistently; never required for functional success. |
| Lock file under toolkit home | Read/write by `skill-update-runner`. | Prevent concurrent mutations of toolkit home and target skill directories. |
| Existing install manifests | Read/write by `installer-core`. | Continue to represent Apollo Toolkit-managed skill ownership. |

---

## 6. System Invariants

| Invariant | How Architecture Could Violate It | Symptoms of Violation |
|---|---|---|
| Background updates never update the CLI package. | Reusing `checkForPackageUpdate` or `npm install -g` inside the runner. | CLI version changes after background task. |
| Only Apollo Toolkit-managed skills are overwritten. | Runner writes directly into arbitrary target directories without manifest/target ownership. | Non-Apollo user skills disappear or change. |
| Disabled auto-update stays disabled across installs/runs. | Install flow always rewrites enabled config. | User disables feature, then later install silently re-enables it. |
| Scheduler failure is observable. | Adapter swallows command failures and writes enabled status. | `status` reports enabled while no task exists. |
| Updates are atomic from user perspective. | Runner overwrites toolkit home before package extraction/validation completes. | Partial skill directories or broken target installs. |

---

## 7. Technical Trade-offs

| Decision | Rejected Alternatives | Lock-in Effect on Implementation |
|---|---|---|
| Use OS-native schedulers instead of a long-running Node daemon. | `node-cron`, background Node service. | Requires platform adapters but avoids keeping a process alive. |
| Use `pacote` to fetch package contents without CLI self-update. | `npm install -g`, `npm pack` shell commands. | Adds one dependency but keeps package extraction testable and in-process. |
| Store config/status under Apollo Toolkit home. | Global OS-specific config directories only. | Keeps state near existing managed artifacts and respects `APOLLO_TOOLKIT_HOME`. |
| Add an `auto-update` command surface instead of overloading `install` flags. | More install flags only. | Adds parser/help work but gives users clear status/enable/disable/run controls. |
| Preserve existing force-overwrite install semantics. | Local diff/merge/protect prompts. | Matches SPEC and avoids complex conflict resolution. |

---

## 8. Design-Time Refactoring

| Finding | Affected Module | Tier (T1/T2/T3) | Disposition (Refactored / Scheduled / Deferred) | Test Evidence |
|---|---|---|---|---|
| `parseArguments` dispatch table is already marked as a high-collision zone; adding another command parser there increases risk. | `packages/cli/index.ts`, `packages/cli/parsers/*` | T2 | Scheduled: add a dedicated `AutoUpdateArgsParser` and keep parser tests alongside existing parser tests. | `test/cli/dispatch-table.test.js`, new auto-update parser tests. |
| `checkForPackageUpdate` mixes npm package update policy with process execution helper exports. | `packages/cli/updater.ts` | T2 | Deferred: reuse only command execution pattern or extract a generic process adapter during implementation if duplication appears. | Existing `test/updater-extras.test.js`; new scheduler adapter tests. |
| `installLinks` writes manifest version as existing or `unknown`, not necessarily the newly staged package version. | `packages/cli/installer.ts` | T2 | Scheduled: runner should pass the resolved package version through install/sync flow so status and manifests remain meaningful. | Existing `test/installer.test.js`; new runner integration tests. |

---

## 9. Architecture Diff

- Overlay path: `docs/plans/2026-06-16/background-auto-update/architecture_diff/`
- Validation: `apltk architecture validate --spec docs/plans/2026-06-16/background-auto-update` returned `atlas: OK`.
- Baseline drift note: affected baseline feature `cli-dispatch` exists and matches the surveyed CLI package responsibilities.
- Added C4 component-level modules under `cli-dispatch`:
  - `background-update-controller`
  - `background-task-scheduler`
  - `skill-update-runner`

---

## 10. References

- **Designed code file paths**:
  - `packages/cli/index.ts`
  - `packages/cli/help-text-builder.ts`
  - `packages/cli/parsers/types.ts`
  - `packages/cli/parsers/parser-utils.ts`
  - `packages/cli/parsers/install-parser.ts`
  - `packages/cli/installer.ts`
  - `packages/cli/updater.ts`
  - `packages/tool-utils/platform-adapter.ts`
  - `test/cli/*.test.js`
  - `test/installer.test.js`
  - `test/updater-extras.test.js`
- **Project context files**:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `resources/project-architecture/atlas/features/cli-dispatch.yaml`
  - `docs/plans/2026-06-16/background-auto-update/architecture_diff/atlas/features/cli-dispatch.yaml`
- **Related documents**:
  - `docs/plans/2026-06-16/background-auto-update/SPEC.md`
  - `docs/plans/2026-06-16/background-auto-update/references/os-scheduled-tasks.md`
  - `docs/plans/2026-06-16/background-auto-update/references/npm-package-extraction.md`
  - `docs/plans/2026-06-16/background-auto-update/references/node-process-execution.md`
