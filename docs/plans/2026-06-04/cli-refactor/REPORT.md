# Review Report — Round 13

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-05
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 4 P1 findings identified. The Round 12 fix commit resolved 34 issues but introduced a significant regression in `sync-memory-index` (createToolRunner removed, replaced with hand-rolled handler with generic `Error:` prefix). 8 tests are now failing across 3 test files. `open-github-issue` resolveRepoAsync still writes stderr before throw despite the fix claim. Coverage threshold remains at 69% — 11 points below the SPEC's 80%. Functions coverage (67.63%) is below the 68% threshold but `--check-coverage` is absent so it is not enforced.

**Progress since Round 12**: 3 tools wrapped in createToolRunner (`read-github-issue`, `validate-skill-frontmatter`, `validate-openai-agent-config`). FLAG_MAP hallucinated bridge removed. CI shell:bash added. `formatAppError` extracted as shared utility. "Legacy" comment fixed. PlatformAdapter `normalizePath` dead code removed. But `sync-memory-index` was UN-converted from createToolRunner, and open-github-issue/review-threads were not re-wrapped.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial | 15/21 tools use createToolRunner; sync-memory-index regressed from createToolRunner to hand-rolled | 1 P1, 4 P2, 3 P3 |
| Req 2 — Cross-platform abstraction | ✅ Complete, with dead code | `packages/tool-utils/platform-adapter.ts` — EOL defined but never consumed; normalizePath removed | 0 P0/P1, 2 P2, 1 P3 |
| Req 3 — Unified error handling | ⚠️ Partial — regressions | `formatAppError` extracted; open-github-issue double-write persists; sync-memory-index generic `Error:` prefix | 2 P1, 4 P2, 2 P3 |
| Req 4 — Coverage >= 80% + CI matrix | ❌ Not met | 69% lines threshold vs 80% SPEC; 8 test failures; functions coverage (67.63%) below threshold (68%), not enforced | 2 P1, 4 P2, 2 P3 |
| Req 5 — Dispatch isolation | ✅ Complete, with gap | 3 parser classes; dispatch table; unified HelpTextBuilder; Map + if-else chain acknowledged tradeoff (FIX-16) | 0 P0/P1, 1 P2, 1 P3 |

---

## Cross-requirement Interaction Summary

**Requirement Groups:**

