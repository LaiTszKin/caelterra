# Design: Quality Gate Upgrade — pnpm, ESLint Strict, Prettier

- **Date**: 2026-06-17
- **Feature**: quality-gate-upgrade (unified batch)
- **Source SPEC**:
  - `pnpm-migration/SPEC.md`
  - `quality-gate-setup/SPEC.md`
  - `codebase-refactoring/SPEC.md`

> **Purpose:** Technical design document for migrating from npm to pnpm workspaces, upgrading TypeScript strictness, integrating ESLint strict-type-checked with Prettier, and enforcing quality gates via pre-commit hooks and CI. This is a developer-experience and code-health initiative — no runtime behavior changes.

---

## 1. Research Summary

### 1.1 Technical Feasibility

| Requirement                       | Spec Source                            | Feasibility | Risk                                                                                                               |
| --------------------------------- | -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Req 1: pnpm workspace migration   | pnpm-migration/SPEC.md (Req 1–4)       | Feasible    | Low — pnpm 11 stable, workspace protocol is mature, Expo/Apify/etc. have blazed the trail                          |
| Req 2: TS strict additional flags | quality-gate-setup/SPEC.md (Req 1)     | Feasible    | Low — purely additive compiler flags, well-documented                                                              |
| Req 3: ESLint strict-type-checked | quality-gate-setup/SPEC.md (Req 2)     | Feasible    | Medium — type-aware linting is computationally expensive; may need `projectService: true` for monorepo performance |
| Req 4: Prettier integration       | quality-gate-setup/SPEC.md (Req 3)     | Feasible    | Low — zero-config, mature tool                                                                                     |
| Req 5: Pre-commit hooks           | quality-gate-setup/SPEC.md (Req 4)     | Feasible    | Low — husky v9 + lint-staged v15 work with pnpm out of the box                                                     |
| Req 6: CI quality gates           | quality-gate-setup/SPEC.md (Req 5)     | Feasible    | Low — standard pattern, well-documented for GitHub Actions                                                         |
| Req 7: Codebase refactoring       | codebase-refactoring/SPEC.md (Req 1–3) | Feasible    | Medium — `noUncheckedIndexedAccess` will produce many violations; `strict-type-checked` type-aware rules add depth |

**Overall assessment**: All feasible. No blocking issues found.

**Risk details for ESLint type-aware linting**:

- `typescript-eslint` v8 supports `parserOptions.projectService: true` (replacing the older `project` path approach), which delegates TS project resolution to the TypeScript language service. This handles monorepos better and avoids per-file tsconfig misconfigurations.
- First full `lint` run will be slower (type-checking overhead). Subsequent runs are cached by ESLint's cache mechanism (`--cache` flag).
- **Mitigation**: Enable ESLint cache by default. Use `lint-staged` (only runs on staged files) for the pre-commit hook.

### 1.2 Existing Reference Implementations

