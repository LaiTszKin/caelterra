import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateReport } from '../dist/reporter.js';

describe('REGTEST-15: 大量 scores 報告生成', () => {
  it('should generate report for 100 scores each with 10 issues under 1000ms', () => {
    const scores = [];
    for (let i = 0; i < 100; i++) {
      const issues = [];
      for (let j = 0; j < 10; j++) {
        issues.push({
          severity: j < 3 ? 'P0' : j < 6 ? 'P1' : 'P2',
          category: j < 4 ? 'skill' : j < 7 ? 'apltk' : 'other',
          description: `Issue ${j} for test Q${String(i + 1).padStart(3, '0')}: This is a test issue description with enough length`,
          evidence: `L${10 + j}: Trace evidence for issue ${j}`,
        });
      }
      const testId = `Q${String(i + 1).padStart(3, '0')}`;
      scores.push({
        testId,
        overallScore: 30 + (i % 70),
        dimensions: [
          { name: 'instruction_adherence', score: 30 + (i % 70), maxScore: 100, weight: 0.33, comments: 'comment' },
          { name: 'tool_calling', score: 30 + (i % 70), maxScore: 100, weight: 0.33, comments: 'comment' },
          { name: 'result_quality', score: 30 + (i % 70), maxScore: 100, weight: 0.34, comments: 'comment' },
        ],
        issues,
        summary: `Summary for test ${testId}`,
        scoredAt: new Date().toISOString(),
      });
    }

    const start = Date.now();
    const report = generateReport(scores, '2026-05-29', 'test-skill');
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 1000, `Report generation took ${elapsed}ms, expected < 1000ms`);
    assert.ok(report.length > 0, 'Report should not be empty');
    assert.ok(report.includes('Q001'), 'Report should include Q001');
    assert.ok(report.includes('Q100'), 'Report should include Q100');
    assert.ok(report.includes('P0'), 'Report should reference severity P0');
  });
});
