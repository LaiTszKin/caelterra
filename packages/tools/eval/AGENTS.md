# Eval Tool

LLM-as-Judge skill evaluation — question loading, execution, scoring, and report generation.

## MODULE FILE LIST

- `src/` — All source files (executor, scorer, question loader, reporter)
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Judge model and evaluated model contexts must remain strictly isolated
- External API calls must be mockable for testing
