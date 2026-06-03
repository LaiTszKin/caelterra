import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '@laitszkin/cli';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function createMockStream() {
  let output = '';
  return {
    write: (s) => { output += String(s); },
    getOutput: () => output,
    isTTY: false,
  };
}

// ---- Success path -----------------------------------------------------------

test('run: successful help handler returns exit code 0 with stdout output', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['install', '--help'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
  });
  assert.equal(result, 0);
  const out = stdout.getOutput();
  assert.ok(out.includes('Usage'), `stdout should contain help text, got: ${out.slice(0, 200)}`);
});

// ---- Generic error from parser (parseArgs throws) ---------------------------

test('run: --home without value causes generic error on stderr and exit code 1', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['--home'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(err.includes('Error:'), `stderr should contain "Error:", got: ${err}`);
  assert.ok(err.includes('Missing value for --home'));
});

// ---- Generic error from installer (normalizeModes throws) -------------------

test('run: invalid mode causes error on stderr and exit code 1', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['invalid-mode'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(err.includes('Error:'), `stderr should contain "Error:", got: ${err}`);
  assert.ok(err.includes('Invalid mode'));
});

// ---- Tool dispatch success path (when tool modules are available) -----------

test('run: successful tool dispatch returns exit code 0', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['filter-logs', '--help'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    runTool: async () => 0,
  });
  assert.equal(result, 0);
});
