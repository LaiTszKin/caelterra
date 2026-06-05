import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the repo root by reading the worktree's .git file.
 * The .git file contains: "gitdir: <absolute-path-to-gitdir>"
 * The repo root is the parent of the .git directory.
 */
function findRepoRoot() {
  const gitFile = path.join(__dirname, '..', '..', '.git');

  if (fs.existsSync(gitFile)) {
    const stat = fs.statSync(gitFile);
    if (stat.isFile()) {
      // Git worktree: .git is a file containing "gitdir: <path>"
      const content = fs.readFileSync(gitFile, 'utf-8').trim();
      const match = content.match(/^gitdir:\s+(.+)$/);
      if (match) {
        // .../repo/.git/worktrees/<name> → 3 levels up → .../repo
        return path.resolve(match[1], '..', '..', '..');
      }
    } else if (stat.isDirectory()) {
      // Running directly from repo root (not a worktree)
      return path.resolve(gitFile, '..');
    }
  }

  // Fallback: try from CWD
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'packages', 'tools'))) {
    return cwd;
  }

  throw new Error(
    'Cannot locate repo root. Run this test from within the apollo-toolkit repository.',
  );
}

const REPO_ROOT = findRepoRoot();
const TOOLS_DIR = path.join(REPO_ROOT, 'packages', 'tools');

/**
 * Create an in-memory writable stream for capturing output.
 */
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

/**
 * Identify each tool directory in packages/tools/ and classify its arg parsing mode
 * by inspecting the compiled dist/index.js.
 *
 * Classification logic:
 *   - createToolRunner: converted to ToolSchema pattern (post-FIX-02).
 *   - parseArgs + args: tool uses raw parseArgs AND passes the handler's argv.
 *   - parseArgs, no args: tool uses parseArgs but ignores handler's argv (bug, pre-FIX).
 *   - no parseArgs: tool uses manual argument processing (skip).
 *
 * Returns a Map of tool-name -> { mode: 'strict'|'non-strict'|'skip', type: string, reason?: string }
 */
function classifyTools() {
  const entries = fs.readdirSync(TOOLS_DIR, { withFileTypes: true });
  const classified = new Map();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const distPath = path.join(TOOLS_DIR, name, 'dist', 'index.js');

    if (!fs.existsSync(distPath)) {
      classified.set(name, { mode: 'skip', reason: 'no dist' });
      continue;
    }

    const source = fs.readFileSync(distPath, 'utf-8');

    if (source.includes("createToolRunner")) {
      // Converted to ToolSchema — check explicit strict setting.
      // Only match strict:false that appears before handler: to avoid
      // matching inner parseArgs re-parsing (e.g. _rawArgs hack for multiple).
      const beforeHandler = source.slice(0, source.indexOf("handler:"));
      const strictMatch = beforeHandler.match(/strict:\s*(true|false)/);
      if (strictMatch && strictMatch[1] === "false") {
        classified.set(name, { mode: "non-strict", type: "createToolRunner" });
      } else {
        classified.set(name, { mode: "strict", type: "createToolRunner" });
      }
    } else if (source.includes('parseArgs')) {
      // Determine if the tool passes args/argv to parseArgs
      // Patterns: parseArgs({ args: argv, ...}) or parseArgs({ args: args, ...})
      const passesArgs = /\bargs:\s*(?:argv|args)\b/.test(source);

      if (source.includes('strict: false')) {
        classified.set(name, {
          mode: passesArgs ? 'non-strict' : 'skip',
          type: 'parseArgs',
          reason: passesArgs ? undefined : 'parseArgs without args param',
        });
      } else {
        classified.set(name, {
          mode: passesArgs ? 'strict' : 'skip',
          type: 'parseArgs',
          reason: passesArgs ? undefined : 'parseArgs without args param',
        });
      }
    } else {
      classified.set(name, { mode: 'skip', reason: 'no parseArgs' });
    }
  }

  return classified;
}

/**
 * Import a tool's module and return its handler function.
 */
async function loadHandler(toolName) {
  const mod = await import(`@laitszkin/tool-${toolName}`);
  return /** @type {import('@laitszkin/tool-registry').ToolDefinition['handler']} */ (
    mod.tool.handler
  );
}

// ── Discover and classify tools once before all tests ──
const tools = classifyTools();

// Tools that mention createToolRunner in comments but don't actually use it
const COMMENT_ONLY_TOOLS = new Set(['architecture', 'open-github-issue', 'find-github-issues', 'review-threads']);

const strictTools = [];
const nonStrictTools = [];

for (const [name, info] of tools) {
  if (COMMENT_ONLY_TOOLS.has(name)) continue; // skip false-positives
  if (info.mode === 'strict') strictTools.push(name);
  else if (info.mode === 'non-strict') nonStrictTools.push(name);
}
strictTools.sort();
nonStrictTools.sort();

