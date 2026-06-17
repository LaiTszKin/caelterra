# Apollo Toolkit Terminal UI

Interactive terminal UI components — banners, prompts, progress indicators, and color support.

## MODULE FILE LIST

- `src/` — All source files (banner, prompt, terminal detection)
- `package.json` — Module manifest and scripts

## RULES SHOULD NOT BE VIOLATED

- UI components must degrade gracefully in non-interactive (CI) environments
- Do not add heavy UI frameworks; keep with lightweight inquirer/chalk patterns
- `isInteractive` and `supportsColor` checks must be accurate for CI, pipe, and TTY modes
