import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { readTrace, scoreAllTests } from '../dist/scorer.js';
import { getProjectRoot } from '../dist/lib/project-root.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createJudgeScoreJSON(overallScore) {
  return JSON.stringify({
    overallScore,
    dimensions: [
      { name: 'instruction_adherence', score: overallScore, maxScore: 100, weight: 0.33, comments: 'test' },
      { name: 'tool_calling', score: overallScore, maxScore: 100, weight: 0.33, comments: 'test' },
      { name: 'result_quality', score: overallScore, maxScore: 100, weight: 0.34, comments: 'test' },
    ],
    issues: [],
    summary: 'Test evaluation outcome.',
  });
}

function makeEnv(concurrency) {
  return {
    EXEC_BASE_URL: 'http://localhost:9999',
    EXEC_MODEL: 'exec-model',
    EXEC_API_KEY: 'key',
    JUDGE_BASE_URL: 'http://localhost:9999',
    JUDGE_MODEL: 'judge-model',
    JUDGE_API_KEY: 'key',
    EXEC_REASONING_EFFORT: '',
    JUDGE_REASONING_EFFORT: '',
    EXEC_CONCURRENCY: 1,
    JUDGE_CONCURRENCY: concurrency,
    EXEC_TIMEOUT: 10,
    JUDGE_TIMEOUT: 10,
  };
}

function makeQuestions(testIds) {
  return testIds.map((id) => ({
    id,
    userPrompt: `Write a spec for ${id}`,
    difficulty: id === 'Q001' ? 'basic' : id === 'Q002' ? 'advanced' : 'edge',
    projectContext: { description: 'Test project', files: [] },
    scoringCriteria: {
      outcome: { weight: 0.3, checks: [{ id: 'o1', description: 'Complete task', passCondition: 'Output exists' }] },
      process: { weight: 0.3, checks: [{ id: 'p1', description: 'Follow process', passCondition: 'Steps done' }] },
      style: { weight: 0.2, checks: [{ id: 's1', description: 'Correct format', passCondition: 'Valid format' }] },
      efficiency: { weight: 0.2, checks: [{ id: 'e1', description: 'Efficient', passCondition: 'Quick' }] },
    },
  }));
}

