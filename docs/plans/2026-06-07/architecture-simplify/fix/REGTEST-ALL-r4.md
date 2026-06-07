# Regression Test Worker Prompt: REGTEST-ALL-r4

- **Related fixes**: FIX-01 (cli.js behavioral), FIX-02 (state.js overlay), FIX-03 (docs)

---

## 1. Mission & Rules

### Mission

Write 18 regression tests (REGTEST-10 through REGTEST-27) in `test/atlas-cli.test.js` covering all behavioral fixes from Round 4. These tests verify that the P1/P2 behavioral fixes work correctly and close the test coverage gaps identified in REPORT.md.

### Context

Round 4 identified 27 findings (P1:5, P2:12, P3:10). The fix workers (FIX-01, FIX-02, FIX-03) have applied all source-code fixes. These regression tests confirm:
1. Each behavioral fix works correctly (oracle fails before fix, passes after fix)
2. The test coverage gaps identified in REPORT.md (P2-9, P2-10, P2-11, P2-12, P3-9, P3-10) are addressed

### Rules

- Only create or modify test files — never modify source code
- The test must fail on the unfixed code and pass after the fix is applied — this is the core oracle
- Follow the existing test patterns and style in `atlas-cli.test.js` (use `mkProject`, `makeIo`, `cli.dispatch`)
- If a test cannot be designed to fail before the fix, note it in the output — do not write a weak test
- Workers are leaf nodes — do not spawn sub-workers
- All tests go in `test/atlas-cli.test.js`, appended after REGTEST-09

---

## 2. Context

### Input Files

- Fix-related files:
  - `skills/init-project-html/lib/atlas/cli.js` — All behavioral fixes applied
  - `skills/init-project-html/lib/atlas/state.js` — deriveOverlay removed.submodules fix
  - `skills/init-project-html/lib/atlas/cli-help.js` — hiddenVerbs export

- Existing test files (as format reference):
  - `test/atlas-cli.test.js` — Follow existing patterns (L1600+ for REGTEST examples)

