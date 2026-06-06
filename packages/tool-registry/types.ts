import type { StdioWriter } from '@laitszkin/tui';
import type { ToolContext } from '@laitszkin/tool-utils';

export interface ToolHelp {
  purpose: string;
  useWhen: string[];
  insteadOf?: string[];
  examples?: ToolExample[];
}

export interface ToolExample {
  command: string;
  result: string;
}

export type RunnerKind = 'node' | 'python3' | 'swift';

export interface ToolDefinition {
  name: string;
  category: string;
  skill?: string;
  script?: string;
  runner?: RunnerKind;
  description: string;
  aliases?: string[];
  help?: ToolHelp;
  handler?: (args: string[], context: ToolContext) => Promise<number>;
  canonicalName?: string;
}

export type { ToolContext };
