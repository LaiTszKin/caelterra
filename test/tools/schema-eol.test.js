import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('schema.ts EOL usage', () => {
  it('buildHelpText uses platform EOL', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('packages/tool-utils/schema.ts', 'utf8');

    // Check that lines.join uses EOL, not hardcoded \n
    const joinLine = source
      .split('\n')
      .find((line) => line.includes('lines.join'));
    assert.ok(joinLine, 'Should find lines.join in schema.ts');
    assert.ok(
      joinLine.includes('EOL'),
      `lines.join should use EOL, got: ${joinLine.trim()}`,
    );
  });
});
