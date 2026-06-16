import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Import directly from dist (not the barrel export) since this module
// isn't registered in index.ts yet.
import {
  registerAutoUpdateTask,
  unregisterAutoUpdateTask,
  getAutoUpdateTaskStatus,
  buildRunnerCommand,
  detectPlatform,
} from '../../packages/cli/dist/auto-update-scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a fake executor that records every invocation and returns success
 * by default. Supports per-command response overrides via setResult().
 *
 * Access recorded calls via executor.calls.
 */
function createFakeExecutor() {
  const calls = [];
  const overrides = new Map();

  const exec = async (command, args) => {
    calls.push({ command, args: [...args] });
    const key = `${command} ${args.join(' ')}`;
    if (overrides.has(key)) {
      const r = overrides.get(key);
      if (r instanceof Error) throw r;
      return r;
    }
    return { stdout: '', stderr: '' };
  };

  exec.calls = calls;
  exec.setResult = (command, args, result) => {
    overrides.set(`${command} ${args.join(' ')}`, result);
  };
  return exec;
}

/**
 * Create a temporary directory to serve as a fake HOME.
 * Returns the path and a cleanup function.
 */
function createTempHome() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-scheduler-test-'));
  return {
    path: tmpDir,
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Create a common set of scheduler options for tests.
 */
function makeSchedulerOptions({ tempHome, platform, execOverride }) {
  const toolkitHome = path.join(tempHome, '.apollo-toolkit');
  const runnerCommand = buildRunnerCommand({
    nodePath: '/usr/local/bin/node',
    cliPath: '/opt/apollo-toolkit/dist/bin/apollo-toolkit.js',
    toolkitHome,
  });
  return {
    toolkitHome,
    runnerCommand,
    env: { HOME: tempHome, USERPROFILE: tempHome },
    exec: execOverride ?? createFakeExecutor(),
    platform,
  };
}

// ---------------------------------------------------------------------------
// buildRunnerCommand
// ---------------------------------------------------------------------------

test('buildRunnerCommand produces correct command array', () => {
  const result = buildRunnerCommand({
    nodePath: '/usr/local/bin/node',
    cliPath: '/opt/apltk/dist/bin/apollo-toolkit.js',
    toolkitHome: '/Users/test/.apollo-toolkit',
  });
  assert.deepEqual(result, [
    '/usr/local/bin/node',
    '/opt/apltk/dist/bin/apollo-toolkit.js',
    'auto-update',
    'run',
    '--home',
    '/Users/test/.apollo-toolkit',
  ]);
});

// ---------------------------------------------------------------------------
// detectPlatform
// ---------------------------------------------------------------------------

test('detectPlatform respects override', () => {
  assert.equal(detectPlatform('darwin'), 'darwin');
  assert.equal(detectPlatform('linux'), 'linux');
  assert.equal(detectPlatform('win32'), 'win32');
});

// ---------------------------------------------------------------------------
// macOS (darwin)
// ---------------------------------------------------------------------------

test('macOS: register creates plist and calls launchctl bootstrap', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'darwin', execOverride: exec });

  const result = await registerAutoUpdateTask(opts);

  assert.equal(result.registered, true);
  assert.equal(result.platform, 'darwin');
  assert.match(result.message, /launchd job/);

  // Plist was written to correct path
  const plistPath = path.join(tmp.path, 'Library', 'LaunchAgents', 'com.apollotoolkit.auto-update.plist');
  assert.ok(fs.existsSync(plistPath), 'plist file should exist');

  const plistContent = fs.readFileSync(plistPath, 'utf-8');
  assert.match(plistContent, /com\.apollotoolkit\.auto-update/);
  assert.match(plistContent, /ProgramArguments/);
  assert.match(plistContent, /StartCalendarInterval/);
  assert.match(plistContent, /StandardOutPath/);
  assert.match(plistContent, /StandardErrorPath/);

  // launchctl was called
  assert.equal(exec.calls.length, 1);
  assert.equal(exec.calls[0].command, 'launchctl');
  assert.equal(exec.calls[0].args[0], 'bootstrap');
  assert.match(exec.calls[0].args[1], /^gui\/\d+$/);
  assert.equal(exec.calls[0].args[2], plistPath);

  // Log directory was created
  assert.ok(fs.existsSync(path.join(opts.toolkitHome, 'logs')));

  tmp.cleanup();
});

