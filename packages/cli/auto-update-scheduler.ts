/**
 * Cross-platform scheduler adapter for background auto-update tasks.
 *
 * Supports macOS (launchd), Linux (systemd user timers), and Windows (schtasks)
 * with an injectable command executor for testing without mutating real OS schedulers.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { userInfo } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SchedulerPlatform = 'darwin' | 'linux' | 'win32';

export interface SchedulerActionResult {
  registered: boolean;
  platform: string;
  message?: string;
}

export type SchedulerCommandExecutor = (
  command: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv },
) => Promise<{ stdout: string; stderr: string }>;

export interface SchedulerOptions {
  /** Apollo Toolkit home directory (used for logs). */
  toolkitHome: string;
  /** The command array to embed in the scheduled task definition. */
  runnerCommand: string[];
  /** Environment variables (for HOME / USERPROFILE resolution). */
  env?: NodeJS.ProcessEnv;
  /** Injected command executor (defaults to spawn-based). */
  exec?: SchedulerCommandExecutor;
  /** Platform override (for testing). */
  platform?: SchedulerPlatform;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export function detectPlatform(platformOverride?: SchedulerPlatform): SchedulerPlatform {
  if (platformOverride) return platformOverride;
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'win32';
  throw new Error(`Unsupported platform: ${process.platform}`);
}

// ---------------------------------------------------------------------------
// Default command executor (spawn-based)
// ---------------------------------------------------------------------------

export async function defaultExecutor(
  command: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options?.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let capturedStdout = '';
    let capturedStderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      capturedStdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      capturedStderr += chunk.toString('utf8');
    });

    child.on('error', reject);

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(capturedStderr.trim() || `${command} exited with code ${code}`));
        return;
      }
      resolve({ stdout: capturedStdout, stderr: capturedStderr });
    });
  });
}

// ---------------------------------------------------------------------------
// Runner command builder
// ---------------------------------------------------------------------------

/**
 * Build the command array that will be scheduled to run the auto-update runner.
 *
 * Produces an array suitable for embedding into launchd plist ProgramArguments,
 * systemd ExecStart (joined with spaces), or schtasks /TR (joined with spaces).
 */
export function buildRunnerCommand(options: { nodePath: string; cliPath: string; toolkitHome: string }): string[] {
  return [options.nodePath, options.cliPath, 'auto-update', 'run', '--home', options.toolkitHome];
}

// ---------------------------------------------------------------------------
// Platform task identifiers
// ---------------------------------------------------------------------------

const LAUNCHD_LABEL = 'com.apollotoolkit.auto-update';
const SYSTEMD_SERVICE_NAME = 'apollo-toolkit-update';
const SYSTEMD_TIMER_NAME = 'apollo-toolkit-update.timer';
const SCHTASKS_TASK_NAME = 'ApolloToolkitAutoUpdate';

