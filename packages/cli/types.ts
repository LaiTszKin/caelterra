export type InstallMode = 'codex' | 'openclaw' | 'trae' | 'agents' | 'claude-code';

export interface InstallTarget {
  id: InstallMode;
  label: string;
  description?: string;
  root?: string;
}

export interface InstallResult {
  skillNames: string[];
  linkMode: 'symlink' | 'copy';
  targets: { label: string; root: string }[];
}

export interface ManifestData {
  version: string;
  installedAt: string;
  linkMode: string;
  skills: string[];
  historicalSkills: string[];
}

export interface SyncResult {
  previousSkillNames: string[];
}

// ---- New typed command objects (produced by parser classes) --------

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

// ---- Legacy ParsedArguments (kept for backward compatibility) --------

export interface ParsedArguments {
  command: 'install' | 'uninstall' | 'tool' | 'tools-help';
  modes: InstallMode[];
  showHelp: boolean;
  showToolsHelp: boolean;
  toolkitHome: string | null;
  toolName: string | null;
  toolArgs: string[];
  linkMode: 'copy' | 'symlink' | null;
  assumeYes: boolean;
  explicitInstallCommand: boolean;
  helpTopic: string;
}

export interface CliContext {
  sourceRoot?: string;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  env?: NodeJS.ProcessEnv;
  execCommand?: Function;
  confirmUpdate?: Function;
  runTool?: Function;
  spawnCommand?: Function;
}
