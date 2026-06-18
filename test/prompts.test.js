import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promptForModes, promptYesNo } from '@laitszkin/tui';

/**
 * Create a mock readline-like stream for prompt tests.
 * On Windows, @inquirer/prompts uses more of the stream interface
 * (on, emit, pipe, etc.) via MuteStream even when isTTY is false.
 */
function mockStream(isTTY = false) {
  const s = new EventEmitter();
  s.isTTY = isTTY;
  return s;
}

test('promptForModes throws when not in a TTY', async () => {
  const input = mockStream(false);
  const output = mockStream(false);
  await assert.rejects(
    () =>
      promptForModes({
        input,
        output,
        message: 'test',
        choices: [{ name: 'opt', value: 'opt', description: 'desc' }],
      }),
    /Interactive selection requires a TTY/,
  );
});

test('promptForModes throws when input is null', async () => {
  await assert.rejects(
    () =>
      promptForModes({
        input: null,
        output: { isTTY: true },
        message: 'test',
        choices: [{ name: 'opt', value: 'opt', description: 'desc' }],
      }),
    /Interactive selection requires a TTY/,
  );
});

test('promptForModes throws when output is null', async () => {
  await assert.rejects(
    () =>
      promptForModes({
        input: { isTTY: true },
        output: null,
        message: 'test',
        choices: [{ name: 'opt', value: 'opt', description: 'desc' }],
      }),
    /Interactive selection requires a TTY/,
  );
});

test('promptYesNo returns default (true) when not in a TTY', async () => {
  const result = await promptYesNo({
    input: mockStream(false),
    output: mockStream(false),
    message: 'Continue?',
    default: true,
  });
  assert.equal(result, true);
});

test('promptYesNo returns default (false) when not in a TTY', async () => {
  const result = await promptYesNo({
    input: mockStream(false),
    output: mockStream(false),
    message: 'Continue?',
    default: false,
  });
  assert.equal(result, false);
});

test('promptYesNo returns true as default when default is omitted and not TTY', async () => {
  const result = await promptYesNo({
    input: mockStream(false),
    output: mockStream(false),
    message: 'Continue?',
  });
  assert.equal(result, true);
});

test('promptYesNo returns false when input is null and not TTY', async () => {
  const result = await promptYesNo({
    input: null,
    output: { isTTY: false },
    message: 'Continue?',
    default: false,
  });
  assert.equal(result, false);
});