// ---------------------------------------------------------------------------
// Helpers: task definition generators
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function quoteWindowsArg(arg: string): string {
  if (/[ "]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

function resolveHomeDir(platform: SchedulerPlatform, env: NodeJS.ProcessEnv): string {
  return platform === 'win32'
    ? (env.USERPROFILE ?? env.HOME ?? '')
    : (env.HOME ?? '');
}

function buildLaunchdPlist(options: {
  label: string;
  programArguments: string[];
  stdoutPath: string;
  stderrPath: string;
  startHour: number;
  startMinute: number;
}): string {
  const argsXml = options.programArguments
    .map((arg) => `    <string>${escapeXml(arg)}</string>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${options.label}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${options.startHour}</integer>
    <key>Minute</key>
    <integer>${options.startMinute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${options.stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${options.stderrPath}</string>
  <key>RunAtLoad</key>
  <false/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
`;
}

function buildSystemdService(options: { description: string; execStart: string }): string {
  return `[Unit]
Description=${options.description}

[Service]
Type=oneshot
ExecStart=${options.execStart}

[Install]
WantedBy=default.target
`;
}

function buildSystemdTimer(options: { description: string; onCalendar: string; persistent?: boolean }): string {
  return `[Unit]
Description=${options.description}

[Timer]
OnCalendar=${options.onCalendar}
${options.persistent !== false ? 'Persistent=true' : ''}

[Install]
WantedBy=timers.target
`;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Register a daily auto-update task on the current platform.
 */
export async function registerAutoUpdateTask(options: SchedulerOptions): Promise<SchedulerActionResult> {
  const platform = detectPlatform(options.platform);
  const exec = options.exec ?? defaultExecutor;
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDir(platform, env);
  const uid = userInfo().uid;

  try {
    switch (platform) {
      case 'darwin': {
        const launchAgentsDir = path.join(homeDir, 'Library', 'LaunchAgents');
        fs.mkdirSync(launchAgentsDir, { recursive: true });

        const plistPath = path.join(launchAgentsDir, `${LAUNCHD_LABEL}.plist`);
        const logsDir = path.join(options.toolkitHome, 'logs');
        fs.mkdirSync(logsDir, { recursive: true });

        const plistContent = buildLaunchdPlist({
          label: LAUNCHD_LABEL,
          programArguments: options.runnerCommand,
          stdoutPath: path.join(logsDir, 'update-stdout.log'),
          stderrPath: path.join(logsDir, 'update-stderr.log'),
          startHour: 9,
          startMinute: 0,
        });

        fs.writeFileSync(plistPath, plistContent, 'utf-8');
        await exec('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { env });

        return { registered: true, platform, message: `Registered launchd job at ${plistPath}` };
      }

      case 'linux': {
        const systemdUserDir = path.join(homeDir, '.config', 'systemd', 'user');
        fs.mkdirSync(systemdUserDir, { recursive: true });

        const servicePath = path.join(systemdUserDir, `${SYSTEMD_SERVICE_NAME}.service`);
        const timerPath = path.join(systemdUserDir, SYSTEMD_TIMER_NAME);

        // Quote arguments with spaces for systemd ExecStart
        const execStart = options.runnerCommand
          .map((arg) => (arg.includes(' ') ? `"${arg}"` : arg))
          .join(' ');

        const serviceContent = buildSystemdService({
          description: 'Apollo Toolkit auto-update',
          execStart,
        });

        const timerContent = buildSystemdTimer({
          description: 'Apollo Toolkit auto-update daily trigger',
          onCalendar: 'daily',
        });

        fs.writeFileSync(servicePath, serviceContent, 'utf-8');
        fs.writeFileSync(timerPath, timerContent, 'utf-8');

        await exec('systemctl', ['--user', 'daemon-reload'], { env });
        await exec('systemctl', ['--user', 'enable', '--now', SYSTEMD_TIMER_NAME], { env });

        return { registered: true, platform, message: `Registered systemd timer at ${timerPath}` };
      }

      case 'win32': {
        const commandStr = options.runnerCommand.map(quoteWindowsArg).join(' ');
        await exec('schtasks', [
          '/Create',
          '/SC', 'DAILY',
          '/TN', SCHTASKS_TASK_NAME,
          '/TR', commandStr,
          '/ST', '09:00',
          '/F',
        ], { env });

        return { registered: true, platform, message: `Registered scheduled task "${SCHTASKS_TASK_NAME}"` };
      }
    }
  } catch (error) {
    throw new Error(`Failed to register auto-update task on ${platform}: ${(error as Error).message}`);
  }
}

/**
 * Unregister the auto-update task on the current platform.
 *
 * Handles missing tasks gracefully (idempotent unregister).
 */
export async function unregisterAutoUpdateTask(options: SchedulerOptions): Promise<SchedulerActionResult> {
  const platform = detectPlatform(options.platform);
  const exec = options.exec ?? defaultExecutor;
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDir(platform, env);
  const uid = userInfo().uid;

  try {
    switch (platform) {
      case 'darwin': {
        const plistPath = path.join(homeDir, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);

        // Try bootout first, fall back to unload if job doesn't exist
        try {
          await exec('launchctl', ['bootout', `gui/${uid}/${LAUNCHD_LABEL}`], { env });
        } catch {
          try {
            await exec('launchctl', ['unload', plistPath], { env });
          } catch {
            // Neither worked — the job probably doesn't exist; still clean up the file
          }
        }

        try {
          fs.unlinkSync(plistPath);
        } catch {
          // Plist may already be gone
        }

        return { registered: false, platform, message: 'Unregistered launchd job' };
      }

      case 'linux': {
        try {
          await exec('systemctl', ['--user', 'disable', '--now', SYSTEMD_TIMER_NAME], { env });
        } catch {
          // Timer may not be enabled
        }

        const systemdUserDir = path.join(homeDir, '.config', 'systemd', 'user');
        try { fs.unlinkSync(path.join(systemdUserDir, SYSTEMD_TIMER_NAME)); } catch { /* ok */ }
        try { fs.unlinkSync(path.join(systemdUserDir, `${SYSTEMD_SERVICE_NAME}.service`)); } catch { /* ok */ }

        try {
          await exec('systemctl', ['--user', 'daemon-reload'], { env });
        } catch {
          // systemd may not be available
        }

        return { registered: false, platform, message: 'Unregistered systemd timer' };
      }

      case 'win32': {
        try {
          await exec('schtasks', ['/Delete', '/TN', SCHTASKS_TASK_NAME, '/F'], { env });
        } catch {
          // Task may not exist
        }

        return { registered: false, platform, message: `Unregistered scheduled task "${SCHTASKS_TASK_NAME}"` };
      }
    }
  } catch (error) {
    throw new Error(`Failed to unregister auto-update task on ${platform}: ${(error as Error).message}`);
  }
}

/**
 * Check whether the auto-update task is currently registered.
 */
export async function getAutoUpdateTaskStatus(options: SchedulerOptions): Promise<SchedulerActionResult> {
  const platform = detectPlatform(options.platform);
  const exec = options.exec ?? defaultExecutor;
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDir(platform, env);

  try {
    switch (platform) {
      case 'darwin': {
        const plistPath = path.join(homeDir, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);

        if (!fs.existsSync(plistPath)) {
          return { registered: false, platform, message: 'No launchd plist found' };
        }

        try {
          const result = await exec('launchctl', ['list', LAUNCHD_LABEL], { env });
          return { registered: true, platform, message: result.stdout.trim() };
        } catch {
          return { registered: false, platform, message: 'launchd job not loaded' };
        }
      }

      case 'linux': {
        try {
          const result = await exec('systemctl', ['--user', 'is-enabled', SYSTEMD_TIMER_NAME], { env });
          const isEnabled = result.stdout.trim() === 'enabled';
          return { registered: isEnabled, platform, message: isEnabled ? 'Timer is enabled' : 'Timer is disabled' };
        } catch {
          return { registered: false, platform, message: 'systemd timer not found' };
        }
      }

      case 'win32': {
        try {
          const result = await exec('schtasks', ['/Query', '/TN', SCHTASKS_TASK_NAME], { env });
          return { registered: true, platform, message: result.stdout.trim() };
        } catch {
          return { registered: false, platform, message: 'Task not found' };
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to get auto-update task status on ${platform}: ${(error as Error).message}`);
  }
}
