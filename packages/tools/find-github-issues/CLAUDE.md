# Find GitHub Issues Tool

CLI tool for searching and listing GitHub issues.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Must use `gh` CLI for GitHub API access, not direct HTTP calls