| Group | Requirements | Interaction Type | Summary |
|---|---|---|---|
| A | Req 1, Req 3 | Shared modules, functional coupling | Tools bypassing createToolRunner lose both schema-based arg parsing (Req 1) AND typed error formatting (Req 3). sync-memory-index is a regression — was using createToolRunner, now has hand-rolled handler with generic `Error:` prefix. open-github-issue still has double-write (stderr hint + same-message UserInputError) |
| B | Req 4 | Isolated (coverage + CI) | Coverage thresholds, test failures, and CI configuration are self-contained |
| C | Req 2 | Isolated | PlatformAdapter independent of other requirements |
| D | Req 5 | Isolated | Dispatch isolation is self-contained |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **open-github-issue: resolveRepoAsync writes stderr before throwing UserInputError — duplicate output persists**: Both failure paths (git remote fails, L768-771; origin not a GitHub URL, L779-782) write a human-readable hint to `context.stderr` THEN throw a `UserInputError` with the same message. The CLI boundary's `formatAppError` catches the `UserInputError` and writes the message again without prefix. User sees duplicate output: "Unable to resolve origin remote...\nUnable to resolve origin remote..." | Duplicate error output confuses users. The Round 12 commit claimed "remove stderr.write+before-throw" but the stderr.write calls were NOT removed — only the generic `Error` was changed to `UserInputError` | `packages/tools/open-github-issue/index.ts` | L768-782 | Spec implementation deviation | Req 3 |
| 2 | **sync-memory-index: createToolRunner removed in Round 12 fix — regression from schema-based to hand-rolled handler with generic error formatting**: The Round 12 fix commit replaced `createToolRunner(schema)` with a direct `syncMemoryIndexHandler` function. The handler's catch block (L116-119) writes `Error: ${(err as Error).message}\n` for ALL error types — UserInputError, SystemError, and generic Error all get the same `Error:` prefix. `formatAppError` is not called, so type-aware formatting is completely lost. Arg parsing also regressed from schema-based declarations to inline for-loop. | REGRESSION — tool was compliant with both Req 1 and Req 3. Now violates both. The generic `Error:` prefix means UserInputError incorrectly shows "Error:" head. SystemError loses stack trace. This causes 4 test failures (sync-memory-index-error.test.js: 3, sync-memory-index-system-error.test.js: 1) | `packages/tools/sync-memory-index/index.ts` | L88-119 | Spec implementation deviation | Req 1, Req 3 |
| 3 | **8 test failures across 3 test files — CI pipeline does not pass**: Running `COVERAGE=true npm test` produces exit code 1 with 8 failures: (a) `schema-arg-validation.test.js` (2 failures): Architecture falsely classified as createToolRunner (comments contain the string) — strict mode flags test and uniformity test fail; (b) `sync-memory-index-error.test.js` (3 failures) + `sync-memory-index-system-error.test.js` (1 failure): Tests expect createToolRunner-style formatting but handler now uses generic `Error:` prefix; (c) `architecture/dist/index.test.js` (2 failures): Handler throws typed errors, tests expect return code 1 | CI pipeline does not pass. Any commit will fail CI, blocking automated deployment. Tests were not updated after code changes in Round 11/12 | `test/tools/schema-arg-validation.test.js`, `test/tools/sync-memory-index-error.test.js`, `test/tools/sync-memory-index-system-error.test.js`, `packages/tools/architecture/dist/index.test.js` | Multiple | Spec implementation omission | Req 4 |
| 4 | **Coverage threshold at 69% vs SPEC's 80% requirement**: `scripts/test.sh` L12 sets `--test-coverage-lines=69`. SPEC Req 4 requires `>= 80%`. Group 2 (package tests) achieves 69.31% lines — 10.69 points below the spec. Functions coverage (67.63%) is also below the 68% threshold but `--check-coverage` is absent so this is not enforced. Coverage thresholds have not been raised from Round 12 | Any CI run with line coverage between 69% and 79.99% passes despite violating the spec. A regression dropping 11 points of coverage would not be caught | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 5 | **6 in-scope tools still bypass createToolRunner**: `architecture` (known carryover — subcommand complexity), `codegraph` (known — subcommand complexity), `find-github-issues`, `open-github-issue`, `review-threads`, `sync-memory-index` (REGRESSION — was createToolRunner). Each uses hand-rolled parseArgs loops (aggregate ~365 lines). DESIGN.md §2.3 states "All tools use `node:util.parseArgs` with schema declaration". sync-memory-index was compliant in Round 12 and was downgraded | Each tool duplicates argument parsing, error handling, and help text generation. Help text is inconsistent. `--help` flags don't work on non-adapter tools. sync-memory-index was compliant and was regressed | `packages/tools/*/index.ts` (6 files) | Various | Spec implementation deviation | Req 1 |
| 7 | **PlatformAdapter `EOL` property never consumed**: The adapter exposes an `EOL` property wrapping `os.EOL` per SPEC Req 2 notes. However, no production code reads `adapter.EOL`. All manifest file writes hardcode `\n`. The normalizePath method was removed (good) but EOL is dead API surface | SPEC requirement for unified EOL handling is unimplemented in practice. Future file-writing code is more likely to copy existing `\n` patterns than discover `adapter.EOL` | `packages/tool-utils/src/platform-adapter.ts` | Interface definition | Spec implementation omission | Req 2 |
| 8 | **Functions coverage threshold 68% vs CHECKLIST CL-08 75%**: `scripts/test.sh` sets `--test-coverage-functions=68`. CHECKLIST.md CL-08 specifies `--test-coverage-functions=75`. Actual function coverage is 67.63% — below BOTH thresholds | CHECKLIST-constrained threshold is unmet by the config file AND actual coverage falls short. `--check-coverage` is absent so neither threshold is enforced | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |
| 9 | **Split-process coverage prevents unified 80% report**: Group 1 (stable tests) and Group 2 (package tests) run in separate `node --experimental-test-coverage` processes. Each produces independent reports. Group 1: 77.31% lines, Group 2: 69.31% lines. Neither reaches 80%. Combined single-process is ~80% per script comment | SPEC's coverage requirement cannot be verified by the current test setup. The 69% threshold was chosen for Group 2, not because total coverage is 69% | `scripts/test.sh` | L29-40 | Spec implementation omission | Req 4 |
| 10 | **`-check-coverage` flag absent — coverage thresholds not enforced**: The `--test-coverage-lines`, `--test-coverage-branches`, and `--test-coverage-functions` flags set thresholds but without `--check-coverage` they only report, never fail. Functions coverage (67.63%) is below the configured 68% threshold but CI still passes | Coverage can drop below configured thresholds without CI failure. The 69%/60%/68% thresholds are advisory only, creating a false sense of enforcement | `scripts/test.sh` | L12 | Architecture defect | Req 4 |
| 11 | **open-github-issue: Direct handler bypasses CLI boundary's formatAppError for some paths**: The tool handler is `openGitHubIssueHandler` (direct, not wrapped by createToolRunner). When `resolveRepoAsync` throws UserInputError (L771, L782), the error propagates as a rejected promise through `runTool()` to the CLI boundary where `formatAppError` handles it correctly. However, paths that return 0/1 directly (e.g., publish failure L888-901 returns 0 despite error) bypass the boundary entirely | Future maintainers may add return-1 error paths that bypass unified formatting. The publish failure returning 0 is a pre-existing risk (exit code inconsistency) | `packages/tools/open-github-issue/index.ts` | L693, L888-901 | Architecture defect | Req 3 |
| 12 | **review-threads: Direct handler bypasses createToolRunner**: The tool was removed from createToolRunner in Round 8/9 and not re-wrapped. While error throwing is now correct (all UserInputError/SystemError), there is no schema-based arg parsing, no --help generation, and no structured output. Arg parsing is a 63-line hand-rolled while-loop | Same boilerplate duplication as other non-adapter tools. Error propagation works but type-aware formatting is only achieved if the CLI boundary catches the error correctly | `packages/tools/review-threads/index.ts` | L66-128 | Spec implementation deviation | Req 1 |
| 13 | **Multiple tools write manual `Error:` prefix instead of using `formatAppError`**: `eval/executor.ts` (L154, L552, L558), `eval/scorer.ts` (L504, L567), `eval/optimizer.ts` (L1296-L1356), `generate-storyboard-images/index.ts` (L316, L329), `codegraph/lib/cmd-survey.ts` (L55), `codegraph/lib/cmd-verify.ts` (L116) all write to stderr with manual `Error:` prefix or use `console.error` directly | Inconsistent error formatting across the codebase. Tools outside createToolRunner use diverse error patterns. eval is out-of-scope for createToolRunner adoption but its error formatting still deviates from the project standard | Multiple files in `packages/tools/eval/`, `packages/tools/generate-storyboard-images/`, `packages/tools/codegraph/` | Various | Spec implementation deviation | Req 3 |
| 14 | **Dispatch table requires both Map entry + if-else chain for new commands**: `parseArguments()` has a `Map` dispatch table selecting parsers (L69-75), but also an if-else chain (L82-146) to reshape each parser's typed result into `ParsedArguments`. FIX-16 comment (L78-81) acknowledges this tradeoff. Adding a new command requires modifying two places | SPEC Req 5 requires "dispatch table entries can be added/removed independently". Current design achieves parser selection independence but not full dispatch entry independence | `packages/cli/index.ts` | L69-146 | Architecture defect | Req 5 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 15 | **open-github-issue: Issue publish failure returns 0**: When both `createIssueWithGh` and `createIssueWithToken` fail, the handler writes the publish error to stderr but returns 0 (success). By design as draft mode fallback, but violates strict interpretation of "don't exit with 0 on error" | Business logic exception to the error handling convention. User sees stderr.write but exit code 0 | `packages/tools/open-github-issue/index.ts` | L888-901 | Spec implementation deviation | Req 3 |
| 16 | **validate-skill-frontmatter and validate-openai-agent-config: extractFrontmatter still throws generic Error**: Both tools' `extractFrontmatter` functions throw generic `Error` for frontmatter issues (delimiter missing, invalid YAML). These are caught internally by `validateSkill` and converted to error strings. While this doesn't violate the boundary, the internal throws use `Error` instead of `UserInputError` | Minor inconsistency. Would be cleaned up if these were converted to typed errors internally | `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts` | L19, L26, L24, L31, L36 | Spec implementation deviation | Req 3 |
| 17 | **architecture: Unknown subcommands delegate to legacy JS CLI boundary**: For subcommands other than "apply" and "template", the handler delegates to JS `cli.dispatch()` which has its own try/catch writing `e.message` to stderr. Typed errors from the JS CLI path never reach the TS error boundary | Transitional gap. JS CLI handles its own errors, but they use different formatting than TS boundary | `packages/tools/architecture/index.ts` | L610-629 | Architecture defect | Req 3 |
| 18 | **Coverage exclude glob `packages/tools/eval/**` untested on Windows**: The `--test-coverage-exclude` glob may not match Windows-style backslash paths. If the glob silently fails, eval files would be included in coverage, dragging down reported percentages | Unverified Windows behavior. Could cause coverage drops on Windows CI without clear signal | `scripts/test.sh` | L12 | Architecture defect | Req 4 |
| 19 | **all-tools-known.test.js duplicates tool names from source of truth**: Hardcodes a 21-entry `TOOL_NAMES` array duplicating `TOOL_MODULE_NAMES` from `tool-registration.ts`. When a tool is added or removed, both must be updated | Maintenance burden: two sources of truth when a tool is added/removed | `test/tool-registry/all-tools-known.test.js` | L6-28 | Redundant code | Req 4 |
| 20 | **schema-conversion-smoke.test.js `HELP_SKIP` list manually maintained**: 7 tools in the `HELP_SKIP` set. If any later supports `--help`, this list must be updated manually with no staleness detection | Maintenance burden: skip list can become stale without CI signal | `test/tools/schema-conversion-smoke.test.js` | L37-45 | Redundant code | Req 4 |
| 21 | **No test verifies coverage exclude pattern works**: No CI step or test confirms the `eval/**` exclusion actually functions. A Node.js version-upgrade that changes glob semantics could silently include eval files | Coverage numbers could be inaccurate without clear signal | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |
| 22 | **sync-memory-index: RenderSection code has unused escapeRegex function**: `escapeRegex` (L68-70) is defined but never called — `removeExistingSection` uses a RegExp constructor but the pattern string is manually escaped, not via `escapeRegex` | Dead code that increases maintenance surface | `packages/tools/sync-memory-index/index.ts` | L68-70 | Redundant code | Req 1 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Spec implementation omission | 6 |
| Spec implementation deviation | 7 |
| Architecture defect | 4 |
| Redundant code | 4 |

