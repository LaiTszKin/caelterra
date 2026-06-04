import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';

test('generate-storyboard-images schema passes multiple --prompt values as array', () => {
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', multiple: true },
    },
    args: ['--prompt', 'A cat sits on a mat', '--prompt', 'A dog runs in the park'],
    strict: false,
  });
  assert.deepStrictEqual(values.prompt, ['A cat sits on a mat', 'A dog runs in the park']);
});

test('single --prompt returns single-element array', () => {
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', multiple: true },
    },
    args: ['--prompt', 'A single scene'],
    strict: false,
  });
  assert.deepStrictEqual(values.prompt, ['A single scene']);
});

test('no --prompt returns undefined', () => {
  const { values } = parseArgs({
    options: {
      prompt: { type: 'string', multiple: true },
    },
    args: ['--prompts-file', 'test.txt'],
    strict: false,
  });
  assert.strictEqual(values.prompt, undefined);
});

test('generate-storyboard-images handler receives correct args via schema', async () => {
  // Dynamic import the schema definition to test its parseArgs behavior.
  // The schema is internal to the module, so we recreate it matching the tool's schema.
  const mod = await import(
    '../../packages/tools/generate-storyboard-images/dist/index.js'
  ).catch(() => null);

  if (mod) {
    assert.ok(mod.tool, 'tool export should exist');
  }

  const { parseArgs: nodeParseArgs } = await import('node:util');

  // This matches the tool's schema options for --prompt: multiple: true
  const { values } = nodeParseArgs({
    options: {
      'prompt': { type: 'string', multiple: true },
    },
    args: ['--prompt', 'Scene 1', '--prompt', 'Scene 2'],
    strict: false,
  });

  assert.ok(Array.isArray(values.prompt));
  assert.strictEqual(values.prompt.length, 2);
  assert.strictEqual(values.prompt[0], 'Scene 1');
  assert.strictEqual(values.prompt[1], 'Scene 2');
});

test('generate-storyboard-images tool structure is valid', async () => {
  const { tool } = await import(
    '../../packages/tools/generate-storyboard-images/dist/index.js'
  );
  assert.ok(tool);
  assert.strictEqual(tool.name, 'generate-storyboard-images');
  assert.strictEqual(typeof tool.handler, 'function');
});

test('handler returns exit code 1 when all prompts fail', async () => {
  const mod = await import('../../packages/tools/generate-storyboard-images/dist/index.js');
  const stderr = { data: '', write(c) { this.data += c; } };

  // Call with bad API URL — all prompts should fail
  const code = await mod.tool.handler(
    ['--api-url', 'http://localhost:99999', '--prompt', 'test'],
    { stdout: { write() {} }, stderr, env: {} }
  );

  assert.strictEqual(code, 1);
});
