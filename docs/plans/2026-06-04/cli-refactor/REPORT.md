# Review Report — Round 17

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-06
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 3 P1 and 8 P2 findings identified. All tests pass with no failures.

**Progress since Round 16**: 16 of 29 findings resolved or verified applied. Key wins: EPERM symlink fallback implemented (`installer.ts:361-375`); coverage thresholds raised to 75/60/65 (G1) and 65/60/65 (G2) with combined weighted ≥ 80% enforcement in `scripts/test.sh`; 3 carryover tools now handle `--help`; storyboard returns non-zero on failure; zombie test renamed; manifest/schema/app-error EOLs use `os.EOL`; ToolNotFoundError branch added; redundant help schemas removed; codegraph catch simplified.

**New P1 findings in Round 17**: Error re-wrapping at 3 sites discards original cause chain (`{ cause: err }` not passed); if-else chain coupling persists (FIX-16 documented but unaddressed for 3 rounds); Group 3 mock.module tests permanently excluded from coverage measurement — combined ≥ 80% is overstated.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial — 4 carryover tools remain; 2 migration orphans; stale HELP_SKIP | 17/21 tools use `createToolRunner`. 4 documented carryover (architecture, codegraph, find-github-issues, open-github-issue, review-threads). enforce-video-aspect-ratio has 75 unused lines from partial migration | 4 P2, 4 P3 |
| Req 2 — Cross-platform abstraction | ⚠️ Partial — PlatformAdapter adopted inconsistently; 5 tools bypass it | EPERM fallback ✅, manifest EOL ✅, schema EOL ✅, app-error/updater EOL ✅. extract-conversations still reads `process.env.CODEX_HOME` directly. syncAgentsFile uses hardcoded `\n`. EPERM warning uses hardcoded `\n`. 4 carryover tools don't consume adapter | 5 P3 |
| Req 3 — Unified error handling | ⚠️ Partial — cause chain lost in 3 re-wrap sites; eval tool creates convention erosion | formatAppError boundary ✅, registry throws ✅, codegraph catch simplified ✅, ToolNotFoundError branch ✅, storyboard returns non-zero ✅. But 3 sites (filter-logs ×2, codegraph ×1) discard cause. eval tool uses process.exit(1), console.error+continue, bypassed AppError | 1 P1, 2 P2 |
| Req 4 — Coverage ≥ 80% + CI matrix | ⚠️ Partial — Group 3 permanently excluded; DESIGN.md thresholds stale | Per-group thresholds ✅, combined weighted ≥ 80% enforcement ✅, CI matrix both platforms ✅. Group 3 excluded inflates reported coverage. DESIGN.md states branches=65 but test.sh enforces 60. Threshold documentation oversimplified as uniform 75/65/65 | 1 P1, 5 P3 |
| Req 5 — Dispatch isolation | ⚠️ Partial — if-else chain persists, dispatch bypass exists, redundant tests overlap | Command parsers independently testable ✅, HelpTextBuilder unified ✅, zombie test renamed ✅. But if-else chain (L91-155) contradicts "independently add/remove entries." Bypass path (L157-173) circumvents dispatch Map. Redundant tests in tool-runner.test.js | 1 P1, 2 P2, 1 P3 |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Error re-wrapping at 3 sites discards original cause chain** — `filter-logs/index.ts` L51 and L78 catch errors and wrap with `throw new SystemError((err as Error).message)` without passing `{ cause: err }` as `ErrorOptions`. `codegraph/index.ts` L137 does the same. The original error object — including stack trace and nested cause chain — is unreachable after re-wrapping. W19 fixed open-github-issue but missed these 3 sites | Original error cause lost. Debugging quality reduced for errors originating in wrapped calls. `formatAppError` cannot show the root cause chain | `packages/tools/filter-logs/index.ts` | L51, L78 | Spec implementation omission | Req 3 |
| 2 | **if-else chain couples dispatcher to parser outputs** — `parseArguments` L91-155 contains a 65-line if-else chain that reshapes each parser's typed output into the unified `ParsedArguments` interface. FIX-16 comment (L78-89) acknowledges: "adding a new command requires 3 locations" — parser class, `Map.set()`, and if-else branch. This contradicts SPEC Req 5's "dispatch table entries can be independently added or removed without affecting other commands" | Adding a command type requires modifying 3 locations, 2 in the same function. The dispatch table acts as a parser-lookup map rather than a true routing table | `packages/cli/index.ts` | L91-155 | Spec implementation deviation | Req 5, Req 1 |
| 3 | **Group 3 (mock.module) tests permanently excluded from coverage** — Three codegraph test files (`cmd-init.test.js`, `cmd-list-apis.test.js`, `cmd-survey.test.js`) execute via `run_test_group` in `scripts/test.sh` L150-154, which passes `--experimental-test-module-mocks` but not `--experimental-test-coverage` (incompatible flags). Code exercised by these tests is invisible to coverage reporting | Combined coverage overstated. Regression in mock-dependent code goes undetected. Per-group enforcement cannot catch coverage drops in Group 3-tested modules | `scripts/test.sh` | L10-18, L150-154 | Spec implementation omission | Req 4 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 4 | **Dispatch table bypass for direct tool names** — `parseArguments` L157-173 has a separate routing path: when `argv[0]` is a known tool name (checked via `isKnownToolName()`), routing goes directly to `toolParser.parse(argv)` without consulting the `commandParsers` Map. The runtime has two routing paths, contradicting DESIGN.md's "dispatch table as the sole routing mechanism" | Map modifications don't affect tool routing. Adding a tool to `TOOL_NAMES` auto-registers it in the bypass path — no table entry needed. The dispatch table is not the sole router | `packages/cli/index.ts` | L157-173 | Architecture defect | Req 5, Req 1 |
| 5 | **Redundant `parseArguments` tests across two files** — `test/tool-runner.test.js` L22-26 contains a compressed subset that duplicates coverage of three tests in `test/cli/dispatch-table.test.js` L13-31 (install/uninstall/tools-help dispatch). Both files must be updated if `parseArguments` dispatch logic changes — a maintenance trap the W12 fix was supposed to resolve | Duplicate tests increase maintenance burden without coverage value. W12 claimed removal but this overlap persists | `test/tool-runner.test.js` | L22-26 | Redundant code | Req 5 |
| 6 | **Eval tool creates convention erosion risk** — Registered in `tool-registration.ts` and dispatched like any standard tool, but `eval/index.ts` uses hand-rolled `parseArgs()` (L86-146), local `try/catch` + `stderr.write` + `return 1` instead of `AppError` (L407-412), calls `process.exit(1)` directly (L416), uses `console.error()` with continue pattern (executor.ts L154/L552/L558, scorer.ts L504/L567), and never uses `PlatformAdapter` or `os.EOL`. SPEC.md L28 excludes eval from scope, but its presence in `packages/tools/` provides a simpler, non-conforming implementation for any developer to copy | Convention erosion risk — any developer looking at `packages/tools/` sees two contradictory patterns. The non-conforming pattern has less ceremony, making it more attractive to copy for new tools | `packages/tools/eval/index.ts` | L86-146, L303, L407-418, L416 | Architecture defect | Req 1, Req 2, Req 3 |
| 7 | **PlatformAdapter adoption gaps in 5 tools** — `extract-conversations/index.ts` L7-10 reads `process.env.CODEX_HOME` directly instead of going through `PlatformAdapter.homeDir()`. 4 carryover tools (codegraph, find-github-issues, open-github-issue, review-threads) do not use PlatformAdapter at all for any cross-platform operations. This contradicts DESIGN.md's "all platform operations through the adapter" target state | Inconsistent cross-platform behavior across tools. Windows behavior gaps likely in unadapterd tools. The abstraction's value diminishes as adoption falters | `packages/tools/extract-conversations/index.ts`; carryover tools | L7-10 | Spec implementation deviation | Req 2, Req 1 |
| 8 | **Mixed EOL in syncAgentsFile** — `sync-memory-index/index.ts` L85-89 builds `AGENTS.md` content using hardcoded `\n` for concatenating `base` and `sectionText`, even though `sectionText` was built via `renderSection()` using `os.EOL`. L86-88 explicitly documents this as an intentional exception for AGENTS.md readability | Mixed line endings on Windows in `AGENTS.md` (LF vs CRLF within same file). Violates the cross-platform EOL abstraction for file writes | `packages/tools/sync-memory-index/index.ts` | L85-89 | Spec implementation deviation | Req 2 |
| 9 | **High collision density in `cli/index.ts`** — Three requirements (Req 1 dispatch integration, Req 3 error boundary, Req 5 parser isolation) modify overlapping regions: L55-190 (dispatch table + if-else chain + bypass) and L349-360 (error pattern documentation). Future work on any of these requirements risks merge conflicts requiring deep dispatch logic knowledge | Complex merge conflicts. Three requirements touching same 135-line region creates high coordination cost | `packages/cli/index.ts` | L55-190, L349-360 | Architecture defect | Req 1, Req 3, Req 5 |
| 10 | **Stale HELP_SKIP test set** — `schema-conversion-smoke.test.js` L40-42 excludes architecture, render-error-book, and render-katex from `--help` validation, described as "Tools without createToolRunner wrapping or with complex subcommand dispatch." Both render-error-book and render-katex now use `createToolRunner` and should be removable from HELP_SKIP. Only architecture legitimately remains | Test coverage gap — `--help` regression in render-error-book or render-katex would go undetected. The exclusion set has not been updated since tool migration | `test/tools/schema-conversion-smoke.test.js` | L40-42 | Spec implementation omission | Req 1 |
| 11 | **Hardcoded `\n` in EPERM fallback warning** — `installer.ts` L369 uses hardcoded `\n` for the warning message rather than `os.EOL` or `adapter.EOL`, even though the same function uses `adapter.symlinkType()` for other platform-specific behavior | Aesthetic inconsistency within the same function. Functionally identical on Windows terminals (stdio auto-translates `\n`) | `packages/cli/installer.ts` | L369 | Architecture defect | Req 2 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 12 | **formatAppError JSDoc omits ToolNotFoundError** — JSDoc at L77-81 lists UserInputError, SystemError, AppError (generic), and Other formatting behavior, but does not mention the ToolNotFoundError branch added at L90-91 | Documentation out of sync with implementation. Developers reading JSDoc would not know ToolNotFoundError has its own formatting | `packages/tool-utils/app-error.ts` | L77-81 | Architecture defect | Req 3 |
| 13 | **Stale Batch 4/5 migration comments** — `tool-runner.test.js` L6-7: "tools are not yet registered in the new registry (Batch 4)" — tools ARE registered. L29-30: "No tools registered yet (will be populated in Batch 5)" — stale timeline | Misleading documentation about current registration state | `test/tool-runner.test.js` | L6-7, L29-30 | Hallucinated code | Req 5 |
| 14 | **DESIGN.md branch threshold mismatch — 65 stated vs 60 enforced** — All six references to per-process branch thresholds in DESIGN.md state 65 (L20, L75, L133, L138, L177, L193). Actual enforcement in `scripts/test.sh` uses 60 for both Group 1 and Group 2 | DESIGN.md is not a reliable spec reference for threshold values. 5pp gap unlikely to prevent ≥ 80% but documentation is incorrect | `docs/plans/2026-06-04/cli-refactor/DESIGN.md` | L20, L75, L133, L138, L177, L193 | Spec implementation omission | Req 4 |
| 15 | **DESIGN.md oversimplifies thresholds as uniform 75/65/65** — Does not document the two-tier per-group structure: Group 1 (`test/`) = 75/60/65, Group 2 (`packages/`) = 65/60/65. The 10pp line threshold gap between groups and 5pp branch gap from stated values are undocumented | Architecture decision record diverges from implementation reality. Cannot determine actual thresholds from DESIGN.md alone | `docs/plans/2026-06-04/cli-refactor/DESIGN.md` | L20, L75, L133, L138, L177, L193 | Spec implementation omission | Req 4 |
| 16 | **Stale CI workflow comment** — `.github/workflows/test.yml` L23-24 states: "Coverage thresholds (65/60/65) enforced via post-hoc grep (Node 25+)." Three inaccuracies: (a) thresholds are 75/60/65 (G1) and 65/60/65 (G2), not uniform 65/60/65; (b) enforcement is via `test.sh`'s `run_coverage_group` bash function, not post-hoc grep; (c) workflow uses Node 22, not Node 25+ | Misleading CI configuration documentation | `.github/workflows/test.yml` | L23-24 | Spec implementation omission | Req 4 |
| 17 | **Windows glob warning in test.sh inaccurate for CI** — `scripts/test.sh` L19-21 warns `test/**/*.test.js` "will not expand correctly on Windows." CI workflow uses `shell: bash` (Git Bash), which handles forward slashes correctly. Glob is also a Node.js `--test` argument, not a shell glob | Misleading warning could cause unnecessary concern about Windows CI failures | `scripts/test.sh` | L19-21 | Spec implementation omission | Req 4 |
| 18 | **Eval scope boundary leak in test discovery** — SPEC.md L28 explicitly excludes `@laitszkin/tool-eval` from refactoring scope, but `scripts/test.sh` does not filter out 8 eval test files from Group 2 execution or use `--test-coverage-exclude` to exclude eval source. Coverage percentage is partially determined by out-of-scope code | Reported coverage may fluctuate due to changes in excluded code. Scope boundary leak between declared scope and measured scope | `scripts/test.sh` | L128 | Spec implementation omission | Req 4 |
| 19 | **enforce-video-aspect-ratio unused parseArgs** — ~75 lines of dead code (L21-95: `parseArgs` function, `AspectArgs` interface, `help` field) from pre-migration era not removed after `createToolRunner` adoption at L379 | Dead code adds unnecessary maintenance surface area. Missed cleanup after schema migration | `packages/tools/enforce-video-aspect-ratio/index.ts` | L21-95 | Redundant code | Req 1 |
| 20 | **architecture unused stderr bindings** — Both `handleApply` (L149) and `handleTemplate` (L482) declare `const stderr = context.stderr || process.stderr` but never use `stderr` in the function body. Errors propagate via throws (UserInputError/SystemError) | Dead variable bindings add noise. W1 cleaned similar instances in find-github-issues but architecture was missed | `packages/tools/architecture/index.ts` | L149, L482 | Redundant code | Req 1 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Spec implementation omission | 8 |
| Architecture defect | 5 |
| Spec implementation deviation | 3 |
| Redundant code | 3 |
| Hallucinated code | 1 |

