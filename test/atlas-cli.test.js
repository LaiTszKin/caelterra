import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require('../skills/init-project-html/lib/atlas/cli.js');
const stateLib = require('../skills/init-project-html/lib/atlas/state.js');

function makeIo() {
  let outBuf = '';
  let errBuf = '';
  return {
    stdout: { write: (s) => { outBuf += s; } },
    stderr: { write: (s) => { errBuf += s; } },
    get stdout_text() { return outBuf; },
    get stderr_text() { return errBuf; },
  };
}

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aplt-atlas-cli-'));
  fs.mkdirSync(path.join(root, 'resources', 'project-architecture'), { recursive: true });
  return root;
}

function mkBareRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aplt-atlas-bare-'));
}

test('feature add with --project creates resources/project-architecture when entirely missing', async () => {
  const root = mkBareRoot();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'boot', '--project', root, '--no-render'], io);
    assert.ok(fs.existsSync(path.join(root, 'resources', 'project-architecture', 'atlas', 'atlas.index.yaml')));
    assert.ok(fs.existsSync(path.join(root, 'resources', 'project-architecture', 'atlas', 'features', 'boot.yaml')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parseFlags handles =, space-separated values, and booleans', () => {
  const { positional, flags } = cli.parseFlags(['--slug=foo', '--title', 'My title', '--no-render', 'extra']);
  assert.equal(flags.slug, 'foo');
  assert.equal(flags.title, 'My title');
  assert.equal(flags['no-render'], true);
  assert.deepEqual(positional, ['extra']);
});

