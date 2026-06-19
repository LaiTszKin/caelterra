import type { InstallMode, ParsedArguments } from '../types.js';

/**
 * Parsed result for the install (default) command mode.
 */
export interface InstallCommand {
  command: 'install';
  modes: InstallMode[];
  showHelp: boolean;
  toolkitHome: string | null;
  linkMode: 'copy' | 'symlink' | null;
  explicitInstallCommand: boolean;
  helpTopic: 'overview' | 'install';
}

/**
 * Parsed result for the uninstall command mode.
 */
export interface UninstallCommand {
  command: 'uninstall';
  modes: InstallMode[];
  showHelp: boolean;
  toolkitHome: string | null;
  assumeYes: boolean;
  helpTopic: 'uninstall';
}

/**
 * Parsed result for a direct tool invocation.
 */
export interface ToolCommand {
  command: 'tool';
  toolName: string | null;
  toolArgs: string[];
}

/**
 * Parsed result for the tools listing help screen.
 */
export interface ToolsHelpCommand {
  command: 'tools-help';
  showToolsHelp: boolean;
}

/**
 * Valid actions for the auto-update command.
 */
export type AutoUpdateAction = 'enable' | 'disable' | 'status' | 'run';

/**
 * Parsed result for the auto-update command mode.
 */
export interface AutoUpdateCommand {
  command: 'auto-update';
  action: AutoUpdateAction | null;
  showHelp: boolean;
  toolkitHome: string | null;
  helpTopic: 'auto-update';
}

/**
 * Union of all parsed commands returned by the CLI arg parsers.
 */
export type ParsedCommand =
  | InstallCommand
  | UninstallCommand
  | ToolCommand
  | ToolsHelpCommand
  | AutoUpdateCommand;

/**
 * Parser interface for turning raw argv arrays into strongly-typed command objects.
 */
export interface CommandParser<T> {
  parse(argv: string[]): T;
  toParsedArguments(result: T): ParsedArguments;
}
