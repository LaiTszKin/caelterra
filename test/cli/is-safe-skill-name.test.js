import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { isSafeSkillName } from '../../packages/cli/dist/installer.js';

test(
  'isSafeSkillName allows backslash on non-Windows',
  { skip: os.platform() === 'win32' },
  () => {
    assert.ok(isSafeSkillName('valid\\name'));
  },
);

test('isSafeSkillName still blocks null byte', () => {
  assert.ok(!isSafeSkillName('bad\0name'));
});

test('isSafeSkillName blocks path separators', () => {
  assert.ok(!isSafeSkillName('a/b'));
  assert.ok(!isSafeSkillName('..'));
  assert.ok(!isSafeSkillName('.'));
});

test('isSafeSkillName blocks absolute paths', () => {
  assert.ok(!isSafeSkillName('/etc/passwd'));
});

test('isSafeSkillName rejects empty string', () => {
  assert.ok(!isSafeSkillName(''));
});

test('isSafeSkillName rejects non-string types', () => {
  assert.ok(!isSafeSkillName(null));
  assert.ok(!isSafeSkillName(undefined));
  assert.ok(!isSafeSkillName(123));
});
