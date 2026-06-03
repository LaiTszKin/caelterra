import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AppError,
  UserInputError,
  ToolNotFoundError,
  SystemError,
} from '../../packages/tool-utils/dist/app-error.js';

// ----------------------------------------------------------------
// AppError (base class)
// ----------------------------------------------------------------

test('AppError creates an error with the given message', () => {
  const err = new AppError('something went wrong');
  assert.equal(err.message, 'something went wrong');
});

test('AppError defaults code to APP_ERROR', () => {
  const err = new AppError('msg');
  assert.equal(err.code, 'APP_ERROR');
});

test('AppError accepts a custom code', () => {
  const err = new AppError('msg', 'CUSTOM_CODE');
  assert.equal(err.code, 'CUSTOM_CODE');
});

test('AppError defaults statusCode to 1', () => {
  const err = new AppError('msg');
  assert.equal(err.statusCode, 1);
});

test('AppError accepts a custom statusCode', () => {
  const err = new AppError('msg', 'APP_ERROR', 42);
  assert.equal(err.statusCode, 42);
});

test('AppError defaults isOperational to true', () => {
  const err = new AppError('msg');
  assert.equal(err.isOperational, true);
});

test('AppError accepts custom isOperational value', () => {
  const err = new AppError('msg', 'APP_ERROR', 1, false);
  assert.equal(err.isOperational, false);
});

test('AppError stores optional details', () => {
  const details = { command: 'test', arg: '--help' };
  const err = new AppError('msg', 'APP_ERROR', 1, true, details);
  assert.deepEqual(err.details, details);
});

test('AppError.details is undefined when not provided', () => {
  const err = new AppError('msg');
  assert.equal(err.details, undefined);
});

test('AppError.name equals constructor name', () => {
  const err = new AppError('msg');
  assert.equal(err.name, 'AppError');
});

test('AppError is instanceof Error', () => {
  const err = new AppError('msg');
  assert.ok(err instanceof Error);
});

test('AppError is instanceof AppError', () => {
  const err = new AppError('msg');
  assert.ok(err instanceof AppError);
});

test('AppError has a stack trace', () => {
  const err = new AppError('msg');
  assert.ok(typeof err.stack === 'string');
  assert.ok(err.stack.length > 0);
});

// ----------------------------------------------------------------
// UserInputError
// ----------------------------------------------------------------

test('UserInputError sets code to USER_INPUT_ERROR', () => {
  const err = new UserInputError('invalid input');
  assert.equal(err.code, 'USER_INPUT_ERROR');
});

test('UserInputError sets statusCode to 1', () => {
  const err = new UserInputError('invalid input');
  assert.equal(err.statusCode, 1);
});

test('UserInputError isOperational is true', () => {
  const err = new UserInputError('invalid input');
  assert.equal(err.isOperational, true);
});

test('UserInputError stores details', () => {
  const details = { arg: '--foo' };
  const err = new UserInputError('invalid input', details);
  assert.deepEqual(err.details, details);
});

test('UserInputError is instanceof AppError', () => {
  const err = new UserInputError('invalid input');
  assert.ok(err instanceof AppError);
});

test('UserInputError is instanceof Error', () => {
  const err = new UserInputError('invalid input');
  assert.ok(err instanceof Error);
});

test('UserInputError.name equals constructor name', () => {
  const err = new UserInputError('invalid input');
  assert.equal(err.name, 'UserInputError');
});

test('UserInputError preserves the passed message', () => {
  const err = new UserInputError('invalid input');
  assert.equal(err.message, 'invalid input');
});

// ----------------------------------------------------------------
// ToolNotFoundError
// ----------------------------------------------------------------

test('ToolNotFoundError sets code to TOOL_NOT_FOUND', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.equal(err.code, 'TOOL_NOT_FOUND');
});

test('ToolNotFoundError sets statusCode to 1', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.equal(err.statusCode, 1);
});

test('ToolNotFoundError isOperational is true', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.equal(err.isOperational, true);
});

test('ToolNotFoundError stores details', () => {
  const details = { tool: 'foobar' };
  const err = new ToolNotFoundError('unknown tool', details);
  assert.deepEqual(err.details, details);
});

test('ToolNotFoundError is instanceof AppError', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.ok(err instanceof AppError);
});

test('ToolNotFoundError is instanceof Error', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.ok(err instanceof Error);
});

test('ToolNotFoundError.name equals constructor name', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.equal(err.name, 'ToolNotFoundError');
});

test('ToolNotFoundError preserves the passed message', () => {
  const err = new ToolNotFoundError('unknown tool');
  assert.equal(err.message, 'unknown tool');
});

// ----------------------------------------------------------------
// SystemError
// ----------------------------------------------------------------

test('SystemError sets code to SYSTEM_ERROR', () => {
  const err = new SystemError('system failure');
  assert.equal(err.code, 'SYSTEM_ERROR');
});

test('SystemError sets statusCode to 1', () => {
  const err = new SystemError('system failure');
  assert.equal(err.statusCode, 1);
});

test('SystemError sets isOperational to false', () => {
  const err = new SystemError('system failure');
  assert.equal(err.isOperational, false);
});

test('SystemError stores details', () => {
  const details = { signal: 'SIGTERM' };
  const err = new SystemError('system failure', details);
  assert.deepEqual(err.details, details);
});

test('SystemError is instanceof AppError', () => {
  const err = new SystemError('system failure');
  assert.ok(err instanceof AppError);
});

test('SystemError is instanceof Error', () => {
  const err = new SystemError('system failure');
  assert.ok(err instanceof Error);
});

test('SystemError.name equals constructor name', () => {
  const err = new SystemError('system failure');
  assert.equal(err.name, 'SystemError');
});

test('SystemError preserves the passed message', () => {
  const err = new SystemError('system failure');
  assert.equal(err.message, 'system failure');
});

test('SystemError preserves stack trace', () => {
  const err = new SystemError('system failure');
  assert.ok(typeof err.stack === 'string');
  assert.ok(err.stack.length > 0);
});
