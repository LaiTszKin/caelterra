import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

let initialized = true;
let fakeCg: any;

const require = createRequire(import.meta.url);
const { CodeGraph } = require('@colbymchenry/codegraph') as {
  CodeGraph: { isInitialized: Function; open: Function };
};

const initMock = mock.method(CodeGraph, 'isInitialized', () => initialized);
const openMock = mock.method(CodeGraph, 'open', async () => fakeCg);

after(() => {
  initMock.mock.restore();
  openMock.mock.restore();
});

async function captureStdout(
  fn: () => Promise<number>,
): Promise<{ code: number; output: string }> {
  const writes: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown): boolean => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const code = await fn();
    return { code, output: writes.join('') };
  } finally {
    process.stdout.write = originalWrite;
  }
}

async function captureStderr(
  fn: () => Promise<number>,
): Promise<{ code: number; output: string }> {
  const writes: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: unknown): boolean => {
    writes.push(String(chunk));
    return true;
  };

  try {
    const code = await fn();
    return { code, output: writes.join('') };
  } finally {
    process.stderr.write = originalWrite;
  }
}

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    name: 'handleLogin',
    kind: 'function',
    qualifiedName: 'auth.handleLogin',
    filePath: 'src/auth/login.ts',
    language: 'typescript',
    startLine: 10,
    endLine: 20,
    signature: 'handleLogin(req)',
    isExported: true,
    ...overrides,
  };
}

