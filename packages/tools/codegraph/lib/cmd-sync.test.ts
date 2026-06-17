import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('cmd-sync handleSync', () => {
  it('should return exit code 1 when CodeGraph is not initialized', async () => {
    // Pre-load CodeGraph via CJS require (same mechanism used by cmd-sync.ts)
    // and mock isInitialized BEFORE the module under test is evaluated, so
    // the mock is in place when cmd-sync.ts runs its own require().
    const { CodeGraph } = require('@colbymchenry/codegraph');
    const isInitializedMock = mock.method(
      CodeGraph,
      'isInitialized',
      () => false,
    );

    // Capture stderr output
    const stderrWriteMock = mock.method(process.stderr, 'write', () => true);

    // Import the module under test after mocks are set up
    const { handleSync } = await import('./cmd-sync.js');

    // Call the handler with an uninitialized project
    const exitCode = await handleSync('/tmp/fake-project', { json: false });

    // Verify exit code is 1 (error)
    assert.strictEqual(exitCode, 1);

    // Verify stderr mentions "init"
    assert.strictEqual(stderrWriteMock.mock.calls.length, 1);
    const callArg = stderrWriteMock.mock.calls[0]?.arguments[0] ?? '';
    const stderrOutput =
      typeof callArg === 'string'
        ? callArg
        : Buffer.from(callArg).toString('utf8');
    assert.ok(
      stderrOutput.toLowerCase().includes('init'),
      `Expected stderr to mention "init", got: ${JSON.stringify(stderrOutput)}`,
    );

    // Cleanup mocks
    isInitializedMock.mock.restore();
    stderrWriteMock.mock.restore();
  });
});
