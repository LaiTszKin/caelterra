import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {
  createPlatformAdapter,
  WindowsAdapter,
  PosixAdapter,
} from '../../packages/tool-utils/dist/platform-adapter.js';

// ----------------------------------------------------------------
// createPlatformAdapter() factory (singleton)
// ----------------------------------------------------------------

test('createPlatformAdapter() returns the correct adapter for the current platform', () => {
  const adapter = createPlatformAdapter();
  const expected = process.platform === 'win32' ? WindowsAdapter : PosixAdapter;
  assert.ok(adapter instanceof expected);
});

test('createPlatformAdapter() returns the same instance on repeated calls', () => {
  const a = createPlatformAdapter();
  const b = createPlatformAdapter();
  const c = createPlatformAdapter();
  assert.strictEqual(a, b);
  assert.strictEqual(b, c);
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
