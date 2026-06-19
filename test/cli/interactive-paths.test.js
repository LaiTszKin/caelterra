import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { run, readAutoUpdateConfig } from '@laitszkin/cli';

function createMemoryStream(isTTY = false) {
  let data = '';
  const stream = new EventEmitter();
  stream.isTTY = isTTY;
  stream.write = (chunk) => {
    data += chunk;
    return true;
  };
  stream.toString = () => data;
  stream.resume = () => {};
  stream.pause = () => {};
  return stream;
}

async function createFixtureSource(rootDir) {
  await fs.mkdir(path.join(rootDir, 'skills', 'alpha-skill'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(rootDir, 'skills', 'alpha-skill', 'SKILL.md'),
    '# alpha\n',
    'utf8',
  );
  await fs.mkdir(path.join(rootDir, 'skills', 'beta-skill'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(rootDir, 'skills', 'beta-skill', 'SKILL.md'),
    '# beta\n',
    'utf8',
  );
  await fs.mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'scripts', 'install_skills.sh'),
    '#!/usr/bin/env bash\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'README.md'),
    '# Apollo Toolkit\n',
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, 'CHANGELOG.md'),
    '# Changelog\n',
    'utf8',
  );
  await fs.writeFile(path.join(rootDir, 'LICENSE'), 'MIT\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'AGENTS.md'), '# Agents\n', 'utf8');
  await fs.writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify(
      { name: '@laitszkin/apollo-toolkit', version: '4.1.4' },
      null,
      2,
    ),
    'utf8',
  );
  await fs.mkdir(path.join(rootDir, '.github'), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, '.github', 'ignored.txt'),
    'nope\n',
    'utf8',
  );
}

// ---- printUninstallSummary (empty result) ----

