/**
 * Cross-platform abstraction layer for OS-dependent operations.
 *
 * Provides a PlatformAdapter interface with WindowsAdapter and PosixAdapter
 * implementations, selected at runtime by createPlatformAdapter().
 */

import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Platform adapter interface providing OS-abstracted utility methods.
 */
export interface PlatformAdapter {
  /** Returns 'junction' on Windows, 'dir' on POSIX (for fs.symlink). */
  symlinkType(): 'junction' | 'dir';

  /** Returns the user's home directory. */
  homeDir(): string;

  /** Appends '.cmd' on Windows for npm/node commands. */
  resolveCommand(command: string): string;

  /** Platform-specific end-of-line marker. */
  readonly EOL: string;

  /** Normalizes path separators via path.normalize(). */
  normalizePath(p: string): string;
}

/**
 * Windows implementation of PlatformAdapter.
 */
export class WindowsAdapter implements PlatformAdapter {
  symlinkType(): 'junction' | 'dir' {
    return 'junction';
  }

  homeDir(): string {
    return process.env.USERPROFILE
      ?? process.env.HOME
      ?? os.homedir();
  }

  resolveCommand(command: string): string {
    if (command === 'npm' || command === 'node') {
      return `${command}.cmd`;
    }
    return command;
  }

  get EOL(): string {
    return os.EOL;
  }

  normalizePath(p: string): string {
    return path.normalize(p);
  }
}

/**
 * POSIX implementation of PlatformAdapter.
 */
export class PosixAdapter implements PlatformAdapter {
  symlinkType(): 'junction' | 'dir' {
    return 'dir';
  }

  homeDir(): string {
    return process.env.HOME
      ?? process.env.USERPROFILE
      ?? os.homedir();
  }

  resolveCommand(command: string): string {
    return command;
  }

  get EOL(): string {
    return os.EOL;
  }

  normalizePath(p: string): string {
    return path.normalize(p);
  }
}

/**
 * Factory that returns the appropriate PlatformAdapter for the current OS.
 */
export function createPlatformAdapter(): PlatformAdapter {
  if (process.platform === 'win32') {
    return new WindowsAdapter();
  }
  return new PosixAdapter();
}
