# Review Report — Round 14

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-06
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 3 P1 findings identified. All 632 tests pass with no failures (resolved the 8 test failures from Round 13). The open-github-issue stderr.write regression and sync-memory-index createToolRunner regression are both resolved. However, a new regression in read-github-issue was discovered (incomplete createToolRunner migration breaks `--repo`, `--json`, `--comments` flags), and the coverage threshold gap against the SPEC's 80% requirement persists.

**Progress since Round 13**: 8 test failures resolved, open-github-issue stderr.write before throw removed, sync-memory-index createToolRunner restored, validate tools imports restored, open-github-issue publish returns 1, coverage thresholds stabilized at 65/60/65 with post-hoc grep enforcement, carryover documentation added for 4 tools, handler-error-propagation regression tests added. However, read-github-issue was found to have a broken createToolRunner migration (schema only declares `help`) that went unnoticed through Round 13.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial — regression | 14/21 tools use createToolRunner (sync-memory-index restored, validate tools restored). read-github-issue partially wrapped but --repo/--json/--comments broken (regression). 4 documented carryover tools: architecture, codegraph, find-github-issues, review-threads | 2 P1, 0 P2, 1 P3 |
| Req 2 — Cross-platform abstraction | ✅ Complete with documented gap | `packages/tool-utils/platform-adapter.ts` — interface + 2 implementations. EOL property documented as unused with REPORT.md reference | 0 P1, 1 P2, 1 P3 |
| Req 3 — Unified error handling | ✅ In-scope tools compliant | open-github-issue stderr.write removed; sync-memory-index formatAppError restored; validate tools UserInputError + createToolRunner wrappers; review-threads 1 stderr.write+return1 path remaining | 0 P1, 2 P2, 0 P3 |
| Req 4 — Coverage >= 80% + CI matrix | ⚠️ Partial — gap vs SPEC | Threshold 65% vs SPEC 80%; no combined coverage aggregation; CI matrix (ubuntu + windows) correctly configured with shell:bash; all tests pass | 1 P1, 1 P2, 3 P3 |
| Req 5 — Dispatch isolation | ✅ Complete with tradeoff | 3 parser classes, dispatch table, unified HelpTextBuilder. Map + if-else chain tradeoff acknowledged (FIX-16) | 0 P1, 1 P2, 0 P3 |

---

## Cross-requirement Interaction Summary

**Requirement Groups:**

