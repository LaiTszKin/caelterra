# Apollo Toolkit Tool Registry

Unified tool registration, lookup, and dispatch — maps tool names to their entry points and handles runtime resolution.

## MODULE FILE LIST

- `src/` — All source files (registry core, formatter, registration utilities)
- `package.json` — Module manifest and scripts

## RULES SHOULD NOT BE VIOLATED

- Tools must register via the public `registerTool()` API, not by modifying internal registry state
- The registry must not import tool-specific implementation details
- All tool metadata must be serializable (no functions in metadata objects)
