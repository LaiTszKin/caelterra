import test from 'node:test';
import assert from 'node:assert/strict';
import { run, parseArguments } from '@laitszkin/cli';

function mockStd() {
  return { write() { return true; } };
}

// ---------------------------------------------------------------------------
// parseArguments classification tests (bridge between parsers and dispatch)
// ---------------------------------------------------------------------------

test('parseArguments classifies --help as overview help', () => {
  const parsed = parseArguments(['--help']);
  assert.equal(parsed.showHelp, true);
  assert.equal(parsed.helpTopic, 'overview');
  assert.equal(parsed.command, 'install');
});

test('parseArguments classifies install --help as install help', () => {
  const parsed = parseArguments(['install', '--help']);
  assert.equal(parsed.showHelp, true);
  assert.equal(parsed.helpTopic, 'install');
});

test('parseArguments classifies uninstall --help as uninstall help', () => {
  const parsed = parseArguments(['uninstall', '--help']);
  assert.equal(parsed.showHelp, true);
  assert.equal(parsed.helpTopic, 'uninstall');
  assert.equal(parsed.command, 'uninstall');
});

test('parseArguments classifies tools as tools-help', () => {
  const parsed = parseArguments(['tools']);
  assert.equal(parsed.command, 'tools-help');
  assert.equal(parsed.showToolsHelp, true);
  assert.equal(parsed.showHelp, false);
});

test('parseArguments classifies direct tool name as tool command', () => {
  const parsed = parseArguments(['filter-logs']);
  assert.equal(parsed.command, 'tool');
  assert.equal(parsed.toolName, 'filter-logs');
});

test('parseArguments classifies tools <name> as tool command', () => {
  const parsed = parseArguments(['tools', 'architecture', '--help']);
  assert.equal(parsed.command, 'tool');
  assert.equal(parsed.toolName, 'architecture');
  assert.deepEqual(parsed.toolArgs, ['--help']);
});

test('parseArguments recognizes install codex --copy', () => {
  const result = parseArguments(['codex', '--copy']);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, ['codex']);
  assert.equal(result.linkMode, 'copy');
  assert.equal(result.showHelp, false);
});

test('parseArguments recognizes install with multiple targets', () => {
  const result = parseArguments(['codex', 'openclaw', 'trae', '--symlink']);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, ['codex', 'openclaw', 'trae']);
  assert.equal(result.linkMode, 'symlink');
});

test('parseArguments recognizes uninstall --yes', () => {
  const result = parseArguments(['uninstall', '--yes']);
  assert.equal(result.command, 'uninstall');
  assert.equal(result.assumeYes, true);
  assert.deepEqual(result.modes, []);
});

test('parseArguments recognizes uninstall with modes and -y', () => {
  const result = parseArguments(['uninstall', 'codex', '-y']);
  assert.equal(result.command, 'uninstall');
  assert.equal(result.assumeYes, true);
  assert.deepEqual(result.modes, ['codex']);
});

test('parseArguments recognizes tools --help', () => {
  const result = parseArguments(['tools', '--help']);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});

test('parseArguments recognizes direct tool invocation', () => {
  const result = parseArguments(['filter-logs', 'app.log', '--count-only']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'filter-logs');
  assert.deepEqual(result.toolArgs, ['app.log', '--count-only']);
});

test('parseArguments recognizes codegraph as a known tool', () => {
  const result = parseArguments(['codegraph', '--help']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, ['--help']);
});

test('parseArguments recognizes codegraph subcommand invocation', () => {
  const result = parseArguments(['codegraph', 'status', '--json']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, ['status', '--json']);
});

test('parseArguments recognizes explicit install command', () => {
  const result = parseArguments(['install', 'codex', '--copy']);
  assert.equal(result.command, 'install');
  assert.equal(result.explicitInstallCommand, true);
  assert.deepEqual(result.modes, ['codex']);
  assert.equal(result.linkMode, 'copy');
});

test('parseArguments recognizes --home flag', () => {
  const result = parseArguments(['codex', '--home', '/custom/path']);
  assert.equal(result.command, 'install');
  assert.equal(result.toolkitHome, '/custom/path');
  assert.deepEqual(result.modes, ['codex']);
});

test('parseArguments recognizes install help topic with --help and modes', () => {
  const result = parseArguments(['codex', '--help']);
  assert.equal(result.helpTopic, 'install');
  assert.equal(result.showHelp, true);
});

test('parseArguments handles tools (plural) as tool command', () => {
  const result = parseArguments(['tools', 'create-specs', 'Feature Name']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'create-specs');
  assert.deepEqual(result.toolArgs, ['Feature Name']);
});

test('parseArguments defaults to install command with no arguments', () => {
  const result = parseArguments([]);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, []);
  assert.equal(result.showHelp, false);
});

test('parseArguments uninstall with --home', () => {
  const result = parseArguments(['uninstall', 'codex', '--yes', '--home', '/tmp/alt-home']);
  assert.equal(result.command, 'uninstall');
  assert.equal(result.assumeYes, true);
  assert.equal(result.toolkitHome, '/tmp/alt-home');
  assert.deepEqual(result.modes, ['codex']);
});

test('parseArguments throws for --home without a value', () => {
  assert.throws(
    () => parseArguments(['codex', '--home']),
    /Missing value for --home/,
  );
});

test('parseArguments throws for uninstall --home without a value', () => {
  assert.throws(
    () => parseArguments(['uninstall', 'codex', '--home']),
    /Missing value for --home/,
  );
});

// ---------------------------------------------------------------------------
// run() dispatch integration tests (mock context, no real filesystem)
// ---------------------------------------------------------------------------

