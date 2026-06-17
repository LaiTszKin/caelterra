import type { StdioWriter } from '@laitszkin/tui';

export type InstallMode =
  | 'codex'
  | 'openclaw'
  | 'trae'
  | 'agents'
  | 'claude-code';

export interface InstallTarget {
  id: InstallMode;
  label: string;
  description?: string;
  root: string;
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

// ---- Active return type of parseArguments() / input contract for run() --------

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
  helpTopic: 'overview' | 'install' | 'uninstall' | 'tools-help';
}

export interface CliContext {
  sourceRoot?: string;
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;
  env?: NodeJS.ProcessEnv;
  execCommand?: (
    command: string,
    args: string[],
    options?: {
      env?: NodeJS.ProcessEnv;
      stdout?: NodeJS.WriteStream;
      stderr?: NodeJS.WriteStream;
    },
  ) => Promise<{ stdout: string; stderr: string }>;
  confirmUpdate?: (options: {
    stdin: NodeJS.ReadStream;
    stdout: NodeJS.WriteStream;
    currentVersion: string;
    latestVersion: string;
    packageName: string;
  }) => Promise<boolean>;
  runTool?: (
    toolName: string,
    toolArgs: string[],
    context?: Record<string, unknown>,
  ) => Promise<number>;
  spawnCommand?: (...args: unknown[]) => unknown;
  stdioWriter?: StdioWriter;
}
