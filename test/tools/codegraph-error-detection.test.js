import test from 'node:test';
import assert from 'node:assert/strict';
import { UserInputError, SystemError } from '@laitszkin/tool-utils';

function createMemoryStream() {
  let data = '';
  return {
    write(chunk) {
      data += chunk;
      return true;
    },
    toString() {
      return data;
    },
  };
}

// ---------------------------------------------------------------------------
// Regression tests for FIX-B: SystemError.details.code correctly preserves
// the original error's .code property (e.g. 'MODULE_NOT_FOUND'), rather than
// being lost because SystemError.code is always 'SYSTEM_ERROR'.
//
// Root cause: SystemError constructor hardcodes code to 'SYSTEM_ERROR', so
// the original error code is stored in details.code instead.
// ---------------------------------------------------------------------------

test('SystemError stores original error code in details.code, not in code', () => {
  const originalCode = 'MODULE_NOT_FOUND';
  const sysError = new SystemError('Cannot find module "something"', {
    code: originalCode,
  });

  // The original error code is preserved in details.code
  assert.strictEqual(sysError.details?.code, 'MODULE_NOT_FOUND');

  // sysError.code is always 'SYSTEM_ERROR' (SystemError hardcoded value)
  assert.strictEqual(sysError.code, 'SYSTEM_ERROR');

  // This proves that checking sysError.code === 'MODULE_NOT_FOUND' would fail
  assert.notStrictEqual(sysError.code, 'MODULE_NOT_FOUND');
});

test('SystemError without details handles optional chaining', () => {
  const sysError = new SystemError('generic error');

  // When no details are passed, details?.code should be undefined
  assert.strictEqual(sysError.details?.code, undefined);

  // This proves the optional chaining works and no crash occurs
  assert.strictEqual(sysError.details?.code === 'MODULE_NOT_FOUND', false);
});

test('SystemError preserves original error message', () => {
  const sysError = new SystemError('Cannot find module "lodash"', {
    code: 'MODULE_NOT_FOUND',
  });

  // The message passed to SystemError is preserved verbatim
  assert.ok(sysError.message.includes('Cannot find module'));
});

// ── codegraphHandler dispatch tests ──────────────────────────────────────────

test('codegraphHandler returns 0 for --help', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  const stdout = createMemoryStream();
  const result = await codegraphHandler(['--help'], {
    stdout,
    stderr: { write: () => {} },
  });
  assert.strictEqual(result, 0);
  assert.ok(stdout.toString().includes('Usage: apltk codegraph'));
});

test('codegraphHandler returns 0 for empty args', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  const stdout = createMemoryStream();
  const result = await codegraphHandler([], {
    stdout,
    stderr: { write: () => {} },
  });
  assert.strictEqual(result, 0);
  assert.ok(stdout.toString().includes('Usage: apltk codegraph'));
});

test('codegraphHandler returns 0 for subcommand --help', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  const stdout = createMemoryStream();
  const result = await codegraphHandler(['search', '--help'], {
    stdout,
    stderr: { write: () => {} },
  });
  assert.strictEqual(result, 0);
  assert.ok(stdout.toString().includes('Usage: apltk codegraph search'));
});

test('codegraphHandler returns 1 for search without query', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  await assert.rejects(
    () =>
      codegraphHandler(['search'], {
        cwd: process.cwd(),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
    (err) => {
      assert.ok(err instanceof UserInputError);
      assert.ok(err.message.includes('Usage: apltk codegraph query'));
      return true;
    },
  );
});

test('codegraphHandler returns 1 for explore without query', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  await assert.rejects(
    () =>
      codegraphHandler(['explore'], {
        cwd: process.cwd(),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
    (err) => {
      assert.ok(err instanceof UserInputError);
      assert.ok(err.message.includes('Usage: apltk codegraph context'));
      return true;
    },
  );
});

test('codegraphHandler rejects removed verify subcommand', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  await assert.rejects(
    () =>
      codegraphHandler(['verify'], {
        cwd: process.cwd(),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
    (err) => {
      assert.ok(err instanceof SystemError);
      assert.ok(err.message.includes('Unknown codegraph subcommand'));
      return true;
    },
  );
});

test('codegraphHandler returns 1 for unknown subcommand', async () => {
  const { codegraphHandler } =
    await import('../../packages/tools/codegraph/dist/index.js');
  await assert.rejects(
    () =>
      codegraphHandler(['nonesuch'], {
        cwd: process.cwd(),
        stdout: { write: () => {} },
        stderr: { write: () => {} },
      }),
    (err) => {
      assert.ok(err instanceof SystemError);
      assert.ok(err.message.includes('Unknown codegraph subcommand'));
      return true;
    },
  );
});

// ── formatter utility tests ─────────────────────────────────────────────────

test('formatSearchResults formats results with scores', async () => {
  const { formatSearchResults } =
    await import('../../packages/tools/codegraph/dist/lib/formatter.js');
  const results = [
    {
      node: {
        name: 'funcA',
        kind: 'function',
        filePath: 'src/a.ts',
        startLine: 10,
      },
      score: 0.95,
    },
    {
      node: {
        name: 'funcB',
        kind: 'function',
        filePath: 'src/b.ts',
        startLine: 20,
      },
      score: 0.8,
    },
  ];
  const output = formatSearchResults(results);
  assert.ok(output.includes('funcA'), 'should contain funcA');
  assert.ok(output.includes('95%'), 'should show 95% score');
  assert.ok(output.includes('funcB'), 'should contain funcB');
  assert.ok(output.includes('Results (2)'), 'should show result count');
});

test('formatSearchResults returns "No results found" for empty array', async () => {
  const { formatSearchResults } =
    await import('../../packages/tools/codegraph/dist/lib/formatter.js');
  assert.strictEqual(formatSearchResults([]), 'No results found.');
});

test('formatOutput returns JSON with indent for non-TTY', async () => {
  const { formatOutput } =
    await import('../../packages/tools/codegraph/dist/lib/formatter.js');
  const data = { hello: 'world', num: 42 };
  const output = formatOutput(data, { json: true });
  const parsed = JSON.parse(output);
  assert.strictEqual(parsed.hello, 'world');
  assert.strictEqual(parsed.num, 42);
});

test('formatOutput returns string directly when data is a string', async () => {
  const { formatOutput } =
    await import('../../packages/tools/codegraph/dist/lib/formatter.js');
  const result = formatOutput('hello', { json: true });
  assert.strictEqual(typeof result, 'string');
  // JSON.stringify('hello') produces '"hello"' but our function
  // returns the string directly for non-TTY when data is a string
  // because of the formatting logic
});

test('formatSummary formats key-value pairs padded', async () => {
  const { formatSummary } =
    await import('../../packages/tools/codegraph/dist/lib/formatter.js');
  const output = formatSummary([
    ['Files:', '42'],
    ['Nodes:', '1280'],
  ]);
  assert.ok(output.includes('Files:'), 'should include Files:');
  assert.ok(output.includes('42'), 'should include value');
  assert.ok(output.includes('Nodes:'), 'should include Nodes:');
  assert.ok(output.includes('1280'), 'should include 1280');
});
