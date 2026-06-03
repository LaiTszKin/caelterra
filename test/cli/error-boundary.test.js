import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@laitszkin/cli';
import {
  UserInputError,
  SystemError,
  ToolNotFoundError,
} from '@laitszkin/tool-utils';

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

// ---- Success path -----------------------------------------------------------

test('run: successful help handler returns exit code 0 with stdout output', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['install', '--help'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
  });
  assert.equal(result, 0);
  const out = stdout.getOutput();
  assert.ok(out.includes('Usage'), `stdout should contain help text, got: ${out.slice(0, 200)}`);
});

// ---- Generic error from parser (parseArgs throws) ---------------------------

test('run: --home without value causes UserInputError on stderr and exit code 1', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['--home'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(!err.includes('Error:'), `stderr should NOT contain "Error:" for UserInputError, got: ${err}`);
  assert.ok(err.includes('Missing value for --home'));
});

// ---- Generic error from installer (normalizeModes throws) -------------------

test('run: invalid mode causes error on stderr and exit code 1', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['invalid-mode'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(err.includes('Error:'), `stderr should contain "Error:", got: ${err}`);
  assert.ok(err.includes('Invalid mode'));
});

// ---- Tool dispatch success path (when tool modules are available) -----------

test('run: successful tool dispatch returns exit code 0', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['filter-logs', '--help'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    runTool: async () => 0,
  });
  assert.equal(result, 0);
});

// ---- Error boundary: UserInputError branch ----------------------------------

test('run: handler throwing UserInputError writes message without "Error:" prefix and exits 1', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['filter-logs'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: {},
    // Synchronous throw — caught by try/catch in run()
    runTool: () => { throw new UserInputError('user typed something wrong'); },
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.equal(err, 'user typed something wrong\n');
  assert.ok(!err.includes('Error:'), 'stderr should NOT contain "Error:" for UserInputError');
});

// ---- Error boundary: SystemError branch -------------------------------------

test('run: handler throwing SystemError writes message and stack trace', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['filter-logs'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: {},
    // Synchronous throw — caught by try/catch in run()
    runTool: () => { throw new SystemError('system failure'); },
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(err.includes('system failure'), 'stderr should contain error message');
  // SystemError writes message + stack (stack starts with "SystemError: <message>")
  assert.ok(err.includes('SystemError: system failure'), 'stderr should contain the constructor-name prefix from stack trace');
});

// ---- Error boundary: AppError (ToolNotFoundError) branch --------------------

test('run: handler throwing ToolNotFoundError writes "Error:" prefix and message', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['filter-logs'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: {},
    // Synchronous throw — caught by try/catch in run()
    runTool: () => { throw new ToolNotFoundError('unknown-tool is not a valid tool'); },
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(err.includes('Error:'), 'stderr should contain "Error:" prefix for AppError subclasses');
  assert.ok(err.includes('unknown-tool is not a valid tool'), 'stderr should contain the error message');
  // ToolNotFoundError extends AppError, which uses "Error: ${error.message}" format
  assert.ok(err.includes('Error: unknown-tool is not a valid tool'), 'stderr should have "Error: <message>" format');
});
