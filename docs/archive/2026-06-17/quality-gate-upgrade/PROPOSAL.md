# Proposal: Quality Gate Upgrade — pnpm, ESLint Strict, Prettier

- **Date**: 2026-06-17
- **Source**: Produced by the `discuss` skill through structured conversation

---

## 1. Scope

### In Scope

1. **pnpm monorepo migration** — Replace npm workspaces with pnpm workspaces, update lockfile format, adjust scripts for pnpm compatibility
2. **TypeScript strict upgrade** — Enable `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`
3. **ESLint strict-type-checked** — Introduce `@typescript-eslint/strict-type-checked` config with type-aware linting
4. **Prettier integration** — Add Prettier with `singleQuote: true`, rest as defaults, as the universal code formatter
5. **Quality gate automation** — CI lint/format-check + pre-commit hooks (husky + lint-staged) to enforce rules before commit
6. **Codebase refactoring** — Migrate existing code across all packages to satisfy the new strict rules (in phases: autofix first, then manual fixes)

### Out of Scope (Explicitly Excluded)

- Adding or changing any runtime behavior or business logic
- Migrating away from existing build/bundling tools (tsc, etc.)
- Reorganizing package directory structure
- Adding new testing frameworks or changing test infrastructure
- `.codegraph/` internal database files (managed by CodeGraph internally)
- `dist/` and `node_modules/` generated files

---

## 2. User Scenarios

### Target Users

The primary audience is **project contributors and maintainers** — anyone who writes TypeScript code in this monorepo.

### Typical Flow (Developer Experience)

1. A contributor clones the repo and runs `pnpm install` instead of `npm install`
2. While coding in their editor, they see instant ESLint + Prettier feedback (via editor integration)
3. Before committing, `lint-staged` runs ESLint + Prettier on staged files automatically
4. In CI, `pnpm lint` and `pnpm format:check` gate the pipeline — violations block merging
5. Over time, `pnpm typecheck` catches more type errors at compile time thanks to the stricter TS config

### Success Criteria

- `pnpm install` works cleanly for all contributors
- `pnpm lint` passes with zero errors across the full codebase
- `pnpm format:check` reports zero formatting diffs
- `pnpm typecheck` passes with no errors under the new strict TS config
- Pre-commit hooks trigger and block commits with violations
- Build (`pnpm build`) succeeds with no regressions

### Error Handling

- **Pre-commit hook fails**: contributor sees which files have which violations; they can `git commit --no-verify` in emergencies (audited in PR review)
- **CI fails**: clear error output pointing to exact file:line for each violation; pipeline blocks merge until resolved
- **TS strict error during refactor**: each package owner receives a list of type errors organized by category, worked through in batches

---

## 3. Constraints

- **Timeline**: No hard deadline, but "want it fast" — phased approach preferred to avoid long-running branches
- **Budget**: No external budget; effort is existing team/contributor time
- **Region / Language**: N/A — tooling change only, no localization impact
- **Security / Privacy**: N/A — no data handling changes
- **Other**: Must not break CI for other in-flight branches (plan for quick merge or feature-flag style incremental rollout)

---

## 4. Business Value

### Problem Statement

The project needs a unified, strict code quality gate to reduce cognitive overhead from style inconsistencies, prevent common type errors at compile time, and make the codebase more maintainable as more contributors join.

- **Before**: npm monorepo, no Prettier, moderate ESLint rules, basic TS strictness
- **After**: pnpm monorepo (faster installs, strict dependency resolution), ESLint strict-type-checked (deep type-aware linting), Prettier (zero-argument formatting), pre-commit enforcement (consistency without manual review overhead)

---

## 5. Requirement Summary

- **pnpm monorepo migration** — Migrate from npm workspaces to pnpm workspaces, with updated lockfile, scripts, and CI pipeline
- **TypeScript strict rules upgrade** — Enable `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noPropertyAccessFromIndexSignature` across all packages
- **ESLint strict config** — Apply `@typescript-eslint/strict-type-checked` with type-aware linting to catch deeper semantic issues
- **Prettier integration** — Add Prettier with `singleQuote: true` and defaults for the rest; integrate into lint/format-check scripts
- **Pre-commit hooks** — Implement husky + lint-staged to auto-format and lint-check staged files before each commit
- **Codebase refactoring** — Run autofix first, then manually resolve remaining strict-rule violations across all packages
- **CI quality gates** — Add `lint` and `format:check` to CI pipeline as blocking checks

---

## 6. Open Questions

None — all scope items, technical direction, and constraints have been clarified through conversation.
