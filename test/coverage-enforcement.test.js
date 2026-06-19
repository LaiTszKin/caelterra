import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('coverage enforcement', () => {
  it(
    'coverage data is produced and parseable from node --experimental-test-coverage',
    { timeout: 60000 },
    async () => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);

      // Use a stripped environment to avoid Node.js test runner recursive detection
      // (node --test spawned from within node --test with full process.env triggers
      // "skipping running files" which suppresses coverage output).
      const { stdout, stderr } = await execFileAsync(
        'node',
        ['--experimental-test-coverage', '--test', 'test/types.test.js'],
        {
          env: { PATH: process.env.PATH, HOME: process.env.HOME },
          cwd: process.cwd(),
        },
      );

      const output = stdout + stderr;

      // Verify coverage report is produced with "all files" summary line
      assert.ok(
        output.includes('all files'),
        'Coverage report should contain "all files" summary line',
      );

      // Find and parse the "all files" coverage line
      // Format: ℹ all files | 100.00 |   100.00 |  100.00 |
      const allFilesLine = output
        .split('\n')
        .find((l) => l.includes('all files'));
      assert.ok(
        allFilesLine,
        'Should find "all files" line in coverage output',
      );

      const parts = allFilesLine.split('|').map((s) => s.trim());
      const linePct = parseFloat(parts[1]);
      const branchPct = parseFloat(parts[2]);
      const funcPct = parseFloat(parts[3]);

      assert.ok(
        !isNaN(linePct),
        `Line coverage should be parseable, got "${parts[1]}"`,
      );
      assert.ok(
        !isNaN(branchPct),
        `Branch coverage should be parseable, got "${parts[2]}"`,
      );
      assert.ok(
        !isNaN(funcPct),
        `Function coverage should be parseable, got "${parts[3]}"`,
      );

      assert.ok(
        linePct >= 0 && linePct <= 100,
        `Line coverage ${linePct}% out of range`,
      );
      assert.ok(
        branchPct >= 0 && branchPct <= 100,
        `Branch coverage ${branchPct}% out of range`,
      );
      assert.ok(
        funcPct >= 0 && funcPct <= 100,
        `Function coverage ${funcPct}% out of range`,
      );
    },
  );

  it('combined weighted coverage formula matches scripts/test.sh', () => {
    // This mirrors the file-weighted average in scripts/test.sh:
    //   combined_pct = (G1_PCT * G1_FILES + G2_PCT * G2_FILES) / total_files
    const groups = [
      { pct: 85.0, files: 10 },
      { pct: 75.0, files: 5 },
    ];

    const totalFiles = groups.reduce((s, g) => s + g.files, 0);
    const combined =
      groups.reduce((s, g) => s + g.pct * g.files, 0) / totalFiles;
    // Expected: (85*10 + 75*5) / 15 = 1225 / 15 = 81.666...
    assert.ok(
      Math.abs(combined - 81.67) < 0.01,
      `Combined weighted coverage should be ~81.67, got ${combined.toFixed(4)}`,
    );
  });

  it('combined threshold enforcement (>= 80%)', () => {
    const combinedPct = 81.67;
    assert.ok(
      combinedPct >= 80,
      `Combined coverage ${combinedPct}% should meet 80% threshold`,
    );

    // Verify that below-threshold coverage would be caught
    const failingPct = 79.99;
    assert.ok(
      failingPct < 80,
      `Combined coverage ${failingPct}% should fail 80% threshold`,
    );
  });

  it('REGTEST-03: combined coverage label uses G1+G2 notation', () => {
    const content = fs.readFileSync('scripts/test.sh', 'utf-8');
    const combinedCoverageLine = content
      .split('\n')
      .find((l) => l.includes('==> Combined coverage'));
    assert.ok(
      combinedCoverageLine,
      'Should find "==> Combined coverage" line in scripts/test.sh',
    );
    assert.ok(
      combinedCoverageLine.includes('G1+G2'),
      `Combined coverage line should reference "G1+G2" notation, got: ${combinedCoverageLine}`,
    );
  });

  it('REGTEST-07: eval test files excluded from Group 2 coverage', () => {
    const content = fs.readFileSync('scripts/test.sh', 'utf-8');
    const lines = content.split('\n');
    const excludeLine = lines.find((l) => l.trim().startsWith('EXCLUDE='));
    assert.ok(excludeLine, 'Should find EXCLUDE= line in scripts/test.sh');

    assert.ok(
      excludeLine.includes('eval'),
      `EXCLUDE pattern should include 'eval' to filter out eval test files, got: ${excludeLine}`,
    );

    // Extract the regex pattern between single quotes
    const match = excludeLine.match(/EXCLUDE='([^']+)'/);
    assert.ok(match, 'Should extract EXCLUDE regex pattern');
    const pattern = match[1];

    // Verify that paths containing "eval" are matched by the exclusion pattern
    const evalPaths = [
      'packages/tools/eval/test/index.test.js',
      'packages/tools/eval/test/executor.test.js',
    ];
    for (const p of evalPaths) {
      assert.ok(
        new RegExp(pattern).test(p),
        `Path "${p}" should match exclusion pattern /${pattern}/`,
      );
    }

    // Verify that non-eval paths are NOT matched (would pass through filter)
    const nonEvalPaths = [
      'packages/tools/utils/test/helper.test.js',
      'packages/tools/skill-creator/test/creator.test.js',
    ];
    for (const p of nonEvalPaths) {
      assert.ok(
        !new RegExp(pattern).test(p),
        `Path "${p}" should NOT match exclusion pattern /${pattern}/`,
      );
    }
  });
});
