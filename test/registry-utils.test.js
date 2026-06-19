import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerTool,
  getTool,
  listTools,
  runTool,
  formatExamples,
  formatToolList,
  buildToolDiscoveryHelp,
  isTopLevelToolHelpRequest,
} from '@laitszkin/tool-registry';

test.beforeEach(() => {
  // Clean registry by unregistering any previously registered tools
  // The registry is a module-level Map, so tests share state.
  // We rely on the fact that runTool('nonexistent') doesn't add anything.
  // Only register fresh tools that we need for each test group.
});

test.afterEach(() => {
  // No cleanup needed since we only register test tools once.
});

// Only register test tools once to avoid duplicate alias conflicts
let toolsRegistered = false;

function registerTestTools() {
  if (toolsRegistered) return;
  toolsRegistered = true;

  registerTool({
    name: 'alpha-tool',
    description: 'First test tool',
    category: 'Testing',
    aliases: ['at'],
    help: {
      useWhen: ['when you need to test the alpha tool'],
    },
  });

  registerTool({
    name: 'beta-tool',
    description: 'Second test tool',
    category: 'Testing',
    help: {
      useWhen: ['when you need to test the beta tool'],
    },
  });

  registerTool({
    name: 'standalone-tool',
    description: 'Tool with no aliases or help',
    category: 'Other',
  });
}

test('registerTool registers tool by name and aliases', () => {
  registerTestTools();
  const tool = getTool('alpha-tool');
  assert.ok(tool);
  assert.equal(tool.name, 'alpha-tool');
  const alias = getTool('at');
  assert.ok(alias);
  assert.equal(alias.canonicalName, 'alpha-tool');
});

test('getTool returns null for unknown tool', () => {
  assert.equal(getTool('this-does-not-exist'), null);
});

test('formatExamples formats command/result pairs', () => {
  const output = formatExamples([
    { command: 'apltk --help', result: 'Shows help' },
    { command: 'apltk tools', result: 'Lists tools' },
  ]);
  assert.match(output, /apltk --help/);
  assert.match(output, /Shows help/);
  assert.match(output, /apltk tools/);
  assert.match(output, /Lists tools/);
});

test('formatExamples handles empty array', () => {
  assert.equal(formatExamples([]), '');
});

test('formatToolList returns formatted string of tools', () => {
  registerTestTools();
  const output = formatToolList();
  assert.match(output, /alpha-tool/);
  assert.match(output, /First test tool/);
  assert.match(output, /beta-tool/);
  assert.match(output, /Second test tool/);
});

test('buildToolDiscoveryHelp categorizes tools by category', () => {
  registerTestTools();
  const output = buildToolDiscoveryHelp();
  assert.match(output, /Common goals/);
  assert.match(output, /Testing/);
  assert.match(output, /alpha-tool/);
  assert.match(output, /when you need to test the alpha tool/);
  assert.match(output, /beta-tool/);
  assert.match(output, /when you need to test the beta tool/);
});

test('buildToolDiscoveryHelp includes Other category for uncategorized tools', () => {
  registerTestTools();
  const output = buildToolDiscoveryHelp();
  assert.match(output, /Other/);
  assert.match(output, /standalone-tool/);
});

test('isTopLevelToolHelpRequest returns true for --help args', () => {
  assert.equal(isTopLevelToolHelpRequest(['--help']), true);
  assert.equal(isTopLevelToolHelpRequest(['-h']), true);
  assert.equal(isTopLevelToolHelpRequest(['--help', '-h']), true);
});

test('isTopLevelToolHelpRequest returns false for other args', () => {
  assert.equal(isTopLevelToolHelpRequest([]), false);
  assert.equal(isTopLevelToolHelpRequest(['status']), false);
  assert.equal(isTopLevelToolHelpRequest(['--help', 'status']), false);
  assert.equal(isTopLevelToolHelpRequest(null), false);
  assert.equal(isTopLevelToolHelpRequest(undefined), false);
});

test('runTool throws SystemError for tool with no handler', async () => {
  registerTestTools();
  // standalone-tool has no handler
  const stderr = { write() {} };
  await assert.rejects(
    () => runTool('standalone-tool', [], { stderr }),
    (err) => {
      assert.ok(err.message.includes('not fully configured'));
      return true;
    },
  );
});

test('listTools returns only canonical tools (no aliases)', () => {
  registerTestTools();
  const tools = listTools();
  // No tool should have a canonicalName field (only aliases have that)
  for (const t of tools) {
    assert.equal(t.canonicalName, undefined);
  }
  const names = tools.map((t) => t.name);
  assert.ok(names.includes('alpha-tool'));
  assert.ok(names.includes('beta-tool'));
  assert.ok(names.includes('standalone-tool'));
  // 'at' is an alias, not a canonical tool
  assert.ok(!names.includes('at'));
});

test('runTool dispatches handler when tool has one', async () => {
  registerTool({
    name: 'handler-tool',
    description: 'Tool with handler',
    handler: async () => 42,
  });
  const code = await runTool('handler-tool', [], { stderr: { write() {} } });
  assert.equal(code, 42);
});
