import test from 'node:test';
import assert from 'node:assert/strict';
import { isInteractive, supportsAnimation, clearScreen } from '@laitszkin/tui';
import { parseArguments } from '@laitszkin/cli';

test('isInteractive returns true when both stdin and stdout are TTY', () => {
  const stdin = { isTTY: true };
  const stdout = { isTTY: true };
  assert.equal(isInteractive(stdin, stdout, {}), true);
});

test('isInteractive returns false when stdin is not TTY on non-Windows', () => {
  const stdin = { isTTY: false };
  const stdout = { isTTY: true };
  assert.equal(isInteractive(stdin, stdout, {}), false);
});

test('isInteractive returns false when stdout is not TTY on non-Windows', () => {
  const stdin = { isTTY: true };
  const stdout = { isTTY: false };
  assert.equal(isInteractive(stdin, stdout, {}), false);
});

test('isInteractive returns false when both are not TTY on non-Windows', () => {
  const stdin = { isTTY: false };
  const stdout = { isTTY: false };
  assert.equal(isInteractive(stdin, stdout, {}), false);
});

test('supportsAnimation returns true with TTY streams and no CI flag', () => {
  const stream = { isTTY: true, isTTY: true };
  assert.equal(supportsAnimation(stream, {}), true);
});

test('supportsAnimation returns false with non-TTY stream', () => {
  const stream = { isTTY: false };
  assert.equal(supportsAnimation(stream, {}), false);
});

test('supportsAnimation returns false when CI env is set', () => {
  const stream = { isTTY: true };
  assert.equal(supportsAnimation(stream, { CI: 'true' }), false);
});

test('supportsAnimation returns false when APOLLO_TOOLKIT_NO_ANIMATION is 1', () => {
  const stream = { isTTY: true };
  assert.equal(supportsAnimation(stream, { APOLLO_TOOLKIT_NO_ANIMATION: '1' }), false);
});

test('supportsAnimation returns false when stream is null', () => {
  assert.equal(supportsAnimation(null, {}), false);
});

test('clearScreen writes ANSI codes when output.isTTY is true', () => {
  let written = '';
  const output = {
    isTTY: true,
    write(chunk) { written += chunk; },
  };
  clearScreen(output);
  assert.equal(written, '\x1b[2J\x1b[H');
});

test('clearScreen does nothing when output.isTTY is false', () => {
  let written = '';
  const output = {
    isTTY: false,
    write(chunk) { written += chunk; },
  };
  clearScreen(output);
  assert.equal(written, '');
});

test('clearScreen does nothing when output has no isTTY', () => {
  let written = '';
  const output = {
    write(chunk) { written += chunk; },
  };
  clearScreen(output);
  assert.equal(written, '');
});

// ----------------------------------------------------------------
// parseArguments "tool" alias normalization
// ----------------------------------------------------------------

test('parseArguments normalizes singular "tool" prefix to tools command', () => {
  const result = parseArguments(['tool', 'filter-logs', '--help']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'filter-logs');
  assert.deepEqual(result.toolArgs, ['--help']);
});

test('parseArguments singular "tool" with --help shows tools help', () => {
  const result = parseArguments(['tool', '--help']);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});

test('parseArguments singular "tool" with no args shows tools help', () => {
  const result = parseArguments(['tool']);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});
