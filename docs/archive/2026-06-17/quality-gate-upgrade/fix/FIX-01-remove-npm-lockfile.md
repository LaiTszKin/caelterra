# Fix Worker Prompt: FIX-01-remove-npm-lockfile

- **Related issue**: P0-001 — npm lockfile remains tracked after pnpm migration

---

## 1. Mission & Rules

### Mission

Remove the stale npm lockfile so the repository has a single pnpm lockfile source of truth.

### Context

The review flagged a spec implementation omission for `pnpm-migration Req 1`. The spec requires replacing npm workspaces with pnpm workspaces, committing `pnpm-lock.yaml`, and removing the prior npm lockfile.

### Rules

- Follow the Scope in Section 5 — only modify files listed as Allowed.
- Preserve existing test semantics — do not weaken, skip, or remove existing tests.
- Do not regenerate `package-lock.json`.
- Do not modify `pnpm-lock.yaml`; that file is owned by `FIX-02`.
- If `package-lock.json` is already absent and untracked, report that this fix is already complete.
- Workers are leaf nodes — do not spawn sub-workers.

---

## 2. Context

### Input Files

- `docs/archive/2026-06-17/quality-gate-upgrade/REPORT.md` — read P0-001 and requirement traceability.
- `docs/archive/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md` — read Requirement 1 and the lockfile edge case.
- `package-lock.json` — stale npm lockfile that must be removed.
- `pnpm-lock.yaml` — committed pnpm lockfile that remains the source of truth.
- `pnpm-workspace.yaml` — workspace declaration already present.

### Root Cause

The pnpm migration generated and committed `pnpm-lock.yaml`, but the prior `package-lock.json` still exists and is tracked. This leaves two lockfiles in the repository and directly contradicts the migration requirement.

---

## 3. Tasks

### `package-lock.json` — remove stale npm lockfile

1. Confirm the stale lockfile is tracked:
   - Run: `git ls-files package-lock.json`
   - Expected before the fix: `package-lock.json`
2. Delete `package-lock.json` from the repository.
3. Do not alter `pnpm-lock.yaml`.

### Output

When done, report back to the coordinator:

- **Files modified**: `package-lock.json`
- **Change summary**: removed stale npm lockfile
- **Test results**: include command results from Section 4
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run: `git ls-files package-lock.json`
   - Expected: no output
2. Run: `test ! -e package-lock.json`
   - Expected: exits 0
3. Run: `test -e pnpm-lock.yaml`
   - Expected: exits 0

---

## 5. Scope & References

### Allowed Files

- `package-lock.json` — remove this stale npm lockfile.

### Forbidden Files

- `pnpm-lock.yaml` — owned by `FIX-02-root-runtime-dependency`.
- `package.json` — owned by `FIX-02-root-runtime-dependency`.
- `test/quality-gate-workflows.test.js` — owned by regression test workers.

### Related Documents

- `docs/archive/2026-06-17/quality-gate-upgrade/REPORT.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/pnpm-migration/SPEC.md`
- `docs/archive/2026-06-17/quality-gate-upgrade/DESIGN.md`
