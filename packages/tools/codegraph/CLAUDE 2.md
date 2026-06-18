# CodeGraph Tool

Codebase exploration tool — init, index, sync, status, query, files, callers, callees, impact, node, context.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- The codegraph database (`.codegraph/codegraph.db`) must never be manually edited
- `init --index` must be run before query subcommands
