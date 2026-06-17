import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('carryover tools --help', () => {
  const HELPER_TOOLS = [
    { name: 'find-github-issues', args: ['--help'] },
    { name: 'open-github-issue', args: ['--help'] },
    { name: 'review-threads', args: ['--help'] },
  ];

  for (const { name, args } of HELPER_TOOLS) {
    it(`${name} --help produces help text and exits 0`, async () => {
      const { run } = await import('../../packages/cli/dist/index.js');
      const stdout = [];
      const stderr = [];
      const exitCode = await run([name, ...args], {
        sourceRoot: process.cwd(),
        stdout: {
          write(s) {
            stdout.push(s);
          },
        },
        stderr: {
          write(s) {
            stderr.push(s);
          },
        },
      });
      assert.strictEqual(exitCode, 0, `${name} --help should exit 0`);
      const output = stdout.join('');
      assert.ok(output.length > 0, `${name} --help should produce stdout`);
      assert.ok(
        output.includes('Usage') ||
          output.includes('usage') ||
          output.includes('Options'),
        `${name} --help should include usage or options text`,
      );
    });
  }
});
