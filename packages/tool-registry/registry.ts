import type { ToolDefinition, ToolContext, ToolExample } from './types.js';

export class SystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemError';
  }
}

const TOOLS_BY_NAME = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  TOOLS_BY_NAME.set(tool.name, tool);
  for (const alias of tool.aliases || []) {
    TOOLS_BY_NAME.set(alias, { ...tool, name: alias, canonicalName: tool.name });
  }
}

export function getTool(name: string): ToolDefinition | null {
  return TOOLS_BY_NAME.get(name) || null;
}

export function listTools(): ToolDefinition[] {
  return [...TOOLS_BY_NAME.values()]
    .filter((t) => !t.canonicalName) // only originals, not aliases
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function runTool(
  toolName: string,
  toolArgs: string[],
  context: ToolContext = {},
): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const tool = getTool(toolName);

  if (!tool) {
    stderr.write(`Unknown tool: ${toolName}\n\nAvailable tools:\n${formatToolList()}\n`);
    return 1;
  }

  if (tool.handler) {
    return tool.handler(toolArgs, context);
  }

  throw new SystemError(`Tool not fully configured: ${toolName}`);
}

export function formatExamples(examples: ToolExample[] = []): string {
  return examples.map(({ command, result }) => (
    `  ${command}\n    Result: ${result}`
  )).join('\n');
}

export function formatToolList(): string {
  const tools = listTools();
  const width = tools.reduce((max, t) => Math.max(max, t.name.length), 0);
  return tools.map((t) => {
    const name = t.name.padEnd(width, ' ');
    return `  ${name}  ${t.description}`;
  }).join('\n');
}

export function buildToolDiscoveryHelp(): string {
  const categories = new Map<string, ToolDefinition[]>();
  for (const tool of listTools()) {
    const category = tool.category || 'Other';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(tool);
  }

  const lines = ['Common goals:'];
  for (const [category, tools] of categories.entries()) {
    lines.push(`  ${category}:`);
    for (const tool of tools) {
      const firstUseCase = tool.help?.useWhen?.[0] || tool.description;
      lines.push(`    - \`${tool.name}\`: ${firstUseCase}`);
    }
  }
  lines.push('', 'Next step:', '  Run `apltk tools <tool> --help` for the exact flags, behavior notes, and examples of one tool.');
  return lines.join('\n');
}

export function isTopLevelToolHelpRequest(toolArgs: string[]): boolean {
  return Array.isArray(toolArgs) && toolArgs.length > 0 && toolArgs.every((arg) => arg === '--help' || arg === '-h');
}
