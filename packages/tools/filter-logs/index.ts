import { parseArgs } from 'node:util';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, SystemError } from '@laitszkin/tool-utils';
import {
  extractTimestamp,
  inWindow,
  iterInputLines,
  parseCliTimestamp,
  buildTimezone,
} from '@laitszkin/tool-utils';

async function filterLogsHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const stdout = context.stdout ?? process.stdout;

  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        start: { type: 'string' },
        end: { type: 'string' },
        'assume-timezone': { type: 'string', default: 'UTC' },
        'keep-undated': { type: 'boolean', default: false },
        'count-only': { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    });

    if (values.help) {
      stdout.write(`Usage: apltk filter-logs [options] [<file>...]

Filter log lines by time window.

Options:
  --start <ISO>         Start timestamp (inclusive)
  --end <ISO>           End timestamp (inclusive)
  --assume-timezone <tz>  Timezone for timestamps without offset (default: UTC)
  --keep-undated        Include lines without timestamps
  --count-only          Print only the matching line count
  --help, -h            Show this help
`);
      return 0;
    }

    const assumeTimezone = values['assume-timezone'] as string;

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
  } catch (err) {
    const stderr = context.stderr ?? process.stderr;
    if (err instanceof UserInputError || err instanceof SystemError) {
      stderr.write(`${err.message}\n`);
      return err.statusCode;
    }
    stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

export const tool: ToolDefinition = {
  name: 'filter-logs',
  category: 'Log Analysis',
  description: 'Filter log lines by time window',
  handler: filterLogsHandler,
};