test('feature add then submodule add write base YAML and HTML', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    let code = await cli.dispatch(['feature', 'add', '--slug', 'register', '--title', 'Register', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    code = await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Form', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    const atlasYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(atlasYaml, /features:/);
    assert.match(atlasYaml, /- register/);
    const featureYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/register.yaml'), 'utf8');
    assert.match(featureYaml, /slug: register/);
    assert.match(featureYaml, /kind: ui/);
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')));
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/features/register/ui.html')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--no-render skips HTML emission', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io);
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml')));
    assert.equal(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('function/variable/dataflow/error/edge mutations append to feature YAML', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);
    await cli.dispatch(['function', 'add', '--feature', 'register', '--submodule', 'api', '--name', 'POST_register', '--side', 'tx', '--project', root, '--no-render'], io);
    await cli.dispatch(['variable', 'add', '--feature', 'register', '--submodule', 'api', '--name', 'inviteCode', '--type', 'string', '--scope', 'call', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'register', '--submodule', 'api', '--step', 'Validate', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'register', '--submodule', 'api', '--step', 'Insert', '--project', root, '--no-render'], io);
    await cli.dispatch(['error', 'add', '--feature', 'register', '--submodule', 'api', '--name', 'ErrCode', '--when', 'invalid', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'register/ui', '--to', 'register/api', '--kind', 'call', '--label', 'POST', '--id', 'e1', '--project', root, '--no-render'], io);

    const yaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/register.yaml'), 'utf8');
    assert.match(yaml, /POST_register/);
    assert.match(yaml, /inviteCode/);
    assert.match(yaml, /Validate/);
    assert.match(yaml, /Insert/);
    assert.match(yaml, /ErrCode/);
    assert.match(yaml, /e1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dataflow reorder swaps step positions', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'f', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'f', '--slug', 's', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'f', '--submodule', 's', '--step', 'A', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'f', '--submodule', 's', '--step', 'B', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'f', '--submodule', 's', '--step', 'C', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'reorder', '--feature', 'f', '--submodule', 's', '--from', '2', '--to', '0', '--project', root, '--no-render'], io);
    const loaded = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.deepEqual(loaded.features[0].submodules[0].dataflow, ['C', 'A', 'B']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dataflow add stores fn/reads/writes when flags are passed and validates against declared symbols', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'reg', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'reg', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);
    await cli.dispatch(['function', 'add', '--feature', 'reg', '--submodule', 'api', '--name', 'handlePost', '--side', 'network', '--project', root, '--no-render'], io);
    await cli.dispatch(['variable', 'add', '--feature', 'reg', '--submodule', 'api', '--name', 'body', '--type', 'object', '--scope', 'call', '--project', root, '--no-render'], io);
    await cli.dispatch(['variable', 'add', '--feature', 'reg', '--submodule', 'api', '--name', 'token', '--type', 'string', '--scope', 'call', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'reg', '--submodule', 'api', '--step', 'plain step', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'reg', '--submodule', 'api', '--step', 'validate body and emit token', '--fn', 'handlePost', '--reads', 'body', '--writes', 'token', '--project', root, '--no-render'], io);
    const loaded = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const flow = loaded.features[0].submodules[0].dataflow;
    assert.equal(flow[0], 'plain step', 'plain string steps stay as strings');
    assert.deepEqual(flow[1], { step: 'validate body and emit token', fn: 'handlePost', reads: ['body'], writes: ['token'] });
    const validateIo = makeIo();
    const code = await cli.dispatch(['validate', '--project', root], validateIo);
    assert.equal(code, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dataflow add rejects fn/reads/writes that do not match declared functions/variables', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'reg', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'reg', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'reg', '--submodule', 'api', '--step', 'lying step', '--fn', 'ghostFn', '--project', root, '--no-render'], io);
    const validateIo = makeIo();
    const code = await cli.dispatch(['validate', '--project', root], validateIo);
    assert.notEqual(code, 0, 'validate exits non-zero when fn references unknown function');
    const combined = validateIo.stderr_text + validateIo.stdout_text;
    assert.match(combined, /unknown function "ghostFn"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cross-feature edge is stored at the index level', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'a', '--slug', 'svc', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'add', '--slug', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'b', '--slug', 'api', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'a/svc', '--to', 'b/api', '--kind', 'data-row', '--id', 'cross', '--project', root, '--no-render'], io);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /cross/);
    assert.match(indexYaml, /data-row/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--spec writes to overlay path and never mutates base files', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--title', 'Register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--role', 'Endpoint', '--project', root, '--no-render'], io);
    const baseYamlBefore = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/register.yaml'), 'utf8');

    const specDir = path.join(root, 'docs/plans/2026-05-11/two-fa');
    fs.mkdirSync(specDir, { recursive: true });
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', '2fa', '--kind', 'service', '--role', 'TOTP', '--spec', 'docs/plans/2026-05-11/two-fa', '--project', root, '--no-open'], io);

    const baseYamlAfter = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/register.yaml'), 'utf8');
    assert.equal(baseYamlAfter, baseYamlBefore, 'base feature YAML must not change in spec mode');

    const overlayYaml = fs.readFileSync(path.join(specDir, 'architecture_diff/atlas/features/register.yaml'), 'utf8');
    assert.match(overlayYaml, /2fa/);
    assert.ok(fs.existsSync(path.join(specDir, 'architecture_diff/features/register/2fa.html')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--spec member paths in a batch write to the shared batch-root architecture_diff', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--title', 'Register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--role', 'Endpoint', '--project', root, '--no-render'], io);

    const batchRoot = path.join(root, 'docs/plans/2026-05-12/shared-batch');
    const memberA = path.join(batchRoot, 'member-a');
    const memberB = path.join(batchRoot, 'member-b');
    fs.mkdirSync(memberA, { recursive: true });
    fs.mkdirSync(memberB, { recursive: true });
    fs.writeFileSync(path.join(batchRoot, 'coordination.md'), '# coordination\n');

    await cli.dispatch(['feature', 'set', '--slug', 'register', '--title', 'Register batch', '--spec', 'docs/plans/2026-05-12/shared-batch/member-a', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Batch UI', '--spec', 'docs/plans/2026-05-12/shared-batch/member-b', '--project', root, '--no-open'], io);

    const batchFeatureYaml = path.join(batchRoot, 'architecture_diff', 'atlas', 'features', 'register.yaml');
    assert.equal(fs.existsSync(batchFeatureYaml), true);
    const batchOverlay = fs.readFileSync(batchFeatureYaml, 'utf8');
    assert.match(batchOverlay, /Register batch/);
    assert.match(batchOverlay, /slug: ui/);

    assert.equal(fs.existsSync(path.join(memberA, 'architecture_diff')), false, 'member-a should not get its own architecture_diff');
    assert.equal(fs.existsSync(path.join(memberB, 'architecture_diff')), false, 'member-b should not get its own architecture_diff');
    assert.equal(fs.existsSync(path.join(batchRoot, 'architecture_diff', 'features', 'register', 'ui.html')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('feature remove in --spec records the removal in _removed.yaml', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'legacy', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'legacy', '--slug', 'svc', '--project', root, '--no-render'], io);
    const specDir = path.join(root, 'docs/plans/2026-05-11/drop-legacy');
    fs.mkdirSync(specDir, { recursive: true });
    await cli.dispatch(['feature', 'remove', '--slug', 'legacy', '--spec', 'docs/plans/2026-05-11/drop-legacy', '--project', root, '--no-open'], io);
    const removed = fs.readFileSync(path.join(specDir, 'architecture_diff/atlas/_removed.yaml'), 'utf8');
    assert.match(removed, /legacy/);
    const removedTxt = fs.readFileSync(path.join(specDir, 'architecture_diff/_removed.txt'), 'utf8');
    assert.match(removedTxt, /features\/legacy\/index\.html/);
    assert.match(removedTxt, /features\/legacy\/svc\.html/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('spec re-adding a removed submodule clears removal state and stops reporting it as removed', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--role', 'Endpoint', '--project', root, '--no-open'], io);

    const specDir = path.join(root, 'docs/plans/2026-05-12/readd-api');
    fs.mkdirSync(specDir, { recursive: true });

    await cli.dispatch(['submodule', 'remove', '--feature', 'register', '--slug', 'api', '--spec', 'docs/plans/2026-05-12/readd-api', '--project', root, '--no-open'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--role', 'Updated endpoint', '--spec', 'docs/plans/2026-05-12/readd-api', '--project', root, '--no-open'], io);

    const overlay = stateLib.loadOverlay(path.join(specDir, 'architecture_diff', 'atlas'));
    assert.deepEqual(overlay.removed.features, []);
    assert.deepEqual(overlay.removed.submodules, []);

    const base = stateLib.load(path.join(root, 'resources', 'project-architecture', 'atlas'));
    const merged = stateLib.mergeOverlay(base, overlay);
    const register = merged.features.find((feature) => feature.slug === 'register');
    assert.equal(register.submodules.some((submodule) => submodule.slug === 'api'), true);
    assert.equal(register.submodules.find((submodule) => submodule.slug === 'api').role, 'Updated endpoint');

    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', path.join(root, 'diff-readd'), '--no-open'], diffIo);
    assert.equal(code, 0);
    assert.match(diffIo.stdout_text, /removed=0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('spec setting a submodule back to its base state clears the overlay diff', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Base role', '--project', root, '--no-render'], io);

    const specDir = path.join(root, 'docs/plans/2026-05-12/revert-ui-role');
    fs.mkdirSync(specDir, { recursive: true });

    await cli.dispatch(['submodule', 'set', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Spec role', '--spec', 'docs/plans/2026-05-12/revert-ui-role', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'set', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Base role', '--spec', 'docs/plans/2026-05-12/revert-ui-role', '--project', root, '--no-render'], io);

    const overlayDir = path.join(specDir, 'architecture_diff', 'atlas');
    const overlay = stateLib.loadOverlay(overlayDir);
    assert.deepEqual(Object.keys(overlay.features), []);
    assert.deepEqual(overlay.removed.features, []);
    assert.deepEqual(overlay.removed.submodules, []);

    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', path.join(root, 'diff-revert'), '--no-open'], diffIo);
    assert.equal(code, 0);
    assert.match(diffIo.stdout_text, /Diff pages: 0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validate flags missing/unknown references after mutation', async () => {
  const root = mkProject();
  try {
    const io1 = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io1);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io1);

    // Directly corrupt the feature YAML to reference a missing submodule via an edge
    const featureFile = path.join(root, 'resources/project-architecture/atlas/features/register.yaml');
    const yaml = fs.readFileSync(featureFile, 'utf8');
    const replaced = yaml.replace(/^edges:.*$/m, 'edges:\n  - id: bad\n    from: ghost\n    to: api\n    kind: call\n    label: oops');
    fs.writeFileSync(featureFile, replaced);

    const io2 = makeIo();
    const code = await cli.dispatch(['validate', '--project', root], io2);
    assert.equal(code, 1);
    assert.match(io2.stderr_text, /unknown submodule "ghost"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('undo restores the previous base state', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--title', 'Register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);
    let state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features[0].submodules.length, 2);
    await cli.dispatch(['undo', '--project', root, '--no-render'], io);
    state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features[0].submodules.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('help prints usage and exits 0', async () => {
  const io = makeIo();
  const code = await cli.dispatch(['help'], io);
  assert.equal(code, 0);
  assert.match(io.stdout_text, /apltk architecture/);
  assert.match(io.stdout_text, /apltk architecture add feature/);
});

test('parseEndpoint accepts "feature/submodule" and rejects empty values', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'a', '--slug', 's', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['edge', 'add', '--from', '', '--to', 'a/s', '--project', root, '--no-render'], io);
    assert.equal(code, 1);
    assert.match(io.stderr_text, /Invalid endpoint|--from/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--help and -h print usage without requiring a project root', async () => {
  for (const argv of [['--help'], ['-h']]) {
    const io = makeIo();
    const code = await cli.dispatch(argv, io);
    assert.equal(code, 0, argv.join(' '));
    assert.match(io.stdout_text, /apltk architecture add/);
    assert.match(io.stdout_text, /apltk architecture remove/);
  }
});

test('unknown top-level verb exits 1', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['nope', '--project', root, '--no-render'], io);
    assert.equal(code, 1);
    assert.match(io.stderr_text, /Unknown verb/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('meta set and feature set persist to base atlas', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--title', 'Old', '--project', root, '--no-render'], io);
    await cli.dispatch(['meta', 'set', '--title', 'Macro', '--summary', 'Roots: src/', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'set', '--slug', 'r', '--title', 'New title', '--story', 'S', '--project', root, '--no-render'], io);
    const idx = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(idx, /title:\s*Macro/);
    assert.match(idx, /Roots: src/);
    const feat = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/r.yaml'), 'utf8');
    assert.match(feat, /title:\s*New title/);
    assert.match(feat, /story:\s*S/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('actor add then actor remove', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--project', root, '--no-render'], io);
    await cli.dispatch(['actor', 'add', '--id', 'user', '--label', 'User', '--project', root, '--no-render'], io);
    let idx = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(idx, /user/);
    await cli.dispatch(['actor', 'remove', '--id', 'user', '--project', root, '--no-render'], io);
    const actorsAfter = stateLib.load(path.join(root, 'resources/project-architecture/atlas')).actors || [];
    assert.deepEqual(actorsAfter, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('feature remove (base) drops feature and incident cross-feature edges', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'a', '--slug', 's', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'add', '--slug', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'b', '--slug', 't', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'a/s', '--to', 'b/t', '--kind', 'call', '--id', 'x1', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'remove', '--slug', 'a', '--project', root, '--no-render'], io);
    const st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(st.features.length, 1);
    assert.equal(st.features[0].slug, 'b');
    assert.deepEqual(st.edges || [], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('submodule remove (base) drops submodule and incident intra-feature edges', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'f', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'f', '--slug', 'u', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'f', '--slug', 'v', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'f/u', '--to', 'f/v', '--kind', 'call', '--id', 'ie', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'remove', '--feature', 'f', '--slug', 'u', '--project', root, '--no-render'], io);
    const y = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/f.yaml'), 'utf8');
    assert.ok(!y.includes('slug: u'));
    assert.ok(!y.includes('ie'), 'intra edge touching removed sub is gone');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('function remove, variable remove, error remove', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'api', '--project', root, '--no-render'], io);
    await cli.dispatch(['function', 'add', '--feature', 'r', '--submodule', 'api', '--name', 'fn1', '--project', root, '--no-render'], io);
    await cli.dispatch(['variable', 'add', '--feature', 'r', '--submodule', 'api', '--name', 'v1', '--project', root, '--no-render'], io);
    await cli.dispatch(['error', 'add', '--feature', 'r', '--submodule', 'api', '--name', 'E1', '--project', root, '--no-render'], io);
    await cli.dispatch(['function', 'remove', '--feature', 'r', '--submodule', 'api', '--name', 'fn1', '--project', root, '--no-render'], io);
    await cli.dispatch(['variable', 'remove', '--feature', 'r', '--submodule', 'api', '--name', 'v1', '--project', root, '--no-render'], io);
    await cli.dispatch(['error', 'remove', '--feature', 'r', '--submodule', 'api', '--name', 'E1', '--project', root, '--no-render'], io);
    const y = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/r.yaml'), 'utf8');
    assert.ok(!y.includes('fn1') && !y.includes('v1') && !y.includes('E1'));
    const v = await cli.dispatch(['validate', '--project', root], makeIo());
    assert.equal(v, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dataflow remove by --step and by --at', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'f', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'f', '--slug', 's', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'f', '--submodule', 's', '--step', 'First', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'f', '--submodule', 's', '--step', 'Second', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'add', '--feature', 'f', '--submodule', 's', '--step', 'Third', '--project', root, '--no-render'], io);
    await cli.dispatch(['dataflow', 'remove', '--feature', 'f', '--submodule', 's', '--step', 'Second', '--project', root, '--no-render'], io);
    let st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.deepEqual(st.features[0].submodules[0].dataflow, ['First', 'Third']);
    await cli.dispatch(['dataflow', 'remove', '--feature', 'f', '--submodule', 's', '--at', '0', '--project', root, '--no-render'], io);
    st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.deepEqual(st.features[0].submodules[0].dataflow, ['Third']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('edge remove cross-feature by --id', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'a', '--slug', 's', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'add', '--slug', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'b', '--slug', 't', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'a/s', '--to', 'b/t', '--kind', 'data-row', '--id', 'rm-cross', '--project', root, '--no-render'], io);
    let st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(st.edges.length, 1);
    await cli.dispatch(['edge', 'remove', '--from', 'a/s', '--to', 'b/t', '--id', 'rm-cross', '--project', root, '--no-render'], io);
    st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.deepEqual(st.edges || [], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('edge remove intra-feature by endpoints', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'f', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'f', '--slug', 'u', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'f', '--slug', 'v', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'f/u', '--to', 'f/v', '--kind', 'return', '--id', 'intra-r', '--project', root, '--no-render'], io);
    let st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(st.features[0].edges.length, 1);
    await cli.dispatch(['edge', 'remove', '--from', 'f/u', '--to', 'f/v', '--project', root, '--no-render'], io);
    st = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.deepEqual(st.features[0].edges || [], []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('render verb regenerates HTML after --no-render mutations', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'ui', '--kind', 'ui', '--project', root, '--no-render'], io);
    assert.equal(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')), false);
    const code = await cli.dispatch(['render', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    assert.equal(io.stdout_text.includes('rendered'), true);
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')));
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/features/r/ui.html')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('open --no-open prints atlas path and creates index when missing', async () => {
  const root = mkBareRoot();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['open', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    const line = io.stdout_text.trim().split(/\r?\n/).pop();
    assert.ok(line.endsWith(path.join('resources', 'project-architecture', 'index.html')));
    assert.ok(fs.existsSync(line));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff writes viewer; empty plans show no-diffs state', async () => {
  const root = mkProject();
  try {
    const outDir = path.join(root, 'diff-empty');
    const io = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', outDir, '--no-open'], io);
    assert.equal(code, 0);
    const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    assert.match(html, /No architecture diffs found/);
    assert.match(io.stdout_text, /Diff pages: 0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff counts a modified overlay page against base HTML', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-open'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Form', '--project', root, '--no-open'], io);
    const specDir = path.join(root, 'docs/plans/batch-1/spec-a');
    fs.mkdirSync(path.join(specDir, 'architecture_diff/features/register'), { recursive: true });
    const baseUi = fs.readFileSync(path.join(root, 'resources/project-architecture/features/register/ui.html'), 'utf8');
    fs.writeFileSync(path.join(specDir, 'architecture_diff/features/register/ui.html'), baseUi.replace('Form', 'Form SPEC OVERLAY'), 'utf8');
    const outDir = path.join(root, 'diff-out');
    const code = await cli.dispatch(['diff', '--project', root, '--out', outDir, '--no-open'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /modified=1/);
    assert.match(io.stdout_text, /Diff pages: 1/);
    const viewer = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    assert.match(viewer, /architecture diff/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff merges batch member overlays into one combined macro view', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-open'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'api', '--kind', 'api', '--role', 'Base API', '--project', root, '--no-open'], io);

    const batchRoot = path.join(root, 'docs/plans/2026-05-12/invite-batch');
    fs.mkdirSync(batchRoot, { recursive: true });
    fs.writeFileSync(path.join(batchRoot, 'coordination.md'), '# coordination\n');
    fs.mkdirSync(path.join(batchRoot, 'member-a'), { recursive: true });
    fs.mkdirSync(path.join(batchRoot, 'member-b'), { recursive: true });

    await cli.dispatch(['feature', 'add', '--slug', 'billing', '--title', 'Billing', '--spec', 'docs/plans/2026-05-12/invite-batch/member-a', '--project', root, '--no-open'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'billing', '--slug', 'api', '--kind', 'api', '--role', 'Billing API', '--spec', 'docs/plans/2026-05-12/invite-batch/member-a', '--project', root, '--no-open'], io);

    await cli.dispatch(['feature', 'add', '--slug', 'profile', '--title', 'Profile', '--spec', 'docs/plans/2026-05-12/invite-batch/member-b', '--project', root, '--no-open'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'profile', '--slug', 'ui', '--kind', 'ui', '--role', 'Profile UI', '--spec', 'docs/plans/2026-05-12/invite-batch/member-b', '--project', root, '--no-open'], io);

    const outDir = path.join(root, 'diff-batch');
    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', outDir, '--no-open'], diffIo);
    assert.equal(code, 0);
    assert.match(diffIo.stdout_text, /Diff pages: 5/);
    assert.match(diffIo.stdout_text, /modified=1/);
    assert.match(diffIo.stdout_text, /added=4/);

    const viewer = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
    const macroMatches = viewer.match(/"rel":"index\.html"/g) || [];
    assert.equal(macroMatches.length, 1, 'batch diff should emit a single combined macro page');
    assert.match(viewer, /docs\/plans\/2026-05-12\/invite-batch/);
    assert.doesNotMatch(viewer, /_batch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff falls back to legacy batch member html manifests when atlas overlay state is absent', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-open'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Base UI', '--project', root, '--no-open'], io);

    const batchRoot = path.join(root, 'docs/plans/2026-05-12/legacy-html-batch');
    const memberA = path.join(batchRoot, 'member-a');
    const memberB = path.join(batchRoot, 'member-b');
    fs.mkdirSync(path.join(memberA, 'architecture_diff', 'features', 'register'), { recursive: true });
    fs.mkdirSync(path.join(memberB, 'architecture_diff', 'features', 'extra'), { recursive: true });
    fs.writeFileSync(path.join(batchRoot, 'coordination.md'), '# coordination\n');

    const baseUi = fs.readFileSync(path.join(root, 'resources/project-architecture/features/register/ui.html'), 'utf8');
    fs.writeFileSync(path.join(memberA, 'architecture_diff', 'features', 'register', 'ui.html'), baseUi.replace('Base UI', 'Legacy member A UI'), 'utf8');
    fs.writeFileSync(path.join(memberB, 'architecture_diff', 'features', 'extra', 'index.html'), '<html><body>extra feature</body></html>', 'utf8');

    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', path.join(root, 'diff-legacy-batch'), '--no-open'], diffIo);
    assert.equal(code, 0);
    assert.match(diffIo.stdout_text, /modified=1/);
    assert.match(diffIo.stdout_text, /added=1/);

    const viewer = fs.readFileSync(path.join(root, 'diff-legacy-batch', 'index.html'), 'utf8');
    assert.match(viewer, /docs\/plans\/2026-05-12\/legacy-html-batch\/member-a/);
    assert.match(viewer, /docs\/plans\/2026-05-12\/legacy-html-batch\/member-b/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validate --spec checks merged base + overlay', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);
    const specDir = path.join(root, 'docs/plans/merge-val');
    fs.mkdirSync(specDir, { recursive: true });
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'svc', '--kind', 'service', '--spec', 'docs/plans/merge-val', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['validate', '--spec', 'docs/plans/merge-val', '--project', root], makeIo());
    assert.equal(code, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('undo --spec restores overlay snapshot', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);
    const specDir = path.join(root, 'docs/plans/undo-spec');
    fs.mkdirSync(specDir, { recursive: true });
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'svc', '--kind', 'service', '--spec', 'docs/plans/undo-spec', '--project', root, '--no-render'], io);
    assert.ok(fs.existsSync(path.join(specDir, 'architecture_diff/atlas/features/r.yaml')));
    await cli.dispatch(['undo', '--spec', 'docs/plans/undo-spec', '--project', root, '--no-render'], io);
    assert.equal(fs.existsSync(path.join(specDir, 'architecture_diff/atlas/features/r.yaml')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('undo --steps rolls back multiple spec mutations', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'r', '--title', 'Base title', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'api', '--kind', 'api', '--project', root, '--no-render'], io);

    const specDir = path.join(root, 'docs/plans/undo-spec-steps');
    fs.mkdirSync(specDir, { recursive: true });

    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'svc', '--kind', 'service', '--spec', 'docs/plans/undo-spec-steps', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'r', '--slug', 'ui', '--kind', 'ui', '--spec', 'docs/plans/undo-spec-steps', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'set', '--slug', 'r', '--title', 'Spec title', '--spec', 'docs/plans/undo-spec-steps', '--project', root, '--no-render'], io);

    const code = await cli.dispatch(['undo', '--steps', '2', '--spec', 'docs/plans/undo-spec-steps', '--project', root, '--no-render'], io);
    assert.equal(code, 0);

    const base = stateLib.load(path.join(root, 'resources', 'project-architecture', 'atlas'));
    const overlay = stateLib.loadOverlay(path.join(specDir, 'architecture_diff', 'atlas'));
    const merged = stateLib.mergeOverlay(base, overlay);
    const feature = merged.features.find((entry) => entry.slug === 'r');
    assert.equal(feature.title, 'Base title');
    assert.equal(feature.submodules.some((entry) => entry.slug === 'svc'), true);
    assert.equal(feature.submodules.some((entry) => entry.slug === 'ui'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('spec render deletes stale overlay html when a previously modified page is removed', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Base role', '--project', root, '--no-open'], io);

    const specDir = path.join(root, 'docs/plans/2026-05-12/remove-stale-page');
    fs.mkdirSync(specDir, { recursive: true });
    const pagePath = path.join(specDir, 'architecture_diff', 'features', 'register', 'ui.html');

    await cli.dispatch(['submodule', 'set', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Spec role', '--spec', 'docs/plans/2026-05-12/remove-stale-page', '--project', root, '--no-open'], io);
    assert.equal(fs.existsSync(pagePath), true);

    await cli.dispatch(['submodule', 'remove', '--feature', 'register', '--slug', 'ui', '--spec', 'docs/plans/2026-05-12/remove-stale-page', '--project', root, '--no-open'], io);
    assert.equal(fs.existsSync(pagePath), false);

    const removedTxt = fs.readFileSync(path.join(specDir, 'architecture_diff', '_removed.txt'), 'utf8');
    assert.match(removedTxt, /features\/register\/ui\.html/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- merge verb tests ---------------------------------------------------

test('merge without --spec or --all prints error', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['merge', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /No spec overlays to merge/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('merge --spec applies overlay changes to base atlas', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Set up base feature in the atlas
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--title', 'Register', '--project', root, '--no-render'], io);
    await cli.dispatch(['submodule', 'add', '--feature', 'register', '--slug', 'ui', '--kind', 'ui', '--role', 'Base role', '--project', root, '--no-render'], io);

    // Create a spec overlay that modifies the submodule role
    const specDir = 'docs/plans/2026-05-14/add-checkout';
    await cli.dispatch(['submodule', 'set', '--feature', 'register', '--slug', 'ui', '--role', 'Updated role', '--spec', specDir, '--project', root, '--no-render'], io);

    // Merge the spec overlay into base
    const mergeIo = makeIo();
    const code = await cli.dispatch(['merge', '--spec', specDir, '--project', root, '--no-render'], mergeIo);
    assert.equal(code, 0);
    assert.match(mergeIo.stdout_text, /merge applied/);

    // Verify base atlas now has the updated role
    const feature = stateLib.load(path.join(root, 'resources/project-architecture/atlas')).features.find((f) => f.slug === 'register');
    assert.ok(feature, 'feature should exist after merge');
    const sub = feature.submodules.find((s) => s.slug === 'ui');
    assert.equal(sub.role, 'Updated role', 'base atlas should contain merged overlay changes');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('merge --spec adds new feature from overlay to base', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Create base feature
    await cli.dispatch(['feature', 'add', '--slug', 'existing', '--project', root, '--no-render'], io);

    // Create spec that adds a new feature
    const specDir = 'docs/plans/2026-05-14/add-new-feature';
    await cli.dispatch(['feature', 'add', '--slug', 'new-feature', '--title', 'New Feature', '--spec', specDir, '--project', root, '--no-render'], io);

    // Merge
    await cli.dispatch(['merge', '--spec', specDir, '--project', root, '--no-render'], io);

    // Verify new feature exists in base
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const slugs = state.features.map((f) => f.slug);
    assert.ok(slugs.includes('new-feature'));
    assert.ok(slugs.includes('existing'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('merge --spec --clean removes overlay directory', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--project', root, '--no-render'], io);

    const specDir = 'docs/plans/2026-05-14/clean-test';
    await cli.dispatch(['feature', 'set', '--slug', 'register', '--title', 'Changed', '--spec', specDir, '--project', root, '--no-render'], io);

    const diffDir = path.join(root, specDir, 'architecture_diff');
    assert.ok(fs.existsSync(diffDir), 'overlay should exist before --clean merge');

    await cli.dispatch(['merge', '--spec', specDir, '--project', root, '--no-render', '--clean'], io);
    assert.equal(fs.existsSync(diffDir), false, 'overlay should be removed after --clean merge');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('merge creates undo snapshot that can revert the merge', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'register', '--title', 'Original', '--project', root, '--no-render'], io);

    const specDir = 'docs/plans/2026-05-14/undo-test';
    await cli.dispatch(['feature', 'set', '--slug', 'register', '--title', 'Changed', '--spec', specDir, '--project', root, '--no-render'], io);

    // Merge
    await cli.dispatch(['merge', '--spec', specDir, '--project', root, '--no-render'], io);

    // Verify the change was applied
    let state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.find((f) => f.slug === 'register').title, 'Changed');

    // Undo the merge
    await cli.dispatch(['undo', '--project', root, '--no-render'], io);

    // Verify reverted
    state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.find((f) => f.slug === 'register').title, 'Original');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('merge --all merges multiple pending spec overlays', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    // Create base
    await cli.dispatch(['feature', 'add', '--slug', 'base', '--project', root, '--no-render'], io);

    // Create two independent spec overlays
    const specA = 'docs/plans/2026-05-14/spec-a';
    const specB = 'docs/plans/2026-05-14/spec-b';
    await cli.dispatch(['feature', 'add', '--slug', 'from-spec-a', '--spec', specA, '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'add', '--slug', 'from-spec-b', '--spec', specB, '--project', root, '--no-render'], io);

    // Merge all
    const allIo = makeIo();
    const code = await cli.dispatch(['merge', '--all', '--project', root, '--no-render'], allIo);
    assert.equal(code, 0);
    assert.match(allIo.stdout_text, /2 spec overlay\(s\) merged/);

    // Both spec features should be in base
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const slugs = state.features.map((f) => f.slug);
    assert.ok(slugs.includes('from-spec-a'));
    assert.ok(slugs.includes('from-spec-b'));
    assert.ok(slugs.includes('base'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- add/remove verb tests -----------------------------------------------

test('add feature with --depends-on creates feature with dependency', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'feature', 'payment', '--depends-on', 'order', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const featYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/payment.yaml'), 'utf8');
    assert.match(featYaml, /order/);
    assert.match(featYaml, /dependsOn/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('add module --part-of creates submodule under parent feature', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    let code = await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    code = await cli.dispatch(['add', 'module', 'payment-api', '--part-of', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const featYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/payment.yaml'), 'utf8');
    assert.match(featYaml, /slug: payment-api/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('add relation --data-flow-to creates cross-feature edge', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'b', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'relation', 'a/svc', '--data-flow-to', 'b/api', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const edge = state.edges.find((e) => e.from.feature === 'a' && e.to.feature === 'b');
    assert.ok(edge, 'cross-feature edge should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('add batch mode creates multiple features', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'feature', 'f1', 'feature', 'f2', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const slugs = state.features.map((f) => f.slug);
    assert.ok(slugs.includes('f1'));
    assert.ok(slugs.includes('f2'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remove feature drops the feature from atlas', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'test-feat', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'feature', 'test-feat', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.find((f) => f.slug === 'test-feat'), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('add error on unknown entity type', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'unknown', 'test', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /Unknown entity type/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('add module missing --part-of returns error', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'module', 'orphan', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /Missing required flag --part-of/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('add --spec writes to overlay without mutating base files', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'base-feat', '--project', root, '--no-render'], io);
    const baseYamlBefore = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/base-feat.yaml'), 'utf8');

    const specDir = 'docs/plans/2026-05-14/spec-add-test';
    await cli.dispatch(['add', 'feature', 'spec-feat', '--spec', specDir, '--project', root, '--no-render'], io);

    const baseYamlAfter = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/base-feat.yaml'), 'utf8');
    assert.equal(baseYamlAfter, baseYamlBefore, 'base YAML must not change in spec mode');

    const overlayYaml = path.join(root, specDir, 'architecture_diff/atlas/features/spec-feat.yaml');
    assert.equal(fs.existsSync(overlayYaml), true, 'overlay YAML should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- regression tests for add/remove verbs --------------------------------

test('batch mode with entity types and per-entity flags', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'feature', 'payment', '--depends-on', 'order', 'module', 'payment-api', '--part-of', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const featYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/payment.yaml'), 'utf8');
    assert.match(featYaml, /order/);
    assert.match(featYaml, /dependsOn/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('module --implements creates edge', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'gateway', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'stripe-adapter', '--part-of', 'payment', '--implements', 'gateway/svc', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /implements/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('module --deployed-on creates edge', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'payment-api', '--part-of', 'payment', '--deployed-on', 'eks-cluster', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /deployed-on/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('module --depends-on creates dependency edge', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'billing', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'billing', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'payment-api', '--part-of', 'payment', '--depends-on', 'billing/svc', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /dependency/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remove non-existent feature returns error with suggestions', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'billing', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'feature', 'paymint', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /paymint/);
    assert.match(io.stderr_text, /payment/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remove non-existent module returns error', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'payment', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'module', 'apix', '--part-of', 'payment', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /apix/);
    assert.match(io.stderr_text, /api/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('remove --dry-run does not mutate', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    const stateBefore = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(stateBefore.features.length, 1);
    const code = await cli.dispatch(['remove', 'feature', 'payment', '--project', root, '--no-render', '--dry-run'], io);
    assert.equal(code, 0);
    const stateAfter = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(stateAfter.features.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('module --part-of non-existent returns error', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'billing', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'orphan', '--part-of', 'nonexistent', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /nonexistent/);
    assert.match(io.stderr_text, /payment/);
    assert.match(io.stderr_text, /billing/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('duplicate feature add warns', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    let code = await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    code = await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stderr_text, /already exists/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('relation --implements produces implements kind', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'a', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'relation', 'a/svc', '--implements', 'b/svc', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const edge = (state.edges || []).find(e => e.from.feature === 'a');
    assert.ok(edge, 'edge should exist from feature a');
    assert.equal(edge.kind, 'implements');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('batch add rolls back on validation failure', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'existing', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'feature', 'f1', 'module', 'm1', '--part-of', 'nonexistent', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const slugs = state.features.map(f => f.slug);
    assert.equal(slugs.includes('f1'), false, 'f1 should not be added (batch rolled back)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy apply suggests add', async () => {
  const io = makeIo();
  const code = await cli.dispatch(['apply', '/tmp/dummy.yaml'], io);
  assert.notEqual(code, 0);
  assert.match(io.stderr_text, /add/);
  assert.doesNotMatch(io.stderr_text, /Unknown verb/);
});

test('remove --dry-run JSON output', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'feature', 'payment', '--project', root, '--no-render', '--dry-run'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /dry-run/);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('help shows operational verbs', async () => {
  const io = makeIo();
  const code = await cli.dispatch(['help'], io);
  assert.equal(code, 0);
  assert.match(io.stdout_text, /validate/);
  assert.match(io.stdout_text, /status/);
  assert.match(io.stdout_text, /scan/);
  assert.match(io.stdout_text, /undo/);
});

test('help hides fine-grained verbs', async () => {
  const io = makeIo();
  const code = await cli.dispatch(['help'], io);
  assert.equal(code, 0);
  assert.doesNotMatch(io.stdout_text, /feature add/);
  assert.doesNotMatch(io.stdout_text, /submodule add/);
  assert.doesNotMatch(io.stdout_text, /edge add/);
});

test('add auto-render without --no-render', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')));
    assert.match(io.stdout_text, /applied/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- Round 2 regression tests (FIX-01 through FIX-09) ----------------------

test('REGTEST-F01: module --implements renders edge in output (FIX-01)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'gateway', '--project', root, '--no-render'], io);
    // Create svc submodule under gateway so gateway/svc is a valid target
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'gateway', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'stripe-adapter', '--part-of', 'payment', '--implements', 'gateway/svc', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /implements/);
    // Verify HTML was auto-rendered
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F02: module --data-flow-to creates data-row edge (FIX-02)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'ledger', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'ledger', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'payment-gateway', '--part-of', 'payment', '--data-flow-to', 'ledger/svc', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /data-row/);
    assert.match(indexYaml, /ledger/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F03: batch add in --spec mode rolls back on failure (FIX-03)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'existing', '--project', root, '--no-render'], io);
    const specDir = 'docs/plans/2026-06-07/spec-rollback-test';
    // Batch with a valid entity followed by an invalid one (module without --part-of)
    const code = await cli.dispatch(['add', 'feature', 'f1', 'module', 'm1', '--spec', specDir, '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    // Verify overlay does NOT contain f1 (rollback happened)
    const overlayDir = path.join(root, specDir, 'architecture_diff', 'atlas');
    if (fs.existsSync(overlayDir)) {
      const overlayFiles = fs.readdirSync(overlayDir);
      assert.equal(overlayFiles.filter(f => f.endsWith('.yaml')).length, 0,
        'Overlay should be empty after rollback');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F04: feature --depends-on creates dependency edge (FIX-04)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'order', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'feature', 'payment', '--depends-on', 'order', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    // Feature YAML should still have dependsOn field
    const featYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/features/payment.yaml'), 'utf8');
    assert.match(featYaml, /dependsOn/);
    // Plus a dependency edge in the atlas index
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /dependency/);
    assert.match(indexYaml, /order/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F05: duplicate feature add shows "already exists" not "add applied" (FIX-05)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    // "already exists" goes to stderr (P2-7: duplicate entity warning to stderr)
    assert.match(io.stderr_text, /already exists/);
    assert.doesNotMatch(io.stderr_text, /add applied/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F06: add module output includes relation flags in summary (FIX-06)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'order', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'module', 'payment-api', '--part-of', 'payment', '--depends-on', 'order', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /depends-on/);
    assert.match(io.stdout_text, /payment-api/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F07: batch mode with no valid entities returns error (FIX-07)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', '--project', root, '--no-render'], io);
    assert.notEqual(code, 0);
    assert.match(io.stderr_text, /Usage/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F08: --depends-on before first entity in batch creates dependency (FIX-08)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'order', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', '--depends-on', 'order', 'feature', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const indexYaml = fs.readFileSync(path.join(root, 'resources/project-architecture/atlas/atlas.index.yaml'), 'utf8');
    assert.match(indexYaml, /dependency/);
    assert.match(indexYaml, /order/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-F09: fine-grained verb --help shows default help (FIX-09)', async () => {
  const io = makeIo();
  const code = await cli.dispatch(['feature', '--help'], io);
  assert.equal(code, 0);
  assert.doesNotMatch(io.stdout_text, /feature add --slug/);
  assert.doesNotMatch(io.stdout_text, /manage feature modules/);
});

test('P3-10: remove module via unified dispatch (happy path)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'payment', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'module', 'api', '--part-of', 'payment', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const payment = state.features.find(f => f.slug === 'payment');
    assert.ok(payment, 'feature should still exist');
    assert.equal(payment.submodules.length, 0, 'submodule should be removed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('P3-11: remove relation via unified dispatch (happy path)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'relation', 'a/svc', '--data-flow-to', 'b/api', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'relation', 'a/svc', '--to', 'b/api', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const edge = (state.edges || []).find(e => e.from.feature === 'a' && e.to.feature === 'b');
    assert.equal(edge, undefined, 'edge should be removed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('P3-12: remove without --no-render triggers auto-render', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'payment', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'test-x', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['remove', 'feature', 'test-x', '--project', root, '--no-open'], io);
    assert.equal(code, 0);
    assert.ok(fs.existsSync(path.join(root, 'resources/project-architecture/index.html')),
      'HTML should be rendered after remove');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('P3-13: legacy template suggests add', async () => {
  const io = makeIo();
  const code = await cli.dispatch(['template', '/tmp/dummy.yaml'], io);
  assert.notEqual(code, 0);
  assert.match(io.stderr_text, /add/);
  assert.doesNotMatch(io.stderr_text, /Unknown verb/);
});

// ---- Round 3 regression tests (REGTEST-01 through REGTEST-09) ---------------

test('REGTEST-01: relation --depends-on creates dependency edge (P2-1)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'relation', 'a', '--depends-on', 'b', '--project', root, '--no-render'], io);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const depEdge = (state.edges || []).find(e => e.from && e.from.feature === 'a' && e.to && e.to.feature === 'b' && e.kind === 'dependency');
    assert.ok(depEdge, 'dependency edge should exist between a and b');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-02: relation change summary only shows actually applied flags (P2-2)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'relation', 'a', '--depends-on', 'b', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    // Should NOT claim data-flow-to was applied (it wasn't)
    assert.doesNotMatch(io.stdout_text, /data-flow-to/);
    // Should mention depends-on since relation --depends-on IS now consumed
    assert.match(io.stdout_text, /depends-on/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-03: simple pair batch mode reports skip count for duplicates (P2-3,P2-4)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const code = await cli.dispatch(['add', 'feature', 'f1', 'feature', 'f1', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /1.*add.*1.*skip/);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    assert.equal(state.features.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-04: batch all-skipped outputs message (P2-5)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'existing', '--project', root, '--no-render'], io);
    const code = await cli.dispatch(['add', 'feature', 'existing', 'feature', 'existing', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /all.*2.*already exist|skip/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-05: remove relation --kind filters by edge kind (P2-6)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['add', 'feature', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'feature', 'b', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'svc', '--part-of', 'a', '--project', root, '--no-render'], io);
    await cli.dispatch(['add', 'module', 'api', '--part-of', 'b', '--project', root, '--no-render'], io);
    // Add two edges: data-row and call
    await cli.dispatch(['edge', 'add', '--from', 'a/svc', '--to', 'b/api', '--kind', 'data-row', '--project', root, '--no-render'], io);
    await cli.dispatch(['edge', 'add', '--from', 'a/svc', '--to', 'b/api', '--kind', 'call', '--project', root, '--no-render'], io);
    // Remove with --kind call — should only remove the call-kind edge
    const code = await cli.dispatch(['remove', 'relation', 'a/svc', '--to', 'b/api', '--kind', 'call', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    assert.match(io.stdout_text, /kind: call/);
    const state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const dataRowEdge = (state.edges || []).find(e => e.from && e.from.feature === 'a' && e.to && e.to.feature === 'b' && e.kind === 'data-row');
    const callEdge = (state.edges || []).find(e => e.from && e.from.feature === 'a' && e.to && e.to.feature === 'b' && e.kind === 'call');
    assert.ok(dataRowEdge, 'data-row edge should remain after removing call edge');
    assert.equal(callEdge, undefined, 'call edge should be removed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-06: remove feature cleans up dependsOn references on other features (P2-7)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    await cli.dispatch(['feature', 'add', '--slug', 'Y', '--project', root, '--no-render'], io);
    await cli.dispatch(['feature', 'add', '--slug', 'X', '--depends-on', 'Y', '--project', root, '--no-render'], io);
    // Confirm dependsOn exists before removal
    let state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const featXbefore = state.features.find(f => f.slug === 'X');
    assert.ok(featXbefore.dependsOn.includes('Y'), 'X should depend on Y before removal');
    // Remove Y
    await cli.dispatch(['feature', 'remove', '--slug', 'Y', '--project', root, '--no-render'], io);
    // Check that X no longer depends on Y
    state = stateLib.load(path.join(root, 'resources/project-architecture/atlas'));
    const featXafter = state.features.find(f => f.slug === 'X');
    assert.ok(featXafter, 'feature X should still exist');
    assert.equal(featXafter.dependsOn.includes('Y'), false, 'X should no longer depend on Y after Y is removed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-07: MULTI_VERBS exported from cli.js (P2-10)', () => {
  assert.ok(cli.MULTI_VERBS, 'MULTI_VERBS should be exported');
  assert.ok(cli.MULTI_VERBS.has('feature'), 'MULTI_VERBS should include feature');
  assert.ok(cli.MULTI_VERBS.has('submodule'), 'MULTI_VERBS should include submodule');
  assert.ok(cli.MULTI_VERBS.has('edge'), 'MULTI_VERBS should include edge');
  assert.equal(cli.MULTI_VERBS.has('add'), false, 'MULTI_VERBS should NOT include add');
  assert.equal(cli.MULTI_VERBS.has('remove'), false, 'MULTI_VERBS should NOT include remove');
});

test('REGTEST-08: batch dry-run does not mutate state (P3-6)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const statePath = path.join(root, 'resources/project-architecture/atlas');
    await cli.dispatch(['add', 'feature', 'existing', '--project', root, '--no-render'], io);
    const stateBefore = stateLib.load(statePath);
    const beforeJson = JSON.stringify(stateBefore);
    const code = await cli.dispatch(['add', 'feature', 'f1', 'feature', 'f2', '--dry-run', '--project', root, '--no-render'], io);
    assert.equal(code, 0);
    const stateAfter = stateLib.load(statePath);
    const afterJson = JSON.stringify(stateAfter);
    assert.equal(afterJson, beforeJson, 'state should not change in dry-run mode');
    assert.match(io.stdout_text, /dry-run/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('REGTEST-09: unified add --spec + diff end-to-end (P3-13)', async () => {
  const root = mkProject();
  try {
    const io = makeIo();
    const specDir = 'docs/plans/test-spec';
    // Add base feature
    await cli.dispatch(['add', 'feature', 'base', '--project', root, '--no-render'], io);
    // Add spec feature via unified add
    await cli.dispatch(['add', 'feature', 'new-feature', '--spec', specDir, '--project', root, '--no-render'], io);
    // Run diff
    const outDir = path.join(root, 'diff-out');
    const diffIo = makeIo();
    const code = await cli.dispatch(['diff', '--project', root, '--out', outDir, '--no-open'], diffIo);
    assert.equal(code, 0);
    // Check diff output
    assert.match(diffIo.stdout_text, /Diff pages/);
    assert.ok(fs.existsSync(path.join(outDir, 'index.html')), 'diff viewer HTML should exist');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
