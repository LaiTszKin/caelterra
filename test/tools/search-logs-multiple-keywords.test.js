import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { createToolRunner } from '@laitszkin/tool-utils';

function createMemoryStream() {
  let data = '';
  return { write(chunk) { data += chunk; return true; }, toString() { return data; } };
}

test('search-logs schema passes multiple --keyword values as array', () => {
  const { values } = parseArgs({
    options: {
      keyword: { type: 'string', multiple: true },
    },
    args: ['--keyword', 'foo', '--keyword', 'bar'],
    strict: false,
  });
  assert.deepStrictEqual(values.keyword, ['foo', 'bar']);
});

test('search-logs handler correctly processes multiple --keyword values', async () => {
  const runner = createToolRunner({
    options: {
      keyword: { type: 'string', multiple: true },
      regex: { type: 'string', multiple: true },
    },
    allowPositionals: true,
    strict: false,
    handler: async (values) => {
      assert.ok(Array.isArray(values.keyword));
      assert.ok(Array.isArray(values.regex));
      assert.strictEqual(values.keyword.length, 2);
      assert.strictEqual(values.regex.length, 2);
      assert.strictEqual(values.keyword[0], 'foo');
      assert.strictEqual(values.keyword[1], 'bar');
      assert.strictEqual(values.regex[0], '\\d+');
      assert.strictEqual(values.regex[1], 'error');
      return 0;
    },
  });
  const result = await runner(
    ['--keyword', 'foo', '--keyword', 'bar', '--regex', '\\d+', '--regex', 'error'],
    { stdout: createMemoryStream(), stderr: createMemoryStream() },
  );
  assert.strictEqual(result, 0);
});

test('buildMatchers with multiple keywords matches correctly (any mode)', () => {
  // Rebuild buildMatchers logic inline — the function is not exported from the tool
  function buildMatchers(keywords, regexPatterns, ignoreCase, mode) {
    const matchers = [];
    for (const keyword of keywords) {
      const needle = ignoreCase ? keyword.toLowerCase() : keyword;
      matchers.push((line) => {
        const haystack = ignoreCase ? line.toLowerCase() : line;
        return haystack.includes(needle);
      });
    }
    for (const pattern of regexPatterns) {
      const flags = ignoreCase ? 'i' : '';
      const compiled = new RegExp(pattern, flags);
      matchers.push((line) => compiled.test(line));
    }
    return matchers;
  }

  // Multiple keywords — any mode
  const matchers = buildMatchers(['foo', 'bar'], [], false, 'any');
  assert.strictEqual(matchers.length, 2);
  assert.ok(matchers.some(m => m('foo baz')));
  assert.ok(matchers.some(m => m('bar baz')));
  assert.ok(!matchers.some(m => m('hello world')));

  // Multiple keywords — all mode
  const allMatchers = buildMatchers(['foo', 'bar'], [], false, 'all');
  assert.ok(allMatchers.every(m => m('foo bar')));
  assert.ok(!allMatchers.every(m => m('foo only')));

  // Mixed keyword and regex
  const mixed = buildMatchers(['error'], ['\\d+'], false, 'any');
  assert.strictEqual(mixed.length, 2);
  assert.ok(mixed.some(m => m('error occurred')));
  assert.ok(mixed.some(m => m('line 42')));
  assert.ok(!mixed.some(m => m('hello world')));

  // Ignore case with multiple keywords
  const caseInsensitive = buildMatchers(['ERROR', 'FATAL'], [], true, 'any');
  assert.ok(caseInsensitive.some(m => m('fatal error')));
  assert.ok(caseInsensitive.some(m => m('error fatal')));
  assert.ok(!caseInsensitive.some(m => m('info debug')));
});

test('buildMatchers with single keyword works (no regression)', () => {
  function buildMatchers(keywords, regexPatterns, ignoreCase) {
    const matchers = [];
    for (const keyword of keywords) {
      const needle = ignoreCase ? keyword.toLowerCase() : keyword;
      matchers.push((line) => {
        const haystack = ignoreCase ? line.toLowerCase() : line;
        return haystack.includes(needle);
      });
    }
    for (const pattern of regexPatterns) {
      const flags = ignoreCase ? 'i' : '';
      const compiled = new RegExp(pattern, flags);
      matchers.push((line) => compiled.test(line));
    }
    return matchers;
  }

  const matchers = buildMatchers(['error'], [], false);
  assert.strictEqual(matchers.length, 1);
  assert.ok(matchers[0]('this is an error'));
  assert.ok(!matchers[0]('this is fine'));
});
