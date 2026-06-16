import { parseArgs } from 'node:util';
import path from 'node:path';
import type { ParsedArguments } from '../types.js';
import type { AutoUpdateAction, AutoUpdateCommand, CommandParser } from './types.js';
import { normalizeParseError } from './parser-utils.js';

/**
 * Parser for the auto-update command mode.
 *
 * Recognises:
 *   - Positional args: 'auto-update' keyword, action name (enable, disable, status, run)
 *   - --help / -h
 *   - --home <path>
 *
 * When no action is supplied, defaults to `status`.
 *
 * Supported forms:
 *   auto-update status
 *   auto-update enable
 *   auto-update disable
 *   auto-update run
 *   auto-update --home <path> status
 *   auto-update status --home <path>
 *   auto-update --help
 */
export class AutoUpdateArgsParser implements CommandParser<AutoUpdateCommand> {
  /** Valid action keywords accepted by the parser. */
  private static readonly VALID_ACTIONS: readonly string[] = ['enable', 'disable', 'status', 'run'];

  parse(argv: string[]): AutoUpdateCommand {
    let showHelp = false;
    let toolkitHome: string | null = null;
    let action: AutoUpdateAction | null = null;

    try {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          help: { type: 'boolean', short: 'h' },
          home: { type: 'string' },
        },
      });

      showHelp = values.help ?? false;
      if (values.home) {
        toolkitHome = path.resolve(values.home);
      }

      for (const pos of positionals) {
        if (pos === 'auto-update') {
          continue;
        }
        if (AutoUpdateArgsParser.VALID_ACTIONS.includes(pos)) {
          action = pos as AutoUpdateAction;
        } else {
          // Reject unknown positional arguments
          throw new Error(`Unexpected argument: ${pos}`);
        }
      }
    } catch (err) {
      normalizeParseError(err);
    }

    // Default to 'status' when no action is supplied and --help is not requested
    if (!showHelp && action === null) {
      action = 'status';
    }

    return {
      command: 'auto-update',
      action,
      showHelp,
      toolkitHome,
      helpTopic: 'auto-update',
    };
  }

  toParsedArguments(result: AutoUpdateCommand): ParsedArguments {
    return {
      command: 'auto-update',
      modes: [],
      showHelp: result.showHelp,
      showToolsHelp: false,
      toolkitHome: result.toolkitHome,
      toolName: null,
      toolArgs: [],
      linkMode: null,
      assumeYes: false,
      explicitInstallCommand: false,
      autoUpdateAction: result.action,
      helpTopic: result.helpTopic,
    };
  }
}
