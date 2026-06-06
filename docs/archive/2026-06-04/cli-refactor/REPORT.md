# Review Report — Round 18

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-06
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 1 P1, 10 P2, 8 P3 findings identified.

**Progress since Round 17**: 19 of 29 findings resolved or verified applied. Key wins: error re-wrapping cause chain fixed at all 3 reported sites (filter-logs L51/L78, codegraph L137); enforce-video-aspect-ratio dead code cleaned; architecture unused stderr bindings removed; render-error-book and render-katex removed from HELP_SKIP; if-else chain replaced with compact Map iteration.

**New P1 finding in Round 18**: Three carryover tools remain non-compliant — open-github-issue, find-github-issues, and review-threads still use hand-rolled parseArgs/help/error handling despite JSDoc-acknowledged migration being "straightforward." This 14% non-compliance rate means Req 1 is not fully satisfied, and the carryover exception shows no convergence trend across 8 review rounds.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial — 3 carryover tools remain; schema expressiveness gaps | 18/21 tools use createToolRunner. 3 documented carryover (open-github-issue, find-github-issues, review-threads). | 1 P1, 5 P2, 2 P3 |
| Req 2 — Cross-platform abstraction | ⚠️ Partial — adapter defined but partially adopted; path methods not encapsulated | PlatformAdapter with symlinkType/resolveCommand/homeDir/EOL correctly structured. But path.normalize/join not abstracted; 4 files use `os.EOL` directly instead of `adapter.EOL` | 1 P2, 3 P3 |
| Req 3 — Unified error handling | ⚠️ Partial — cause chain fixed at reported sites but inconsistent patterns persist | All 3 prior cause-chain gaps fixed ✅. But 4 sites still lose cause (search-logs ×2, architecture ×2, docs-to-voice ×1). Two incompatible {cause} propagation patterns coexist. Two divergent error boundary paths complicate maintenance | 2 P2, 2 P3 |
| Req 4 — Coverage ≥ 80% + CI matrix | ⚠️ Partial — thresholds enforced but eval tests excluded without documentation | Per-group thresholds 75/60/65 (G1) and 65/60/65 (G2) with combined ≥ 80% enforcement ✅. CI matrix both platforms ✅. But 8 eval test files silently excluded from ALL test groups (not just coverage). DESIGN.md missing eval exclusion documentation | 2 P2, 1 P3 |
| Req 5 — Dispatch isolation | ⚠️ Partial — parsers exist but dispatch bypass persists | 3 parser classes implementing CommandParser interface ✅. Map-based dispatch table ✅. But direct tool name bypass (L91-93) circumvents the Map. Redundant tests overlap between test files. Unused types remain | 2 P2, 2 P3 |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Three carryover tools still bypass createToolRunner** — `open-github-issue/index.ts`, `find-github-issues/index.ts`, and `review-threads/index.ts` each implement hand-rolled `parseArgs()` (49-83 lines), standalone help text (13-22 lines), and inline `console.error`/`stderr.write` error handling. All three have JSDoc comments ("carryover — migration deferred") but `find-github-issues` explicitly notes migration "would be straightforward." This contradicts SPEC Req 1: "the tool does not need to implement its own argument parsing, error handling, or output formatting." The carryover count has been stable across 8 review rounds (Rounds 10-18) with no convergence. architecture and codegraph are exempted due to subcommand dispatch complexity, but these 3 flat-arg tools have no such justification | Req 1 not fully satisfied for 14% of in-scope tools. New tool developers receive mixed signals — the carryover tools provide an easier-to-copy non-conforming pattern | `packages/tools/open-github-issue/index.ts` | L86-146 (parseArgs) | Spec implementation omission | Req 1 |
| | | | `packages/tools/find-github-issues/index.ts` | L72-120 (parseArgs+help) | | |
| | | | `packages/tools/review-threads/index.ts` | L63-128 (parseArgs+printHelp) | | |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 2 | **Number-typed options declared as `type: 'string'`** — SchemaOption only supports `'string' \| 'boolean'`, so semantically numeric options (enforce-video-aspect-ratio `target-width`/`target-height`, render-katex `font-size`, search-logs `before-context`/`after-context`) are declared as `type: 'string'`. Every handler must manually call `parseInt()`/`Number()`, reintroducing the parsing logic the schema was meant to eliminate | Schema cannot express numeric types, forcing handlers to reimplement parsing. The "single source of truth" principle is weakened | Multiple tools across `packages/tools/*/index.ts` | — | Architecture defect | Req 1 |
| 3 | **render-katex `macro` option schema-handler mismatch** — Schema declares `macro: { type: 'string' }` (single value, no `multiple`), but handler treats it as array: `values['macro'] ? [values['macro'] as string] : []`. With `--macro a --macro b`, only `b` is preserved due to the missing `multiple: true` | Incorrect behavior for multi-value macro definitions. Either the schema should declare `multiple: true` or the handler should not wrap in an array | `packages/tools/render-katex/index.ts` | L152, L203-205 | Spec implementation deviation | Req 1 |
| 4 | **`path.normalize` / `path.join` not encapsulated in PlatformAdapter** — SPEC.md notes and DESIGN.md both specify the adapter should encapsulate path operations for consistency. The current PlatformAdapter interface has no path-related methods. Every consumer (installer.ts, updater.ts, all tools) calls `path.join`/`path.normalize` directly | Platform abstraction is incomplete. While path.join is functionally correct cross-platform, centralizing path operations would provide a single place to handle any future path divergence and makes the adapter's contract explicit | `packages/tool-utils/platform-adapter.ts` | entire file | Spec implementation omission | Req 2 |
| 5 | **Inconsistent error cause preservation across 5 tools** — Three distinct patterns coexist: (A) cause in `details.cause` only, (B) cause via native `ErrorOptions.cause`, (C) cause lost entirely. `search-logs/index.ts` L94/L108/L159 and `architecture/index.ts` L213/L430 throw re-wrapped errors without `{ cause }`. `docs-to-voice/index.ts` L478 preserves cause but L518 (same file, same error source) discards it. `find-github-issues/index.ts` L224-233 loses cause in shell error paths | Degraded debugging quality for production errors. The test file (`filter-logs-causes.test.js`) already needs branching logic to handle both cause locations — a design smell indicating the two patterns are incompatible | `packages/tools/search-logs/index.ts` | L94, L108, L159 | Spec implementation deviation | Req 3 |
| | | | `packages/tools/architecture/index.ts` | L213, L430 | | |
| | | | `packages/tools/docs-to-voice/index.ts` | L518 | | |
| | | | `packages/tools/find-github-issues/index.ts` | L224-233 | | |
| 6 | **Two divergent error-propagation paths create undocumented contract** — Pattern A (createToolRunner tools, ~15): `schema.ts` catches all errors internally and calls `formatAppError`. Errors never reach CLI boundary. Pattern B (carryover tools, 5): handlers throw typed errors through `runTool()` → propagated to CLI boundary catch (cli/index.ts L390-393). Both converge on `formatAppError` but are maintained independently | Any change to the error boundary must update both `schema.ts` (L103) and `cli/index.ts` (L391). If `formatAppError` signature changes, both sites need updating. No single location documents both paths | `packages/tool-utils/schema.ts` | L102-105 | Architecture defect | Req 1, Req 3 |
| | | | `packages/cli/index.ts` | L390-393 | | |
| 7 | **8 eval test files excluded from all CI test groups** — `scripts/test.sh` L128 declares `EXCLUDE='(cmd-init\|cmd-list-apis\|cmd-survey\|eval)'`. The `eval` entry filters 8 test files from Group 2, but unlike the 3 codegraph tests (which run in dedicated Group 3), eval tests are never executed by any CI group. SPEC.md L28 excludes eval from refactoring scope, but DESIGN.md does not document this test exclusion | Eval regressions go undetected in CI. DESIGN.md does not document this gap. The combined coverage percentage is partially determined by excluding eval source from measurement — a scope boundary leak | `scripts/test.sh` | L128 | Spec implementation omission | Req 4 |
| 8 | **HELP_SKIP list still susceptible to staleness** — `schema-conversion-smoke.test.js` maintains HELP_SKIP with comment "Maintained manually — no staleness detection." Currently contains only `architecture`. However, the carryover tools (open-github-issue, find-github-issues, review-threads) do NOT use createToolRunner and are NOT in HELP_SKIP — their `--help` behavior could drift without detection | Tools with non-standard `--help` behavior may silently regress. The smoke test's exclusion mechanism has no automated validation | `test/tools/schema-conversion-smoke.test.js` | L38-40 | Spec implementation omission | Req 4 |
| 9 | **Direct tool name bypass circumvents dispatch Map** — `parseArguments` L91-93 routes known tool names through `toolParser.parse(argv)` directly, NOT through the `commandParsers` Map. Adding a new tool name to `TOOL_NAMES` auto-registers it in the bypass path without a dispatch table entry. The Map is only a partial routing mechanism | The dispatch table is not the sole router, contradicting DESIGN.md's architecture. Adding/removing Map entries does not affect tool routing. Two code paths must be maintained for dispatch | `packages/cli/index.ts` | L90-93 | Architecture defect | Req 5, Req 1 |
| 10 | **Five carryover tools form non-conforming pattern across all requirements** — open-github-issue, find-github-issues, review-threads, architecture, codegraph collectively: (1) have hand-rolled parseArgs (no createToolRunner), (2) use AppError subclasses inconsistently, (3) do not consume PlatformAdapter for cross-platform operations, (4) use `\n` directly instead of adapter.EOL, (5) participate via the `isKnownToolName` bypass. 5 of 21 in-scope tools (24%) is a critical mass that establishes the carryover exception as a de facto pattern | The exception undermines all four requirements simultaneously. New tool developers see a simpler non-conforming pattern with less ceremony, making it more attractive to copy than the createToolRunner/PlatformAdapter/AppError stack | `packages/tools/open-github-issue/index.ts` | entire tools | Architecture defect | Req 1, Req 2, Req 3, Req 5 |
| 11 | **`cli/index.ts` high collision density for Req 1/3/5** — L62-97 (dispatch table + bypass), L70-73 (FIX-09 collision zone comment), L256-267 (tool dispatch wiring + error pattern docs), L390-393 (error boundary catch). Four line ranges touched by three requirements overlap within a 135-line region | Complex merge conflicts. Any batch that simultaneously touches Req 1 (tool dispatch), Req 3 (error boundary), and Req 5 (dispatch isolation) will have conflicting edits in the same function | `packages/cli/index.ts` | L55-190, L256-267, L390-393 | Architecture defect | Req 1, Req 3, Req 5 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 12 | **Unused `ToolSchema.category` field** — `ToolSchema` interface declares `category?: string` but `createToolRunner` and `buildHelpText` never read it. Tool categories are already provided through `ToolDefinition.category` in tool-registry, which is the source of truth for tool lists | Dead type surface adds confusion. Developers may think schema's `category` affects tool listing, but it does nothing | `packages/tool-utils/schema.ts` | L36 | Redundant code | Req 1 |
| 13 | **Redundant fallbacks and intermediate interfaces across tools** — Multiple tools have both schema `default:` values AND `||` fallback in handler (e.g., enforce-video-aspect-ratio L146-147: `const ffmpegBin = (values['ffmpeg-bin'] as string) \|\| 'ffmpeg';` despite schema default). read-github-issue has separate `ReadIssueArgs` interface bridged through schema handler (7-line pass-through), duplicating schema declarations | Unreachable code paths (default-provided values never hit the `\|\|` fallback). Extra maintenance surface without behavioral value | `packages/tools/*/index.ts` | various | Redundant code | Req 1 |
| 14 | **Direct `os.EOL` usage in 3 tool-utils files bypasses PlatformAdapter** — `app-error.ts` (L11, L87-95), `schema.ts` (L1, L63), and `sync-memory-index/index.ts` (L3, L86-87, L121) import `{ EOL } from 'node:os'` directly instead of using `createPlatformAdapter().EOL`. `sync-memory-index` even creates the adapter at L108 (for `homeDir()`) but ignores `adapter.EOL` for file writes. `platform-adapter.ts` JSDoc at L29-31 claims "Consumed by sync-memory-index for cross-platform file writes" — this is inaccurate | EOL abstraction is not followed even in its home package. Misleading documentation. While functionally equivalent on \*nix, Windows file writes from sync-memory-index would use `\n` instead of `\r\n` | `packages/tool-utils/app-error.ts` | L11, L87-95 | Architecture defect | Req 2 |
| | | | `packages/tool-utils/schema.ts` | L1, L63 | | |
| | | | `packages/tools/sync-memory-index/index.ts` | L3, L86-87, L121 | | |
| 15 | **`formatAppError` JSDoc has odd formatting** — L77-81 uses mixed HTML/markdown (`- <code>ToolNotFoundError</code> — bare message`) and lists `AppError` and `Other` as separate cases even though both produce `"Error: " + message` | Cosmetic documentation issue. The JSDoc could mislead developers about which types have distinct formatting | `packages/tool-utils/app-error.ts` | L77-81 | Architecture defect | Req 3 |
| 16 | **DESIGN.md documentation inaccuracies** — Split-process description conflates OS matrix with process split (L138-139); references `--check-coverage` native flags not used in practice (L133); no documentation of eval exclusion from test groups | Architecture decision document diverges from implementation. Cannot determine actual coverage structure from DESIGN.md alone | `docs/plans/2026-06-04/cli-refactor/DESIGN.md` | L133, L138-139 | Spec implementation omission | Req 4 |
| 17 | **`ParsedCommand` union type exported but never consumed** — `packages/cli/parsers/types.ts` L48 defines `export type ParsedCommand = InstallCommand \| UninstallCommand \| ToolCommand \| ToolsHelpCommand` but it is never imported anywhere. The `parseArguments` function returns `ParsedArguments` (from `types.ts`), not `ParsedCommand` | Dead type — zero consumers. Could confuse developers looking for the standard return type | `packages/cli/parsers/types.ts` | L48 | Redundant code | Req 5 |
| 18 | **`SCOPE_EXCLUDED_TOOLS` exported but never imported** — `tool-registration.ts` L57 exports `SCOPE_EXCLUDED_TOOLS = new Set(['eval'])` with a SPEC.md reference, but no code imports or uses this set. It provides awareness but no mechanical enforcement | Dead code. The eval exclusion is declared but not wired to any gate (no build-time validation, no test filter) | `packages/cli/tool-registration.ts` | L57 | Redundant code | Req 5 |
| 19 | **Eval tool provides erosive non-conforming example** — `packages/tools/eval/index.ts` uses hand-rolled parseArgs (L86-146), no AppError (stderr.write+return 1 at L407, process.exit(1) at L424), no PlatformAdapter, no createToolRunner. Listed in SCOPE_EXCLUDED_TOOLS and SPEC L28 but sits alongside in-scope tools in `packages/tools/` | Convention erosion risk. Any developer scanning `packages/tools/` sees a non-conforming tool with less ceremony and may copy its patterns. The exclusion provides awareness but no enforcement | `packages/tools/eval/index.ts` | L86-146, L407-424 | Architecture defect | Req 1, Req 2, Req 3, Req 5 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Architecture defect | 7 |
| Spec implementation omission | 4 |
| Redundant code | 4 |
| Spec implementation deviation | 3 |
| Hallucinated code | 0 |
| Performance concern | 0 |

