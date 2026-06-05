import { describe, it, before, after, mock } from 'node:test';
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
describe('REGTEST-15: Wrong spec path error', () => {
    it('should exit code 1 with diagnostic when SPEC.md not found', async () => {
        mock.method(fs, 'existsSync', () => false);
        try {
            const io = makeIo();
            const handler = tool.handler;
            if (!handler)
                throw new Error('tool.handler is undefined');
            try {
                const exitCode = await handler(['template', '--spec', '/nonexistent/spec-dir', '--output', '/tmp/rg15-out'], makeContext(io));
                // If handler returns (no throw), verify exit code
                assert.equal(exitCode, 1, 'Expected exit code 1 for missing spec path');
                assert.ok(io.stderrText.includes('not found'), `stderr should contain "not found": got ${JSON.stringify(io.stderrText)}`);
            }
            catch (err) {
                // Architecture throws UserInputError — this is also acceptable
                assert.ok(err instanceof Error, 'Expected an Error to be thrown');
                assert.ok(err.message.includes('not found'), `Error message should say "not found": ${err.message}`);
            }
        }
        finally {
            mock.restoreAll();
        }
    });
});
// =========================================================================
// REGTEST-16: Submodule remove cascade (Integration test)
// =========================================================================
describe('REGTEST-16: Submodule remove cascade', () => {
    let tmpDir;
    let yamlPath;
    let savedStates;
    const io = makeIo();
    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg16-'));
        savedStates = [];
        globalThis.__rg_onSave = (_dir, state) => {
            savedStates.push(state);
        };
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
        // Write YAML batch: remove sub-a1
        yamlPath = path.join(tmpDir, 'batch.yaml');
        fs.writeFileSync(yamlPath, [
            'features:',
            '  - slug: feature-a',
            '    action: modify',
            '    submodules:',
            '      - slug: sub-a1',
            '        action: remove',
            'edges: []',
            '',
        ].join('\n'), 'utf-8');
    });
    after(() => {
        delete globalThis.__rg_onSave;
        if (tmpDir)
            fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('should not have edges referencing the removed submodule after apply', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        const exitCode = await handler(['apply', yamlPath, '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
        assert.equal(exitCode, 0, `Expected exit code 0, got ${exitCode}. stderr: ${JSON.stringify(io.stderrText)}`);
        assert.equal(savedStates.length, 1, 'stateLib.save should have been called exactly once');
        const saved = savedStates[0];
        // — Check that no edge in merged.edges references the removed sub-a1 —
        for (const edge of saved.edges) {
            const fromSub = typeof edge.from === 'object' && edge.from ? edge.from.submodule : null;
            const toSub = typeof edge.to === 'object' && edge.to ? edge.to.submodule : null;
            assert.notEqual(fromSub, 'sub-a1', `Edge ${edge.id} from-submodule should not be "sub-a1"`);
            assert.notEqual(toSub, 'sub-a1', `Edge ${edge.id} to-submodule should not be "sub-a1"`);
        }
        // — Verify e2 (sub-a2 → sub-b1) survives —
        const e2 = saved.edges.find((e) => e.id === 'e2');
        assert.ok(e2, 'Edge e2 (feature-a/sub-a2 → feature-b/sub-b1) should remain');
        // — Verify e1 (sub-a1 → sub-b1) is gone —
        const e1 = saved.edges.find((e) => e.id === 'e1');
        assert.ok(!e1, 'Edge e1 (feature-a/sub-a1 → feature-b/sub-b1) should be removed');
    });
});
// =========================================================================
// REGTEST-17: Edge referential integrity (Unit test)
// =========================================================================
describe('REGTEST-17: Edge referential integrity', () => {
    let tmpDir;
    let yamlPath;
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
        // Write YAML batch: add edge from non-existent-feature/sub → feature-a/sub-a1
        yamlPath = path.join(tmpDir, 'batch.yaml');
        fs.writeFileSync(yamlPath, [
            'edges:',
            '  - from: non-existent-feature/sub',
            '    to: feature-a/sub-a1',
            '    action: add',
            '    kind: call',
            '',
        ].join('\n'), 'utf-8');
    });
    after(() => {
        if (tmpDir)
            fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it('should reject edge add with error referencing the missing feature slug', async () => {
        const handler = tool.handler;
        if (!handler)
            throw new Error('tool.handler is undefined');
        try {
            const exitCode = await handler(['apply', yamlPath, '--no-render'], makeContext(io, { sourceRoot: tmpDir }));
            assert.equal(exitCode, 1, 'Expected exit code 1 for edge targeting missing feature');
            assert.ok(io.stderrText.includes('non-existent-feature'), `stderr should contain "non-existent-feature": got ${JSON.stringify(io.stderrText)}`);
            assert.ok(io.stderrText.length > 0, `stderr should have error text: got ${JSON.stringify(io.stderrText)}`);
        }
        catch (err) {
            assert.ok(err instanceof Error, 'Expected an Error to be thrown');
            assert.ok(err.message.includes('non-existent-feature'), `Error should mention "non-existent-feature": ${err.message}`);
        }
    });
});
