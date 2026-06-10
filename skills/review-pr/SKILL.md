---
name: review-pr
description: Review a pull request — interactive PR selection via `gh`, 4-dimension code review (hallucinated code, architecture, performance, test validity), then post severity-graded comments with fix suggestions on the PR. Not for spec-based review — use `review` instead.
---

## Acceptance Criteria

- Target PR identified: directly (`--pr <number>`) or interactively from a list of open PRs with branch relationships
- Every finding from the 4-dimension review traceable to specific lines in the diff
- Findings presented to the user with suggested fixes before anything is posted
- Each posted comment labels its severity (P0/P1/P2/P3) and includes a concrete fix suggestion
- No code is modified — review only

## Severity Scale

| Level | When to assign |
|-------|----------------|
| **P0 — Critical** | Main functionality broken in primary or edge scenarios; business logic contradicts design intent |
| **P1 — Major** | Secondary functionality broken |
| **P2 — Minor** | Edge functionality broken |
| **P3 — Trivial** | Rare boundary conditions cause incorrect behavior in edge or secondary functionality |

## Review Dimensions

Think through each dimension across the entire diff. For every finding, record: file, line range, severity, description, and a concrete suggested fix.

### Hallucinated Code
Does every API call, import, config key, environment variable, and referenced endpoint actually exist in this project's dependencies and runtime? Watch for methods that look plausible but don't exist on the target object, imports that aren't in the project's dependency manifests, and assumed external API contracts that don't match reality.

### Architecture Defects
Does the change respect the project's layer separation, module boundaries, and established patterns? Look for layer violations (e.g., UI calling the database directly), circular dependencies, bypassing abstractions that should be reused, or introducing patterns inconsistent with the rest of the codebase.

### Performance Defects
Are there obvious performance issues? N+1 queries in loops, unnecessary allocations on hot paths, missing cache for repeated expensive operations, blocking an async event loop, loading more data than needed, or repeated computation that could be hoisted.

### Test Validity
Is every new business logic path tested? Are the tests actually meaningful — not false positives that pass for the wrong reason (e.g., asserting tautologies, over-mocked to the point of meaninglessness, or passing due to coincidental setup)? Check that edge cases (empty states, errors, boundaries) are covered and that tests actually invoke the code changed by this PR.

## Workflow

### 1. Identify the Target PR

If the user provided a PR number or URL (`--pr <number>`), confirm it with `gh pr view`. Otherwise, list open PRs with `gh pr list` (see the cheatsheet for the exact fields), present a table (`# | Title | base ← head | Author | +/- | Age`), and let the user pick.

### 2. Fetch Full Context

Fetch the PR title, body, files, diff, and existing comments using `gh pr view` and `gh pr diff` (exact flags in the cheatsheet). Note the base and head branches — they frame the scope.

### 3. Review Across All 4 Dimensions

Read every changed file. For each finding, record file, line range, dimension, severity, description, and suggested fix. Cross-reference dimensions — one change can have findings in multiple dimensions. Group results by severity (P0 → P3).

### 4. Present for Confirmation

Show the user the full finding list grouped by severity with a summary table (dimension, file, line, issue, suggested fix). Ask explicitly whether to post — wait for confirmation.

### 5. Post Comments

Post one `gh pr comment` per finding. Each comment uses this structure:

```
**P# — Dimension Name**
**File:** `path/file.ts:L42`
**Issue:** clear description
**Suggested Fix:** actionable suggestion, with code if applicable
```

After all posts, summarize: `Posted N findings (P0: x, P1: y, P2: z, P3: w) on PR #N.`

## Requirements

- `gh` CLI installed and authenticated (`gh auth status`)
- Current directory is a git repo with the correct `origin`, or the user provides `--repo owner/name`
- Exact `gh pr` flags are in `references/gh-pr-cheatsheet.md` — consult it for commands, don't memorize
