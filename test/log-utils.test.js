import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTimestamp, parseCliTimestamp, extractTimestamp,
  buildTimezone, validateTimeWindow, inWindow, iterInputLines,
} from '@laitszkin/tool-utils';

// ----------------------------------------------------------------
// normalizeTimestamp
// ----------------------------------------------------------------

test('normalizeTimestamp replaces Z with +00:00', () => {
  assert.equal(normalizeTimestamp('2026-03-24T10:00:00Z'), '2026-03-24T10:00:00+00:00');
});

test('normalizeTimestamp replaces comma with dot in fractional seconds', () => {
  assert.equal(normalizeTimestamp('2026-03-24T10:00:00,123Z'), '2026-03-24T10:00:00.123+00:00');
});

test('normalizeTimestamp leaves already-normalized timestamps unchanged', () => {
  assert.equal(normalizeTimestamp('2026-03-24T10:00:00+00:00'), '2026-03-24T10:00:00+00:00');
});

test('normalizeTimestamp trims whitespace', () => {
  assert.equal(normalizeTimestamp('  2026-03-24T10:00:00Z  '), '2026-03-24T10:00:00+00:00');
});

// ----------------------------------------------------------------
// parseCliTimestamp
// ----------------------------------------------------------------

test('parseCliTimestamp parses ISO 8601 with Z suffix', () => {
  const d = parseCliTimestamp('2026-03-24T10:00:00Z', 'UTC');
  assert.equal(d.getTime(), new Date('2026-03-24T10:00:00Z').getTime());
});

test('parseCliTimestamp parses ISO 8601 with timezone offset', () => {
  const d = parseCliTimestamp('2026-03-24T10:00:00+02:00', 'UTC');
  // 10:00 +02:00 = 08:00 UTC
  assert.equal(d.getTime(), new Date('2026-03-24T08:00:00Z').getTime());
});

test('parseCliTimestamp parses ISO 8601 with negative timezone offset', () => {
  const d = parseCliTimestamp('2026-03-24T10:00:00-05:00', 'UTC');
  // 10:00 -05:00 = 15:00 UTC
  assert.equal(d.getTime(), new Date('2026-03-24T15:00:00Z').getTime());
});

test('parseCliTimestamp parses with space separator', () => {
  const d = parseCliTimestamp('2026-03-24 10:00:00Z', 'UTC');
  assert.equal(d.getTime(), new Date('2026-03-24T10:00:00Z').getTime());
});

test('parseCliTimestamp parses with fractional seconds', () => {
  const d = parseCliTimestamp('2026-03-24T10:00:00.123Z', 'UTC');
  assert.equal(d.getTime(), new Date('2026-03-24T10:00:00.123Z').getTime());
});

test('parseCliTimestamp throws for invalid timestamp', () => {
  assert.throws(() => parseCliTimestamp('not-a-timestamp', 'UTC'), /invalid timestamp/);
});

test('parseCliTimestamp throws for completely wrong format', () => {
  assert.throws(() => parseCliTimestamp('hello', 'UTC'), /invalid timestamp/);
});

// ----------------------------------------------------------------
// extractTimestamp
// ----------------------------------------------------------------

test('extractTimestamp extracts ISO timestamp from log line', () => {
  const d = extractTimestamp('2026-03-24T10:00:00Z INFO starting', 'UTC');
  assert.ok(d instanceof Date);
  assert.equal(d.getTime(), new Date('2026-03-24T10:00:00Z').getTime());
});

test('extractTimestamp extracts timestamp with space separator', () => {
  const d = extractTimestamp('2026-03-24 10:00:00Z INFO starting', 'UTC');
  assert.ok(d instanceof Date);
  assert.equal(d.getTime(), new Date('2026-03-24T10:00:00Z').getTime());
});

test('extractTimestamp returns null for line without timestamp', () => {
  assert.equal(extractTimestamp('plain log line with no timestamp', 'UTC'), null);
});

test('extractTimestamp returns null for empty string', () => {
  assert.equal(extractTimestamp('', 'UTC'), null);
});

test('extractTimestamp returns null for invalid timestamp pattern', () => {
  assert.equal(extractTimestamp('not-a-date', 'UTC'), null);
});

test('extractTimestamp with timezone offset in log line', () => {
  const d = extractTimestamp('2026-03-24T10:00:00+02:00 [INFO] event occurred', 'UTC');
  assert.ok(d instanceof Date);
  assert.equal(d.getTime(), new Date('2026-03-24T08:00:00Z').getTime());
});

// ----------------------------------------------------------------
// buildTimezone
// ----------------------------------------------------------------

test('buildTimezone returns 0 for UTC', () => {
  assert.equal(buildTimezone('UTC'), 0);
});

test('buildTimezone returns 0 for Z', () => {
  assert.equal(buildTimezone('Z'), 0);
});

test('buildTimezone parses positive offset', () => {
  assert.equal(buildTimezone('+02:00'), 120);
});

test('buildTimezone parses negative offset', () => {
  assert.equal(buildTimezone('-05:00'), -300);
});

test('buildTimezone throws for invalid timezone string', () => {
  assert.throws(() => buildTimezone('invalid'), /timezone must be UTC or/);
});

// ----------------------------------------------------------------
// validateTimeWindow
// ----------------------------------------------------------------

test('validateTimeWindow returns true when start is before end', () => {
  const out = { write() {} };
  const start = new Date('2026-03-24T10:00:00Z');
  const end = new Date('2026-03-24T12:00:00Z');
  assert.equal(validateTimeWindow(start, end, out), true);
});

