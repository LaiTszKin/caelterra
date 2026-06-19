import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(
  __dirname,
  '..',
  '.github',
  'workflows',
  'publish-npm.yml',
);

test('REGTEST-03: publish workflow runs lint and format checks before publish', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf-8');

  const lintIndex = workflow.indexOf('pnpm lint --cache');
  const formatIndex = workflow.indexOf('pnpm format:check');
  const publishIndex = workflow.indexOf('pnpm publish --access public');

  assert.notStrictEqual(lintIndex, -1, 'Missing pnpm lint --cache');
  assert.notStrictEqual(formatIndex, -1, 'Missing pnpm format:check');
  assert.notStrictEqual(
    publishIndex,
    -1,
    'Missing pnpm publish --access public',
  );
  assert.ok(lintIndex < publishIndex, 'Lint check must run before publish');
  assert.ok(formatIndex < publishIndex, 'Format check must run before publish');
});

const projectRoot = path.resolve(__dirname, '..');

test('REGTEST-04: pnpm config does not use broad shameful hoisting', () => {
  const workspaceConfig = fs.readFileSync(
    path.join(projectRoot, 'pnpm-workspace.yaml'),
    'utf-8',
  );
  assert.ok(
    !workspaceConfig.includes('shamefullyHoist'),
    'pnpm-workspace.yaml must not contain shamefullyHoist',
  );
  assert.ok(
    !workspaceConfig.includes('shamefully-hoist'),
    'pnpm-workspace.yaml must not contain shamefully-hoist',
  );

  const npmrcPath = path.join(projectRoot, '.npmrc');
  if (fs.existsSync(npmrcPath)) {
    const npmrc = fs.readFileSync(npmrcPath, 'utf-8');
    assert.ok(
      !npmrc.includes('shamefully-hoist'),
      '.npmrc must not contain shamefully-hoist',
    );
  }
});

test('REGTEST-05: lint-staged only targets specified staged file types', () => {
  const lintStaged = JSON.parse(
    fs.readFileSync(path.join(projectRoot, '.lintstagedrc.json'), 'utf-8'),
  );
  const keys = Object.keys(lintStaged);

  assert.ok(keys.includes('*.{ts,mjs,js,cjs}'));
  assert.ok(keys.includes('*.json'));
  assert.ok(keys.includes('*.{yaml,yml}'));
  assert.ok(!keys.some((k) => k.includes('.md')));
  assert.ok(!keys.some((k) => k.includes('md')));
});

test('REGTEST-01: root scripts use pnpm after package manager migration', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  );

  assert.equal(pkg.packageManager, 'pnpm@11.6.0');
  assert.equal(pkg.scripts.prepublishOnly, 'pnpm run build');
  assert.equal(pkg.scripts['test:coverage'], 'COVERAGE=true pnpm test');
  assert.ok(!/\bnpm\b/.test(pkg.scripts.prepublishOnly));
  assert.ok(!/\bnpm\b/.test(pkg.scripts['test:coverage']));
});

test('REGTEST-02: optimizer validation runs tests through pnpm', () => {
  const optimizer = fs.readFileSync(
    path.join(projectRoot, 'scripts', 'optimize.mjs'),
    'utf-8',
  );

  assert.ok(
    optimizer.includes("execSync('pnpm test'"),
    'optimizer validation must run pnpm test',
  );
  assert.ok(
    !optimizer.includes("execSync('npm test'"),
    'optimizer validation must not run npm test',
  );
});

test('REGTEST-06: root package.json has all internal workspace devDependencies', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  );

  const requiredWorkspaceDevDeps = [
    '@laitszkin/tui',
    '@laitszkin/tool-registry',
    '@laitszkin/tool-utils',
    '@laitszkin/tool-architecture',
    '@laitszkin/tool-codegraph',
    '@laitszkin/tool-create-review-report',
    '@laitszkin/tool-create-specs',
    '@laitszkin/tool-find-github-issues',
    '@laitszkin/tool-open-github-issue',
    '@laitszkin/tool-read-github-issue',
    '@laitszkin/tool-review-threads',
    '@laitszkin/tool-validate-openai-agent-config',
    '@laitszkin/tool-validate-skill-frontmatter',
  ];

  for (const dep of requiredWorkspaceDevDeps) {
    assert.ok(
      Object.hasOwn(pkg.devDependencies, dep),
      `Missing workspace devDependency: ${dep}`,
    );
    assert.equal(
      pkg.devDependencies[dep],
      'workspace:*',
      `devDependency ${dep} must be "workspace:*", got "${pkg.devDependencies[dep]}"`,
    );
  }
});

test('REGTEST-07: pre-commit hook runs lint-staged directly without npm or npx', () => {
  const hook = fs
    .readFileSync(path.join(projectRoot, '.husky', 'pre-commit'), 'utf-8')
    .trim();

  assert.equal(
    hook,
    'lint-staged',
    'pre-commit hook must run lint-staged directly',
  );
  assert.ok(!hook.includes('npx'), 'pre-commit hook must not invoke npx');
  assert.ok(
    !/\bnpm\s/.test(hook),
    'pre-commit hook must not invoke standalone npm',
  );
});

test('REGTEST-08: pnpm migration has no npm lockfile', () => {
  const pnpmLockPath = path.join(projectRoot, 'pnpm-lock.yaml');
  const npmLockPath = path.join(projectRoot, 'package-lock.json');

  assert.ok(
    fs.existsSync(pnpmLockPath),
    'pnpm-lock.yaml must exist after migration to pnpm',
  );
  assert.ok(
    !fs.existsSync(npmLockPath),
    'package-lock.json must not exist on disk after migration to pnpm',
  );

  const result = spawnSync('git', ['ls-files', 'package-lock.json'], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });

  assert.strictEqual(
    result.status,
    0,
    'git ls-files command exited with an error',
  );
  assert.strictEqual(
    result.stdout.trim(),
    '',
    'package-lock.json must not be tracked by git',
  );
});

test('REGTEST-09: root package declares CLI workspace runtime dependency', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  );
  const binSource = fs.readFileSync(
    path.join(projectRoot, 'bin', 'apollo-toolkit.ts'),
    'utf-8',
  );

  assert.ok(
    binSource.includes("from '@laitszkin/cli'"),
    'bin/apollo-toolkit.ts must import from @laitszkin/cli',
  );
  assert.equal(
    pkg.dependencies['@laitszkin/cli'],
    'workspace:*',
    '@laitszkin/cli must be a workspace:* runtime dependency',
  );
  assert.ok(
    !Object.hasOwn(pkg.devDependencies, '@laitszkin/cli'),
    '@laitszkin/cli must not appear in devDependencies',
  );
  assert.equal(
    pkg.bin['apollo-toolkit'],
    'dist/bin/apollo-toolkit.js',
    'apollo-toolkit bin entry must point to dist/bin/apollo-toolkit.js',
  );
  assert.equal(
    pkg.bin.apltk,
    'dist/bin/apollo-toolkit.js',
    'apltk bin entry must point to dist/bin/apollo-toolkit.js',
  );
});
