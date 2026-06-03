import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, checkForPackageUpdate } from '@laitszkin/cli';

// ----------------------------------------------------------------
// compareVersions
// ----------------------------------------------------------------

test('compareVersions returns 0 for equal versions', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
});

test('compareVersions returns positive when left is greater', () => {
  assert.ok(compareVersions('2.0.0', '1.0.0') > 0);
});

test('compareVersions returns negative when left is smaller', () => {
  assert.ok(compareVersions('1.0.0', '2.0.0') < 0);
});

test('compareVersions handles major version differences', () => {
  assert.ok(compareVersions('3.0.0', '2.9.9') > 0);
  assert.ok(compareVersions('2.9.9', '3.0.0') < 0);
});

test('compareVersions handles patch version differences', () => {
  assert.ok(compareVersions('1.2.4', '1.2.3') > 0);
  assert.ok(compareVersions('1.2.3', '1.2.4') < 0);
});

test('compareVersions handles pre-release versions', () => {
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0', '1.0.0-alpha') > 0);
});

test('compareVersions handles v prefix', () => {
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2.3', 'v1.2.3'), 0);
});

test('compareVersions handles missing patch version', () => {
  assert.ok(compareVersions('1.2', '1.2.0') === 0);
  assert.ok(compareVersions('1.2.1', '1.2') > 0);
});

test('compareVersions handles empty and null inputs', () => {
  assert.equal(compareVersions('', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0', ''), 1);
  assert.equal(compareVersions(null, '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0', null), 1);
  assert.equal(compareVersions('', ''), 0);
});

test('compareVersions handles pre-release comparison order', () => {
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0-beta') < 0);
  assert.ok(compareVersions('1.0.0-beta', '1.0.0-alpha') > 0);
});

// ----------------------------------------------------------------
// checkForPackageUpdate — skipped (non-interactive)
// ----------------------------------------------------------------

test('checkForPackageUpdate returns unchecked when not interactive', async () => {
  const result = await checkForPackageUpdate({
    packageName: '@laitszkin/apollo-toolkit',
    currentVersion: '5.0.0',
    stdin: { isTTY: false },
    stdout: { isTTY: false },
    stderr: { write() {} },
    env: {},
  });
  assert.equal(result.checked, false);
  assert.equal(result.updated, false);
});

test('checkForPackageUpdate returns unchecked with skip env var', async () => {
  const result = await checkForPackageUpdate({
    packageName: '@laitszkin/apollo-toolkit',
    currentVersion: '5.0.0',
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    stderr: { write() {} },
    env: { APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1' },
  });
  assert.equal(result.checked, false);
  assert.equal(result.updated, false);
});

test('checkForPackageUpdate handles exec errors gracefully', async () => {
  const stderr = { write() {} };
  const result = await checkForPackageUpdate({
    packageName: '@laitszkin/apollo-toolkit',
    currentVersion: '5.0.0',
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    stderr,
    env: {},
    exec: async () => { throw new Error('network error'); },
  });
  assert.equal(result.checked, false);
  assert.equal(result.updated, false);
  assert.ok(result.error);
});

test('execCommand executes a simple command successfully', async () => {
  const { execCommand } = await import('@laitszkin/cli');
  const result = await execCommand('node', ['-e', 'process.stdout.write("hello")']);
  assert.equal(result.stdout.trim(), 'hello');
  assert.equal(result.stderr.trim(), '');
});

test('execCommand handles command failure', async () => {
  const { execCommand } = await import('@laitszkin/cli');
  await assert.rejects(
    () => execCommand('node', ['-e', 'process.stderr.write("err"); process.exit(1)']),
    /err/,
  );
});
