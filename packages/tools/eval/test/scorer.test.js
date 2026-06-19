import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  readTrace,
  scoreAllTests,
  buildJudgePrompt,
  scoreSingleTest,
} from '../dist/scorer.js';
import { getProjectRoot } from '../dist/lib/project-root.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createJudgeScoreJSON(overallScore) {
  return JSON.stringify({
    overallScore,
    dimensions: [
      {
        name: 'instruction_adherence',
        score: overallScore,
        maxScore: 100,
        weight: 0.33,
        comments: 'test',
      },
      {
        name: 'tool_calling',
        score: overallScore,
        maxScore: 100,
        weight: 0.33,
        comments: 'test',
      },
      {
        name: 'result_quality',
        score: overallScore,
        maxScore: 100,
        weight: 0.34,
        comments: 'test',
      },
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
      outcome: {
        weight: 0.3,
        checks: [
          {
            id: 'o1',
            description: 'Complete task',
            passCondition: 'Output exists',
          },
        ],
      },
      process: {
        weight: 0.3,
        checks: [
          {
            id: 'p1',
            description: 'Follow process',
            passCondition: 'Steps done',
          },
        ],
      },
      style: {
        weight: 0.2,
        checks: [
          {
            id: 's1',
            description: 'Correct format',
            passCondition: 'Valid format',
          },
        ],
      },
      efficiency: {
        weight: 0.2,
        checks: [
          { id: 'e1', description: 'Efficient', passCondition: 'Quick' },
        ],
      },
    },
  }));
}

function makeTraceContent() {
  const events = [
    {
      type: 'start',
      timestamp: '2024-01-01T00:00:00.000Z',
      data: { testId: 'X', difficulty: 'basic' },
    },
    {
      type: 'thinking',
      timestamp: '2024-01-01T00:00:01.000Z',
      data: { systemPrompt: 'prompt', userPrompt: 'prompt' },
    },
    {
      type: 'response',
      timestamp: '2024-01-01T00:00:02.000Z',
      data: {
        model: 't',
        usage: {},
        message: { content: 'OK' },
        finish_reason: 'stop',
        rounds: 1,
        totalToolCalls: 0,
      },
    },
    {
      type: 'end',
      timestamp: '2024-01-01T00:00:03.000Z',
      data: { duration_ms: 3000, status: 'completed' },
    },
  ];
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function seedTestRun(root, date, testIds) {
  const resultsBase = path.join(root, 'results', 'spec', date);
  const assetsDir = path.join(root, 'assets', 'spec', date);

  // Question bank
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(
    path.join(assetsDir, 'test-questions.json'),
    JSON.stringify(makeQuestions(testIds)),
    'utf-8',
  );

  // .done + trace for each test
  for (const id of testIds) {
    const td = path.join(resultsBase, `test_${id}`);
    fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, 'trace.jsonl'), makeTraceContent(), 'utf-8');
    fs.writeFileSync(
      path.join(td, '.done'),
      JSON.stringify({ testId: id }),
      'utf-8',
    );
  }
  return { resultsBase, assetsDir };
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
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
      lines.push(
        JSON.stringify({
          type: 'test',
          timestamp: '2024-01-01T00:00:00.000Z',
          data: { n: i },
        }),
      );
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
      JSON.stringify({
        type: 'start',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: {},
      }) +
      '\n' +
      'this is not valid json\n' +
      JSON.stringify({
        type: 'end',
        timestamp: '2024-01-01T00:00:01.000Z',
        data: {},
      }) +
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
        choices: [
          {
            finish_reason: 'stop',
            message: { content: createJudgeScoreJSON(85) },
          },
        ],
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

    assert.equal(
      results.length,
      3,
      `Expected 3 scored results, got ${results.length}`,
    );
    const ids = results.map((r) => r.testId).sort();
    assert.deepEqual(ids, ['Q001', 'Q002', 'Q003']);

    for (const r of results) {
      assert.ok(
        r.overallScore > 0,
        `Score for ${r.testId} should be > 0, got ${r.overallScore}`,
      );
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
        choices: [
          {
            finish_reason: 'stop',
            message: { content: createJudgeScoreJSON(75) },
          },
        ],
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

    assert.equal(
      results.length,
      3,
      `Expected 3 results, got ${results.length}`,
    );
    const ids = results.map((r) => r.testId).sort();
    assert.deepEqual(ids, ['Q001', 'Q002', 'Q003']);
  });
});

