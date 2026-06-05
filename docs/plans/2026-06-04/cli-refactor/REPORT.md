# Review Report — Round 15

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-06
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 1 P0 and 2 P1 findings identified. All 640+ tests pass with no failures. The Round 14 read-github-issue P1 findings (incomplete createToolRunner migration, missing carryover documentation, dead flag-handling code) are all resolved. A critical P0 cross-requirement issue was discovered: carryover tool errors become **unhandled promise rejections** terminating the process on Node 25+ because `cli/index.ts:351` returns `runTool()` without `await`, bypassing the CLI boundary's `catch` block and `formatAppError`. This affects all 5 carryover tools and is a regression for `review-threads` (commit 0eb0302 changed its cmdResolve error path from `stderr.write + return 1` to `throw new UserInputError`, swapping clean output for a runtime crash).

**Progress since Round 14**: 3 P1 findings resolved (read-github-issue schema, carryover JSDoc, dead parseArgs removed), 5 P2 findings resolved (sync-memory-index redundant catch removed, review-threads cmdResolve UserInputError, PlatformAdapter EOL consumed, mktemp fallback, grep pattern validation), 4 P3 findings resolved (stale assertCommand comment partially addressed, carryover documentation added). However, a new P0 cross-requirement issue was discovered that affects all 5 carryover tools, and review-threads was regressed.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ✅ Complete with documented carryover | `packages/tools/read-github-issue/index.ts` L155-174 — full createToolRunner schema with --repo, --json, --comments, JSDoc. 15/20 tools wrapped, 5 carryover with JSDoc | 0 P0, 0 P1, 0 P2, 0 P3 |
| Req 2 — Cross-platform abstraction | ⚠️ Partial — gap in carryover tools | `packages/tool-utils/platform-adapter.ts` — interface + 2 implementations. EOL consumed in sync-memory-index L119. architecture tool hardcoded `\n` file writes at L550, L576 | 0 P0, 0 P1, 1 P2, 4 P3 |
| Req 3 — Unified error handling | ❌ Requirement Defect | sync-memory-index redundant catch removed, review-threads cmdResolve UserInputError (L505-509). But **P0**: 5 carryover tool errors become unhandled rejections — `cli/index.ts:351` returns without await | 1 P0, 2 P2, 2 P3 |
| Req 4 — Coverage >= 80% + CI matrix | ⚠️ Partial — gap vs SPEC | `scripts/test.sh` — threshold 65% vs SPEC 80% (15pp gap across 6 rounds). G1=77.90%, G2=69.29%. CI matrix correctly configured. mktemp fallback, grep validation added | 0 P0, 2 P1, 2 P2, 1 P3 |
| Req 5 — Dispatch isolation | ✅ Complete with tradeoff | `packages/cli/index.ts` L70-89 — FIX-16 comment documents 3-touch requirement and ordering constraint. 3 parser classes verified with 60+ tests | 0 P0, 0 P1, 0 P2, 1 P3 |

---

## Cross-requirement Interaction Summary

**Requirement Groups:**

| Group | Requirements | Interaction Type | Summary |
|---|---|---|---|
| A | Req 1, Req 3 | Shared modules, functional coupling, same-file modifications | createToolRunner (Req 1) provides error boundary (Req 3). 5 carryover tools bypass both — their typed AppError throws miss the CLI boundary catch. **1 P0 finding** |
| B | Req 2 | Isolated (PlatformAdapter) | architecture tool hardcoded `\n` file writes (P2). No cross-requirement coupling |
| C | Req 4 | Isolated (coverage + CI config) | Coverage thresholds, Group 3 exclusion, CHECKLIST staleness. Self-contained |
| D | Req 5 | Isolated (dispatch logic) | CLI dispatch architecture separate from tool handler concerns. 1 P3 stale comment |

---

## Findings

