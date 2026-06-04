import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('enforce-video-aspect-ratio typed errors', () => {
  it('throws UserInputError instead of generic Error for missing required input', async () => {
    const mod = await import('../../../packages/tools/enforce-video-aspect-ratio/dist/index.js');
    const stderr = { data: '', write(c: string) { this.data += c; } };

    const code = await mod.tool.handler(
      [],
      { stdout: { write() {} }, stderr, env: {} },
    );

    assert.strictEqual(code, 1);
    // UserInputError writes message without "Error:" prefix
    assert.ok(!stderr.data.includes('Error:'));
    assert.ok(stderr.data.includes('--input-video is required'));
  });

  it('throws UserInputError instead of generic Error for non-existent input file', async () => {
    const mod = await import('../../../packages/tools/enforce-video-aspect-ratio/dist/index.js');
    const stderr = { data: '', write(c: string) { this.data += c; } };

    const code = await mod.tool.handler(
      ['--input', '/nonexistent/path/video.mp4'],
      { stdout: { write() {} }, stderr, env: {} },
    );

    assert.strictEqual(code, 1);
    assert.ok(!stderr.data.includes('Error:'));
    assert.ok(stderr.data.includes('Input video not found'));
  });
});
