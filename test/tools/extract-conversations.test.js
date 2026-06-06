import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function createMemoryStream() {
  let data = '';
  return {
    write(chunk) { data += chunk; return true; },
    toString() { return data; },
  };
}

test('extract-conversations uses CODEX_HOME env var when set (env var priority)', async (t) => {
  const origCodexHome = process.env.CODEX_HOME;
  const testHome = '/tmp/test-codex-home';
  process.env.CODEX_HOME = testHome;

  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  let capturedPath;
  t.mock.method(fs, 'existsSync', (p) => {
    if (capturedPath === undefined) capturedPath = p;
    return false;
  });

  try {
    const mod = await import('@laitszkin/tool-extract-conversations');
    const code = await mod.tool.handler(
      ['--hours', '24'],
      { stdout, stderr },
    );

    assert.strictEqual(code, 0);
    assert.ok(
      capturedPath !== undefined,
      'expected fs.existsSync to be called at least once',
    );
    assert.ok(
      capturedPath.startsWith(testHome),
      `expected sessionsDir to start with ${testHome}, got ${capturedPath}`,
    );
  } finally {
    if (origCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = origCodexHome;
    }
  }
});

test('extract-conversations falls back to adapter.homeDir() when CODEX_HOME is unset', async (t) => {
  const origCodexHome = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;

  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  let capturedPath;
  t.mock.method(fs, 'existsSync', (p) => {
    if (capturedPath === undefined) capturedPath = p;
    return false;
  });

  try {
    const mod = await import('@laitszkin/tool-extract-conversations');
    const code = await mod.tool.handler(
      ['--hours', '24'],
      { stdout, stderr },
    );

    assert.strictEqual(code, 0);
    assert.ok(
      capturedPath !== undefined,
      'expected fs.existsSync to be called at least once',
    );
    // Expected: <HOME>/.codex/sessions — the adapter.homeDir() fallback
    const expectedSuffix = path.join('.codex', 'sessions');
    assert.ok(
      capturedPath.endsWith(expectedSuffix),
      `expected sessionsDir to end with ${expectedSuffix}, got ${capturedPath}`,
    );
  } finally {
    if (origCodexHome !== undefined) {
      process.env.CODEX_HOME = origCodexHome;
    }
  }
});
