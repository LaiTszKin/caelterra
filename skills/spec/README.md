# spec

Transforms user requirements into strictly-scoped business specification documents (SPEC.md). Part of the Apollo Toolkit development lifecycle.

- Generates single-spec plans under `docs/plans/{YYYY-MM-DD}/{change_name}/SPEC.md`
- Generates multi-spec batch plans under `docs/plans/{YYYY-MM-DD}/{batch_name}/{change_name}/SPEC.md`
- Uses CodeGraph to calibrate requirements against actual code
- Produces enriched Clarification Questions with background context, impact analysis, and agent recommendation

## Quick start

```bash
apltk create-specs "Feature name" --change-name feature-name
```

## Output structure

```
# Single spec:
docs/plans/<today>/feature-name/
  └── SPEC.md

# Batch spec:
docs/plans/<today>/batch-name/
  ├── spec-a/
  │   └── SPEC.md
  └── spec-b/
      └── SPEC.md
```

## Pipeline

```
discuss → PROPOSAL.md
spec    → SPEC.md        → consumed by `design`
design  → DESIGN.md      → consumed by `plan`
plan    → PROMPT.md      → consumed by `implement`
```