- Report:
  - `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 4 findings
  - `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-cli-r4.md` — Fix details for reference

### Test Design Summary

| Test ID | Related Fix | Type | Scenario | Oracle |
|---------|-------------|------|----------|--------|
| REGTEST-10 | P1-1 | Integration | Duplicate feature add with --depends-on — edges should NOT be created | Before fix: edges created despite "skip". After fix: no edges. |
| REGTEST-11 | P1-2 | Integration | add feature with --depends-on to non-existent feature | Before fix: silently creates dangling edge. After fix: throws error. |
| REGTEST-12 | P1-3 | Integration | add entity with --spec to non-existent directory | Before fix: silently creates overlay dir. After fix: throws error. |
| REGTEST-13 | P1-4 | Integration | submodule remove --spec — verify removed.submodules populated in overlay | Before fix: _removed.yaml has no submodule entries. After fix: has entries. |
| REGTEST-14 | P1-5 | Integration | diff --spec filters to one spec directory | Before fix: shows all specs. After fix: shows only the specified spec. |
| REGTEST-15 | P2-1 | Integration | Duplicate entity add — verify message goes to stdout, not stderr | Before fix: message on stderr. After fix: message on stdout. |
| REGTEST-16 | P2-2 | Integration | Batch rollback — verify history file has no phantom entries | Before fix: history has entries from rolled-back entities. After fix: no phantom entries. |
| REGTEST-17 | P2-3 | Integration | Add duplicate intra-feature relation — verify skipped | Before fix: silently creates duplicate intra-feature edge. After fix: returns skipped. |
| REGTEST-18 | P2-4 | Integration | --depends-on with missing value in batch mode | Before fix: creates dangling edge to "true". After fix: throws error. |
| REGTEST-19 | P2-5 | Integration | remove relation with --id but no --to — verify required error | Before fix: passes verbRemove check but fails in verbEdge. After fix: clear error from verbRemove. |
| REGTEST-20 | P2-7 | Unit | hiddenVerbs export matches MULTI_VERBS | Before fix: no export to compare. After fix: sets are identical. |
| REGTEST-21 | P2-8 | Integration | open --spec renders and opens spec overlay | Before fix: opens base atlas ignoring --spec. After fix: opens spec overlay HTML. |
| REGTEST-22 | P3-1 | Integration | Skipped entity — verify HTML not regenerated (no new render) | Before fix: render runs on skipped entity. After fix: no render. |
| REGTEST-23 | P3-3 | Integration | Entity-level --no-render in batch suppresses batch render | Before fix: render runs despite entity-level --no-render. After fix: render skipped. |
| REGTEST-24 | P2-9 | Integration | Deeper assertions for add --spec + diff — verify overlay content | Before: shallow test. After: verifies overlay files and diff page count. |
| REGTEST-25 | P2-10/P2-11 | Integration | render --spec output location and merge without --no-render | Before: no test coverage. After: verifies correct output paths. |
| REGTEST-26 | P2-12 | Integration | submodule remove --spec — verify _removed.yaml submodule entries | Before: no submodule entries. After: correct entries. |
| REGTEST-27 | P3-9/P3-10 | Integration | Non-existent entity remove error + --spec mode cascade behavior | Before: no test coverage. After: error message and cascade verified. |

---

## 3. Tasks

Append the following 18 tests to `test/atlas-cli.test.js`, after the REGTEST-09 block (after L1620).

### REGTEST-10 (P1-1): Duplicate feature add with --depends-on should skip edges

```javascript
test('REGTEST-10: duplicate feature add with --depends-on skips edge creation (P1-1)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // First add — creates feature + depends-on edge
    let code = await cli.dispatch(['add', 'feature', 'existing', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    // Second add — should be skipped, no edge created
    code = await cli.dispatch(['add', 'feature', 'existing', '--depends-on', 'nonexistent', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /already exists/);
    // Verify no dangling edge was created
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const depEdge = (state.edges || []).find(e => e.kind === 'dependency');
    assert.equal(depEdge, undefined, 'dependency edge should not have been created');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-11 (P1-2): add feature with --depends-on to non-existent target errors

```javascript
test('REGTEST-11: add feature --depends-on to non-existent target errors (P1-2)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Add a real feature first
    await cli.dispatch(['add', 'feature', 'order', '--project', root, '--no-render'], io);
    // Try to add feature with --depends-on to non-existent target
    const code = await cli.dispatch(['add', 'feature', 'payment', '--depends-on', 'nonexistent', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /nonexistent/);
    // Also verify the feature itself was not added (since the error prevents the entire operation)
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.find(f => f.slug === 'payment'), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-12 (P1-3): add --spec to non-existent directory errors

```javascript
test('REGTEST-12: add --spec to non-existent directory errors (P1-3)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'feature', 'test', '--spec', 'nonexistent/spec-dir', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /not found|exist/);
    // Verify no overlay was created
    const overlayPath = path.join(root, 'nonexistent/spec-dir/architecture_diff/atlas');
    assert.equal(fs.existsSync(overlayPath), false, 'overlay should not have been created');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-13 (P1-4): submodule remove --spec populates removed.submodules

```javascript
test('REGTEST-13: submodule remove --spec populates overlay.removed.submodules (P1-4)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Set up base: feature with two submodules
    await cli.dispatch(['add', 'feature', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'ui', '--part-of', 'register', '--project', root, '--no-render'], io);

    const specDir = 'docs/plans/test-remove-submodule-spec';
    // Remove one submodule in spec mode
    await cli.dispatch(['remove', 'module', 'api', '--part-of', 'register', '--spec', specDir, '--project', root, '--no-render'], io);

    // Verify overlay has removed.submodules populated
    const overlay = stateLib.loadOverlay(path.join(root, specDir, 'architecture_diff', 'atlas'));
    assert.ok(overlay.removed, 'overlay should have removed field');
    assert.equal(overlay.removed.submodules.length, 1, 'should have 1 removed submodule');
    assert.equal(overlay.removed.submodules[0].feature, 'register');
    assert.equal(overlay.removed.submodules[0].submodule, 'api');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-14 (P1-5): diff --spec filters to one spec

```javascript
test('REGTEST-14: diff --spec filters to one spec directory (P1-5)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'base', '--project', root, '--no-render'], io);

    // Create two spec overlays
    const specA = 'docs/plans/spec-a';
    const specB = 'docs/plans/spec-b';
    await cli.dispatch(['add', 'feature', 'from-a', '--spec', specA, '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'from-b', '--spec', specB, '--project', root, '--no-render'], io);

    // diff --spec spec-a should only show spec-a changes
    const outDir = path.join(root, 'diff-filter');
    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--spec', 'docs/plans/spec-a', '--project', root, '--out', outDir, '--no-open'], diffIo);
    assert.equal(code, 0, 'diff --spec should succeed');
    // Should mention spec-a
    assert.match(diffIo.stdout_text, /spec-a/);
    // Should NOT mention spec-b
    assert.doesNotMatch(diffIo.stdout_text, /spec-b/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-15 (P2-1): Duplicate entity message on stdout, not stderr

```javascript
test('REGTEST-15: duplicate entity "already exists" message on stdout (P2-1)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    // Message should be on stdout, not stderr
    assert.match(io.stdout_text, /already exists/);
    assert.doesNotMatch(io.stderr_text, /already exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-16 (P2-2): Batch rollback doesn't leak history entries

```javascript
test('REGTEST-16: batch rollback does not leave phantom history entries (P2-2)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'existing', '--project', root, '--no-render'], io);

    // Read initial history length
    const historyFile = path.join(root, 'resources/project-architecture/atlas', '_history.jsonl');
    const historyBefore = fs.existsSync(historyFile) ? fs.readFileSync(historyFile, 'utf8').trim().split('\n').filter(Boolean).length : 0;

    // Failed batch: module without --part-of
    const code = await cli.dispatch(['add', 'feature', 'f1', 'module', 'm1', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);

    // Read history length after rollback
    const historyAfter = fs.existsSync(historyFile) ? fs.readFileSync(historyFile, 'utf8').trim().split('\n').filter(Boolean).length : 0;
    assert.equal(historyAfter, historyBefore, 'history length should not increase after rollback');

    // Verify state was also restored
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.length, 1, 'only the original feature should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-17 (P2-3): Intra-feature duplicate relation detected

```javascript
test('REGTEST-17: duplicate intra-feature relation is skipped (P2-3)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'f', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'f', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'f', '--project', root, '--no-render'], io);

    // First relation — should succeed
    let code = await cli.dispatch(['add', 'relation', 'f/svc', '--data-flow-to', 'f/api', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /add applied/);

    const io2 = makeIo();
    // Duplicate relation — should be skipped
    code = await cli.dispatch(['add', 'relation', 'f/svc', '--data-flow-to', 'f/api', '--project', root, '--no-render'], io2);
    assert.equal(code, 0);
    assert.match(io2.stdout_text, /already exists/i);

    // Verify only ONE edge was created
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const feat = state.features.find(f => f.slug === 'f');
    const dataRowEdges = (feat.edges || []).filter(e => e.kind === 'data-row');
    assert.equal(dataRowEdges.length, 1, 'should have exactly 1 data-row edge');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-18 (P2-4): --depends-on with missing value errors

```javascript
test('REGTEST-18: --depends-on with missing value in batch errors (P2-4)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'order', '--project', root, '--no-render'], io);
    // --depends-on followed by --no-render (boolean flag, not a value)
    const code = await cli.dispatch(['add', 'feature', 'payment', '--depends-on', '--no-render', '--project', root], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /depends-on/);
    // Verify no dangling edge to "true" was created
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const depEdge = (state.edges || []).find(e => e.kind === 'dependency');
    assert.equal(depEdge, undefined, 'no dependency edge should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-19 (P2-5): remove relation with --id but no --to errors clearly

```javascript
test('REGTEST-19: remove relation with --id but no --to requires --to (P2-5)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'relation', 'a', '--id', 'e-abc123', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    // Should mention --to requirement clearly
    assert.match(io.stderr_text, /--to/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-20 (P2-7): hiddenVerbs matches MULTI_VERBS

```javascript
test('REGTEST-20: hiddenVerbs export matches MULTI_VERBS (P2-7)', () => {
  const cliHelp = require('../skills/init-project-html/lib/atlas/cli-help.js');
  // Verify hiddenVerbs is exported
  assert.ok(cliHelp.hiddenVerbs, 'hiddenVerbs should be exported from cli-help.js');
  assert.ok(cli.MULTI_VERBS, 'MULTI_VERBS should be exported from cli.js');
  // Compare sets: same size and same elements
  assert.equal(cliHelp.hiddenVerbs.size, cli.MULTI_VERBS.size, 'sets should have same size');
  for (const v of cli.MULTI_VERBS) {
    assert.ok(cliHelp.hiddenVerbs.has(v), `hiddenVerbs should contain "${v}" from MULTI_VERBS`);
  }
});
```

### REGTEST-21 (P2-8): open --spec renders spec overlay

```javascript
test('REGTEST-21: open --spec renders and opens spec overlay (P2-8)', async () => {
  const root = mkProject();
  try {
    // Set up base feature
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'base', '--project', root, '--no-render'], io);
    // Create a spec overlay
    const specDir = 'docs/plans/test-open-spec';
    await cli.dispatch(['add', 'feature', 'spec-feat', '--spec', specDir, '--project', root, '--no-render'], io);

    // open --spec should render HTML in the spec overlay dir
    const openIo = makeIo();
    const code = await cli.dispatch(['open', '--spec', specDir, '--project', root, '--no-open'], openIo);
    assert.equal(code, 0);
    const outPath = openIo.stdout_text.trim().split('\n').pop();
    // Should be inside the spec's architecture_diff directory
    assert.ok(outPath.includes(specDir), 'output should reference spec directory');
    assert.ok(outPath.endsWith('index.html'), 'output should be an HTML file');
    assert.ok(fs.existsSync(outPath), 'spec overlay HTML should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-22 (P3-1): Skipped entity skips render

```javascript
test('REGTEST-22: skipped entity skips render (P3-1)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-open'], io);
    // Verify HTML was rendered from first add
    const htmlPath = path.join(root, 'resources/project-architecture/index.html');
    const firstMtime = fs.statSync(htmlPath).mtimeMs;

    // Small delay to ensure mtime changes
    await new Promise(r => setTimeout(r, 100));

    // Duplicate add — should NOT re-render (no change)
    const io2 = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root], io2);
    // Without --no-open, the default render should be skipped since entity was skipped
    assert.match(io2.stdout_text, /already exists/);

    // HTML should not have been re-rendered (mtime unchanged)
    const secondMtime = fs.statSync(htmlPath).mtimeMs;
    assert.equal(secondMtime, firstMtime, 'HTML mtime should not change when entity was skipped');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-23 (P3-3): Entity-level --no-render suppresses batch render

```javascript
test('REGTEST-23: entity-level --no-render in batch suppresses batch render (P3-3)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Batch with a --no-render flag on the second entity
    const code = await cli.dispatch(['add', 'feature', 'f1', 'feature', 'f2', '--no-render', '--project', root], io);
    assert.equal(code, 0);
    // HTML should NOT have been rendered (batch post-render suppressed by entity --no-render)
    assert.equal(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')), false,
      'HTML should not exist when entity-level --no-render was specified');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-24 (P2-9): Deeper assertions for add --spec + diff

```javascript
test('REGTEST-24: unified add --spec + diff end-to-end with deeper assertions (P2-9)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const specDir = 'docs/plans/test-deep-diff';
    // Add base feature
    await cli.dispatch(['add', 'feature', 'base', '--project', root, '--no-render'], io);
    // Add spec feature via unified add
    await cli.dispatch(['add', 'feature', 'new-feature', '--spec', specDir, '--project', root, '--no-render'], io);

    // Verify overlay was written correctly
    const overlayPath = path.join(root, specDir, 'architecture_diff', 'atlas', 'features', 'new-feature.yaml');
    assert.ok(fs.existsSync(overlayPath), 'overlay feature YAML should exist');

    // Run diff
    const outDir = path.join(root, 'diff-deep');
    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', outDir, '--no-open'], diffIo);
    assert.equal(code, 0);
    // Should detect 1 added feature (the feature page + macro page = 2 pages)
    assert.match(diffIo.stdout_text, /Diff pages/);
    assert.match(diffIo.stdout_text, /added=\d+/);

    // Verify overlay HTML was generated (render --spec was called)
    const specHtmlPath = path.join(root, specDir, 'architecture_diff', 'features', 'new-feature', 'index.html');
    assert.ok(fs.existsSync(specHtmlPath), 'spec overlay HTML should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-25 (P2-10/P2-11): render --spec output + merge without --no-render

```javascript
test('REGTEST-25: render --spec produces output in correct location (P2-10/P2-11)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Set up base
    await cli.dispatch(['add', 'feature', 'base', '--project', root, '--no-render'], io);

    // Create spec overlay that modifies base
    const specDir = 'docs/plans/test-render-spec';
    await cli.dispatch(['add', 'feature', 'spec-feat', '--spec', specDir, '--project', root, '--no-render'], io);
    await cli.dispatch(['render', '--spec', specDir, '--project', root, '--no-open'], io);

    // Verify render --spec wrote to spec_dir/architecture_diff/
    const specHtml = path.join(root, specDir, 'architecture_diff', 'index.html');
    assert.ok(fs.existsSync(specHtml), 'spec overlay HTML should exist at spec_dir/architecture_diff/');

    // Verify base HTML was NOT modified by spec render
    const baseHtml = path.join(root, 'resources/project-architecture/index.html');
    assert.equal(fs.existsSync(baseHtml), false, 'base HTML should NOT be generated by spec render alone');

    // Test merge without --no-render — should produce base HTML
    await cli.dispatch(['merge', '--spec', specDir, '--project', root, '--no-open'], io);
    assert.ok(fs.existsSync(baseHtml), 'base HTML should exist after merge');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-26 (P2-12): submodule remove --spec _removed.yaml entries

```javascript
test('REGTEST-26: submodule remove --spec records removal in _removed.txt and _removed.yaml (P2-12)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'register', '--project', root, '--no-render'], io);

    const specDir = 'docs/plans/test-sub-remove-spec';
    await cli.dispatch(['remove', 'module', 'api', '--part-of', 'register', '--spec', specDir, '--project', root, '--no-open'], io);

    // Verify _removed.txt contains the submodule page
    const removedTxt = fs.readFileSync(path.join(root, specDir, 'architecture_diff', '_removed.txt'), 'utf8');
    assert.match(removedTxt, /register\/api\.html/, '_removed.txt should contain the removed submodule page');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### REGTEST-27 (P3-9/P3-10): Non-existent entity error + --spec mode cascade

```javascript
test('REGTEST-27: remove non-existent feature errors with suggestions AND spec-mode cascade works (P3-9/P3-10)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'billing', '--project', root, '--no-render'], io);

    // Remove non-existent feature — should error with suggestion
    const code = await cli.dispatch(['remove', 'feature', 'paymint', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /paymint/);
    assert.match(io.stderr_text, /payment/); // should suggest "payment" (similar name)

    // Verify --spec mode cascade for feature remove
    const specDir = 'docs/plans/test-spec-cascade';
    await cli.dispatch(['remove', 'feature', 'billing', '--spec', specDir, '--project', root, '--no-open'], io);
    const overlay = stateLib.loadOverlay(path.join(root, specDir, 'architecture_diff', 'atlas'));
    assert.ok(overlay.removed, 'overlay should have removed tracking');
    assert.ok(overlay.removed.features.includes('billing'), 'billing should be in removed features');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
```

### Output

When done, report back to the coordinator:
- **Test file**: `test/atlas-cli.test.js`
- **Tests created**: REGTEST-10 through REGTEST-27 (18 tests)
- **Oracle confirmation**: Confirm that each test fails before its corresponding fix and passes after
- **Risks or concerns**: or "None"

---

## 4. Verification

1. Run all 18 new tests:
   ```
   node --test test/atlas-cli.test.js
   ```
   Expected: All 18 REGTEST-* tests and all existing tests pass.

2. Run the full test suite:
   ```
   npm test
   ```
   Expected: All tests pass with no regressions.

3. Logical check (if the fix is already applied): for each REGTEST, verify the oracle makes sense:
   - The test input/condition should be the scenario that was broken before the fix
   - The assertion should check the behavior specified in the fix description
   - If a test can be made to fail by temporarily reverting the fix code, it's a valid regression test

---

## 5. Scope & References

### Allowed Files

- `test/atlas-cli.test.js` — Append all 18 regression tests after REGTEST-09 (after L1620)

### Forbidden Files

- `skills/init-project-html/lib/atlas/cli.js` — Source code, not for the test worker
- `skills/init-project-html/lib/atlas/state.js` — Source code, not for the test worker
- `skills/init-project-html/lib/atlas/cli-help.js` — Source code, not for the test worker
- All other source code files

### Related Documents

- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-01-cli-r4.md` — Fix details for reference
- `docs/plans/2026-06-07/architecture-simplify/fix/FIX-02-state-r4.md` — Fix details for reference
- `docs/plans/2026-06-07/architecture-simplify/REPORT.md` — Round 4 findings
- `docs/plans/2026-06-07/architecture-simplify/SPEC.md` — Business requirements
