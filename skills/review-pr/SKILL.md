---
name: review-pr
description: Review a pull request — interactive PR selection via `gh`, 4-dimension code review (hallucinated code, architecture, performance, test validity), then post severity-graded comments with fix suggestions on the PR. Not for spec-based review — use `review` instead.
---

## Acceptance Criteria

- Every finding traceable to specific lines in the diff
- Findings presented to the user with suggested fixes before posting
- Each posted comment includes severity (P0–P3) and a concrete fix suggestion
- **Verify:** confirm every file in the diff was read before reporting findings
- **Verify:** confirm all `gh pr comment` posts completed successfully
- No code is modified

## Severity Scale

| Level             | When to assign                                                      |
| ----------------- | ------------------------------------------------------------------- |
| **P0 — Critical** | Main functionality broken; business logic contradicts design intent |
| **P1 — Major**    | Secondary functionality broken                                      |
| **P2 — Minor**    | Edge functionality broken                                           |
| **P3 — Trivial**  | Rare boundary conditions cause incorrect behavior                   |

## Review Dimensions

Examine every changed file through all four lenses. For each finding record: file, line range, severity, description, and suggested fix. Cross-reference dimensions — one change may have findings in multiple.

When reviewing, watch for:

- **Hallucinated Code** — APIs, imports, config keys, env vars, or endpoints that don't exist in this project's dependencies or runtime. Methods that don't exist on their target object, imports missing from dependency manifests, external contracts that don't match reality.
- **Architecture Defects** — Layer violations, circular dependencies, bypassing reusable abstractions, patterns inconsistent with the rest of the codebase.
- **Performance Defects** — N+1 queries, hot-path allocations, missing cache on repeated operations, blocking the event loop, loading more data than needed, hoistable computation.
- **Test Validity** — Business logic changes tested meaningfully (not tautologies, over-mocking, or coincidental setup). Edge cases (empty states, errors, boundaries) covered. Tests actually invoke the changed code.

## Workflow

### 1. Identify the Target PR

If the user provided a PR number or URL, confirm it with `gh pr view`. Otherwise list open PRs, present a table, and let the user pick.

### 2. Fetch Full Context

Fetch PR title, body, files, diff, and existing comments. Note base and head branches — they frame scope.

### 3. Review Across All 4 Dimensions

Read every changed file. Group findings by severity (P0 → P3).

**Verify completeness:** cross-reference the list of changed files against your findings. For any file with no findings, confirm to the user it was reviewed and deemed clean before proceeding.

### 4. Present for Confirmation

Show the user the full finding list grouped by severity with a summary table. Ask explicitly whether to post — wait for confirmation.

### 5. Post Comments

Post one `gh pr comment` per finding. Each comment follows this format:

```
**P# — Dimension Name**
**File:** `path/file.ts:L42`
**Issue:** clear description
**Suggested Fix:** actionable suggestion (with code if applicable)
```

**Verify posting:** After all posts, check `gh pr view --json comments` to confirm every finding has a matching comment. Compare actual post count to expected. Then summarize: `Posted N findings (P0: x, P1: y, P2: z, P3: w) on PR #N.`

## Requirements

- `gh` CLI installed and authenticated (`gh auth status`)
- Current directory is a git repo with `origin`, or user provides `--repo owner/name`
- Consult `references/gh-pr-cheatsheet.md` for exact `gh pr` flags
