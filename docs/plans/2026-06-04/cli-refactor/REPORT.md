# Review Report — Round 12

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-05
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 7 P1 findings identified. Significant regressions in `open-github-issue` and `review-threads` after the Round 11 fix commit removed `createToolRunner` integration and replaced all typed errors with generic `Error`. Coverage threshold remains at 69% — 11 points below the SPEC's 80%. CLI error boundary only covers 4 of 8 non-createToolRunner tools. On the positive side: all Round 11 P2 issues with `architecture` (outer catch removed, inner catch converted to re-throws, `resolveProjectRoot` typed throw), CI workflow missing build step fixed, CL-13 backward-compat test implemented.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial | 13/21 tools use `createToolRunner` schema-based approach; 8 tools bypass it with hand-rolled `parseArgs()` (~320 lines aggregate). `open-github-issue` and `review-threads` regressed from schema-based to hand-rolled parsers. `find-github-issues` has dead `createToolRunner` import | 3 P1, 5 P2, 4 P3 |
| Req 2 — Cross-platform abstraction | ✅ Complete, with risks | `PlatformAdapter` with `WindowsAdapter`/`PosixAdapter`; zero `process.platform` in production code; `resetPlatformAdapter(adapter?)` injectable. SPEC's `EOL` requirement implemented but never consumed. `sync-memory-index` bypasses adapter for `homedir()`. No adapter unit tests | 0 P0/P1, 3 P2, 2 P3 |
| Req 3 — Unified error handling | ❌ Partial — regressions | `AppError` hierarchy and CLI boundary (L469-481) correct. But: `open-github-issue` regressed to all-generic-Error (16/16 throws). `review-threads` outer catch intercepts all errors. `validate-*` tools write errors to stdout+return1. Only 4/8 non-createToolRunner tools propagate errors to the boundary | 4 P1, 4 P2, 2 P3 |
| Req 4 — Coverage >= 80% + CI matrix | ⚠️ Partial | CI workflow fixed (npm run build added). CL-13 backward-compat test exists. Coverage thresholds: 69% lines (SPEC: 80%), 67% functions (CHECKLIST: 75%). Split-process test coverage prevents unified 80% report. Windows CI shell fragile | 1 P1, 5 P2, 4 P3 |
| Req 5 — Dispatch isolation | ✅ Complete, with gap | `CommandParser<T>` interface; 3 parser classes; dispatch table; `HelpTextBuilder` unified. Parser imports cleaned up. Dispatch table not independently extensible — acknowledged tradeoff (FIX-16). Remaining: "Legacy" comment on `ParsedArguments` is misleading | 0 P0/P1, 2 P2, 2 P3 |

---

## Cross-requirement Interaction Summary

**Requirement Groups:**

