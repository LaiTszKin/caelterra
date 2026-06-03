import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import {
  UserInputError,
  SystemError,
  createToolRunner,
  extractTimestamp,
  inWindow,
  iterInputLines,
  parseCliTimestamp,
  buildTimezone,
} from '@laitszkin/tool-utils';

interface Matcher {
  (line: string): boolean;
}

function buildMatchers(
  keywords: string[],
  regexPatterns: string[],
  ignoreCase: boolean,
  mode: 'any' | 'all',
): Matcher[] {
  const matchers: Matcher[] = [];

  for (const keyword of keywords) {
    const needle = ignoreCase ? keyword.toLowerCase() : keyword;
    matchers.push((line: string) => {
      const haystack = ignoreCase ? line.toLowerCase() : line;
      return haystack.includes(needle);
    });
  }

  for (const pattern of regexPatterns) {
    const flags = ignoreCase ? 'i' : '';
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

const schema = {
  options: {
    keyword: { type: 'string' as const },
    regex: { type: 'string' as const },
    mode: { type: 'string' as const, default: 'any' },
    'ignore-case': { type: 'boolean' as const, default: false },
    start: { type: 'string' as const },
    end: { type: 'string' as const },
    'assume-timezone': { type: 'string' as const, default: 'UTC' },
    'before-context': { type: 'string' as const, default: '0' },
    'after-context': { type: 'string' as const, default: '0' },
    'count-only': { type: 'boolean' as const, default: false },
  },
  allowPositionals: true,
  strict: false,
  usage: 'apltk search-logs [options] [<file>...]',
  description: 'Search log lines by keywords or regex patterns with time filters',
  handler: async (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout ?? process.stdout;

    const mode = values.mode as string;
    if (mode !== 'any' && mode !== 'all') {
      throw new UserInputError('--mode must be "any" or "all"');
    }

    const keywords = (values.keyword as string[]) || [];
    const regexPatterns = (values.regex as string[]) || [];
    const ignoreCase = values['ignore-case'] as boolean;
    const assumeTimezone = values['assume-timezone'] as string;
    const beforeContext = parseInt(values['before-context'] as string, 10) || 0;
    const afterContext = parseInt(values['after-context'] as string, 10) || 0;
    const countOnly = values['count-only'] as boolean;

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

    const matchers = buildMatchers(keywords, regexPatterns, ignoreCase, mode as 'any' | 'all');
    let matches = 0;
    const beforeBuffer: string[] = [];
    let afterRemaining = 0;

    try {
      for await (const line of iterInputLines(positionals)) {
        const timestamp = extractTimestamp(line, assumeTimezone);

        // When time filter is active, skip lines outside the window
        if (values.start || values.end) {
          if (!inWindow(timestamp, start, end)) {
            beforeBuffer.push(line);
            if (beforeBuffer.length > beforeContext) {
              beforeBuffer.shift();
            }
            continue;
          }
        }

        const isMatch = lineMatches(line, matchers, mode as 'any' | 'all');

        if (isMatch) {
          matches++;
          if (!countOnly) {
            // Flush before context
            for (const ctxLine of beforeBuffer) {
              stdout.write(ctxLine + '\n');
            }
            stdout.write(line + '\n');
          }
          afterRemaining = afterContext;
        } else if (afterRemaining > 0 && !countOnly) {
          stdout.write(line + '\n');
          afterRemaining--;
        }

        // Maintain before context buffer
        beforeBuffer.push(line);
        if (beforeBuffer.length > beforeContext) {
          beforeBuffer.shift();
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
  name: 'search-logs',
  category: 'Log Analysis',
  description: 'Search log lines by keywords or regex patterns with time filters',
  handler: createToolRunner(schema),
};
