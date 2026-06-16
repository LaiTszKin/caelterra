# External Reference: OS Scheduled Tasks

## Purpose

Register, unregister, and inspect daily background jobs that invoke Apollo Toolkit's one-shot skill update runner.

## External Methods

### macOS launchd user agent

- **Purpose**: Run a per-user scheduled background task without requiring a long-running Node.js process.
- **Reference**: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
- **Required parameters**
  - `Label: string` - stable job identifier.
  - `ProgramArguments: string[]` - command and arguments for the runner.
  - `StartCalendarInterval: object` - daily schedule.
  - `StandardOutPath: string` and `StandardErrorPath: string` - observable logs.

### Linux systemd user timer

- **Purpose**: Run a per-user scheduled task with timer/service units.
- **Reference**: https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html
- **Required parameters**
  - `.service ExecStart: string` - command line for the runner.
  - `.timer OnCalendar: string` - daily schedule.
  - `.timer Persistent: boolean` - catch missed runs where available.
  - Unit names - stable Apollo Toolkit identifiers.

### Windows Task Scheduler via schtasks

- **Purpose**: Register a daily per-user scheduled task from CLI.
- **Reference**: https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create
- **Required parameters**
  - `/TN string` - task name.
  - `/TR string` - command line for the runner.
  - `/SC DAILY` - daily schedule.
  - `/ST HH:mm` - start time.

## Design Obligations

- Registration failure must be visible to the CLI caller and persisted to update status.
- Unregister must be idempotent: disabling twice should leave the system disabled without corrupting state.
- Scheduled runs must write logs or status even when the update check fails.
- Platform-specific task definitions should be generated from one normalized schedule configuration.
