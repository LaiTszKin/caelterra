# Validate OpenAI Agent Config Tool

CLI tool for validating agents/openai.yaml configuration files.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Validation rules must be derived from the OpenAI agents SDK schema
