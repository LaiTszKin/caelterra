---
name: resolve-review-comments
description: Read GitHub pull request review comments, analyze each thread, decide whether to adopt feedback, implement adopted changes, push updates to the same PR branch, and resolve addressed review threads. Use when users ask to process PR review feedback by PR number or current branch context.
---

# Resolve Review Comments

## Dependencies

- Required: **`commit`** for staging adopted fixes, creating the commit, and **pushing** when the user requested a PR branch update—**MUST NOT** substitute bare `git commit` / unverified push for that leg.
- Conditional: none.
- Optional: none.
- Fallback: If **`commit`** is unavailable when submission is required, **MUST** stop and report.

## Standards

- Evidence: Read unresolved review threads first and decide adopt versus reject from the actual review content and code context.
- Execution: Implement only adopted feedback, validate it, **`commit`** on the same PR branch (commit + push when remote update is in scope), and resolve only the threads that were truly addressed.
- Quality: Keep changes minimal, leave rejected or unclear threads unresolved, and reply with concise technical reasons when feedback is not adopted.
- Output: Complete the PR feedback loop with updated code, **`commit`**-verified submission when applicable, and correctly resolved review threads.

## Prerequisites

- Ensure `gh` is installed and authenticated (`gh auth status`).
- Ensure the current directory is a git repository with the target PR branch checked out.
- Ensure the branch can be pushed to the PR source remote.

## Workflow

1. Identify target PR.
2. Read unresolved review threads.
3. Decide adopt or reject thread-by-thread.
4. Implement only adopted feedback.
5. Run relevant tests and checks.
6. **Submit** — Run **`commit`** on the same PR branch (commit always when there are staged fixes; **push** when updating the remote PR branch is in scope).
7. Resolve only threads that were truly addressed.
8. Reply on unresolved/rejected threads with reason.

## 1) Identify target PR

- If user provides PR number, use it directly.
- If user does not provide PR number, infer from current branch context.
- 在操作前先閱讀 `references/review-threads.md` 了解 list/resolve 子指令與過濾選項。

## 2) Read unresolved review threads

Use table view for quick scan, then JSON when you need full details.

The JSON output contains `thread_id`, `path`, `line`, and comment bodies for decision and resolution.

## 3) Decide adopt vs reject

Use the decision rubric in `references/adoption-criteria.md`.

- Adopt when correctness, security, reliability, or maintainability clearly improves.
- Reject when suggestion is incorrect, out of scope, duplicate, or conflicts with requirements.
- If uncertain, keep thread unresolved and ask for clarification instead of guessing.

Track adopted thread IDs in a JSON file:

```json
{
  "adopted_thread_ids": ["THREAD_ID_1", "THREAD_ID_2"]
}
```

## 4) Implement adopted feedback

- Edit only necessary files.
- Keep changes minimal and scoped to adopted comments.
- Reuse existing patterns; avoid unrelated refactors.

## 5) Validate before submit

- Run focused tests/lint/build that cover touched behavior.
- If checks fail, fix before **`commit`**.

## 6) Submit on the PR branch

- Run **`commit`**: stage adopted fixes, commit with a clear message, **push** to the PR branch when remote update is in scope (same branch backing the open PR).

## 7) Resolve addressed threads

Resolve only threads you actually addressed in code.
- 在操作前先閱讀 `references/review-threads.md` 了解 resolve 子指令與 thread-id 的指定方式。

## 8) Handle non-adopted comments

- Keep thread unresolved.
- Reply with a concise technical reason and, if needed, a proposed follow-up.
- Never resolve rejected or unhandled feedback threads.

## CLI reference

- `references/review-threads.md` — apltk review-threads 工具的完整參數說明。在步驟 1 識別 PR 或步驟 7 解析 thread 前閱讀。
