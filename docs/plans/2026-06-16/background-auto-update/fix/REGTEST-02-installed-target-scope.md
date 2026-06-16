# Regression Test Worker Prompt: REGTEST-02-installed-target-scope

- **Related fix**: FIX-02 - restrict auto-update runner to installed managed targets

---

## 1. Mission & Rules

### Mission

Add regression coverage proving the runner only updates manifest-backed Apollo Toolkit target directories and does not fail or create unselected targets when candidate modes include every supported mode.

### Context

FIX-02 changes target selection from all supported modes to manifest-backed managed targets. The unfixed code calls `installLinks()` with all modes, which can throw for absent OpenClaw workspaces and can create/update unselected agent directories.

### Rules

- Only create or modify test files - never modify source code.
- The test must fail on the unfixed code and pass after FIX-02.
- Follow existing `node:test` patterns in the reference files.
- Do not weaken, skip, or remove existing assertions.
- Workers are leaf nodes - do not spawn sub-workers.

---

## 2. Context

### Input Files

- Fix-related files: `packages/cli/installer.ts`, `packages/cli/auto-update-runner.ts`, `packages/cli/index.ts`.
- Existing test files: `test/cli/auto-update-runner.test.js`, `test/installer.test.js`.
- Manifest behavior reference: `packages/cli/installer.ts` functions `writeManifest()`, `readManifest()`, and `installLinks()`.

### Test Design

- **Test ID**: REGTEST-02
- **Type**: Integration test with temp home, fake package source, and existing target manifest.
- **Location**: `test/cli/auto-update-runner.test.js`
- **Scenario**: GIVEN only a Trae target has an Apollo Toolkit manifest and the home has no OpenClaw workspaces, WHEN `runAutoUpdate()` is called with all supported candidate modes, THEN it updates the Trae managed skill, does not create Codex/Agents/Claude target skill directories, and does not fail because OpenClaw is absent.
- **Oracle**: On unfixed code, the run fails with `No workspace directories found under: .../.openclaw` or writes unselected targets; after FIX-02, the run succeeds and only the manifest-backed Trae target is updated.

---

## 3. Tasks

1. Open `test/cli/auto-update-runner.test.js`.
2. Add imports if needed:
   - `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync` already exist; add `writeManifest` via dynamic import inside the test rather than top-level package import if that matches file style.
3. Add a new test near the managed overwrite tests:
   - Name: `updates only manifest-backed installed targets when candidate modes include all`.
   - Create `tmp`, `homeDir`, `toolkitHome = join(homeDir, '.apollo-toolkit')`, and `traeRoot = join(homeDir, '.trae', 'skills')`.
   - Create current toolkit content version `1.0.0` with `createSourceFixture(toolkitHome, '1.0.0', '# Old content\n')`.
   - Create existing Trae target skill at `join(traeRoot, 'test-skill', 'SKILL.md')` with `# Locally modified target\n`.
   - Import `writeManifest` from `../../packages/cli/dist/installer.js` and write a Trae manifest at `traeRoot` with `version: '1.0.0'`, `linkMode: 'copy'`, `skills: ['test-skill']`, `previousSkills: []`.
   - Do not create `join(homeDir, '.openclaw')`.
   - Use a fake package source that extracts version `2.0.0` with `skills/test-skill/SKILL.md` set to `# New content\n`.
   - Call `runAutoUpdate({ sourceRoot: tmp, toolkitHome, packageName: '@laitszkin/cli', currentVersion: '1.0.0', modes: ['codex', 'openclaw', 'trae', 'agents', 'claude-code'], env: { HOME: homeDir, APOLLO_TOOLKIT_HOME: toolkitHome }, packageSource: fakeSource })`.
   - Assert `result.updated === true` and `!result.lastError`.
   - Assert `join(traeRoot, 'test-skill', 'SKILL.md')` contains `# New content\n`.
   - Assert these unselected paths do not exist: `join(homeDir, '.codex', 'skills', 'test-skill')`, `join(homeDir, '.agents', 'skills', 'test-skill')`, and `join(homeDir, '.claude', 'skills', 'test-skill')`.
4. Keep the test deterministic and filesystem-only; do not invoke real schedulers or network.

### Output

When done, report back to the coordinator:
- **Test file**: `test/cli/auto-update-runner.test.js`
- **Test name**: `updates only manifest-backed installed targets when candidate modes include all`
- **Oracle confirmed**: fails before FIX-02 and passes after FIX-02
- **Risks or concerns**: or `None`

---

## 4. Verification

1. Run before FIX-02 is applied: `npm run build && node --test dist/test/cli/auto-update-runner.test.js`
   - Expected: New test fails because all-mode target resolution hits absent OpenClaw or unselected target paths.
2. Run after FIX-02 is applied: `npm run build && node --test dist/test/cli/auto-update-runner.test.js`
   - Expected: New test passes.
3. Run: `node --test dist/test/installer.test.js`
   - Expected: Existing installer manifest/target tests still pass.

---

## 5. Scope & References

### Allowed Files

- `test/cli/auto-update-runner.test.js` - write the regression test here.

### Forbidden Files

- All source code files under `packages/**` - this worker is test-only.
- `dist/**` - generated output; never edit by hand.

### Related Documents

- `docs/plans/2026-06-16/background-auto-update/fix/FIX-02-installed-target-scope.md`
- `docs/plans/2026-06-16/background-auto-update/SPEC.md`
- `docs/plans/2026-06-16/background-auto-update/REPORT.md`
