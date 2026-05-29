import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runAllTests } from '../dist/executor.js';
import { getProjectRoot } from '../dist/lib/project-root.js';

const mockEnv = {
  EXEC_BASE_URL: 'http://localhost:9999',
  EXEC_MODEL: 'test-model',
  EXEC_API_KEY: 'test-key',
  JUDGE_BASE_URL: 'http://localhost:9999',
  JUDGE_MODEL: 'test-model',
  JUDGE_API_KEY: 'test-key',
  EXEC_REASONING_EFFORT: '',
  JUDGE_REASONING_EFFORT: '',
  EXEC_CONCURRENCY: 1,
  JUDGE_CONCURRENCY: 1,
  EXEC_TIMEOUT: 10,
  JUDGE_TIMEOUT: 10,
};

describe('REGTEST-06: 磁碟空間檢查（happy path）', () => {
  const testDate = `regtest-06-${Date.now()}`;
  const projectRoot = getProjectRoot();
  const resultsBase = path.join(projectRoot, 'results', 'spec', testDate);

  before(() => {
    fs.mkdirSync(resultsBase, { recursive: true });
  });

  after(() => {
    fs.rmSync(resultsBase, { recursive: true, force: true });
  });

  it('should proceed without disk-space error when sufficient space available', async () => {
    const results = await runAllTests([], mockEnv, testDate, 'test-skill');
    assert.ok(Array.isArray(results), 'runAllTests should return an array');
    assert.equal(results.length, 0, 'With empty questions, results should be empty');
  });
});

describe('REGTEST-11: 並發鎖', () => {
  const testDate = `regtest-11-${Date.now()}`;
  const projectRoot = getProjectRoot();
  const resultsBase = path.join(projectRoot, 'results', 'spec', testDate);

  before(() => {
    fs.mkdirSync(resultsBase, { recursive: true });
    fs.mkdirSync(path.join(resultsBase, '.exec-lock'));
  });

  after(() => {
    fs.rmSync(resultsBase, { recursive: true, force: true });
  });

  it('should throw when .exec-lock already exists', async () => {
    try {
      await runAllTests([], mockEnv, testDate, 'test-skill');
      assert.fail('Expected runAllTests to throw due to exec lock');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      assert.ok(
        msg.includes('already in progress'),
        `Error message should mention "already in progress", got: ${msg}`,
      );
    }
  });
});