---

## Review History

### Round 17 — 2026-06-06

**Verdict**: Needs Work — 3 P1, 8 P2, 9 P3 findings.

**Resolved from Round 16 (16 of 29 findings verified resolved):**

- **P1-1** (3 carryover tools ignoring `--help`): ✅ **Resolved** — W1/W2/W3 added `--help` handling to all three. REGTEST-01 verifies.
- **P1-2** (EPERM fallback missing): ✅ **Resolved** — W4 re-applied EPERM fallback at `installer.ts:361-375`. degrade-to-copy with warning.
- **P1-3** (coverage 65% vs 80%): ✅ **Resolved** — W5 raised thresholds to 75/60/65 (G1) and 65/60/65 (G2) with combined weighted ≥ 80% enforcement in `scripts/test.sh`. REGTEST-03 verifies.
- **P1-4** (zombie test): ✅ **Resolved** — W7 renamed to match actual behavior. Comment references error-boundary test file.
- **P1-5** (storyboard swallows API failures): ✅ **Resolved** — W6 returns `failures > 0 ? 1 : 0`. REGTEST-04 verifies.
- **P2-7** (manifest `\n`): ✅ **Resolved** — W4 replaced with `adapter.EOL`. REGTEST-05 verifies.
- **P2-8** (schema.ts `\n`): ✅ **Resolved** — W8 replaced with `os.EOL`. REGTEST-06 verifies.
- **P2-9** (registry stderr.write+return1): ✅ **Resolved** — W9 throws `SystemError`/`ToolNotFoundError`. REGTEST-07 verifies.
- **P2-10** (error pattern docs): ✅ **Resolved** — W10 added FIX-10 comment at `cli/index.ts:349-354` documenting both patterns.
- **P2-11** (codegraph catch shadow): ✅ **Resolved** — W11 simplified to pass through AppError subtypes directly.
- **P2-12** (review-threads stdout): ✅ **Resolved** — W3 writes errors to `context.stderr`. REGTEST-08 verifies.
- **P2-14** (combined coverage unenforced): ✅ **Resolved** — W5 added combined weighted enforcement at `scripts/test.sh:156-170`.
- **P3-18** (renderSection default `'\n'`): ✅ **Resolved** — W15 made `eol` a required parameter, no default.
- **P3-19** (storyboard "Error:" prefix): ✅ **Resolved** — W6 removed "Error:" prefix from per-item messages.
- **P3-21** (app-error.ts / updater.ts `\n`): ✅ **Resolved** — W13/W14 replaced with `os.EOL`.
- **P3-23** (ToolNotFoundError branch): ✅ **Resolved** — W13 added dedicated branch at `app-error.ts:90-91`.
- **P3-24** (redundant help schema): ✅ **Resolved** — read-github-issue (L160), validate-skill-frontmatter (L125), validate-openai-agent-config (L219) all cleaned.

