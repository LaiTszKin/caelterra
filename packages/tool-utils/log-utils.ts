import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const TIMESTAMP_PATTERN =
  /(?<timestamp>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:\d{2})?)/;

const TIMESTAMP_FORMATS = [
  '%Y-%m-%dT%H:%M:%S.%f%z',
  '%Y-%m-%dT%H:%M:%S%z',
  '%Y-%m-%d %H:%M:%S.%f%z',
  '%Y-%m-%d %H:%M:%S%z',
  '%Y-%m-%dT%H:%M:%S.%f',
  '%Y-%m-%dT%H:%M:%S',
  '%Y-%m-%d %H:%M:%S.%f',
  '%Y-%m-%d %H:%M:%S',
];

function parseWithFormat(
  value: string,
  fmt: string,
  assumeTimezone: string,
): Date | null {
  let regexStr = '';
  let i = 0;
  const groups: { name: string; width: number }[] = [];

  while (i < fmt.length) {
    if (fmt[i] === '%' && i + 1 < fmt.length) {
      switch (fmt[i + 1]) {
        case 'Y':
          regexStr += '(\\d{4})';
          groups.push({ name: 'year', width: 4 });
          break;
        case 'm':
          regexStr += '(\\d{2})';
          groups.push({ name: 'month', width: 2 });
          break;
        case 'd':
          regexStr += '(\\d{2})';
          groups.push({ name: 'day', width: 2 });
          break;
        case 'H':
          regexStr += '(\\d{2})';
          groups.push({ name: 'hour', width: 2 });
          break;
        case 'M':
          regexStr += '(\\d{2})';
          groups.push({ name: 'minute', width: 2 });
          break;
        case 'S':
          regexStr += '(\\d{2})';
          groups.push({ name: 'second', width: 2 });
          break;
        case 'f':
          regexStr += '(\\d+)';
          groups.push({ name: 'frac', width: 0 });
          break;
        case 'z':
          regexStr += '([+-]\\d{2}:\\d{2})';
          groups.push({ name: 'tz', width: 0 });
          break;
        default:
          regexStr += '\\' + fmt.charAt(i + 1);
          break;
      }
      i += 2;
    } else {
      regexStr += fmt.charAt(i).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  const match = value.match(new RegExp('^' + regexStr + '$'));
  if (!match) return null;

  const extract = (name: string): number => {
    const idx = groups.findIndex((g) => g.name === name);
    if (idx === -1) return 0;
    return parseInt(match[idx + 1] || '0', 10);
  };

  const hasTimezone = groups.some((g) => g.name === 'tz');
  const tzGroup = hasTimezone
    ? match[groups.findIndex((g) => g.name === 'tz') + 1]
    : null;
  const fracRaw = groups.some((g) => g.name === 'frac')
    ? match[groups.findIndex((g) => g.name === 'frac') + 1]
    : null;

  const year = extract('year');
  const month = extract('month') - 1;
  const day = extract('day');
  const hour = extract('hour');
  const minute = extract('minute');
  const second = extract('second');
  let milliseconds = 0;
  if (fracRaw != null) {
    const padded = fracRaw.padEnd(3, '0').slice(0, 3);
    milliseconds = parseInt(padded, 10);
  }

  if (tzGroup) {
    const sign = tzGroup[0] === '-' ? -1 : 1;
    const tzHours = parseInt(tzGroup.slice(1, 3), 10);
    const tzMinutes = parseInt(tzGroup.slice(4, 6), 10);
    const offsetMinutes = sign * (tzHours * 60 + tzMinutes);
    const date = new Date(
      Date.UTC(
        year,
        month,
        day,
        hour,
        minute - offsetMinutes,
        second,
        milliseconds,
      ),
    );
    return date;
  }

  return applyTimezone(
    new Date(year, month, day, hour, minute, second, milliseconds),
    assumeTimezone,
  );
}

function applyTimezone(date: Date, assumeTimezone: string): Date {
  const tzMinutes = parseTimezoneOffset(assumeTimezone);
  const localMinutes = date.getTimezoneOffset();
  return new Date(date.getTime() + (localMinutes + tzMinutes) * 60 * 1000);
}

function parseTimezoneOffset(raw: string): number {
  const upper = raw.toUpperCase();
  if (upper === 'UTC' || upper === 'Z') return 0;

  const match = /^([+-])(\d{2}):(\d{2})$/.exec(raw);
  if (!match) throw new Error(`timezone must be UTC or ±HH:MM, got: ${raw}`);

  const totalMinutes =
    parseInt(match[2] ?? '0', 10) * 60 + parseInt(match[3] ?? '0', 10);
  return match[1] === '-' ? -totalMinutes : totalMinutes;
}

export function normalizeTimestamp(raw: string): string {
  const value = raw.trim().replace(',', '.');
  if (value.endsWith('Z')) {
    return value.slice(0, -1) + '+00:00';
  }
  return value;
}

export function parseCliTimestamp(raw: string, assumeTimezone: string): Date {
  const normalized = normalizeTimestamp(raw);
  for (const fmt of TIMESTAMP_FORMATS) {
    const parsed = parseWithFormat(normalized, fmt, assumeTimezone);
    if (parsed) {
      return parsed;
    }
  }
  throw new Error(`invalid timestamp: ${raw}`);
}

export function extractTimestamp(
  line: string,
  assumeTimezone: string,
): Date | null {
  const match = TIMESTAMP_PATTERN.exec(line);
  if (!match || !match.groups?.['timestamp']) return null;
  try {
    return parseCliTimestamp(match.groups['timestamp'], assumeTimezone);
  } catch {
    return null;
  }
}

export function buildTimezone(raw: string): number {
  return parseTimezoneOffset(raw);
}

export function validateTimeWindow(
  start: Date | null,
  end: Date | null,
  stderr: NodeJS.WriteStream,
): boolean {
  if (start && end && start > end) {
    stderr.write('Error: --start must be earlier than or equal to --end.\n');
    return false;
  }
  return true;
}

export function inWindow(
  timestamp: Date | null,
  start: Date | null,
  end: Date | null,
): boolean {
  if (timestamp === null) return false;
  if (start !== null && timestamp < start) return false;
  if (end !== null && timestamp > end) return false;
  return true;
}

export async function* iterInputLines(paths: string[]): AsyncGenerator<string> {
  if (paths.length === 0) {
    yield* readStdinLines();
    return;
  }

  for (const rawPath of paths) {
    if (rawPath === '-') {
      yield* readStdinLines();
      continue;
    }
    yield* readFileLines(rawPath);
  }
}

async function* readStdinLines(): AsyncGenerator<string> {
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    yield line;
  }
}

async function* readFileLines(filePath: string): AsyncGenerator<string> {
  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    yield line;
  }
}
