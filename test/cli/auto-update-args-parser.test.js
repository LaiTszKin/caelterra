import test from 'node:test';
import assert from 'node:assert/strict';
import { UserInputError } from '@laitszkin/tool-utils';
import { AutoUpdateArgsParser } from '../../packages/cli/dist/parsers/auto-update-parser.js';

test('AutoUpdateArgsParser: empty args defaults to status action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse([]);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'status');
  assert.equal(result.showHelp, false);
  assert.equal(result.toolkitHome, null);
  assert.equal(result.helpTopic, 'auto-update');
});

test('AutoUpdateArgsParser: bare "auto-update" keyword defaults to status', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'status');
  assert.equal(result.showHelp, false);
});

test('AutoUpdateArgsParser: parse "status" action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', 'status']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'status');
});

test('AutoUpdateArgsParser: parse "enable" action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', 'enable']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'enable');
});

test('AutoUpdateArgsParser: parse "disable" action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', 'disable']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'disable');
});

test('AutoUpdateArgsParser: parse "run" action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', 'run']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'run');
});

test('AutoUpdateArgsParser: --home with path before action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', '--home', '/custom/path', 'status']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'status');
  assert.equal(result.toolkitHome, '/custom/path');
});

test('AutoUpdateArgsParser: --home with path after action', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', 'status', '--home', '/custom/path']);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.action, 'status');
  assert.equal(result.toolkitHome, '/custom/path');
});

test('AutoUpdateArgsParser: --help sets showHelp true', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', '--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'auto-update');
  assert.equal(result.action, null);
});

test('AutoUpdateArgsParser: -h short flag works', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', '-h']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'auto-update');
});

test('AutoUpdateArgsParser: --help with action still sets showHelp', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', 'status', '--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.action, 'status');
  assert.equal(result.helpTopic, 'auto-update');
});

test('AutoUpdateArgsParser: --home with equals operator works', () => {
  const parser = new AutoUpdateArgsParser();
  const result = parser.parse(['auto-update', '--home=/some/path', 'status']);
  assert.equal(result.toolkitHome, '/some/path');
  assert.equal(result.action, 'status');
});

test('AutoUpdateArgsParser: --home without a value throws UserInputError', () => {
  const parser = new AutoUpdateArgsParser();
  assert.throws(
    () => parser.parse(['auto-update', '--home']),
    (err) => {
      assert.ok(err instanceof UserInputError);
      assert.ok(err.message.includes('Missing value for --home'));
      return true;
    },
  );
});

test('AutoUpdateArgsParser: unknown option re-throws original parseArgs error', () => {
  const parser = new AutoUpdateArgsParser();
  assert.throws(
    () => parser.parse(['auto-update', '--unknown-option']),
    /Unknown option/,
  );
});

test('AutoUpdateArgsParser: unknown positional argument throws', () => {
  const parser = new AutoUpdateArgsParser();
  assert.throws(
    () => parser.parse(['auto-update', 'invalid-action']),
    /Unexpected argument: invalid-action/,
  );
});

test('AutoUpdateArgsParser: toParsedArguments maps all fields correctly', () => {
  const parser = new AutoUpdateArgsParser();
  const parsed = parser.parse(['auto-update', 'enable', '--home', '/tmp/test']);
  const result = parser.toParsedArguments(parsed);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.autoUpdateAction, 'enable');
  assert.equal(result.toolkitHome, '/tmp/test');
  assert.equal(result.showHelp, false);
  assert.equal(result.showToolsHelp, false);
  assert.deepEqual(result.modes, []);
  assert.equal(result.toolName, null);
  assert.deepEqual(result.toolArgs, []);
  assert.equal(result.linkMode, null);
  assert.equal(result.assumeYes, false);
  assert.equal(result.explicitInstallCommand, false);
  assert.equal(result.helpTopic, 'auto-update');
});

test('AutoUpdateArgsParser: toParsedArguments for status (default) maps correctly', () => {
  const parser = new AutoUpdateArgsParser();
  const parsed = parser.parse(['auto-update']);
  const result = parser.toParsedArguments(parsed);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.autoUpdateAction, 'status');
  assert.equal(result.helpTopic, 'auto-update');
});

test('AutoUpdateArgsParser: toParsedArguments for --help maps correctly', () => {
  const parser = new AutoUpdateArgsParser();
  const parsed = parser.parse(['auto-update', '--help']);
  const result = parser.toParsedArguments(parsed);
  assert.equal(result.command, 'auto-update');
  assert.equal(result.autoUpdateAction, null);
  assert.equal(result.showHelp, true);
});
