import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { UserInputError } from '@laitszkin/tool-utils';
import { UninstallArgsParser } from '@laitszkin/cli';

test('UninstallArgsParser: bare uninstall creates uninstall command with no modes', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall']);
  assert.equal(result.command, 'uninstall');
  assert.deepEqual(result.modes, []);
  assert.equal(result.showHelp, false);
  assert.equal(result.toolkitHome, null);
  assert.equal(result.assumeYes, false);
  assert.equal(result.helpTopic, 'uninstall');
});

test('UninstallArgsParser: uninstall with a single mode', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', 'codex']);
  assert.equal(result.command, 'uninstall');
  assert.deepEqual(result.modes, ['codex']);
  assert.equal(result.showHelp, false);
  assert.equal(result.assumeYes, false);
});

test('UninstallArgsParser: uninstall with multiple modes', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', 'codex', 'openclaw', 'trae']);
  assert.deepEqual(result.modes, ['codex', 'openclaw', 'trae']);
});

test('UninstallArgsParser: --yes flag sets assumeYes to true', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', '--yes']);
  assert.equal(result.assumeYes, true);
  assert.deepEqual(result.modes, []);
});

test('UninstallArgsParser: -y short flag sets assumeYes to true', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', '-y']);
  assert.equal(result.assumeYes, true);
});

test('UninstallArgsParser: --yes with mode parses both correctly', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', 'codex', '--yes']);
  assert.equal(result.assumeYes, true);
  assert.deepEqual(result.modes, ['codex']);
});

test('UninstallArgsParser: -y with mode parses both correctly', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', 'openclaw', '-y']);
  assert.equal(result.assumeYes, true);
  assert.deepEqual(result.modes, ['openclaw']);
});

test('UninstallArgsParser: --home with path sets toolkitHome', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', 'codex', '--home', '/custom/path']);
  assert.equal(result.toolkitHome, path.resolve('/custom/path'));
  assert.deepEqual(result.modes, ['codex']);
});

test('UninstallArgsParser: --home with --yes parses both correctly', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse([
    'uninstall',
    'codex',
    '--yes',
    '--home',
    '/tmp/alt-home',
  ]);
  assert.equal(result.assumeYes, true);
  assert.equal(result.toolkitHome, path.resolve('/tmp/alt-home'));
  assert.deepEqual(result.modes, ['codex']);
});

test('UninstallArgsParser: --help sets showHelp', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', '--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'uninstall');
  assert.deepEqual(result.modes, []);
});

test('UninstallArgsParser: --help with mode sets showHelp', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', 'codex', '--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'uninstall');
  assert.deepEqual(result.modes, ['codex']);
});

test('UninstallArgsParser: -h short flag works', () => {
  const parser = new UninstallArgsParser();
  const result = parser.parse(['uninstall', '-h']);
  assert.equal(result.showHelp, true);
});

test('UninstallArgsParser: --home without a value throws UserInputError', () => {
  const parser = new UninstallArgsParser();
  assert.throws(
    () => parser.parse(['uninstall', 'codex', '--home']),
    (err) => {
      assert.ok(err instanceof UserInputError);
      assert.ok(err.message.includes('Missing value for --home'));
      return true;
    },
  );
});

test('UninstallArgsParser: unknown option re-throws the original parseArgs error', () => {
  const parser = new UninstallArgsParser();
  assert.throws(
    () => parser.parse(['uninstall', '--unknown-option']),
    /Unknown option/,
  );
});
