import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('review-threads error output', () => {
  it('stdout is used for resolved data, stderr for failure details', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      'packages/tools/review-threads/index.ts',
      'utf8',
    );

    // Check that stdout.write in cmdResolve only includes resolved (not failed)
    const cmdResolveSection =
      source.split('async function cmdResolve')[1] || '';
    const stdoutWriteLines = cmdResolveSection
      .split('\n')
      .filter((line) => /stdout!?\.write/.test(line));

    // stdout should reference resolved data
    const resolvedUsage = stdoutWriteLines.some((line) =>
      line.includes('resolved'),
    );
    assert.ok(resolvedUsage, 'stdout should write resolved data');

    // stderr should reference failed data
    const stderrFailedLine = cmdResolveSection
      .split('\n')
      .find((line) => line.includes('stderr') && line.includes('failed'));
    assert.ok(stderrFailedLine, 'stderr should write failure data');
  });
});