test('macOS: unregister calls bootout and removes plist', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'darwin', execOverride: exec });

  // First register
  await registerAutoUpdateTask(opts);

  // Then unregister
  const result = await unregisterAutoUpdateTask(opts);

  assert.equal(result.registered, false);
  assert.equal(result.platform, 'darwin');

  // bootout was called
  const bootoutCall = exec.calls.find((c) => c.args[0] === 'bootout');
  assert.ok(bootoutCall, 'should have called launchctl bootout');

  // Plist was removed
  const plistPath = path.join(tmp.path, 'Library', 'LaunchAgents', 'com.apollotoolkit.auto-update.plist');
  assert.ok(!fs.existsSync(plistPath), 'plist should be removed');

  tmp.cleanup();
});

test('macOS: status checks plist existence and launchctl list', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'darwin', execOverride: exec });

  // Status without plist = not registered
  let status = await getAutoUpdateTaskStatus(opts);
  assert.equal(status.registered, false);
  assert.equal(status.platform, 'darwin');

  // Register makes the plist appear and exec succeed
  await registerAutoUpdateTask(opts);

  status = await getAutoUpdateTaskStatus(opts);
  assert.equal(status.registered, true);
  assert.equal(status.platform, 'darwin');

  tmp.cleanup();
});

// ---------------------------------------------------------------------------
// Linux
// ---------------------------------------------------------------------------

test('Linux: register creates unit files and calls systemctl commands', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: exec });

  const result = await registerAutoUpdateTask(opts);

  assert.equal(result.registered, true);
  assert.equal(result.platform, 'linux');
  assert.match(result.message, /systemd timer/);

  // Service file was written
  const servicePath = path.join(tmp.path, '.config', 'systemd', 'user', 'apollo-toolkit-update.service');
  assert.ok(fs.existsSync(servicePath), 'service file should exist');
  const serviceContent = fs.readFileSync(servicePath, 'utf-8');
  assert.match(serviceContent, /ExecStart=/);
  assert.match(serviceContent, /Type=oneshot/);
  assert.match(serviceContent, /auto-update run/);

  // Timer file was written
  const timerPath = path.join(tmp.path, '.config', 'systemd', 'user', 'apollo-toolkit-update.timer');
  assert.ok(fs.existsSync(timerPath), 'timer file should exist');
  const timerContent = fs.readFileSync(timerPath, 'utf-8');
  assert.match(timerContent, /OnCalendar=daily/);
  assert.match(timerContent, /Persistent=true/);

  // systemctl commands were called in order
  assert.equal(exec.calls.length, 2);
  assert.equal(exec.calls[0].command, 'systemctl');
  assert.deepEqual(exec.calls[0].args, ['--user', 'daemon-reload']);
  assert.equal(exec.calls[1].command, 'systemctl');
  assert.deepEqual(exec.calls[1].args, ['--user', 'enable', '--now', 'apollo-toolkit-update.timer']);

  tmp.cleanup();
});