// ─────────────────────────────────────────────────────────
// Test 1: strict mode tools reject unknown flags uniformly
// ─────────────────────────────────────────────────────────
test('strict mode tool rejects unknown flags', async (t) => {
  if (strictTools.length === 0) {
    // This can happen before FIX-02 is fully built into dist/
    t.diagnostic('no strict-mode tools found — skipping Test 1');
    return;
  }

  const errors = [];

  for (const name of strictTools) {
    await t.test(name, async () => {
      const handler = await loadHandler(name);
      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      const code = await handler(['--nonexistent-flag', 'value'], {
        stdout,
        stderr,
      });

      assert.equal(
        code,
        1,
        `${name}: expected exit code 1 for unknown flag, got ${code}. stderr: ${stderr.toString()}`,
      );

      const stderrText = stderr.toString();
      assert.ok(
        stderrText.startsWith('Error: '),
        `${name}: expected stderr to start with "Error: ", got: ${JSON.stringify(stderrText)}`,
      );
    });
  }

  if (errors.length > 0) {
    assert.fail('strict-mode assertion failures:\n' + errors.join('\n'));
  }
});

// ─────────────────────────────────────────────────────────
// Test 2: strict:false tools accept unknown flags gracefully
// ─────────────────────────────────────────────────────────
test('strict:false tool accepts unknown flags', async (t) => {
  if (nonStrictTools.length === 0) {
    t.diagnostic('no non-strict tools found — skipping Test 2');
    return;
  }

  for (const name of nonStrictTools) {
    await t.test(name, async () => {
      const info = tools.get(name);

      // For non-strict tools, parseArgs silently ignores the unknown flag.
      // Provide a non-existent path to prevent hanging on stdin.
      const handler = await loadHandler(name);
      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      const code = await handler(
        ['--nonexistent-flag', '/nonexistent/missing-file'],
        { stdout, stderr },
      );

      const stderrText = stderr.toString();

      // The tool may fail for other reasons (file not found) but must NOT
      // fail with a parse error about unknown flags.
      assert.ok(
        !stderrText.includes('Unknown option'),
        `${name}: should not produce unknown-option error: ${stderrText}`,
      );
      assert.ok(
        !stderrText.includes('parseArgs'),
        `${name}: should not produce parseArgs error: ${stderrText}`,
      );

      // Record the tool's behavior for diagnostic purposes
      t.diagnostic(
        `${name} (${info.type}, strict:false) → exit=${code}, stderr starts with ${JSON.stringify(stderrText.slice(0, 80))}`,
      );
    });
  }
});

// ─────────────────────────────────────────────────────────
// Test 3: all converted (createToolRunner) tools have
//         consistent error format for strict=true
// ─────────────────────────────────────────────────────────
test('all converted tools reject --nonexistent uniformly', async (t) => {
  const strictConverted = [];

  for (const [name, info] of tools) {
    if (COMMENT_ONLY_TOOLS.has(name)) continue; // skip false-positives
    if (info.type === 'createToolRunner' && info.mode === 'strict') {
      strictConverted.push(name);
    }
  }

  if (strictConverted.length === 0) {
    t.diagnostic(
      'no strict-mode createToolRunner tools found — skipping Test 3 ' +
        '(tools will be converted and rebuilt in subsequent FIX-02 batches)',
    );
    return;
  }

  const errors = [];

  for (const name of strictConverted) {
    await t.test(name, async () => {
      const handler = await loadHandler(name);
      const stdout = createMemoryStream();
      const stderr = createMemoryStream();

      const code = await handler(['--nonexistent-flag', 'value'], {
        stdout,
        stderr,
      });

      if (code !== 1) {
        errors.push(
          `${name}: expected exit code 1, got ${code}`,
        );
        return;
      }

      const stderrText = stderr.toString();

      if (!stderrText.startsWith('Error: ')) {
        errors.push(
          `${name}: error should start with "Error: ", got: ${JSON.stringify(stderrText)}`,
        );
      }
    });
  }

  if (errors.length > 0) {
    assert.fail(
      'createToolRunner tools are not uniform:\n' + errors.join('\n'),
    );
  }
});

// ─────────────────────────────────────────────────────────
// Diagnostic: report tool classification summary
// ─────────────────────────────────────────────────────────
test('tool classification summary', () => {
  const strictParseArgs = [];
  const strictConverted = [];
  const nonStrictParseArgs = [];
  const nonStrictConverted = [];
  const skipped = [];

  for (const [name, info] of tools) {
    if (COMMENT_ONLY_TOOLS.has(name)) {
      skipped.push(`${name} (createToolRunner in comments only)`);
      continue;
    }
    if (info.mode === 'strict') {
      if (info.type === 'createToolRunner') strictConverted.push(name);
      else strictParseArgs.push(name);
    } else if (info.mode === 'non-strict') {
      if (info.type === 'createToolRunner') nonStrictConverted.push(name);
      else nonStrictParseArgs.push(name);
    } else {
      skipped.push(`${name} (${info.reason})`);
    }
  }

  const lines = [];
  if (strictParseArgs.length) {
    lines.push(`strict (raw parseArgs): ${strictParseArgs.join(', ')}`);
  }
  if (strictConverted.length) {
    lines.push(`strict (createToolRunner): ${strictConverted.join(', ')}`);
  }
  if (nonStrictParseArgs.length) {
    lines.push(`non-strict (raw parseArgs): ${nonStrictParseArgs.join(', ')}`);
  }
  if (nonStrictConverted.length) {
    lines.push(`non-strict (createToolRunner): ${nonStrictConverted.join(', ')}`);
  }
  if (skipped.length) {
    lines.push(`skipped: ${skipped.join(', ')}`);
  }
  if (lines.length === 0) {
    lines.push('no tools found');
  }

  console.log(lines.join('\n'));
});
