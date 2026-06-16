import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  resolveAutoUpdatePaths,
  readAutoUpdateConfig,
  writeAutoUpdateConfig,
  readAutoUpdateStatus,
  writeAutoUpdateStatus,
  withAutoUpdateLock,
  AUTO_UPDATE_CONFIG_FILENAME,
  AUTO_UPDATE_STATUS_FILENAME,
  AUTO_UPDATE_LOCK_FILENAME,
  AUTO_UPDATE_LOG_DIRNAME,
} from '../../packages/cli/dist/auto-update-state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createTempHome() {
  return mkdtempSync(join(tmpdir(), 'auto-update-state-test-'));
}

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('AUTO_UPDATE_CONFIG_FILENAME', () => {
    assert.equal(AUTO_UPDATE_CONFIG_FILENAME, '.apollo-toolkit-auto-update.json');
  });

  it('AUTO_UPDATE_STATUS_FILENAME', () => {
    assert.equal(AUTO_UPDATE_STATUS_FILENAME, '.apollo-toolkit-auto-update-status.json');
  });

  it('AUTO_UPDATE_LOG_DIRNAME', () => {
    assert.equal(AUTO_UPDATE_LOG_DIRNAME, 'logs');
  });

  it('AUTO_UPDATE_LOCK_FILENAME', () => {
    assert.equal(AUTO_UPDATE_LOCK_FILENAME, '.apollo-toolkit-auto-update.lock');
  });
});

// ── resolveAutoUpdatePaths ───────────────────────────────────────────────────

describe('resolveAutoUpdatePaths', () => {
  it('returns all paths derived from toolkitHome', () => {
    const home = '/tmp/test-toolkit-home';
    const paths = resolveAutoUpdatePaths(home);

    assert.equal(paths.config, join(home, AUTO_UPDATE_CONFIG_FILENAME));
    assert.equal(paths.status, join(home, AUTO_UPDATE_STATUS_FILENAME));
    assert.equal(paths.lock, join(home, AUTO_UPDATE_LOCK_FILENAME));
    assert.equal(paths.logDir, join(home, AUTO_UPDATE_LOG_DIRNAME));
    assert.equal(paths.stdoutLog, join(home, AUTO_UPDATE_LOG_DIRNAME, 'stdout.log'));
    assert.equal(paths.stderrLog, join(home, AUTO_UPDATE_LOG_DIRNAME, 'stderr.log'));
  });
});

// ── readAutoUpdateConfig ─────────────────────────────────────────────────────

describe('readAutoUpdateConfig', () => {
  it('returns enabled default when config file is missing', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
    assert.ok(typeof config.updatedAt === 'string', 'updatedAt should be a string');
    assert.ok(config.updatedAt.length > 0, 'updatedAt should not be empty');
  });

  it('returns enabled default when config directory does not exist', async (t) => {
    const home = join(tmpdir(), 'nonexistent-dir-' + Date.now());
    t.after(() => { try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ } });

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
  });

  it('reads back a disabled config', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const original = { enabled: false, updatedAt: new Date().toISOString() };
    await writeAutoUpdateConfig(home, original);

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, false);
    assert.equal(config.updatedAt, original.updatedAt);
  });

  it('reads back an enabled config', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const original = { enabled: true, updatedAt: '2026-06-16T12:00:00.000Z' };
    await writeAutoUpdateConfig(home, original);

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
    assert.equal(config.updatedAt, original.updatedAt);
  });

  it('falls back to enabled when config file contains malformed JSON', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { config: configPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(configPath, '{ invalid json', 'utf8');

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
  });

  it('falls back to enabled when config has non-boolean enabled field', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { config: configPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ enabled: 'yes', updatedAt: new Date().toISOString() }), 'utf8');

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
  });

  it('falls back to enabled when config is missing enabled field', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { config: configPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(configPath, JSON.stringify({ updatedAt: new Date().toISOString() }), 'utf8');

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
  });

  it('falls back to enabled when config file is empty', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { config: configPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(configPath, '', 'utf8');

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
  });
});

// ── writeAutoUpdateConfig (atomic write) ─────────────────────────────────────

describe('writeAutoUpdateConfig', () => {
  it('persists config to disk and overwrites existing file', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const first = { enabled: false, updatedAt: '2026-01-01T00:00:00.000Z' };
    await writeAutoUpdateConfig(home, first);

    const second = { enabled: true, updatedAt: '2026-06-16T00:00:00.000Z' };
    await writeAutoUpdateConfig(home, second);

    const config = await readAutoUpdateConfig(home);
    assert.equal(config.enabled, true);
    assert.equal(config.updatedAt, '2026-06-16T00:00:00.000Z');
  });

  it('creates parent directory if it does not exist', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    // Remove the temp home so we know it doesn't exist
    rmSync(home, { recursive: true, force: true });

    await writeAutoUpdateConfig(home, { enabled: true, updatedAt: new Date().toISOString() });

    const { config: configPath } = resolveAutoUpdatePaths(home);
    assert.ok(existsSync(configPath), 'config file should exist after write');
  });
});

// ── readAutoUpdateStatus ─────────────────────────────────────────────────────

