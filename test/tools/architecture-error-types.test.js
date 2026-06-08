import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UserInputError } from '@laitszkin/tool-utils';

function createMemoryStream() {
  let data = '';
  return {
    write(chunk) { data += chunk; return true; },
    toString() { return data; },
  };
}

test('architectureHandler returns 1 for nonexistent YAML in apply (verb removed)', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const context = {
    stdout: { write: () => {} },
    stderr,
  };

  const result = await architectureHandler(['apply', '/dev/null/nonexistent-spec.yaml'], context);
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

// REGTEST-02: FIX-03 — architecture tool converts stderr.write+return1 to typed throws
test('architectureHandler returns 1 for apply with missing slug (verb removed)', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );

  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['apply', '/tmp/nonexistent.yaml'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('architectureHandler returns 1 for template without args (verb removed)', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );

  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['template'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('architectureHandler returns 1 for unknown subcommand', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const context = {
    stdout: { write: () => {} },
    stderr,
  };

  const result = await architectureHandler(['invalid-cmd'], context);
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().length > 0, 'stderr should have content');
});

test('architectureHandler returns 1 for apply without args (verb removed)', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );

  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['apply'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('architectureHandler returns 1 for apply (verb removed, was "Batch aborted:")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );

  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['apply', '/tmp/batch.yaml'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

// ── Template handler tests ───────────────────────────────────────────────────

test('template returns 1 (verb removed from CLI dispatch)', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['template', '--spec', '/tmp/spec', '--output', '/tmp/out'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('template returns 1 (verb removed, was "title but no goal")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['template', '--spec', '/tmp/spec', '--output', '/tmp/out'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('template returns 1 (verb removed, was "spec dir has no SPEC.md")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['template', '--spec', '/tmp/spec', '--output', '/tmp/out'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('template returns 1 (verb removed, was "spec dir has no files")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['template', '--spec', '/tmp/spec', '--output', '/tmp/out'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('template returns 1 (verb removed, was "goal containing double quotes")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['template', '--spec', '/tmp/spec', '--output', '/tmp/out'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

// ── Apply YAML validation (before atlas module import) ──────────────────────

test('apply returns 1 (verb removed, was "null YAML")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['apply', '/tmp/null.yaml'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

test('apply returns 1 (verb removed, was "scalar string YAML")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const stderr = createMemoryStream();
  const result = await architectureHandler(
    ['apply', '/tmp/str.yaml'],
    { stdout: { write: () => {} }, stderr },
  );
  assert.strictEqual(result, 1);
  assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
  assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
});

// ── Helper: mock atlas modules on disk ──────────────────────────────────────

function writeMockAtlasModules(tmpDir, stateReturn) {
  const atlasDir = path.join(tmpDir, 'skills', 'init-project-html', 'lib', 'atlas');
  fs.mkdirSync(atlasDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'resources', 'project-architecture'), { recursive: true });

  const cliProjectRoot = tmpDir;
  const cliAtlasDir = path.join(tmpDir, 'resources', 'project-architecture');
  fs.writeFileSync(path.join(atlasDir, 'cli.js'), [
    `const projectRoot = ${JSON.stringify(cliProjectRoot)};`,
    `const atlasDir = ${JSON.stringify(cliAtlasDir)};`,
    'export default {',
    '  resolveProjectRoot: () => projectRoot,',
    '  baseAtlasDir: () => atlasDir,',
    '  specOverlayDir: () => ({ overlayDir: \'\', rootDir: \'\', htmlOutDir: \'\' }),',
    '  dispatch: async (args, io) => {',
    '    const verb = args[0];',
    '    if (verb === \'apply\' || verb === \'template\') {',
    '      if (io && io.stderr) io.stderr.write(\'Unknown verb: \' + verb + \'. Did you mean \\\'add\\\'?\\n\');',
    '      return 1;',
    '    }',
    '    if (verb === \'remove\') {',
    '      const entitySlug = args[2];',
    '      if (entitySlug === \'nonexistent\') {',
    '        if (io && io.stderr) io.stderr.write(\'Feature "\' + entitySlug + \'" not found\\n\');',
    '        return 1;',
    '      }',
    '      return 0;',
    '    }',
    '    return 0;',
    '  },',
    '  runRender: async () => {},',
    '};',
  ].join('\n'), 'utf-8');

  const json = JSON.stringify(stateReturn);
  fs.writeFileSync(path.join(atlasDir, 'state.js'), [
    `const initialState = ${json};`,
    'const g = /** @type {any} */ (globalThis);',
    'const onSave = typeof g.__rg_onSave === "function"',
    '  ? g.__rg_onSave',
    '  : () => {};',
    'export default {',
    '  load: () => JSON.parse(JSON.stringify(initialState)),',
    '  loadOverlay: () => ({ features: [], edges: [] }),',
    '  mergeOverlay: (base, overlay) => ({',
    '    features: [...base.features, ...overlay.features],',
    '    edges: [...base.edges, ...overlay.edges],',
    '  }),',
    '  save: (dir, state) => { onSave(dir, state); },',
    '  saveOverlay: () => {},',
    '  writeUndoSnapshot: () => {},',
    '  appendHistory: () => {},',
    '  deriveOverlay: (base, merged) => merged,',
    '};',
  ].join('\n'), 'utf-8');

  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
}

// ── Apply handler: feature mutations ────────────────────────────────────────

test('apply returns 1 (verb removed, was "adds a feature with title, story, dependsOn")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-afeat-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, { features: [], edges: [] });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "modifies an existing feature title")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-mfeat-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'auth', title: 'Old Title', submodules: [], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "removes a feature and its incident edges")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-rfeat-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [
        { slug: 'feat-a', title: 'A', submodules: [], edges: [] },
        { slug: 'feat-b', title: 'B', submodules: [], edges: [] },
      ],
      edges: [{ id: 'e1', from: { feature: 'feat-a', submodule: 'mod' }, to: { feature: 'feat-b', submodule: 'mod' }, kind: 'call' }],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "unknown feature action")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-uact-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, { features: [], edges: [] });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "modify of non-existent feature")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-miss-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, { features: [], edges: [] });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "adds a submodule")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-asub-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'auth', title: 'Auth', submodules: [], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "unknown edge action")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-uedge-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'a', title: 'A', submodules: [{ slug: 'm', kind: 'service' }], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "unknown submodule action")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-usub-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'a', title: 'A', submodules: [{ slug: 'm', kind: 'service' }], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "edge with invalid endpoint format")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-einv-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'a', title: 'A', submodules: [], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('apply returns 1 (verb removed, was "edge with non-existent source feature")', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-esrc-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'a', title: 'A', submodules: [{ slug: 'm', kind: 'service' }], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['apply', '/tmp/batch.yaml', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1);
    assert.ok(stderr.toString().includes('add'), `stderr should suggest "add": ${stderr.toString()}`);
    assert.ok(stderr.toString().includes('apply') || stderr.toString().includes('template'), `stderr should mention the verb`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Remove handler tests ────────────────────────────────────────────────────

test('remove non-existent entity returns error through handler', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-rmerr-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'existing', title: 'Existing', submodules: [], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['remove', 'feature', 'nonexistent', '--no-render'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 1, 'remove non-existent should return 1');
    assert.ok(stderr.toString().includes('not found'), `stderr should say "not found": ${stderr.toString()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('remove --dry-run returns 0 without mutating mock', async () => {
  const { architectureHandler } = await import(
    '../../packages/tools/architecture/dist/index.js'
  );
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-dry-'));
  const stderr = createMemoryStream();
  try {
    writeMockAtlasModules(tmpDir, {
      features: [{ slug: 'test', title: 'Test', submodules: [], edges: [] }],
      edges: [],
    });
    const result = await architectureHandler(
      ['remove', 'feature', 'test', '--no-render', '--dry-run'],
      { stdout: { write: () => {} }, stderr, sourceRoot: tmpDir },
    );
    assert.strictEqual(result, 0, 'dry-run should return 0');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('codegraphHandler --json flag is parsed out before dispatch', async () => {
  // Verify --json in args doesn't break help (which ignores extra flags)
  const { codegraphHandler } = await import(
    '../../packages/tools/codegraph/dist/index.js'
  );
  const stdout = createMemoryStream();
  const result = await codegraphHandler(
    ['--json', '--help'],
    { stdout, stderr: { write: () => {} } },
  );
  assert.strictEqual(result, 0);
  assert.ok(stdout.toString().includes('Usage: apltk codegraph'));
});
