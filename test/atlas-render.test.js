import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const render = require('../skills/init-project-html/lib/atlas/render.js');
const {
  layoutMacro,
  assertNoOverlap,
  measureSubmodule,
  measureEdgeLabel,
  buildGraph,
  SUB_WIDTH_MAX,
  SUB_HEIGHT_MIN,
} = require('../skills/init-project-html/lib/atlas/layout');

function fixtureState() {
  return {
    meta: { title: 'Demo atlas', summary: 'Tiny demo' },
    actors: [],
    features: [
      {
        slug: 'register',
        title: 'Register',
        story: 'A user creates an account.',
        dependsOn: [],
        submodules: [
          {
            slug: 'ui',
            kind: 'ui',
            role: 'Renders form',
            functions: [
              {
                name: 'submit',
                in: 'evt',
                out: 'void',
                side: 'io',
                purpose: 'send form',
              },
            ],
            variables: [
              {
                name: 'email',
                type: 'string',
                scope: 'call',
                purpose: 'user id',
              },
            ],
            dataflow: ['collect', 'post', 'show result'],
            errors: [{ name: 'NetErr', when: 'API fails', means: 'banner' }],
          },
          {
            slug: 'api',
            kind: 'api',
            role: 'HTTP endpoint',
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
      {
        slug: 'invite',
        title: 'Invite codes',
        story: '',
        dependsOn: [],
        submodules: [
          {
            slug: 'svc',
            kind: 'service',
            role: 'mint codes',
            functions: [],
            variables: [],
            dataflow: [],
            errors: [],
          },
        ],
        edges: [],
      },
    ],
    edges: [
      {
        id: 'cross',
        from: { feature: 'invite', submodule: 'svc' },
        to: { feature: 'register', submodule: 'api' },
        kind: 'data-row',
        label: 'code lookup',
      },
    ],
  };
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aplt-atlas-render-'));
}

test('layoutMacro produces non-overlapping rectangles with absolute coordinates', async () => {
  const layout = await layoutMacro(fixtureState());
  assert.equal(layout.empty, false);
  assert.equal(layout.features.length, 2);
  assert.equal(layout.submodules.length, 3);
  for (const sub of layout.submodules) {
    assert.ok(sub.width > 0 && sub.height > 0);
    assert.ok(sub.x >= 0 && sub.y >= 0);
  }
  // explicit second check (layoutMacro already invokes it but we want a regression guard)
  assertNoOverlap(layout);
});

test('measureSubmodule grows the box to fit longer role text without truncation', () => {
  const short = measureSubmodule({
    slug: 'svc',
    kind: 'service',
    role: 'Tiny.',
  });
  const longRole =
    'This sub-module mints invite codes, persists them, and returns the code string with retry-on-collision semantics that the caller relies upon.';
  const long = measureSubmodule({
    slug: 'svc',
    kind: 'service',
    role: longRole,
  });
  assert.ok(long.width >= short.width, 'long role widens the box');
  assert.ok(long.height >= short.height, 'long role grows the box height');
  assert.ok(long.width <= SUB_WIDTH_MAX, 'width stays capped at SUB_WIDTH_MAX');
  assert.ok(long.roleLines.length >= 2, 'long role wraps onto multiple lines');
  const joined = long.roleLines.join(' ');
  assert.ok(
    joined.includes('persists') && joined.includes('caller'),
    'every part of the role is preserved across the wrapped lines',
  );
  assert.ok(
    short.height >= SUB_HEIGHT_MIN,
    'short role still respects the min height',
  );
});

test('renderMacroSvg makes each sub-module node a clickable link to its dedicated page', async () => {
  const out = mkTmp();
  try {
    await render.renderAll({ outDir: out, state: fixtureState() });
    const macroHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(
      macroHtml,
      /<a class="m-node m-node--ui"[^>]*href="features\/register\/ui\.html"/,
      'sub-module ui node is wrapped in a link to its page',
    );
    assert.match(
      macroHtml,
      /<a class="m-node m-node--service"[^>]*href="features\/invite\/svc\.html"/,
      'sub-module svc node is wrapped in a link to its page',
    );
    assert.match(
      macroHtml,
      /<title>ui — Renders form<\/title>/,
      'macro SVG <title> surfaces the role as a tooltip',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderMacroSvg renders every wrapped line of a long role inside the sub-module box (no truncation)', async () => {
  const out = mkTmp();
  try {
    const state = fixtureState();
    const longRole =
      'Mints invite codes for the registration handshake, persists them in invite_codes, retries on unique-violation, and surfaces 503 only after the retry budget exhausts.';
    state.features[1].submodules[0].role = longRole;
    await render.renderAll({ outDir: out, state });
    const macroHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const roleLines =
      macroHtml.match(/<text class="m-node__role"[^>]*>([^<]+)<\/text>/g) || [];
    assert.ok(
      roleLines.length >= 2,
      'long role spans multiple role text lines',
    );
    const joined = roleLines.map((l) => l.replace(/<[^>]+>/g, '')).join(' ');
    assert.ok(
      joined.includes('retries') && joined.includes('budget'),
      'no portion of the long role is silently dropped',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll emits macro, feature, and submodule HTML plus assets', async () => {
  const out = mkTmp();
  try {
    const result = await render.renderAll({
      outDir: out,
      state: fixtureState(),
    });
    assert.ok(result.written.includes('index.html'));
    assert.ok(result.written.includes('features/register/index.html'));
    assert.ok(result.written.includes('features/register/ui.html'));
    assert.ok(result.written.includes('features/invite/svc.html'));
    assert.ok(fs.existsSync(path.join(out, 'assets', 'architecture.css')));
    assert.ok(fs.existsSync(path.join(out, 'assets', 'viewer.client.js')));
    const macroHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(macroHtml, /atlas-svg/);
    assert.match(macroHtml, /m-cluster/);
    assert.match(macroHtml, /m-node/);
    assert.match(macroHtml, /viewer\.client\.js/);
    const subHtml = fs.readFileSync(
      path.join(out, 'features', 'register', 'ui.html'),
      'utf8',
    );
    assert.match(subHtml, /aria-label="Function I\/O"/);
    assert.match(subHtml, /aria-label="Variables"/);
    assert.match(subHtml, /aria-label="Internal data flow"/);
    assert.match(subHtml, /aria-label="Errors"/);
    assert.match(
      subHtml,
      /data-pan-zoom-viewport/,
      'sub-module page wraps the dataflow svg in a zoom viewport',
    );
    assert.match(
      subHtml,
      /viewer\.client\.js/,
      'sub-module page ships the viewer script',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll renders fn pill + reads/writes chips when dataflow steps are enriched', async () => {
  const out = mkTmp();
  try {
    const state = fixtureState();
    const ui = state.features[0].submodules[0];
    ui.variables = [
      { name: 'email', type: 'string', scope: 'call', purpose: 'user id' },
      {
        name: 'token',
        type: 'string',
        scope: 'call',
        purpose: 'idempotency key',
      },
    ];
    ui.dataflow = [
      'collect',
      {
        step: 'validate then post',
        fn: 'submit',
        reads: ['email'],
        writes: ['token'],
      },
    ];
    await render.renderAll({ outDir: out, state });
    const subHtml = fs.readFileSync(
      path.join(out, 'features', 'register', 'ui.html'),
      'utf8',
    );
    assert.match(
      subHtml,
      /sub-dataflow__fn-text[^>]*>fn submit</,
      'fn pill renders the function name',
    );
    assert.match(
      subHtml,
      /sub-dataflow__chip--reads[^>]*>← reads: email</,
      'reads chip renders',
    );
    assert.match(
      subHtml,
      /sub-dataflow__chip--writes[^>]*>→ writes: token</,
      'writes chip renders',
    );
    assert.match(
      subHtml,
      /<text class="sub-dataflow__text"[^>]*>collect<\/text>/,
      'plain string step still renders',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll honours scope and emits only requested pages', async () => {
  const out = mkTmp();
  try {
    const scope = {
      macro: false,
      features: new Set(['register']),
      submodules: [{ feature: 'register', submodule: 'ui' }],
    };
    const result = await render.renderAll({
      outDir: out,
      state: fixtureState(),
      scope,
    });
    assert.deepEqual(
      result.written.sort(),
      ['features/register/index.html', 'features/register/ui.html'].sort(),
    );
    assert.equal(fs.existsSync(path.join(out, 'index.html')), false);
    assert.equal(
      fs.existsSync(path.join(out, 'features', 'invite', 'svc.html')),
      false,
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll with scope.macro only writes index.html', async () => {
  const out = mkTmp();
  try {
    const scope = { macro: true, features: new Set(), submodules: [] };
    const result = await render.renderAll({
      outDir: out,
      state: fixtureState(),
      scope,
    });
    assert.deepEqual(result.written, ['index.html']);
    assert.equal(
      fs.existsSync(path.join(out, 'features/register/ui.html')),
      false,
    );
    const macroHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(macroHtml, /register/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll writes _removed.txt when removedPaths supplied', async () => {
  const out = mkTmp();
  try {
    const removedPaths = [
      'features/legacy/index.html',
      'features/register/old.html',
    ];
    await render.renderAll({
      outDir: out,
      state: fixtureState(),
      removedPaths,
    });
    const removedFile = fs.readFileSync(path.join(out, '_removed.txt'), 'utf8');
    assert.match(removedFile, /features\/legacy\/index\.html/);
    assert.match(removedFile, /features\/register\/old\.html/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll renders an empty atlas with a placeholder SVG', async () => {
  const out = mkTmp();
  try {
    const result = await render.renderAll({
      outDir: out,
      state: { meta: { title: 'empty' }, actors: [], features: [], edges: [] },
    });
    assert.deepEqual(result.written, ['index.html']);
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /Atlas has no features yet/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('shipped architecture.css gives the viewport a fixed height so horizontal atlases keep their block', () => {
  const css = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'skills',
      'init-project-html',
      'lib',
      'atlas',
      'assets',
      'architecture.css',
    ),
    'utf8',
  );
  assert.match(
    css,
    /\.atlas-canvas__viewport\b[^{]*\{[^}]*height:\s*clamp\(/,
    'macro viewport has a clamp() height',
  );
  assert.match(
    css,
    /\.sub-dataflow__viewport\b[^{]*\{[^}]*height:\s*clamp\(/,
    'sub dataflow viewport has a clamp() height',
  );
  assert.match(
    css,
    /\.atlas-svg\b[^{]*\{[^}]*height:\s*100%/,
    'atlas-svg fills the viewport height',
  );
});

test('shipped viewer.client.js claims the wheel gesture so the host page never scrolls', () => {
  const js = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'skills',
      'init-project-html',
      'lib',
      'atlas',
      'assets',
      'viewer.client.js',
    ),
    'utf8',
  );
  const wheelBlock = js.match(
    /addEventListener\('wheel',[\s\S]*?\}, \{ passive: false \}\)/,
  );
  assert.ok(wheelBlock, 'wheel handler exists');
  assert.match(wheelBlock[0], /evt\.preventDefault\(\)/);
  assert.match(wheelBlock[0], /evt\.stopPropagation\(\)/);
  assert.ok(
    !/if \(!evt\.ctrlKey/.test(wheelBlock[0]),
    'wheel handler no longer gates page scroll behind ctrlKey',
  );
});

test('renderMacroSvg sets preserveAspectRatio="xMidYMid meet" so wide atlases stay centered in the fixed viewport', async () => {
  const out = mkTmp();
  try {
    await render.renderAll({ outDir: out, state: fixtureState() });
    const macroHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(
      macroHtml,
      /class="atlas-svg"[^>]*preserveAspectRatio="xMidYMid meet"/,
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll head loads the custom font stack (Fraunces / Geist / JetBrains Mono)', async () => {
  const out = mkTmp();
  try {
    await render.renderAll({ outDir: out, state: fixtureState() });
    const macroHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(macroHtml, /fonts\.googleapis\.com\/css2\?family=Fraunces:/);
    assert.match(macroHtml, /family=Geist:/);
    assert.match(macroHtml, /family=JetBrains\+Mono:/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll (no scope) sweeps orphan feature directories and stale submodule HTML', async () => {
  const out = mkTmp();
  try {
    await render.renderAll({ outDir: out, state: fixtureState() });
    fs.mkdirSync(path.join(out, 'features', 'legacy'), { recursive: true });
    fs.writeFileSync(
      path.join(out, 'features', 'legacy', 'index.html'),
      '<!doctype html>',
      'utf8',
    );
    fs.writeFileSync(
      path.join(out, 'features', 'register', 'orphan.html'),
      '<!doctype html>',
      'utf8',
    );
    assert.ok(
      fs.existsSync(path.join(out, 'features', 'legacy', 'index.html')),
    );
    assert.ok(
      fs.existsSync(path.join(out, 'features', 'register', 'orphan.html')),
    );
    await render.renderAll({ outDir: out, state: fixtureState() });
    assert.equal(
      fs.existsSync(path.join(out, 'features', 'legacy')),
      false,
      'orphan feature dir removed',
    );
    assert.equal(
      fs.existsSync(path.join(out, 'features', 'register', 'orphan.html')),
      false,
      'orphan submodule html removed',
    );
    assert.ok(
      fs.existsSync(path.join(out, 'features', 'register', 'ui.html')),
      'live submodule page kept',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('renderAll with explicit scope keeps only the current scoped html set', async () => {
  const out = mkTmp();
  try {
    await render.renderAll({ outDir: out, state: fixtureState() });
    fs.mkdirSync(path.join(out, 'features', 'legacy'), { recursive: true });
    fs.writeFileSync(
      path.join(out, 'features', 'legacy', 'index.html'),
      '<!doctype html>',
      'utf8',
    );
    assert.ok(fs.existsSync(path.join(out, 'features', 'register', 'ui.html')));
    const scope = { macro: true, features: new Set(), submodules: [] };
    await render.renderAll({ outDir: out, state: fixtureState(), scope });
    assert.ok(
      fs.existsSync(path.join(out, 'index.html')),
      'scoped render keeps the requested macro page',
    );
    assert.equal(
      fs.existsSync(path.join(out, 'features', 'legacy', 'index.html')),
      false,
      'stale overlay-only html is removed',
    );
    assert.equal(
      fs.existsSync(path.join(out, 'features', 'register', 'ui.html')),
      false,
      'pages outside the current scope are removed',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('measureSubmodule expands the box for CJK role text without truncating or overflow', () => {
  const asciiShort = measureSubmodule({
    slug: 'svc',
    kind: 'service',
    role: 'tiny',
  });
  const cjkRole =
    '從 RPC 取得多帳戶並批次允許清單、價格驅動篩選與分數加權，輸出最終允許名單';
  const cjk = measureSubmodule({
    slug: 'discovery-filters',
    kind: 'pure-fn',
    role: cjkRole,
  });

  // Box auto-expands beyond the previous Latin-tuned 360px cap to fit
  // the wider CJK glyphs (this is the exact failure mode from the
  // user-reported screenshot).
  assert.ok(
    cjk.width > 360,
    `CJK role should widen beyond the old cap, got ${cjk.width}`,
  );
  assert.ok(
    cjk.width <= SUB_WIDTH_MAX,
    'CJK role width stays within SUB_WIDTH_MAX',
  );
  assert.ok(
    cjk.width > asciiShort.width,
    'CJK role widens the box vs an empty role',
  );

  // No silent ellipsis: every glyph of the role survives the wrap.
  const joined = cjk.roleLines.join('');
  for (const ch of cjkRole.replace(/\s+/g, '')) {
    assert.ok(joined.includes(ch), `CJK role must keep character ${ch}`);
  }

  // Every wrapped line visually fits inside the box's inner area —
  // no horizontal overflow at paint time. We replicate the layout's
  // CJK-aware width factors here so the test pins the actual contract.
  function visualLen(s) {
    let w = 0;
    for (const c of s) {
      const cp = c.codePointAt(0);
      const wide =
        (cp >= 0x2e80 && cp <= 0x9fff) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0x3000 && cp <= 0x303f);
      if (wide) w += 11.5;
      else if (c === ' ') w += 11.5 * 0.3;
      else w += 11.5 * 0.55;
    }
    return w;
  }
  const innerW = cjk.width - 32; // SUB_SIDE_PAD * 2
  for (const line of cjk.roleLines) {
    assert.ok(
      visualLen(line) <= innerW + 1,
      `wrapped line "${line}" (${visualLen(line).toFixed(1)}px) overflows inner width ${innerW}px`,
    );
  }
});

test('measureEdgeLabel wraps long CJK labels and reports honest box dimensions', () => {
  const shortLabel = measureEdgeLabel('POST /register');
  assert.deepEqual(shortLabel.lines, ['POST /register']);
  assert.equal(shortLabel.text, 'POST /register');

  const longCJK =
    '透過共享 RpcClient 讀取鏈上帳戶資料 (getMultipleAccounts 批次請求)';
  const wrapped = measureEdgeLabel(longCJK);
  assert.ok(
    wrapped.lines.length >= 2,
    `long CJK label should wrap, got ${wrapped.lines.length} line(s)`,
  );
  assert.ok(
    wrapped.height > shortLabel.height,
    'multi-line label reports taller box so elkjs reserves space',
  );
  assert.equal(
    wrapped.text,
    wrapped.lines.join('\n'),
    'wrapped text stores newline-separated lines',
  );
  // No content lost across the wrap (whitespace may be redistributed).
  const joined = wrapped.lines.join('').replace(/\s+/g, '');
  const expected = longCJK.replace(/\s+/g, '');
  assert.equal(joined, expected, 'every glyph survives the wrap');
});

test('renderMacroSvg paints multi-line edge labels as <tspan> lines centered on the same anchor', async () => {
  const out = mkTmp();
  try {
    const state = fixtureState();
    state.edges = [
      {
        id: 'cross',
        from: { feature: 'invite', submodule: 'svc' },
        to: { feature: 'register', submodule: 'api' },
        kind: 'data-row',
        label:
          '透過共享 RpcClient 讀取鏈上帳戶資料 (getMultipleAccounts 批次請求)',
      },
    ];
    await render.renderAll({ outDir: out, state });
    const macro = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const labelBlock = macro.match(
      /<text class="m-edge__label"[\s\S]*?<\/text>/,
    );
    assert.ok(labelBlock, 'edge label text element exists');
    const tspans = labelBlock[0].match(/<tspan /g) || [];
    assert.ok(
      tspans.length >= 2,
      `long label should render as multiple tspans, got ${tspans.length}`,
    );
    // All tspans share the same x-anchor so multi-line labels stay centered.
    const xs = [...labelBlock[0].matchAll(/<tspan x="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.ok(
      xs.length >= 2 && xs.every((x) => x === xs[0]),
      'every tspan uses the same x anchor',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('shipped architecture.css gives edge labels a dark halo so they stay legible over arrows', () => {
  const css = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'skills',
      'init-project-html',
      'lib',
      'atlas',
      'assets',
      'architecture.css',
    ),
    'utf8',
  );
  const rule = css.match(/\.m-edge__label\b[^{]*\{[^}]*\}/);
  assert.ok(rule, '.m-edge__label rule exists');
  assert.match(rule[0], /paint-order:\s*stroke/);
  assert.match(rule[0], /stroke:\s*var\(--ink\)/);
});

test('buildGraph packs isolated leaf clusters with rectpacking and keeps connected clusters layered', () => {
  const state = {
    meta: {},
    actors: [],
    features: [
      // Has internal edge → must stay layered.
      {
        slug: 'pipeline',
        title: 'Pipeline',
        submodules: [
          { slug: 'a', kind: 'service', role: '' },
          { slug: 'b', kind: 'service', role: '' },
        ],
        edges: [{ id: 'p1', from: 'a', to: 'b', kind: 'call', label: 'next' }],
      },
      // Cross-edge endpoint → must stay layered (rectpacking would crash elk).
      {
        slug: 'sink',
        title: 'Sink',
        submodules: [{ slug: 'in', kind: 'service', role: '' }],
        edges: [],
      },
      // Truly isolated, many sub-modules → rectpacking.
      {
        slug: 'catalog',
        title: 'Catalog',
        submodules: Array.from({ length: 10 }, (_, i) => ({
          slug: `m${i + 1}`,
          kind: 'service',
          role: '',
        })),
        edges: [],
      },
    ],
    edges: [
      {
        id: 'x',
        from: { feature: 'pipeline', submodule: 'b' },
        to: { feature: 'sink', submodule: 'in' },
        kind: 'call',
      },
    ],
  };
  const g = buildGraph(state);
  const byId = new Map(g.children.map((c) => [c.id, c]));
  assert.equal(
    byId.get('feature::pipeline').layoutOptions['elk.algorithm'],
    'layered',
    'cluster with internal edge stays layered',
  );
  assert.equal(
    byId.get('feature::sink').layoutOptions['elk.algorithm'],
    'layered',
    'cluster used by cross-feature edge stays layered (hierarchy safety)',
  );
  assert.equal(
    byId.get('feature::catalog').layoutOptions['elk.algorithm'],
    'rectpacking',
    'isolated leaf cluster switches to grid packing',
  );
});

test('rectpacking a 10-sub-module isolated cluster yields a near-square block, not a tall column', async () => {
  const state = {
    meta: {},
    actors: [],
    features: [
      {
        slug: 'catalog',
        title: 'Catalog',
        submodules: Array.from({ length: 10 }, (_, i) => ({
          slug: `m${i + 1}`,
          kind: 'service',
          role: '',
        })),
        edges: [],
      },
    ],
    edges: [],
  };
  const layout = await layoutMacro(state);
  const feat = layout.features.find((f) => f.slug === 'catalog');
  // A pure vertical stack of 10 SUB_HEIGHT_MIN-tall boxes would be
  // ~1000px+ tall and barely 240px wide. rectpacking with aspectRatio
  // 1.4 should land closer to 2-3× wider-than-tall, definitely not a
  // 1:4+ tall column.
  const ratio = feat.width / feat.height;
  assert.ok(
    ratio > 1,
    `rectpacked cluster should be wider than tall, got w/h = ${feat.width.toFixed(0)}/${feat.height.toFixed(0)} = ${ratio.toFixed(2)}`,
  );
  assert.ok(
    feat.height < 600,
    `rectpacked cluster height should stay compact, got ${feat.height.toFixed(0)}`,
  );
});

test('renderMacroSvg tags cross-feature edges with m-edge--cross so CSS can dim them', async () => {
  const out = mkTmp();
  try {
    await render.renderAll({ outDir: out, state: fixtureState() });
    const macro = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(
      macro,
      /<g class="m-edge m-edge--data-row m-edge--cross"/,
      'root-level edge gets the cross class',
    );
    // The intra-feature edge (e1: ui→api inside register) must NOT
    // be tagged as cross — it is part of the feature's own flow.
    assert.ok(
      /<g class="m-edge m-edge--call"\s+data-edge="e1"/.test(macro),
      'intra-feature edge stays uncrossed',
    );
    assert.ok(
      !/m-edge--call m-edge--cross.*data-edge="e1"/.test(macro),
      'intra-feature edge must not get the cross class',
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('shipped architecture.css dims cross-feature edges and restores them on hover', () => {
  const css = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'skills',
      'init-project-html',
      'lib',
      'atlas',
      'assets',
      'architecture.css',
    ),
    'utf8',
  );
  assert.match(
    css,
    /\.m-edge--cross path\s*\{[^}]*opacity:\s*0?\.\d+/,
    'cross edges are dimmed by default',
  );
  assert.match(
    css,
    /\.m-edge--cross:hover path\b[^{]*\{[^}]*opacity:\s*1/,
    'hover restores full strength',
  );
});

test('renderAll escapes user-supplied strings to prevent HTML injection', async () => {
  const out = mkTmp();
  try {
    const state = fixtureState();
    state.meta.title = "<script>alert('xss')</script>";
    state.features[0].submodules[0].role = '<img src=x onerror=alert(1)>';
    await render.renderAll({ outDir: out, state });
    const macro = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(macro.includes('&lt;script&gt;'));
    assert.ok(!macro.includes('<script>alert'));
    const sub = fs.readFileSync(
      path.join(out, 'features', 'register', 'ui.html'),
      'utf8',
    );
    assert.ok(sub.includes('&lt;img'));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