test('Linux: unregister disables timer and removes unit files', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: exec });

  await registerAutoUpdateTask(opts);
  const result = await unregisterAutoUpdateTask(opts);

  assert.equal(result.registered, false);
  assert.equal(result.platform, 'linux');

  // disable --now was called: args = ['--user', 'disable', '--now', 'apollo-toolkit-update.timer']
  const disableCall = exec.calls.find((c) => c.args[1] === 'disable');
  assert.ok(disableCall, 'should have called systemctl disable --now');

  // Unit files were removed
  const servicePath = path.join(tmp.path, '.config', 'systemd', 'user', 'apollo-toolkit-update.service');
  const timerPath = path.join(tmp.path, '.config', 'systemd', 'user', 'apollo-toolkit-update.timer');
  assert.ok(!fs.existsSync(servicePath), 'service file should be removed');
  assert.ok(!fs.existsSync(timerPath), 'timer file should be removed');

  tmp.cleanup();
});

test('Linux: register handles quoted paths in ExecStart', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: exec });

  // Use a runner command with a space in the path
  opts.runnerCommand = [
    '/usr/local/bin/node',
    '/opt/my tools/apollo-toolkit.js',
    'auto-update',
    'run',
    '--home',
    opts.toolkitHome,
  ];

  await registerAutoUpdateTask(opts);

  const servicePath = path.join(tmp.path, '.config', 'systemd', 'user', 'apollo-toolkit-update.service');
  const serviceContent = fs.readFileSync(servicePath, 'utf-8');
  assert.match(serviceContent, /"\/opt\/my tools\/apollo-toolkit\.js"/);

  tmp.cleanup();
});

test('Linux: status calls systemctl is-enabled', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  // Make the is-enabled call return 'enabled'
  exec.setResult('systemctl', ['--user', 'is-enabled', 'apollo-toolkit-update.timer'], {
    stdout: 'enabled\n',
    stderr: '',
  });
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: exec });

  // Status with registered = true (executor returns 'enabled')
  const status = await getAutoUpdateTaskStatus(opts);
  assert.equal(status.registered, true);
  assert.equal(status.platform, 'linux');
  assert.match(status.message, /enabled/);

  tmp.cleanup();
});

test('Linux: status returns registered=false when timer is disabled', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  // Make the is-enabled call return 'disabled'
  exec.setResult('systemctl', ['--user', 'is-enabled', 'apollo-toolkit-update.timer'], {
    stdout: 'disabled\n',
    stderr: '',
  });
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: exec });

  const status = await getAutoUpdateTaskStatus(opts);
  assert.equal(status.registered, false);
  assert.equal(status.platform, 'linux');

  tmp.cleanup();
});

// ---------------------------------------------------------------------------
// Windows (win32)
// ---------------------------------------------------------------------------

test('Windows: register calls schtasks with SC DAILY and stable task name', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'win32', execOverride: exec });

  const result = await registerAutoUpdateTask(opts);

  assert.equal(result.registered, true);
  assert.equal(result.platform, 'win32');
  assert.match(result.message, /ApolloToolkitAutoUpdate/);

  // schtasks was called with correct arguments
  assert.equal(exec.calls.length, 1);
  assert.equal(exec.calls[0].command, 'schtasks');
  assert.ok(exec.calls[0].args.includes('/SC'), 'should include /SC');
  assert.ok(exec.calls[0].args.includes('DAILY'), 'should include DAILY');
  assert.ok(exec.calls[0].args.includes('/TN'), 'should include /TN');
  assert.ok(exec.calls[0].args.includes('ApolloToolkitAutoUpdate'), 'should include stable task name');
  assert.ok(exec.calls[0].args.includes('/ST'), 'should include /ST');
  assert.ok(exec.calls[0].args.includes('/F'), 'should include /F (force)');

  tmp.cleanup();
});

test('Windows: unregister calls schtasks /Delete', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'win32', execOverride: exec });

  await registerAutoUpdateTask(opts);
  const result = await unregisterAutoUpdateTask(opts);

  assert.equal(result.registered, false);
  assert.equal(result.platform, 'win32');

  const deleteCall = exec.calls.find((c) => c.args[0] === '/Delete');
  assert.ok(deleteCall, 'should have called schtasks /Delete');

  tmp.cleanup();
});

