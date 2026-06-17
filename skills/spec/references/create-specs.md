# apltk create-specs — SPEC.md Template Generator

## Purpose

Creates SPEC.md files from the template under `docs/plans/`.

## Usage

Before using this tool, run `apltk create-specs --help` and follow the live CLI guidance.

```
apltk create-specs <feature_name> [options]
```

## Flags

| Flag                           | Effect                                              |
| ------------------------------ | --------------------------------------------------- |
| `--change-name, --slug <name>` | Directory name (defaults to slugified feature_name) |
| `--batch-name <name>`          | Batch directory name (do not include date prefix)   |
| `--output-dir <dir>`           | Output base directory (default `docs/plans`)        |
| `--template-dir <dir>`         | Template directory                                  |
| `--force`                      | Overwrite existing files                            |

## Output Structure

```
Single spec:  docs/plans/<today>/<change-name>/SPEC.md
Batch:        docs/plans/<today>/<batch-name>/<change-name>/SPEC.md
```

## Notes

- The tool automatically creates the `<today>` date directory
- Batch name should not include a date prefix
- DESIGN.md and CHECKLIST.md are produced by the `design` skill
- PROMPT.md is produced by the `plan` skill
