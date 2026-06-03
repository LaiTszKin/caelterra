import { parseArgs } from 'node:util';
import path from 'node:path';
import type { InstallMode } from '../types.js';
import type { CommandParser, UninstallCommand } from './types.js';

/**
 * Parser for the uninstall command mode.
 *
 * Recognises:
 *   - Positional args: 'uninstall' keyword, mode names (codex, openclaw, ...)
 *   - --help / -h
 *   - --home <path>
 *   - --yes / -y
 */
export class UninstallArgsParser implements CommandParser<UninstallCommand> {
  parse(argv: string[]): UninstallCommand {
    let showHelp = false;
    let toolkitHome: string | null = null;
    let assumeYes = false;
    const modes: string[] = [];

    try {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          help: { type: 'boolean', short: 'h' },
          home: { type: 'string' },
          yes: { type: 'boolean', short: 'y' },
        },
      });

      showHelp = values.help ?? false;
      if (values.home) {
        toolkitHome = path.resolve(values.home);
      }
      assumeYes = values.yes ?? false;

      for (const pos of positionals) {
        if (pos !== 'uninstall') {
          modes.push(pos);
        }
      }
    } catch (err) {
      const message = (err as Error).message;
      // Normalise --home without a value to match the historical error message
      if (message.includes('--home') && (message.includes('argument missing') || message.includes('value'))) {
        throw new Error('Missing value for --home');
      }
      throw err;
    }

    return {
      command: 'uninstall',
      modes: modes as InstallMode[],
      showHelp,
      toolkitHome,
      assumeYes,
      helpTopic: 'uninstall',
    };
  }
}
