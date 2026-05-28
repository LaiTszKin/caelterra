---
name: open-github-issue
description: Publish structured GitHub issues across multiple issue categories with deterministic auth fallback, target-repo resolution, README-based language detection, and draft-only fallback when authentication is unavailable. Use when users ask to open GitHub issues from confirmed findings, accepted proposals, documentation gaps, security risks, observability gaps, or prepared issue content.
---

# Open GitHub Issue

## Dependencies

- Required: none.
- Conditional: none.
- Optional: none.
- Fallback: If authenticated publishing is unavailable, fall back to draft-only output without blocking the caller.

## Standards

- Evidence: Require structured issue inputs, detect repository language from the target README instead of guessing, and enforce category-specific required fields so each issue type matches the situation being reported.
- Execution: Resolve the repo, normalize the issue body, publish with strict auth order, then return the publication result.
- Quality: Preserve upstream evidence, localize only the structural parts, keep publication deterministic and reproducible, and make behavioral mismatches easy for maintainers to verify.
- Output: Return publication mode, issue URL when created, rendered body, and any publish error in the standardized JSON contract.

## Overview

Designed to be reusable by other skills that know the issue title and evidence but need a consistent publish path.

## Core principles

- Keep publishing deterministic and reproducible.
- Prefer authenticated `gh` CLI first, then GitHub token, then draft-only fallback.
- Detect repository issue language from the target remote README instead of guessing.
- Preserve upstream evidence content; only localize section headers and default fallback text.
- Make the issue type explicit: `problem`, `feature`, `performance`, `security`, `docs`, or `observability`.
- For `problem` issues, describe the expected behavior and current behavior with BDD-style `Given / When / Then`, then state the behavioral difference explicitly.
- Prefer the bundled `apltk open-github-issue` command when available; if it is unavailable, fall back to the packaged script with an absolute path instead of assuming `python`, relative paths, or the caller's cwd are wired correctly.
- Never pass Markdown-rich issue content inline when it may contain backticks, `$()`, quotes, or shell metacharacters. Write a JSON payload file or content files first, then pass `--payload-file` or `@file` references so the shell cannot perform command substitution before Python receives the text.

## Workflow

1. Resolve target repository
   - Use `--repo owner/name` when provided.
   - Otherwise resolve from current git `origin`.
2. Normalize issue content
   - Require one title and an explicit `issue-type`.
   - See `references/issue-schemas.md` for the required fields per issue type.
3. Detect issue language
   - Read the target repository README from GitHub.
   - If the README is Chinese, publish Chinese section titles; otherwise publish English section titles.
4. Publish with strict auth order
   - If `gh auth status` succeeds, use `gh issue create`.
   - Otherwise, if `GITHUB_TOKEN` or `GH_TOKEN` exists, use GitHub REST API.
   - Otherwise, return draft-only output and do not block the caller.
5. Return publication result
   - Always return publication mode, issue URL when created, rendered issue body, and any publish error.

## CLI reference

Run `apltk open-github-issue --help` for the live flag reference, examples, expected results, and issue-type-specific payload rules.

- Prefer the bundled `apltk` command over calling the Python helper directly.
- Prefer payload files or `@file` inputs for rich Markdown so shell quoting cannot corrupt the content before Python receives it.
- Keep one confirmed issue or one accepted proposal per invocation.

## Output contract

The script prints JSON with these fields:

- `repo`
- `issue_type`
- `language`
- `mode` (`gh-cli` / `github-token` / `draft-only` / `dry-run`)
- `issue_url`
- `issue_title`
- `issue_body`
- `publish_error`

## Dependency usage guidance

When another skill depends on `open-github-issue`:

- Pass exactly one confirmed issue or one accepted proposal per invocation.
- Prepare evidence or proposal details before calling this skill; do not ask this skill to infer root cause or architecture.
- When invoking the CLI directly, write rich Markdown fields into a JSON payload file or `@file` inputs first; do not inline text containing backticks or shell metacharacters.
- For `problem` issues, pass a `problem-description` that contains `Expected Behavior (BDD)`, `Current Behavior (BDD)`, and `Behavior Gap`; the difference must be explicit, not implied.
- Reuse the returned `mode`, `issue_url`, and `publish_error` in the parent skill response.
- For accepted feature proposals, pass `--issue-type feature` plus `--proposal`, `--reason`, and `--suggested-architecture`.
- For security, performance, docs, or observability findings, choose the matching `issue-type` instead of overloading `problem`.

## Resources

- `references/open-github-issue.md` — apltk open-github-issue 工具的完整參數說明。在執行 CLI 發布 Issue 前閱讀，了解各 Issue type 的必要欄位與 auth 降級邏輯。
- `references/issue-schemas.md` — 各 Issue type 的 payload schema 定義。
- If the CLI tool is unavailable or fails for environment reasons, fall back to direct `gh issue create` or GitHub REST API publishing instead of retrying the same invocation.
