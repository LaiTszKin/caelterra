import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tool as createSpecsTool } from '@laitszkin/tool-create-specs';

const createSpecsHandler =
  /** @type {import('@laitszkin/tool-registry').ToolDefinition['handler']} */ (
    createSpecsTool.handler
  );
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createMemoryStream() {
  let data = '';
  return {
    write(chunk) {
      data += chunk;
      return true;
    },
    toString() {
      return data;
    },
  };
}

function withFixedDate(isoString, fn) {
  const origToISO = Date.prototype.toISOString;
  Date.prototype.toISOString = () => isoString;
  try {
    return fn();
  } finally {
    Date.prototype.toISOString = origToISO;
  }
}

const FIXED_DATE = '2026-05-16';
const FIXED_ISO = `${FIXED_DATE}T00:00:00.000Z`;

const TEMPLATE_DIR = path.resolve(
  __dirname,
  '../../skills/spec/assets/templates',
);

function testHandler(args) {
  const stdout = createMemoryStream();
  const stderr = createMemoryStream();
  const argsWithTemplate = [...args, '--template-dir', TEMPLATE_DIR];
  return withFixedDate(FIXED_ISO, () =>
    createSpecsHandler(argsWithTemplate, { stdout, stderr }),
  ).then((code) => ({ code, stdout, stderr }));
}

test('createSpecsHandler creates correct directory structure (default)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-create-specs-'));
  const { code, stderr } = await testHandler(
    ['My Feature', '--output-dir', tmpDir],
    tmpDir,
  );

  assert.equal(code, 0, stderr.toString());
  assert.ok(
    fs.existsSync(path.join(tmpDir, FIXED_DATE, 'my-feature', 'SPEC.md')),
  );
  assert.ok(!fs.existsSync(path.join(tmpDir, FIXED_DATE, FIXED_DATE)));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('createSpecsHandler with --batch-name creates batch structure', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-create-specs-'));
  const { code, stderr } = await testHandler(
    [
      'Batch Feature',
      '--batch-name',
      'my-batch',
      '--change-name',
      'feat-1',
      '--output-dir',
      tmpDir,
    ],
    tmpDir,
  );

  assert.equal(code, 0, stderr.toString());
  assert.ok(
    fs.existsSync(
      path.join(tmpDir, FIXED_DATE, 'my-batch', 'feat-1', 'SPEC.md'),
    ),
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('createSpecsHandler prevents double-nesting when output-dir points to existing date folder', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-create-specs-'));
  const existingDateDir = path.join(tmpDir, FIXED_DATE);
  fs.mkdirSync(existingDateDir, { recursive: true });

  const { code, stderr } = await testHandler(
    ['Another Feature', '--output-dir', existingDateDir],
    tmpDir,
  );

  assert.equal(code, 0, stderr.toString());
  assert.ok(
    fs.existsSync(path.join(existingDateDir, 'another-feature', 'SPEC.md')),
  );
  assert.ok(!fs.existsSync(path.join(existingDateDir, FIXED_DATE)));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('createSpecsHandler uses correct today output in templates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-create-specs-'));
  const { code, stderr } = await testHandler(
    ['Dated Feature', '--output-dir', tmpDir],
    tmpDir,
  );

  assert.equal(code, 0, stderr.toString());
  const specPath = path.join(tmpDir, FIXED_DATE, 'dated-feature', 'SPEC.md');
  const content = fs.readFileSync(specPath, 'utf-8');
  assert.ok(content.includes(FIXED_DATE));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
