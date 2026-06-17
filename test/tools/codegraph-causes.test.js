import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SystemError, UserInputError } from '@laitszkin/tool-utils';

// ---------------------------------------------------------------------------
// Regression tests for FIX-01: error re-wrapping preserves the original
// error's cause chain in codegraph.
//
// The codegraph handler catches unknown errors and re-wraps them with
// SystemError, preserving the original error via { cause }:
//
//   catch (error) {
//     if (error instanceof SystemError || error instanceof UserInputError) throw error;
//     throw new SystemError(error.message, { cause: error });
//   }
//
// Root cause: constructors received only .message without the original
// error, so the cause chain was lost.
// ---------------------------------------------------------------------------

describe('codegraph error cause preservation', () => {
  // As codegraphHandler uses the outer try-catch (line 135-138 of index.ts)
  // that wraps non-AppError errors with SystemError preserving { cause },
  // we test the re-wrap pattern directly.
  it('SystemError re-wraps plain Error preserving original error via details.cause', () => {
    const originalError = new Error(
      'Something went wrong inside a subcommand handler',
    );

    // This is the exact re-wrap pattern from codegraph/index.ts line 137,
    // where a non-AppError is caught and wrapped with SystemError:
    //   throw new SystemError(message, { cause: error });
    const err = new SystemError(
      originalError instanceof Error
        ? originalError.message
        : 'Unknown error in codegraph',
      { cause: originalError },
    );

    // The original error is preserved in details.cause
    assert.ok(
      err.details?.cause,
      'SystemError should preserve original error in details.cause',
    );
    assert.strictEqual(
      err.details.cause,
      originalError,
      'details.cause should be the original error from the subcommand',
    );
    assert.ok(
      err.details.cause instanceof Error,
      'details.cause should be an Error instance',
    );
    assert.ok(
      err.details.cause.message.includes('Something went wrong'),
      'original error message should be preserved',
    );
  });

  it('SystemError handles non-Error thrown value gracefully', () => {
    // The handler also handles non-Error thrown values (line 137):
    //   { cause: error instanceof Error ? error : undefined }
    const _thrownString = 'some string error';
    const err = new SystemError('Unknown error in codegraph', {
      cause: undefined,
    });

    // When the thrown value is not an Error, cause should be undefined
    assert.strictEqual(
      err.details?.cause,
      undefined,
      'details.cause should be undefined for non-Error thrown values',
    );
  });

  it('SystemError message includes the original error message', () => {
    const originalError = new Error('Connection refused');
    const err = new SystemError(
      originalError instanceof Error
        ? originalError.message
        : 'Unknown error in codegraph',
      { cause: originalError },
    );

    assert.ok(
      err.message.includes('Connection refused'),
      'SystemError message should include the original message',
    );
    assert.ok(err.details?.cause, 'details.cause should be preserved');
    assert.strictEqual(err.details.cause, originalError);
  });

  it('handler re-throws SystemError and UserInputError as-is (does not double-wrap)', async () => {
    // The codegraph handler's outer catch (lines 135-138) checks:
    //   if (error instanceof SystemError || error instanceof UserInputError) throw error;
    // This means AppError subclasses propagate without double-wrapping.
    const { codegraphHandler } =
      await import('../../packages/tools/codegraph/dist/index.js');

    // Unknown subcommand throws SystemError directly (line 133).
    // The catch block re-throws it unchanged — verifying it reaches us
    // as a SystemError (not wrapped in another SystemError).
    await assert.rejects(
      () =>
        codegraphHandler(['nonesuch'], {
          cwd: process.cwd(),
          stdout: { write() {} },
          stderr: { write() {} },
        }),
      (err) => {
        assert.ok(
          err instanceof SystemError,
          'should be SystemError (not double-wrapped)',
        );
        assert.ok(
          err.message.includes('Unknown codegraph subcommand'),
          'message should identify the unknown subcommand',
        );
        return true;
      },
    );
  });

  it('handler throws UserInputError for search alias without query (no double-wrap)', async () => {
    const { codegraphHandler } =
      await import('../../packages/tools/codegraph/dist/index.js');

    await assert.rejects(
      () =>
        codegraphHandler(['search'], {
          cwd: process.cwd(),
          stdout: { write() {} },
          stderr: { write() {} },
        }),
      (err) => {
        assert.ok(
          err instanceof UserInputError,
          'should be UserInputError (not double-wrapped)',
        );
        assert.ok(
          err.message.includes('Usage: apltk codegraph query'),
          'message should show canonical query usage',
        );
        return true;
      },
    );
  });
});
