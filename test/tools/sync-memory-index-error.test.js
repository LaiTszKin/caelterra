import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { run } from '@laitszkin/cli';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function createMockStream() {
  let output = '';
  return {
    write: (s) => {
      output += String(s);
    },
    getOutput: () => output,
    isTTY: false,
  };
}

test('sync-memory-index: --agents-file without value writes Error: prefix and exits 1', async () => {
  const stdout = createMockStream();
  const stderr = createMockStream();
  const result = await run(['sync-memory-index', '--agents-file'], {
    sourceRoot: PROJECT_ROOT,
    stdout,
    stderr,
    env: {},
  });
  assert.equal(result, 1);
  const err = stderr.getOutput();
  assert.ok(
    err.includes('Error:'),
    `stderr should contain "Error:", got: ${err}`,
  );
  assert.ok(
    err.includes('--agents-file'),
    `stderr should mention --agents-file, got: ${err}`,
  );
});

test('sync-memory-index: unwritable agents-file path writes Error: prefix and exits 1', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-test-'));
  try {
    // Create a regular file that blocks directory creation
    const blockFile = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blockFile, '', 'utf8');

    // agents-file path whose parent can't be created because
    // a regular file exists where mkdirSync needs to descend
    const badPath = path.join(blockFile, 'nested', 'AGENTS.md');

    const stdout = createMockStream();
    const stderr = createMockStream();
    const result = await run(
      ['sync-memory-index', '--agents-file', badPath],
      {
        sourceRoot: PROJECT_ROOT,
        stdout,
        stderr,
        env: {},
      },
    );
    assert.equal(result, 1);
    const err = stderr.getOutput();
    assert.ok(
      err.includes('Error:'),
      `stderr should contain "Error:", got: ${err}`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
