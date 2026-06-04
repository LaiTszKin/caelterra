import type { StdioWriter } from '@laitszkin/tui';

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

import type { InstallCommand, UninstallCommand, ToolCommand, ToolsHelpCommand } from './parsers/types.js';

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
  helpTopic: 'overview' | 'install' | 'uninstall';
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
  stdioWriter?: StdioWriter;
}