### P0 — Requirement Blocked

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Carryover tools: thrown errors cause unhandled promise rejections — `cli/index.ts:351` returns `runTool()` without `await`**. The CLI dispatch uses `return (context.runTool \|\| runTool)(...)` instead of `return await ...`. Rejected promises from un-wrapped tool handlers skip the `catch (error)` block at L477, which contains `formatAppError`. On Node 25.8.1 (project's runtime), unhandled rejections terminate the process with a raw stack trace to stderr — no formatted error, exit code from Node, not the application. **All 5 carryover tools are affected**: architecture, codegraph, find-github-issues, open-github-issue, review-threads. **review-threads REGRESSED in Round 15**: its cmdResolve error was converted from `stderr.write + return 1` (clean exit code 1) to `throw new UserInputError(...)` (crash). The carryover JSDoc for open-github-issue (L796) and review-threads (L529) explicitly claims "errors propagate to the CLI boundary's formatAppError" — this claim is false | SPEC Req 3 requires all errors to be "caught at CLI boundary and formatted consistently (stderr + non-zero exit code)". For 5 carryover tools, this requirement is violated — errors bypass the boundary. review-threads cmdResolve regressed from functional to broken. Root cause is a single `return`-without-`await` in the dispatch layer | `packages/cli/index.ts` | L351 | Architecture defect, Spec implementation deviation | Req 1, Req 3 |

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 2 | **Coverage threshold (65%) does not meet SPEC requirement (80%)**. `scripts/test.sh` enforces `--test-coverage-lines=65`. SPEC Req 4 mandates `>= 80%`. Current measured: Group 1 = 77.90% lines, Group 2 = 69.29% lines — both below 80% individually. Combined estimate is informal with no aggregation tooling. This 15pp gap has persisted across 6 review rounds (Round 10 through Round 15) | SPEC coverage requirement unmet by 15 percentage points. CI can pass while each group is well below 80%. Combined estimate of ~80% is unverified | `scripts/test.sh` | L8-9, L28 | Spec implementation omission | Req 4 |
| 3 | **CHECKLIST.md references stale 80% coverage threshold that does not match implementation**. CL-08 quotes `--test-coverage-lines=80 --test-coverage-branches=60 --test-coverage-functions=75`. Actual implementation: `--test-coverage-lines=65 --test-coverage-branches=60 --test-coverage-functions=65`. The E2E/Integration table (L53) also references 80%. Neither was updated when thresholds were lowered to 65% | CHECKLIST is the verification strategy document for this spec. Stale threshold values mislead reviewers and create ambiguity about what gate is enforced | `docs/plans/2026-06-04/cli-refactor/CHECKLIST.md` | L22, L53 | Spec implementation deviation | Req 4 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 4 | **`architecture` tool hardcoded `\n` in `fs.writeFileSync`**. Lines 550 (`lines.join('\n')`) and 576 (`'\n' + existing`) write to proposal.yaml and API index data using Unix line endings instead of `PlatformAdapter.EOL`. These file operations bypass the cross-platform abstraction layer | On Windows, the produced files would have `\n` line endings (no `\r\n`). While most editors handle this, it violates the cross-platform consistency requirement of Spec Req 2 | `packages/tools/architecture/index.ts` | L550, L576 | Architecture defect | Req 2 |
| 5 | **`extract-pdf-text`: child process error handler uses `stderr.write + resolve(1)` instead of `throw AppError`**. The tool IS wrapped in `createToolRunner`, but the child process error callback at lines 65-68 writes directly to stderr and resolves with exit code 1, bypassing the boundary's `formatAppError` formatting | One error path in a createToolRunner-wrapped tool deviates from the unified error convention. Error messages bypass formatAppError formatting and the error type hierarchy | `packages/tools/extract-pdf-text/index.ts` | L65-68 | Spec implementation deviation | Req 3 |
| 6 | **`open-github-issue` (carryover): `stderr.write + return 1` on draft-only publish error** (L897-900). The draft-only publish failure path uses `stderr!.write(...)` + `return 1` instead of throwing `UserInputError`/`SystemError` | One error path in an otherwise AppError-compliant handler deviates. Combined with Finding 1, throw paths crash; this write-path is the safe-but-nonstandard alternative | `packages/tools/open-github-issue/index.ts` | L897-900 | Spec implementation deviation | Req 3 |
| 7 | **Combined coverage estimate is purely informational — no aggregation mechanism**. `scripts/test.sh` L85-91 extracts per-group line percentages and prints them but performs no weighted aggregation and enforces no combined threshold. The comment acknowledges "not directly measured" | No mechanism exists to validate combined coverage >= 80% (the SPEC requirement). The informal estimate is not actionable in CI | `scripts/test.sh` | L13-14, L85-91 | Spec implementation omission | Req 4 |
| 8 | **Group 3 (mock.module) tests excluded from coverage tracking**. Three codegraph test files (cmd-init, cmd-list-apis, cmd-survey) run with `--experimental-test-module-mocks` but without `--experimental-test-coverage`. The code they exercise is invisible to coverage reporting | Reported coverage numbers are overstated relative to the full codebase. A coverage regression in mock-dependent code would go undetected | `scripts/test.sh` | L17-20, L60-64 | Spec implementation omission | Req 4 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 9 | **Stale "Currently unused in production code" comment on EOL properties**. `PlatformAdapter` interface (L28-30), `WindowsAdapter` (L60-62), and `PosixAdapter` (L89-91) still say "Currently unused in production code — see REPORT.md P2-7". sync-memory-index now consumes `adapter.EOL` at line 119 | Misleading documentation — new readers may avoid using `adapter.EOL` because the comment says it's unused | `packages/tool-utils/platform-adapter.ts` | L28-30, L60-62, L89-91 | Spec implementation deviation | Req 2 |
| 10 | **`sync-memory-index`: `renderSection()` default `eol='\n'` dead code**. The sole caller (handler L119) always passes `adapter.EOL` explicitly, making the default unreachable | Unnecessary dead parameter increases maintenance surface | `packages/tools/sync-memory-index/index.ts` | L39 | Redundant code | Req 2 |
| 11 | **`sync-memory-index`: `titleFromMemoryFile()` splits on `\n`**. Line 17 uses `content.split('\n')` to split file contents read from disk. On Windows, `.md` files would use `\r\n` — mitigated by `.trim()` on L18 but the assumption is baked in | Cosmetic — split produces trailing `\r` that `.trim()` removes. No functional impact but inconsistent approach | `packages/tools/sync-memory-index/index.ts` | L17 | Architecture defect | Req 2 |
| 12 | **`sync-memory-index`: `syncAgentsFile()` mixed line endings risk**. Lines 84-85 use hardcoded `\n` for section separators while `sectionText` was built with `adapter.EOL`. On Windows, sections use `\r\n` within but `\n` between sections | Aesthetic only — most tools handle mixed line endings gracefully. Inconsistent with cross-platform goal | `packages/tools/sync-memory-index/index.ts` | L84 | Architecture defect | Req 2 |
| 13 | **`generate-storyboard-images`: per-item batch failures use `stderr.write("Error: ...")`**. Lines 316, 329 write to stderr directly for individual API failures in a batch loop (with `continue`). The tool IS wrapped in createToolRunner but these paths bypass the typed-error convention | Minor — the error is per-item within a batch; the handler returns 0 for the overall execution. Deviates from AppError convention for individual item failures | `packages/tools/generate-storyboard-images/index.ts` | L316, L329 | Spec implementation deviation | Req 3 |
| 14 | **`validate-skill-frontmatter`/`validate-openai-agent-config`: `return 1` for validation failures**. Both tools use `return 1` for business-rule validation failures (not error conditions) instead of throwing `AppError`. The exit code is correct but the pattern deviates from "handlers throw AppError" | By-design return paths for expected outcomes. No functional impact — exit code 1 is correct. Deviates from the convention established by the refactoring | `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts` | L111, L205 | Spec implementation deviation | Req 3 |
| 15 | **Windows glob risk in `--test-coverage-exclude`**. `packages/tools/eval/**` uses forward slashes which may not match Windows backslash paths. Documented in blind-spot comment (L21) | If the glob silently fails on Windows, eval files would be included in coverage, potentially causing unexplained coverage drops. Carried forward from Round 14 | `scripts/test.sh` | L21, L28 | Architecture defect | Req 4 |
| 16 | **Stale `assertCommand` comment in `dispatch-table.test.js`**. Lines 341-348 reference a non-existent `assertCommand` parameter and `SystemError` throw that were removed in a prior refactor. The test functions correctly but the comment describes a non-existent code path | Misleading — developers reading the tests will encounter stale architectural context about removed code | `test/cli/dispatch-table.test.js` | L341-348 | Hallucinated code | Req 5 |
| 17 | **CHECKLIST.md implementation checkboxes unfilled**. All 13 CL-* behavior-to-test items have unfilled `[ ]` markers with no implementation results recorded. Status of checklist verification is undocumented | Governance gap — the CHECKLIST was designed as a verification strategy but none of its items have been tracked against implementation | `docs/plans/2026-06-04/cli-refactor/CHECKLIST.md` | L15-28 | Spec implementation omission | Req 1-5 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Architecture defect | 5 |
| Spec implementation omission | 4 |
| Spec implementation deviation | 4 |
| Redundant code | 1 |
| Hallucinated code | 1 |

---

## Review History

### Round 15 — 2026-06-06

**Verdict**: Needs Work — 1 P0, 2 P1, 5 P2, 9 P3 findings.

**Resolved from Round 14:**

- P1-1 (read-github-issue schema only declares `help`): ✅ **Verified** — Full createToolRunner schema now declares `--repo`, `--json`, `--comments`, `--help`. Internal `parseArgs()` removed. JSDoc documents the approach. 3 regression tests verify flag passthrough without `ERR_PARSE_ARGS`. All 640+ tests pass
- P1-3 (read-github-issue missing carryover documentation): ✅ **Verified** — JSDoc added at L108-115 documenting createToolRunner approach, schema options, error handling flow
- P1-2 (read-github-issue dead flag-handling code): ✅ **Resolved** — internal `parseArgs()` function removed entirely. No `parseArgs` import or call remains
- P2-5 (sync-memory-index redundant catch): ✅ **Verified** — Inner catch removed. Handler L99-126 has no try/catch. Errors propagate to createToolRunner's outer catch. Regression test (REGTEST-04) confirms
- P2-6 (review-threads cmdResolve `stderr.write + return 1`): ✅ **Verified** — Lines 505-509 now throw `new UserInputError(...)`. Regression test (REGTEST-05) confirms
- P2-7 (PlatformAdapter EOL never consumed): ✅ **Verified** — sync-memory-index L119 now passes `adapter.EOL` to `renderSection()`
- P2-4 (mktemp not on all platforms): ✅ **Resolved** — `scripts/test.sh` now uses `${TMPDIR:-${TEMP:-/tmp}}/test-run-$$.log` instead of `mktemp`
- P3-11 (post-hoc grep depends on Node.js error format): ✅ **Verified** — L75-83 adds sanity check: verifies coverage data exists before concluding thresholds were met
- P3-16 (read-github-issue dead flag-handling code): ✅ **Superseded by P1-3 resolution** — internal parseArgs removed

**Regressions in Round 15:**

- 🟥 **review-threads cmdResolve: `throw new UserInputError` causes unhandled promise rejection** (part of P0-1). The cmdResolve error path was converted from `stderr.write("Error: ...") + return 1` (clean exit code 1) to `throw new UserInputError(...)` (crash). The throw propagates through the CLI dispatch without `await`, producing an unhandled rejection on Node 25. This is a regression — the previous code produced correct error output, the new code crashes

**New findings in Round 15:**

- 🟥 **Carryover tool errors become unhandled promise rejections** — all 5 carryover tools affected. `cli/index.ts:351` returns `runTool()` without `await`. P0 (cross-requirement)
- 🔴 **CHECKLIST.md stale 80% threshold references** — CL-08 and L53 not updated to match implementation. P1
- 🟡 **architecture hardcoded `\n` in file writes** — bypasses PlatformAdapter. P2
- 🟡 **extract-pdf-text child process error handler bypasses createToolRunner** — uses stderr.write + resolve(1). P2
- 🟡 **open-github-issue stderr.write + return 1** — one remaining deviation in carryover tool. P2
- 🔵 9 P3 findings (stale EOL comments, renderSection dead default, titleFromMemoryFile split assumption, syncAgentsFile mixed line endings, generate-storyboard-images stderr.write, validate tools return 1, Windows glob risk, stale assertCommand comment, CHECKLIST unfilled boxes)

**Notable persistent issues:**
- Coverage threshold at 65% vs SPEC's 80% — 15pp gap, no change in 6 rounds
- 5 carryover tools bypass createToolRunner (down from 7 in Round 12)

### Round 14 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 5 P2, 4 P3. Key issues: read-github-issue incomplete createToolRunner migration; coverage threshold gap; sync-memory-index redundant catch; review-threads stderr.write+return1.

### Round 13 — 2026-06-05

**Verdict**: Needs Work — 4 P1, 10 P2, 8 P3. Key issues: open-github-issue stderr.write before throw; sync-memory-index createToolRunner regression; 8 test failures; coverage 69% vs 80% SPEC.

### Round 12 — 2026-06-05

**Verdict**: Needs Work — 7 P1, 16 P2, 11 P3. Key issues: open-github-issue generic Error regression; review-threads outer catch; coverage threshold at 69%; 7 tools bypass createToolRunner.

### Round 11 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 12 P2, 10 P3. Coverage threshold at 69%; open-github-issue inner catch formats UserInputError with "Error:" prefix; review-threads 6 inner try/catch blocks; CI workflow missing build step.

### Round 10 — 2026-06-05

**Verdict**: Needs Work — 2 P1, 6 P2, 8 P3. Coverage threshold 65%, generate-storyboard-images generic Error, architecture bypasses createToolRunner.

### Round 9 — 2026-06-04

**Verdict**: Needs Attention — 5 P2, 8 P3. Three tools bypass AppError, missing dependency declarations, coverage exclusion masks tools.

### Earlier rounds

Rounds 1-8: progressive resolution of 1 P0 (create-specs args missing), multiple P1/P2/P3 findings.
