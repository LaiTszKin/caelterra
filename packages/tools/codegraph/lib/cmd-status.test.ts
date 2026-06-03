import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('REGTEST-6: handleStatus — Languages section', () => {
  it('should display filesByLanguage entries in human-readable output', async () => {
    const testStats = {
      fileCount: 100,
      nodeCount: 500,
      edgeCount: 200,
      dbSizeBytes: 1_024_000,
      lastUpdated: new Date('2026-06-01T12:00:00Z').toISOString(),
      nodesByKind: { function: 50, class: 10 },
      edgesByKind: { calls: 30, extends: 5 },
      filesByLanguage: { typescript: 10, javascript: 5 },
    };

    const mockCg = {
      getStats: () => testStats,
      close: () => {},
    };

    // Load the same CodeGraph module that cmd-status.js uses (shared CJS cache),
    // then mock CodeGraph.open + isInitialized so handleStatus uses our fake instance.
    const { CodeGraph } = require('@colbymchenry/codegraph') as { CodeGraph: { open: Function; isInitialized: Function } };
    const openMock = mock.method(CodeGraph, 'open', async () => mockCg);
    const initMock = mock.method(CodeGraph, 'isInitialized', () => true);

    // Import the module under test AFTER the mock is in place
    const { handleStatus } = await import('./cmd-status.js');

    // Capture stdout writes
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };

    try {
      const exitCode = await handleStatus('/test/project', {});

      assert.strictEqual(exitCode, 0);

      const output = chunks.join('');
      assert.ok(output.includes('Languages:'), 'Output should contain "Languages:" section header');
      assert.ok(output.includes('typescript'), 'Output should contain "typescript" language name');
      assert.ok(output.includes('javascript'), 'Output should contain "javascript" language name');
    } finally {
      process.stdout.write = originalWrite;
      openMock.mock.restore();
      initMock.mock.restore();
    }
  });

  it('REGTEST-R2-02: should return exit code 1 when CodeGraph is not initialized', async () => {
    const { CodeGraph } = require('@colbymchenry/codegraph') as { CodeGraph: { isInitialized: Function; open: Function } };
    const initMock = mock.method(CodeGraph, 'isInitialized', () => false);

    // Import fresh (module cache returns same CodeGraph reference with mocked isInitialized)
    const { handleStatus } = await import('./cmd-status.js');

    // Capture stderr writes
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    try {
      const exitCode = await handleStatus('/test/project', {});
      assert.strictEqual(exitCode, 1);
      const stderrOutput = stderrChunks.join('');
      assert.ok(
        stderrOutput.includes('CodeGraph is not initialized'),
        'stderr should contain "CodeGraph is not initialized" message',
      );
    } finally {
      process.stderr.write = originalStderrWrite;
      initMock.mock.restore();
    }
  });
});
