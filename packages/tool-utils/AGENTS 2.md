# Apollo Toolkit Tool Utilities

Shared tool utilities — log parsing, skill discovery, common helpers used across CLI and tools.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest and scripts

## RULES SHOULD NOT BE VIOLATED

- Must remain dependency-free (no external packages beyond project monorepo)
- Utility functions must be pure where possible; side effects should be clearly documented
- Breaking changes to exported APIs require coordination with all consuming packages
