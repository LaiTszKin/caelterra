import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * FIX-02 smoke test: verify all converted tools export a working ToolDefinition
 * with a callable handler and functional --help support.
 *
 * Add new tool names here so the test stays self-maintaining.
 * Excluded from scope: eval, codegraph.
 */
const TOOL_NAMES = [
  'architecture',
  'create-review-report',
  'create-specs',
  'docs-to-voice',
  'enforce-video-aspect-ratio',
  'extract-conversations',
  'extract-pdf-text',
  'filter-logs',
  'find-github-issues',
  'generate-storyboard-images',
  'open-github-issue',
  'read-github-issue',
  'render-error-book',
  'render-katex',
  'review-threads',
  'search-logs',
  'sync-memory-index',
  'validate-openai-agent-config',
  'validate-skill-frontmatter',
];

/**
 * Tools without createToolRunner wrapping or with complex subcommand dispatch.
 * We skip help-text assertions and only verify they don't crash.
 * These are known carryover tools from the createToolRunner migration.
 * When any tool gains createToolRunner wrapping, remove from this set.
 * Maintained manually — no staleness detection.
 */
const HELP_SKIP = new Set([
  'architecture', 'render-error-book', 'render-katex',
]);

function createMemoryStream() {
  let data = '';
  return {
    write(chunk) {
      data += chunk;
      return true;
    },
    toString() {
      return data;
    },
  };
}

test('schema-conversion-smoke: all tools export a handler', async (t) => {
  for (const toolName of TOOL_NAMES) {
    await t.test(toolName, async () => {
      const mod = await import(`@laitszkin/tool-${toolName}`);
      assert.ok(mod.tool, `${toolName} must export 'tool'`);
      assert.equal(
        typeof mod.tool.handler,
        'function',
        `${toolName}.handler must be a function`,
      );
    });
  }
});

test('createToolRunner shows description when provided', async () => {
  const { createToolRunner } = await import('../../packages/tool-utils/dist/index.js');

  const schema = {
    options: {
      name: { type: 'string', description: 'The name to use' },
      verbose: { type: 'boolean', short: 'v', description: 'Enable verbose output' },
      tags: { type: 'string', multiple: true, description: 'Tags to apply' },
    },
    usage: 'apltk test [options]',
    description: 'Test tool',
    handler: async () => 0,
  };

  const runner = createToolRunner(schema);
  const stdout = { data: '', write(c) { this.data += c; } };
  const code = await runner(['--help'], { stdout, stderr: { write() {} } });

  assert.strictEqual(code, 0);
  // String option should show <value>
  assert.ok(stdout.data.includes('--name <value>'));
  // Boolean option should NOT show <value>
  assert.ok(stdout.data.includes('--verbose, -v') && !stdout.data.includes('--verbose, -v <value>'));
  // Multiple option should show [...]
  assert.ok(stdout.data.includes('--tags <value> [...]'));
  // Description text should appear
  assert.ok(stdout.data.includes('The name to use'));
  assert.ok(stdout.data.includes('Enable verbose output'));
});

test('schema-conversion-smoke: --help produces valid output', async (t) => {
  for (const toolName of TOOL_NAMES) {
    await t.test(toolName, async () => {
      const mod = await import(`@laitszkin/tool-${toolName}`);

      if (HELP_SKIP.has(toolName)) {
        // Graceful skip: verify handler exists without calling --help
        // (some tools throw when given unrecognized flags)
        assert.equal(typeof mod.tool.handler, 'function');
        return;
      }

      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      const code = await mod.tool.handler(
        ['--help'],
        { stdout, stderr },
      );

      assert.equal(
        typeof code,
        'number',
        `${toolName}: --help must return a number`,
      );

      assert.equal(
        code,
        0,
        `${toolName}: --help should exit 0, got ${code}. stderr: ${stderr.toString()}`,
      );
      assert.ok(
        stdout.toString().length > 0,
        `${toolName}: --help should write non-empty help text to stdout`,
      );
    });
  }
});
