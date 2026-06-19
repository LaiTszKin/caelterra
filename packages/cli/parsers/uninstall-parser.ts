import { parseArgs } from 'node:util';
import path from 'node:path';
import type { InstallMode, ParsedArguments } from '../types.js';
import type { CommandParser, UninstallCommand } from './types.js';
import { normalizeParseError } from './parser-utils.js';

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
      normalizeParseError(err);
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

  toParsedArguments(result: UninstallCommand): ParsedArguments {
    return {
      command: 'uninstall',
      modes: result.modes,
      showHelp: result.showHelp,
      showToolsHelp: false,
      toolkitHome: result.toolkitHome,
      toolName: null,
      toolArgs: [],
      linkMode: null,
      assumeYes: result.assumeYes,
      explicitInstallCommand: false,
      autoUpdateAction: null,
      helpTopic: result.helpTopic,
    };
  }
}
