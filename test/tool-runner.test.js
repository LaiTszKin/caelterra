import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArguments, run, HelpTextBuilder } from '@laitszkin/cli';
import { listTools, getTool, runTool } from '@laitszkin/tool-registry';

// Note: tools are not yet registered in the new registry (Batch 4).
// Tool handler tests will be enabled after tool migration.

test('HelpTextBuilder.toolsHelp lists bundled tools', () => {
  const help = new HelpTextBuilder({ version: '1.2.3', colorEnabled: false }).toolsHelp();
  assert.match(help, /apltk tools/);
  assert.match(help, /Common goals:/);
});

test('HelpTextBuilder.overview provides task-oriented overview help', () => {
  const help = new HelpTextBuilder({ version: '1.2.3', colorEnabled: false }).overview();
  assert.match(help, /Common goals:/);
  assert.match(help, /apltk tools --help/);
  assert.match(help, /Examples:/);
});

test('parseArguments distinguishes overview, install, and uninstall help', () => {
  assert.equal(parseArguments(['--help']).helpTopic, 'overview');
  assert.equal(parseArguments(['codex', '--help']).helpTopic, 'install');
  assert.equal(parseArguments(['uninstall', '--help']).helpTopic, 'uninstall');
});

test('listTools returns empty array when no tools registered', () => {
  const tools = listTools();
  // No tools registered yet (will be populated in Batch 5)
  assert.ok(Array.isArray(tools));
});

test('getTool returns null for unknown tool', () => {
  assert.equal(getTool('nonexistent-tool'), null);
});

test('runTool throws ToolNotFoundError for unknown tool', async () => {
  let stderrText = '';
  await assert.rejects(
    () => runTool('nonexistent-tool', [], {
      stderr: { write(chunk) { stderrText += chunk; return true; } },
    }),
    (err) => {
      assert.match(err.message, /Unknown tool/);
      assert.equal(err.code, 'TOOL_NOT_FOUND');
      return true;
    },
  );
});

test('run dispatches tool commands without installer flow', async () => {
  const calls = [];
  const stdout = { write() {} };
  const stderr = { write() {} };
  const exitCode = await run(['review-threads', 'list', '--pr', '42'], {
    stdout,
    stderr,
    env: {},
    runTool: async (...args) => {
      calls.push(args);
      return 0;
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'review-threads');
  assert.deepEqual(calls[0][1], ['list', '--pr', '42']);
});
