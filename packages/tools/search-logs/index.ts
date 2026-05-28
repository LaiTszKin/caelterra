import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import {
  extractTimestamp,
  inWindow,
  iterInputLines,
  parseCliTimestamp,
  buildTimezone,
  validateTimeWindow,
} from '@laitszkin/tool-utils';

interface SearchLogsArgs {
  paths: string[];
  keyword: string[];
  regex: string[];
  mode: 'any' | 'all';
  ignoreCase: boolean;
  start: string | null;
  end: string | null;
  assumeTimezone: string;
  beforeContext: number;
  afterContext: number;
  countOnly: boolean;
}

function parseArgs(argv: string[]): SearchLogsArgs {
  const args: SearchLogsArgs = {
    paths: [],
    keyword: [],
    regex: [],
    mode: 'any',
    ignoreCase: false,
    start: null,
    end: null,
    assumeTimezone: 'UTC',
    beforeContext: 0,
    afterContext: 0,
    countOnly: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--keyword' && i + 1 < argv.length) {
      args.keyword.push(argv[++i]);
    } else if (arg === '--regex' && i + 1 < argv.length) {
      args.regex.push(argv[++i]);
    } else if (arg === '--mode' && i + 1 < argv.length) {
      const val = argv[++i];
      if (val === 'any' || val === 'all') {
        args.mode = val;
      }
    } else if (arg === '--ignore-case') {
      args.ignoreCase = true;
    } else if (arg === '--start' && i + 1 < argv.length) {
      args.start = argv[++i];
    } else if (arg === '--end' && i + 1 < argv.length) {
      args.end = argv[++i];
    } else if (arg === '--assume-timezone' && i + 1 < argv.length) {
      args.assumeTimezone = argv[++i];
    } else if (arg === '--before-context' && i + 1 < argv.length) {
      args.beforeContext = parseInt(argv[++i], 10) || 0;
    } else if (arg === '--after-context' && i + 1 < argv.length) {
      args.afterContext = parseInt(argv[++i], 10) || 0;
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

interface Matcher {
  (line: string): boolean;
}

function buildMatchers(args: SearchLogsArgs): Matcher[] {
  const matchers: Matcher[] = [];

  for (const keyword of args.keyword) {
    const needle = args.ignoreCase ? keyword.toLowerCase() : keyword;
    matchers.push((line: string) => {
      const haystack = args.ignoreCase ? line.toLowerCase() : line;
      return haystack.includes(needle);
    });
  }

  for (const pattern of args.regex) {
    const flags = args.ignoreCase ? 'i' : '';
    const compiled = new RegExp(pattern, flags);
    matchers.push((line: string) => compiled.test(line));
  }

  return matchers;
}

function lineMatches(
  line: string,
  matchers: Matcher[],
  mode: 'any' | 'all',
): boolean {
  if (matchers.length === 0) return true;
  if (mode === 'any') {
    return matchers.some((m) => m(line));
  }
  return matchers.every((m) => m(line));
}

async function searchLogsHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const args = parseArgs(argv);

  try {
    buildTimezone(args.assumeTimezone);
  } catch (err) {
    stderr.write(`Error: invalid timezone: ${args.assumeTimezone}\n`);
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

  const matchers = buildMatchers(args);
  let matches = 0;
  const beforeBuffer: string[] = [];
  let afterRemaining = 0;

  try {
    for await (const line of iterInputLines(args.paths)) {
      const timestamp = extractTimestamp(line, args.assumeTimezone);

      // When time filter is active, skip lines outside the window
      if (args.start || args.end) {
        if (!inWindow(timestamp, start, end)) {
          beforeBuffer.push(line);
          if (beforeBuffer.length > args.beforeContext) {
            beforeBuffer.shift();
          }
          continue;
        }
      }

      const isMatch = lineMatches(line, matchers, args.mode);

      if (isMatch) {
        matches++;
        if (!args.countOnly) {
          // Flush before context
          for (const ctxLine of beforeBuffer) {
            stdout.write(ctxLine + '\n');
          }
          stdout.write(line + '\n');
        }
        afterRemaining = args.afterContext;
      } else if (afterRemaining > 0 && !args.countOnly) {
        stdout.write(line + '\n');
        afterRemaining--;
      }

      // Maintain before context buffer
      beforeBuffer.push(line);
      if (beforeBuffer.length > args.beforeContext) {
        beforeBuffer.shift();
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
  name: 'search-logs',
  category: 'Log Analysis',
  description: 'Search log lines by keywords or regex patterns with time filters',
  handler: searchLogsHandler,
};
