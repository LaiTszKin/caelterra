import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { tool } from './index.js';
function makeIo() {
    let stdoutBuf = '';
    let stderrBuf = '';
    return {
        stdout: { write: (s) => { stdoutBuf += s; } },
        stderr: { write: (s) => { stderrBuf += s; } },
        get stdoutText() { return stdoutBuf; },
        get stderrText() { return stderrBuf; },
    };
}
function makeContext(io, extra) {
    return {
        stdout: io.stdout,
        stderr: io.stderr,
        ...extra,
    };
}
/**
 * Write mock atlas CLI + state modules under `sourceRoot/skills/init-project-html/lib/atlas/`.
 * Also writes a package.json with `"type": "module"` so Node treats .js files as ESM.
 *
 * The state module's `load()` returns `stateReturn`.  If `onSave` is provided it is
 * called back whenever the real code calls `stateLib.save(dir, state)`.
 */
function writeMockAtlasModules(tmpDir, stateReturn, onSave) {
    const atlasDir = path.join(tmpDir, 'skills', 'init-project-html', 'lib', 'atlas');
    fs.mkdirSync(atlasDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'resources', 'project-architecture'), {
        recursive: true,
    });
    // cli.js
    const cliProjectRoot = tmpDir;
    const cliAtlasDir = path.join(tmpDir, 'resources', 'project-architecture');
    fs.writeFileSync(path.join(atlasDir, 'cli.js'), [
        `const projectRoot = ${JSON.stringify(cliProjectRoot)};`,
        `const atlasDir = ${JSON.stringify(cliAtlasDir)};`,
        'export default {',
        '  resolveProjectRoot: () => projectRoot,',
        '  baseAtlasDir: () => atlasDir,',
        '  specOverlayDir: () => ({ overlayDir: \'\', rootDir: \'\', htmlOutDir: \'\' }),',
        '  dispatch: async (args, io) => {',
        '    const verb = args[0];',
        '    if (verb === \'apply\' || verb === \'template\') {',
        '      if (io && io.stderr) io.stderr.write(\'Error: "\' + verb + \'" has been removed. Use "apltk architecture add <feature|module|relation>" instead.\\n\');',
        '      return 1;',
        '    }',
        '    return 0;',
        '  },',
        '  runRender: async () => {},',
        '};',
        '',
    ].join('\n'), 'utf-8');
    // state.js — delegates to (globalThis as any).__rg_onSave if set
    const json = JSON.stringify(stateReturn);
    fs.writeFileSync(path.join(atlasDir, 'state.js'), [
        `const initialState = ${json};`,
        'const g = /** @type {any} */ (globalThis);',
        'const onSave = typeof g.__rg_onSave === "function"',
        '  ? g.__rg_onSave',
        '  : () => {};',
        'export default {',
        '  load: () => JSON.parse(JSON.stringify(initialState)),',
        '  loadOverlay: () => ({ features: [], edges: [] }),',
        '  mergeOverlay: (base, overlay) => ({',
        '    features: [...base.features, ...overlay.features],',
        '    edges: [...base.edges, ...overlay.edges],',
        '  }),',
        '  save: (dir, state) => { onSave(dir, state); },',
        '  saveOverlay: () => {},',
        '  writeUndoSnapshot: () => {},',
        '  appendHistory: () => {},',
        '  deriveOverlay: (base, merged) => merged,',
        '};',
        '',
    ].join('\n'), 'utf-8');
    // package.json to force ESM interpretation of .js
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
}
// =========================================================================
// REGTEST-15: Wrong spec path error (Unit test)
// =========================================================================
describe('REGTEST-15: Unknown verb via CLI dispatch', () => {
    it('should exit code 1 when unknown verb dispatched through real CLI', async () => {
        const io = makeIo();
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['template', '--spec', '/nonexistent/spec-dir', '--output', '/tmp/rg15-out'], makeContext(io));
        assert.equal(exitCode, 1, 'Expected exit code 1 for unknown verb "template"');
        assert.ok(io.stderrText.includes('add'), `stderr should suggest using "add": got ${JSON.stringify(io.stderrText)}`);
        assert.ok(io.stderrText.includes('template'), `stderr should mention the verb "template": got ${JSON.stringify(io.stderrText)}`);
    });
});
// =========================================================================
// REGTEST-16: New verb dispatch and apply verb removal
// =========================================================================
describe('REGTEST-16: Verb dispatch — apply returns 1, add/remove return 0', () => {
    let tmpDir;
    const io = makeIo();
    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg16-'));
        writeMockAtlasModules(tmpDir, {
            features: [
                {
                    slug: 'feature-a',
                    title: 'Feature A',
                    submodules: [
                        { slug: 'sub-a1', kind: 'service' },
                        { slug: 'sub-a2', kind: 'service' },
                    ],
                    edges: [],
                },
                {
                    slug: 'feature-b',
                    title: 'Feature B',
                    submodules: [{ slug: 'sub-b1', kind: 'service' }],
                    edges: [],
                },
            ],
            edges: [
                {
                    id: 'e1',
                    from: { feature: 'feature-a', submodule: 'sub-a1' },
                    to: { feature: 'feature-b', submodule: 'sub-b1' },
                    kind: 'call',
                },
                {
                    id: 'e2',
                    from: { feature: 'feature-a', submodule: 'sub-a2' },
                    to: { feature: 'feature-b', submodule: 'sub-b1' },
                    kind: 'call',
                },
            ],
        });
    });
    after(() => {
        if (tmpDir)
            fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('apply verb returns 1 (removed from CLI dispatch)', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['apply', '/nonexistent/batch.yaml', '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
        assert.equal(exitCode, 1, 'Expected exit code 1 for removed "apply" verb');
        assert.ok(io.stderrText.includes('add'), `stderr should suggest using "add": got ${JSON.stringify(io.stderrText)}`);
    });
    it('add feature returns 0 through CLI dispatch', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['add', 'feature', 'test-feat', '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
        assert.equal(exitCode, 0, 'Expected exit code 0 for "add feature" verb');
    });
    it('remove feature returns 0 through CLI dispatch', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['remove', 'feature', 'test-feat', '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
        assert.equal(exitCode, 0, 'Expected exit code 0 for "remove feature" verb');
    });
});
// =========================================================================
// REGTEST-17: Verb dispatch — apply gone, add verb works
// =========================================================================
describe('REGTEST-17: Verb dispatch — apply returns 1, add verb returns 0', () => {
    let tmpDir;
    const io = makeIo();
    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg17-'));
        // state has feature-a/sub-a1 but NOT non-existent-feature
        writeMockAtlasModules(tmpDir, {
            features: [
                {
                    slug: 'feature-a',
                    title: 'Feature A',
                    submodules: [{ slug: 'sub-a1', kind: 'service' }],
                    edges: [],
                },
            ],
            edges: [],
        });
    });
    after(() => {
        if (tmpDir)
            fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('apply returns 1 (verb removed from CLI dispatch)', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['apply', '/nonexistent/batch.yaml', '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
        assert.equal(exitCode, 1, 'Expected exit code 1 for removed "apply" verb');
        assert.ok(io.stderrText.includes('add'), `stderr should suggest using "add": got ${JSON.stringify(io.stderrText)}`);
    });
    it('add feature returns 0 through CLI dispatch', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['add', 'feature', 'new-feat', '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
        assert.equal(exitCode, 0, 'Expected exit code 0 for "add feature" verb');
    });
});
