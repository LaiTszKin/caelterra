# Create Specs Tool

CLI tool for generating specification documents from user requirements.

## MODULE FILE LIST

- `src/` — All source files
- `package.json` — Module manifest

## RULES SHOULD NOT BE VIOLATED

- Must not import from other tool packages; use `@laitszkin/tool-utils` for shared helpers
- Generated specs must follow the established frontmatter format and file layout
