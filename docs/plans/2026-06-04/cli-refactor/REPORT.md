# Review Report — Round 11

- **Spec**: CLI 工具全面重構 (cli-refactor)
- **Date**: 2026-06-05
- **Reviewer**: Claude Code (agent-review)
- **Verdict**: Needs Work

---

## Verdict

**Needs Work** — 3 P1 findings identified. All 16 Round 10 issues (2 P1 + 6 P2 + 8 P3) resolved in `ddb9863`. Key new issues: coverage threshold at 69% (still 11 points below SPEC's 80%); `open-github-issue` inner catch block formats `UserInputError` with incorrect `"Error:"` prefix (L759-762); `review-threads` `cmdList`/`cmdResolve` have 6 inner try/catch blocks that all format errors with `"Error:"` prefix instead of letting `createToolRunner`'s boundary handle formatting. Known carryovers continue: `architecture` and `codegraph` bypass both `createToolRunner` and the AppError error boundary.

---

## Requirement Status Summary

| Requirement | Status | Evidence Location | Open Findings |
|---|---|---|---|
| Req 1 — Tool boilerplate reduction | ⚠️ Partial | 18/19 in-scope tools use `createToolRunner`; `architecture` + `codegraph` are known carryovers. Multiple GitHub workflow tools (`open-github-issue`, `read-github-issue`, `find-github-issues`, `review-threads`) have inner try/catch blocks that bypass the schema framework's error formatting | 1 P1, 6 P2, 4 P3 |
| Req 2 — Cross-platform abstraction | ✅ Complete | `PlatformAdapter` in `platform-adapter.ts` with `WindowsAdapter`/`PosixAdapter`; zero `process.platform` in production code; `resetPlatformAdapter(adapter?)` accepts optional override | 0 P0/P1/P2, 1 P3 |
| Req 3 — Unified error handling | ⚠️ Partial | `AppError` hierarchy properly defined; CLI boundary (L484-496) + `createToolRunner` catch block correctly handle all 4 types. Multiple tools have inner try/catch blocks that intercept typed errors and format incorrectly. `open-github-issue` empty catch (L770-772) silently swallows errors. `architecture` + `codegraph` are known bypasses | 3 P1, 9 P2, 3 P3 |
| Req 4 — Coverage >= 80% + CI matrix | ⚠️ Partial | CI matrix ubuntu+windows with `fail-fast: false`; coverage thresholds: 69% lines (80% per SPEC), 67% functions (75% per CHECKLIST); actual coverage ~73% (G1) and ~69% (G2). CI workflow `test.yml` has no `npm run build` step — workspace packages export from `dist/` which doesn't exist after clean `npm ci`. CL-13 backward-compat test not implemented | 1 P1, 3 P2, 1 P3 |
| Req 5 — Dispatch isolation | ✅ Complete | `CommandParser<T>` interface; 3 independent parser classes; dispatch table; direct tool name routed through `ToolArgsParser` (FIX-07); `assertCommand` calls removed (FIX-14); `HelpTextBuilder` unified (FIX-13); 56+ tests across 6+ test files | 0 P0/P1/P2, 4 P3 |

---

## Cross-requirement Interaction Summary

**Requirement Groups:**

| Group | Requirements | Interaction Type | Summary |
|---|---|---|---|
| A | Req 1, Req 3 | Shared modules, same-file modifications, functional coupling | Six tools (`open-github-issue`, `review-threads`, `find-github-issues`, `read-github-issue`, `validate-skill-frontmatter`, `validate-openai-agent-config`) share the same anti-pattern: inner try/catch blocks inside `createToolRunner`-wrapped handlers intercept typed errors and reformat them with inconsistent prefixes. `architecture` bypasses both Req 1 (no `createToolRunner`) and Req 3 (own error boundary). Changes to `createToolRunner`'s error formatting would double-prefix or misroute errors from tools with inner catches |
| B | Req 2 | Isolated | Cross-platform abstraction consumed independently; no code-level interaction with other requirements |
| C | Req 4, Req 5 | Functional coupling | CL-13 (Req 4) test verifies all tool names resolve through dispatch table (Req 5 backward compat). Missing test creates coverage gap for Req 5's backward-compatibility invariant |
| D | Req 4 | Isolated (coverage threshold) | The 69% threshold issue is self-contained in `scripts/test.sh`. The CI build-step gap cross-cuts all requirements but the finding concerns CI configuration |

---

## Findings

### P1 — Requirement Defect

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 1 | **Coverage threshold at 69% instead of SPEC's 80%**: Round 10 FIX-01 raised the threshold from 65% to 69% as a compromise but the SPEC requirement remains 80% lines (Requirement 4, line 74). Actual line coverage is ~73% (Group 1) and ~69% (Group 2) — above the threshold but well below the SPEC | Any CI run with line coverage between 69% and 79.99% passes despite violating the spec. A regression dropping 11 points of coverage would not be caught. The FIX.md recommended 75% lines; actual implementation is 69% | `scripts/test.sh` | L14 | Spec implementation omission | Req 4 |
| 2 | **open-github-issue inner catch block formats UserInputError with "Error:" prefix**: Handler's inner try/catch at L759-762 catches errors from `hydrateArgs` and `validateIssueContent` (both throw `UserInputError`) and formats them as `stderr.write('Error: ${err.message}')`. The spec requires `UserInputError` to display WITHOUT the "Error:" prefix. `createToolRunner`'s catch block correctly formats `UserInputError` without prefix, but this inner catch intercepts before it reaches the boundary | `UserInputError` from input validation is displayed with incorrect `"Error:"` prefix. Subclass identity is lost — the formatting contract per error type is violated for all user input errors from these functions | `packages/tools/open-github-issue/index.ts` | L759-762 | Spec implementation deviation | Req 3 |
| 3 | **review-threads: 6 inner try/catch blocks format errors with "Error:" prefix**: Both `cmdList` (L395-446) and `cmdResolve` (L448-476) have 3 try/catch blocks each for `resolveRepo` (L402-407, L454-460), `resolvePrNumber` (L409-415, L462-468), and `fetchReviewThreads` (L417-423, L470-476). All catch errors and format with `stderr.write('Error: ${err.message}')` instead of letting errors propagate to `createToolRunner`'s boundary which would format `UserInputError` without prefix | All 6 error paths format errors with `"Error:"` prefix regardless of error type. If an upstream function throws `UserInputError`, it still gets `"Error:"` prefix — violating the spec's type-based formatting contract | `packages/tools/review-threads/index.ts` | L402-423, L454-476 | Spec implementation deviation | Req 3 |

### P2 — Requirement Risk

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 4 | **architecture tool does not use createToolRunner**: Exports raw `architectureHandler` function. Still has its own try/catch (L623-634) with manual error formatting mirroring the CLI boundary. FIX-03 converted 4 `stderr.write+return1` paths to `UserInputError` throws and removed `handleTemplate`'s outer catch, but `architectureHandler`'s catch remains. HandleApply has an inner catch (L428-436) with non-standard `"Batch aborted:"` prefix | Error formatting logic duplicated across 3 layers: handleApply inner catch, architectureHandler outer catch, and CLI boundary. Bypasses both Req 1's unified framework and Req 3's typed error boundary. Known carryover | `packages/tools/architecture/index.ts` | L597-634, L428-436, L211-216 | Architecture defect | Req 1, Req 3 |
| 5 | **open-github-issue empty catch block silently swallows errors**: L768-772 catches errors from `resolveRepoAsync` (which throws `UserInputError` for invalid repo format, failed git remote, or non-GitHub origin) with an empty catch block — exit code 1 is returned but NOTHING is written to stderr | Users experience silent failure: exit code 1 with no diagnostic information. The test at `handler-error-propagation.test.js:89-102` passes for the wrong reason (asserts no "Error:" in stderr but stderr is empty) | `packages/tools/open-github-issue/index.ts` | L770-772 | Spec implementation omission | Req 3 |
| 6 | **read-github-issue: 3 stderr.write+return1 bypasses**: Missing issue argument (L133-137), gh command failure (L142-144), and JSON parse error (L150-152) all write directly to stderr and return 1 instead of throwing typed errors through `createToolRunner` | Error formatting bypasses unified AppError boundary. `UserInputError` from missing args gets `"Error:"` prefix when it shouldn't. gh failure errors lose `SystemError` formatting | `packages/tools/read-github-issue/index.ts` | L133-137, L142-144, L150-152 | Spec implementation deviation | Req 1, Req 3 |
| 7 | **find-github-issues: 2 stderr.write+return1 bypasses**: gh command failure (L164-166) and JSON parse error (L173-175) write directly to stderr and return 1 instead of throwing typed errors | Same pattern as read-github-issue. Errors from external command and parse failures bypass `createToolRunner`'s boundary | `packages/tools/find-github-issues/index.ts` | L164-166, L173-175 | Spec implementation deviation | Req 1, Req 3 |
| 8 | **architecture handleApply resolveProjectRoot catch uses stderr.write+return1**: L211-216 catches `resolveProjectRoot` error and writes to stderr + returns 1 instead of throwing an AppError. Missed by FIX-03 (other error paths in handleApply were converted) | Inconsistent error handling within the same function — some paths throw UserInputError (L156, L177, L181), this one uses the old pattern | `packages/tools/architecture/index.ts` | L211-216 | Spec implementation omission | Req 3 |
| 9 | **architecture handleApply inner catch uses non-standard "Batch aborted:" prefix**: L428-436 catches errors from the mutation pipeline and formats with "Batch aborted:" for generic errors and no prefix for UserInputError — differing from both the CLI boundary format and the outer architectureHandler catch format | Three layers of error formatting with three different prefixes (user error paths → throw; mutation paths → "Batch aborted:"; architectureHandler catch → "Error:"). Merge conflict risk for future refactoring | `packages/tools/architecture/index.ts` | L428-436 | Architecture defect | Req 1, Req 3 |
| 10 | **codegraph tool: multiple stderr.write+return1 bypasses**: Handler (L48-154) uses manual error formatting with `stderr.write+return1` patterns for subcommand validation and error paths. The lib/* subcommand files (cmd-search, cmd-status, cmd-sync, cmd-survey, cmd-verify) also use `process.stderr.write+return1` | Entire tool bypasses both createToolRunner (Req 1) and AppError hierarchy (Req 3). Known carryover | `packages/tools/codegraph/index.ts` | L48-154, plus lib/*.ts | Spec implementation deviation | Req 3 |
| 11 | **review-threads default switch case uses stderr.write+return1**: L551-552 writes "Unsupported command" to stderr and returns 1 instead of throwing `UserInputError`. Inside a createToolRunner-wrapped handler, this bypasses the error boundary | Unknown subcommand error uses different formatting than other error paths in the same tool | `packages/tools/review-threads/index.ts` | L551-552 | Spec implementation deviation | Req 1, Req 3 |
| 12 | **validate tools "no skill directories" edge case uses stderr.write+return1**: Both `validate-skill-frontmatter` (L104-107) and `validate-openai-agent-config` (L198-201) handle missing skill directories by writing directly to stderr and returning 1 instead of throwing `UserInputError`. Validation paths correctly throw `UserInputError` | Minor inconsistency: the edge case bypass matches the established pattern of the same handler that correctly uses typed throws for actual validation errors | `packages/tools/validate-skill-frontmatter/index.ts`, `packages/tools/validate-openai-agent-config/index.ts` | L105-106, L199-200 | Spec implementation deviation | Req 1, Req 3 |
| 13 | **Functions coverage threshold at 67% vs CHECKLIST's 75%**: CHECKLIST.md CL-08 specifies `--test-coverage-functions=75` and the FIX.md recommended raising from 65% to 70%. The actual implementation is 67% — below both the documented target and the FIX recommendation | Functions coverage could drop to 67% without CI enforcement catching it. 8 percentage point gap from documented target | `scripts/test.sh` | L14 | Spec implementation omission | Req 4 |
| 14 | **CL-13 backward-compat test never implemented**: CHECKLIST.md defines CL-13: "All 19 existing tool names resolve via dispatch table the same as current isKnownToolName()" referencing `test/tool-registry/all-tools-known.test.js`. This file does not exist, and the `test/tool-registry/` directory itself does not exist | Backward compatibility of Req 5's tool name resolution (21 tools + 3 aliases = 24 names) is not verified by any automated test. A regression in `isKnownToolName()` or the dispatch table would not be caught by CI | `test/tool-registry/all-tools-known.test.js` | N/A (missing file) | Spec implementation omission | Req 4, Req 5 |
| 15 | **CI test workflow missing build step**: `.github/workflows/test.yml` runs `npm ci` then directly executes `bash scripts/test.sh` with no `npm run build` step. All workspace packages (`@laitszkin/tool-utils`, `@laitszkin/cli`, all tools) export from `./dist/` which is gitignored. Test files import from workspace package names that resolve to non-existent `dist/` directories after a clean checkout. The parallel `skill-validation.yml` workflow correctly includes `npm run build` at step 26 | CI pipeline will fail with `MODULE_NOT_FOUND` errors for tests importing from workspace packages. All 1300+ tests would fail on a fresh CI checkout because compiled `dist/` output doesn't exist. Last modified in Round 4 (`df6f957`) — test files importing from dist were added in subsequent rounds | `.github/workflows/test.yml` | L19-21 | Architecture defect | Req 4 |

### P3 — Suggestion

| # | Description | Impact | File | Line | Dimension | Requirement |
|---|---|---|---|---|---|---|
| 16 | **architecture outer catch duplicates CLI boundary error formatting**: L623-634 exactly mirrors the formatting logic in `run()`'s catch block (index.ts L484-496). Since architecture tool doesn't use `createToolRunner`, errors from its handler are caught here instead of propagating to the CLI boundary | Duplicated error formatting logic. Errors from architecture show correct formatting only because the handler duplicates the boundary code, not because it follows the architecture | `packages/tools/architecture/index.ts` | L623-634 | Architecture defect | Req 3 |
| 17 | **16/18 createToolRunner tools lack explicit strict:true**: Only `filter-logs` and `search-logs` explicitly set `strict: true` in their schema. The remaining 16 tools rely on the implicit default (`schema.strict ?? true`). Behavior is correct but spec recommends explicit declaration for readability | No functional impact; strict defaults to true. Readability concern — intent is implicit | Schema definitions across 16 tools | Schema definitions | Spec implementation omission | Req 1 |
| 18 | **codegraph tool doesn't use createToolRunner**: Known carryover alongside architecture. Manually implements argument parsing, subcommand dispatch, and error handling | Requires manual implementation of framework capabilities | `packages/tools/codegraph/index.ts` | L377-382 | Spec implementation omission | Req 1 |
| 19 | **handler-error-propagation.test.js: weak assertion for open-github-issue error test**: L89-102 test asserts `!stderr.data.includes('Error:')` but does NOT assert `stderr.data.length > 0`. Because of the empty catch at open-github-issue L770-772, stderr is empty — the test passes for the wrong reason | Test does not catch the silent error-swallow bug (P2-5). Both the bug and the test would survive a regression review | `test/tools/handler-error-propagation.test.js` | L89-102 | Spec implementation omission | Req 3 |
| 20 | **installer.ts: unused `import os from 'node:os'`**: All OS-specific operations use the `PlatformAdapter` via `createPlatformAdapter()`. The `os` module is never referenced anywhere in the file | Dead import increases bundle noise and may confuse future readers | `packages/cli/installer.ts` | L3 | Redundant code | Req 2 |
| 21 | **index.ts: orphaned imports from @laitszkin/tool-registry**: `formatToolList`, `buildToolDiscoveryHelp` (L6) and `formatExamples` (L7) are imported but never used. They became orphaned when `HelpTextBuilder` was created (FIX-13). They are used in `help-text-builder.ts` which imports them independently | Unused imports increase module resolution cost and clutter import section | `packages/cli/index.ts` | L6-L7 | Redundant code | Req 5 |
| 22 | **types.ts: unused parser type imports**: L30 imports `InstallCommand`, `UninstallCommand`, `ToolCommand`, `ToolsHelpCommand` from `./parsers/types.js` but never references them. `ParsedArguments` uses string literal union types directly | Dead imports create false dependencies | `packages/cli/types.ts` | L30 | Redundant code | Req 5 |
| 23 | **index.ts: unused `assertCommand` function**: Defined at L67-75 but never called anywhere. FIX-14 removed all call sites. The comment at L59-61 documents retention "for future use in parser tests" but the function is internal to the module (not exported) and has no active consumption | Dead code increases maintenance surface. Would need export to be usable from tests | `packages/cli/index.ts` | L67-75 | Redundant code | Req 5 |
| 24 | **tool-runner.test.js: unused path import and \_\_dirname computation**: L3-6 import `path` and compute `__dirname` via `path.dirname(fileURLToPath(import.meta.url))` but never reference either in any test | Dead code in test setup; no impact on test correctness | `test/tool-runner.test.js` | L3-L6 | Redundant code | Req 5 |
| 25 | **architecture-error-types.test.js: REGTEST-02 missing label comment**: Other regression tests (01, 03, 04, 05) have explicit `REGTEST-NN:` label comments for traceability to FIX.md documentation. REGTEST-02's test (L38-78) lacks this label | Minor documentation inconsistency; does not affect test execution | `test/tools/architecture-error-types.test.js` | L38 | Redundant code | Req 4 |

---

## Dimension Summary

| Dimension | Count |
|---|---|
| Spec implementation deviation | 9 |
| Spec implementation omission | 7 |
| Architecture defect | 4 |
| Redundant code | 5 |

---

## Review History

### Round 11 — 2026-06-05

**Verdict**: Needs Work — 3 P1 and 12 P2 and 10 P3 findings identified after Round 10 resolution. Key new issues: coverage threshold at 69% — 11 points below SPEC's 80% (P1-1); `open-github-issue` inner catch formats `UserInputError` with `"Error:"` prefix (P1-2); `review-threads` 6 inner try/catch blocks all use `"Error:"` prefix (P1-3). New systemic finding: 4 GitHub workflow tools (`open-github-issue`, `read-github-issue`, `find-github-issues`, `review-threads`) share `stderr.write+return1` anti-patterns despite being wrapped in `createToolRunner`. `open-github-issue` empty catch block silently swallows errors (P2-5). CI workflow missing build step (P2-15) — all workspace packages export from `dist/` which doesn't exist after clean `npm ci`. CL-13 backward-compat test never implemented (P2-14). `architecture` + `codegraph` continue as known carryovers.

**Resolved from Round 10**:
- P1-1 (coverage threshold 65% → 69%): ⚠️ **Partially resolved** — raised to 69% but still 11 points below SPEC's 80% (new P1-1 this round)
- P1-2 (generate-storyboard-images 8x Error → UserInputError): ✅ Verified — all 8 sites now throw `UserInputError`
- P2-3 (architecture bypass createToolRunner): ⚠️ **Partially resolved** — 4 error paths converted to throws; handleTemplate catch removed; but architectureHandler catch and handleApply inner catch remain
- P2-4 (open-github-issue generic Error → SystemError): ✅ Verified — L525 and L554 now throw `SystemError`
- P2-5 (validate tools extractFrontmatter 5x → UserInputError): ✅ Verified — all 5 sites now throw `UserInputError`
- P2-6 (REGTEST-05 .ts dead code): ✅ Verified — renamed to `.test.js`, TypeScript annotations removed
- P2-7 (direct tool name bypass ToolArgsParser): ✅ Verified — now routes through `toolParser.parse()`
- P3-9 (open-github-issue FLAG_MAP/buildArgsFromYargs dead code): ✅ Verified — removed
- P3-10 (review-threads 2x Error → UserInputError): ✅ Verified — L150, L321 now throw `UserInputError`
- P3-12 (PlatformAdapter mock injection): ✅ Verified — `resetPlatformAdapter(adapter?)` accepts optional parameter
- P3-15 (documentation drift): ✅ Verified — SPEC.md and PROMPT.md updated to "21"
- P3-11 (test installer process.platform → adapter): ✅ Verified — uses `createPlatformAdapter().symlinkType()`
- P3-13 (4 help-text wrappers removed): ✅ Verified — removed
- P3-14 (assertCommand removed): ✅ Verified — removed from if-else chain
- FIX-16 (if-else documented as intentional): ✅ Verified — comments present

### Round 10 — 2026-06-05

**Verdict**: Needs Work — 2 P1, 6 P2, 8 P3. Key issues: coverage threshold 65%; generate-storyboard-images 8x generic Error; architecture bypasses createToolRunner; open-github-issue generic errors; validate tools extractFrontmatter generic errors; REGTEST-05 .ts dead code; dispatch table architecture defects.

### Round 9 — 2026-06-04

**Verdict**: Needs Attention — 5 P2, 8 P3. Key issues: three tools bypass AppError error boundary, missing dependency declarations, coverage exclusion masks tools.

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