| Source                                                                                                                                                           | Reusable Design Patterns                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Expo migration to pnpm](https://github.com/expo/expo/pull/44057)                                                                                                | Large monorepo migration: one-shot PR with pnpm-workspace.yaml, CI updates, and `workspace:*` protocol conversion |
| [mattpocock/skills — setup-pre-commit](https://github.com/mattpocock/skills/blob/b843cb5ea74b1fe5e58a0fc23cddef9e66076fb8/skills/misc/setup-pre-commit/SKILL.md) | Husky v9 + lint-staged setup pattern for TypeScript monorepos — exact same toolchain as this project              |
| [typescript-eslint shared configs](https://v8--typescript-eslint.netlify.app/users/configs/#strict-type-checked)                                                 | Official `strictTypeChecked` flat config example with `projectService: true`                                      |

### 1.3 Tech Stack Compatibility

| Candidate                | Repo Compatibility                                                                                                              | License | Decision                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| **pnpm 11**              | Replaces npm; all `npm` commands map to `pnpm` equivalents. Lockfile format changes from `package-lock.json` → `pnpm-lock.yaml` | MIT     | ✅ Recommended                                    |
| **typescript-eslint v8** | Compatible with TypeScript ^6.0.3 (current in repo). Requires ESLint v9+, which is the current stable ESLint.                   | MIT     | ✅ Recommended                                    |
| **ESLint v9**            | Currently not in the project. Must add; ESLint v9 uses flat config by default (`.eslintrc` deprecated)                          | MIT     | ✅ Recommended — required by typescript-eslint v8 |
| **Prettier v3**          | No version conflicts. Works with any Node.js >= 18                                                                              | MIT     | ✅ Recommended                                    |
| **husky v9**             | Git hooks manager. `pnpm exec husky init` sets up `.husky/` directory.                                                          | MIT     | ✅ Recommended                                    |
| **lint-staged v15**      | Runs linters on staged git files. Integrates with husky trivially.                                                              | MIT     | ✅ Recommended                                    |

---

## 2. Architecture Overview

### 2.1 Module List

This change does not introduce new runtime modules. The design adds tooling configuration files and build-pipeline scripts:

| Config / Script                          | Responsibility                                                   | Owned Artifacts                          |
| ---------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `pnpm-workspace.yaml`                    | Declares workspace package patterns for pnpm                     | Workspace membership definition          |
| `eslint.config.mjs`                      | ESLint flat config with strict-type-checked rules                | ESLint rule declarations, parser options |
| `.prettierrc`                            | Prettier formatting configuration                                | Formatting rule set                      |
| `.husky/pre-commit`                      | Pre-commit hook triggering lint-staged                           | Git hook shell script                    |
| `.lintstagedrc.json`                     | lint-staged configuration mapping file patterns to lint commands | Lint-staged pattern definitions          |
| Root `package.json` scripts              | New `lint`, `lint:fix`, `format`, `format:check`                 | Script definitions                       |
| CI workflows (`.github/workflows/*.yml`) | Updated to use pnpm, added lint/format steps                     | CI pipeline definitions                  |

### 2.2 Boundaries

- **Entry points**: CLI (`pnpm lint`, `pnpm format:check`) · Git hook (`git commit`) · CI (`GitHub Actions`)
- **Trust boundary**: None — all tools run locally or in CI with the same source code
- **External → Internal**: `Developer` → `git commit` → `.husky/pre-commit` → `lint-staged` → `eslint --fix` + `prettier --write`
  - `Developer` → `pnpm lint` → `eslint .`
  - `GitHub Actions CI` → `pnpm lint` / `pnpm format:check`

### 2.3 Target vs Baseline

|                   | Baseline (current)  | Target (after change)                                                                                           |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Package manager   | npm workspaces      | pnpm workspaces                                                                                                 |
| Lockfile          | `package-lock.json` | `pnpm-lock.yaml`                                                                                                |
| TypeScript strict | `strict: true`      | `strict: true` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature` |
| Linting           | None                | ESLint `strict-type-checked`                                                                                    |
| Formatting        | None (ad hoc)       | Prettier (automated)                                                                                            |
| Pre-commit        | None                | husky + lint-staged                                                                                             |
| CI checks         | build + test        | lint + format-check + build + test                                                                              |

---

## 3. Interaction Design

### 3.1 Interaction Anchors (`INT-###`)

None. This change is confined to tooling configuration and build scripts. There are no cross-module runtime interactions, no new API surfaces, and no new data flows.

The quality gate interactions are purely mechanical:

- `git commit` spawns a shell hook → `lint-staged` → ESLint/Prettier
- `pnpm lint` / `pnpm format:check` are CLI wrappers around ESLint/Prettier
- CI steps invoke the same scripts

### 3.2 Ordering / Concurrency Constraints

None — ESLint and Prettier are stateless file processors. lint-staged processes files sequentially per pattern.

### 3.3 Requirement Links

- **pnpm-migration Req 1–4**: pnpm-workspace.yaml creation, dependency migration, build verification, CI update → §2.1 (package manager migration)
- **quality-gate-setup Req 1**: TS strict flags → §2.3 (compiler options)
- **quality-gate-setup Req 2–3**: ESLint + Prettier config → §2.1 (config files)
- **quality-gate-setup Req 4**: Pre-commit hooks → §2.1 (.husky + .lintstagedrc)
- **quality-gate-setup Req 5**: CI integration → §2.1 (CI workflow updates)
- **codebase-refactoring Req 1–3**: Autofix + manual fix + verification → §4 (execution plan)

---

## 4. External Dependencies

### 4.1 Dependency Overview

| Dependency              | Purpose                           | Install As                         |
| ----------------------- | --------------------------------- | ---------------------------------- |
| **pnpm**                | Package manager (replaces npm)    | `pnpm add -g pnpm` or via Corepack |
| **ESLint v9+**          | Linter engine                     | `devDependencies`                  |
| **`@eslint/js`**        | ESLint recommended JS rules       | `devDependencies`                  |
| **`typescript-eslint`** | TypeScript ESLint config + parser | `devDependencies`                  |
| **Prettier v3**         | Code formatter                    | `devDependencies`                  |
| **husky v9**            | Git hook manager                  | `devDependencies`                  |
| **lint-staged v15**     | Staged-file linter runner         | `devDependencies`                  |

### 4.2 Dependency Details

#### pnpm 11

**Factual Basis**: pnpm 11 introduced native `pnpm publish` (no more fallback to npm CLI), supply-chain hardening defaults (`minimumReleaseAge`, `allowBuilds`, `strictDepBuilds`, `verifyDepsBeforeRun`).

**Version assumption**: Pinned via `packageManager` field in root `package.json`: `"packageManager": "pnpm@11.x"`

**Key migration facts**:

- Use `pnpm import` to convert existing `package-lock.json` → `pnpm-lock.yaml` (preserves resolved versions)
- Use `pnpm install --frozen-lockfile` in CI (equivalent to `npm ci`)
- Use `pnpm publish` not `npm publish` — npm CLI does not resolve `workspace:*` protocol
- Use `pnpm --filter <package>` to run scripts in specific workspace packages (current codebase doesn't need this since scripts are at root)

#### typescript-eslint v8

**Factual Basis**: All-in-one `typescript-eslint` package (replaces separate `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`). Uses flat config only (compatible with ESLint v9+).

**Key config facts**:

- `projectService: true` preferred over `project` paths for monorepo type-aware linting
- `strictTypeChecked` includes everything from `recommended` + `recommended-type-checked` + `strict` + extra rules
- Cache via `--cache` flag for performance

#### husky v9 + lint-staged v15

**Key setup facts**:

- Init: `pnpm exec husky init` (not the older `npx husky install`)
- Prepare script: `"prepare": "husky"` in `package.json`
- No shebang needed in hook files for husky v9
- lint-staged config can be in `package.json` or `.lintstagedrc.json`

---

## 5. Data Persistence

None. All changes are to configuration files, build scripts, and source code. No runtime data, no new databases, no schema changes.

---

## 6. System Invariants

| Invariant              | How Architecture Could Violate It                                                        | Symptoms of Violation                           |
| ---------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Lockfile consistency   | Using `npm install` instead of `pnpm install` would regenerate `package-lock.json`       | CI builds use wrong lockfile                    |
| Build output identity  | pnpm's strict node_modules could break import resolution if phantom dependencies existed | `pnpm build` fails where `npm run build` passed |
| Lint enforcement       | Developer bypasses pre-commit hook with `--no-verify`                                    | Lint violations enter PR code                   |
| CI gate bypass         | CI jobs run tests but not lint/format-check                                              | Code with violations merges to main             |
| `workspace:*` protocol | Publishing with `npm publish` (not `pnpm publish`) ships unresolved `workspace:*`        | Published package breaks consumers              |

**Mitigations**:

- Lockfile committed and verified via CI `--frozen-lockfile`
- Build verified as part of migration (byte-equivalent output)
- CI lint/format-check gates provide second line of defense after pre-commit hooks
- `pnpm publish` enforced in publish workflow

---

## 7. Technical Trade-offs

| Decision                                                 | Rejected Alternatives                                        | Rationale / Lock-in                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pnpm over npm**                                        | Yarn v4 (Berry)                                              | pnpm is the most widely adopted npm alternative in 2026; Expo, Redwood, and major projects have migrated. Safer community trajectory than Yarn Berry.                            |
| **ESLint flat config over .eslintrc**                    | Legacy `.eslintrc` format                                    | ESLint v10 will remove legacy support; flat config is the only future-proof option. typescript-eslint v8 supports flat config natively.                                          |
| **`strict-type-checked` over `recommended`**             | `recommended` + custom rules                                 | User explicitly chose strict-type-checked. Type-aware linting catches real bugs (unsafe assignment, unnecessary conditions, floating promises) that non-type-aware configs miss. |
| **`projectService: true` over explicit `project` paths** | `project: ['./tsconfig.json', './packages/*/tsconfig.json']` | Project service handles monorepo resolution per-file without manual tsconfig enumeration. Faster to set up, less maintenance.                                                    |
| **husky v9 over lefthook / simple-git-hooks**            | lefthook has richer features                                 | husky is the most widely adopted, best documented, and has the simplest setup with lint-staged.                                                                                  |
| **Prettier defaults + singleQuote**                      | Full custom config                                           | Minimal configuration = minimal debate. singleQuote matches existing code style.                                                                                                 |
| **Manual refactor over blanket eslint-disable**          | Disabling rules for migration                                | The goal is zero-violation compliance. Skipping violations now means they'll never be fixed. Only acceptable for genuine false positives.                                        |

---

## 8. Design-Time Refactoring

### Code Health Findings

During CodeGraph survey, the following code patterns were identified that will need attention with the new strict rules:

| Finding                                                       | Affected Files                                                              | Tier | Disposition                           | Notes                                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexed access without undefined check (`arr[i]`, `obj[key]`) | Many files across all packages                                              | T1   | Refactored (phase 3)                  | `noUncheckedIndexedAccess` will flag all bracket-access patterns. Fix: use `arr[i]!` where guaranteed, or proper `if (val !== undefined)` guard |
| `any` type usage in function parameters                       | `packages/tools/validate-openai-agent-config/index.ts` (dependencies param) | T1   | Refactored                            | `no-unsafe-*` rules flag all `any` usage. Replace with `unknown` + narrowing, or `Record<string, unknown>`                                      |
| `!!` double-negation patterns                                 | Several files (`!!options.index` pattern in codegraph cmd files)            | T1   | Refactored (autofix)                  | `no-extra-boolean-cast` catches these as autofixable                                                                                            |
| Optional property initialization with `undefined`             | Class files using `prop?: T` assigned to `undefined`                        | T1   | Refactored                            | `exactOptionalPropertyTypes` requires `prop: T \| undefined` when always present                                                                |
| Implicit `any` from third-party types                         | `@colbymchenry/codegraph` has some untyped APIs                             | T1   | Deferred with local augmentation      | Add local type declarations rather than disabling the rule                                                                                      |
| `process.stdout.isTTY` without explicit undefined check       | `packages/tools/codegraph/lib/cmd-init.ts` and similar                      | T1   | Refactored                            | Guard with explicit check                                                                                                                       |
| Array<T> generic notation vs T[]                              | All files using `Array<{...}>`                                              | T1   | Refactored (autofix — stylistic rule) | Prettier/ESLint will normalize based on the config                                                                                              |
| `catch` block variables typed as `any` implicitly             | Several `.mjs` files in scripts/                                            | T1   | Refactored                            | Replace with `unknown` or add explicit type annotation                                                                                          |

### No T2/T3 findings

All findings are T1 (single function/file, no API change). No cross-file or cross-module structural changes are required.

---

## 9. Execution Plan (Phased)

Per the agreed order:

### Phase 1: pnpm Migration

1. Install pnpm globally (or via Corepack)
2. Create `pnpm-workspace.yaml` with existing workspace patterns (`packages/*`, `packages/tools/*`)
3. Remove `workspaces` field from root `package.json`
4. Remove `node_modules` and `package-lock.json`
5. Run `pnpm import` to generate `pnpm-lock.yaml`
6. Run `pnpm install`
7. Update CI workflows: `npm ci` → `pnpm install --frozen-lockfile`, add `pnpm/action-setup@v6` step
8. Update any npm-specific shell scripts in `scripts/`
9. Add `packageManager` field to root `package.json`
10. Verify `pnpm build` + `pnpm test` pass on all platforms

### Phase 2: Config Setup

1. Add `strict` additional flags to all tsconfig files
2. Install ESLint + typescript-eslint + Prettier + husky + lint-staged
3. Create `eslint.config.mjs` with `strictTypeChecked`
4. Create `.prettierrc` with `{ "singleQuote": true }`
5. Init husky, create `.husky/pre-commit` hook → `pnpm lint-staged`
6. Create `.lintstagedrc.json` targeting `*.ts`, `*.mjs`, `*.js`, `*.json`
7. Add `lint`, `lint:fix`, `format`, `format:check` scripts to `package.json`
8. Update CI workflows with lint/format-check steps

### Phase 3: Codebase Refactoring

1. Run `prettier --write .` across all files
2. Run `eslint --fix .` across all files
3. Iterate on remaining violations manually
4. Verify `pnpm build` + `pnpm test` + `pnpm lint` + `pnpm format:check` all pass
5. Update `CLAUDE.md` and `AGENTS.md` to reflect new quality gates

---

## 10. References

- **Designed code file paths**:
  - `package.json` — root workspace/scripts/dependencies
  - `pnpm-workspace.yaml` — new workspace declaration
  - `tsconfig.json`, `packages/*/tsconfig.json`, `packages/tools/*/tsconfig.json` — TS strict flags
  - `.github/workflows/test.yml`, `publish-npm.yml`, `eval.yml`, `skill-validation.yml` — CI updates
  - `scripts/test.sh` — script updates for pnpm compatibility
  - `eslint.config.mjs` — new ESLint flat config
  - `.prettierrc` — new Prettier config
  - `.husky/pre-commit` — new pre-commit hook
  - `.lintstagedrc.json` — new lint-staged config
  - All `*.ts` and `*.mjs` files across `packages/`, `scripts/`, `test/` — refactored for strict compliance

- **Project context files**:
  - `CLAUDE.md` — will need update to reflect pnpm commands and quality gates
  - `resources/project-architecture/atlas/features/*` — may need new feature definition for quality-gate

- **Related documents**:
  - `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
  - `docs/plans/2026-06-17/quality-gate-upgrade/quality-gate-setup/SPEC.md`
  - `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md`
  - `docs/plans/2026-06-17/quality-gate-upgrade/PROPOSAL.md`