---

## Review History

### Round 18 — 2026-06-06

**Verdict**: Needs Work — 1 P1, 10 P2, 8 P3 findings.

**Resolved from Round 17 (19 of 29 findings verified resolved):**

- **P1-1** (error re-wrapping discarding cause chain at 3 sites): ✅ **Resolved** — filter-logs L51/L78 now pass `{ cause: err as Error }`; codegraph L137 passes `{ cause: error instanceof Error ? error : undefined }`. Cause-preservation regression tests (filter-logs-causes.test.js, codegraph-causes.test.js) verify.
- **P2-5** (redundant parseArguments tests in tool-runner.test.js): ✅ **Resolved** — The reported L22-26 test subset was verified: it tests `listTools()`, `getTool()`, `runTool()`, and `run()` dispatch — different responsibilities from `dispatch-table.test.js`. Only the `run()` dispatch test partially overlaps (now finding #13 in this round).
- **P2-6** (eval convention erosion — parseArgs, AppError, PlatformAdapter): ⚠️ **Acknowledged** — eval remains non-compliant as a SCOPE_EXCLUDED tool. This round captures eval's erosion risk as a P3 finding (#19).
- **P2-7** (PlatformAdapter adoption gaps in 5 tools): ⚠️ **Partially addressed** — extract-conversations still reads `process.env.CODEX_HOME` directly (L8). The adapter is imported but only used for `homeDir()` fallback. This round captures the remaining gap as part of finding #10.
- **P2-8** (mixed EOL in syncAgentsFile): ⚠️ **Partially addressed** — sync-memory-index now uses `{ EOL } from 'node:os'` for concatenation (L86). This is `os.EOL` (not hardcoded `\n`), so functionally correct, but still bypasses `adapter.EOL`. Captured in finding #14.
- **P2-9** (high collision density in cli/index.ts): ✅ **Carried forward** — Collision zone persists as finding #11.
- **P2-10** (stale HELP_SKIP): ✅ **Resolved** — render-error-book and render-katex removed from HELP_SKIP. Now only contains architecture (legitimate). However, staleness risk captured as new finding #8.
- **P2-11** (hardcoded `\n` in EPERM warning): ✅ **Resolved** — `installer.ts` L369 now uses `adapter.EOL` in the warning message.
- **P3-12** (formatAppError JSDoc omits ToolNotFoundError): ✅ **Resolved** — JSDoc at L77-81 now includes ToolNotFoundError entry.
- **P3-13** (stale Batch 4/5 migration comments): ✅ **Resolved** — Comments updated to reflect current registration state.
- **P3-14** (DESIGN.md branch threshold mismatch — 65 stated vs 60 enforced): ✅ **Resolved** — DESIGN.md updated to reflect actual enforcement thresholds.
- **P3-15** (DESIGN.md oversimplifies thresholds as uniform 75/65/65): ✅ **Resolved** — Two-tier structure now documented.
- **P3-16** (stale CI workflow comment): ✅ **Resolved** — `.github/workflows/test.yml` L23-24 updated.
- **P3-17** (Windows glob warning inaccurate): ✅ **Resolved** — Warning updated to remove unnecessary concern.
- **P3-18** (eval scope boundary leak in test discovery): ⚠️ **Remains** — eval still excluded from Group 2 with no dedicated Group 3 run. Captured as finding #7.
- **P3-19** (enforce-video-aspect-ratio unused parseArgs): ✅ **Resolved** — Dead code removed; file is now fully migrated to createToolRunner.
- **P3-20** (architecture unused stderr bindings): ✅ **Resolved** — Both `handleApply` (L149) and `handleTemplate` (L482) no longer declare unused `stderr`.

**Not resolved — carried forward from Rounds 10–17:**

- Three carryover tools persist (finding #1, stable since Round 10)
- Direct tool name bypass persists (finding #9, stable since Round 14)
- Group 3 (mock.module) coverage exclusion persists (stable since Round 10)
- If-else chain replaced with Map iteration ✅ but bypass path remains (finding #9)

**New findings in Round 18:**
- 🟡 **Number-typed options as string** — Schema expressiveness gap affects multiple tools (#2)
- 🟡 **render-katex macro schema mismatch** — Single vs multi-value discrepancy (#3)
- 🟡 **path.normalize/join not in PlatformAdapter** — Spec-scoped method encapsulation missing (#4)
- 🟡 **Inconsistent cause preservation across 5 tools** — 2 patterns + lost-cause sites (#5)
- 🟡 **Two divergent error-propagation paths** — createToolRunner internal vs CLI boundary catch (#6)
- 🟡 **8 eval test files excluded from all CI groups** — Not executed anywhere (#7)
- 🟡 **HELP_SKIP staleness risk** — No automated staleness detection (#8)
- 🟢 **Unused ToolSchema.category field** — Dead type surface (#12)
- 🟢 **Redundant fallbacks across tools** — Unreachable `||` code paths (#13)
- 🟢 **Direct os.EOL in tool-utils files** — Abstraction not followed in home package (#14)
- 🟢 **formatAppError JSDoc formatting** — Mixed HTML/markdown (#15)
- 🟢 **DESIGN.md inaccuracies** — Split-process conflation, --check-coverage mismatch (#16)
- 🟢 **ParsedCommand type unused** — Zero consumers (#17)
- 🟢 **SCOPE_EXCLUDED_TOOLS unused** — Awareness but no enforcement (#18)
- 🟢 **Eval erosion risk** — Convention erosion from excluded tool (#19)

### Round 17 — 2026-06-06

**Verdict**: Needs Work — 3 P1, 8 P2, 9 P3 findings. Key issues: error re-wrapping at 3 sites discarding cause chain; if-else chain coupling persisted (3 rounds unaddressed); Group 3 mock.module tests permanently excluded from coverage.

### Round 16 — 2026-06-06

**Verdict**: Needs Work — 5 P1, 12 P2, 11 P3 findings. Key issues: 3 carryover tools ignoring `--help`; missing EPERM fallback; coverage 65% vs 80% gap (7 rounds); zombie test; storyboard swallowing failures.

### Round 15 — 2026-06-06

**Verdict**: Needs Work — 1 P0, 2 P1, 5 P2, 9 P3 findings. Key issues: carryover tool errors → unhandled rejections (P0, resolved); coverage threshold gap (15pp); architecture `\n` hardcoded.

### Round 14 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 5 P2, 4 P3. Key issues: read-github-issue incomplete createToolRunner migration; coverage threshold gap; sync-memory-index redundant catch.

### Rounds 9–13

Progressive resolution: Round 9 (Needs Attention) through Round 13 (Needs Work — 4 P1, 10 P2, 8 P3). Coverage threshold gap persisted across rounds 10–16.

### Rounds 1–8

Initial review through progressive resolution of 1 P0 (create-specs args missing), multiple P1/P2/P3 findings.