| Group | Requirements | Interaction Type | Summary |
|---|---|---|---|
| A | Req 1, Req 3 | Shared modules, same-file modifications | read-github-issue incomplete createToolRunner migration affects both boilerplate (Req 1 — schema missing real options) and error handling (Req 3 — handler not called for flag args). sync-memory-index redundant catch is a Req 3 issue within a createToolRunner-wrapped tool (Req 1) |
| B | Req 4 | Isolated (coverage + CI config) | Coverage thresholds, test failures, and CI configuration are self-contained |
| C | Req 5 | Isolated (dispatch logic) | CLI dispatch architecture is separate from tool handler concerns |
| D | Req 2 | Isolated (PlatformAdapter) | PlatformAdapter is foundational but interacts minimally; EOL gap affects file writes across all tools but is independently scoped |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **read-github-issue: incomplete createToolRunner migration breaks `--repo`, `--json`, `--comments`**. Schema only declares `help` in options; with `strict:true` (default), `node:util.parseArgs` rejects all undeclared flags with `ERR_PARSE_ARGS_UNKNOWN_OPTION`. The handler's internal `parseArgs()` never receives these flags — only positional issue numbers pass through. Original FIX-02b wrapping (0ca38ea) properly declared all 4 options and used `values.*` — this regression was introduced in Round 12 fix (52a42a6) which changed to the minimal schema + passthrough pattern | Three documented tool flags are non-functional. Cross-repo issue reading (--repo) requires workaround. JSON output mode (--json) and comments display (--comments) require workaround. `--help` works correctly | `packages/tools/read-github-issue/index.ts` | L181-186 | Spec implementation deviation | Req 1, Req 3 |
| 2 | **Coverage threshold (65%) does not meet SPEC requirement (80%)**. `scripts/test.sh` enforces `--test-coverage-lines=65`. SPEC Req 4 mandates `>= 80%`. Script comments acknowledge the gap: "threshold is 65% due to the split-process limitation". Current measured coverage: Group 1 = 77.48%, Group 2 = 69.29% — both individually below 80%. Combined (~80%) is an informal estimate with no verification tooling | SPEC coverage requirement unmet by 15 percentage points. CI can pass with per-group coverage as low as 65% while combined coverage is well below 80% | `scripts/test.sh` | L8-9, L21 | Spec implementation omission | Req 4 |
| 3 | **read-github-issue missing carryover documentation**. Unlike the 4 other tools with documented partial migration (find-github-issues L182, review-threads L529, open-github-issue L796, architecture L588), read-github-issue has no JSDoc comment explaining its incomplete createToolRunner state, known limitations, or migration intent | Maintenance hazard: future developers unaware of broken flags may think the tool is fully migrated | `packages/tools/read-github-issue/index.ts` | L175-187 | Spec implementation omission | Req 1 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 4 | **PlatformAdapter `EOL` property never consumed** (carried forward from Round 13 P2-7). The adapter exposes `EOL` wrapping `os.EOL` per SPEC Req 2 notes. No production code reads `adapter.EOL`. All file writes use hardcoded `\n` (e.g., sync-memory-index line 60). Documentation comments now reference REPORT.md P2-7, but the gap is unaddressed | SPEC requirement for unified EOL handling unimplemented in practice. New file-writing code copies existing `\n` patterns rather than discovering `adapter.EOL` | `packages/tool-utils/platform-adapter.ts` | L31, L62, L91 | Spec implementation omission | Req 2 |
| 5 | **sync-memory-index: redundant nested catch inside createToolRunner-wrapped handler**. The handler's own catch block (L127-129) calls `formatAppError(stderr, err)` and returns 1. The `createToolRunner` outer catch (schema.ts:101-104) also calls `formatAppError`. For schema-wrapped handlers, errors should propagate to the outer catch rather than being caught internally | Dead error-handling path: the inner catch is the effective one for this tool, making the outer `formatAppError` unreachable for sync-memory-index handler errors. The tool works correctly but has redundant code | `packages/tools/sync-memory-index/index.ts` | L127-129 | Redundant code | Req 1, Req 3 |
| 6 | **review-threads cmdResolve: "no thread IDs selected" uses `stderr.write` + `return 1` instead of throwing `UserInputError`**. The path uses `stderr.write('Error: ...')` and returns 1, bypassing `formatAppError` at the CLI boundary. The UserInputError path also uses a manual "Error: " prefix which is inconsistent with how `formatAppError` formats UserInputError (no prefix) | One error path in an otherwise Req 3-compliant tool deviates from the typed-error convention. UserInputError would be cleaner; the manual "Error: " prefix is redundant with CLI boundary formatting | `packages/tools/review-threads/index.ts` | L506 | Spec implementation deviation | Req 3 |
| 7 | **Group 3 (mock.module) tests excluded from coverage tracking**. Three test files (cmd-init, cmd-list-apis, cmd-survey) run with `--experimental-test-module-mocks` but without `--experimental-test-coverage`. The code they exercise is invisible to coverage reporting | Reported coverage numbers are overstated relative to the full codebase. A coverage regression in mock-dependent code would go undetected | `scripts/test.sh` | L52-56 | Spec implementation omission | Req 4 |
| 8 | **Dispatch table requires Map entry + if-else chain for new commands** (carried forward from Round 13 P2-14). `parseArguments()` uses a Map for parser selection (L69-75) but also an if-else chain (L82-146) to reshape typed results into `ParsedArguments`. FIX-16 comment acknowledges this tradeoff. Ordering dependency: install/uninstall branches must precede tools/tool branch because the same parser reference serves both | Adding a command requires modifying 3 locations (parser class, Map entry, if-else branch) instead of 2. The if-else ordering is implicit and fragile | `packages/cli/index.ts` | L69-146 | Architecture defect | Req 5 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 9 | **read-github-issue: dead flag-handling code in internal `parseArgs()`**. The internal `parseArgs` handles `--repo` (L26), `--comments` (L29), and `--json` (L32) but these flags never reach it — `createToolRunner`'s strict `parseArgs` intercepts them first. Only the default branch (positional issue number) is reachable | Unreachable code increases maintenance surface without benefit. Confuses future readers | `packages/tools/read-github-issue/index.ts` | L14-45 | Redundant code | Req 1 |
| 10 | **Windows path separator risk in `--test-coverage-exclude` glob** (carried forward from Round 13 P3-18). The glob `packages/tools/eval/**` uses forward slashes; may not match Windows backslash paths | If the glob silently fails, eval files would be included in coverage, potentially causing unexplained coverage drops on Windows CI | `scripts/test.sh` | L14, L21 | Architecture defect | Req 4 |
| 11 | **Post-hoc grep enforcement depends on Node.js internal error message format**. `scripts/test.sh:60` greps for `"does not meet threshold"` in test runner output. A Node.js version change to this internal message would silently disable enforcement (grep finds nothing, EXIT stays 0) | Coverage enforcement can silently disappear on Node upgrade. No sanity check verifies the pattern was matched | `scripts/test.sh` | L60 | Architecture defect | Req 4 |
| 12 | **`mktemp` not available on all platforms**. `scripts/test.sh:24` uses POSIX `mktemp`. Available in Git Bash (used by CI via `shell:bash`) and macOS/Linux but not in raw CMD/PowerShell | Local Windows development without Git Bash fails at this line | `scripts/test.sh` | L24 | Architecture defect | Req 4 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Spec implementation omission | 5 |
| Spec implementation deviation | 3 |
| Architecture defect | 3 |
| Redundant code | 2 |

