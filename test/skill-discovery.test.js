import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { iterSkillDirs } from '@laitszkin/tool-utils';

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'skill-disc-test-'));
}

test('iterSkillDirs returns empty array when skills directory does not exist', () => {
  const result = iterSkillDirs('/tmp/nonexistent-path-xyz-123');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('iterSkillDirs returns empty array when skills directory is empty', async () => {
  const tmpDir = await createTempDir();
  try {
    await fs.mkdir(path.join(tmpDir, 'skills'));
    const result = iterSkillDirs(tmpDir);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('iterSkillDirs returns skill directories with SKILL.md', async () => {
  const tmpDir = await createTempDir();
  try {
    await fs.mkdir(path.join(tmpDir, 'skills', 'my-skill'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tmpDir, 'skills', 'my-skill', 'SKILL.md'),
      '# My Skill\n',
    );
    const result = iterSkillDirs(tmpDir);
    assert.equal(result.length, 1);
    assert.ok(result[0].endsWith(path.join('skills', 'my-skill')));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('iterSkillDirs skips directories without SKILL.md', async () => {
  const tmpDir = await createTempDir();
  try {
    await fs.mkdir(path.join(tmpDir, 'skills', 'valid-skill'), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpDir, 'skills', 'invalid-skill'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tmpDir, 'skills', 'valid-skill', 'SKILL.md'),
      '# Valid\n',
    );
    const result = iterSkillDirs(tmpDir);
    assert.equal(result.length, 1);
    assert.ok(result[0].endsWith('valid-skill'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('iterSkillDirs returns skills sorted alphabetically', async () => {
  const tmpDir = await createTempDir();
  try {
    await fs.mkdir(path.join(tmpDir, 'skills', 'beta-skill'), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpDir, 'skills', 'alpha-skill'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tmpDir, 'skills', 'beta-skill', 'SKILL.md'),
      '# Beta\n',
    );
    await fs.writeFile(
      path.join(tmpDir, 'skills', 'alpha-skill', 'SKILL.md'),
      '# Alpha\n',
    );
    const result = iterSkillDirs(tmpDir);
    assert.equal(result.length, 2);
    assert.ok(result[0].endsWith('alpha-skill'));
    assert.ok(result[1].endsWith('beta-skill'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