test('validateTimeWindow returns true when start equals end', () => {
  const out = { write() {} };
  const start = new Date('2026-03-24T10:00:00Z');
  const end = new Date('2026-03-24T10:00:00Z');
  assert.equal(validateTimeWindow(start, end, out), true);
});

test('validateTimeWindow returns true when both are null', () => {
  const out = { write() {} };
  assert.equal(validateTimeWindow(null, null, out), true);
});

test('validateTimeWindow returns true when only start is set', () => {
  const out = { write() {} };
  assert.equal(validateTimeWindow(new Date('2026-03-24T10:00:00Z'), null, out), true);
});

test('validateTimeWindow returns true when only end is set', () => {
  const out = { write() {} };
  assert.equal(validateTimeWindow(null, new Date('2026-03-24T12:00:00Z'), out), true);
});

test('validateTimeWindow returns false and writes error when start is after end', () => {
  let stderrText = '';
  const stderr = { write(chunk) { stderrText += chunk; } };
  const start = new Date('2026-03-24T12:00:00Z');
  const end = new Date('2026-03-24T10:00:00Z');
  assert.equal(validateTimeWindow(start, end, stderr), false);
  assert.match(stderrText, /--start must be earlier/);
});

// ----------------------------------------------------------------
// inWindow
// ----------------------------------------------------------------

test('inWindow returns false for null timestamp', () => {
  assert.equal(inWindow(null, new Date('2026-03-24T10:00:00Z'), new Date('2026-03-24T12:00:00Z')), false);
});

test('inWindow returns true for timestamp within window', () => {
  const ts = new Date('2026-03-24T11:00:00Z');
  const start = new Date('2026-03-24T10:00:00Z');
  const end = new Date('2026-03-24T12:00:00Z');
  assert.equal(inWindow(ts, start, end), true);
});

test('inWindow returns true for timestamp at start boundary', () => {
  const ts = new Date('2026-03-24T10:00:00Z');
  const start = new Date('2026-03-24T10:00:00Z');
  assert.equal(inWindow(ts, start, null), true);
});

test('inWindow returns true for timestamp at end boundary', () => {
  const ts = new Date('2026-03-24T12:00:00Z');
  const end = new Date('2026-03-24T12:00:00Z');
  assert.equal(inWindow(ts, null, end), true);
});

test('inWindow returns false for timestamp before start', () => {
  const ts = new Date('2026-03-24T09:00:00Z');
  const start = new Date('2026-03-24T10:00:00Z');
  assert.equal(inWindow(ts, start, null), false);
});

test('inWindow returns false for timestamp after end', () => {
  const ts = new Date('2026-03-24T13:00:00Z');
  const end = new Date('2026-03-24T12:00:00Z');
  assert.equal(inWindow(ts, null, end), false);
});

test('inWindow returns true when both start and end are null', () => {
  const ts = new Date('2026-03-24T11:00:00Z');
  assert.equal(inWindow(ts, null, null), true);
});

// ----------------------------------------------------------------
// iterInputLines
// ----------------------------------------------------------------

test('iterInputLines reads lines from a file', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-utils-test-'));
  try {
    const filePath = path.join(tmpDir, 'test.log');
    await fs.writeFile(filePath, 'line1\nline2\nline3\n', 'utf8');
    const lines = [];
    for await (const line of iterInputLines([filePath])) {
      lines.push(line);
    }
    assert.deepEqual(lines, ['line1', 'line2', 'line3']);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('iterInputLines reads lines from multiple files', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'log-utils-test-'));
  try {
    const filePath1 = path.join(tmpDir, 'a.log');
    const filePath2 = path.join(tmpDir, 'b.log');
    await fs.writeFile(filePath1, 'from a\n', 'utf8');
    await fs.writeFile(filePath2, 'from b\n', 'utf8');
    const lines = [];
    for await (const line of iterInputLines([filePath1, filePath2])) {
      lines.push(line);
    }
    assert.deepEqual(lines, ['from a', 'from b']);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------
// parseCliTimestamp edge cases
// ----------------------------------------------------------------

test('parseCliTimestamp handles fractional seconds without timezone', () => {
  // Without timezone, applies the assumeTimezone
  const d = parseCliTimestamp('2026-03-24T10:00:00.999', 'UTC');
  assert.ok(d instanceof Date);
  // Should have 999 milliseconds
  assert.equal(d.getMilliseconds(), 999);
});

test('parseCliTimestamp handles fractional seconds with leading zeros', () => {
  const d = parseCliTimestamp('2026-03-24T10:00:00.050Z', 'UTC');
  assert.equal(d.getMilliseconds(), 50);
});

test('parseCliTimestamp with space separator and fractional seconds', () => {
  const d = parseCliTimestamp('2026-03-24 10:00:00.500+00:00', 'UTC');
  assert.equal(d.getMilliseconds(), 500);
});

test('parseCliTimestamp handles single-digit fractional seconds', () => {
  const d = parseCliTimestamp('2026-03-24T10:00:00.5Z', 'UTC');
  assert.equal(d.getMilliseconds(), 500);
});

// ----------------------------------------------------------------
// extractTimestamp additional edge cases
// ----------------------------------------------------------------

test('extractTimestamp with extra long fractional seconds', () => {
  const d = extractTimestamp('2026-03-24T10:00:00.123456Z event', 'UTC');
  assert.ok(d instanceof Date);
  assert.equal(d.getMilliseconds(), 123);
});