// =========================================================================
// REGTEST-14 (FIX-04): buildJudgePrompt trace events summary
// =========================================================================
describe('REGTEST-14: buildJudgePrompt trace events section', () => {
  it('should include line-numbered tool_call and tool_result summaries', () => {
    const trace = [
      {
        type: 'thinking',
        timestamp: '2024-01-01T00:00:01.000Z',
        data: { systemPrompt: '', userPrompt: 'test' },
        _lineNumber: 1,
      },
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:02.000Z',
        data: { tool: 'Read', params: { file_path: 'test.md' } },
        _lineNumber: 5,
      },
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:03.000Z',
        data: { tool: 'Read', result: { data: 'content' } },
        _lineNumber: 7,
      },
      {
        type: 'response',
        timestamp: '2024-01-01T00:00:04.000Z',
        data: { message: { content: 'done' } },
        _lineNumber: 10,
      },
    ];

    const scoringCriteria = {
      outcome: {
        weight: 0.3,
        checks: [
          {
            id: 'o1',
            description: 'Complete task',
            passCondition: 'Output exists',
          },
        ],
      },
      process: {
        weight: 0.3,
        checks: [
          {
            id: 'p1',
            description: 'Follow process',
            passCondition: 'Steps done',
          },
        ],
      },
      style: {
        weight: 0.2,
        checks: [
          {
            id: 's1',
            description: 'Correct format',
            passCondition: 'Valid format',
          },
        ],
      },
      efficiency: {
        weight: 0.2,
        checks: [
          { id: 'e1', description: 'Efficient', passCondition: 'Quick' },
        ],
      },
    };

    const prompt = buildJudgePrompt(trace, scoringCriteria, 'Q001');

    assert.ok(
      prompt.includes('L5:'),
      'prompt should contain L5: line number reference',
    );
    assert.ok(
      prompt.includes('L7:'),
      'prompt should contain L7: line number reference',
    );
    assert.ok(
      prompt.includes('tool_call'),
      'prompt should contain tool_call event type',
    );
    assert.ok(
      prompt.includes('tool_result'),
      'prompt should contain tool_result event type',
    );
  });
});

// =========================================================================
// REGTEST-B: 鎖定清理 catch 非空
// =========================================================================
describe('REGTEST-B: scoring lock cleanup catch should log errors', () => {
  it('should verify the catch block near .scoring-lock is not empty and uses console.error', () => {
    const source = fs.readFileSync(
      new URL('../scorer.ts', import.meta.url),
      'utf-8',
    );
    // Find the ".scoring-lock" area and check the catch block
    const lockIdx = source.indexOf('.scoring-lock');
    assert.ok(lockIdx >= 0, 'Source should reference .scoring-lock');

    const afterLock = source.slice(lockIdx, lockIdx + 800);
    // The catch block near scoring-lock should have console.error or similar
    const catchMatch = afterLock.match(/catch\s*\([^)]*\)\s*\{([^}]*)\}/);
    if (catchMatch) {
      const catchBody = catchMatch[1].trim();
      assert.ok(catchBody.length > 0, 'Catch block should not be empty');
      assert.ok(
        catchBody.includes('console.error'),
        `Catch should use console.error, got: "${catchBody.substring(0, 100)}"`,
      );
    }
  });
});

// =========================================================================
// REGTEST-C: scoreAllTests 使用 scanForDoneAsync
// =========================================================================
describe('REGTEST-C: scoreAllTests should use scanForDoneAsync', () => {
  it('should verify scoreAllTests calls scanForDoneAsync (not sync scanForDone)', () => {
    const source = fs.readFileSync(
      new URL('../scorer.ts', import.meta.url),
      'utf-8',
    );

    // Find the scoreAllTests function body
    const funcStart = source.indexOf('export async function scoreAllTests');
    assert.ok(funcStart >= 0, 'scoreAllTests function should exist');

    // Read until the directory scanning section (~600 chars should be enough)
    const funcBody = source.slice(funcStart, funcStart + 1000);

    assert.ok(
      funcBody.includes('scanForDoneAsync'),
      'scoreAllTests should call scanForDoneAsync',
    );
    // The sync version should NOT be the call site
    const syncCallMatch = funcBody.match(/scanForDone\([^)]+\)/);
    if (syncCallMatch) {
      assert.fail(
        `scoreAllTests should NOT call scanForDone (sync), found: "${syncCallMatch[0]}"`,
      );
    }
  });
});

