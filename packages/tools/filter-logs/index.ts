import type { ToolContext } from '@laitszkin/tool-registry';
import type { ToolDefinition } from '@laitszkin/tool-registry';
import {
  extractTimestamp,
  inWindow,
  iterInputLines,
  parseCliTimestamp,
  buildTimezone,
  createToolRunner,
} from '@laitszkin/tool-utils';
import { UserInputError, SystemError } from '@laitszkin/tool-utils';

const schema = {
  options: {
    start: { type: 'string' as const, short: 's' },
    end: { type: 'string' as const, short: 'e' },
    'assume-timezone': { type: 'string' as const },
    'keep-undated': { type: 'boolean' as const },
    'count-only': { type: 'boolean' as const },
  },
  allowPositionals: true,
  strict: false,
  usage: 'apltk filter-logs [options] [<file>...]',
  description: 'Filter log lines by time window',
  handler: async (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout ?? process.stdout;
    const stderr = context.stderr ?? process.stderr;
    const assumeTimezone = (values['assume-timezone'] as string) ?? 'UTC';

    try {
      buildTimezone(assumeTimezone);
    } catch {
      throw new UserInputError(`invalid timezone: ${assumeTimezone}`);
    }

    let start: Date | null = null;
    let end: Date | null = null;

    try {
      if (values.start) {
        start = parseCliTimestamp(values.start as string, assumeTimezone);
      }
      if (values.end) {
        end = parseCliTimestamp(values.end as string, assumeTimezone);
      }
    } catch (err) {
      throw new UserInputError((err as Error).message);
    }

    if (start && end && start > end) {
      throw new UserInputError('--start must be earlier than or equal to --end.');
    }

    const keepUndated = values['keep-undated'] as boolean;
    const countOnly = values['count-only'] as boolean;
    let matches = 0;

    try {
      for await (const line of iterInputLines(positionals)) {
        const timestamp = extractTimestamp(line, assumeTimezone);
        if (timestamp === null && !keepUndated) {
          continue;
        }
        if (timestamp !== null && !inWindow(timestamp, start, end)) {
          continue;
        }

        matches++;
        if (!countOnly) {
          stdout.write(line + '\n');
        }
      }
    } catch (err) {
      throw new SystemError((err as Error).message);
    }

    if (countOnly) {
      stdout.write(String(matches) + '\n');
    }

    return 0;
  },
};

export const tool: ToolDefinition = {
  name: 'filter-logs',
  category: 'Log Analysis',
  description: 'Filter log lines by time window',
  handler: createToolRunner(schema),
};
