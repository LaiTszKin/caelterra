import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schema = require('../skills/init-project-html/lib/atlas/schema.js');
const stateLib = require('../skills/init-project-html/lib/atlas/state.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aplt-atlas-state-'));
}

function sampleState() {
  return {
    meta: { title: 'demo', summary: 'tiny' },
    actors: [{ id: 'end-user', label: 'End user' }],
    features: [
      {
        slug: 'register',
        title: 'Register',
        story: 'Account creation',
        dependsOn: [],
        submodules: [
          {
            slug: 'ui',
            kind: 'ui',
            role: 'Form',
            functions: [],
            variables: [],
            dataflow: [],
            errors: [],
          },
          {
            slug: 'api',
            kind: 'api',
            role: 'HTTP',
            functions: [],
            variables: [],
            dataflow: [],
            errors: [],
          },
        ],
        edges: [
          {
            id: 'e1',
            from: 'ui',
            to: 'api',
            kind: 'call',
            label: 'POST /register',
          },
        ],
      },
    ],
    edges: [],
  };
}

test('schema.validate accepts a well-formed state', () => {
  const result = schema.validate(sampleState());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('schema.validate rejects unknown kind / scope / side enums', () => {
  const state = sampleState();
  state.features[0].submodules[0].kind = 'bogus';
  state.features[0].submodules[0].functions = [{ name: 'fn', side: 'wat' }];
  state.features[0].submodules[0].variables = [{ name: 'v', scope: 'oops' }];
  const result = schema.validate(state);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('"kind"')));
  assert.ok(result.errors.some((e) => e.message.includes('"side"')));
  assert.ok(result.errors.some((e) => e.message.includes('"scope"')));
});

test('schema.validate flags duplicate feature/submodule slugs', () => {
  const state = sampleState();
  state.features.push({
    slug: 'register',
    title: 'dup',
    submodules: [],
    edges: [],
  });
  state.features[0].submodules.push({ slug: 'ui', kind: 'ui', role: '' });
  const result = schema.validate(state);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('duplicate feature slug')),
  );
  assert.ok(
    result.errors.some((e) => e.message.includes('duplicate submodule slug')),
  );
});

test('schema.validate detects unknown edge endpoints', () => {
  const state = sampleState();
  state.edges = [
    {
      id: 'x',
      from: { feature: 'ghost' },
      to: { feature: 'register', submodule: 'ui' },
      kind: 'call',
    },
  ];
  const result = schema.validate(state);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('unknown feature')));
});

test('schema.validate accepts enriched dataflow steps referencing declared fn + variables', () => {
  const state = sampleState();
  const api = state.features[0].submodules[1];
  api.functions = [{ name: 'handlePost', side: 'network', purpose: 'entry' }];
  api.variables = [
    { name: 'body', type: 'object', scope: 'call', purpose: 'request body' },
    { name: 'token', type: 'string', scope: 'call', purpose: 'output token' },
  ];
  api.dataflow = [
    'Receive request',
    {
      step: 'Validate body and emit token',
      fn: 'handlePost',
      reads: ['body'],
      writes: ['token'],
    },
  ];
  const result = schema.validate(state);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('schema.validate rejects dataflow fn/reads/writes referencing undeclared symbols', () => {
  const state = sampleState();
  const api = state.features[0].submodules[1];
  api.functions = [{ name: 'handlePost' }];
  api.variables = [{ name: 'body', scope: 'call' }];
  api.dataflow = [
    { step: 'Bad fn', fn: 'nope' },
    { step: 'Bad reads', reads: ['ghost'] },
    { step: 'Bad writes', writes: ['phantom'] },
    { step: 'Wrong shape', reads: 'not-an-array' },
  ];
  const result = schema.validate(state);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('unknown function "nope"')),
    'flags unknown fn',
  );
  assert.ok(
    result.errors.some((e) => e.message.includes('unknown variable "ghost"')),
    'flags unknown reads',
  );
  assert.ok(
    result.errors.some((e) => e.message.includes('unknown variable "phantom"')),
    'flags unknown writes',
  );
  assert.ok(
    result.errors.some((e) => e.message.includes('"reads" must be an array')),
    'flags wrong shape',
  );
});

