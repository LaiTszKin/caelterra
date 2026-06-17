import test from 'node:test';
import assert from 'node:assert/strict';
import { createStdioWriter } from '@laitszkin/tui';

function memoryStream() {
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

test('createStdioWriter returns an object with info, warn, error, verbose, json methods', () => {
  const w = createStdioWriter();
  assert.equal(typeof w.info, 'function');
  assert.equal(typeof w.warn, 'function');
  assert.equal(typeof w.error, 'function');
  assert.equal(typeof w.verbose, 'function');
  assert.equal(typeof w.json, 'function');
  assert.equal(typeof w.setMode, 'function');
  assert.equal(typeof w.setVerbose, 'function');
});

test('info writes to stdout in pretty mode', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({
    stdout,
    stderr: memoryStream(),
    mode: 'pretty',
  });
  w.info('hello world');
  assert.equal(stdout.toString().trim(), 'hello world');
});

test('info writes JSON to stdout in json mode', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({ stdout, stderr: memoryStream(), mode: 'json' });
  w.info('test message');
  const parsed = JSON.parse(stdout.toString());
  assert.equal(parsed.severity, 'info');
  assert.equal(parsed.message, 'test message');
});

test('warn writes to stderr in pretty mode', () => {
  const stderr = memoryStream();
  const w = createStdioWriter({
    stdout: memoryStream(),
    stderr,
    mode: 'pretty',
  });
  w.warn('warning message');
  assert.ok(stderr.toString().includes('warning message'));
});

test('warn writes JSON to stderr in json mode', () => {
  const stderr = memoryStream();
  const w = createStdioWriter({ stdout: memoryStream(), stderr, mode: 'json' });
  w.warn('json warning');
  const parsed = JSON.parse(stderr.toString());
  assert.equal(parsed.severity, 'warn');
  assert.equal(parsed.message, 'json warning');
});

test('error writes to stderr in pretty mode', () => {
  const stderr = memoryStream();
  const w = createStdioWriter({
    stdout: memoryStream(),
    stderr,
    mode: 'pretty',
  });
  w.error('error message');
  assert.ok(stderr.toString().includes('error message'));
});

test('error writes JSON to stderr in json mode', () => {
  const stderr = memoryStream();
  const w = createStdioWriter({ stdout: memoryStream(), stderr, mode: 'json' });
  w.error('json error');
  const parsed = JSON.parse(stderr.toString());
  assert.equal(parsed.severity, 'error');
  assert.equal(parsed.message, 'json error');
});

test('verbose does not write when verbose is false', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({
    stdout,
    stderr: memoryStream(),
    verbose: false,
    mode: 'pretty',
  });
  w.verbose('should not appear');
  assert.equal(stdout.toString(), '');
});

test('verbose writes to stdout when verbose is true in pretty mode', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({
    stdout,
    stderr: memoryStream(),
    verbose: true,
    mode: 'pretty',
  });
  w.verbose('verbose detail');
  assert.equal(stdout.toString().trim(), 'verbose detail');
});

test('verbose writes JSON when verbose is true in json mode', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({
    stdout,
    stderr: memoryStream(),
    verbose: true,
    mode: 'json',
  });
  w.verbose('verbose json');
  const parsed = JSON.parse(stdout.toString());
  assert.equal(parsed.severity, 'verbose');
  assert.equal(parsed.message, 'verbose json');
});

test('json writes raw JSON to stdout', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({ stdout, stderr: memoryStream() });
  w.json({ key: 'value', num: 42 });
  const parsed = JSON.parse(stdout.toString());
  assert.equal(parsed.key, 'value');
  assert.equal(parsed.num, 42);
});

test('setMode changes output format', () => {
  const stdout = memoryStream();
  const stderr = memoryStream();
  const w = createStdioWriter({ stdout, stderr, mode: 'pretty' });
  w.info('pretty');
  assert.equal(stdout.toString().trim(), 'pretty');
  w.setMode('json');
  w.info('now json');
  const allOutput = stdout.toString();
  // After setMode('json'), subsequent writes should be JSON
  const jsonPart = allOutput.split('\n').filter(Boolean).pop();
  const parsed = JSON.parse(jsonPart);
  assert.equal(parsed.message, 'now json');
});

test('setVerbose toggles verbose output', () => {
  const stdout = memoryStream();
  const w = createStdioWriter({
    stdout,
    stderr: memoryStream(),
    verbose: false,
  });
  w.verbose('silent');
  assert.equal(stdout.toString(), '');
  w.setVerbose(true);
  w.verbose('audible');
  assert.equal(stdout.toString().trim(), 'audible');
});

test('createStdioWriter uses defaults when no opts provided', () => {
  const w = createStdioWriter();
  assert.equal(typeof w.info, 'function');
  assert.equal(typeof w.setMode, 'function');
});
