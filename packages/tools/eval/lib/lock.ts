/**
 * lock.ts — shared directory-based mutex for executor and scorer.
 *
 * Uses mkdir as an atomic lock primitive. Handles stale lock detection
 * (default 5-minute expiry) and two conflict modes: 'throw' (executor)
 * and 'skip' (scorer).
 *
 * Only uses Node.js built-in modules. No external dependencies.
 */

import { mkdir } from 'node:fs/promises';
import { statSync, rmSync } from 'node:fs';

export interface AcquireLockOptions {
  /** Lock age threshold in milliseconds before a lock is considered stale. Default: 5 min. */
  staleMs?: number;
  /** Conflict handling: 'throw' raises; 'skip' returns { skipped: true }. Default: 'throw'. */
  onConflict?: 'throw' | 'skip';
}

export interface AcquireLockResult {
  /** True when the lock could not be acquired and onConflict is 'skip'. */
  skipped?: boolean;
}

/**
 * Acquire a directory-based mutex lock.
 *
 * Creates the lock directory atomically (mkdir). On EEXIST, checks whether
 * the existing lock is stale (mtime > staleMs) — if so, removes it and
 * retries. If not stale, either throws or returns `{ skipped: true }`
 * depending on the `onConflict` option.
 *
 * @param lockPath - Absolute path for the lock directory
 * @param options - Optional stale timeout and conflict behaviour
 */
export async function acquireLock(
  lockPath: string,
  options?: AcquireLockOptions,
): Promise<AcquireLockResult> {
  const staleMs = options?.staleMs ?? 5 * 60 * 1000;
  const onConflict = options?.onConflict ?? 'throw';

  try {
    await mkdir(lockPath);
    return {};
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EEXIST') {
        // Check if the lock is stale (leftover from SIGKILL / crash)
        let mtime: number;
        try {
          mtime = statSync(lockPath).mtimeMs;
        } catch {
          if (onConflict === 'skip') return { skipped: true };
          throw new Error(
            'Another process is already in progress (lock exists)',
          );
        }
        if (Date.now() - mtime > staleMs) {
          rmSync(lockPath, { recursive: true, force: true });
          await mkdir(lockPath);
          return {};
        }
        if (onConflict === 'skip') return { skipped: true };
        throw new Error('Another process is already in progress (lock exists)');
      }
      if (onConflict === 'skip') return { skipped: true };
      throw new Error(`Cannot create lock at ${lockPath}: ${nodeErr.message}`);
    }
    if (onConflict === 'skip') return { skipped: true };
    throw new Error(`Failed to acquire lock: ${(err as Error).message}`);
  }
}