describe('readAutoUpdateStatus', () => {
  it('returns null when status file is missing', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const status = await readAutoUpdateStatus(home);
    assert.equal(status, null);
  });

  it('returns null when status directory does not exist', async (t) => {
    const home = join(tmpdir(), 'nonexistent-status-dir-' + Date.now());
    t.after(() => { try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ } });

    const status = await readAutoUpdateStatus(home);
    assert.equal(status, null);
  });

  it('returns null when status file is malformed JSON', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { status: statusPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(statusPath, 'not valid json', 'utf8');

    const status = await readAutoUpdateStatus(home);
    assert.equal(status, null);
  });

  it('returns null when status file has non-boolean enabled', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { status: statusPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(statusPath, JSON.stringify({ enabled: 'maybe' }), 'utf8');

    const status = await readAutoUpdateStatus(home);
    assert.equal(status, null);
  });

  it('returns null when status file is empty', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { status: statusPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(statusPath, '', 'utf8');

    const status = await readAutoUpdateStatus(home);
    assert.equal(status, null);
  });
});

// ── writeAutoUpdateStatus + readAutoUpdateStatus (round-trip) ────────────────

describe('writeAutoUpdateStatus + readAutoUpdateStatus round-trip', () => {
  it('writes and reads back a fully populated status', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const original = {
      enabled: true,
      lastRunAt: '2026-06-16T01:00:00.000Z',
      lastSuccessAt: '2026-06-16T01:00:00.000Z',
      lastVersion: '5.2.4',
      lastError: undefined,
      scheduler: {
        registered: true,
        platform: 'darwin',
        message: 'LaunchAgent installed at ~/Library/LaunchAgents/',
        updatedAt: '2026-06-16T00:00:00.000Z',
      },
    };

    await writeAutoUpdateStatus(home, original);
    const status = await readAutoUpdateStatus(home);

    assert.notEqual(status, null);
    assert.equal(status.enabled, true);
    assert.equal(status.lastRunAt, original.lastRunAt);
    assert.equal(status.lastSuccessAt, original.lastSuccessAt);
    assert.equal(status.lastVersion, original.lastVersion);
    assert.equal(status.lastError, undefined);
    assert.deepEqual(status.scheduler, original.scheduler);
  });

  it('writes and reads back a minimal status', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const original = { enabled: false };
    await writeAutoUpdateStatus(home, original);
    const status = await readAutoUpdateStatus(home);

    assert.notEqual(status, null);
    assert.equal(status.enabled, false);
    assert.equal(status.lastRunAt, undefined);
    assert.equal(status.lastSuccessAt, undefined);
    assert.equal(status.lastVersion, undefined);
    assert.equal(status.lastError, undefined);
    assert.equal(status.scheduler, undefined);
  });

  it('writes and reads back a status with error field', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const original = {
      enabled: true,
      lastError: 'npm ERR! network timeout',
      lastVersion: '5.2.3',
    };

    await writeAutoUpdateStatus(home, original);
    const status = await readAutoUpdateStatus(home);

    assert.notEqual(status, null);
    assert.equal(status.enabled, true);
    assert.equal(status.lastError, 'npm ERR! network timeout');
    assert.equal(status.lastVersion, '5.2.3');
  });
});

// ── withAutoUpdateLock ───────────────────────────────────────────────────────

describe('withAutoUpdateLock', () => {
  it('acquires and releases the lock when callback resolves', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const result = await withAutoUpdateLock(home, async () => {
      const { lock: lockPath } = resolveAutoUpdatePaths(home);
      assert.ok(existsSync(lockPath), 'lock file should exist during callback');
      return 42;
    });

    assert.equal(result, 42, 'should return the callback result');

    const { lock: lockPath } = resolveAutoUpdatePaths(home);
    assert.ok(!existsSync(lockPath), 'lock file should be removed after callback');
  });

  it('releases the lock when callback resolves with undefined', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const result = await withAutoUpdateLock(home, async () => undefined);
    assert.equal(result, undefined);

    const { lock: lockPath } = resolveAutoUpdatePaths(home);
    assert.ok(!existsSync(lockPath), 'lock file should be removed');
  });

  it('releases the lock when callback throws', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const testError = new Error('callback failure');
    await assert.rejects(
      withAutoUpdateLock(home, async () => {
        throw testError;
      }),
      testError,
    );

    const { lock: lockPath } = resolveAutoUpdatePaths(home);
    assert.ok(!existsSync(lockPath), 'lock file should be removed after rejection');
  });

  it('throws a clear error when lock already exists', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    const { lock: lockPath } = resolveAutoUpdatePaths(home);
    mkdirSync(home, { recursive: true });
    writeFileSync(lockPath, '', 'utf8');

    await assert.rejects(
      withAutoUpdateLock(home, async () => {
        return 'should not reach here';
      }),
      {
        name: 'Error',
        message: /lock exists/,
      },
    );
  });

  it('creates the parent directory when it does not exist', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    rmSync(home, { recursive: true, force: true });

    await withAutoUpdateLock(home, async () => {
      const { lock: lockPath } = resolveAutoUpdatePaths(home);
      assert.ok(existsSync(lockPath), 'lock file should exist');
    });
  });

  it('allows re-acquiring the lock after previous acquisition completed', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    await withAutoUpdateLock(home, async () => 'first');
    await withAutoUpdateLock(home, async () => 'second');

    // If we got here without throwing, re-acquisition works
    assert.ok(true, 'lock can be re-acquired after release');
  });

  it('stores lock file content at the expected path', async (t) => {
    const home = createTempHome();
    t.after(() => rmSync(home, { recursive: true, force: true }));

    await withAutoUpdateLock(home, async () => {
      const { lock: lockPath } = resolveAutoUpdatePaths(home);
      // The lock file is created as an empty file (just a marker)
      const content = readFileSync(lockPath, 'utf8');
      assert.equal(content, '', 'lock file should be empty');
    });
  });
});
