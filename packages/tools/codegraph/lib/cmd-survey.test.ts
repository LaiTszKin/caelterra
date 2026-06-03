import { describe, it, before, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('cmd-survey', () => {
  let handleSurvey: (...args: any[]) => Promise<number>;

  // Mock CodeGraph instance shared across tests:
  // - Symbol A in src/feature/a.ts calls symbol B in src/lib/b.ts (cross-boundary)
  // - Symbol X in src/feature/a.ts is exported but only called internally
  const mockCg = {
    getFiles: () => [{ path: 'src/feature/a.ts', language: 'typescript' }],
    getNodesInFile: () => [
      {
        id: 'node-a',
        name: 'A',
        kind: 'function',
        qualifiedName: 'A',
        startLine: 1,
        endLine: 10,
        isExported: true,
      },
      {
        id: 'node-x',
        name: 'X',
        kind: 'function',
        qualifiedName: 'X',
        startLine: 20,
        endLine: 30,
        isExported: true,
      },
    ],
    getNodesByName: (name: string) => {
      if (name === 'A') {
        return [{ id: 'node-a', filePath: 'src/feature/a.ts', name: 'A' }];
      }
      if (name === 'X') {
        return [{ id: 'node-x', filePath: 'src/feature/a.ts', name: 'X' }];
      }
      return [];
    },
    getCallees: (_id: string) => {
      if (_id === 'node-a') {
        return [{ node: { name: 'B', filePath: 'src/lib/b.ts' } }];
      }
      return [];
    },
    getCallers: (_id: string) => {
      if (_id === 'node-x') {
        return [{ node: { name: 'internal', filePath: 'src/feature/a.ts' } }];
      }
      return [];
    },
    close: () => {},
  };

  before(async () => {
    // Module-level mocks (only need to be set up once):
    mock.module('./survey/scanner.js', {
      namedExports: {
        scanDirectory: async () => ({
          directory: 'src/feature',
          files: [
            {
              filePath: 'src/feature/a.ts',
              language: 'typescript',
              symbols: [
                { name: 'A', kind: 'function', qualifiedName: 'A', startLine: 1, endLine: 10, isExported: true, signature: undefined },
                { name: 'X', kind: 'function', qualifiedName: 'X', startLine: 20, endLine: 30, isExported: true, signature: undefined },
              ],
            },
          ],
          allSymbols: [
            { name: 'A', kind: 'function', filePath: 'src/feature/a.ts', qualifiedName: 'A', startLine: 1, isExported: true },
            { name: 'X', kind: 'function', filePath: 'src/feature/a.ts', qualifiedName: 'X', startLine: 20, isExported: true },
          ],
          totalFiles: 1,
          totalSymbols: 2,
        }),
      },
    });
    mock.module('./survey/grouper.js', {
      namedExports: { groupIntoSubmodules: () => [] },
    });
    mock.module('./cg-instance.js', {
      namedExports: { closeIndex: () => {} },
    });

    // Import the compiled module (dist/lib/cmd-survey.js has the fixed code)
    const mod = await import('./cmd-survey.js');
    handleSurvey = mod.handleSurvey;
  });

  beforeEach(() => {
    // Re-apply CodeGraph.open mock before each test (mock.reset() in afterEach clears it).
    // Must use manual mock.method instead of mock.module because lazy CJS require()
    // inside handlers bypasses mock.module interception.
    const { CodeGraph } = require('@colbymchenry/codegraph');
    mock.method(CodeGraph, 'open', async () => mockCg);
  });

  afterEach(() => {
    mock.reset();
  });

  it('REGTEST-10: Cross-boundary edges point outside the scanned directory', async () => {
    const stdoutChunks: string[] = [];
    mock.method(process.stdout, 'write', (chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });

    // Use a real directory for projectRoot so existsSync returns true naturally
    const exitCode = await handleSurvey(process.cwd(), 'packages');

    assert.equal(exitCode, 0);
    const output = stdoutChunks.join('');
    assert.ok(
      output.includes('src/feature/a.ts -> src/lib/b.ts'),
      `Expected cross-boundary edge label in output, got:\n${output}`,
    );
  });

  it('REGTEST-11: Exported symbol called only from within the directory is not an entry point', async () => {
    const stdoutChunks: string[] = [];
    mock.method(process.stdout, 'write', (chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    });

    // Use a real directory for projectRoot so existsSync returns true naturally
    const exitCode = await handleSurvey(process.cwd(), 'packages');

    assert.equal(exitCode, 0);
    const output = stdoutChunks.join('');
    // X has only internal callers, so "(none)" should appear for entry points
    assert.ok(
      output.includes('(none)'),
      `Expected "(none)" for entry points, got:\n${output}`,
    );
  });

  it('REGTEST-12: Non-existent directory returns exit code 1 with error message', async () => {
    const stderrChunks: string[] = [];
    mock.method(process.stderr, 'write', (chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });

    // Use a path that does not exist on disk
    const exitCode = await handleSurvey('/tmp', 'nonexistent-' + process.hrtime.bigint().toString());

    assert.equal(exitCode, 1);
    assert.ok(
      stderrChunks.join('').includes('Directory not found'),
      `Expected "Directory not found" error, got: ${stderrChunks.join('')}`,
    );
  });
});
