# Validate Skill Frontmatter Tool

CLI tool for validating SKILL.md frontmatter format and required fields.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Frontmatter validation must be based on the canonical SKILL.md schema