| Group | Requirements | Interaction Type | Summary |
|---|---|---|---|
| A | Req 1, Req 3, Req 5 | Shared modules, functional coupling, same-file modifications | 8 tools bypass `createToolRunner` — losing both schema-based arg parsing (Req 1) AND typed error formatting (Req 3). `open-github-issue` (regression to generic Error, stderr.write+before-throw, FLAG_MAP bridge) and `review-threads` (outer catch, 6 generic throws) are the worst. CLI boundary only covers 4 of 8 bypassing tools. `createToolRunner` error formatting (schema.ts) duplicates CLI boundary (index.ts) — changes must stay synced |
| B | Req 2 | Isolated | Cross-platform abstraction independent of other requirements |
| C | Req 4, Req 5 | Functional coupling | CL-13 backward-compat test (all-tools-known.test.js) verifies dispatch table coverage. Test exists as of this round (was P2-14 in Round 11) |
| D | Req 4 | Isolated (coverage) | Split-process coverage, threshold gaps, and Windows CI concerns are self-contained |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **open-github-issue: `resolveRepoAsync` writes stderr before throwing generic Error — duplicate output**: When `git remote get-url origin` fails (L767-770) or origin is not a GitHub URL (L778-781), a human-readable hint is written to `context.stderr` THEN a generic `Error` is thrown. The CLI boundary catches the throw and writes `"Error: --repo resolution failed"`. User sees two messages. This also applies to the non-GitHub-origin case | Duplicate error output confuses users. The stderr.write message alone is sufficient; the "Error:" line from the boundary is redundant | `packages/tools/open-github-issue/index.ts` | L767-770, L778-781 | Spec implementation deviation | Req 3 |
| 2 | **open-github-issue: All 16+ throws use generic `Error` — no typed AppErrors**: The file does not import or use `UserInputError`, `SystemError`, or `AppError` from `@laitszkin/tool-utils`. User input validation errors (`validateRepo`, L291; `requireNonEmpty`, L269; payload validation, L220-259; `validateIssueContent`, L695-752) should be `UserInputError` (no "Error:" prefix). System errors (`createIssueWithGh` failure L610; `createIssueWithToken` L639; `fetchRemoteReadme` L340) should be `SystemError` (with stack trace). All generic `Error` gets `"Error:" prefix` format from the boundary — incorrect for user-input errors | All 16 error paths lose typed error distinction. UserInputError-like errors display with incorrect "Error:" prefix. SystemError-like errors lose stack traces. The type-based formatting contract per SPEC is completely absent from this file | `packages/tools/open-github-issue/index.ts` | L220-291, L340, L610-639, L695-752 | Spec implementation deviation | Req 3 |
| 3 | **review-threads: Outer try/catch (L545-548) intercepts all errors before CLI boundary**: The handler wraps the switch/case in a try/catch that writes `"Error: ${message}"` to stderr and returns 1. This flattens all error type distinctions — `UserInputError` gets `"Error:"` prefix (should not), `SystemError` loses stack trace. The one typed throw at L543 (`UserInputError` for unknown command) also gets the wrong prefix. The CLI boundary's correct per-type formatting is bypassed entirely | All error paths from this tool display incorrectly: UserInputError has unwanted "Error:" prefix, SystemError loses stack trace. Maintainers adding typed errors later won't see correct formatting unless they also remove this catch | `packages/tools/review-threads/index.ts` | L545-548 | Spec implementation deviation | Req 3 |
| 4 | **review-threads: 7 generic `Error` throws in helpers despite importing `UserInputError`**: `parseOwnerRepo` (L175), `resolveRepo` (L195), `resolvePrNumber` (L214), `loadThreadIds` (L385, L390), `resolveThreads` (L442, L446) all throw `new Error(...)` instead of typed errors. Even if the outer catch (P1-3) were removed, these would arrive at boundary as generic `Error` | All internal error paths from this tool would display with incorrect "Error:" prefix if propagated to boundary. Type distinction lost for input errors and system errors alike | `packages/tools/review-threads/index.ts` | L175, L195, L214, L385, L390, L442, L446 | Spec implementation omission | Req 3 |
| 5 | **Coverage threshold at 69% vs SPEC's 80% requirement**: `scripts/test.sh` L12 sets `--test-coverage-lines=69`. SPEC Req 4 (L74) requires `>= 80%`. Actual per-group coverage: Group 1 (test/ tests) 77.18%, Group 2 (package tests) 69.39%. Combined single-process coverage ~80%. The threshold has not been raised from Round 11's compromise (was 65%, raised to 69% in FIX-01) — still 11 points below the SPEC | Any CI run with line coverage between 69% and 79.99% passes despite violating the spec. A regression dropping 11 points of coverage would not be caught | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |
| 6 | **7 in-scope tools bypass `createToolRunner` schema-based approach**: `open-github-issue` (regression — removed framework), `review-threads` (regression), `read-github-issue`, `find-github-issues`, `validate-skill-frontmatter`, `validate-openai-agent-config`, `codegraph`, `architecture` (known carryovers) all use hand-rolled `parseArgs()` (~320 lines aggregate) instead of schema declarations. DESIGN.md §2.3 states "All tools use `node:util.parseArgs` with schema declaration". For `open-github-issue` and `review-threads` this is a regression from a prior state where they used `createToolRunner` | Each tool duplicates argument parsing, error handling, and help text generation. Help text is inconsistent. `--help` flags don't work on validate tools. Manual `parseArgs()` implementations (20-90 lines each) are the opposite of the boilerplate reduction the spec requires | `packages/tools/*/index.ts` (8 files) | Various | Spec implementation deviation | Req 1 |
| 7 | **CLI error boundary (L469-480) only covers 4 of 8 non-createToolRunner tools**: The boundary's `instanceof` chain correctly handles errors from `read-github-issue`, `find-github-issues`, `codegraph`, and `architecture`. But 4 other tools bypass it: `open-github-issue` (all generic Error — wrong formatting), `review-threads` (outer catch intercepts), `validate-skill-frontmatter` (stdout+return1), `validate-openai-agent-config` (same). Additionally, `createToolRunner`'s catch (schema.ts:101-112) duplicates the exact 4-way chain — any formatting change must be made in two places | Future changes to error formatting at the boundary would silently miss 4 tools. The duplicated formatting logic (schema.ts + index.ts) creates a maintenance trap — a change in one place won't affect tools handled by the other | `packages/cli/index.ts` + `packages/tool-utils/schema.ts` | L469-480, L101-112 | Architecture defect | Req 3, Req 5 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 8 | **open-github-issue: FLAG_MAP + buildArgsFromYargs is hallucinated code (42 lines)**: A Yargs-compatibility bridge that converts structured argument objects back into raw argv string arrays. Exists only because the tool bypasses `createToolRunner` — if it used schema-based parsing, no conversion layer would be needed. Has no corresponding requirement in the SPEC or DESIGN | 42 lines of dead-adjacent infrastructure that exists solely to paper over the architectural gap. Would be eliminated entirely by adopting createToolRunner | `packages/tools/open-github-issue/index.ts` | L906-936 | Hallucinated code | Req 1 |
| 9 | **codegraph: ~200 lines of hand-rolled help text (`printHelp` + `printSubcommandHelp`)**: `printHelp` (66 lines, L141-206) and `printSubcommandHelp` (~150 lines, L208-359 with 8 subcommand entries) manually format help text. `createToolRunner` auto-generates equivalent help from schema declarations. The subcommand help is tightly coupled to the custom arg parser, making both harder to maintain | Hand-rolled help text duplicates framework boilerplate. Any change to help format requires manual updates across all 8 subcommand entries. Tight coupling between help text and flag extraction logic | `packages/tools/codegraph/index.ts` | L141-359 | Redundant code | Req 1 |
| 10 | **codegraph: Manual flag extraction via `indexOf`/`splice`**: Six flags (`--json`, `--spec`, `--all`, `--index`, `--feature`, `--limit`) are extracted by searching `argv` with `indexOf` and mutating with `splice`. The `--limit` value (L81) is parsed with `parseInt` without NaN error handling. Bypasses strict mode validation and `--help` auto-generation | No strict mode validation for unknown flags. `--limit` with non-numeric value silently becomes NaN. Manual extraction cannot benefit from `node:util.parseArgs`'s built-in validation | `packages/tools/codegraph/index.ts` | L17-83 | Spec implementation deviation | Req 1 |
| 11 | **PlatformAdapter `EOL` property never consumed**: The adapter exposes an `EOL` property wrapping `os.EOL` per SPEC Req 2 notes ("`os.EOL` 的統一處理（寫入檔案時使用）"). However, no production code reads `adapter.EOL`. All manifest file writes hardcode `\n` | SPEC requirement for unified EOL handling is unimplemented in practice. Future file-writing code is more likely to copy existing `\n` patterns than discover `adapter.EOL` | `packages/tool-utils/src/platform-adapter.ts` | Interface definition | Spec implementation omission | Req 2 |
| 12 | **sync-memory-index imports `os.homedir` directly, bypassing adapter**: `packages/tools/sync-memory-index/index.ts` L3 imports `{ homedir } from 'node:os'` instead of using `createPlatformAdapter().homeDir()`, which has the proper fallback chain (`USERPROFILE` → `HOME` → `os.homedir()`) critical on Windows CI | Works on dev machines but risks failure on Windows CI where `HOME` may be unset but `USERPROFILE` is set. A tool in scope bypasses the cross-platform abstraction | `packages/tools/sync-memory-index/index.ts` | L3 | Spec implementation omission | Req 2 |
| 13 | **No unit tests for `PlatformAdapter`**: The `resetPlatformAdapter(adapter?)` hook exists for test injection but is never exercised. Singleton caching, factory selection, and each adapter method's behavior are all untested | Adapter is a foundational abstraction for Req 2. A regression in factory logic or fallback ordering would go undetected until Windows runtime failure | `packages/tool-utils/` | N/A | Spec implementation omission | Req 2 |
| 14 | **validate-skill-frontmatter and validate-openai-agent-config: Validation errors written to stdout + return 1 instead of thrown to boundary**: Both tools' handlers (validate-skill-frontmatter L106-111, validate-openai-agent-config L200-205) write validation errors to stdout and return 1. Per Req 3, errors should be thrown as typed errors to the CLI boundary for consistent formatting. Additionally, `extractFrontmatter` in both tools throws generic `Error` (caught internally by `validateSkill`, converted to error string) | Validation errors bypass the CLI boundary's AppError formatting and go to stdout instead of stderr. Type distinction lost | `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts` | L106-111, L200-205 | Spec implementation deviation | Req 3 |
| 15 | **Functions coverage threshold 67% vs CHECKLIST CL-08 75%**: `scripts/test.sh` L12 sets `--test-coverage-functions=67`. CHECKLIST.md CL-08 specifies `--test-coverage-functions=75`. Actual function coverage is 85.92% — well above both — so the threshold is merely out of date, not a coverage gap | CHECKLIST-constrained threshold is unmet by the config file. Functions could drop to 67% without CI enforcement catching it (8 points below documented target) | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |
| 16 | **Windows CI step lacks `shell: bash` directive**: `.github/workflows/test.yml` L21 runs `bash scripts/test.sh` without `shell: bash`. On GitHub Actions Windows runners, the default shell is PowerShell. `bash` from Git for Windows is on PATH but not guaranteed — if the path changes or Git for Windows is updated, Windows CI silently fails | Windows CI may fail silently if `bash` is not available on the runner path. Ubuntu continues passing, masking the regression until manual Windows testing | `.github/workflows/test.yml` | L21 | Architecture defect | Req 4 |
| 17 | **Coverage thresholds at 69%/67% are fragile — only 0.39% headroom for Group 2**: Group 2 (package tests) achieves 69.39% lines, 62.47% branches. The threshold is 69% lines — only 0.39% headroom. Any code change reducing Group 2 coverage by half a percent fails CI. Group 1 (77.18%) has 8 points of headroom above the same threshold | Pipeline is fragile — the threshold is effectively set to Group 2's lowest common denominator. A small code addition or test removal in any package could break CI | `scripts/test.sh` | L12 | Performance concern | Req 4 |
| 18 | **test.sh splits coverage across two node processes, preventing unified 80% report**: Group 1 (`test/**/*.test.js`) and Group 2 (package tests) run in separate `node --experimental-test-coverage` processes. Each produces an independent report. SPEC's "coverage >= 80%" implies a single measurement. No single group reaches 80% (G1: 77.18%, G2: 69.39%) — combined single-process is ~80% | SPEC's coverage requirement cannot be verified by the current test setup. The 69% threshold was chosen for Group 2's 69.39%, not because total coverage is 69% | `scripts/test.sh` | L29-40 | Spec implementation omission | Req 4 |
| 19 | **CI runs `bash scripts/test.sh` directly, not `npm test`**: SPEC states "CI pipeline runs `npm test`". `.github/workflows/test.yml` runs `bash scripts/test.sh` directly. While functionally equivalent on Ubuntu (where `npm test` script is `"scripts/test.sh"`), this bypasses any npm lifecycle hooks. Additionally, `scripts/test.sh` cannot run on native Windows PowerShell (`.sh` not executable without Git Bash) | CI deviates from the SPEC contract. Windows developers cannot run `npm test` without Git Bash | `.github/workflows/test.yml` | L21 | Spec implementation deviation | Req 4 |
| 20 | **Dispatch table requires both Map entry + if-else chain for new commands**: `parseArguments()` has a dispatch table (L69-75) selecting parsers, BUT lines L82-146 branch on `firstArg` to manually map each parser's typed result into `ParsedArguments`. Adding a new command requires modifying two places and potentially `run()`. The FIX-16 comment (L78-81) acknowledges this tradeoff | SPEC Req 5 requires "dispatch table entries can be added/removed independently". Current design achieves partial independence (parser selection) but not full dispatch entry independence | `packages/cli/index.ts` | L69-146 | Architecture defect | Req 5 |
| 21 | **find-github-issues: Dead import of `createToolRunner`**: Imported from `@laitszkin/tool-utils` (L3) but never used. The handler at L213 is a direct function (`findGitHubIssuesHandler`), not wrapped by `createToolRunner(schema)`. This is a remnant of incomplete migration | Dead import increases bundle noise and misleads readers about the tool's architecture | `packages/tools/find-github-issues/index.ts` | L3 | Redundant code | Req 1, Req 3 |
| 22 | **createToolRunner error formatting (schema.ts:101-112) duplicates CLI boundary (index.ts:469-480)**: Both locations implement the exact same 4-way `instanceof UserInputError/SystemError/AppError/Error` chain. `createToolRunner` writes to `context.stderr` (overridable); CLI boundary uses `run()`-scoped `stderr` | Any change to error formatting (e.g., adding a new error type) must be made in two files. No compile-time error warns if they drift | `packages/tool-utils/schema.ts`, `packages/cli/index.ts` | L101-112, L469-480 | Architecture defect | Req 3 |
| 23 | **Architecture inconsistency: 13 tools use `createToolRunner`, 8 bypass it — no dispatch-layer visibility**: The dispatch table routes to `tool.handler` uniformly regardless of whether the handler is `createToolRunner(schema)` or a flat function. There is no intercept point for cross-cutting concerns (input validation, error logging, telemetry) that apply uniformly to all tools | Inconsistent tool architecture makes it harder to add cross-cutting capabilities. Tools that bypass createToolRunner handle errors, parsing, and help text independently | `packages/cli/index.ts` | L341-346 | Architecture defect | Req 1, Req 5 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 24 | **validate-skill-frontmatter and validate-openai-agent-config: No schema wrapper for zero-arg tools; no `--help` support**: Both tools accept no arguments (zero-arg). Using `createToolRunner({ options: {}, handler })` would provide auto-generated `--help` support and consistent error formatting with zero additional complexity. Currently `apltk validate-skill-frontmatter --help` produces no output | Missing `--help` for validation tools. Users unfamiliar with the tools must read documentation to learn usage | `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts` | L89-116, L183-210 | Spec implementation omission | Req 1 |
| 25 | **architecture: Known carryover with ad-hoc flag parsing**: `handleApply` (L161-167) and `handleTemplate` (L486-491) implement their own flag parsing for `--no-render`, `--spec`, `--project`, `--output`. If subcommand architecture is retained, each sub-handler flag parsing could be schema-based | Known carryover. Minor duplication of framework capability | `packages/tools/architecture/index.ts` | L161-167, L486-491 | Spec implementation omission | Req 1 |
| 26 | **PlatformAdapter `normalizePath()` is dead code**: Defined in interface, implemented identically in both adapters (delegating to `path.normalize`), never called by any consumer. `path.normalize` already behaves identically across platforms on Node.js 18+ | Dead code that increases maintenance surface. No behavioral benefit | `packages/tool-utils/src/platform-adapter.ts` | L31 | Redundant code | Req 2 |
| 27 | **Inconsistent `createPlatformAdapter()` call pattern in `installer.ts`**: Adapter obtained three ways: chained directly (L27, L123), cached to local var (L360). Since factory is a singleton, all produce the same object — but inconsistency confuses readers about intentionality | Minor readability concern. No functional impact | `packages/cli/installer.ts` | L27, L123, L360 | Redundant code | Req 2 |
| 28 | **open-github-issue: Issue publish failure returns 0**: When both `createIssueWithGh` and `createIssueWithToken` fail (L888-901), the handler writes the publish error to stderr but returns 0 (success). By design as draft mode fallback, but violates strict interpretation of "don't exit with 0 on error" | Business logic exception to the error handling convention. User sees stderr.write but exit code 0 | `packages/tools/open-github-issue/index.ts` | L888-901 | Spec implementation deviation | Req 3 |
| 29 | **architecture: Unknown subcommands delegate to legacy JS CLI boundary**: For subcommands other than "apply" and "template", the handler delegates to JS `cli.dispatch()` (L613-616) which has its own try/catch writing `e.message` to stderr. Typed errors from the JS CLI path never reach the TS error boundary | Transitional gap. JS CLI handles its own errors, but they use different formatting than TS boundary | `packages/tools/architecture/index.ts` | L613-616 | Architecture defect | Req 3 |
| 30 | **Coverage exclude glob `packages/tools/eval/**` untested on Windows**: The `--test-coverage-exclude` glob may not match Windows-style backslash paths. If the glob silently fails, eval files would be included in coverage, dragging down reported percentages | Unverified Windows behavior. Could cause coverage drops on Windows CI without clear signal | `scripts/test.sh` | L12 | Architecture defect | Req 4 |
| 31 | **all-tools-known.test.js duplicates tool names from source of truth**: Hardcodes a 21-entry `TOOL_NAMES` array duplicating `TOOL_MODULE_NAMES` from `tool-registration.ts`. When a tool is added or removed, both must be updated. Functional check via `isKnownToolName()` works but stale list in test comments could mislead | Maintenance burden: two sources of truth when a tool is added/removed | `test/tool-registry/all-tools-known.test.js` | L6-28 | Redundant code | Req 4 |
| 32 | **schema-conversion-smoke.test.js `HELP_SKIP` list manually maintained**: 7 tools in the `HELP_SKIP` set (L37-45). If any later supports `--help`, this list must be updated manually with no staleness detection | Maintenance burden: skip list can become stale without CI signal | `test/tools/schema-conversion-smoke.test.js` | L37-45 | Redundant code | Req 4 |
| 33 | **No test verifies coverage exclude pattern works**: No CI step or test confirms the `eval/**` exclusion actually functions. A Node.js version-upgrade that changes glob semantics could silently include eval files | Coverage numbers could be inaccurate without clear signal | `scripts/test.sh` | L12 | Spec implementation omission | Req 4 |
| 34 | **"Legacy ParsedArguments" comment in types.ts is misleading**: Comment reads `"// ---- Legacy ParsedArguments (kept for backward compatibility) --------"` but `ParsedArguments` is the active return type of `parseArguments()` and the input contract consumed by `run()`. Not legacy — actively used as dispatch integration seam | Misleading comment could cause a reader to think the type is deprecated and should be removed | `packages/cli/types.ts` | L30 | Redundant code | Req 5 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Spec implementation omission | 9 |
| Spec implementation deviation | 8 |
| Architecture defect | 6 |
| Redundant code | 7 |
| Hallucinated code | 1 |
| Performance concern | 1 |

