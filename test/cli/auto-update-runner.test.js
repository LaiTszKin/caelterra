import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal Apollo Toolkit source fixture with the given version.
 * Writes package.json and one managed skill so syncToolkitHome has content.
 */
function createSourceFixture(rootDir, version, skillContent) {
  mkdirSync(join(rootDir, 'skills', 'test-skill'), { recursive: true });
  writeFileSync(join(rootDir, 'skills', 'test-skill', 'SKILL.md'), skillContent, 'utf8');
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: '@laitszkin/cli', version }, null, 2),
    'utf8',
  );
}

/**
 * Read the auto-update status JSON from toolkitHome.
 */
function readStatusFile(toolkitHome) {
  const p = join(toolkitHome, '.apollo-toolkit-auto-update-status.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Read the auto-update config JSON from toolkitHome.
 */
function readConfigFile(toolkitHome) {
  const p = join(toolkitHome, '.apollo-toolkit-auto-update.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auto-update-runner', () => {
  // ---- Test 1: No-op when latest version is not newer ----
  it('returns no-op when latest version equals current version', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-noop-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Old content\n');

    // Fake PackageSource that returns the same version as current.
    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '1.0.0', spec: `${_pkgName}@1.0.0` }),
      extract: async (_spec, _dest) => {
        throw new Error('extract should not be called when version is not newer');
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, false, 'should indicate no update was performed');
    assert.equal(result.latestVersion, '1.0.0', 'should report latest version');
    assert.equal(result.previousVersion, '1.0.0', 'should report previous version');

    // Status file should have a lastRunAt timestamp.
    const status = readStatusFile(toolkitHome);
    assert.ok(status, 'status file should exist');
    assert.ok(status.lastRunAt, 'status should have lastRunAt');
    assert.equal(status.lastVersion, '1.0.0', 'status should record current version');
    assert.ok(!status.lastError, 'status should not have lastError');
  });

  it('returns no-op when latest version is older than current version', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-older-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '2.0.0', '# Newer content\n');

    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '1.0.0', spec: `${_pkgName}@1.0.0` }),
      extract: async () => { throw new Error('extract should not be called'); },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '2.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, false, 'should indicate no update was performed');
    assert.equal(result.latestVersion, '1.0.0', 'should report older latest version');
  });

  // ---- Test 2: Managed skill content is overwritten by extracted content ----
  it('overwrites managed skill content with extracted latest content', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-overwrite-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Old content\n');

    // Verify old content exists before update.
    const oldSkillFile = join(toolkitHome, 'skills', 'test-skill', 'SKILL.md');
    assert.match(readFileSync(oldSkillFile, 'utf8'), /Old content/);

    // Fake PackageSource that extracts new version to a temp dir.
    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '2.0.0', spec: `${_pkgName}@2.0.0` }),
      extract: async (_spec, dest) => {
        writeFileSync(join(dest, 'package.json'), JSON.stringify({ name: '@laitszkin/cli', version: '2.0.0' }));
        mkdirSync(join(dest, 'skills', 'test-skill'), { recursive: true });
        writeFileSync(join(dest, 'skills', 'test-skill', 'SKILL.md'), '# New content\n');
        // Also add a new skill that didn't exist before.
        mkdirSync(join(dest, 'skills', 'new-skill'), { recursive: true });
        writeFileSync(join(dest, 'skills', 'new-skill', 'SKILL.md'), '# New skill\n');
        return { version: '2.0.0', sourceRoot: dest };
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, true, 'should indicate update was performed');
    assert.equal(result.latestVersion, '2.0.0', 'should report new version');

    // Old content should now be overwritten.
    assert.match(readFileSync(oldSkillFile, 'utf8'), /New content/, 'old skill content should be overwritten');

    // New skill should exist.
    const newSkillFile = join(toolkitHome, 'skills', 'new-skill', 'SKILL.md');
    assert.ok(existsSync(newSkillFile), 'new skill from extracted package should exist');
    assert.match(readFileSync(newSkillFile, 'utf8'), /New skill/);

    // Status should record success.
    const status = readStatusFile(toolkitHome);
    assert.equal(status.lastVersion, '2.0.0');
    assert.ok(status.lastSuccessAt);
    assert.ok(!status.lastError);
  });

  // ---- Test 3a: Preserves disabled config during manual auto-update run ----
  it('preserves disabled config during manual auto-update run', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-disabled-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Old content\n');

    // Write config with disabled state before the run.
    writeFileSync(
      join(toolkitHome, '.apollo-toolkit-auto-update.json'),
      JSON.stringify({ enabled: false, updatedAt: '2026-06-16T00:00:00.000Z' }, null, 2),
      'utf8',
    );

    // Fake PackageSource that extracts a newer version successfully.
    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '2.0.0', spec: `${_pkgName}@2.0.0` }),
      extract: async (_spec, dest) => {
        writeFileSync(join(dest, 'package.json'), JSON.stringify({ name: '@laitszkin/cli', version: '2.0.0' }));
        mkdirSync(join(dest, 'skills', 'test-skill'), { recursive: true });
        writeFileSync(join(dest, 'skills', 'test-skill', 'SKILL.md'), '# New content\n');
        return { version: '2.0.0', sourceRoot: dest };
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
      autoUpdateEnabled: false,
    });

    assert.equal(result.updated, true, 'should indicate update was performed');
    assert.equal(result.latestVersion, '2.0.0', 'should report new version');

    // Config file must keep disabled state.
    const config = readConfigFile(toolkitHome);
    assert.ok(config, 'config file should exist');
    assert.equal(config.enabled, false, 'config.enabled should remain false');

    // Status file must record disabled state alongside update metadata.
    const status = readStatusFile(toolkitHome);
    assert.ok(status, 'status file should exist');
    assert.equal(status.enabled, false, 'status.enabled should be false');
    assert.ok(status.lastSuccessAt, 'status should have lastSuccessAt');
    assert.equal(status.lastVersion, '2.0.0', 'status should record new version');
  });

  // ---- Test 4b: Only updates manifest-backed installed targets ----
  it('updates only manifest-backed installed targets when candidate modes include all', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-manifest-scope-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const homeDir = join(tmp, 'home');
    const toolkitHome = join(homeDir, '.apollo-toolkit');
    const traeRoot = join(homeDir, '.trae', 'skills');

    // Create current toolkit content with version 1.0.0
    createSourceFixture(toolkitHome, '1.0.0', '# Old content\n');

    // Create existing Trae target skill (simulating previously installed skill)
    mkdirSync(join(traeRoot, 'test-skill'), { recursive: true });
    writeFileSync(join(traeRoot, 'test-skill', 'SKILL.md'), '# Locally modified target\n', 'utf8');

    // Write Trae manifest via writeManifest
    const { writeManifest } = await import('../../packages/cli/dist/installer.js');
    await writeManifest(traeRoot, {
      version: '1.0.0',
      linkMode: 'copy',
      skills: ['test-skill'],
      previousSkills: [],
    });

    // Intentionally do NOT create .openclaw directory (should not cause error)

    // Fake PackageSource that extracts version 2.0.0 with updated skill content
    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '2.0.0', spec: `${_pkgName}@2.0.0` }),
      extract: async (_spec, dest) => {
        writeFileSync(
          join(dest, 'package.json'),
          JSON.stringify({ name: '@laitszkin/cli', version: '2.0.0' }),
          'utf8',
        );
        mkdirSync(join(dest, 'skills', 'test-skill'), { recursive: true });
        writeFileSync(join(dest, 'skills', 'test-skill', 'SKILL.md'), '# New content\n', 'utf8');
        return { version: '2.0.0', sourceRoot: dest };
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: ['codex', 'openclaw', 'trae', 'agents', 'claude-code'],
      env: { HOME: homeDir, APOLLO_TOOLKIT_HOME: toolkitHome },
      packageSource: fakeSource,
    });

    assert.equal(result.updated, true, 'should indicate update was performed');
    assert.equal(result.latestVersion, '2.0.0', 'should report new version');
    assert.equal(result.previousVersion, '1.0.0', 'should report previous version');
    assert.ok(!result.lastError, 'should have no error');

    // Trae skill (which HAS a manifest) SHOULD be updated
    assert.equal(
      readFileSync(join(traeRoot, 'test-skill', 'SKILL.md'), 'utf8'),
      '# New content\n',
      'Trae skill should be updated with new content',
    );

    // Unselected targets (no manifest) should NOT have skill directories created
    assert.equal(
      existsSync(join(homeDir, '.codex', 'skills', 'test-skill')),
      false,
      'Codex skill should NOT exist',
    );
    assert.equal(
      existsSync(join(homeDir, '.agents', 'skills', 'test-skill')),
      false,
      'Agents skill should NOT exist',
    );
    assert.equal(
      existsSync(join(homeDir, '.claude', 'skills', 'test-skill')),
      false,
      'Claude Code skill should NOT exist',
    );

    // OpenClaw directory should not be created (error was caught and skipped)
    assert.equal(
      existsSync(join(homeDir, '.openclaw')),
      false,
      'OpenClaw directory should NOT have been created',
    );

    // Status should record success
    const status = readStatusFile(toolkitHome);
    assert.ok(status, 'status file should exist');
    assert.equal(status.lastVersion, '2.0.0', 'status should record new version');
    assert.ok(status.lastSuccessAt, 'status should have lastSuccessAt');
    assert.ok(!status.lastError, 'status should not have lastError');
  });

  // ---- Test 5: Extraction/validation failure preserves previous toolkit home ----
  it('preserves previous toolkit home when validation fails (missing skills/)', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-bad-extract-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Content that should survive\n');

    // Fake extract that writes package.json but NO skills/ directory.
    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '3.0.0', spec: `${_pkgName}@3.0.0` }),
      extract: async (_spec, dest) => {
        writeFileSync(join(dest, 'package.json'), JSON.stringify({ name: '@laitszkin/cli', version: '3.0.0' }));
        // Intentionally NOT creating skills/ — validation should fail.
        return { version: '3.0.0', sourceRoot: dest };
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, false, 'should indicate update failed');
    assert.ok(result.lastError, 'should have an error message');
    assert.ok(
      result.lastError.includes('skills'),
      `error should mention missing skills/, got: ${result.lastError}`,
    );

    // Original toolkit home content must be untouched.
    const skillFile = join(toolkitHome, 'skills', 'test-skill', 'SKILL.md');
    assert.ok(existsSync(skillFile), 'original skill should still exist');
    assert.match(
      readFileSync(skillFile, 'utf8'),
      /Content that should survive/,
      'original skill content should be intact',
    );

    // package.json should still be the old version.
    const pkg = JSON.parse(readFileSync(join(toolkitHome, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '1.0.0', 'toolkit home package.json should remain at old version');
  });

  it('preserves previous toolkit home when package.json is missing', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-no-pkgjson-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Survivor content\n');

    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '3.0.0', spec: `${_pkgName}@3.0.0` }),
      extract: async (_spec, dest) => {
        // Write skills but NOT package.json.
        mkdirSync(join(dest, 'skills', 'test-skill'), { recursive: true });
        writeFileSync(join(dest, 'skills', 'test-skill', 'SKILL.md'), '# New\n');
        return { version: '3.0.0', sourceRoot: dest };
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, false);
    assert.ok(result.lastError);
    assert.ok(result.lastError.includes('package.json'), 'error should mention missing package.json');

    // Original toolkit home should be intact.
    assert.ok(existsSync(join(toolkitHome, 'skills', 'test-skill', 'SKILL.md')));
    assert.equal(
      readFileSync(join(toolkitHome, 'skills', 'test-skill', 'SKILL.md'), 'utf8'),
      '# Survivor content\n',
    );
  });

  // ---- Test 4: Status records failure message ----
  it('records failure message in auto-update status file', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-status-fail-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Old\n');

    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '2.0.0', spec: `${_pkgName}@2.0.0` }),
      extract: async (_spec, _dest) => {
        throw new Error('Network timeout while fetching package');
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, false);
    assert.ok(result.lastError, 'should record error message in result');
    assert.ok(
      result.lastError.includes('Network timeout'),
      `error should describe the failure, got: ${result.lastError}`,
    );

    // Status file should contain the error.
    const status = readStatusFile(toolkitHome);
    assert.ok(status, 'status file should exist after failure');
    assert.ok(status.lastRunAt, 'should have lastRunAt even after failure');
    assert.ok(status.lastError, 'should have lastError');
    assert.ok(
      status.lastError.includes('Network timeout'),
      `status.lastError should describe the failure, got: ${status.lastError}`,
    );
  });

  // ---- Test 5: Lock prevents concurrent runner mutation ----
  it('returns lock error when lock file already exists', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-lock-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const toolkitHome = join(tmp, 'toolkit-home');
    createSourceFixture(toolkitHome, '1.0.0', '# Old content\n');

    // Manually create the lock file to simulate a concurrent run.
    const lockFile = join(toolkitHome, '.apollo-toolkit-auto-update.lock');
    writeFileSync(lockFile, '');

    const fakeSource = {
      resolveLatest: async (_pkgName) => ({ version: '2.0.0', spec: `${_pkgName}@2.0.0` }),
      extract: async (_spec, dest) => {
        writeFileSync(join(dest, 'package.json'), JSON.stringify({ name: '@laitszkin/cli', version: '2.0.0' }));
        mkdirSync(join(dest, 'skills', 'test-skill'), { recursive: true });
        writeFileSync(join(dest, 'skills', 'test-skill', 'SKILL.md'), '# New\n');
        return { version: '2.0.0', sourceRoot: dest };
      },
    };

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    const result = await runAutoUpdate({
      sourceRoot: tmp,
      toolkitHome,
      packageName: '@laitszkin/cli',
      currentVersion: '1.0.0',
      modes: [],
      packageSource: fakeSource,
    });

    assert.equal(result.updated, false, 'should indicate update was not performed');
    assert.ok(result.lastError, 'should have a lock error message');
    assert.ok(
      result.lastError.toLowerCase().includes('lock'),
      `error should mention lock, got: ${result.lastError}`,
    );

    // Toolkit home should NOT have been modified (the lock prevented the update).
    assert.match(
      readFileSync(join(toolkitHome, 'skills', 'test-skill', 'SKILL.md'), 'utf8'),
      /Old content/,
      'skill content should remain unchanged',
    );
  });

  // ---- Test 6: No path uses checkForPackageUpdate or npm install -g ----
  it('does not import or call checkForPackageUpdate', () => {
    const source = readFileSync('packages/cli/auto-update-runner.ts', 'utf8');
    // Check for actual import or call of checkForPackageUpdate, not comments.
    const lines = source.split('\n').filter(
      (l) => l.includes('checkForPackageUpdate') && !l.trim().startsWith('*') && !l.trim().startsWith('//'),
    );
    assert.equal(
      lines.length,
      0,
      `auto-update-runner should not import or call checkForPackageUpdate, found: ${lines.join(', ')}`,
    );
  });

  it('does not use npm install -g call in the runner code', () => {
    const source = readFileSync('packages/cli/auto-update-runner.ts', 'utf8');
    // "npm install -g" should not appear as a command string (exclude comments).
    const lines = source.split('\n').filter(
      (l) => l.includes('npm install') && !l.trim().startsWith('*') && !l.trim().startsWith('//'),
    );
    assert.equal(
      lines.length,
      0,
      `auto-update-runner should not contain "npm install" calls, found: ${lines.join(', ')}`,
    );
  });

  it('does not import or call checkForPackageUpdate in package-source.ts', () => {
    const source = readFileSync('packages/cli/package-source.ts', 'utf8');
    assert.ok(
      !source.includes('checkForPackageUpdate'),
      'package-source should not reference checkForPackageUpdate',
    );
  });

  // ---- Edge case: packageSource is required ----
  it('throws when packageSource is not provided', async (t) => {
    const tmp = mkdtempSync(join(tmpdir(), 'runner-no-source-'));
    t.after(() => rmSync(tmp, { recursive: true, force: true }));

    const { runAutoUpdate } = await import(
      '../../packages/cli/dist/auto-update-runner.js'
    );

    await assert.rejects(
      () => runAutoUpdate({
        sourceRoot: tmp,
        toolkitHome: join(tmp, 'home'),
        packageName: '@laitszkin/cli',
        currentVersion: '1.0.0',
        modes: [],
      }),
      /packageSource is required/,
      'should throw when packageSource is missing',
    );
  });
});
