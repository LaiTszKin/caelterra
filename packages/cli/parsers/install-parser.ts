import { parseArgs } from 'node:util';
import path from 'node:path';
import { UserInputError } from '@laitszkin/tool-utils';
import type { InstallMode, ParsedArguments } from '../types.js';
import type { CommandParser, InstallCommand } from './types.js';
import { normalizeParseError } from './parser-utils.js';

/**
 * Parser for the install (default) command mode.
 *
 * Recognises:
 *   - Positional args: install keyword, mode names (codex, openclaw, ...)
 *   - --help / -h
 *   - --home <path>
 *   - --symlink, --copy
 */
export class InstallArgsParser implements CommandParser<InstallCommand> {
  parse(argv: string[]): InstallCommand {
    let showHelp = false;
    let toolkitHome: string | null = null;
    let linkMode: 'copy' | 'symlink' | null = null;
    let explicitInstallCommand = false;
    const modes: string[] = [];

    try {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          help: { type: 'boolean', short: 'h' },
          home: { type: 'string' },
          symlink: { type: 'boolean' },
          copy: { type: 'boolean' },
        },
      });

      showHelp = values.help ?? false;
      if (values.home) {
        toolkitHome = path.resolve(values.home);
      }
      if (values.symlink) {
        linkMode = 'symlink';
      }
      if (values.copy) {
        linkMode = 'copy';
      }
      if (values.symlink && values.copy) {
        throw new UserInputError('Cannot use both --symlink and --copy');
      }

      for (const pos of positionals) {
        if (pos === 'install') {
          explicitInstallCommand = true;
        } else {
          modes.push(pos);
        }
      }
    } catch (err) {
      normalizeParseError(err);
    }

    const helpTopic: 'overview' | 'install' = showHelp
      ? explicitInstallCommand ||
        modes.length > 0 ||
        linkMode !== null ||
        toolkitHome !== null
        ? 'install'
        : 'overview'
      : 'overview';

    return {
      command: 'install',
      modes: modes as InstallMode[],
      showHelp,
      toolkitHome,
      linkMode,
      explicitInstallCommand,
      helpTopic,
    };
  }

  toParsedArguments(result: InstallCommand): ParsedArguments {
    return {
      command: 'install',
      modes: result.modes,
      showHelp: result.showHelp,
      showToolsHelp: false,
      toolkitHome: result.toolkitHome,
      toolName: null,
      toolArgs: [],
      linkMode: result.linkMode,
      assumeYes: false,
      explicitInstallCommand: result.explicitInstallCommand,
      autoUpdateAction: null,
      helpTopic: result.helpTopic,
    };
  }
}