**Partially resolved (4 of 29):**

- **P2-17** (redundant parseArguments tests): ⚠️ W12 claimed removal but overlap persists in `tool-runner.test.js L22-26`. Now a P2 finding (#5).
- **P3-22** (error re-wrapping discarding cause): ⚠️ W19 fixed open-github-issue, but filter-logs (L51, L78) and codegraph (L137) still lack `{ cause: err }`. Now a P1 finding (#1).
- **P3-26** (unused stderr): ⚠️ W1 cleaned find-github-issues and review-threads. Architecture (L149, L482) still has unused bindings. Now a P3 finding (#20).
- **P3-27** (DESIGN.md thresholds): ⚠️ W18 updated from 80% to 75/65/65, but new inaccuracies introduced (branch 65 stated vs 60 enforced, threshold structure undocumented). Now P3 findings (#14, #15).

**Not resolved (9 of 29) — carried forward, reclassified:**

- P2-6 (5 carryover tools) → P2 finding (#7 PlatformAdapter gaps)
- P2-13 (Group 3 coverage exclusion) → P1 finding (#3)
- P2-15 (dispatch bypass) → P2 finding (#4)
- P2-16 (if-else chain) → P1 finding (#2)
- P3-20 (extract-conversations CODEX_HOME) → P3 finding (part of #7)
- P3-28 (Windows glob) → P3 finding (#17, reclassified as inaccurate)
- P3-29 (HELP_SKIP stale) → P2 finding (#10)

**New P2 findings in Round 17:**

- 🟡 **Eval tool convention erosion risk** — registered and dispatched like any tool but bypasses all three conventions (createToolRunner, AppError, PlatformAdapter). Creates a non-conforming pattern available for copying (#6)
- 🟡 **Mixed EOL in syncAgentsFile** — hardcoded `\n` concatenation despite documented PlatformAdapter EOL abstraction (#8)
- 🟡 **High collision density in cli/index.ts** — three requirements modify overlapping 135-line region (#9)

**Persistent structural issues (since Round 10–17):**
- 4 carryover tools bypass createToolRunner (down from 7 in Round 14)
- if-else chain documented but unaddressed for 3 rounds (since FIX-16 in Round 14)
- Group 3 coverage exclusion persists since Round 10

### Round 16 — 2026-06-06

**Verdict**: Needs Work — 5 P1, 12 P2, 11 P3 findings. Key issues: 3 carryover tools ignoring `--help`; missing EPERM fallback; coverage 65% vs 80% gap (7 rounds); zombie test; storyboard swallowing failures; 2 Round 15 fix items not applied (FIX-10, FIX-13).

### Round 15 — 2026-06-06

**Verdict**: Needs Work — 1 P0, 2 P1, 5 P2, 9 P3 findings. Key issues: carryover tool errors → unhandled rejections (P0, resolved); coverage threshold gap (15pp); architecture `\n` hardcoded; stale EOL comments.

### Round 14 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 5 P2, 4 P3. Key issues: read-github-issue incomplete createToolRunner migration; coverage threshold gap; sync-memory-index redundant catch; review-threads stderr.write+return1.

### Rounds 9–13

Progressive resolution: Round 9 (Needs Attention — 5 P2, 8 P3) through Round 13 (Needs Work — 4 P1, 10 P2, 8 P3). Coverage threshold gap persisted across rounds 10–16.

### Rounds 1–8

Initial review through progressive resolution of 1 P0 (create-specs args missing), multiple P1/P2/P3 findings.
