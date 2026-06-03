import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@laitszkin/cli';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function createMockStream() {
  let output = '';
  return {
    write: (s) => { output += String(s); },
    getOutput: () => output,
    isTTY: false,
  };
}

test('run() creates and injects StdioWriter into tool context', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  let capturedCtx = null;

  const result = await run(['filter-logs', '--help'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: {},
    runTool: async (toolName, args, ctx) => {
      capturedCtx = ctx;
      // 驗證 ctx.stdioWriter 存在且為物件
      assert.ok(ctx.stdioWriter, 'context.stdioWriter should exist');
      assert.equal(typeof ctx.stdioWriter.info, 'function');
      assert.equal(typeof ctx.stdioWriter.error, 'function');
      assert.equal(typeof ctx.stdioWriter.warn, 'function');
      return 0;
    },
  });

  assert.equal(result, 0);
  assert.ok(capturedCtx, 'runTool should have been called');
  assert.ok(capturedCtx.stdioWriter, 'captured context should have stdioWriter');
});

test('run() injects stdioWriter into tool context alongside other fields', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();

  const result = await run(['filter-logs', '--help'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: { CUSTOM_VAR: 'test' },
    runTool: async (toolName, args, ctx) => {
      // 驗證 ctx.stdioWriter 與其他標準欄位共存
      assert.ok(ctx.stdioWriter, 'context.stdioWriter should exist');
      assert.ok(ctx.sourceRoot, 'context.sourceRoot should exist');
      assert.ok(ctx.stdout, 'context.stdout should exist');
      assert.ok(ctx.stderr, 'context.stderr should exist');
      assert.ok(ctx.env, 'context.env should exist');
      assert.equal(ctx.env.CUSTOM_VAR, 'test');
      assert.equal(typeof ctx.stdioWriter.info, 'function');
      return 0;
    },
  });

  assert.equal(result, 0);
});
