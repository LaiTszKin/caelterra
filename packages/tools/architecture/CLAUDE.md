# Architecture Tool

CLI tool for managing the project architecture atlas (features, submodules, edges, rendering).

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Atlas mutations must produce undo snapshots before writing
