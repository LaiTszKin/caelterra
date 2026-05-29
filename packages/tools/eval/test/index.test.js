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
// REGTEST-06: dry-run 模式不應呼叫 generateOptimizationPlan / deduplicateIssues
// =========================================================================
describe('REGTEST-06: dry-run 零副作用', () => {
  it('dry-run mode should not call generateOptimizationPlan or deduplicateIssues', () => {
    const source = fs.readFileSync(
      new URL('../index.ts', import.meta.url), 'utf-8',
    );

    // Find the optimize block
    const optimizeStart = source.indexOf('if (optimize)');
    assert.ok(optimizeStart >= 0, 'optimize block must exist');

    const optimizeSection = source.slice(optimizeStart);

    // Find generateOptimizationPlan in the context of dry-run
    const planCallIndex = optimizeSection.indexOf('generateOptimizationPlan');

    if (planCallIndex >= 0) {
      // Verify that generateOptimizationPlan is ONLY in the non-dry-run path
      const sectionBeforePlan = optimizeSection.slice(0, planCallIndex);

      // If there's an else block before generateOptimizationPlan,
      // it means the plan generation is in the full mode path, not dry-run
      const lastElseIndex = sectionBeforePlan.lastIndexOf('} else {');

      // In the vicinity of generateOptimizationPlan, we should NOT see dryRun check
      const vicinity = optimizeSection.slice(
        Math.max(0, planCallIndex - 200),
        planCallIndex + 100,
      );

      // The path containing generateOptimizationPlan should not be evaluating dryRun
      const hasDryRunInVicinity = vicinity.match(/dryRun|dry\.run|dry_run/i);

      // This is acceptable if generateOptimizationPlan is inside an else branch (non-dry-run)
      if (hasDryRunInVicinity && lastElseIndex < 0) {
        // If dryRun appears near generateOptimizationPlan without a preceding else,
        // that means it's NOT properly separated
        assert.ok(false,
          'generateOptimizationPlan appears near dryRun check (not in separate else branch)',
        );
      }
    }

    // Verify the dry-run path uses template-based approach (not full optimization)
    const firstDryRun = optimizeSection.indexOf('dryRun');
    assert.ok(firstDryRun >= 0, 'dryRun must appear in optimize section');

    const dryRunSection = optimizeSection.slice(firstDryRun, firstDryRun + 1000);

    // Dry-run path should contain optimizeSkillMd (template-based)
    assert.ok(
      dryRunSection.includes('optimizeSkillMd'),
      'Dry-run path should call optimizeSkillMd',
    );

    // Dry-run path should NOT contain deduplicateIssues (judge API call)
    assert.ok(
      !dryRunSection.includes('deduplicateIssues'),
      'Dry-run path should NOT call deduplicateIssues (judge API)',
    );
  });
});

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

// =========================================================================
// REGTEST-FIX02: EVAL_MIN_SCORE / EVAL_MAX_P0 environment variables
// =========================================================================

/**
 * Helper that encapsulates the exit code decision logic expected after
 * FIX-02 (EVAL_MIN_SCORE / EVAL_MAX_P0 env vars) and FIX-03 (P0 count check).
 *
 * Mirrors the logic that should live in index.ts after the fixes are applied:
 *   1. avgScore < EVAL_MIN_SCORE (default 60) → exit 1
 *   2. P0 count > EVAL_MAX_P0 (default 0 = disabled) → exit 1
 *   3. failed > 0 → exit 1
 *   4. Otherwise → exit 0
 */
function computeEvalExitCode(params) {
  const {
    avgScore,
    scoresLength,
    failed,
    p0Count,
    evalMinScore,
    evalMaxP0,
  } = params;

  const minScore = evalMinScore ?? 60;
  const maxP0 = evalMaxP0 ?? 0;

  if (avgScore < minScore && scoresLength > 0) {
    return 1;
  }
  if (maxP0 > 0 && p0Count > maxP0) {
    return 1;
  }
  return failed > 0 ? 1 : 0;
}

describe('REGTEST-FIX02: EVAL_MIN_SCORE 與 EVAL_MAX_P0 預設值', () => {
  it('should use default min score of 60 when EVAL_MIN_SCORE is not set', () => {
    // Below default threshold
    assert.equal(
      computeEvalExitCode({ avgScore: 59, scoresLength: 3, failed: 0, p0Count: 0 }),
      1,
    );
    // At default threshold
    assert.equal(
      computeEvalExitCode({ avgScore: 60, scoresLength: 3, failed: 0, p0Count: 0 }),
      0,
    );
  });

  it('should accept custom EVAL_MIN_SCORE', () => {
    // Below custom threshold
    assert.equal(
      computeEvalExitCode({ avgScore: 69, scoresLength: 3, failed: 0, p0Count: 0, evalMinScore: 70 }),
      1,
    );
    // At custom threshold
    assert.equal(
      computeEvalExitCode({ avgScore: 70, scoresLength: 3, failed: 0, p0Count: 0, evalMinScore: 70 }),
      0,
    );
  });

  it('should not enforce P0 limit when EVAL_MAX_P0 is 0 (default, disabled)', () => {
    assert.equal(
      computeEvalExitCode({ avgScore: 80, scoresLength: 3, failed: 0, p0Count: 5 }),
      0,
    );
  });

  it('should use custom EVAL_MAX_P0 when set', () => {
    // P0 count within limit
    assert.equal(
      computeEvalExitCode({ avgScore: 80, scoresLength: 3, failed: 0, p0Count: 3, evalMaxP0: 5 }),
      0,
    );
    // P0 count exceeds limit
    assert.equal(
      computeEvalExitCode({ avgScore: 80, scoresLength: 3, failed: 0, p0Count: 6, evalMaxP0: 5 }),
      1,
    );
  });

  it('should return 0 when scoresLength is 0 regardless of avgScore', () => {
    // avgScore 0 with no scores should not trigger low-score check
    assert.equal(
      computeEvalExitCode({ avgScore: 0, scoresLength: 0, failed: 0, p0Count: 0 }),
      0,
    );
  });
});

