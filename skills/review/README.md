# review

`review` reviews implementation changes against spec documents and produces a structured review report.

## What this skill does

1. Reads the governing SPEC.md (and DESIGN.md if available) to parse all business requirements.
2. Locates the relevant code for each requirement and reviews it across six dimensions.
3. Analyzes cross-requirement interactions (shared modules, data structures, functional coupling).
4. Produces REPORT.md with findings only — no fix suggestions.

## When to use

Use this skill when the task asks you to:

- review whether spec-backed implementation work is complete,
- compare current changes against a named spec directory,
- check whether delivered code satisfies `SPEC.md`, `DESIGN.md`, or `CHECKLIST.md`,
- perform a final spec-compliance review before archive, submission, PR, or release work.

## Core principles

- Business-goal completion is reviewed first — unmet requirements are the most severe findings.
- Findings are classified across 6 dimensions: hallucinated code, redundant code, spec deviation, spec omission, architecture defect, performance concern.
- Severity is P0-P3, keyed to requirement satisfaction (not code quality in isolation).
- Findings must cite concrete spec and code evidence.
- REPORT.md contains findings only — fix planning is handled by the `qa` skill.

## Example

```text
Use review to review the changes related to docs/plans/2026-04-28/order-routing.
```

Expected behavior:

- SPEC.md requirements are parsed and mapped to implementation code,
- each requirement is reviewed across all six dimensions,
- cross-requirement interactions are analyzed,
- REPORT.md is generated with verdict, requirement status summary, and findings.

## References

- [`SKILL.md`](./SKILL.md) — full workflow and execution rules.

## License

MIT
