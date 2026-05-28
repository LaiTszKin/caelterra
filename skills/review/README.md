# qa

`qa` reviews implementation changes against recent or user-specified planning documents.

## What this skill does

This skill:

1. Resolves the governing `docs/plans/...` spec scope from user input or recent repository changes.
2. Checks whether each business goal and acceptance criterion is actually implemented.
3. Treats unmet business goals as the most severe review findings.
4. Runs secondary code-practice review through `review-change-set`, `discover-edge-cases`, and `discover-security-issues` for code-affecting scopes — preferably as parallel read-only subagents (one per skill) that report back to the main agent.
5. Reports business-goal gaps separately from edge-case, security, and maintainability findings.

## When to use

Use this skill when the task asks you to:

- review whether recent spec-backed implementation work is complete,
- compare current changes against a named spec directory,
- check whether delivered code satisfies `spec.md`, `tasks.md`, `checklist.md`, `contract.md`, or `design.md`,
- perform a final spec-compliance review before archive, submission, PR, or release work.

## Core principles

- Business-goal completion is reviewed first.
- Missing required behavior is more severe than ordinary code-practice issues.
- Secondary edge-case, security, and code-review findings remain clearly separated.
- Findings must cite concrete spec and code evidence.
- For multi-skill reviews, prefer parallel read-only subagents (one per secondary skill) over chaining the skills sequentially on the main agent.

## Example

Prompt example:

```text
Use $qa to review the changes related to docs/plans/2026-04-28/order-routing.
List any business goals that were not fully achieved, then run edge-case, security, and code-review checks on the related code.
```

Expected behavior:

- the named spec set is read before judging the code,
- business-goal gaps are listed first and treated as highest severity,
- secondary review skills are invoked for the same implementation scope, preferably as one read-only subagent per skill running in parallel,
- the final report separates spec-compliance findings from edge-case, security, and code-review findings.

## References

- [`SKILL.md`](./SKILL.md) - full workflow and execution rules.

## License

MIT
