import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('sync-memory-index handler catches UserInputError with Error: prefix', async (t) => {
  t.mock.method(fs, 'mkdirSync', () => {
    throw new UserInputError('agents file path is invalid');
  });

  const { tool: syncMemoryIndexTool } = await import('@laitszkin/tool-sync-memory-index');
  const handler = syncMemoryIndexTool.handler;
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const code = await handler(['--agents-file', '/some/path'], { stdout, stderr });

  assert.equal(code, 1);
  assert.ok(
    stderr.toString().includes('Error:'),
    `Expected stderr to contain "Error:", got: ${JSON.stringify(stderr.toString())}`,
  );
});

test('sync-memory-index handler catches SystemError with error context', async (t) => {
  t.mock.method(fs, 'mkdirSync', () => {
    throw new SystemError('disk write failure');
  });

  const { tool: syncMemoryIndexTool } = await import('@laitszkin/tool-sync-memory-index');
  const handler = syncMemoryIndexTool.handler;
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();

  const code = await handler(['--agents-file', '/some/path'], { stdout, stderr });

  assert.equal(code, 1);
  assert.ok(
    stderr.toString().includes('Error:'),
    `Expected stderr to contain "Error:", got: ${JSON.stringify(stderr.toString())}`,
  );
  // TODO: After FIX-03 adds stack trace output for SystemError branch,
  // this test should also verify:
  //   assert.ok(stderr.toString().includes('at '));
});