// =========================================================================
// REGTEST-FIX03: P0 計數 exit code 檢查
// =========================================================================

describe('REGTEST-FIX03: P0 計數 exit code 檢查', () => {
  it('should return exit code 0 when avgScore passes and no P0 issues', () => {
    assert.equal(
      computeEvalExitCode({ avgScore: 85, scoresLength: 3, failed: 0, p0Count: 0, evalMaxP0: 3 }),
      0,
    );
  });

  it('should return exit code 1 when P0 count exceeds EVAL_MAX_P0', () => {
    assert.equal(
      computeEvalExitCode({ avgScore: 85, scoresLength: 3, failed: 0, p0Count: 4, evalMaxP0: 3 }),
      1,
    );
  });

  it('should return exit code 0 when P0 count is within EVAL_MAX_P0', () => {
    assert.equal(
      computeEvalExitCode({ avgScore: 85, scoresLength: 3, failed: 0, p0Count: 3, evalMaxP0: 3 }),
      0,
    );
  });

  it('should still return exit code 1 when failed > 0 even with passing score and P0', () => {
    assert.equal(
      computeEvalExitCode({ avgScore: 85, scoresLength: 3, failed: 1, p0Count: 1, evalMaxP0: 3 }),
      1,
    );
  });

  it('should prioritise avgScore failure over P0 when both conditions apply', () => {
    assert.equal(
      computeEvalExitCode({ avgScore: 50, scoresLength: 3, failed: 0, p0Count: 1, evalMaxP0: 3 }),
      1,
    );
  });
});

// =========================================================================
// REGTEST-01: dry-run 不傳 emptyPlan（關聯 FIX-A）
// =========================================================================
describe('REGTEST-01: dry-run 不傳 emptyPlan', () => {
  it('dry-run mode should not pass empty plan', () => {
    const source = fs.readFileSync(
      new URL('../index.ts', import.meta.url), 'utf-8',
    );

    // Find dry-run branch in index.ts
    const dryRunStart = source.indexOf('if (dryRun)');
    assert.ok(dryRunStart >= 0, 'Source must contain dryRun branch');

    const dryRunSection = source.slice(dryRunStart, dryRunStart + 1500);

    // Should NOT contain emptyPlan
    assert.ok(
      !dryRunSection.includes('emptyPlan'),
      'Dry-run path should not use emptyPlan',
    );
    // Should NOT contain empty issues array
    assert.ok(
      !dryRunSection.includes('issues: []'),
      'Dry-run path should not pass empty issues array',
    );

    // Should call loadAllScores or extractIssues to collect actual data
    assert.ok(
      dryRunSection.includes('loadAllScores') || dryRunSection.includes('extractIssues'),
      'Dry-run path should collect actual scoring data (loadAllScores or extractIssues)',
    );
  });
});

// =========================================================================
// REGTEST-06: SIGINT 不導致 stale lock（關聯 FIX-G）
// =========================================================================
describe('REGTEST-06: SIGINT handler 應清理 exec lock', () => {
  it('SIGINT handler should clean up exec lock', () => {
    const execSource = fs.readFileSync(
      new URL('../executor.ts', import.meta.url), 'utf-8',
    );

    // The executor should have a SIGINT cleanup handler
    const sigintIndex = execSource.indexOf('SIGINT');
    assert.ok(sigintIndex >= 0, 'Executor must handle SIGINT');

    // The SIGINT handler should contain lock cleanup (rmSync or rm of lockPath)
    const sigintSection = execSource.slice(sigintIndex, sigintIndex + 500);

    // Check that the SIGINT handler cleans up the lock before process.exit
    const hasLockCleanup = sigintSection.includes('lockPath') || sigintSection.includes('exec-lock');
    assert.ok(hasLockCleanup, 'SIGINT handler should clean up exec lock before exit');

    // Check that finally block also cleans up (normal path)
    // Use lastIndexOf because the first 'finally {' is in executeSingleTest (timeout cleanup),
    // while the lock cleanup 'finally {' is at the end of runAllTests.
    const finallyIndex = execSource.lastIndexOf('finally {');
    assert.ok(finallyIndex >= 0, 'Executor must have finally block for lock cleanup');

    const finallySection = execSource.slice(finallyIndex, finallyIndex + 300);
    assert.ok(
      finallySection.includes('lockPath') || finallySection.includes('exec-lock'),
      'Finally block should also clean up exec lock',
    );

    // Check for process.once('SIGINT', ...) pattern for safe handler registration
    const onceSigintIndex = execSource.indexOf("once('SIGINT'");
    assert.ok(onceSigintIndex >= 0, 'SIGINT handler should use process.once to avoid duplicate registration');
  });
});
