import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolArgsParser } from '@laitszkin/cli';

test('ToolArgsParser: direct tool name with args', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['codegraph', 'status', '--json']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, ['status', '--json']);
});

test('ToolArgsParser: tools prefix with tool name and args', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tools', 'codegraph', 'app.log']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, ['app.log']);
});

test('ToolArgsParser: tool alias prefix works same as tools', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tool', 'codegraph', 'app.log']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, ['app.log']);
});

test('ToolArgsParser: tools alone returns tools-help', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tools']);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});

test('ToolArgsParser: tools --help returns tools-help', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tools', '--help']);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});

test('ToolArgsParser: tools -h returns tools-help', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tools', '-h']);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});

test('ToolArgsParser: empty args returns tools-help', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse([]);
  assert.equal(result.command, 'tools-help');
  assert.equal(result.showToolsHelp, true);
});

test('ToolArgsParser: direct tool name with no tool args', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['codegraph']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, []);
});

test('ToolArgsParser: unknown tool name still parsed correctly', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['some-unknown-tool', '--flag']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'some-unknown-tool');
  assert.deepEqual(result.toolArgs, ['--flag']);
});

test('ToolArgsParser: tools prefix with unknown tool name', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tools', 'some-unknown-tool']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'some-unknown-tool');
  assert.deepEqual(result.toolArgs, []);
});

test('ToolArgsParser: tools prefix with --help after tool name does NOT return tools-help', () => {
  const parser = new ToolArgsParser();
  const result = parser.parse(['tools', 'codegraph', '--help']);
  assert.equal(result.command, 'tool');
  assert.equal(result.toolName, 'codegraph');
  assert.deepEqual(result.toolArgs, ['--help']);
});
