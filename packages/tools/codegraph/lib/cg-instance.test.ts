import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createOrOpenIndex } from './cg-instance.js';

describe('createOrOpenIndex', () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should throw when project is already initialized', async () => {
    // Arrange: create .codegraph/ and codegraph.db to simulate an initialized project
    const codegraphDir = path.join(tmpDir, '.codegraph');
    fs.mkdirSync(codegraphDir, { recursive: true });
    fs.writeFileSync(path.join(codegraphDir, 'codegraph.db'), '');

    // Act & Assert
    const result = createOrOpenIndex(tmpDir);
    assert.ok(result instanceof Promise);
    await assert.rejects(result, (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /sync/);
      return true;
    });
  });
});
