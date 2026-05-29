import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  isAllowedFile,
  validateMarkdownStructure,
  deduplicateIssues,
  optimizeSkillMd,
} from '../dist/optimizer.js';

const mockEnv = {
  EXEC_BASE_URL: 'http://localhost:9999',
  EXEC_MODEL: 'exec',
  EXEC_API_KEY: 'k',
  JUDGE_BASE_URL: 'http://localhost:9999',
  JUDGE_MODEL: 'judge',
  JUDGE_API_KEY: 'k',
  EXEC_REASONING_EFFORT: '',
  JUDGE_REASONING_EFFORT: '',
  EXEC_CONCURRENCY: 1,
  JUDGE_CONCURRENCY: 5,
  EXEC_TIMEOUT: 10,
  JUDGE_TIMEOUT: 10,
};

// =========================================================================
// REGTEST-09
// =========================================================================
describe('REGTEST-09: ALLOWED_FILES 白名單', () => {
  it('should allow skills/<name>/SKILL.md', () => {
    assert.equal(isAllowedFile('skills/spec/SKILL.md', 'spec'), true);
  });

  it('should reject paths without skills/ prefix', () => {
    assert.equal(isAllowedFile('/etc/passwd', 'spec'), false);
  });

  it('should allow skills/<name>/scripts/ sub-paths', () => {
    assert.equal(isAllowedFile('skills/spec/scripts/helper.sh', 'spec'), true);
  });

  it('should reject skills/other/ paths when skillName mismatch', () => {
    assert.equal(isAllowedFile('skills/other/random.txt', 'spec'), false);
  });
});

// =========================================================================
// REGTEST-10
// =========================================================================
describe('REGTEST-10: Markdown 結構驗證', () => {
  it('should reject content with only h1 heading', () => {
    const result = validateMarkdownStructure('# No heading\n\ncontent');
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
    assert.ok(
      result.issues.some((i) => i.includes('level-2 heading') || i.includes('##')),
      JSON.stringify(result.issues),
    );
  });

  it('should accept content with h2 heading', () => {
    const result = validateMarkdownStructure('## Title\n\ncontent');
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it('should reject empty content', () => {
    const result = validateMarkdownStructure('');
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.some((i) => i.toLowerCase().includes('empty')), JSON.stringify(result.issues));
  });

  it('should reject whitespace-only content', () => {
    const result = validateMarkdownStructure('   \n  \n  ');
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.toLowerCase().includes('empty')), JSON.stringify(result.issues));
  });

  it('should detect unclosed fenced code blocks', () => {
    const result = validateMarkdownStructure('## Section\n```\ncode block without closing');
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.toLowerCase().includes('unclosed')), JSON.stringify(result.issues));
  });
});

// =========================================================================
// REGTEST-05
// =========================================================================
describe('REGTEST-05: O(n²) 優化', () => {
  it('should deduplicate 30 issues across 3 severities into fewer items', async () => {
    const severities = ['P0', 'P1', 'P2'];
    const issues = [];
    for (let i = 0; i < 30; i++) {
      issues.push({
        severity: severities[i % 3],
        category: 'skill',
        description: 'Agent fails to follow the spec writing workflow instructions step by step',
        evidence: `L${i + 10}: trace shows skipped validation phase`,
        testNo: `Q${String(i + 1).padStart(3, '0')}`,
      });
    }

    // judgeAvailable=true triggers the judge refinement path;
    // the API call fails (no network) and it falls back to keyword dedup.
    const deduped = await deduplicateIssues(issues, mockEnv, true);

    assert.ok(Array.isArray(deduped), 'Result should be an array');
    assert.ok(deduped.length < 30, `Expected deduped count < 30, got ${deduped.length}`);
    assert.ok(deduped.length > 0, 'Should have at least one deduped issue');

    for (const d of deduped) {
      assert.ok(d.category.length > 0, 'Category should not be empty');
      assert.ok(d.severity.length > 0, 'Severity should not be empty');
      assert.ok(d.frequency > 0, 'Frequency should be > 0');
      assert.ok(Array.isArray(d.affectedTests), 'affectedTests should be an array');
    }
  });
});

// =========================================================================
// REGTEST-12
// =========================================================================
describe('REGTEST-12: 衝突保留', () => {
  const skillName = `regtest-12-${Date.now()}`;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `rg12-${Date.now()}-`));
  const skillDir = path.join(tmpRoot, 'skills', skillName);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  let origFetch;

  before(() => {
    // Create a valid SKILL.md (valid frontmatter + ## heading)
    fs.mkdirSync(skillDir, { recursive: true });
    const md = [
      '---',
      `name: ${skillName}`,
      'description: Test skill for REGTEST-12',
      '---',
      '',
      '## Test Section',
      '',
      'This is some content that exists.',
      '',
    ].join('\n');
    fs.writeFileSync(skillMdPath, md, 'utf-8');

    origFetch = globalThis.fetch;

    // Mock judge model output: FIND/REPLACE with a non-existent find string
    const judgeOutput =
      'FIND:\n```markdown\nnonexistent content that does not appear in the file\n```\n\nREPLACE WITH:\n```markdown\nreplacement text\n```';

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        model: 'judge',
        usage: { total_tokens: 10 },
        choices: [{ finish_reason: 'stop', message: { content: judgeOutput } }],
      }),
      text: async () => judgeOutput,
    });
  });

  after(() => {
    globalThis.fetch = origFetch;
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should report conflicts when FIND pattern does not match SKILL.md', async (t) => {
    const plan = {
      date: '2026-05-29',
      generatedAt: new Date().toISOString(),
      summary: { totalScores: 1, totalIssues: 1, dedupedIssues: 1 },
      issues: [
        {
          id: 'OPT-001',
          category: 'skill',
          severity: 'P0',
          frequency: 1,
          affectedTests: ['Q001'],
          description: 'Test issue for conflict detection',
          evidence: ['L42: evidence text'],
          suggestedFix: 'Improve the skill definition',
        },
      ],
    };

    // Capture console.warn calls
    const warnMock = t.mock.method(console, 'warn');

    const result = await optimizeSkillMd(plan, skillMdPath, mockEnv, false, '2026-05-29', true);

    // Verify a conflict-related warning was emitted
    const hasConflictWarn = warnMock.mock.calls.some((call) => {
      const msg = String(call.arguments[0] ?? '');
      return msg.includes('unmatched FIND pattern') || msg.includes('FIND pattern');
    });

    assert.ok(
      hasConflictWarn,
      'Expected console.warn to include conflict warning about unmatched FIND pattern',
    );

    assert.ok('success' in result, 'Result should have success field');
    assert.ok('message' in result, 'Result should have message field');
  });
});