test('state.save then state.load round-trips', () => {
  const dir = mkTmp();
  try {
    const atlasDir = path.join(dir, 'atlas');
    const original = sampleState();
    stateLib.save(atlasDir, original);
    const loaded = stateLib.load(atlasDir);
    assert.equal(loaded.meta.title, 'demo');
    assert.equal(loaded.features.length, 1);
    assert.equal(loaded.features[0].submodules.length, 2);
    assert.equal(loaded.features[0].edges[0].label, 'POST /register');
    assert.ok(fs.existsSync(path.join(atlasDir, 'features', 'register.yaml')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('state.save drops orphan feature YAML files', () => {
  const dir = mkTmp();
  try {
    const atlasDir = path.join(dir, 'atlas');
    stateLib.save(atlasDir, sampleState());
    fs.writeFileSync(
      path.join(atlasDir, 'features', 'ghost.yaml'),
      'slug: ghost\n',
    );
    stateLib.save(atlasDir, sampleState());
    assert.equal(
      fs.existsSync(path.join(atlasDir, 'features', 'ghost.yaml')),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeOverlay applies feature overrides and removals', () => {
  const base = sampleState();
  const overlay = {
    meta: null,
    actors: null,
    edges: null,
    featureOrder: null,
    features: {
      register: {
        slug: 'register',
        title: 'Register',
        story: 'Account creation v2',
        dependsOn: [],
        submodules: [
          {
            slug: 'ui',
            kind: 'ui',
            role: 'Form',
            functions: [],
            variables: [],
            dataflow: [],
            errors: [],
          },
          {
            slug: 'api',
            kind: 'api',
            role: 'HTTP',
            functions: [],
            variables: [],
            dataflow: [],
            errors: [],
          },
          {
            slug: '2fa',
            kind: 'service',
            role: 'TOTP',
            functions: [],
            variables: [],
            dataflow: [],
            errors: [],
          },
        ],
        edges: [],
      },
    },
    removed: { features: [], submodules: [] },
  };
  const merged = stateLib.mergeOverlay(base, overlay);
  assert.equal(merged.features[0].story, 'Account creation v2');
  assert.equal(merged.features[0].submodules.length, 3);
});

test('mergeOverlay removes features and submodules listed in _removed', () => {
  const base = sampleState();
  base.features.push({
    slug: 'get-codes',
    title: 'Codes',
    submodules: [{ slug: 'svc', kind: 'service', role: '' }],
    edges: [],
  });
  const overlay = {
    meta: null,
    actors: null,
    edges: null,
    featureOrder: null,
    features: {},
    removed: {
      features: ['get-codes'],
      submodules: [{ feature: 'register', submodule: 'ui' }],
    },
  };
  const merged = stateLib.mergeOverlay(base, overlay);
  assert.equal(merged.features.length, 1);
  assert.equal(merged.features[0].slug, 'register');
  assert.equal(merged.features[0].submodules.length, 1);
  assert.equal(merged.features[0].submodules[0].slug, 'api');
});

test('diffPages classifies modified/added/removed correctly', () => {
  const base = sampleState();
  const merged = JSON.parse(JSON.stringify(base));
  merged.features[0].submodules.push({
    slug: '2fa',
    kind: 'service',
    role: 'TOTP',
    functions: [],
    variables: [],
    dataflow: [],
    errors: [],
  });
  merged.features[0].submodules[1].role = 'HTTP v2';
  merged.features.push({
    slug: 'admin',
    title: 'Admin',
    submodules: [{ slug: 'ui', kind: 'ui', role: '' }],
    edges: [],
    dependsOn: [],
    story: '',
  });

  const diff = stateLib.diffPages(base, merged);
  assert.deepEqual([...diff.addedFeatures], ['admin']);
  assert.deepEqual([...diff.modifiedFeatures], ['register']);
  assert.deepEqual(diff.removedFeatures.size, 0);
  assert.deepEqual(
    diff.modifiedSubmodules.map((s) => `${s.feature}/${s.submodule}`),
    ['register/api'],
  );
  assert.deepEqual(
    diff.addedSubmodules.map((s) => `${s.feature}/${s.submodule}`).sort(),
    ['admin/ui', 'register/2fa'],
  );
  assert.equal(diff.macroChanged, true);
});

test('loadOverlay / saveOverlay round-trip', () => {
  const dir = mkTmp();
  try {
    const overlay = {
      meta: { title: 'next' },
      actors: null,
      edges: null,
      featureOrder: null,
      features: {
        register: {
          slug: 'register',
          title: 'Register',
          story: '',
          dependsOn: [],
          submodules: [{ slug: 'ui', kind: 'ui', role: 'Form' }],
          edges: [],
        },
      },
      removed: {
        features: ['legacy'],
        submodules: [{ feature: 'register', submodule: 'old' }],
      },
    };
    stateLib.saveOverlay(dir, overlay);
    const loaded = stateLib.loadOverlay(dir);
    assert.deepEqual(loaded.meta, { title: 'next' });
    assert.equal(Object.keys(loaded.features).length, 1);
    assert.deepEqual(loaded.removed.features, ['legacy']);
    assert.deepEqual(loaded.removed.submodules, [
      { feature: 'register', submodule: 'old' },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('undo snapshot is read and cleared', () => {
  const dir = mkTmp();
  try {
    stateLib.writeUndoSnapshot(dir, { base: { features: [] } });
    const snap = stateLib.consumeUndoSnapshot(dir, 1);
    assert.deepEqual(snap, { base: { features: [] } });
    assert.equal(stateLib.consumeUndoSnapshot(dir, 1), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
