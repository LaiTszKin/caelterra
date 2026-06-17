import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