// =========================================================================
// REGTEST-03 (Round 7): scoring-lock 陳舊鎖不導致 skipped
// =========================================================================
describe('REGTEST-03 (R7): scoring-lock 陳舊鎖不導致 skipped', () => {
  const root = getProjectRoot();
  const date = `rg-r7-03-${Date.now()}`;
  const testId = 'Q001';
  let rBase;
  let aDir;
  let resultsTestDir;
  let lockDir;
  let origFetch;

  before(() => {
    origFetch = globalThis.fetch;

    // Seed the test directory with trace.jsonl and question bank
    const seeded = seedTestRun(root, date, [testId]);
    rBase = seeded.resultsBase;
    aDir = seeded.assetsDir;
    resultsTestDir = path.join(rBase, `test_${testId}`);
    lockDir = path.join(resultsTestDir, '.scoring-lock');

    // Create a stale .scoring-lock directory
    fs.mkdirSync(lockDir);
    const staleTime = new Date(Date.now() - 6 * 60 * 1000); // 6 min ago
    fs.utimesSync(lockDir, staleTime, staleTime);

    // Mock fetch for judge API calls
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        model: 'judge-model',
        usage: { total_tokens: 5 },
        choices: [
          {
            finish_reason: 'stop',
            message: { content: createJudgeScoreJSON(85) },
          },
        ],
      }),
      text: async () => '',
    });
  });

  after(() => {
    globalThis.fetch = origFetch;
    cleanup(rBase, aDir);
  });

  it('should clear stale scoring-lock and score normally (not skipped)', async () => {
    const env = makeEnv(1);

    // Build a question map so scoreSingleTest does not need to read from disk
    const questionMap = {};
    const questions = makeQuestions([testId]);
    for (const q of questions) {
      questionMap[q.id] = q;
    }

    const result = await scoreSingleTest(testId, date, env, questionMap);

    // VERIFY: result should NOT be skipped
    assert.ok(
      !result.skipped,
      'Stale scoring-lock should be cleared, result should not be skipped',
    );
    assert.ok(
      result.score !== null,
      'Score should not be null (stale lock was cleared)',
    );
    assert.ok(result.score.overallScore > 0, 'Score should be positive');
    assert.equal(
      result.score.testId,
      testId,
      'Score should be for the correct test',
    );
  });
});

// =========================================================================
// REGTEST-02 (FIX-B): 評分鎖定原子性
// =========================================================================
describe('REGTEST-02: scoreSingleTest should acquire lock before calling judge API', () => {
  it('should verify mkdir(lockDir) appears before callJudgeModel in source', () => {
    const source = fs.readFileSync(
      new URL('../scorer.ts', import.meta.url),
      'utf-8',
    );

    const mkdirLockIndex = source.indexOf('await mkdir(lockDir)');
    const callJudgeIndex = source.indexOf('callJudgeModel(prompt');

    assert.ok(mkdirLockIndex >= 0, 'Source must contain mkdir(lockDir)');
    assert.ok(callJudgeIndex >= 0, 'Source must contain callJudgeModel');
    assert.ok(
      mkdirLockIndex < callJudgeIndex,
      'Lock acquisition (mkdir) must occur BEFORE judge API call (callJudgeModel)',
    );

    // Also verify .scored is written after score.json
    const scoreJsonWriteIndex = source.indexOf(
      'scorePath, JSON.stringify(score',
    );
    const scoredMarkerWriteIndex = source.indexOf('scoredPath, JSON.stringify');
    if (scoreJsonWriteIndex >= 0 && scoredMarkerWriteIndex >= 0) {
      assert.ok(
        scoreJsonWriteIndex < scoredMarkerWriteIndex,
        'score.json must be written BEFORE .scored marker',
      );
    }
  });
});

// =========================================================================
// REGTEST-01: buildJudgePrompt fallback text when thinking/response absent
// =========================================================================
describe('REGTEST-01: buildJudgePrompt uses fallback text when thinking and response events are absent', () => {
  it('should include (未記錄) and (無回應) when trace has only an end event', () => {
    const criteria = {
      outcome: {
        description: '',
        weight: 0.25,
        checks: [
          { id: 'O1', description: 'Task completed', passCondition: 'yes' },
        ],
      },
      process: {
        description: '',
        weight: 0.25,
        checks: [
          { id: 'P1', description: 'Followed process', passCondition: 'yes' },
        ],
      },
      style: {
        description: '',
        weight: 0.25,
        checks: [
          { id: 'S1', description: 'Proper format', passCondition: 'yes' },
        ],
      },
      efficiency: {
        description: '',
        weight: 0.25,
        checks: [{ id: 'E1', description: 'Efficient', passCondition: 'yes' }],
      },
    };
    const trace = [
      {
        type: 'end',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: { duration_ms: 1, status: 'completed' },
      },
    ];
    const prompt = buildJudgePrompt(trace, criteria, 'REGTEST-01');
    assert.ok(
      prompt.includes('(未記錄)'),
      'prompt should contain user prompt fallback (未記錄)',
    );
    assert.ok(
      prompt.includes('(無回應)'),
      'prompt should contain response fallback (無回應)',
    );
  });
});

// =========================================================================
// REGTEST-03 (FIX-B): JSONL 損壞跳過
// =========================================================================
describe('REGTEST-03: should skip judge API call when trace has corruption', () => {
  it('should verify corruption block does not call judge model', () => {
    const source = fs.readFileSync(
      new URL('../scorer.ts', import.meta.url),
      'utf-8',
    );

    const corruptionCheck = source.indexOf('if (hasCorruption)');
    assert.ok(
      corruptionCheck >= 0,
      'Source must have if (hasCorruption) check',
    );

    const corruptionSection = source.slice(
      corruptionCheck,
      corruptionCheck + 800,
    );

    // Should return early WITHOUT calling judge model when corrupted
    assert.ok(
      corruptionSection.includes('callJudgeModel') === false,
      'Corruption handling block should NOT call judge model',
    );

    // Should write score and return
    assert.ok(
      corruptionSection.includes('return { testId'),
      'Corruption handling should return a result',
    );
  });
});
