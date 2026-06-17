# apltk create-review-report — Review Report Template Generator

## Purpose

Copies the review report template (REPORT.md) to the corresponding spec directory.

## Usage

Before using this tool, run `apltk create-review-report --help` and follow the live CLI guidance.

```
apltk create-review-report [options] [<spec-path>]
```

## Positional Arguments

| Argument      | Effect                                                              |
| ------------- | ------------------------------------------------------------------- |
| `<spec-path>` | Spec directory, SPEC.md, or batch root. Auto-detected when omitted. |

## Flags

| Flag          | Effect                         |
| ------------- | ------------------------------ |
| `--force, -f` | Overwrite existing `REPORT.md` |

## Placement Logic

- Single spec: placed next to SPEC.md
- Batch spec: placed at the batch root directory