test('Windows: status calls schtasks /Query and returns registered=true', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'win32', execOverride: exec });

  const status = await getAutoUpdateTaskStatus(opts);
  assert.equal(status.registered, true);
  assert.equal(status.platform, 'win32');

  // Verify /Query was called
  const queryCall = exec.calls.find((c) => c.args[0] === '/Query');
  assert.ok(queryCall, 'should have called schtasks /Query');

  tmp.cleanup();
});

test('Windows: register /TR argument preserves spaces via quoteWindowsArg', async () => {
  const tmp = createTempHome();
  const exec = createFakeExecutor();
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'win32', execOverride: exec });

  // Override runnerCommand with paths containing spaces to verify quoteWindowsArg
  opts.runnerCommand = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files\\Apollo Toolkit\\dist\\bin\\apollo-toolkit.js',
    'auto-update',
    'run',
    '--home',
    'C:\\Users\\Jane Doe\\.apollo-toolkit',
  ];

  await registerAutoUpdateTask(opts);

  assert.equal(exec.calls.length, 1);
  assert.equal(exec.calls[0].command, 'schtasks');

  // Find /TR and read the next argument
  const args = exec.calls[0].args;
  const trIndex = args.indexOf('/TR');
  assert.notEqual(trIndex, -1, 'should include /TR flag');
  const tr = args[trIndex + 1];

  // Assert each spaced argument is double-quoted
  assert.match(tr, /"C:\\Program Files\\nodejs\\node\.exe"/);
  assert.match(tr, /"C:\\Program Files\\Apollo Toolkit\\dist\\bin\\apollo-toolkit\.js"/);
  assert.match(tr, /"C:\\Users\\Jane Doe\\.apollo-toolkit"/);

  // Assert non-spaced arguments still appear unquoted
  assert.match(tr, /auto-update run --home/);

  tmp.cleanup();
});

// ---------------------------------------------------------------------------
// Idempotent unregister (missing tasks)
// ---------------------------------------------------------------------------

test('unregister: handles missing tasks gracefully on all platforms', async () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const tmp = createTempHome();
    const exec = createFakeExecutor();
    const opts = makeSchedulerOptions({ tempHome: tmp.path, platform, execOverride: exec });

    // Unregister without prior registration — should not throw
    const result = await unregisterAutoUpdateTask(opts);
    assert.equal(result.registered, false, `unregister on ${platform} should return registered=false`);
    assert.equal(result.platform, platform);

    tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Command failure: register throws (error propagates through outer catch)
// ---------------------------------------------------------------------------

test('command failure: register throws error including platform and action', async () => {
  const tmp = createTempHome();
  const failingExec = async () => {
    throw new Error('execution failed');
  };
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'darwin', execOverride: failingExec });

  await assert.rejects(
    () => registerAutoUpdateTask(opts),
    (err) => {
      assert.match(err.message, /darwin/);
      assert.match(err.message, /register/);
      return true;
    },
  );

  tmp.cleanup();
});

// ---------------------------------------------------------------------------
// Command failure: unregister and status catch errors internally
// ---------------------------------------------------------------------------

test('command failure: unregister does not throw, returns registered=false', async () => {
  const tmp = createTempHome();
  const failingExec = async () => {
    throw new Error('execution failed');
  };
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: failingExec });

  // Unregister catches exec errors internally — should not throw
  const result = await unregisterAutoUpdateTask(opts);
  assert.equal(result.registered, false);
  assert.equal(result.platform, 'linux');

  tmp.cleanup();
});

test('command failure: status catches exec errors and returns registered=false', async () => {
  const tmp = createTempHome();
  const failingExec = async () => {
    throw new Error('execution failed');
  };
  const opts = makeSchedulerOptions({ tempHome: tmp.path, platform: 'linux', execOverride: failingExec });

  const result = await getAutoUpdateTaskStatus(opts);
  assert.equal(result.registered, false);

  tmp.cleanup();
});
