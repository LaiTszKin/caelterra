import { open, readFile, rename, unlink, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// ── Constants ────────────────────────────────────────────────────────────────

export const AUTO_UPDATE_CONFIG_FILENAME = '.apollo-toolkit-auto-update.json';
export const AUTO_UPDATE_STATUS_FILENAME = '.apollo-toolkit-auto-update-status.json';
export const AUTO_UPDATE_LOG_DIRNAME = 'logs';
export const AUTO_UPDATE_LOCK_FILENAME = '.apollo-toolkit-auto-update.lock';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AutoUpdateConfig {
  enabled: boolean;
  updatedAt: string;
}

export interface AutoUpdateSchedulerInfo {
  registered: boolean;
  platform: string;
  message?: string;
  updatedAt: string;
}

export interface AutoUpdateStatus {
  enabled: boolean;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastVersion?: string;
  scheduler?: AutoUpdateSchedulerInfo;
}

export interface AutoUpdatePaths {
  config: string;
  status: string;
  lock: string;
  logDir: string;
  stdoutLog: string;
  stderrLog: string;
}

// ── Path resolution ──────────────────────────────────────────────────────────

export function resolveAutoUpdatePaths(toolkitHome: string): AutoUpdatePaths {
  const config = path.join(toolkitHome, AUTO_UPDATE_CONFIG_FILENAME);
  const status = path.join(toolkitHome, AUTO_UPDATE_STATUS_FILENAME);
  const lock = path.join(toolkitHome, AUTO_UPDATE_LOCK_FILENAME);
  const logDir = path.join(toolkitHome, AUTO_UPDATE_LOG_DIRNAME);
  const stdoutLog = path.join(logDir, 'stdout.log');
  const stderrLog = path.join(logDir, 'stderr.log');
  return { config, status, lock, logDir, stdoutLog, stderrLog };
}

// ── Config helpers ───────────────────────────────────────────────────────────

export async function readAutoUpdateConfig(toolkitHome: string): Promise<AutoUpdateConfig> {
  const { config: configPath } = resolveAutoUpdatePaths(toolkitHome);
  try {
    const content = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(content);
    if (typeof parsed.enabled === 'boolean') {
      return {
        enabled: parsed.enabled,
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
    // Malformed: missing or non-boolean enabled field
    return { enabled: true, updatedAt: new Date().toISOString() };
  } catch {
    // Missing or unreadable file, or JSON parse failure
    return { enabled: true, updatedAt: new Date().toISOString() };
  }
}

export async function writeAutoUpdateConfig(
  toolkitHome: string,
  config: AutoUpdateConfig,
): Promise<void> {
  const { config: configPath } = resolveAutoUpdatePaths(toolkitHome);
  const dir = path.dirname(configPath);
  const tmpPath = configPath + '.tmp';

  await mkdir(dir, { recursive: true });
  await writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  await rename(tmpPath, configPath);
}

// ── Status helpers ───────────────────────────────────────────────────────────

export async function readAutoUpdateStatus(
  toolkitHome: string,
): Promise<AutoUpdateStatus | null> {
  const { status: statusPath } = resolveAutoUpdatePaths(toolkitHome);
  try {
    const content = await readFile(statusPath, 'utf8');
    const parsed = JSON.parse(content);
    if (typeof parsed.enabled === 'boolean') {
      return parsed as AutoUpdateStatus;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeAutoUpdateStatus(
  toolkitHome: string,
  status: AutoUpdateStatus,
): Promise<void> {
  const { status: statusPath } = resolveAutoUpdatePaths(toolkitHome);
  const dir = path.dirname(statusPath);
  const tmpPath = statusPath + '.tmp';

  await mkdir(dir, { recursive: true });
  await writeFile(tmpPath, JSON.stringify(status, null, 2), 'utf8');
  await rename(tmpPath, statusPath);
}

// ── Lock helper ──────────────────────────────────────────────────────────────

export async function withAutoUpdateLock<T>(
  toolkitHome: string,
  fn: () => Promise<T>,
): Promise<T> {
  const { lock: lockPath } = resolveAutoUpdatePaths(toolkitHome);
  const dir = path.dirname(lockPath);
  await mkdir(dir, { recursive: true });

  try {
    const fd = await open(lockPath, 'wx');
    await fd.close();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      throw new Error(
        `Auto-update lock exists at ${lockPath}. Another auto-update process may be running.`,
      );
    }
    throw err;
  }

  try {
    return await fn();
  } finally {
    try {
      await unlink(lockPath);
    } catch {
      // Best-effort cleanup — ignore errors
    }
  }
}
