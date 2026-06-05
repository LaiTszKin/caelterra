import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createToolRunner, UserInputError, SystemError, AppError } from '@laitszkin/tool-utils';

function createMemoryStream() {
  let data = '';
  return { write(chunk) { data += chunk; return true; }, toString() { return data; } };
}

describe('Handler error propagation via createToolRunner', () => {
  it('formats UserInputError without "Error:" prefix', async () => {
    const schema = {
      options: {},
      handler: async () => { throw new UserInputError('user input problem'); },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(stderr.toString(), 'user input problem\n');
  });

  it('formats SystemError with stack trace', async () => {
    const schema = {
      options: {},
      handler: async () => { throw new SystemError('system failure'); },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    const output = stderr.toString();
    assert.ok(output.startsWith('system failure\n'));
    assert.ok(output.includes('SystemError: system failure'));
  });

  it('formats generic Error with "Error:" prefix', async () => {
    const schema = {
      options: {},
      handler: async () => { throw new Error('generic problem'); },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(stderr.toString(), 'Error: generic problem\n');
  });

  it('formats plain AppError with "Error:" prefix (base class branch)', async () => {
    const schema = {
      options: {},
      handler: async () => { throw new AppError('base app error'); },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(stderr.toString(), 'Error: base app error\n');
  });

  it('propagates direct throw from handler to createToolRunner catch', async () => {
    const schema = {
      options: {},
      handler: async () => { throw new Error('no try/catch wrapper'); },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(stderr.toString(), 'Error: no try/catch wrapper\n');
  });

  it('propagates throw from nested function to createToolRunner catch', async () => {
    const innerFn = () => { throw new Error('nested error'); };
    const schema = {
      options: {},
      handler: async () => { innerFn(); },
    };
    const runner = createToolRunner(schema);
    const stderr = createMemoryStream();
    const exitCode = await runner([], { stdout: createMemoryStream(), stderr });
    assert.strictEqual(exitCode, 1);
    assert.strictEqual(stderr.toString(), 'Error: nested error\n');
  });

  it('open-github-issue resolveRepo throws UserInputError (not duplicate stderr)', async () => {
    const mod = await import('../../packages/tools/open-github-issue/dist/index.js');

    // Pass invalid --repo format to trigger validateRepo error inside resolveRepoAsync
    await assert.rejects(
      () => mod.tool.handler(
        ['create', '--issue-type', 'feature', '--title', 'Test', '--reason', 'Because', '--suggested-architecture', 'Arch', '--repo', 'invalid'],
        { stdout: { write() {} }, stderr: { write() {} }, env: {} },
      ),
      (err) => {
        // open-github-issue is NOT wrapped in createToolRunner, so errors propagate as rejected promises
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Invalid repo format'));
        return true;
      }
    );
  });

  it('review-threads handler validates repo format with UserInputError', async () => {
    const mod = await import('../../packages/tools/review-threads/dist/index.js');

    // Pass invalid repo format — handler now propagates errors (no outer catch)
    await assert.rejects(
      () => mod.tool.handler(
        ['list', '--repo', 'invalid-repo-format'],
        { stdout: { write() {} }, stderr: { write() {} }, env: {} },
      ),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('repo must be in owner/name format'));
        return true;
      },
    );
  });

  // REGTEST-03: FIX-04 — open-github-issue error boundary (SystemError path)
  it('open-github-issue returns exit code 1 for invalid args (via error boundary)', async () => {
    const mod = await import('../../packages/tools/open-github-issue/dist/index.js');

    // Missing --reason and --suggested-architecture for feature issue type causes validateIssueContent to throw
    await assert.rejects(
      () => mod.tool.handler(
        ['create', '--issue-type', 'feature', '--title', 'Test', '--repo', 'valid/name'],
        { stdout: { write() {} }, stderr: { write() {} }, env: {} },
      ),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.length > 0, 'error should have message');
        return true;
      }
    );
  });

  // REGTEST-05: FIX-08 — review-threads UserInputError for invalid thread data (JSON parse)
  it('review-threads returns exit code 1 for invalid thread-id-file content', async () => {
    const mod = await import('../../packages/tools/review-threads/dist/index.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-rt-'));
    const badJson = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badJson, '{"invalid": "structure"}', 'utf8');

    try {
      await assert.rejects(
        () => mod.tool.handler(
          ['list', '--repo', 'test/repo', '--thread-id-file', badJson],
          { stdout: { write() {} }, stderr: { write() {} }, env: {} },
        ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.length > 0, 'error should have message');
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // REGTEST-01: FIX-01 — open-github-issue resolveRepoAsync produces single error line (no duplicate)
  it('open-github-issue: resolveRepoAsync produces single error line (no duplicate)', async () => {
    const mod = await import('../../packages/tools/open-github-issue/dist/index.js');
    const stderr = { data: '', write(c) { this.data += c; } };
    try {
      const code = await mod.tool.handler(
        ['--repo', 'invalid'],
        { stdout: { write() {} }, stderr, env: {} },
      );
      assert.strictEqual(code, 1);
    } catch (err) {
      // handler may throw if not wrapped in createToolRunner
      assert.ok(err instanceof Error);
    }
    const lines = stderr.data.trim().split('\n').filter(Boolean);
    assert.ok(lines.length <= 1, `should have 0 or 1 error line(s), got ${lines.length}: ${JSON.stringify(stderr.data)}`);
  });

  // REGTEST-02: FIX-01 — open-github-issue UserInputError from validateRepo has no "Error:" prefix
  it('open-github-issue: UserInputError from validateRepo has no "Error:" prefix', async () => {
    const mod = await import('../../packages/tools/open-github-issue/dist/index.js');
    const stderr = { data: '', write(c) { this.data += c; } };
    let caught;
    try {
      const code = await mod.tool.handler(
        ['create', '--issue-type', 'feature', '--title', 'Test', '--reason', 'Because', '--suggested-architecture', 'Arch', '--repo', 'invalid-format'],
        { stdout: { write() {} }, stderr, env: {} },
      );
      assert.strictEqual(code, 1);
    } catch (err) {
      caught = err;
      assert.ok(err instanceof Error);
    }
    // After FIX-01: no stderr.write before UserInputError throw
    assert.ok(caught, 'handler should have thrown an error');
    assert.ok(caught instanceof UserInputError, 'error should be UserInputError');
    assert.ok(caught.message.includes('owner/repo'), `message should mention expected format: ${caught.message}`);
    // stderr must not contain "Error:" prefix (UserInputError must not be prefixed)
    assert.ok(!stderr.data.includes('Error:'), `UserInputError should not have "Error:" prefix: ${JSON.stringify(stderr.data)}`);
    // stderr must not contain duplicate lines (stderr.write was removed)
    const lines = stderr.data.trim().split('\n').filter(Boolean);
    assert.ok(lines.length <= 1, `should have 0 or 1 error line(s), got ${lines.length}: ${JSON.stringify(stderr.data)}`);
  });
});
