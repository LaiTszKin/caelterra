import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('REGTEST-R2-03: handleSearch — CodeGraph init check', () => {
  it('should return exit code 1 when CodeGraph is not initialized', async () => {
    // Mock CodeGraph.isInitialized to return false before importing the module under test
    const { CodeGraph } = require('@colbymchenry/codegraph') as { CodeGraph: { isInitialized: Function; open: Function } };
    const initMock = mock.method(CodeGraph, 'isInitialized', () => false);

    // Import after mock is in place
    const { handleSearch } = await import('./cmd-search.js');

    // Capture stderr writes
    const stderrChunks: string[] = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    try {
      const exitCode = await handleSearch('/test/project', 'testQuery', {});
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
