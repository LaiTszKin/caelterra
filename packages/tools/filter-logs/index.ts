import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import {
  extractTimestamp,
  inWindow,
  iterInputLines,
  parseCliTimestamp,
  buildTimezone,
  validateTimeWindow,
} from '@laitszkin/tool-utils';

interface FilterLogsArgs {
  paths: string[];
  start: string | null;
  end: string | null;
  assumeTimezone: string;
  keepUndated: boolean;
  countOnly: boolean;
}

function parseArgs(argv: string[]): FilterLogsArgs {
  const args: FilterLogsArgs = {
    paths: [],
    start: null,
    end: null,
    assumeTimezone: 'UTC',
    keepUndated: false,
    countOnly: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--start' && i + 1 < argv.length) {
      args.start = argv[++i];
    } else if (arg === '--end' && i + 1 < argv.length) {
      args.end = argv[++i];
    } else if (arg === '--assume-timezone' && i + 1 < argv.length) {
      args.assumeTimezone = argv[++i];
    } else if (arg === '--keep-undated') {
      args.keepUndated = true;
    } else if (arg === '--count-only') {
      args.countOnly = true;
    } else if (arg.startsWith('-')) {
      // skip unknown flags
    } else {
      args.paths.push(arg);
    }
    i++;
  }

  return args;
}

async function filterLogsHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const args = parseArgs(argv);

  try {
    buildTimezone(args.assumeTimezone);
  } catch (err) {
    stderr.write(
      `Error: invalid timezone: ${args.assumeTimezone}\n`,
    );
    return 1;
  }

  let start: Date | null = null;
  let end: Date | null = null;

  try {
    if (args.start) {
      start = parseCliTimestamp(args.start, args.assumeTimezone);
    }
    if (args.end) {
      end = parseCliTimestamp(args.end, args.assumeTimezone);
    }
  } catch (err) {
    stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  if (!validateTimeWindow(start, end, stderr)) {
    return 1;
  }

  let matches = 0;

  try {
    for await (const line of iterInputLines(args.paths)) {
      const timestamp = extractTimestamp(line, args.assumeTimezone);
      if (timestamp === null && !args.keepUndated) {
        continue;
      }
      if (timestamp !== null && !inWindow(timestamp, start, end)) {
        continue;
      }

      matches++;
      if (!args.countOnly) {
        stdout.write(line + '\n');
      }
    }
  } catch (err) {
    stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  if (args.countOnly) {
    stdout.write(String(matches) + '\n');
  }

  return 0;
}

export const tool: ToolDefinition = {
  name: 'filter-logs',
  category: 'Log Analysis',
  description: 'Filter log lines by time window',
  handler: filterLogsHandler,
};