---

## Review History

### Round 13 — 2026-06-05

**Verdict**: Needs Work — 4 P1, 10 P2, 8 P3 findings identified after Round 12 resolution.

**Resolved from Round 12:**
- P1-1 (open-github-issue generic Error → UserInputError): ⚠️ **Partial** — typed errors restored but stderr.write before throw NOT removed (carried forward as new P1-1)
- P1-2 (open-github-issue all 16+ generic Error throws): ✅ **Verified** — now exclusively UserInputError/SystemError
- P1-3 (review-threads outer catch): ✅ **Verified** — outer catch removed; errors propagate to CLI boundary
- P1-4 (review-threads 7 generic Error throws): ✅ **Verified** — now exclusively UserInputError/SystemError
- P1-5 (coverage threshold 69% vs 80%): ❌ **Carried forward unchanged** — still P1-4 this round
- P1-6 (7 tools bypass createToolRunner): ⚠️ **Improved but not resolved** — 3 tools wrapped (read-github-issue, validate-skill-frontmatter, validate-openai-agent-config), but sync-memory-index regressed
- P1-7 (CLI error boundary partial coverage): ⚠️ **Partial** — formatAppError shared utility extracted, but 4 direct tools (open-github-issue, review-threads, find-github-issues, sync-memory-index) + architecture + codegraph still bypass boundary
- P2-5 (open-github-issue FLAG_MAP hallucinated bridge): ✅ **Verified** — 42-line bridge removed
- P2-11 (PlatformAdapter EOL never consumed): ❌ **Carried forward**
- P2-12 (sync-memory-index uses PlatformAdapter homeDir): ✅ **Verified** — now uses `createPlatformAdapter().homeDir()`
- P2-14 (validate tools stdout+return1): ✅ **Verified** — both tools now wrapped in createToolRunner
- P2-15 (functions threshold 67% → 68%): ⚠️ **Partial** — raised to 68% but still below CHECKLIST 75%
- P2-16 (Windows CI shell:bash): ✅ **Verified** — shell:bash added to CI workflow
- P2-21 (find-github-issues dead import): ✅ **Verified** — createToolRunner import removed
- P3-26 (normalizePath dead code): ✅ **Verified** — removed from PlatformAdapter

