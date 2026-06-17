# Review Threads Tool

CLI tool for managing review discussion threads.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Thread state must be persisted to disk, not kept in memory
