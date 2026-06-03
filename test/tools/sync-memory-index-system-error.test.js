import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SystemError } from '@laitszkin/tool-utils';

// ---------------------------------------------------------------------------
// Regression test for FIX-03: verify that the sync-memory-index handler's
// SystemError catch branch outputs stack trace to stderr.
//
// The fix changed the SystemError branch from:
//   stderr.write(`Error: ${err.message}\n`);
// to:
//   stderr.write(`${err.message}\n${err.stack}\n`);
// ---------------------------------------------------------------------------

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

test('sync-memory-index: SystemError outputs stack trace to stderr', async (t) => {
  // Make fs.mkdirSync throw a SystemError so the catch block exercises the
  // SystemError instanceof branch.
  t.mock.method(fs, 'mkdirSync', () => {
    throw new SystemError('disk write failure');
  });

  const { tool: syncMemoryIndexTool } = await import('@laitszkin/tool-sync-memory-index');
  const handler = syncMemoryIndexTool.handler;
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const code = await handler(['--agents-file', '/some/path'], { stdout, stderr });

  assert.equal(code, 1);
  const output = stderr.toString();

  // The SystemError branch writes `${err.message}\n${err.stack}\n`.
  // err.stack starts with "SystemError: <message>", so output must include
  // the error class name.
  assert.ok(
    output.includes('SystemError:'),
    `stderr should contain "SystemError:" from stack trace, got: ${JSON.stringify(output)}`,
  );

  // Stack trace must contain frame indicator " at ".
  assert.ok(
    output.includes(' at '),
    `stderr should contain stack frames (" at "), got: ${JSON.stringify(output)}`,
  );

  // Output should be multi-line: message line + at least one stack frame line.
  const lines = output.trim().split('\n');
  assert.ok(
    lines.length >= 2,
    `stderr should have at least 2 lines (message + stack), got ${lines.length} lines`,
  );
});