**Regressions introduced by Round 12 fix:**
- 🔴 **sync-memory-index: createToolRunner was removed, replaced with hand-rolled handler** — was compliant in Round 12, now violates Req 1 and Req 3
- 🔴 **8 test failures** — schema-arg-validation (2), sync-memory-index error tests (4), architecture dist tests (2). Tests not updated after code changes
- 🔴 **Functions coverage (67.63%) below threshold (68%)** — threshold not enforced because --check-coverage absent

**Notable persistent issues:**
- open-github-issue resolveRepoAsync still writes stderr before throw (Round 12 fix claim was inaccurate)
- 6 in-scope tools still bypass createToolRunner (down from 8 in Round 11, but sync-memory-index regressed)
- Coverage at 69% threshold vs SPEC's 80% — no change in 4 rounds
- Functions coverage 67.63% below 68% threshold. --check-coverage absent so unenforced
- PlatformAdapter EOL dead API — defined but never consumed

### Round 12 — 2026-06-05

**Verdict**: Needs Work — 7 P1, 16 P2, 11 P3. Key issues: open-github-issue generic Error regression; review-threads outer catch; coverage threshold at 69%; 7 tools bypass createToolRunner; CLI boundary partial coverage.

### Round 11 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 12 P2, 10 P3. Key issues: coverage threshold at 69%; open-github-issue inner catch formats UserInputError with "Error:" prefix; review-threads 6 inner try/catch blocks; CI workflow missing build step.

