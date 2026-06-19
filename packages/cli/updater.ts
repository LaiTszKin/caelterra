import { spawn } from 'node:child_process';
import { EOL } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { isInteractive } from '@laitszkin/tui';
import { createPlatformAdapter } from '@laitszkin/tool-utils';

interface Version {
  parts: number[];
  prerelease: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

interface UpdateCheckResult {
  checked: boolean;
  updated: boolean;
  latestVersion?: string;
  error?: Error;
}

function normalizeVersion(version: string): string {
  return (version || '').trim().replace(/^v/i, '');
}

function parseVersion(version: string): Version {
  const normalized = normalizeVersion(version);
  const [core = '', prerelease = ''] = normalized.split('-', 2);
  const parts = core.split('.').map((part) => Number.parseInt(part, 10) || 0);
  return { parts, prerelease };
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  const leftParts = leftVersion.parts;
  const rightParts = rightVersion.parts;
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta;
  }

  if (leftVersion.prerelease && !rightVersion.prerelease) return -1;
  if (!leftVersion.prerelease && rightVersion.prerelease) return 1;
  if (leftVersion.prerelease !== rightVersion.prerelease) {
    return leftVersion.prerelease.localeCompare(rightVersion.prerelease);
  }
  return 0;
}

function shouldSkipUpdateCheck({
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
}: {
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
}): boolean {
  return (
    env['APOLLO_TOOLKIT_SKIP_UPDATE_CHECK'] === '1' ||
    !isInteractive(stdin, stdout, env)
  );
}

export function execCommand(
  command: string,
  args: string[],
  {
    env = process.env,
    stdout,
    stderr,
  }: {
    env?: NodeJS.ProcessEnv;
    stdout?: NodeJS.WriteStream;
    stderr?: NodeJS.WriteStream;
  } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    // PlatformAdapter normalizes command names across OS (e.g., appending
    // .cmd on Windows) so spawn works reliably on any platform.
    const adapter = createPlatformAdapter();
    const child = spawn(adapter.resolveCommand(command), args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let capturedStdout = '';
    let capturedStderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      capturedStdout += chunk.toString('utf8');
      if (stdout) stdout.write(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      capturedStderr += chunk.toString('utf8');
      if (stderr) stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(
          new Error(
            capturedStderr.trim() ||
              `${command} exited with code ${String(code)}`,
          ),
        );
        return;
      }
      resolve({ stdout: capturedStdout, stderr: capturedStderr });
    });
  });
}

async function defaultConfirmUpdate({
  stdin,
  stdout,
  currentVersion,
  latestVersion,
  packageName,
}: {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  currentVersion: string;
  latestVersion: string;
  packageName: string;
}): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `A newer ${packageName} release is available (${currentVersion} -> ${latestVersion}). Update now? [Y/n] `,
    );
    const normalized = answer.trim().toLowerCase();
    return normalized === '' || normalized === 'y';
  } finally {
    rl.close();
  }
}

async function getLatestPublishedVersion({
  packageName,
  env = process.env,
  exec = execCommand,
}: {
  packageName: string;
  env?: NodeJS.ProcessEnv;
  exec?: typeof execCommand;
}): Promise<string> {
  const result = await exec('npm', ['view', packageName, 'version', '--json'], {
    env,
  });
  const parsed = JSON.parse(result.stdout.trim()) as string | string[];
  if (Array.isArray(parsed)) {
    return (parsed[parsed.length - 1] || '').trim();
  }
  return (parsed || '').trim();
}

export async function checkForPackageUpdate({
  packageName,
  currentVersion,
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  exec = execCommand,
  confirmUpdate = defaultConfirmUpdate,
}: {
  packageName: string;
  currentVersion: string;
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  exec?: typeof execCommand;
  confirmUpdate?: typeof defaultConfirmUpdate;
}): Promise<UpdateCheckResult> {
  if (shouldSkipUpdateCheck({ env, stdin, stdout })) {
    return { checked: false, updated: false };
  }

  try {
    const latestVersion = await getLatestPublishedVersion({
      packageName,
      env,
      exec,
    });
    if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
      return { checked: true, updated: false, latestVersion };
    }

    const approved = await confirmUpdate({
      stdin,
      stdout,
      currentVersion,
      latestVersion,
      packageName,
    });

    if (!approved) {
      stdout.write(`Continuing with ${packageName} ${currentVersion}.${EOL}`);
      return { checked: true, updated: false, latestVersion };
    }

    stdout.write(`Updating ${packageName} to ${latestVersion}...${EOL}`);
    await exec('npm', ['install', '-g', `${packageName}@latest`], {
      env,
      stdout,
      stderr,
    });
    stdout.write(
      `Update complete. Continuing with ${packageName} ${latestVersion}.${EOL}`,
    );

    return { checked: true, updated: true, latestVersion };
  } catch (error) {
    stderr.write(
      `Warning: unable to check or install package updates: ${(error as Error).message}${EOL}`,
    );
    return { checked: false, updated: false, error: error as Error };
  }
}
