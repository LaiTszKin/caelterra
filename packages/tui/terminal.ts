import { Chalk } from 'chalk';
import { createPlatformAdapter } from '@laitszkin/tool-utils';

// Force-enabled chalk instance — the `enabled` parameter on `color()` already
// handles the TTY / NO_COLOR check, so we always produce ANSI codes here.
const forceChalk = new Chalk({ level: 1 });

// ANSI code → chalk function mapping for backward compatibility
const ANSI_MAP: Record<string, (s: string) => string> = {
  '1': (s: string) => forceChalk.bold(s),
  '2': (s: string) => forceChalk.dim(s),
  '1;32': (s: string) => forceChalk.bold.green(s),
  '1;33': (s: string) => forceChalk.bold.yellow(s),
  '1;36': (s: string) => forceChalk.bold.cyan(s),
  '1;31': (s: string) => forceChalk.bold.red(s),
  '1;37': (s: string) => forceChalk.bold.white(s),
};

/**
 * Check whether stdin/stdout are connected to an interactive terminal.
 *
 * On Unix/macOS `stdin.isTTY` and `stdout.isTTY` work reliably.
 * On Windows with MSYS2/MINGW (Git Bash, Cygwin) these return `undefined`
 * because the MSYS2 PTY layer communicates via pipes, not native console
 * handles. Fall back to environment variable detection for known Windows
 * terminal environments.
 */
export function isInteractive(
  stdin: { isTTY?: boolean },
  stdout: { isTTY?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (stdin.isTTY && stdout.isTTY) return true;
  const adapter = createPlatformAdapter();
  if (adapter.isWindows()) {
    if (env['MSYSTEM']) return true; // MSYS2/MINGW (Git Bash)
    if (env['WT_SESSION']) return true; // Windows Terminal / VS Code integrated terminal
    if (env['CMDER_ROOT']) return true; // ConEmu / cmder
  }
  return false;
}

export function supportsColor(
  stream: { isTTY?: boolean } | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !!(stream && isInteractive(stream, stream, env) && !env['NO_COLOR']);
}

export function supportsAnimation(
  stream: { isTTY?: boolean } | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !!(
    stream &&
    isInteractive(stream, stream, env) &&
    !env['CI'] &&
    env['APOLLO_TOOLKIT_NO_ANIMATION'] !== '1'
  );
}

export function color(text: string, code: string, enabled: boolean): string {
  if (!enabled) return text;
  const fn = ANSI_MAP[code];
  return fn ? fn(text) : text;
}

export function clearScreen(output: {
  isTTY?: boolean;
  write: (str: string) => boolean;
}): void {
  if (output.isTTY) {
    output.write('\x1b[2J\x1b[H');
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
