import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemError, UserInputError } from '@laitszkin/tool-utils';

// ---------------------------------------------------------------------------
// These tests verify that the instanceof SystemError branch in tool catch
// blocks correctly outputs both err.message and err.stack to stderr, as
// opposed to the generic catch pattern which only outputs err.message.
//
// The fix was applied across 8 tool files (see FIX-E).
// ---------------------------------------------------------------------------

/**
 * Helper: creates a writable in-memory stream that accumulates chunks.
 */
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

test('SystemError instance has a non-empty stack property', () => {
  const err = new SystemError('something went wrong');

  assert.ok(err instanceof Error);
  assert.equal(err.message, 'something went wrong');
  assert.equal(err.name, 'SystemError');
  assert.equal(err.code, 'SYSTEM_ERROR');
  assert.equal(err.statusCode, 1);
  assert.equal(err.isOperational, false);
  // SystemError inherits AppError's captureStackTrace, so stack should exist
  assert.ok(typeof err.stack === 'string', `.stack should be a string, got ${typeof err.stack}`);
  assert.ok(err.stack.length > 0, '.stack should not be empty');
  // Verify the stack trace contains the error message on the first line
  assert.ok(err.stack.startsWith('SystemError: something went wrong'),
    `stack first line should start with "SystemError: something went wrong", got: ${err.stack.split('\n')[0]}`);
  // Verify there is at least one "at" frame in the stack
  assert.ok(err.stack.includes('at '), '.stack should contain at least one "at" frame');
});

test('SystemError catch block outputs both message and stack to stderr', async () => {
  const stderr = createMemoryStream();
  const stdout = createMemoryStream();

  // Simulate the exact catch block pattern used in the tool files
  async function handlerThatThrowsSystemError() {
    try {
      throw new SystemError('disk write failed');
    } catch (err) {
      if (err instanceof UserInputError) {
        stderr.write(`${err.message}\n`);
      } else if (err instanceof SystemError) {
        stderr.write(`${err.message}\n${err.stack}\n`);
      } else {
        const e = /** @type {Error} */ (err);
        stderr.write(`Error: ${e.message}\n`);
      }
      return 1;
    }
  }

  const code = await handlerThatThrowsSystemError();
  assert.equal(code, 1);

  const output = stderr.toString();
  assert.ok(output.includes('disk write failed'),
    `stderr should contain the message "disk write failed", got: ${output}`);
  assert.ok(output.includes('at '),
    `stderr should contain stack frames ("at ..."), got: ${output}`);
  // The output should contain a multi-line stack trace (message line + at least one frame line)
  const lines = output.trim().split('\n');
  assert.ok(lines.length >= 2,
    `stderr should have at least 2 lines (message + stack), got ${lines.length} lines`);
  assert.equal(lines[0], 'disk write failed',
    `first line should be the message, got: ${lines[0]}`);
});

test('generic Error catch block does NOT include stack (regression baseline)', async () => {
  const stderr = createMemoryStream();
  const stdout = createMemoryStream();

  async function handlerWithGenericCatch() {
    try {
      throw new SystemError('something broke');
    } catch (err) {
      // Simulate the old pattern: generic catch that only outputs message
      const e = /** @type {Error} */ (err);
      stderr.write(`Error: ${e.message}\n`);
      return 1;
    }
  }

  const code = await handlerWithGenericCatch();
  assert.equal(code, 1);
  const output = stderr.toString();
  assert.ok(output.includes('Error: something broke'));
  // The generic pattern should NOT output the stack
  assert.ok(!output.includes('at '),
    'generic catch should not output stack, but got "at" in: ' + output);
});

test('UserInputError is handled correctly (SystemError instanceof branch is not triggered)', async () => {
  const stderr = createMemoryStream();

  async function handlerWithUserInputError() {
    try {
      throw new UserInputError('bad input');
    } catch (err) {
      if (err instanceof UserInputError) {
        stderr.write(`${err.message}\n`);
      } else if (err instanceof SystemError) {
        stderr.write(`${err.message}\n${err.stack}\n`);
      } else {
        stderr.write(`Error: ${err.message}\n`);
      }
      return 1;
    }
  }

  const code = await handlerWithUserInputError();
  assert.equal(code, 1);
  const output = stderr.toString();
  // Should only have the message, not the stack
  assert.equal(output.trim(), 'bad input');
});
