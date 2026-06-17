import test from 'node:test';
import assert from 'node:assert/strict';
import { color, supportsColor, sleep } from '@laitszkin/tui';

test('color() wraps text with ANSI codes when enabled', () => {
  const result = color('hello', '1;32', true);
  assert.ok(result !== 'hello');
  assert.ok(result.includes('hello'));
  assert.match(result, /\x1b\[\d+/); // contains ANSI escape
});

test('color() returns plain text when disabled', () => {
  const result = color('hello', '1;32', false);
  assert.equal(result, 'hello');
  assert.ok(!result.includes('\x1b'));
});

test('color() with different codes produces styled output', () => {
  const red = color('error', '1;31', true);
  const green = color('ok', '1;32', true);
  assert.ok(red !== green);
  assert.ok(red.includes('error'));
  assert.ok(green.includes('ok'));
});

test('color() handles empty strings', () => {
  const colored = color('', '1;32', true);
  assert.equal(color('', '1;32', false), '');
  // chalk may still wrap empty string - just verify it returns a string
  assert.equal(typeof colored, 'string');
});

test('supportsColor() returns true for TTY streams without NO_COLOR', () => {
  assert.equal(supportsColor({ isTTY: true }, { NO_COLOR: '' }), true);
  assert.equal(supportsColor({ isTTY: true }, {}), true);
});

test('supportsColor() returns false for non-TTY streams', () => {
  assert.equal(supportsColor({ isTTY: false }, {}), false);
  assert.equal(supportsColor(null, {}), false);
});

test('supportsColor() returns false when NO_COLOR is set', () => {
  assert.equal(supportsColor({ isTTY: true }, { NO_COLOR: '1' }), false);
});

test('supportsColor() returns false when NO_COLOR is any truthy value', () => {
  assert.equal(supportsColor({ isTTY: true }, { NO_COLOR: 'true' }), false);
});

test('sleep() resolves after the given delay', async () => {
  const start = Date.now();
  await sleep(50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 40, `Expected >= 40ms, got ${elapsed}ms`);
});
