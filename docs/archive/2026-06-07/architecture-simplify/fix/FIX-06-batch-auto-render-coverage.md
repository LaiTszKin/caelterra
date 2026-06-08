# Fix Worker Prompt: FIX-06-batch-auto-render-coverage

- **Related issue**: FIX-06 / P3-2

## 1. Mission & Rules

### Mission

Add positive test coverage proving successful batch `add` auto-renders when `--no-render` is absent.

### Context

Round 7 found a test coverage gap: batch render code exists, but tests assert only render suppression paths.

### Rules

- Modify only `test/atlas-cli.test.js`.
- Do not modify source code.
- Follow existing `node:test` style and temp project cleanup patterns.
- Do not weaken existing tests.
- Do not spawn sub-workers.

## 2. Context

### Input Files

- `test/atlas-cli.test.js` — read tests around `REGTEST-22` and `REGTEST-23`.
- `skills/init-project-html/lib/atlas/cli.js` — read batch render paths for context only.
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — read P3-2.

### Root Cause

The behavior exists at `cli.js:1176-1180` and `1264-1267`, but no test asserts the positive auto-render path.

## 3. Tasks

### `test/atlas-cli.test.js` — add positive batch render test

1. Open `test/atlas-cli.test.js`.
2. Near `REGTEST-22` / `REGTEST-23`, add a test named `REGTEST-49: successful batch add auto-renders when no no-render flag is present`.
3. Test scenario:
   - create a temp project with `mkProject()`;
   - run `cli.dispatch(['add', 'feature', 'f1', 'feature', 'f2', '--project', root], io)` without `--no-render`;
   - assert exit code is `0`;
   - assert `resources/project-architecture/index.html` exists;
   - clean up temp project in `finally`.

### Output

Report:
- Files modified
- Test name added
- Test results
- Risks or concerns

## 4. Verification

1. Run: `node --test test/atlas-cli.test.js --test-name-pattern "successful batch add auto-renders"`
   - Expected: new test passes.

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — add coverage test.

### Forbidden Files

- `skills/init-project-html/lib/atlas/cli.js` — source behavior is not part of this worker.

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/REPORT.md`
