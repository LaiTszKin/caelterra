/**
 * Cross-platform abstraction layer for OS-dependent operations.
 *
 * Provides a PlatformAdapter interface with WindowsAdapter and PosixAdapter
 * implementations, selected at runtime by createPlatformAdapter().
 */

import * as os from 'node:os';

/**
 * Platform adapter interface providing OS-abstracted utility methods.
 */
export interface PlatformAdapter {
  /** Returns 'junction' on Windows, 'dir' on POSIX (for fs.symlink). */
  symlinkType(): 'junction' | 'dir';

  /** Returns the user's home directory. Accepts optional env for test injection. */
  homeDir(env?: Record<string, string | undefined>): string;

  /** Appends '.cmd' on Windows for npm/node commands. */
  resolveCommand(command: string): string;

  /** Returns true on Windows (process.platform === 'win32'). */
  isWindows(): boolean;

  /**
   * OS-specific line ending.
   * Available for file writes that need \r\n (Windows) vs \n (POSIX).
   * Consumed by sync-memory-index for cross-platform file writes.
   */
  readonly EOL: string;

}

/**
 * Windows implementation of PlatformAdapter.
 */
export class WindowsAdapter implements PlatformAdapter {
  symlinkType(): 'junction' | 'dir' {
    return 'junction';
  }

  homeDir(env: Record<string, string | undefined> = process.env): string {
    return env.USERPROFILE
      ?? env.HOME
      ?? os.homedir();
  }

  resolveCommand(command: string): string {
    if (command === 'npm' || command === 'node') {
      return `${command}.cmd`;
    }
    return command;
  }

  isWindows(): boolean {
    return true;
  }

  get EOL(): string {
    // Available for consumers that need OS-specific line endings.
    // Consumed by sync-memory-index for cross-platform file writes.
    return os.EOL;
  }
}

/**
 * POSIX implementation of PlatformAdapter.
 */
export class PosixAdapter implements PlatformAdapter {
  symlinkType(): 'junction' | 'dir' {
    return 'dir';
  }

  homeDir(env: Record<string, string | undefined> = process.env): string {
    return env.HOME
      ?? env.USERPROFILE
      ?? os.homedir();
  }

  resolveCommand(command: string): string {
    return command;
  }

  isWindows(): boolean {
    return false;
  }

  get EOL(): string {
    // Available for consumers that need OS-specific line endings.
    // Consumed by sync-memory-index for cross-platform file writes.
    return os.EOL;
  }
}

/**
 * Factory that returns the appropriate PlatformAdapter for the current OS.
 * Singleton: the adapter is created once and cached for subsequent calls.
 */
let _adapter: PlatformAdapter | undefined;

export function createPlatformAdapter(): PlatformAdapter {
  if (!_adapter) {
    _adapter = process.platform === 'win32' ? new WindowsAdapter() : new PosixAdapter();
  }
  return _adapter;
}

/** Reset the cached adapter (for test use only). */
export function resetPlatformAdapter(adapter?: PlatformAdapter): void {
  _adapter = adapter;
}
