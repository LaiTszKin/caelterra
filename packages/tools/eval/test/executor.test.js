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

// =========================================================================
// REGTEST-02 (Round 7): exec-lock 陳舊鎖自動清除
// =========================================================================
describe('REGTEST-02 (R7): exec-lock 陳舊鎖自動清除', () => {
  const testDate = `regtest-r7-02-${Date.now()}`;
  const projectRoot = getProjectRoot();
  const resultsBase = path.join(projectRoot, 'results', 'spec', testDate);
  const lockPath = path.join(resultsBase, '.exec-lock');

  before(() => {
    fs.mkdirSync(resultsBase, { recursive: true });
    fs.mkdirSync(lockPath);
    // Set mtime to 6 minutes ago (older than STALE_LOCK_MS = 5 min)
    const staleTime = new Date(Date.now() - 6 * 60 * 1000);
    fs.utimesSync(lockPath, staleTime, staleTime);
  });

  after(() => {
    fs.rmSync(resultsBase, { recursive: true, force: true });
  });

  it('should auto-clear stale exec-lock and proceed normally', async () => {
    // Should NOT throw "already in progress" because lock is stale
    const results = await runAllTests([], mockEnv, testDate, 'test-skill');
    assert.ok(Array.isArray(results), 'runAllTests should return an array');
    assert.equal(results.length, 0, 'With empty questions, results should be empty');
  });
});

// =========================================================================
// REGTEST-04 (Round 7): TraceEvent type 包含 'round' event
// =========================================================================
describe('REGTEST-04 (R7): TraceEvent type 包含 round event', () => {
  it('TraceEvent type union should include round', () => {
    const source = fs.readFileSync(
      new URL('../executor.ts', import.meta.url), 'utf-8',
    );

    // Find TraceEvent interface/type definition
    const traceEventStart = source.indexOf('export interface TraceEvent');
    assert.ok(traceEventStart >= 0, 'TraceEvent interface must exist');

    // Read the type definition (next ~300 chars should cover the type union)
    const traceEventSection = source.slice(traceEventStart, traceEventStart + 300);

    // VERIFY: 'round' is in the type union
    assert.ok(
      traceEventSection.includes("'round'"),
      'TraceEvent type union must include "round"',
    );

    // VERIFY: Find the 'round' event recording in executeSingleTest
    const roundEventWrite = source.indexOf("type: 'round'");
    assert.ok(roundEventWrite >= 0, 'executeSingleTest must record round events');

    // The round event should appear inside the tool-use loop (between for loop and finish_reason check)
    const forLoopStart = source.indexOf('for (let round = 0;');
    assert.ok(forLoopStart >= 0, 'for loop must exist');
    assert.ok(
      roundEventWrite > forLoopStart,
      'round event recording must be inside the tool-use loop',
    );
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
