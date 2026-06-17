# Create Review Report Tool

CLI tool for generating structured review reports from spec analysis.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Reports must be written to the spec's directory, not to arbitrary paths
