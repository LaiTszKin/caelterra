# Spec: pnpm-migration

- **Date**: 2026-06-17
- **Feature**: pnpm-migration
- **Source**: PROPOSAL.md → spec skill via structured exploration

## Goal

Replace npm workspaces with pnpm workspaces to gain strict dependency resolution, faster installs, and disk-efficient node_modules layout, with zero impact on runtime behavior.

## Scope

### In Scope

- Replace root `package.json` workspace declaration with `pnpm-workspace.yaml`
- Remove `package-lock.json` and generate `pnpm-lock.yaml`
- Update all `package.json` scripts to use `pnpm` prefix (if needed)
- Update CI workflows (`test.yml`, `publish-npm.yml`, etc.) to use `pnpm` instead of `npm`
- Update `scripts/test.sh` if any `npm`-specific commands exist
- Verify `pnpm build` and `pnpm test` pass cleanly

### Out of Scope

- Changing package structure, directory layout, or naming
- Migrating to a different build system (tsc stays)
- Adding or removing any runtime dependencies
- Changes to the actual TypeScript or application code

## Functional Behaviors (BDD)

### Requirement 1: Initialize pnpm workspace with equivalent config

**GIVEN** the repository currently uses `npm workspaces` declared in root `package.json`
**AND** the workspace includes `packages/*` and `packages/tools/*`
**WHEN** the team creates `pnpm-workspace.yaml` with matching patterns
**AND** removes the `workspaces` field from root `package.json`
**THEN** `pnpm install` resolves all packages with no missing dependencies
**AND** `pnpm-lock.yaml` is generated and committed

**Uncertainty Level**: Known

### Requirement 2: Migrate dependency declarations for pnpm compatibility

**GIVEN** the project has devDependencies and optionalDependencies declared at root (`package.json`)
**AND** pnpm has stricter peer-dependency resolution than npm
**WHEN** the team runs `pnpm install`
**THEN** no warnings or errors about missing peer dependencies are emitted
**AND** the resulting `node_modules` tree produces the same TypeScript compilation output as before

**Uncertainty Level**: Known

### Requirement 3: Build pipeline works identically under pnpm

**GIVEN** the project uses `tsc --build` for compilation and `node scripts/rewrite-imports.mjs` as a postbuild script
**WHEN** the team runs `pnpm build`
**THEN** the `dist/` output is byte-for-byte identical (or functionally equivalent) to the previous `npm run build` output
**AND** `pnpm test` passes all test groups

**Uncertainty Level**: Known

### Requirement 4: CI workflows are updated for pnpm

**GIVEN** the CI workflows (`test.yml`, `publish-npm.yml`, etc.) currently use `npm ci` and `npm run build`
**WHEN** the team updates them to use `pnpm install --frozen-lockfile` and `pnpm run build`
**THEN** all CI jobs pass on both ubuntu-latest and windows-latest
**AND** the publish workflow publishes successfully

**Uncertainty Level**: Known

## Error and Edge Cases

- **Pre-existing `npm-shrinkwrap.json` or `package-lock.json`**: Must be removed before `pnpm install`, or pnpm will warn/refuse
- **Windows path length**: npm's nested `node_modules` can hit Windows MAX_PATH; pnpm's flat store avoids this, but CI must verify `scripts/test.sh` runs correctly on Windows
- **Lifecycle script compatibility**: If any `postinstall` scripts use `npm`-specific env vars (e.g., `npm_package_*`), they must be updated for pnpm equivalents
- **`.npmrc` configuration**: Any existing `.npmrc` settings (registry, auth) must be verified compatible with pnpm (or moved to `.npmrc` with pnpm-namespaced keys)
- **Local workspace protocol**: pnpm uses `workspace:` protocol for inter-package references; if `package.json` files reference sibling packages by version, they must adopt `workspace:*` or `workspace:^`

## Clarification Questions

None — pnpm migration is a well-understood mechanical transformation with Known uncertainty level.

## References

- **Key code file paths** (affected by this spec):
  - `package.json` — root workspace declaration and scripts
  - `.github/workflows/test.yml` — CI test pipeline
  - `.github/workflows/publish-npm.yml` — CI publish pipeline
  - `.github/workflows/eval.yml` — CI eval pipeline
  - `.github/workflows/skill-validation.yml` — CI skill validation pipeline
  - `scripts/test.sh` — test runner script
  - `packages/*/package.json` — per-package metadata (check for workspace protocol)
  - `packages/tools/*/package.json` — per-tool metadata
  - `tsconfig.json` — root tsconfig (unaffected but must verify)
- Official docs:
  - [pnpm workspace documentation](https://pnpm.io/workspaces)
- Related project context files:
  - `CLAUDE.md` — project instructions
