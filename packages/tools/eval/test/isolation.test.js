import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createToolDispatcher } from '../dist/isolation.js';

// =========================================================================
// FIX-01: isolation.ts dispatch() 真實執行 Read 工具
// =========================================================================
describe('FIX-01: isolation.ts dispatch() 真實執行 Read 工具', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix01-'));

  // 在 workspace 內建立測試檔案
  const specPath = path.join(tmpDir, 'spec.md');
  fs.writeFileSync(specPath, '# Test Spec', 'utf-8');

  const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('應能真實讀取 workspace 內現有檔案', async () => {
    const result = await dispatcher.dispatch({
      tool: 'Read',
      params: { file_path: 'spec.md' },
    });

    assert.equal(result.success, true);
    assert.equal(result.tool, 'Read');
    assert.ok(result.data.includes('# Test Spec'), `Expected data to contain "# Test Spec", got "${result.data}"`);
  });

  it('讀取不存在的檔案應回傳失敗', async () => {
    const result = await dispatcher.dispatch({
      tool: 'Read',
      params: { file_path: 'missing.txt' },
    });

    assert.equal(result.success, false);
    assert.ok(
      result.data.includes('File not found: missing.txt'),
      `Expected error message about missing file, got "${result.data}"`,
    );
  });

  it('無 workspaceDir 時 Read 應回傳模擬結果', async () => {
    const simulatedDispatcher = createToolDispatcher();
    const result = await simulatedDispatcher.dispatch({
      tool: 'Read',
      params: { file_path: 'spec.md' },
    });

    assert.equal(result.success, true);
    assert.ok(
      result.data.includes('spec.md'),
      `Expected path in simulated response, got "${result.data}"`,
    );
    // 模擬結果不應包含 "[simulated]" 標記（對被測模型透明）
    assert.ok(
      !result.data.includes('[simulated]'),
      `Simulated result should not leak simulation status, got "${result.data}"`,
    );
  });

  it('REGTEST-A: should not leak simulation status in mock responses', async () => {
    const { createToolDispatcher } = await import('../dist/isolation.js');
    const dispatcher = createToolDispatcher();

    // SIMULATED_TOOLS (WebSearch, LSP, WebFetch)
    const webResult = await dispatcher.dispatch({
      tool: 'WebSearch',
      params: { query: 'test query' },
    });
    assert.ok(
      !webResult.data.includes('[simulated]'),
      `WebSearch data should not contain "[simulated]": ${webResult.data}`,
    );
    assert.ok(
      typeof webResult.data === 'string' && webResult.data.length > 0,
      'WebSearch should return meaningful data',
    );

    // WORKSPACE_TOOLS without workspaceDir (falls back to simulated)
    const readResult = await dispatcher.dispatch({
      tool: 'Read',
      params: { path: 'test.md' },
    });
    assert.ok(
      !readResult.data.includes('[simulated]'),
      `Read (no workspace) data should not contain "[simulated]": ${readResult.data}`,
    );

    // WRITE_TOOLS — should have clean response format
    const writeResult = await dispatcher.dispatch({
      tool: 'Write',
      params: { path: 'test.md', content: 'hello' },
    });
    assert.ok(
      !writeResult.data.includes('[simulated]'),
      'Write data should not contain "[simulated]"',
    );

    // Verify ALL dispatches return success
    assert.ok(webResult.success);
    assert.ok(readResult.success);
    assert.ok(writeResult.success);
  });
});

// =========================================================================
// FIX-A: Bash 讀寫分離 — 安全唯讀命令應在 workspace 真實執行
// =========================================================================
describe('FIX-A: Bash 讀寫分離', () => {
  it('REGTEST-01: should execute safe Bash commands in workspace, not simulate', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest01-'));
    const testFile = path.join(tmpDir, 'hello.txt');
    fs.writeFileSync(testFile, 'world', 'utf-8');

    const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });

    // "ls" is a safe read-only command — should execute for real
    const lsResult = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'ls' },
    });
    assert.ok(lsResult.success);
    assert.ok(lsResult.data.includes('hello.txt'),
      `ls output should include hello.txt, got: "${lsResult.data}"`);

    // "cat" should also execute for real
    const catResult = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'cat hello.txt' },
    });
    assert.ok(catResult.success);
    assert.ok(catResult.data.includes('world'),
      `cat output should include "world", got: "${catResult.data}"`);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =========================================================================
