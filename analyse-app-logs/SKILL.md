---
name: analyse-app-logs
description: Comprehensive application log investigation workflow that reads logs end-to-end, correlates signals with code paths and runtime context, and identifies evidence-backed issues with impact and remediation steps. Use when users ask to analyze logs, investigate incidents, find root causes from log records, explain recurring warnings/errors, or check whether logs reveal hidden system problems.
---

# Analyse App Logs

## Dependencies

- Required: none.
- Conditional: `open-github-issue` when confirmed issues should be published.
- Optional: none.
- Fallback: If publication is needed and `open-github-issue` is unavailable, return draft issue content instead of inventing another publisher.

## Standards

- Evidence: Use a bounded investigation window and correlate log lines with code, runtime context, and concrete identifiers.
- Execution: Scope the incident, use the bundled CLI tools to cut logs down by time window or search terms, build a timeline, validate candidate issues, then prioritize and optionally publish them.
- Quality: Separate confirmed issues from hypotheses and include time-window, log, code, impact, and confidence evidence for each report.
- Output: Return incident summary, confirmed issues, hypotheses, monitoring improvements, and publication status.

## Core principles

- Prioritize evidence over assumptions; avoid speculative conclusions.
- Prefer a bounded, recent investigation window over unbounded history; anchor analysis on a concrete time boundary such as the last container restart, pod recreation, deploy, or first failure.
- Correlate log symptoms with code paths, configuration, and external dependencies.
- Distinguish clearly between confirmed issues and hypotheses.
- Keep findings actionable: impact, urgency, and fix direction.

## Workflow

1. Define investigation scope
   - Confirm service/component, environment, and incident time window.
   - If the user does not provide a trustworthy window, derive one from a concrete runtime boundary first, such as the last container restart, pod recreation, deploy start, worker boot, or first failure after a known healthy state.
   - Prefer analyzing logs only inside that bounded window first (for example, from the last restart until now) to avoid stale logs polluting the diagnosis; widen the window only when the bounded slice cannot explain the symptom.
   - Identify relevant identifiers (trace ID, request ID, user ID, job ID, tx hash).
   - Use `apltk filter-logs` first when the raw log set is large and the incident window can be bounded.
   - 在操作前先閱讀 `references/filter-logs.md` 了解所有參數。
2. Build a timeline from logs
   - Extract key events in chronological order within the chosen window: deploys, config changes, warnings, errors, retries, and recoveries.
   - Group repeated symptoms by signature (error type, message prefix, stack frame, endpoint).
   - Use `apltk search-logs` to narrow by error signature, IDs, endpoint names, or repeated keywords before summarizing the timeline.
   - 在操作前先閱讀 `references/search-logs.md` 了解搜尋模式與上下文行設定。
3. Correlate across context
   - Link related log lines using identifiers and timestamps.
   - Map stack traces and log messages to exact code locations.
   - Cross-check with runtime context (feature flags, env vars, dependency health, upstream/downstream services).
4. Validate candidate issues
   - Use `references/investigation-checklist.md` to verify each candidate issue before reporting.
   - Use `references/log-signal-patterns.md` to classify common failure patterns and avoid false positives.
5. Prioritize and propose actions
   - Rank by severity and user/business impact.
   - Recommend the smallest safe fixes first.
   - Suggest additional instrumentation only when current logs cannot confirm root cause.
6. Publish confirmed issues through dependency skill
   - Invoke `open-github-issue` once per confirmed issue.
   - Pass the prepared title, problem description, suspected cause, reproduction conditions, and target repo.
   - Reuse the dependency output to report `gh-cli` / `github-token` / `draft-only` publication mode.

## Evidence requirements

For each reported issue, include:

- Time-window evidence: selected start/end boundaries, timezone, and why this window was chosen.
- Log evidence: concrete lines, timestamps, IDs, and frequency.
- Code evidence: `path:line` mapping to the probable failing logic.
- Impact statement: affected functionality, users, or data integrity risk.
- Confidence level: high / medium / low, with reason.

If evidence is insufficient, report as **hypothesis** and specify exactly what additional logs/metrics are needed.

## GitHub issue handoff rules

For each confirmed issue, delegate exactly one GitHub issue publication to `open-github-issue`.

Pass these fields to the dependency skill:

- `title`: short symptom summary such as `[Log] payment timeout spike`
- `problem-description`: symptom, impact, and key log evidence
- `suspected-cause`: `path:line`, causal chain, and confidence
- `reproduction`: steps/conditions if known; otherwise leave empty
- `repo`: target repository in `owner/repo` format when known

If invoking the publisher CLI directly, pass these fields through `apltk open-github-issue --payload-file <json>` or `@file` inputs rather than inline shell arguments, because log evidence can contain backticks or shell metacharacters.

Issue body sections must always include these three parts:

- Chinese-language repositories: use localized equivalents of
  `Problem Description`, `Suspected Cause`, and `Reproduction Conditions (if available)`.
- Non-Chinese repositories: use
  `Problem Description`, `Suspected Cause`, and `Reproduction Conditions (if available)`.

If reproduction is unknown, let `open-github-issue` insert the default language-appropriate non-reproducible note.

## Output format

Use this structure in responses:

1. Incident summary
   - Scope, timeframe, and overall health status.
2. Confirmed issues (ordered by severity)
   - Symptom
   - Log evidence
   - Code correlation (`path:line`)
   - Root cause analysis
   - Impact
   - Recommended remediation
3. Hypotheses and required validation
   - What is suspected
   - Why confidence is limited
   - Required data to confirm/deny
4. Monitoring and prevention improvements
   - Missing alerts/log fields
   - Suggested guardrails or dashboards
5. GitHub issue publication status
   - Publication mode (`gh-cli` / `github-token` / `draft-only`)
   - Created issue URLs or draft bodies with fallback reason

## Resources

- `references/filter-logs.md` — apltk filter-logs 工具的完整參數說明。在步驟 1 使用 CLI 過濾日誌時間窗前閱讀。
- `references/search-logs.md` — apltk search-logs 工具的完整參數說明。在步驟 2 搜尋日誌前閱讀。
- `references/open-github-issue.md` — apltk open-github-issue 工具的完整參數說明。在步驟 6 發布 Issue 前閱讀。
- `references/investigation-checklist.md`: Step-by-step checklist for evidence-driven log investigations.
- `references/log-signal-patterns.md`: Common log signatures, likely causes, validation hints, and false-positive guards.
