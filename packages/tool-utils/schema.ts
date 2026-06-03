import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
import type { ToolContext } from '@laitszkin/tool-registry';

/** Option definition for parseArgs schema. */
export type SchemaOption =
  | { type: 'string'; default?: string; short?: string }
  | { type: 'boolean'; default?: boolean; short?: string };

/**
 * Complete tool schema — single source of truth for args, help, and validation.
 *
 * Example:
 * ```ts
 * const schema: ToolSchema = {
 *   options: {
 *     start: { type: 'string', short: 's' },
 *     end: { type: 'string', short: 'e' },
 *     help: { type: 'boolean', short: 'h' },
 *   },
 *   allowPositionals: true,
 *   usage: 'apltk filter-logs [options] [<file>...]',
 *   description: 'Filter log lines by time window.',
 *   handler: async (values, positionals, ctx) => { ... },
 * };
 * ```
 */
export interface ToolSchema {
  options: Record<string, SchemaOption>;
  allowPositionals?: boolean;
  strict?: boolean;
  usage?: string;
  description?: string;
  category?: string;
  handler: (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ) => Promise<number> | number;
}

function buildHelpText(schema: ToolSchema): string {
  const lines: string[] = [];
  if (schema.usage) {
    lines.push(`Usage: ${schema.usage}`);
  }
  if (schema.description) {
    lines.push('', schema.description);
  }
  lines.push('', 'Options:');
  for (const [key, opt] of Object.entries(schema.options)) {
    if (key === 'help') continue;
    const short = opt.short ? `, -${opt.short}` : '';
    const def = opt.default !== undefined ? ` (default: ${opt.default})` : '';
    lines.push(`  --${key}${short}${def}`);
  }
  lines.push('  --help, -h            Show this help');
  return lines.join('\n');
}

/**
 * Creates a tool handler function from a ToolSchema declaration.
 * Automatically handles:
 *   - Argument parsing via node:util.parseArgs
 *   - --help / -h flag (auto-generates help text from options)
 *   - Strict mode validation
 */
export function createToolRunner(schema: ToolSchema) {
  const options: ParseArgsOptionsConfig = {};
  for (const [key, opt] of Object.entries(schema.options)) {
    const entry: { type: 'string' | 'boolean'; default?: string | boolean; short?: string } = { type: opt.type };
    if (opt.default !== undefined) entry.default = opt.default;
    if (opt.short) entry.short = opt.short;
    options[key] = entry;
  }
  options.help = { type: 'boolean', short: 'h' };

  return async (args: string[], context: ToolContext): Promise<number> => {
    const stdout = context.stdout ?? process.stdout;
    const stderr = context.stderr ?? process.stderr;

    try {
      const { values, positionals } = parseArgs({
        args,
        options,
        allowPositionals: schema.allowPositionals ?? false,
        strict: schema.strict ?? true,
      });

      if (values.help) {
        stdout.write(buildHelpText(schema) + '\n');
        return 0;
      }

      return await schema.handler(values as Record<string, unknown>, positionals, context);
    } catch (err) {
      stderr.write(`Error: ${(err as Error).message}\n`);
      return 1;
    }
  };
}
