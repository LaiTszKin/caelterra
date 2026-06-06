import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerTool, runTool } from '@laitszkin/tool-registry';

describe('registry error handling', () => {
  it('runTool throws SystemError for unconfigured tool', async () => {
    // Register a tool without a handler
    registerTool({
      name: 'test-unconfigured-tool',
      category: 'test',
      description: 'Test tool with no handler',
    });

    await assert.rejects(
      async () => {
        await runTool('test-unconfigured-tool', [], {
          stdout: { write() {} },
          stderr: { write() {} },
        });
      },
      /not fully configured/,
    );
  });
});
