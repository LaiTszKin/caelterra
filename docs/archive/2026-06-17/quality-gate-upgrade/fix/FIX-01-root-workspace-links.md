# Fix Worker Prompt: FIX-01-root-workspace-links

- **Related issues**: P1-001, P1-002

---

## 1. Mission & Rules

### Mission

Make root-level lint and test execution resolve internal `@laitszkin/*` workspace packages under pnpm without broad hoisting or npm fallback.

### Context

The review flagged `quality-gate-setup Req 2`, `codebase-refactoring Req 1-3`, and `pnpm-migration Req 2-3`. `npx --yes pnpm@11.6.0 lint --cache` fails on `bin/apollo-toolkit.ts` because the type-aware lint path cannot resolve the `@laitszkin/cli` import. `npx --yes pnpm@11.6.0 test` fails because root tests import packages such as `@laitszkin/cli`, `@laitszkin/tui`, and `@laitszkin/tool-utils`, but the root importer does not declare the internal workspace packages and pnpm therefore does not link them at root.

### Rules

- Follow the Scope in Section 5. Only modify the root package metadata and the lockfile generated from it.
- Do not use `shamefully-hoist`, `public-hoist-pattern`, `node-linker=hoisted`, or any broad pnpm hoisting workaround.
- Do not weaken ESLint rules, skip tests, change test assertions, or add `eslint-disable` comments.
- Do not change runtime source code unless the package metadata change fails to resolve P1-001; report to the coordinator before expanding scope.
- Use the pinned package manager through `npx --yes pnpm@11.6.0 ...` if `pnpm` is not available directly.
- Workers are leaf nodes. Do not spawn sub-workers.

---

## 2. Context

### Input Files

- `package.json` — root importer currently lacks `@laitszkin/*` workspace package declarations.
- `pnpm-lock.yaml` — must be regenerated after root metadata changes.
- `pnpm-workspace.yaml` — workspace membership is `packages/*` and `packages/tools/*`.
- `bin/apollo-toolkit.ts` — root TypeScript entry point imports `@laitszkin/cli`.
- `test/**/*.test.js` — root tests import internal packages by package name.
- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md` — P1-001 and P1-002 details.
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — pnpm strict dependency resolution requirements.
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md` — lint/test zero-failure requirements.

### Root Cause

pnpm only links packages that the current importer declares. The root importer contains source and tests that import internal workspace package names, but `package.json` only declares external dependencies/devDependencies. TypeScript build succeeds through project references, but Node and ESLint package resolution from the root cannot find `@laitszkin/*` packages.

---

## 3. Tasks

### `package.json` — declare root-local workspace development dependencies

1. Open `package.json`.
2. In root `devDependencies`, add every internal workspace package imported from root tests or root source with the value `workspace:*`.
3. Include at least these package names:
   - `@laitszkin/cli`
   - `@laitszkin/tui`
   - `@laitszkin/tool-registry`
   - `@laitszkin/tool-utils`
   - `@laitszkin/tool-architecture`
   - `@laitszkin/tool-codegraph`
   - `@laitszkin/tool-create-review-report`
   - `@laitszkin/tool-create-specs`
   - `@laitszkin/tool-find-github-issues`
   - `@laitszkin/tool-open-github-issue`
   - `@laitszkin/tool-read-github-issue`
   - `@laitszkin/tool-review-threads`
   - `@laitszkin/tool-validate-openai-agent-config`
   - `@laitszkin/tool-validate-skill-frontmatter`
4. Keep existing external dependency versions unchanged.
5. Keep root runtime `dependencies` unchanged unless the coordinator explicitly approves a publish-model change. These workspace links are local development links for lint/test/build.

### `pnpm-lock.yaml` — update the root importer

1. Run `npx --yes pnpm@11.6.0 install --lockfile-only`.
2. Verify `pnpm-lock.yaml` root importer (`importers: .:`) includes the new `workspace:*` internal devDependencies.
3. Do not hand-edit the lockfile.

### Output

When done, report back to the coordinator:

- **Files modified**: `package.json`, `pnpm-lock.yaml`
- **Change summary**: root importer declares internal workspace packages needed by root source/tests
- **Test results**: command outcomes from Section 4
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `npx --yes pnpm@11.6.0 install --frozen-lockfile`
   - Expected: exits 0 and creates root `node_modules/@laitszkin/cli`, `node_modules/@laitszkin/tui`, and `node_modules/@laitszkin/tool-utils` links.
2. Run: `node -e "const fs=require('fs'); for (const p of ['cli','tui','tool-registry','tool-utils','tool-create-specs','tool-create-review-report','tool-read-github-issue','tool-validate-openai-agent-config','tool-validate-skill-frontmatter']) { if (!fs.existsSync('node_modules/@laitszkin/'+p)) throw new Error('missing workspace link '+p); }"`
   - Expected: exits 0.
3. Run: `npx --yes pnpm@11.6.0 lint --cache`
   - Expected: exits 0 with no ESLint errors.
4. Run: `npx --yes pnpm@11.6.0 test`
   - Expected: all three test groups pass.

---

## 5. Scope & References

### Allowed Files

- `package.json` — declare internal workspace devDependencies for root lint/test resolution.
- `pnpm-lock.yaml` — generated by pnpm after metadata changes.

### Forbidden Files

- `eslint.config.mjs` — do not silence the lint failure.
- `scripts/test.sh` — do not skip root tests or change test groups.
- `pnpm-workspace.yaml` and `.npmrc` — do not add broad hoisting or node-linker workarounds.
- `bin/apollo-toolkit.ts`, `packages/**`, `test/**` — source and regression test changes are outside this fix worker.

### Related Documents

- `docs/plans/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/codebase-refactoring/SPEC.md`
- `docs/plans/2026-06-17/quality-gate-upgrade/DESIGN.md`
