import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemError } from '@laitszkin/tool-utils';

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
  const sysError = new SystemError('Cannot find module "something"', { code: originalCode });

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
  assert.strictEqual((sysError.details?.code) === 'MODULE_NOT_FOUND', false);
});

test('SystemError preserves original error message', () => {
  const sysError = new SystemError('Cannot find module "lodash"', { code: 'MODULE_NOT_FOUND' });

  // The message passed to SystemError is preserved verbatim
  assert.ok(sysError.message.includes('Cannot find module'));
});