test('printUninstallSummary shows empty message when no installations found (via run uninstall)', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'interactive-empty-uninstall-'),
  );
  try {
    const sourceRoot = path.join(tempDir, 'source');
    const homeDir = path.join(tempDir, 'home');
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    await fs.mkdir(sourceRoot, { recursive: true });
    await fs.writeFile(
      path.join(sourceRoot, 'package.json'),
      JSON.stringify(
        { name: '@laitszkin/apollo-toolkit', version: '4.1.4' },
        null,
        2,
      ),
      'utf8',
    );

    const exitCode = await run(['uninstall', '--yes'], {
      sourceRoot,
      env: { HOME: homeDir, APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1' },
      stdin: createMemoryStream(),
      stdout,
      stderr,
    });

    const output = stdout.toString();
    assert.equal(exitCode, 0, stderr.toString());
    assert.match(output, /No Apollo Toolkit installations found/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

// ---- promptIncludeExclusiveSkills (no codex skills) ----

test('promptIncludeExclusiveSkills returns false when no codex skills exist (via run install)', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'interactive-no-codex-skills-'),
  );
  try {
    const sourceRoot = path.join(tempDir, 'source');
    const homeDir = path.join(tempDir, 'home');
    const toolkitHome = path.join(homeDir, '.apollo-toolkit');
    const traeRoot = path.join(homeDir, '.trae', 'skills');
    const stdout = createMemoryStream();
    const stderr = createMemoryStream();

    await fs.mkdir(sourceRoot, { recursive: true });
    await createFixtureSource(sourceRoot);
    await fs.mkdir(traeRoot, { recursive: true });

    const exitCode = await run(['trae', '--copy'], {
      sourceRoot,
      env: {
        HOME: homeDir,
        APOLLO_TOOLKIT_HOME: toolkitHome,
        APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1',
      },
      stdin: createMemoryStream(),
      stdout,
      stderr,
    });

    const output = stdout.toString();
    assert.equal(exitCode, 0, stderr.toString());
    assert.match(output, /Installation complete/);
    assert.ok(
      !output.includes('Exclusive skills detected'),
      `Expected no "Exclusive skills detected" in output, got:\n${output}`,
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

// ---- buildSymlinkInfo + promptSymlinkChoice output format ----

test(
  'buildSymlinkInfo and promptSymlinkChoice output correct format (via run install, no linkMode flag)',
  { skip: os.platform() === 'win32' },
  async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'interactive-symlink-info-'),
    );
    try {
      const sourceRoot = path.join(tempDir, 'source');
      const homeDir = path.join(tempDir, 'home');
      const toolkitHome = path.join(homeDir, '.apollo-toolkit');
      const traeRoot = path.join(homeDir, '.trae', 'skills');
      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      await fs.mkdir(sourceRoot, { recursive: true });
      await createFixtureSource(sourceRoot);
      await fs.mkdir(traeRoot, { recursive: true });

      const exitCode = await run(['trae'], {
        sourceRoot,
        env: {
          HOME: homeDir,
          APOLLO_TOOLKIT_HOME: toolkitHome,
          APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1',
        },
        stdin: createMemoryStream(),
        stdout,
        stderr,
      });

      const output = stdout.toString();
      assert.equal(exitCode, 0, stderr.toString());

      // buildSymlinkInfo output format
      assert.match(output, /Symlink mode/);
      assert.match(output, /Pro/);
      assert.match(output, /Con/);
      assert.match(output, /Skills auto-update/);
      assert.match(output, /No need to re-run installer/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  },
);

// ---- Auto-update default enablement after install ----

test(
  'install enables auto-update by default when no disabled config exists',
  { skip: os.platform() === 'win32' },
  async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'interactive-enable-auto-update-'),
    );
    try {
      const sourceRoot = path.join(tempDir, 'source');
      const homeDir = path.join(tempDir, 'home');
      const toolkitHome = path.join(homeDir, '.apollo-toolkit');
      const traeRoot = path.join(homeDir, '.trae', 'skills');
      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      await fs.mkdir(sourceRoot, { recursive: true });
      await createFixtureSource(sourceRoot);
      await fs.mkdir(traeRoot, { recursive: true });

      // No pre-existing auto-update config → auto-update should be enabled by default
      const exitCode = await run(['trae', '--copy'], {
        sourceRoot,
        env: {
          HOME: homeDir,
          APOLLO_TOOLKIT_HOME: toolkitHome,
          APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1',
        },
        stdin: createMemoryStream(),
        stdout,
        stderr,
      });

      assert.equal(exitCode, 0, stderr.toString());
      assert.match(stdout.toString(), /Installation complete/);

      // Verify auto-update config was written as enabled
      const config = await readAutoUpdateConfig(toolkitHome);
      assert.equal(config.enabled, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  },
);

test(
  'existing disabled auto-update config is preserved after install',
  { skip: os.platform() === 'win32' },
  async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'interactive-preserve-disabled-'),
    );
    try {
      const sourceRoot = path.join(tempDir, 'source');
      const homeDir = path.join(tempDir, 'home');
      const toolkitHome = path.join(homeDir, '.apollo-toolkit');
      const traeRoot = path.join(homeDir, '.trae', 'skills');
      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      await fs.mkdir(sourceRoot, { recursive: true });
      await createFixtureSource(sourceRoot);
      await fs.mkdir(traeRoot, { recursive: true });

      // Pre-create auto-update config as disabled
      await fs.mkdir(toolkitHome, { recursive: true });
      await fs.writeFile(
        path.join(toolkitHome, '.apollo-toolkit-auto-update.json'),
        JSON.stringify({ enabled: false, updatedAt: new Date().toISOString() }),
        'utf8',
      );

      const exitCode = await run(['trae', '--copy'], {
        sourceRoot,
        env: {
          HOME: homeDir,
          APOLLO_TOOLKIT_HOME: toolkitHome,
          APOLLO_TOOLKIT_SKIP_UPDATE_CHECK: '1',
        },
        stdin: createMemoryStream(),
        stdout,
        stderr,
      });

      assert.equal(exitCode, 0, stderr.toString());
      assert.match(stdout.toString(), /Installation complete/);

      // Verify auto-update config is still disabled
      const config = await readAutoUpdateConfig(toolkitHome);
      assert.equal(config.enabled, false);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  },
);
