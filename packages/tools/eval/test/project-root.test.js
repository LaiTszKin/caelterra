import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { getProjectRoot } from '../dist/lib/project-root.js';

describe('REGTEST-03: getProjectRoot 路徑解析', () => {
  it('should return the project root with assets/spec/ present', () => {
    const root = getProjectRoot();

    assert.ok(root, 'getProjectRoot() should return a truthy string');
    assert.ok(
      path.isAbsolute(root),
      'getProjectRoot() should return an absolute path',
    );
    assert.ok(fs.existsSync(root), 'Returned path should exist on disk');

    const specDir = path.join(root, 'assets', 'spec');
    assert.ok(
      fs.existsSync(specDir),
      `assets/spec/ directory should exist at returned root: ${root}`,
    );
  });

  it('should not throw and return a consistent value', () => {
    const root1 = getProjectRoot();
    const root2 = getProjectRoot();

    assert.equal(
      root1,
      root2,
      'getProjectRoot() should return the same value on repeated calls',
    );
    assert.ok(root1.length > 0, 'Returned path should not be empty');
  });
});
