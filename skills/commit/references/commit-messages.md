# Commit Message Instructions

Use a concise Conventional Commit style:

- Format: type: short subject
- Subject: imperative, lower case, no trailing period, <= 72 chars
- Scope: include only if the repo already uses it (type(scope): subject)
- Select `type` from the actual change intent in the staged diff (feature, bugfix, docs, etc.)
- Do not use version-only subjects (for example `feat: v1.2.3`)
- If the commit only contains release metadata, use `chore(release): ...`

Common types:

- feat, fix, docs, chore, refactor, test, style, perf, build, ci

Examples:

- feat: add rpc retry backoff
- fix: handle empty response payload
- docs: update env var table
- chore(release): bump version and update changelog
