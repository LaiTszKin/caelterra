import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  parseArguments,
  HelpTextBuilder,
  registerAllTools,
} from '@laitszkin/cli';
import { listTools } from '@laitszkin/tool-registry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const atlasCli = require('../skills/init-project-html/lib/atlas/cli.js');

function makeIo() {
  let stdoutBuf = '';
  let stderrBuf = '';
  return {
    stdout: {
      write: (s) => {
        stdoutBuf += s;
      },
    },
    stderr: {
      write: (s) => {
        stderrBuf += s;
      },
    },
    get stdout_text() {
      return stdoutBuf;
    },
    get stderr_text() {
      return stderrBuf;
    },
  };
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aplt-arch-'));
  const atlasDir = path.join(root, 'resources', 'project-architecture');
  fs.mkdirSync(path.join(atlasDir, 'features', 'invite-code-registration'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(atlasDir, 'assets'), { recursive: true });
  fs.writeFileSync(
    path.join(atlasDir, 'index.html'),
    '<html><body>atlas</body></html>',
  );
  fs.writeFileSync(
    path.join(atlasDir, 'features', 'invite-code-registration', 'index.html'),
    '<html><body>feature</body></html>',
  );
  fs.writeFileSync(
    path.join(
      atlasDir,
      'features',
      'invite-code-registration',
      'registration-service.html',
    ),
    '<html><body>service before</body></html>',
  );
  fs.writeFileSync(
    path.join(
      atlasDir,
      'features',
      'invite-code-registration',
      'legacy-page.html',
    ),
    '<html><body>legacy</body></html>',
  );
  fs.writeFileSync(path.join(atlasDir, 'assets', 'architecture.css'), 'body{}');
  return root;
}

function makeSpec(root, specPath, files) {
  const specDir = path.join(root, specPath);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.md'), '# spec\n');
  const diffDir = path.join(specDir, 'architecture_diff');
  fs.mkdirSync(path.join(diffDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(diffDir, 'assets', 'architecture.css'), 'body{}');
  for (const [rel, contents] of Object.entries(files.afters || {})) {
    const full = path.join(diffDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  if (files.removed && files.removed.length > 0) {
    fs.writeFileSync(
      path.join(diffDir, '_removed.txt'),
      files.removed.join('\n') + '\n',
    );
  }
  return diffDir;
}

test('architecture tool is registered in tool-runner', async () => {
  await registerAllTools();
  const tools = listTools();
  const tool = tools.find((entry) => entry.name === 'architecture');
  assert.ok(tool, 'architecture tool should be registered');
  assert.equal(tool.skill, 'init-project-html');
  assert.ok(
    tool.handler || tool.script,
    'architecture must have a script or handler',
  );
});

test('parseArguments routes architecture invocation through tool dispatch', () => {
  const parsed = parseArguments(['architecture', 'diff', '--no-open']);
  assert.equal(parsed.command, 'tool');
  assert.equal(parsed.toolName, 'architecture');
  assert.deepEqual(parsed.toolArgs, ['diff', '--no-open']);
});

test('HelpTextBuilder.overview surfaces architecture examples', async () => {
  await registerAllTools();
  const text = new HelpTextBuilder({
    version: '0.0.0',
    colorEnabled: false,
  }).overview();
  assert.match(text, /apltk architecture/);
  assert.match(text, /Result:/);
});

test('atlas CLI redirects hidden verb action help to public unified help', async () => {
  // FIX-06: hidden verbs such as edge/feature/submodule with action subverbs
  // (add/set/remove) redirect to public unified help instead of exposing fine-grained syntax.
  const hiddenVerbCases = [
    ['edge', 'add'],
    ['feature', 'add'],
    ['submodule', 'add'],
  ];

  for (const [verb, action] of hiddenVerbCases) {
    const io = makeIo();
    const code = await atlasCli.dispatch([verb, action, '--help'], io);
    assert.equal(code, 0, `exit code for ${verb} ${action} --help`);

    // Must NOT expose hidden fine-grained syntax
    assert.doesNotMatch(
      io.stdout_text,
      new RegExp(`apltk architecture ${verb} ${action}`),
      `should not contain fine-grained syntax for ${verb} ${action}`,
    );

    // Must include public unified help (apltk architecture add)
    assert.match(
      io.stdout_text,
      /apltk architecture add/,
      `should contain public unified add help for ${verb} ${action}`,
    );

    // Must include key public usage patterns from the unified help
    assert.match(
      io.stdout_text,
      /Usage:/,
      `should include Usage section for ${verb} ${action}`,
    );
  }
});

test('REGTEST-48: cli-help.js source does not contain hidden fine-grained command strings', () => {
  const helpPath = path.join(
    __dirname,
    '..',
    'skills',
    'init-project-html',
    'lib',
    'atlas',
    'cli-help.js',
  );
  const source = fs.readFileSync(helpPath, 'utf8');

  // Hidden verb-action usage strings must not appear anywhere in source
  const hiddenCommands = [
    'apltk architecture feature add',
    'apltk architecture submodule add',
    'apltk architecture edge add',
  ];

  for (const cmd of hiddenCommands) {
    assert.ok(
      !source.includes(cmd),
      `${path.relative(process.cwd(), helpPath)} must not contain hidden command string "${cmd}" (should use unified public syntax)`,
    );
  }

  // Catch-all: no hidden verb+action pattern should remain
  const hiddenVerbActionRe =
    /apltk architecture (?:feature|submodule|function|variable|dataflow|error|edge|meta|actor) (?:add|set|remove|reorder)/;
  assert.doesNotMatch(
    source,
    hiddenVerbActionRe,
    `${path.relative(process.cwd(), helpPath)} must not contain any hidden verb+action usage strings`,
  );
});

test('REGTEST-42: active docs do not expose fine-grained architecture verbs', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const filesToScan = [
    path.join(projectRoot, 'skills', 'design', 'references', 'architecture.md'),
    path.join(projectRoot, 'skills', 'update-project-html', 'SKILL.md'),
    path.join(
      projectRoot,
      'skills',
      'init-project-html',
      'references',
      'TEMPLATE_SPEC.md',
    ),
  ];
  const re =
    /apltk architecture (feature|submodule|function|variable|dataflow|error|edge|meta|actor) (add|set|remove|reorder)/;
  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.doesNotMatch(
      content,
      re,
      `${filePath} should not expose fine-grained architecture verbs`,
    );
  }
});

test('open subcommand prints atlas path through atlas CLI', async () => {
  const root = makeFixture();
  try {
    const io = makeIo();
    const code = await atlasCli.dispatch(
      ['open', '--project', root, '--no-open'],
      io,
    );
    assert.equal(code, 0);
    assert.match(
      io.stdout_text,
      /resources[\\/]project-architecture[\\/]index\.html/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('open subcommand bootstraps atlas when resources tree is empty', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aplt-empty-'));
  try {
    const io = makeIo();
    const code = await atlasCli.dispatch(
      ['open', '--project', root, '--no-open'],
      io,
    );
    assert.equal(code, 0);
    assert.match(
      io.stdout_text,
      /resources[\\/]project-architecture[\\/]index\.html/,
    );
    assert.ok(
      fs.existsSync(
        path.join(root, 'resources', 'project-architecture', 'index.html'),
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff classifies modified, added, removed using path alignment', async () => {
  const root = makeFixture();
  try {
    makeSpec(root, 'docs/plans/2026-05-11/invite-rotation', {
      afters: {
        'features/invite-code-registration/registration-service.html':
          '<html><body>service after</body></html>',
        'features/invite-code-registration/new-page.html':
          '<html><body>new</body></html>',
      },
      removed: ['features/invite-code-registration/legacy-page.html'],
    });

    const changes = await atlasCli.collectDiffChanges({ projectRoot: root });
    const byRel = Object.fromEntries(changes.map((c) => [c.rel, c]));
    assert.equal(
      byRel['features/invite-code-registration/registration-service.html'].kind,
      'modified',
    );
    assert.equal(
      byRel['features/invite-code-registration/new-page.html'].kind,
      'added',
    );
    assert.equal(
      byRel['features/invite-code-registration/legacy-page.html'].kind,
      'removed',
    );

    const modified =
      byRel['features/invite-code-registration/registration-service.html'];
    assert.ok(modified.beforePath && modified.afterPath);
    const added = byRel['features/invite-code-registration/new-page.html'];
    assert.equal(added.beforePath, null);
    assert.ok(added.afterPath);
    const removed = byRel['features/invite-code-registration/legacy-page.html'];
    assert.ok(removed.beforePath);
    assert.equal(removed.afterPath, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff drops removed entries whose before file is absent', async () => {
  const root = makeFixture();
  try {
    makeSpec(root, 'docs/plans/2026-05-11/ghost', {
      afters: {},
      removed: ['features/invite-code-registration/does-not-exist.html'],
    });
    const changes = await atlasCli.collectDiffChanges({ projectRoot: root });
    assert.equal(changes.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff handles batch specs by reading each member architecture_diff', async () => {
  const root = makeFixture();
  try {
    makeSpec(root, 'docs/plans/2026-05-11/batch/member-a', {
      afters: {
        'features/invite-code-registration/registration-service.html': '<x/>',
      },
    });
    makeSpec(root, 'docs/plans/2026-05-11/batch/member-b', {
      afters: { 'features/invite-code-registration/new-feature.html': '<y/>' },
    });
    const changes = await atlasCli.collectDiffChanges({ projectRoot: root });
    const specs = new Set(changes.map((c) => c.spec));
    assert.ok([...specs].some((s) => s.endsWith('member-a')));
    assert.ok([...specs].some((s) => s.endsWith('member-b')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff writes viewer HTML with relative iframe paths', async () => {
  const root = makeFixture();
  try {
    makeSpec(root, 'docs/plans/2026-05-11/invite-rotation', {
      afters: {
        'features/invite-code-registration/registration-service.html':
          '<html><body>service after</body></html>',
      },
    });

    const io = makeIo();
    const code = await atlasCli.dispatch(
      ['diff', '--project', root, '--no-open'],
      io,
    );
    assert.equal(code, 0);
    const indexPath = path.join(
      root,
      '.apollo-toolkit',
      'architecture-diff',
      'index.html',
    );
    assert.ok(fs.existsSync(indexPath));
    const html = fs.readFileSync(indexPath, 'utf8');
    assert.match(html, /architecture diff/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff renders an empty-state viewer when no architecture_diff dirs exist', async () => {
  const root = makeFixture();
  try {
    const io = makeIo();
    const code = await atlasCli.dispatch(
      ['diff', '--project', root, '--no-open'],
      io,
    );
    assert.equal(code, 0);
    const html = fs.readFileSync(
      path.join(root, '.apollo-toolkit', 'architecture-diff', 'index.html'),
      'utf8',
    );
    assert.match(html, /No architecture diffs found/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
