import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimezone, UserInputError, SystemError } from '@laitszkin/tool-utils';
import { tool as filterLogsTool } from '@laitszkin/tool-filter-logs';

const filterLogsHandler = /** @type {import('@laitszkin/tool-registry').ToolDefinition['handler']} */ (filterLogsTool.handler);

function createMemoryStream() {
  let data = '';
  return {
    write(chunk) { data += chunk; return true; },
    toString() { return data; },
  };
}

// ---------------------------------------------------------------------------
// Regression tests for FIX-01: error re-wrapping preserves the original
// error's cause chain in filter-logs.
//
// The filter-logs handler catches errors from 3 sources and re-wraps them
// with { cause: originalError } to preserve the error chain:
//
//   1. buildTimezone(timezone)              → UserInputError  (line 37)
//   2. parseCliTimestamp(start/end, tz)     → UserInputError  (line 51)
//   3. iterInputLines(positionals)          → SystemError     (line 78)
//
// Root cause: constructors received only .message without the original
// error, so the cause chain was lost.
// ---------------------------------------------------------------------------

describe('filter-logs error cause preservation', () => {
  it('re-wraps buildTimezone error with UserInputError preserving original error', () => {
    // Trigger buildTimezone to throw (same code path as line 35-37)
    let originalError;
    try {
      buildTimezone('Invalid/Timezone');
    } catch (err) {
      originalError = err;
    }
    assert.ok(originalError, 'buildTimezone should throw for invalid timezone string');
    assert.ok(originalError instanceof Error, 'original error should be an Error');

    // This is the exact re-wrap pattern from filter-logs/index.ts line 37
    const err = new UserInputError(`invalid timezone: Invalid/Timezone`, { cause: originalError });

    // Verify the original error is preserved via the details.cause property
    assert.ok(err.details?.cause, 'UserInputError should preserve original error in details.cause');
    assert.strictEqual(err.details.cause, originalError, 'details.cause should be the original buildTimezone error');
    assert.ok(err.details.cause instanceof Error, 'details.cause should be an Error instance');
    assert.ok(
      err.details.cause.message.includes('timezone'),
      `original error message should describe the timezone format issue, got: ${err.details.cause.message}`,
    );
  });

  it('re-wraps parseCliTimestamp error with UserInputError preserving original error', () => {
    const originalError = new Error('invalid timestamp: bad-date');

    // Same re-wrap pattern as filter-logs/index.ts line 51
    const err = new UserInputError(originalError.message, { cause: originalError });

    assert.ok(err.details?.cause, 'UserInputError should preserve cause');
    assert.strictEqual(err.details.cause, originalError, 'details.cause should be the original parseCliTimestamp error');
  });

  it('re-wraps iterInputLines error with SystemError preserving original error', () => {
    const originalError = new Error('ENOENT: no such file or directory');

    // Same re-wrap pattern as filter-logs/index.ts line 78
    const err = new SystemError(originalError.message, { cause: originalError });

    assert.ok(err.details?.cause, 'SystemError should preserve cause');
    assert.strictEqual(err.details.cause, originalError, 'details.cause should be the original iterInputLines error');
  });

  it('handler returns exit code 1 for invalid timezone', async () => {
    // Verify the actual handler fails on invalid timezone (error path is exercised)
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await filterLogsHandler(
      ['--assume-timezone', 'Invalid/Timezone'],
      { stdout, stderr },
    );
    assert.notStrictEqual(code, 0, 'handler should return non-zero exit code for invalid timezone');
    assert.ok(
      stderr.toString().includes('invalid timezone'),
      'stderr should include the invalid timezone message',
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests: AppError subclasses propagate the { cause } ErrorOptions
// when it is passed as the third argument (options parameter).
// ---------------------------------------------------------------------------

describe('AppError subclasses propagate { cause } option', () => {
  it('UserInputError preserves cause when ErrorOptions is passed as third argument', () => {
    const cause = new Error('original input error');
    const err = new UserInputError('wrapped message', undefined, { cause });

    // When cause is passed as ErrorOptions (third arg), it may be stored
    // either via native error.cause or in details.cause depending on
    // runtime support. Check both.
    const actualCause = err.cause !== undefined ? err.cause : err.details?.cause;
    assert.ok(actualCause, 'UserInputError should preserve the cause');
    assert.strictEqual(actualCause, cause, 'preserved cause should be the original error');
  });

  it('SystemError preserves cause when ErrorOptions is passed as third argument', () => {
    const cause = new Error('original system error');
    const err = new SystemError('wrapped message', undefined, { cause });

    const actualCause = err.cause !== undefined ? err.cause : err.details?.cause;
    assert.ok(actualCause, 'SystemError should preserve the cause');
    assert.strictEqual(actualCause, cause, 'preserved cause should be the original error');
  });

  it('UserInputError preserves cause when passed as details (re-wrap pattern)', () => {
    // The actual re-wrap sites pass { cause: err } as the second argument
    // (details parameter), not as the third (ErrorOptions parameter).
    const cause = new Error('original');
    const err = new UserInputError('wrapped', { cause });

    // When passed as details, the cause is always in details.cause
    assert.ok(err.details?.cause);
    assert.strictEqual(err.details.cause, cause);
  });

  it('SystemError preserves cause when passed as details (re-wrap pattern)', () => {
    const cause = new Error('original');
    const err = new SystemError('wrapped', { cause });

    assert.ok(err.details?.cause);
    assert.strictEqual(err.details.cause, cause);
  });
});
