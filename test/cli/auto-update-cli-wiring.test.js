import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// Capture state shared between the mock and the test body.
/** @type {string[] | null} */
let capturedRunnerCommand = null;
let registerCallCount = 0;

// Mock the auto-update-scheduler module at the top level so the mock is
// installed before any dynamic import of the CLI module triggers module
// resolution of its static imports.
mock.module('../../packages/cli/dist/auto-update-scheduler.js', {
  namedExports: {
    buildRunnerCommand: (options) => {
      // Return same format as the real implementation so that
      // runnerCommand[1] is always the cliPath value.
      return [
        options.nodePath,
        options.cliPath,
        'auto-update',
        'run',
        '--home',
        options.toolkitHome,
      ];
    },
    registerAutoUpdateTask: (options) => {
      registerCallCount++;
      capturedRunnerCommand = options.runnerCommand;
      return { registered: true, platform: 'darwin', message: 'mocked' };
    },
    unregisterAutoUpdateTask: () => {
      return { registered: false, platform: 'darwin' };
    },
    getAutoUpdateTaskStatus: () => {
      return { registered: false, platform: 'darwin' };
    },
  },
});

test('auto-update enable uses bin wrapper path, not CLI library module', async (t) => {
  // Dynamic import after the top-level mock is installed.
  const { run } = await import('../../packages/cli/dist/index.js');

  // Create a temp directory to serve as toolkitHome.
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-wiring-test-'));
  t.after(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  // Fake stdout / stderr streams.
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  t.after(() => {
    stdout.destroy();
    stderr.destroy();
  });

  const context = {
    sourceRoot: repoRoot,
    stdout,
    stderr,
    env: { HOME: tempHome },
  };

  const exitCode = await run(
    ['auto-update', 'enable', '--home', tempHome],
    context,
  );

  // ---- Assertions ----

  // 1. Exit code is 0 (success).
  assert.strictEqual(exitCode, 0, `Expected exit code 0, got ${exitCode}`);

  // 2. registerAutoUpdateTask was called exactly once.
  assert.strictEqual(
    registerCallCount,
    1,
    'registerAutoUpdateTask should be called once',
  );

  // 3. runnerCommand was captured by the mock.
  assert.ok(capturedRunnerCommand, 'runnerCommand should be captured');

  // 4. runnerCommand[1] (the cliPath) ends with the bin wrapper path.
  const runnerBinPath = capturedRunnerCommand[1];
  const expectedSuffix = `dist${path.sep}bin${path.sep}apollo-toolkit.js`;
  assert.ok(
    runnerBinPath.endsWith(expectedSuffix),
    `runnerCommand[1] should end with ${expectedSuffix}, got: ${runnerBinPath}`,
  );

  // 5. runnerCommand[1] does NOT end with the CLI library module path.
  const wrongSuffix = `packages${path.sep}cli${path.sep}dist${path.sep}index.js`;
  assert.ok(
    !runnerBinPath.endsWith(wrongSuffix),
    `runnerCommand[1] should NOT end with ${wrongSuffix}, got: ${runnerBinPath}`,
  );
});
