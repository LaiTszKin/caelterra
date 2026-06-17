import test from 'node:test';
import assert from 'node:assert/strict';
import { promptForModes, promptYesNo } from '@laitszkin/tui';

test('promptForModes throws when not in a TTY', async () => {
  const input = { isTTY: false };
  const output = { isTTY: false };
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
    input: { isTTY: false },
    output: { isTTY: false },
    message: 'Continue?',
    default: true,
  });
  assert.equal(result, true);
});

test('promptYesNo returns default (false) when not in a TTY', async () => {
  const result = await promptYesNo({
    input: { isTTY: false },
    output: { isTTY: false },
    message: 'Continue?',
    default: false,
  });
  assert.equal(result, false);
});

test('promptYesNo returns true as default when default is omitted and not TTY', async () => {
  const result = await promptYesNo({
    input: { isTTY: false },
    output: { isTTY: false },
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
