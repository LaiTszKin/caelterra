import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { tool } from '../dist/index.js';
import { getProjectRoot } from '../dist/lib/project-root.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuestion(id, difficulty) {
  return {
    id,
    userPrompt: `Write a spec for ${id}`,
    difficulty,
    projectContext: { description: 'Test project', files: [] },
    scoringCriteria: {
      outcome: { weight: 0.3, checks: [{ id: 'o1', description: 'Complete task', passCondition: 'Output exists' }] },
      process: { weight: 0.3, checks: [{ id: 'p1', description: 'Follow process', passCondition: 'Steps done' }] },
      style: { weight: 0.2, checks: [{ id: 's1', description: 'Correct format', passCondition: 'Valid format' }] },
      efficiency: { weight: 0.2, checks: [{ id: 'e1', description: 'Efficient', passCondition: 'Quick' }] },
    },
  };
}

function judgeScoreJSON(overallScore) {
  return JSON.stringify({
    overallScore,
    dimensions: [
      { name: 'instruction_adherence', score: overallScore, maxScore: 100, weight: 0.33, comments: 't' },
      { name: 'tool_calling', score: overallScore, maxScore: 100, weight: 0.33, comments: 't' },
      { name: 'result_quality', score: overallScore, maxScore: 100, weight: 0.34, comments: 't' },
    ],
    issues: [{ severity: 'P0', category: 'skill', description: 'Major issue', evidence: 'L10: evidence' }],
    summary: 'Low score evaluation',
  });
}

// =========================================================================
// REGTEST-14
// =========================================================================
describe('REGTEST-14: exit code 低分檢查', () => {
  const skillName = `test-skill-${Date.now()}`;
  const realRoot = getProjectRoot();
  const today = new Date().toISOString().slice(0, 10);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `rg14-${Date.now()}-`));

  // Paths under the real project root (pipeline functions use getProjectRoot())
  const realQDir = path.join(realRoot, 'assets', 'spec', today);
  const rDir = path.join(realRoot, 'results', 'spec', today);

  // Paths under the temp sandbox (for loadEnv via chdir + context.sourceRoot)
  const tmpQDir = path.join(tmpDir, 'assets', 'spec', today);
  const envFile = path.join(tmpDir, '.env');
  const skillDir = path.join(tmpDir, 'skills', skillName);
  const skillMdFile = path.join(skillDir, 'SKILL.md');

  const origCwd = process.cwd();
  let origFetch;

  before(() => {
    // ---- Temp dir setup (for .env + sourceRoot) ----
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      skillMdFile,
      `---\nname: ${skillName}\ndescription: Test skill for REGTEST-14\n---\n\n## Section\n\nContent\n`,
      'utf-8',
    );
    fs.writeFileSync(envFile, [
      'EXEC_BASE_URL=http://localhost:9999',
      'EXEC_MODEL=exec-model',
      'EXEC_API_KEY=test-key',
      'JUDGE_BASE_URL=http://localhost:9999',
      'JUDGE_MODEL=judge-model',
      'JUDGE_API_KEY=test-key',
    ].join('\n'), 'utf-8');

    // ---- Question bank: needed at BOTH locations ----
    // evalHandler uses sourceRoot (tmpDir) to construct the path.
    // Pipeline functions (scoreAllTests) use getProjectRoot() (realRoot).
    const questions = [
      makeQuestion('Q001', 'basic'),
      makeQuestion('Q002', 'advanced'),
      makeQuestion('Q003', 'edge'),
    ];
    const qData = JSON.stringify(questions);
    fs.mkdirSync(realQDir, { recursive: true });
    fs.writeFileSync(path.join(realQDir, 'test-questions.json'), qData, 'utf-8');
    fs.mkdirSync(tmpQDir, { recursive: true });
    fs.writeFileSync(path.join(tmpQDir, 'test-questions.json'), qData, 'utf-8');

    // ---- Results directory: needed by runAllTests for .exec-lock ----
    fs.mkdirSync(rDir, { recursive: true });

    // ---- Mock fetch (handles both exec and judge API calls) ----
    origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        model: 'm',
        usage: { total_tokens: 10 },
        choices: [{ finish_reason: 'stop', message: { content: judgeScoreJSON(45) } }],
      }),
      text: async () => '',
    });

    // ---- chdir to tmpDir so loadEnv() picks up .env ----
    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(origCwd);
    globalThis.fetch = origFetch;

    // Cleanup real-project-root artifacts
    try { fs.rmSync(realQDir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(rDir, { recursive: true, force: true }); } catch { /* ignore */ }

    // Cleanup tmp sandbox
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should return exit code 1 when average overall score < 60', async () => {
    const stdoutBuf = [];
    const stderrBuf = [];

    const handler = tool.handler;
    const exitCode = await handler([skillName], {
      sourceRoot: tmpDir,
      stdout: { write: (s) => { stdoutBuf.push(s); return true; } },
      stderr: { write: (s) => { stderrBuf.push(s); return true; } },
    });

    // Since the mock judge returns overallScore=45 for all 3 tests,
    // the average is 45 < 60, so exit code must be 1.
    assert.equal(exitCode, 1, `Expected exit code 1 for low avg score, got ${exitCode}`);

    // Also verify the stderr contains the expected FAIL message
    const hasFailMsg = stderrBuf.some((s) => s.includes('below threshold'));
    assert.ok(hasFailMsg, 'Expected stderr to contain low-score threshold message');
  });
});
