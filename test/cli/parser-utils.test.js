import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParseError } from '@laitszkin/cli';
describe('normalizeParseError', () => {
  it('converts ambiguous argument error to UserInputError', () => {
    const errorMessage =
      "Option '--home' argument is ambiguous. " +
      "Did you forget to specify the option argument for '--home'?";
    const err = new TypeError(errorMessage);

    assert.throws(() => normalizeParseError(err), { name: 'UserInputError' });
    assert.throws(() => normalizeParseError(err), {
      message: 'Missing value for --home',
    });
  });

  it('converts argument missing error to UserInputError', () => {
    const err = new TypeError("Option '--home' argument missing");

    assert.throws(() => normalizeParseError(err), {
      name: 'UserInputError',
      message: 'Missing value for --home',
    });
  });

  it('converts argument value error to UserInputError', () => {
    const err = new TypeError("Option '--home' value is not valid");

    assert.throws(() => normalizeParseError(err), {
      name: 'UserInputError',
      message: 'Missing value for --home',
    });
  });

  it('re-throws unrelated TypeError unchanged', () => {
    const err = new TypeError("Unknown option '--foobar'");

    assert.throws(() => normalizeParseError(err), {
      name: 'TypeError',
      message: "Unknown option '--foobar'",
    });
  });

  it('re-throws non-TypeError unchanged', () => {
    const err = new Error('Something else went wrong');

    assert.throws(() => normalizeParseError(err), {
      name: 'Error',
      message: 'Something else went wrong',
    });
  });

  it('re-throws TypeError about --home with unrelated wording unchanged', () => {
    const err = new TypeError("Option '--home' is not a valid argument");

    assert.throws(() => normalizeParseError(err), { name: 'TypeError' });
  });
});
