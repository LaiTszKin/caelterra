import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  syncToolkitHome,
  installLinks,
  listSkillNames,
  getManagedInstallTargets,
} from './installer.js';
import {
  withAutoUpdateLock,
  writeAutoUpdateStatus,
  readAutoUpdateStatus,
  writeAutoUpdateConfig,
} from './auto-update-state.js';
import { compareVersions } from './updater.js';
import type { PackageSource } from './package-source.js';
import type { InstallMode } from './types.js';

/**
 * Options passed to runAutoUpdate.
 */
export interface AutoUpdateOptions {
  /** Source root of the currently installed CLI (fallback, rarely used). */
  sourceRoot: string;
  /** Apollo Toolkit home directory (e.g. ~/.apollo-toolkit). */
  toolkitHome: string;
  /** npm package name to check for updates (e.g. @laitszkin/cli). */
  packageName: string;
  /** Currently installed version (semver string). */
  currentVersion: string;
  /** Target install modes (codex, openclaw, trae, agents, claude-code). */
  modes?: InstallMode[];
  /** Environment variables (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Package source abstraction; if omitted a pacote-backed one is created. */
  packageSource?: PackageSource;
  /** Preserves the persisted scheduler setting while a manual or scheduled run records status. */
  autoUpdateEnabled?: boolean;
}

/**
 * Result of a single auto-update run.
 */
export interface AutoUpdateResult {
  /** Whether an actual update was performed. */
  updated: boolean;
  /** The latest version that was found (may equal currentVersion). */
  latestVersion?: string;
  /** The version that was installed before this run. */
  previousVersion?: string;
  /** Error message if the run failed. */
  lastError?: string;
}

/**
 * Run a one-shot background update of Apollo Toolkit managed skills.
 *
 * Flow:
 *  1. Acquire the auto-update lock (mutual exclusion).
 *  2. Resolve the latest published package version.
 *  3. If already up-to-date → no-op success.
 *  4. Extract latest package into a temp directory.
 *  5. Validate extracted contents (package.json + skills/).
 *  6. Sync toolkit home with extracted content.
 *  7. Re-install links to target agent skill directories.
 *  8. Write success status and clean up temp directory.
 *  9. On any failure, write failure status and clean up.
 *
 * The runner explicitly never calls checkForPackageUpdate or npm install -g.
 */
export async function runAutoUpdate(options: AutoUpdateOptions): Promise<AutoUpdateResult> {
  const {
    toolkitHome,
    packageName,
    currentVersion,
    modes = [],
    env = process.env,
    packageSource,
    autoUpdateEnabled = true,
  } = options;

  if (!packageSource) {
    throw new Error('packageSource is required for auto-update');
  }

  // ----- Outer catch: lock-acquisition failure -----
  try {
    return await withAutoUpdateLock(toolkitHome, async () => {
      let tempDir: string | null = null;

      try {
        // 1. Resolve latest package metadata
        const latest = await packageSource.resolveLatest(packageName);

        // 2. No-op if we are already on the latest version
        if (compareVersions(latest.version, currentVersion) <= 0) {
          await writeRunnerStatus(toolkitHome, {
            enabled: autoUpdateEnabled,
            lastRunAt: new Date().toISOString(),
            lastSuccessAt: new Date().toISOString(),
            lastVersion: currentVersion,
          });
          return { updated: false, latestVersion: latest.version, previousVersion: currentVersion };
        }

        // 3. Create a temp directory for extraction
        tempDir = mkdtempSync(path.join(tmpdir(), 'apollo-update-'));

        // 4. Extract the latest package into the temp directory
        const extractResult = await packageSource.extract(latest.spec, tempDir);
        const extractedVersion = extractResult.version || latest.version;
        const extractedRoot = extractResult.sourceRoot;

        // 5. Validate extracted contents
        const pkgJsonPath = path.join(extractedRoot, 'package.json');
        const skillsPath = path.join(extractedRoot, 'skills');
        if (!fs.existsSync(pkgJsonPath)) {
          throw new Error(`Extracted package missing package.json at ${pkgJsonPath}`);
        }
        if (!fs.existsSync(skillsPath)) {
          throw new Error(`Extracted package missing skills/ directory at ${skillsPath}`);
        }

        // 6. Discover managed targets and derive managedModes
        const managedTargets = modes.length > 0 ? await getManagedInstallTargets(modes, env) : [];
        const managedModes = [...new Set(managedTargets.map((target) => target.id))];

        // 7. Sync toolkit home with the extracted source (using managedModes for codex content)
        await syncToolkitHome({
          sourceRoot: extractedRoot,
          toolkitHome,
          version: extractedVersion,
          modes: managedModes,
        });

        // 8. Re-install links only to managed agent targets
        if (managedModes.length > 0) {
          const previousSkillNames = await listSkillNames(toolkitHome, managedModes).catch(() => []);
          await installLinks({
            toolkitHome,
            modes: managedModes,
            previousSkillNames,
            linkMode: 'copy',
            env,
          });
        }

        // 9. Write success status
        await writeRunnerStatus(toolkitHome, {
          enabled: autoUpdateEnabled,
          lastRunAt: new Date().toISOString(),
          lastSuccessAt: new Date().toISOString(),
          lastVersion: extractedVersion,
        });

        // Persist updated config
        await writeAutoUpdateConfig(toolkitHome, {
          enabled: autoUpdateEnabled,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});

        return { updated: true, latestVersion: extractedVersion, previousVersion: currentVersion };
      } catch (error) {
        // Inner catch: update failure inside the lock
        const errorMessage = (error as Error).message;
        await writeRunnerStatus(toolkitHome, {
          enabled: autoUpdateEnabled,
          lastRunAt: new Date().toISOString(),
          lastError: errorMessage,
        });
        return { updated: false, lastError: errorMessage };
      } finally {
        // Always clean the temp directory
        if (tempDir) {
          await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    });
  } catch (lockError) {
    // Lock could not be acquired (another update is running)
    const errorMessage = `Lock acquisition failed: ${(lockError as Error).message}`;
    await writeRunnerStatus(toolkitHome, {
      enabled: autoUpdateEnabled,
      lastRunAt: new Date().toISOString(),
      lastError: errorMessage,
    });
    return { updated: false, lastError: errorMessage };
  }
}

/**
 * Write runner status while preserving existing status fields (e.g. scheduler
 * metadata written by the background-task-scheduler module).
 */
async function writeRunnerStatus(
  toolkitHome: string,
  fields: {
    enabled: boolean;
    lastRunAt: string;
    lastSuccessAt?: string;
    lastVersion?: string;
    lastError?: string;
  },
): Promise<void> {
  try {
    const existing = await readAutoUpdateStatus(toolkitHome).catch(() => null);
    await writeAutoUpdateStatus(toolkitHome, { ...(existing || { enabled: true }), ...fields });
  } catch {
    // Non-critical — status write failure should not interrupt the update flow.
  }
}