function makeTraceContent() {
  const events = [
    { type: 'start', timestamp: '2024-01-01T00:00:00.000Z', data: { testId: 'X', difficulty: 'basic' } },
    { type: 'thinking', timestamp: '2024-01-01T00:00:01.000Z', data: { systemPrompt: 'prompt', userPrompt: 'prompt' } },
    { type: 'response', timestamp: '2024-01-01T00:00:02.000Z', data: { model: 't', usage: {}, message: { content: 'OK' }, finish_reason: 'stop', rounds: 1, totalToolCalls: 0 } },
    { type: 'end', timestamp: '2024-01-01T00:00:03.000Z', data: { duration_ms: 3000, status: 'completed' } },
  ];
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function seedTestRun(root, date, testIds) {
  const resultsBase = path.join(root, 'results', 'spec', date);
  const assetsDir = path.join(root, 'assets', 'spec', date);

  // Question bank
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, 'test-questions.json'), JSON.stringify(makeQuestions(testIds)), 'utf-8');

  // .done + trace for each test
  for (const id of testIds) {
    const td = path.join(resultsBase, `test_${id}`);
    fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, 'trace.jsonl'), makeTraceContent(), 'utf-8');
    fs.writeFileSync(path.join(td, '.done'), JSON.stringify({ testId: id }), 'utf-8');
  }
  return { resultsBase, assetsDir };
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// =========================================================================
// REGTEST-02
// =========================================================================
describe('REGTEST-02: readTrace 行號', () => {
  it('should annotate events with correct JSONL line numbers', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rg02-'));
    const tracePath = path.join(tmp, 'trace.jsonl');
    const lines = [];
    for (let i = 0; i < 5; i++) {
      lines.push(JSON.stringify({ type: 'test', timestamp: '2024-01-01T00:00:00.000Z', data: { n: i } }));
    }
    fs.writeFileSync(tracePath, lines.join('\n') + '\n', 'utf-8');

    const { events } = await readTrace(tracePath);
    assert.equal(events.length, 5);
    assert.equal(events[0]._lineNumber, 1);
    assert.equal(events[4]._lineNumber, 5);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// =========================================================================
// REGTEST-07
// =========================================================================
describe('REGTEST-07: 無法評分標記', () => {
  it('should set hasCorruption when trace contains invalid JSON lines', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rg07-'));
    const tracePath = path.join(tmp, 'trace.jsonl');
    const content =
      JSON.stringify({ type: 'start', timestamp: '2024-01-01T00:00:00.000Z', data: {} }) +
      '\n' +
      'this is not valid json\n' +
      JSON.stringify({ type: 'end', timestamp: '2024-01-01T00:00:01.000Z', data: {} }) +
      '\n';
    fs.writeFileSync(tracePath, content, 'utf-8');

    const { hasCorruption } = await readTrace(tracePath);
    assert.equal(hasCorruption, true);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// =========================================================================
// REGTEST-04
// =========================================================================
describe('REGTEST-04: questionMap 預載入', () => {
  const root = getProjectRoot();
  const date = `rg04-${Date.now()}`;
  const testIds = ['Q001', 'Q002', 'Q003'];
  let rBase;
  let aDir;
  let origFetch;

  before(() => {
    origFetch = globalThis.fetch;
    const seeded = seedTestRun(root, date, testIds);
    rBase = seeded.resultsBase;
    aDir = seeded.assetsDir;

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        model: 'm',
        usage: { total_tokens: 5 },
        choices: [{ finish_reason: 'stop', message: { content: createJudgeScoreJSON(85) } }],
      }),
      text: async () => '',
    });
  });

  after(() => {
    globalThis.fetch = origFetch;
    cleanup(rBase, aDir);
  });

  it('should process all 3 tests via pre-loaded questionMap', async () => {
    const env = makeEnv(1);
    const results = await scoreAllTests(date, env);

    assert.equal(results.length, 3, `Expected 3 scored results, got ${results.length}`);
    const ids = results.map((r) => r.testId).sort();
    assert.deepEqual(ids, ['Q001', 'Q002', 'Q003']);

    for (const r of results) {
      assert.ok(r.overallScore > 0, `Score for ${r.testId} should be > 0, got ${r.overallScore}`);
      assert.ok(r.dimensions.length >= 3, `Dimensions missing for ${r.testId}`);
      assert.equal(r.scorable, true, `${r.testId} should be scorable`);
    }
  });
});

// =========================================================================
// REGTEST-13
// =========================================================================
describe('REGTEST-13: 非同步 I/O（並發度 3）', () => {
  const root = getProjectRoot();
  const date = `rg13-${Date.now()}`;
  const testIds = ['Q001', 'Q002', 'Q003'];
  let rBase;
  let aDir;
  let origFetch;

  before(() => {
    origFetch = globalThis.fetch;
    const seeded = seedTestRun(root, date, testIds);
    rBase = seeded.resultsBase;
    aDir = seeded.assetsDir;

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        model: 'm',
        usage: { total_tokens: 5 },
        choices: [{ finish_reason: 'stop', message: { content: createJudgeScoreJSON(75) } }],
      }),
      text: async () => '',
    });
  });

  after(() => {
    globalThis.fetch = origFetch;
    cleanup(rBase, aDir);
  });

  it('should complete 3 tests with concurrency 3 without error', async () => {
    const env = makeEnv(3);
    const results = await scoreAllTests(date, env);

    assert.equal(results.length, 3, `Expected 3 results, got ${results.length}`);
    const ids = results.map((r) => r.testId).sort();
    assert.deepEqual(ids, ['Q001', 'Q002', 'Q003']);
  });
});
