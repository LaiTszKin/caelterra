import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('installer EOL usage', () => {
  it('installer source uses adapter.EOL for manifest writes', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('packages/cli/installer.ts', 'utf8');

    // Check that adapter.EOL is used for manifest writes
    // The manifest write should use adapter.EOL or platformAdapter.EOL
    const manifestLines = source
      .split('\n')
      .filter(line => line.includes('MANIFEST_FILENAME') && line.includes('writeFile'));

    for (const line of manifestLines) {
      assert.ok(
        line.includes('adapter.EOL') || line.includes('platformAdapter.EOL') || line.includes('adapter.EOL'),
        `Manifest write should use adapter.EOL, got: ${line.trim()}`
      );
    }
  });
});
