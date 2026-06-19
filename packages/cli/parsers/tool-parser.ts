import type { ParsedArguments } from '../types.js';
import type { CommandParser, ToolCommand, ToolsHelpCommand } from './types.js';

/**
 * Parser for tool-invocation modes.
 *
 * Two entry paths:
 *   1. `tools` / `tool` prefix – argv[0] is 'tools' or 'tool'
 *   2. Direct tool name – argv[0] is a known tool name (detected by caller)
 *
 * Returns a ToolsHelpCommand when no tool is named or --help is passed,
 * otherwise returns a ToolCommand with the tool name and remaining args.
 */
export class ToolArgsParser implements CommandParser<
  ToolCommand | ToolsHelpCommand
> {
  parse(argv: string[]): ToolCommand | ToolsHelpCommand {
    const args = [...argv];

    // Strip leading 'tools'/'tool' prefix if present
    const hasToolsPrefix = args[0] === 'tools' || args[0] === 'tool';
    if (hasToolsPrefix) {
      args.shift();
    }

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
      return { command: 'tools-help', showToolsHelp: true };
    }

    return {
      command: 'tool',
      toolName: args.shift() ?? null,
      toolArgs: args,
    };
  }

  toParsedArguments(result: ToolCommand | ToolsHelpCommand): ParsedArguments {
    if (result.command === 'tools-help') {
      return {
        command: 'tools-help',
        modes: [],
        showHelp: false,
        showToolsHelp: true,
        toolkitHome: null,
        toolName: null,
        toolArgs: [],
        linkMode: null,
        assumeYes: false,
        explicitInstallCommand: false,
        autoUpdateAction: null,
        helpTopic: 'tools-help',
      };
    }
    return {
      command: 'tool',
      modes: [],
      showHelp: false,
      showToolsHelp: false,
      toolkitHome: null,
      toolName: result.toolName,
      toolArgs: result.toolArgs,
      linkMode: null,
      assumeYes: false,
      explicitInstallCommand: false,
      autoUpdateAction: null,
      helpTopic: 'overview',
    };
  }
}
