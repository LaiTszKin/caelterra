import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { UserInputError } from '@laitszkin/tool-utils';
import { InstallArgsParser } from '@laitszkin/cli';

test('InstallArgsParser: empty args creates default install command with no modes', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse([]);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, []);
  assert.equal(result.showHelp, false);
  assert.equal(result.toolkitHome, null);
  assert.equal(result.linkMode, null);
  assert.equal(result.explicitInstallCommand, false);
  assert.equal(result.helpTopic, 'overview');
});

test('InstallArgsParser: single mode parses correctly', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['codex']);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, ['codex']);
  assert.equal(result.showHelp, false);
});

test('InstallArgsParser: multiple modes parses correctly', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['codex', 'openclaw', 'trae']);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, ['codex', 'openclaw', 'trae']);
  assert.equal(result.showHelp, false);
});

test('InstallArgsParser: --symlink flag sets linkMode to symlink', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['--symlink']);
  assert.equal(result.linkMode, 'symlink');
  assert.deepEqual(result.modes, []);
});

test('InstallArgsParser: --copy flag sets linkMode to copy', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['--copy']);
  assert.equal(result.linkMode, 'copy');
  assert.deepEqual(result.modes, []);
});

test('InstallArgsParser: --symlink with --copy throws conflict error', () => {
  const parser = new InstallArgsParser();
  assert.throws(
    () => parser.parse(['--symlink', '--copy']),
    /Cannot use both --symlink and --copy/,
  );
});

test('InstallArgsParser: --copy with --symlink throws conflict error', () => {
  const parser = new InstallArgsParser();
  assert.throws(
    () => parser.parse(['--copy', '--symlink']),
    /Cannot use both --symlink and --copy/,
  );
});

test('InstallArgsParser: --home with path resolves to absolute path', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['codex', '--home', '/custom/path']);
  assert.equal(result.command, 'install');
  assert.equal(result.toolkitHome, path.resolve('/custom/path'));
  assert.deepEqual(result.modes, ['codex']);
});

test('InstallArgsParser: --help without modes sets helpTopic to overview', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'overview');
  assert.deepEqual(result.modes, []);
});

test('InstallArgsParser: --help with modes sets helpTopic to install', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['codex', '--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'install');
  assert.deepEqual(result.modes, ['codex']);
});

test('InstallArgsParser: --help with --symlink sets helpTopic to install', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['--help', '--symlink']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'install');
  assert.equal(result.linkMode, 'symlink');
});

test('InstallArgsParser: explicit install keyword sets flag', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['install', 'codex', '--copy']);
  assert.equal(result.explicitInstallCommand, true);
  assert.equal(result.command, 'install');
  assert.deepEqual(result.modes, ['codex']);
  assert.equal(result.linkMode, 'copy');
});

test('InstallArgsParser: install keyword without mode is still valid', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['install']);
  assert.equal(result.explicitInstallCommand, true);
  assert.deepEqual(result.modes, []);
});

test('InstallArgsParser: install --help sets helpTopic to install (due to explicitInstallCommand)', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['install', '--help']);
  assert.equal(result.showHelp, true);
  assert.equal(result.helpTopic, 'install');
  assert.equal(result.explicitInstallCommand, true);
});

test('InstallArgsParser: -h short flag works', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['-h']);
  assert.equal(result.showHelp, true);
});

test('InstallArgsParser: --home without a value throws UserInputError', () => {
  const parser = new InstallArgsParser();
  assert.throws(
    () => parser.parse(['codex', '--home']),
    (err) => {
      assert.ok(err instanceof UserInputError);
      assert.ok(err.message.includes('Missing value for --home'));
      return true;
    },
  );
});

test('InstallArgsParser: --home with trailing equals operator works', () => {
  const parser = new InstallArgsParser();
  const result = parser.parse(['--home=/some/path']);
  assert.equal(result.toolkitHome, path.resolve('/some/path'));
});

test('InstallArgsParser: unknown option re-throws the original parseArgs error', () => {
  const parser = new InstallArgsParser();
  assert.throws(() => parser.parse(['--unknown-option']), /Unknown option/);
});
