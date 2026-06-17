# Spec: codebase-refactoring

- **Date**: 2026-06-17
- **Feature**: codebase-refactoring
- **Source**: PROPOSAL.md → spec skill via structured exploration

## Goal

Refactor all TypeScript and JavaScript source files across the monorepo to comply with the new strict-TypeScript, ESLint strict-type-checked, and Prettier quality gates, with zero behavioral changes and no test regressions.

## Scope

### In Scope

- **ESLint autofix**: Run `eslint --fix` on all eligible files across all packages to automatically resolve auto-fixable violations
- **Prettier formatting**: Run `prettier --write` across all source files to enforce consistent formatting
- **Manual refactoring**: Resolve remaining strict violations that cannot be auto-fixed (type narrowing, non-null assertions, explicit `any` removal, indexed access type guards, etc.)
- **Test updates**: Update test files if strict mode reveals type issues (do NOT change test logic — only type annotations and type-safe patterns)
- **Validation**: Verify `pnpm build` and `pnpm test` pass after all changes
- **Verification**: Confirm `pnpm lint` reports zero errors and `pnpm format:check` reports zero diffs

### Out of Scope

- Changing runtime behavior, business logic, or test assertions
- Restructuring files, renaming symbols, or reorganizing modules
- Adding new features or refactoring beyond what's required to pass the quality gate
- Performance optimization (unless required by a linter rule like `@typescript-eslint/no-unnecessary-condition`)

## Functional Behaviors (BDD)

### Requirement 1: Autofix resolves all auto-fixable ESLint and Prettier violations

**GIVEN** the ESLint strict-type-checked config and Prettier are installed and configured
**WHEN** the team runs `eslint --fix .` across all source files
**AND** runs `prettier --write .` across all source files
**THEN** all auto-fixable formatting and lint violations are resolved
**AND** `pnpm format:check` reports zero diffs
**AND** `pnpm lint` reports significantly fewer remaining errors (only non-autofixable ones)

**Uncertainty Level**: Known — autofix is deterministic

### Requirement 2: Manual code changes resolve remaining strict-type-checked violations

**GIVEN** autofix has been applied
**AND** `pnpm lint` still reports violations (type-aware rules that require manual attention)
**WHEN** the team addresses each remaining violation by:

- Adding proper type narrowing and guards (for `noUncheckedIndexedAccess` violations)
- Replacing `any` with proper types or using `unknown` with narrowing (for `no-unsafe-*` rules)
- Adding explicit property initializations (for `strictPropertyInitialization` when combined with `exactOptionalPropertyTypes`)
- Removing unnecessary non-null assertions (`!`) and optional chaining adjustments
- Addressing `exactOptionalPropertyTypes` violations (distinguishing `prop?: T` from `prop: T | undefined`)
  **THEN** `pnpm lint` reports zero errors and zero warnings
  **AND** `pnpm typecheck` (`tsc --build`) reports zero type errors
  **AND** `pnpm format:check` reports zero diffs

**Uncertainty Level**: Known — well-defined rule set, each violation maps to a specific fix pattern

### Requirement 3: Full build and test suite passes after all refactoring

**GIVEN** the codebase has been fully refactored (autofix + manual fixes)
**WHEN** the team runs `pnpm build`
**THEN** `tsc --build` completes with no errors
**AND** the postbuild script (`node scripts/rewrite-imports.mjs`) succeeds
**WHEN** the team runs `pnpm test`
**THEN** all three test groups pass (stable tests, package tests, mock.module tests)
**AND** coverage thresholds are met or exceeded (per `scripts/test.sh`)

**Uncertainty Level**: Known

## Error and Edge Cases

- **`noUncheckedIndexedAccess` on hot paths**: Some indexed access patterns may need performance-friendly workarounds (e.g., extracting to a local variable instead of repeated guarded access)
- **`exactOptionalPropertyTypes` with class fields**: Classes with optional properties (`prop?: T`) that are initialized to `undefined` directly (rather than omitted) will flag — use `prop: T | undefined` instead of `prop?: T` when the field is always present but may be `undefined`
- **`no-unsafe-assignment` with external APIs**: Parsing unknown JSON (`js-yaml`, API responses) will require explicit validation wrappers or casts through `unknown`
- **`no-unnecessary-condition` with Map/Set lookups**: `.get()` or `.has()` results may trigger this rule if the value type already excludes the checked condition
- **Test files**: Some test files may use `as any` for test flexibility — these should be replaced with proper type assertions (`satisfies`, explicit interfaces) rather than suppressed
- **Third-party type declarations**: If `@types/*` packages have imprecise types with implicit `any`, the team may need to add local type augmentations or `expect-error` comments

## Clarification Questions

### Handling of high-violation files

- **Background**: Initial lint run may reveal hundreds of violations concentrated in a few large files. The current index shows 217 files with 1652 nodes and 3921 edges across the project — ESLint strict-type-checked is aggressive and will produce a significant initial count.
- **Impact**: If certain files have a disproportionate number of violations, the question is whether to fix them comprehensively now or add targeted eslint-disable comments for a follow-up.
- **Recommendation**: Fix comprehensively in this phase. The whole purpose of this spec is to reach zero-violation compliance. Targeted eslint-disable comments should only be used as a last resort when a rule produces a false positive for valid code.

### Suppression strategy for unavoidable patterns

- **Background**: Some third-party dependency patterns may trigger strict rules (e.g., dynamic imports with untyped modules). `codegraph` uses `@colbymchenry/codegraph` which is an optional dependency and may not have full type definitions.
- **Impact**: Without a clear suppression strategy, contributors may use `any` casts that the strict lint won't accept.
- **Recommendation**: Use `// eslint-disable-next-line <rule-name> -- <reason>` comments sparingly for unavoidable cases, with a documented reason. Never use file-level `eslint-disable` comments. Prefer `unknown` over `any` for all type escape hatches.

## References

- **Key code file paths** (affected by this spec):
  - `packages/cli/*.ts` — CLI entry point, installer, updater, parsers
  - `packages/tool-registry/*.ts` — tool registry types and implementation
  - `packages/tool-utils/*.ts` — shared utilities (app-error, log-utils, platform-adapter, skill-discovery)
  - `packages/tools/architecture/index.ts` — architecture CLI tool
  - `packages/tools/codegraph/*.ts` — codegraph tool (lib/\*.ts sub-commands)
  - `packages/tools/eval/*.ts` — eval tool (executor, scorer, reporter, optimizer, isolation)
  - `packages/tools/create-specs/index.ts` — spec generator
  - `packages/tools/create-review-report/index.ts` — review report generator
  - `packages/tools/find-github-issues/index.ts`, `read-github-issue/index.ts`, `open-github-issue/index.ts` — GitHub tools
  - `packages/tools/review-threads/index.ts` — review threads tool
  - `packages/tools/validate-*/index.ts` — validators
  - `packages/tui/*.ts` — terminal UI (banner, prompts, terminal)
  - `test/*.test.js` — main test files
  - `scripts/*.mjs` — build/CI support scripts
- Official docs:
  - [typescript-eslint strict-type-checked rules](https://typescript-eslint.io/rules/)
  - [TypeScript strict options](https://www.typescriptlang.org/tsconfig/#strict)
- Related project context files:
  - `CLAUDE.md` — project instructions (will need updates)
