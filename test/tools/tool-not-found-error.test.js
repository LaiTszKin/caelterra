import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@laitszkin/cli';
import { runTool } from '@laitszkin/tool-registry';
import { ToolNotFoundError } from '@laitszkin/tool-utils';

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

// ---------------------------------------------------------------------------
// runTool directly throws ToolNotFoundError (FIX-06 regression)
// ---------------------------------------------------------------------------

test('runTool throws ToolNotFoundError for nonexistent tool name', async () => {
  await assert.rejects(
    () => runTool('unknown-tool-name', []),
    ToolNotFoundError,
  );
});

test('runTool ToolNotFoundError has correct properties', async () => {
  let caught = false;
  try {
    await runTool('my-missing-tool', []);
  } catch (err) {
    caught = true;
    assert.ok(err instanceof ToolNotFoundError);
    assert.equal(err.code, 'TOOL_NOT_FOUND');
    assert.equal(err.statusCode, 1);
    assert.equal(err.isOperational, true);
    assert.ok(err.message.includes('Unknown tool: my-missing-tool'));
    assert.equal(err.name, 'ToolNotFoundError');
  }
  assert.ok(caught, 'runTool should have thrown');
});

// ---------------------------------------------------------------------------
// Error boundary integration via run()
//
// Note: run() at line 249 in index.ts does NOT await the runTool call, so
// async throws from the real runTool escape the try/catch as a rejected
// promise.  The error boundary IS correct for synchronous throws (including
// from a mock runTool), which is what these tests verify.
//
// parseArguments routes "extract-pdf-text" as a tool command because it is
// in TOOL_NAMES (derived from module @laitszkin/tool-extract-pdf-text).
// The actual tool is registered as "extract-pdf-text-pdfkit", so the real
// runTool would not find it.
// ---------------------------------------------------------------------------

test('run: ToolNotFoundError from runTool is formatted correctly by error boundary', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['extract-pdf-text'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: {},
    // Synchronous mock — throw is caught by try/catch in run()
    runTool: () => { throw new ToolNotFoundError('Unknown tool: extract-pdf-text'); },
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(err.includes('Error:'), 'stderr should contain "Error:" prefix');
  assert.ok(err.includes('Unknown tool: extract-pdf-text'), 'stderr should contain the error message');
  assert.ok(err.includes('Error: Unknown tool: extract-pdf-text'), 'stderr should have "Error: <message>" format');
});