---

## Review History

### Round 12 — 2026-06-05

**Verdict**: Needs Work — 7 P1 and 16 P2 and 11 P3 findings identified after Round 11 resolution.

**Resolved from Round 11:**
- P1-1 (coverage threshold 65% → 69%): ⚠️ **Carried forward as new P1-5** — threshold still at 69%, 11 points below SPEC's 80%
- P1-2 (open-github-issue inner catch `Error:` prefix): ⚠️ **Regressed** — see P1-1/P1-2/P1-3 this round. The inner catch was removed but all typed errors were replaced with generic `Error`, and `resolveRepoAsync` now writes stderr before throwing (new issue)
- P1-3 (review-threads 6 inner try/catch blocks): ⚠️ **Replaced by new issue** — inner catches were removed, but the handler now has an outer catch intercepting ALL errors (P1-3 this round) and 7 generic throws in helpers (P1-4 this round)
- P2-5 (open-github-issue empty catch block): ❌ **Not addressed separately** — tool was completely rewritten, removing the empty catch. However all typed errors were replaced with generic Error
- P2-8 (architecture resolveProjectRoot stderr.write+return1): ✅ **Verified** — now throws `UserInputError`
- P2-9 (architecture handleApply inner catch "Batch aborted:"): ✅ **Verified** — now re-throws typed errors correctly
- P2-14 (CL-13 backward-compat test): ✅ **Verified** — `test/tool-registry/all-tools-known.test.js` exists with 56 lines covering 21 tool names + 3 aliases
- P2-15 (CI workflow missing build step): ✅ **Verified** — `.github/workflows/test.yml` L20 now has `npm run build`
- P2-6, P2-7, P3-9 thru P3-15 (cleanup items): ✅ **Verified** — dead imports removed, help wrappers consolidated
- P3-16 (architecture outer catch): ✅ **Verified** — outer try/catch removed from `architectureHandler`
- P3-17 (createToolRunner strict:true): ⚠️ **Partially addressed by tool migration** — tools removed from createToolRunner are no longer affected

**Notable new/persistent issues:**
- `open-github-issue` was largely rewritten — removed from `createToolRunner`, all typed errors downgraded to generic `Error`, hand-rolled 90-line `parseArgs()` replaces schema declaration, FLAG_MAP bridge (42 lines) exists for yargs compatibility
- `review-threads` was also restructured — removed from `createToolRunner`, handler now has an outer catch intercepting all errors with incorrect `"Error:"` prefix
- `find-github-issues` imports `createToolRunner` but uses a direct handler — dead import not cleaned up
- Coverage thresholds unchanged (69% lines, 67% functions) despite SPEC (80%) and CHECKLIST (75%) requirements
- Split-process coverage prevents unified 80% report; 0.39% Group 2 headroom makes pipeline fragile
- Windows CI lacks `shell: bash` directive — fragile on Windows runners

### Round 11 — 2026-06-05

**Verdict**: Needs Work — 3 P1, 12 P2, 10 P3. Key issues: coverage threshold at 69%; `open-github-issue` inner catch formats `UserInputError` with `"Error:"` prefix; `review-threads` 6 inner try/catch blocks; `open-github-issue` empty catch block; CI workflow missing build step; CL-13 backward-compat test not implemented.

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
