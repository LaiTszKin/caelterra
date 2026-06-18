# Apollo Toolkit CLI

CLI command management — argument parsing, skill installation/uninstallation, tool routing, update checking.

## MODULE FILE LIST

- `bin/apollo-toolkit.ts` — CLI entry point
- `src/` — All source files (help builder, arg parser, installer, update checker)
- `package.json` — Module manifest and scripts

## RULES SHOULD NOT BE VIOLATED

- Do not add runtime dependencies to the CLI core; tool-specific logic belongs in `packages/tools/`
- The `install` path must validate skill ownership before writing to any target directory
- `--help` output must be derived from tool registration metadata, not hardcoded
