# External Reference: Node Process Execution

## Purpose

Use Node.js process execution only where the design must invoke platform tools such as `launchctl`, `systemctl`, or `schtasks`.

## External API: `child_process.spawn`

- **Source**: https://nodejs.org/api/child_process.html
- **Purpose**: Start platform commands with explicit arguments and captured output.

## Required Parameters

- `command: string` - executable name.
- `args: string[]` - arguments without shell interpolation where possible.
- `options.env: object` - environment inherited or normalized for platform-specific calls.
- `options.stdio: array | string` - capture stdout/stderr for status and diagnostics.

## Design Obligations

- Prefer argument arrays over shell-constructed strings.
- Capture stderr and non-zero exit codes in status records.
- Keep command execution behind a small adapter so tests can fake platform calls.
- Reuse the repository's existing `execCommand` pattern where appropriate, but avoid coupling scheduler commands to npm package self-update behavior.
