import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('installer EPERM fallback', () => {
  it('replaceWithSymlink degrades to copy on EPERM', async (t) => {
    // Setup isolated temp directory
    const tmp = mkdtempSync(join(tmpdir(), 'eperm-test-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    // Create a mock toolkit home with one skill
    const toolkitHome = join(tmp, 'toolkit-home');
    const skillDir = join(toolkitHome, 'skills', 'test-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Test Skill\n');
    writeFileSync(join(skillDir, 'data.txt'), 'hello\n');

    // Create a target root (simulates ~/.codex/skills)
    const targetRoot = join(tmp, 'target');
    mkdirSync(targetRoot, { recursive: true });

    // Mock fsp.symlink to throw EPERM.
    // Use CJS require because node:fs/promises exports are non-configurable
    // in ESM and cannot be mocked via mock.method or direct assignment on
    // the ESM-imported module.  The CJS and ESM module caches share the
    // same underlying object, so this mock propagates to the installer.
    const fsp = require('node:fs/promises');
    const originalSymlink = fsp.symlink;
    fsp.symlink = () => {
      const err = new Error('EPERM: operation not permitted');
      err.code = 'EPERM';
      throw err;
    };

    // Capture stderr so we can verify the warning
    const stderrChunks = [];
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ..._args) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    try {
      const { installLinks } = await import(
        '../../packages/cli/dist/installer.js'
      );

      await installLinks({
        toolkitHome,
        modes: ['codex'],
        env: { ...process.env, CODEX_SKILLS_DIR: targetRoot },
        linkMode: 'symlink',
      });

      // ---- Verify copy fallback ----
      const targetSkillDir = join(targetRoot, 'test-skill');
      assert.ok(
        existsSync(targetSkillDir),
        'target skill directory should exist after EPERM fallback',
      );
      assert.ok(
        existsSync(join(targetSkillDir, 'SKILL.md')),
        'SKILL.md should be copied',
      );
      assert.equal(
        readFileSync(join(targetSkillDir, 'data.txt'), 'utf8'),
        'hello\n',
        'data.txt content should match source',
      );

      // ---- Verify warning was emitted ----
      const stderrOutput = stderrChunks.join('');
      assert.ok(
        stderrOutput.includes('Warning:'),
        'warning about EPERM fallback should be written to stderr',
      );
    } finally {
      process.stderr.write = origStderrWrite;
      fsp.symlink = originalSymlink;
    }
  });
});