### Round 10 — 2026-06-05

**Verdict**: Needs Work — 2 P1, 6 P2, 8 P3. Coverage threshold 65%, generate-storyboard-images generic Error, architecture bypasses createToolRunner.

### Round 9 — 2026-06-04

**Verdict**: Needs Attention — 5 P2, 8 P3. Three tools bypass AppError, missing dependency declarations, coverage exclusion masks tools.

### Round 8 — 2026-06-04

**Verdict**: Needs Attention — 8 P2, 13 P3. Architecture bypasses createToolRunner, PlatformAdapter singleton broke testability.

### Round 7 — 2026-06-04

**Verdict**: Needs Work — 1 P1 (generate-storyboard-images multiple:true), 11 P2, 7 P3.

### Round 6 — 2026-06-04

**Verdict**: Needs Work — 1 P1 (search-logs multiple:true), 2 P3.

### Round 5 — 2026-06-04

**Verdict**: Needs Attention — 4 P2, 4 P3.

### Round 4 — 2026-06-04

**Verdict**: Needs Work — 1 P1 (Windows CI bash), 11 P2, 9 P3.

### Rounds 1-3 — 2026-06-04

Rounds 1-3: P0 (create-specs args missing), P1 × 5, P2 × 26, P3 × 15. Progressive resolution.