// Round 6: FIX-B 與 FIX-C — Bash 安全防護（find -exec 攔截、路徑穿越防護）
// =========================================================================
describe('Round 6: FIX-B & FIX-C — Bash 安全防護', () => {
  it('REGTEST-02: should block find -exec dangerous flags', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest02-'));
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'hello', 'utf-8');

    const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });

    // find with -exec should be intercepted
    const result = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'find . -name "*.txt" -exec cat {} \\;' },
    });
    assert.ok(result.success);
    // Should NOT contain actual file content (intercepted)
    assert.ok(
      !result.data.includes('hello'),
      `find -exec result should be intercepted, got: "${result.data}"`
    );

    // Regular find (without dangerous flags) should work
    const safeResult = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'find . -name "*.txt"' },
    });
    assert.ok(safeResult.success);
    assert.ok(safeResult.data.includes('test.txt'),
      `Safe find should list files, got: "${safeResult.data}"`);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('REGTEST-03: should block absolute paths outside workspace', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regtest03-'));
    const dispatcher = createToolDispatcher({ workspaceDir: tmpDir });

    // cat /etc/passwd should be blocked (absolute path)
    const result1 = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'cat /etc/passwd' },
    });
    assert.ok(result1.success);
    assert.ok(
      !result1.data.includes('root:'),
      `Absolute path cat should be blocked, got: "${result1.data}"`
    );

    // cat ../../etc/passwd should also be blocked (parent traversal)
    const result2 = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'cat ../../etc/passwd' },
    });
    assert.ok(result2.success);
    assert.ok(
      !result2.data.includes('root:'),
      `Parent traversal should be blocked, got: "${result2.data}"`
    );

    // cat ./local-file (relative path within workspace) should work
    const localFile = path.join(tmpDir, 'local.txt');
    fs.writeFileSync(localFile, 'workspace content', 'utf-8');
    const result3 = await dispatcher.dispatch({
      tool: 'Bash',
      params: { command: 'cat local.txt' },
    });
    assert.ok(result3.success);
    assert.ok(result3.data.includes('workspace content'),
      `Relative path within workspace should work, got: "${result3.data}"`);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// =========================================================================
// Round 6: FIX-D 與 FIX-E — 透明度與 async I/O
// =========================================================================
describe('Round 6: FIX-D & FIX-E — 透明度與 async I/O', () => {
  it('REGTEST-04: unsafe Bash commands should not leak [Simulated] marker', () => {
    const source = fs.readFileSync(
      new URL('../isolation.ts', import.meta.url), 'utf-8'
    );

    // Verify no [Simulated] string in the source
    const simulatedMatches = source.match(/\[Simulated\]/g);
    assert.ok(
      !simulatedMatches || simulatedMatches.length === 0,
      'Source should not contain [Simulated] marker (violates R4.1 transparency)'
    );
  });

  it('REGTEST-05: executeGrep/executeGlob should not use sync I/O', () => {
    const source = fs.readFileSync(
      new URL('../isolation.ts', import.meta.url), 'utf-8'
    );

    // Find executeGrep function body
    const grepStart = source.indexOf('function executeGrep');
    const grepEnd = grepStart + 5000;
    const grepBody = source.slice(grepStart, grepEnd);

    assert.ok(
      !grepBody.includes('readdirSync'),
      'executeGrep should not use readdirSync (use async readdir)'
    );
    assert.ok(
      !grepBody.includes('readFileSync'),
      'executeGrep should not use readFileSync (use async readFile)'
    );

    // Find executeGlob function body
    const globStart = source.indexOf('function executeGlob');
    const globEnd = globStart + 5000;
    const globBody = source.slice(globStart, globEnd);

    assert.ok(
      !globBody.includes('readdirSync'),
      'executeGlob should not use readdirSync (use async readdir)'
    );
  });
});
