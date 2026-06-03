import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { createPlatformAdapter, WindowsAdapter, PosixAdapter } from '../../packages/tool-utils/dist/platform-adapter.js';

/**
 * Helper to temporarily override process.platform.
 * Restores the original value after callback completes.
 * @param {'win32' | 'darwin' | 'linux'} platform
 * @param {() => void} fn
 */
function withPlatform(platform, fn) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    Object.defineProperty(process, 'platform', { value: platform });
    fn();
  } finally {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  }
}

// ----------------------------------------------------------------
// createPlatformAdapter() factory
// ----------------------------------------------------------------

test('createPlatformAdapter() returns WindowsAdapter on win32', () => {
  withPlatform('win32', () => {
    const adapter = createPlatformAdapter();
    assert.ok(adapter instanceof WindowsAdapter);
  });
});

test('createPlatformAdapter() returns PosixAdapter on non-win32 (darwin)', () => {
  withPlatform('darwin', () => {
    const adapter = createPlatformAdapter();
    assert.ok(adapter instanceof PosixAdapter);
  });
});

test('createPlatformAdapter() returns PosixAdapter on non-win32 (linux)', () => {
  withPlatform('linux', () => {
    const adapter = createPlatformAdapter();
    assert.ok(adapter instanceof PosixAdapter);
  });
});

// ----------------------------------------------------------------
// WindowsAdapter
// ----------------------------------------------------------------

test('WindowsAdapter.symlinkType() returns "junction"', () => {
  const adapter = new WindowsAdapter();
  assert.equal(adapter.symlinkType(), 'junction');
});

test('WindowsAdapter.homeDir() checks USERPROFILE first', () => {
  const adapter = new WindowsAdapter();
  const origEnv = { ...process.env };

  try {
    process.env.USERPROFILE = '/fake/userprofile';
    process.env.HOME = '/fake/home';
    assert.equal(adapter.homeDir(), '/fake/userprofile');
  } finally {
    Object.assign(process.env, origEnv);
  }
});

test('WindowsAdapter.homeDir() falls back to HOME when USERPROFILE is unset', () => {
  const adapter = new WindowsAdapter();
  const origEnv = { ...process.env };

  try {
    delete process.env.USERPROFILE;
    process.env.HOME = '/fake/home';
    assert.equal(adapter.homeDir(), '/fake/home');
  } finally {
    Object.assign(process.env, origEnv);
  }
});

test('WindowsAdapter.homeDir() falls back to os.homedir() when both env vars are unset', () => {
  const adapter = new WindowsAdapter();
  const origEnv = { ...process.env };

  try {
    delete process.env.USERPROFILE;
    delete process.env.HOME;
    assert.equal(adapter.homeDir(), os.homedir());
  } finally {
    Object.assign(process.env, origEnv);
  }
});

test('WindowsAdapter.resolveCommand() appends .cmd for npm', () => {
  const adapter = new WindowsAdapter();
  assert.equal(adapter.resolveCommand('npm'), 'npm.cmd');
});

test('WindowsAdapter.resolveCommand() appends .cmd for node', () => {
  const adapter = new WindowsAdapter();
  assert.equal(adapter.resolveCommand('node'), 'node.cmd');
});

test('WindowsAdapter.resolveCommand() returns other commands unchanged', () => {
  const adapter = new WindowsAdapter();
  assert.equal(adapter.resolveCommand('git'), 'git');
  assert.equal(adapter.resolveCommand('npx'), 'npx');
  assert.equal(adapter.resolveCommand(''), '');
});

test('WindowsAdapter.EOL returns os.EOL', () => {
  const adapter = new WindowsAdapter();
  assert.equal(adapter.EOL, os.EOL);
});

test('WindowsAdapter.normalizePath() normalizes path separators', () => {
  const adapter = new WindowsAdapter();
  // On Windows, path.normalize converts forward slashes to backslashes.
  // The test runs on POSIX so path.normalize just cleans up slashes.
  assert.equal(adapter.normalizePath('foo//bar'), 'foo/bar');
  assert.equal(adapter.normalizePath('./foo/bar'), 'foo/bar');
});

// ----------------------------------------------------------------
// PosixAdapter
// ----------------------------------------------------------------

test('PosixAdapter.symlinkType() returns "dir"', () => {
  const adapter = new PosixAdapter();
  assert.equal(adapter.symlinkType(), 'dir');
});

test('PosixAdapter.homeDir() checks HOME first', () => {
  const adapter = new PosixAdapter();
  const origEnv = { ...process.env };

  try {
    process.env.HOME = '/fake/home';
    process.env.USERPROFILE = '/fake/userprofile';
    assert.equal(adapter.homeDir(), '/fake/home');
  } finally {
    Object.assign(process.env, origEnv);
  }
});

test('PosixAdapter.homeDir() falls back to USERPROFILE when HOME is unset', () => {
  const adapter = new PosixAdapter();
  const origEnv = { ...process.env };

  try {
    delete process.env.HOME;
    process.env.USERPROFILE = '/fake/userprofile';
    assert.equal(adapter.homeDir(), '/fake/userprofile');
  } finally {
    Object.assign(process.env, origEnv);
  }
});

test('PosixAdapter.homeDir() falls back to os.homedir() when both env vars are unset', () => {
  const adapter = new PosixAdapter();
  const origEnv = { ...process.env };

  try {
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    assert.equal(adapter.homeDir(), os.homedir());
  } finally {
    Object.assign(process.env, origEnv);
  }
});

test('PosixAdapter.resolveCommand() returns command unchanged', () => {
  const adapter = new PosixAdapter();
  assert.equal(adapter.resolveCommand('npm'), 'npm');
  assert.equal(adapter.resolveCommand('node'), 'node');
  assert.equal(adapter.resolveCommand('git'), 'git');
  assert.equal(adapter.resolveCommand(''), '');
});

test('PosixAdapter.EOL returns os.EOL', () => {
  const adapter = new PosixAdapter();
  assert.equal(adapter.EOL, os.EOL);
});

test('PosixAdapter.normalizePath() normalizes path separators', () => {
  const adapter = new PosixAdapter();
  assert.equal(adapter.normalizePath('foo//bar'), 'foo/bar');
  assert.equal(adapter.normalizePath('./foo/bar'), 'foo/bar');
});
