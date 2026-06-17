# Spec: quality-gate-setup

- **Date**: 2026-06-17
- **Feature**: quality-gate-setup
- **Source**: PROPOSAL.md → spec skill via structured exploration

## Goal

Establish a unified, automated code quality gate across the monorepo by upgrading TypeScript strictness, integrating ESLint with `strict-type-checked` rules, adding Prettier formatting, and enforcing all checks via pre-commit hooks and CI.

## Scope

### In Scope

- **TypeScript strict upgrade**: Add `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` to all tsconfig files
- **ESLint**: Install `@typescript-eslint/strict-type-checked` config with type-aware linting across all packages
- **Prettier**: Install Prettier with `singleQuote: true` and defaults for all other options
- **NPM scripts**: Add `lint`, `lint:fix`, `format`, and `format:check` scripts to root `package.json`
- **Pre-commit hooks**: Initialize husky + lint-staged to run ESLint + Prettier on staged files
- **CI integration**: Add lint and format-check steps to CI workflows

### Out of Scope

- Changing any Prettier option beyond `singleQuote` (all others remain defaults)
- Changes to actual TypeScript/JavaScript code (handled by codebase-refactoring spec)
- Adding other lint plugins (e.g., `eslint-plugin-import`, `eslint-plugin-unicorn`) beyond core + typescript-eslint
- Editor configuration files (except `.vscode/settings.json` recommendations if picked up)

## Functional Behaviors (BDD)

### Requirement 1: TypeScript strict configuration includes additional flags

**GIVEN** the root tsconfig and all package-level tsconfigs currently have `strict: true`
**WHEN** the team adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noPropertyAccessFromIndexSignature` to the `compilerOptions` of every tsconfig
**THEN** `tsc --build` type-checks the full project under the new strict rules
**AND** the output reports type errors (if any) that must be addressed

**Uncertainty Level**: Known

### Requirement 2: ESLint with strict-type-checked config is installed and runnable

**GIVEN** the project has no existing ESLint configuration
**WHEN** the team installs `eslint`, `@eslint/js`, `typescript-eslint`, and creates an `eslint.config.js` (flat config) with `@typescript-eslint/strict-type-checked`
**AND** configures `languageOptions.parserOptions.project` pointing to `tsconfig.json`
**WHEN** running `pnpm lint` (or the equivalent script)
**THEN** ESLint produces output (either zero errors or a list of violations)
**AND** type-aware rules (e.g., `no-unsafe-argument`, `no-unsafe-assignment`) are active

**Uncertainty Level**: Known

### Requirement 3: Prettier is installed and can format the codebase

**GIVEN** the project has no existing Prettier configuration
**WHEN** the team installs `prettier` and creates a `.prettierrc` with `{ "singleQuote": true }`
**AND** runs `pnpm format:check`
**THEN** Prettier reports either "All matched files use Prettier code style!" or lists specific formatting diffs
**AND** `pnpm format` applies Prettier formatting to all source files

**Uncertainty Level**: Known

### Requirement 4: Pre-commit hooks enforce lint and format on staged files

**GIVEN** the project uses git for version control
**WHEN** the team initializes husky with a `pre-commit` hook
**AND** configures `lint-staged` to run `eslint --fix` and `prettier --write` on staged `*.ts`, `*.mjs`, `*.js`, `*.json`, `*.yaml` files
**THEN** committing staged changes triggers the hooks
**AND** any violations block the commit (with clear error output)
**AND** `git commit --no-verify` bypasses the hooks

**Uncertainty Level**: Known

### Requirement 5: CI pipeline includes lint and format checks

**GIVEN** the CI workflow `.github/workflows/test.yml` runs tests on push and PR
**WHEN** the team adds steps to run `pnpm lint` and `pnpm format:check` before or alongside the test step
**THEN** CI fails fast if lint or format violations exist, before running tests
**AND** the same checks apply to `.github/workflows/publish-npm.yml`

**Uncertainty Level**: Known

## Error and Edge Cases

- **TypeScript parser compatibility**: `typescript-eslint` must match the TypeScript version in use (`^6.0.3`). Verify `@typescript-eslint/parser` and `typescript-eslint` are compatible with TS 6.x
- **Flat config vs legacy**: The project should use the modern ESLint flat config (`eslint.config.js`). If any ESLint plugins don't support flat config yet, fallback options must be identified
- **config compatibility**: ESLint's `noUncheckedIndexedAccess` overlaps with TS's; the TS version should take precedence (disable the ESLint equivalent to avoid duplicate errors). `@typescript-eslint` does this automatically with `strict-type-checked`
- **Large-file performance**: `lint-staged` only runs on staged files, so initial hook speed should be acceptable. If it's slow, add `concurrently` to parallel ESLint + Prettier
- **Windows Git hook path**: husky installs shell hooks that may fail on Windows without Git Bash — CI uses `shell: bash` already, so the test workflow is safe; local Windows contributors may need guidance
- **`.prettierignore`**: Should mirror `.gitignore` exclusions (`dist/`, `node_modules/`, `.claude/`, `.codegraph/`) plus `*.md` and `*.yml` if desired

## Clarification Questions

None — all tooling choices were confirmed during the discussion phase (TS strict level B, ESLint strict-type-checked, Prettier defaults + singleQuote, husky + lint-staged, CI integration).

## References

- **Key code file paths** (affected by this spec):
  - `tsconfig.json` — root TS config (add 3 strict flags)
  - `packages/*/tsconfig.json` — per-package TS config (add 3 strict flags)
  - `packages/tools/*/tsconfig.json` — per-tool TS config (add 3 strict flags)
  - `package.json` — add scripts (`lint`, `lint:fix`, `format`, `format:check`), devDependencies
  - `.github/workflows/test.yml` — add lint/format steps
  - `.github/workflows/publish-npm.yml` — add lint/format steps
  - (new) `eslint.config.js` — flat config for ESLint
  - (new) `.prettierrc` — Prettier configuration
  - (new) `.husky/pre-commit` — git hook
  - (new) `.lintstagedrc.json` — lint-staged configuration
- Official docs:
  - [typescript-eslint strict-type-checked](https://typescript-eslint.io/users/configs/#strict-type-checked)
  - [Prettier install guide](https://prettier.io/docs/en/install)
  - [husky documentation](https://typicode.github.io/husky/)
  - [lint-staged documentation](https://github.com/lint-staged/lint-staged)
- Related project context files:
  - `CLAUDE.md` — project instructions (will need updates post-migration)