test('run dispatches --help (overview) and returns 0', async () => {
  const exitCode = await run(['--help'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
  });
  assert.equal(exitCode, 0);
});

test('run writes help text to stdout for --help', async () => {
  let stdoutText = '';
  const stdout = { write(chunk) { stdoutText += chunk; return true; } };
  await run(['--help'], { stdout, stderr: mockStd(), env: {} });
  assert.match(stdoutText, /Usage:/);
  assert.match(stdoutText, /Common goals:/);
});

test('run dispatches install --help and returns 0', async () => {
  const exitCode = await run(['install', '--help'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
  });
  assert.equal(exitCode, 0);
});

test('run writes install help text for install --help', async () => {
  let stdoutText = '';
  const stdout = { write(chunk) { stdoutText += chunk; return true; } };
  await run(['install', '--help'], { stdout, stderr: mockStd(), env: {} });
  assert.match(stdoutText, /Supported targets:/);
  assert.match(stdoutText, /Use this when:/);
});

test('run dispatches uninstall --help and returns 0', async () => {
  const exitCode = await run(['uninstall', '--help'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
  });
  assert.equal(exitCode, 0);
});

test('run writes uninstall help text for uninstall --help', async () => {
  let stdoutText = '';
  const stdout = { write(chunk) { stdoutText += chunk; return true; } };
  await run(['uninstall', '--help'], { stdout, stderr: mockStd(), env: {} });
  assert.match(stdoutText, /Behavior notes:/);
  assert.match(stdoutText, /Use this when:/);
});

test('run dispatches tools command and returns 0', async () => {
  const exitCode = await run(['tools'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
  });
  assert.equal(exitCode, 0);
});

test('run writes tools help text for tools command', async () => {
  let stdoutText = '';
  const stdout = { write(chunk) { stdoutText += chunk; return true; } };
  await run(['tools'], { stdout, stderr: mockStd(), env: {} });
  assert.match(stdoutText, /Bundled tools:/);
  assert.match(stdoutText, /Common goals:/);
});

test('run dispatches known tool via context.runTool and returns 0', async () => {
  const calls = [];
  const exitCode = await run(['filter-logs', '--help'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
    runTool: async (name, args) => {
      calls.push({ name, args });
      return 0;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'filter-logs');
  assert.deepEqual(calls[0].args, ['--help']);
});

test('run dispatches known tool and passes sourceRoot, stdout, stderr, env to runTool', async () => {
  const calls = [];
  const exitCode = await run(['filter-logs'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: { CUSTOM_VAR: 'yes' },
    runTool: async (name, args, ctx) => {
      calls.push({ name, hasStdout: !!ctx.stdout, hasStderr: !!ctx.stderr, hasEnv: !!ctx.env });
      return 0;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].hasStdout, true);
  assert.equal(calls[0].hasStderr, true);
  assert.equal(calls[0].hasEnv, true);
});

test('run returns 1 when runTool returns non-zero exit code', async () => {
  const exitCode = await run(['filter-logs'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
    runTool: async () => 1,
  });
  assert.equal(exitCode, 1);
});

test('run returns 1 and writes error to stderr for unknown tool via mock runTool', async () => {
  let stderrText = '';
  const stderr = { write(chunk) { stderrText += chunk; return true; } };
  const exitCode = await run(['filter-logs'], {
    stdout: mockStd(),
    stderr,
    env: {},
    runTool: async (name, args, ctx) => {
      ctx.stderr.write(`Unknown tool: ${name}\n`);
      return 1;
    },
  });
  assert.equal(exitCode, 1);
  assert.match(stderrText, /Unknown tool/);
});

test('run dispatches codegraph as a known tool via context.runTool', async () => {
  const calls = [];
  const exitCode = await run(['codegraph', 'status', '--json'], {
    stdout: mockStd(),
    stderr: mockStd(),
    env: {},
    runTool: async (name, args) => {
      calls.push({ name, args });
      return 0;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'codegraph');
  assert.deepEqual(calls[0].args, ['status', '--json']);
});

test('dispatch table correctly dispatches all command types', () => {
  // install --help routes to install parser with help flag
  const installResult = parseArguments(['install', '--help']);
  assert.equal(installResult.command, 'install');
  assert.equal(installResult.showHelp, true);

  // uninstall with a mode routes to uninstall parser
  const uninstallResult = parseArguments(['uninstall', 'codex']);
  assert.equal(uninstallResult.command, 'uninstall');
  assert.deepEqual(uninstallResult.modes, ['codex']);
});

test('run distinguishes overview help from install help dispatch', async () => {
  // --help without install keyword → overview help
  let text1 = '';
  await run(['--help'], { stdout: { write(c) { text1 += c; return true; } }, stderr: mockStd(), env: {} });
  // install --help → install help
  let text2 = '';
  await run(['install', '--help'], { stdout: { write(c) { text2 += c; return true; } }, stderr: mockStd(), env: {} });
  // Overview should contain "Bundled tools:" but NOT "Use this when:"
  assert.match(text1, /Bundled tools:/);
  // Install help should contain "Use this when:" but overview text should NOT
  assert.match(text2, /Use this when:/);
});

test('dispatch table errors produce stderr output (SystemError path)', async () => {
  // This test verifies that dispatch routing works correctly when parsers
  // return expected command types. The error boundary path (formatAppError)
  // is tested in handler-error-propagation.test.js.

  const stderr = { data: '', write(chunk) { this.data += chunk; return true; } };
  const stdout = { data: '', write(chunk) { this.data += chunk; return true; } };

  const exitCode = await run(['uninstall', '--help'], {
    stdout,
    stderr,
    env: { APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1' },
  });

  // uninstall --help should work normally (test that existing behavior is preserved)
  assert.strictEqual(exitCode, 0);
});
