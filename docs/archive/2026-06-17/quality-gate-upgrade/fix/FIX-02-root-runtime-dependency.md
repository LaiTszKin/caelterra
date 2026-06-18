# Fix Worker Prompt: FIX-02-root-runtime-dependency

- **Related issue**: P1-001 — root CLI package omits runtime workspace dependency

---

## 1. Mission & Rules

### Mission

Make the published root package install the runtime CLI module it imports.

### Context

The review flagged a spec implementation deviation for `pnpm-migration Req 2` and `Req 4`. `bin/apollo-toolkit.ts` imports `@laitszkin/cli` at runtime, but root `package.json` currently lists `@laitszkin/cli` only in `devDependencies`, so consumers installing `@laitszkin/apollo-toolkit` do not receive the runtime package required by `dist/bin/apollo-toolkit.js`.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed.
- Preserve existing local workspace links needed by tests.
- Do not remove runtime dependencies unrelated to this issue.
- Do not add broad pnpm hoisting or weaken pnpm's strict dependency resolution.
- Do not use `npm install`.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- `docs/archive/2026-06-17/quality-gate-upgrade/REPORT.md` — read P1-001 and requirement traceability.
- `docs/archive/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — read Requirements 2 and 4.
- `docs/archive/2026-06-17/quality-gate-upgrade/DESIGN.md` — read the `workspace:*` publish and pnpm publish design notes.
- `package.json` — root importer and published package dependency metadata.
- `pnpm-lock.yaml` — lockfile importer state to update after `package.json` changes.
- `bin/apollo-toolkit.ts` — runtime import of `@laitszkin/cli`.
- `packages/cli/package.json` — confirms `@laitszkin/cli` carries transitive runtime dependencies on the tool packages.

### Root Cause

The root package's runtime bin imports `@laitszkin/cli`, but `@laitszkin/cli` is declared under root `devDependencies`. Dev dependencies are not installed for package consumers. The local workspace still works because pnpm links dev dependencies during repository development, but the published package contract is incomplete.

---

## 3. Tasks

### `package.json` — move root runtime CLI dependency to `dependencies`

1. Open `package.json`.
2. Locate the root `"dependencies"` object around lines 51-56 and the root `"devDependencies"` object around lines 60-84.
3. Modify dependency placement:
   - **Before**: `@laitszkin/cli` exists only in `devDependencies` with value `"workspace:*"`.
   - **After**: `@laitszkin/cli` exists in `dependencies` with value `"workspace:*"` and does not exist in `devDependencies`.
4. Keep the other internal workspace packages in `devDependencies` if local tests or tooling import them directly.
5. Keep existing third-party runtime dependencies unchanged.

### `pnpm-lock.yaml` — refresh lockfile importer metadata

1. Run: `npx --yes pnpm@11.6.0 install --lockfile-only`
2. Confirm the root importer reflects `@laitszkin/cli` under runtime dependencies, not devDependencies.

### Output

When done, report back to the coordinator:

- **Files modified**: `package.json`, `pnpm-lock.yaml`
- **Change summary**: moved root `@laitszkin/cli` workspace link to runtime dependencies and refreshed lockfile
- **Test results**: include command results from Section 4
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `node -e "const pkg=require('./package.json'); if (pkg.dependencies?.['@laitszkin/cli'] !== 'workspace:*') throw new Error('root runtime dependency @laitszkin/cli must be in dependencies as workspace:*'); if (pkg.devDependencies?.['@laitszkin/cli']) throw new Error('@laitszkin/cli must not remain duplicated in devDependencies');"`
   - Expected: exits 0
2. Run: `npx --yes pnpm@11.6.0 install --frozen-lockfile`
   - Expected: exits 0
3. Run: `npx --yes pnpm@11.6.0 publish --dry-run --no-git-checks`
   - Expected: exits 0 and does not fail because of unresolved workspace dependency metadata

---

## 5. Scope & References

### Allowed Files

- `package.json` — move `@laitszkin/cli` from `devDependencies` to `dependencies`.
- `pnpm-lock.yaml` — refresh importer metadata after dependency placement changes.

### Forbidden Files

- `package-lock.json` — owned by `FIX-01-remove-npm-lockfile`.
- `bin/apollo-toolkit.ts` — evidence only; do not change runtime import behavior.
- `.github/workflows/publish-npm.yml` — publish workflow already invokes pnpm.
- `test/quality-gate-workflows.test.js` — owned by regression test workers.

### Related Documents

- `docs/archive/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/DESIGN.md`