describe('CodeGraph exploration handlers', () => {
  it('handleQuery passes kind and limit to CodeGraph search', async () => {
    let searchArgs: unknown[] | undefined;
    fakeCg = {
      searchNodes: (...args: unknown[]) => {
        searchArgs = args;
        return [{ node: makeNode(), score: 0.9 }];
      },
      close: () => {},
    };

    const { handleQuery } = await import('./cmd-query.js');
    const { code, output } = await captureStdout(() =>
      handleQuery('/repo', 'login', {
        kind: 'function',
        limit: 7,
        json: true,
      }),
    );

    assert.strictEqual(code, 0);
    assert.deepStrictEqual(searchArgs, [
      'login',
      { limit: 7, kinds: ['function'] },
    ]);
    assert.ok(output.includes('"handleLogin"'));
  });

  it('handleFiles filters indexed files by normalized path', async () => {
    fakeCg = {
      getFiles: () => [
        { path: 'src/auth/login.ts', language: 'typescript', nodeCount: 3 },
        { path: 'src/billing/pay.ts', language: 'typescript', nodeCount: 2 },
      ],
      close: () => {},
    };

    const { handleFiles } = await import('./cmd-files.js');
    const { code, output } = await captureStdout(() =>
      handleFiles('/repo', {
        filter: '/src/auth/',
        json: true,
      }),
    );

    assert.strictEqual(code, 0);
    const files = JSON.parse(output);
    assert.deepStrictEqual(
      files.map((file: any) => file.path),
      ['src/auth/login.ts'],
    );
  });

  it('handleRelations limits caller rows and serializes edge data', async () => {
    fakeCg = {
      searchNodes: () => [
        { node: makeNode({ id: 'target', name: 'saveUser' }) },
      ],
      getCallers: () => [
        {
          node: makeNode({ id: 'caller-1', name: 'handleLogin' }),
          edge: { source: 'caller-1', target: 'target', kind: 'calls' },
        },
        {
          node: makeNode({ id: 'caller-2', name: 'handleSignup' }),
          edge: { source: 'caller-2', target: 'target', kind: 'calls' },
        },
      ],
      close: () => {},
    };

    const { handleRelations } = await import('./cmd-relations.js');
    const { code, output } = await captureStdout(() =>
      handleRelations('/repo', 'callers', 'saveUser', {
        limit: 1,
        json: true,
      }),
    );

    assert.strictEqual(code, 0);
    const report = JSON.parse(output);
    assert.strictEqual(report[0].callers.length, 1);
    assert.strictEqual(report[0].callers[0].node.name, 'handleLogin');
    assert.strictEqual(report[0].callers[0].edge.kind, 'calls');
  });

  it('handleImpact passes depth and serializes the returned subgraph', async () => {
    let capturedDepth: number | undefined;
    const root = makeNode({ id: 'root', name: 'UserService' });
    const impacted = makeNode({ id: 'impacted', name: 'UserRepository' });
    fakeCg = {
      searchNodes: () => [{ node: root }],
      getImpactRadius: (_id: string, depth: number) => {
        capturedDepth = depth;
        return {
          nodes: new Map([
            [root.id, root],
            [impacted.id, impacted],
          ]),
          edges: [{ source: 'root', target: 'impacted', kind: 'calls' }],
        };
      },
      close: () => {},
    };

    const { handleImpact } = await import('./cmd-impact.js');
    const { code, output } = await captureStdout(() =>
      handleImpact('/repo', 'UserService', {
        depth: 3,
        json: true,
      }),
    );

    assert.strictEqual(code, 0);
    assert.strictEqual(capturedDepth, 3);
    const report = JSON.parse(output);
    assert.deepStrictEqual(
      report.impact.nodes.map((node: any) => node.name),
      ['UserService', 'UserRepository'],
    );
    assert.strictEqual(report.impact.edges[0].sourceName, 'UserService');
  });

  it('handleNode resolves direct node ids and includes source code', async () => {
    fakeCg = {
      getNode: () => makeNode({ id: 'direct' }),
      getNodesByName: () => [],
      searchNodes: () => [],
      getCode: async () => 'export function handleLogin() {}',
      close: () => {},
    };

    const { handleNode } = await import('./cmd-node.js');
    const { code, output } = await captureStdout(() =>
      handleNode('/repo', 'direct', { json: true }),
    );

    assert.strictEqual(code, 0);
    const report = JSON.parse(output);
    assert.strictEqual(report[0].node.id, 'direct');
    assert.strictEqual(report[0].code, 'export function handleLogin() {}');
  });

  it('handleContext forwards maxNodes, includeCode, and output format', async () => {
    let buildOptions: Record<string, unknown> | undefined;
    fakeCg = {
      buildContext: async (
        _query: string,
        options: Record<string, unknown>,
      ) => {
        buildOptions = options;
        return 'context markdown';
      },
      close: () => {},
    };

    const { handleContext } = await import('./cmd-context.js');
    const { code, output } = await captureStdout(() =>
      handleContext('/repo', 'login flow', {
        maxNodes: 12,
        includeCode: false,
        json: false,
      }),
    );

    assert.strictEqual(code, 0);
    assert.deepStrictEqual(buildOptions, {
      maxNodes: 12,
      includeCode: false,
      format: 'markdown',
    });
    assert.strictEqual(output, 'context markdown\n');
  });

  it('handleIndex runs full indexing and reports stats', async () => {
    let progressSeen = false;
    fakeCg = {
      indexAll: async ({ onProgress }: any) => {
        onProgress({
          phase: 'parse',
          current: 1,
          total: 2,
          currentFile: 'src/auth/login.ts',
        });
        progressSeen = true;
        return { filesIndexed: 2 };
      },
      getStats: () => ({ fileCount: 2, nodeCount: 5, edgeCount: 4 }),
      close: () => {},
    };

    const { handleIndex } = await import('./cmd-index.js');
    const { code, output } = await captureStdout(() =>
      handleIndex('/repo', { json: true }),
    );

    assert.strictEqual(code, 0);
    assert.strictEqual(progressSeen, true);
    const report = JSON.parse(output);
    assert.strictEqual(report.stats.fileCount, 2);
    assert.strictEqual(report.progress[0].currentFile, 'src/auth/login.ts');
  });

  it('new exploration handlers fail clearly when CodeGraph is not initialized', async () => {
    initialized = false;
    fakeCg = { close: () => {} };

    try {
      const { handleFiles } = await import('./cmd-files.js');
      const { code, output } = await captureStderr(() => handleFiles('/repo'));

      assert.strictEqual(code, 1);
      assert.ok(output.includes('CodeGraph is not initialized'));
    } finally {
      initialized = true;
    }
  });
});
