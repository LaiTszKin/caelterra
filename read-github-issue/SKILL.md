---
name: read-github-issue
description: Read and search remote GitHub issues via GitHub CLI (`gh`). Use when users ask to list issues, filter issue candidates, inspect a specific issue with comments, or gather issue context before planning follow-up work. Prefer the bundled CLI tools when they are present and working, but fall back to direct `gh issue list` / `gh issue view` commands when the tools are missing or fail for repository-specific reasons.
---

# Read GitHub Issue

## Dependencies

- Required: none.
- Conditional: none.
- Optional: none.
- Fallback: If the bundled CLI tools are missing or fail but `gh` is available, continue with raw `gh issue list` / `gh issue view`; only stop when `gh` itself is unavailable or unauthenticated.

## Standards

- Evidence: Verify repository context first, then read remote issue data directly from `gh issue list` / `gh issue view` instead of paraphrasing from memory.
- Execution: Confirm the target repo, prefer the bundled CLI tools for deterministic output, then fall back to raw `gh` commands whenever the tools are unavailable or broken in the target repository.
- Quality: Keep the skill focused on issue discovery and retrieval only; do not embed any hardcoded fixing, branching, PR, or push workflow.
- Output: Return candidate issues, selected issue details, comments summary, and any missing information needed before follow-up work.

## Prerequisites

- `gh` is installed and authenticated (`gh auth status`).
- The current directory is a git repository with the correct `origin`, or the user provides `--repo owner/name`.

## Workflow

### 1) Verify repository and remote context

- Run `gh repo view --json nameWithOwner,isPrivate,defaultBranchRef` to confirm target repo.
- If the user specifies another repository, always use `--repo <owner>/<repo>` in issue commands.

### 2) Find candidate issues with the bundled CLI

- 在步驟 2 操作前先閱讀 `references/find-github-issues.md` 了解搜尋參數。
- Raw `gh` fallback when the script is missing or broken:
- `gh issue list --limit 50 --state open`
- If the issue target is still unclear, present top candidates and ask which issue number or URL should be inspected next.

### 3) Read a specific issue in detail

- 在步驟 3 操作前先閱讀 `references/read-github-issue.md` 了解旗標。
- Raw `gh` fallback when the script is missing or broken:
- `gh issue view 123 --comments`
- Use the returned title, body, labels, assignees, state, timestamps, and comments to summarize the issue precisely.

### 4) Summarize gaps before any follow-up action

- Identify missing acceptance criteria, repro details, affected components, or environment context.
- If issue text and comments are insufficient, state exactly what is missing instead of inventing a fix plan.

## CLI reference

- `references/find-github-issues.md` — apltk find-github-issues 工具的完整參數說明。在步驟 2 搜尋 Issue 前閱讀。
- `references/read-github-issue.md` — apltk read-github-issue 工具的完整參數說明。在步驟 3 讀取 Issue 明細前閱讀。
