import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('REGTEST-R2-01: handleListApis --all flag splice', () => {
  it('should include non-exported symbols with all=true and filter them with all=false', async (ctx) => {
    // Arrange: three nodes — two exported, one non-exported
    const nodes = [
      {
        id: 'n1',
        name: 'funcA',
        kind: 'function',
        filePath: 'src/feature/a.ts',
        startLine: 10,
        endLine: 30,
        qualifiedName: 'funcA',
        signature: '(x: string): void',
        isExported: true,
      },
      {
        id: 'n2',
        name: 'funcB',
        kind: 'function',
        filePath: 'src/lib/b.ts',
        startLine: 5,
        endLine: 25,
        qualifiedName: 'funcB',
        signature: '(y: number): string',
        isExported: false,
      },
      {
        id: 'n3',
        name: 'funcC',
        kind: 'function',
        filePath: 'src/lib/c.ts',
        startLine: 1,
        endLine: 20,
        qualifiedName: 'funcC',
        signature: '(z: boolean): void',
        isExported: true,
      },
    ];

    // Mock CodeGraph.open before importing the module under test
    const { CodeGraph } = require('@colbymchenry/codegraph');
    const openMock = mock.method(CodeGraph, 'open', async () => ({
      getNodesByKind: (_kind: string) => nodes,
      getCallers: (_id: string) => [],
      close: () => {},
    }));

    const { handleListApis } = await import('./cmd-list-apis.js');

    // Test 1: all=true — all symbols appear, grouped by directory
    {
      const chunks: string[] = [];
      ctx.mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
      });

      await handleListApis('/fake/root', undefined, { all: true });

      const output = chunks.join('');
      assert.ok(output.includes('funcA'), 'all=true: should include exported funcA');
      assert.ok(output.includes('funcB'), 'all=true: should include non-exported funcB');
      assert.ok(output.includes('funcC'), 'all=true: should include exported funcC');
      assert.ok(output.includes('=== src/feature/ ==='), 'all=true: should group src/feature/');
      assert.ok(output.includes('=== src/lib/ ==='), 'all=true: should group src/lib/');
      ctx.mock.reset();
    }

    // Test 2: all=false — only exported symbols, ungrouped
    {
      const chunks: string[] = [];
      ctx.mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
        chunks.push(String(chunk));
      });

      await handleListApis('/fake/root', undefined, { all: false });

      const output = chunks.join('');
      assert.ok(output.includes('funcA'), 'all=false: should include exported funcA');
      assert.ok(!output.includes('funcB'), 'all=false: should NOT include non-exported funcB');
      assert.ok(output.includes('funcC'), 'all=false: should include exported funcC');
      assert.ok(!output.includes('=== src/feature/ ==='), 'all=false: should not group');
      assert.ok(!output.includes('=== src/lib/ ==='), 'all=false: should not group');
    }

    // Clean up global mocks (CodeGraph.open)
    mock.reset();
  });
});
