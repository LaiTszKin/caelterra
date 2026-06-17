import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('execCommand shell behavior', () => {
  it('resolves with stdout on successful command', async () => {
    const { execCommand } = await import('../packages/cli/dist/updater.js');
    const result = await execCommand('node', ['--version']);
    assert.ok(result.stdout.trim().startsWith('v'));
  });

  it('rejects on non-zero exit code', async () => {
    const { execCommand } = await import('../packages/cli/dist/updater.js');
    await assert.rejects(
      () => execCommand('node', ['--no-such-flag']),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });
});

describe('compareVersions pre-release handling', () => {
  it('should order pre-release tags correctly', async () => {
    const { compareVersions } = await import('../packages/cli/dist/updater.js');

    // alpha < beta (lexicographic order)
    assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
    assert.strictEqual(compareVersions('1.0.0-beta', '1.0.0-alpha'), 1);

    // pre-release < release
    assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0'), -1);
    assert.strictEqual(compareVersions('1.0.0', '1.0.0-alpha'), 1);

    // identical pre-release
    assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-alpha'), 0);

    // same numeric version, different pre-release length
    assert.strictEqual(compareVersions('1.0.0-rc.1', '1.0.0-rc.2'), -1);
  });
});

describe('getLatestPublishedVersion array branch', () => {
  it('should take the last element when npm returns an array', async () => {
    const { checkForPackageUpdate } =
      await import('../packages/cli/dist/updater.js');

    const calls = [];
    const mockExec = async (cmd, args) => {
      calls.push({ cmd, args });
      return { stdout: '["1.0.0","1.1.0","1.2.0"]' };
    };

    const result = await checkForPackageUpdate({
      packageName: 'test-pkg',
      currentVersion: '0.9.0',
      env: {},
      stdin: { isTTY: true },
      stdout: { isTTY: true, write: () => true },
      stderr: { write: () => true },
      exec: mockExec,
      confirmUpdate: async () => false,
    });

    assert.strictEqual(result.latestVersion, '1.2.0');
    assert.strictEqual(result.checked, true);
    assert.strictEqual(result.updated, false);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].args.includes('--json'));
  });
});

describe('checkForPackageUpdate catch block', () => {
  it('should handle exec errors gracefully', async () => {
    const { checkForPackageUpdate } =
      await import('../packages/cli/dist/updater.js');

    const mockExec = async () => {
      throw new Error('network error');
    };

    const result = await checkForPackageUpdate({
      packageName: 'test-pkg',
      currentVersion: '0.9.0',
      env: {},
      stdin: { isTTY: true },
      stdout: { isTTY: true, write: () => true },
      stderr: { write: () => true },
      exec: mockExec,
    });

    assert.strictEqual(result.checked, false);
    assert.strictEqual(result.updated, false);
    assert.ok(result.error instanceof Error);
    assert.strictEqual(result.error.message, 'network error');
  });
});

describe('checkForPackageUpdate missing latest version', () => {
  it('returns early when latest version is empty', async () => {
    const { checkForPackageUpdate } =
      await import('../packages/cli/dist/updater.js');

    const mockExec = async () => {
      return { stdout: '""' }; // Valid JSON empty string -> falsy -> !latestVersion
    };

    const result = await checkForPackageUpdate({
      packageName: 'test-pkg',
      currentVersion: '1.0.0',
      env: {},
      stdin: { isTTY: true },
      stdout: { isTTY: true, write: () => true },
      stderr: { write: () => true },
      exec: mockExec,
    });

    assert.strictEqual(result.checked, true);
    assert.strictEqual(result.updated, false);
    assert.strictEqual(result.latestVersion, '');
  });
});

describe('execCommand spawn error event', () => {
  it('rejects when spawned command does not exist', async () => {
    const { execCommand } = await import('../packages/cli/dist/updater.js');

    await assert.rejects(
      () => execCommand('__nonexistent_xyzzy_command__', []),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      },
    );
  });
});
