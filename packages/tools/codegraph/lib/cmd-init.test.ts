import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock cg-instance before importing cmd-init so the mock takes effect
// before module resolution caches anything.
mock.module('./cg-instance.js', {
  namedExports: {
    createOrOpenIndex: async (_projectRoot: string, _options?: object) => ({
      getStats: () => ({ fileCount: 42, nodeCount: 1280, edgeCount: 5600 }),
      close: () => {},
    }),
    closeIndex: () => {},
  },
});

describe('handleInit', () => {
  it('should include Duration: in TTY summary output when --index is used', async () => {
    const writes: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown, ..._rest: unknown[]): boolean => {
      writes.push(String(chunk));
      return true;
    };

    try {
      const { handleInit } = await import('./cmd-init.js');
      const code = await handleInit('/tmp/test-project', {
        index: true,
        json: false,
      });

      assert.strictEqual(code, 0);
      const output = writes.join('');
      assert.ok(
        output.includes('Duration:'),
        `Expected summary output to contain "Duration:", got:\n${output}`,
      );
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it('should include durationMs in JSON output when --index is used', async () => {
    const writes: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown, ..._rest: unknown[]): boolean => {
      writes.push(String(chunk));
      return true;
    };

    try {
      const { handleInit } = await import('./cmd-init.js');
      const code = await handleInit('/tmp/test-project', {
        index: true,
        json: true,
      });

      assert.strictEqual(code, 0);
      const output = writes.join('');
      assert.ok(
        output.includes('durationMs'),
        `Expected JSON output to contain "durationMs", got:\n${output}`,
      );
    } finally {
      process.stdout.write = origWrite;
    }
  });
});
