import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { parseArguments, buildHelpText, buildToolsHelp, run } from '@laitszkin/cli';
import { listTools, getTool, runTool } from '@laitszkin/tool-registry';

// Note: tools are not yet registered in the new registry (Batch 4).
// Tool handler tests will be enabled after tool migration.

test('parseArguments recognizes direct tool invocation', () => {
  const parsed = parseArguments(['filter-logs', 'app.log', '--count-only']);
  assert.equal(parsed.command, 'tool');
  assert.equal(parsed.toolName, 'filter-logs');
  assert.deepEqual(parsed.toolArgs, ['app.log', '--count-only']);
});

test('parseArguments recognizes namespaced tool invocation', () => {
  const parsed = parseArguments(['tools', 'create-specs', 'Feature Name']);
  assert.equal(parsed.command, 'tool');
  assert.equal(parsed.toolName, 'create-specs');
  assert.deepEqual(parsed.toolArgs, ['Feature Name']);
});

test('parseArguments keeps tools help separate from install help', () => {
  const parsed = parseArguments(['tools']);
  assert.equal(parsed.command, 'tools-help');
  assert.equal(parsed.showToolsHelp, true);
  assert.equal(parsed.showHelp, false);
});

test('buildToolsHelp lists bundled tools', () => {
  const help = buildToolsHelp({ version: '1.2.3', colorEnabled: false });
  assert.match(help, /apltk tools/);
  assert.match(help, /Common goals:/);
});

test('buildHelpText provides task-oriented overview help', () => {
  const help = buildHelpText({ version: '1.2.3', colorEnabled: false });
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