---

## Review History

### Round 14 — 2026-06-06

**Verdict**: Needs Work — 3 P1, 5 P2, 4 P3 findings.

**Resolved from Round 13:**
- P1-1 (open-github-issue resolveRepoAsync stderr.write before throw): ✅ **Verified** — stderr.write calls removed (178d91f). Error paths now throw UserInputError directly. Regression tests confirm single error line with no "Error:" prefix
- P1-2 (sync-memory-index createToolRunner regression): ✅ **Verified** — createToolRunner wrapping restored (001ce3d). Handler now imports `createToolRunner` and `formatAppError`, schema declared with all options
- P1-3 (8 test failures across 3 test files): ✅ **Verified** — all 632 tests pass. Architecture dist tests pass (3/3), sync-memory-index error tests pass (4/4), schema-arg-validation tests pass (33/33)
- P1-4 (coverage threshold 69% vs SPEC 80%): ⚠️ **Status changed, gap persists** — threshold moved to 65% with post-hoc enforcement. Gap still 15pp below 80%
- P2-8 (functions threshold 68% vs CHECKLIST 75%): ✅ Superseded — threshold set to 65% (CHECKLIST CL-08 no longer tracked)
- P2-10 (--check-coverage absent): ✅ **Replaced** — removed in Node 25+ (0376a14). Replaced with post-hoc grep enforcement
- P2-11 (open-github-issue publish returns 0 on failure): ✅ **Verified** — publish failure now returns 1 (4a1d5ae)
- P2-12 (review-threads direct handler bypass): ✅ **Documented** — carryover JSDoc comment added (faf5422)
- P3-15 (open-github-issue publish returns 0): ✅ **Resolved** — changed to return 1
- P3-22 (sync-memory-index escapeRegex dead code): ❌ **False positive** — `escapeRegex` (L68) IS called in `removeExistingSection` (L64). Previous round incorrectly flagged this

**New findings in Round 14:**
- 🔴 **read-github-issue: incomplete createToolRunner migration** — schema only declares `help`; `--repo`, `--json`, `--comments` broken (P1-1)
- 🔴 **read-github-issue missing carryover documentation** — unlike the 4 other carryover tools (P1-3)
- 🟡 **sync-memory-index redundant nested catch** — handler catches error then createToolRunner outer catch also catches (P2-5)
- 🟡 **review-threads cmdResolve stderr.write + return 1** — one error path bypasses formatAppError (P2-6)
- 🟡 **Group 3 excluded from coverage** — mock.module tests untracked (P2-7)
- 🔵 **read-github-issue dead flag-handling code** — unreachable branches in internal parseArgs (P3-9)
- 🔵 **Post-hoc grep depends on Node.js error format** — enforcement can silently disappear (P3-11)
- 🔵 **mktemp not on all platforms** — POSIX utility dependency (P3-12)

**Notable persistent issues:**
- Coverage threshold at 65% vs SPEC's 80% — 15pp gap, no change in 5 rounds
- PlatformAdapter EOL dead API — defined but never consumed, now documented in 2 rounds
- Dispatch table Map + if-else chain tradeoff — unchanged, carries forward
- 4 carryover tools still bypass createToolRunner (down from 7 in Round 12)

### Round 13 — 2026-06-05

**Verdict**: Needs Work — 4 P1, 10 P2, 8 P3. Key issues: open-github-issue stderr.write before throw; sync-memory-index createToolRunner regression; 8 test failures; coverage 69% vs 80% SPEC.

### Round 12 — 2026-06-05

**Verdict**: Needs Work — 7 P1, 16 P2, 11 P3. Key issues: open-github-issue generic Error regression; review-threads outer catch; coverage threshold at 69%; 7 tools bypass createToolRunner; CLI boundary partial coverage.

### Round 11 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 12 P2, 10 P3. Key issues: coverage threshold at 69%; open-github-issue inner catch formats UserInputError with "Error:" prefix; review-threads 6 inner try/catch blocks; CI workflow missing build step.

### Round 10 — 2026-06-05

**Verdict**: Needs Work — 2 P1, 6 P2, 8 P3. Coverage threshold 65%, generate-storyboard-images generic Error, architecture bypasses createToolRunner.

### Round 9 — 2026-06-04

**Verdict**: Needs Attention — 5 P2, 8 P3. Three tools bypass AppError, missing dependency declarations, coverage exclusion masks tools.

### Earlier rounds

Rounds 1-8: progressive resolution of 1 P0 (create-specs args missing), multiple P1/P2/P3 findings.
