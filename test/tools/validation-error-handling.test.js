import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tool as validateSkillFrontmatterTool } from '@laitszkin/tool-validate-skill-frontmatter';
import { tool as validateOpenaiAgentConfigTool } from '@laitszkin/tool-validate-openai-agent-config';

const validateSkillFrontmatterHandler = /** @type {import('@laitszkin/tool-registry').ToolDefinition['handler']} */ (validateSkillFrontmatterTool.handler);
const validateOpenaiAgentConfigHandler = /** @type {import('@laitszkin/tool-registry').ToolDefinition['handler']} */ (validateOpenaiAgentConfigTool.handler);

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

// ---- validate-skill-frontmatter error output tests ----

test('validate-skill-frontmatter: error to stderr when no skill dirs found', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-vsf-empty-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'skills'), { recursive: true });

    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await validateSkillFrontmatterHandler([], {
      sourceRoot: tmpDir,
      stdout,
      stderr,
    });

    assert.equal(code, 1);
    const err = stderr.toString();
    assert.ok(err.includes('No top-level skill directories found.'));
    assert.equal(stdout.toString(), '', 'stdout should be empty on error');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validate-skill-frontmatter: validation errors to stderr not stdout', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-vsf-err-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    // SKILL.md with frontmatter but missing required keys 'name' and 'description'
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nfoo: bar\n---\n',
      'utf8',
    );

    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await validateSkillFrontmatterHandler([], {
      sourceRoot: tmpDir,
      stdout,
      stderr,
    });

    assert.equal(code, 1);
    const err = stderr.toString();
    assert.ok(err.includes('SKILL.md frontmatter validation failed'));
    assert.ok(err.includes('missing required frontmatter keys'));
    assert.ok(err.includes('unsupported frontmatter keys'));
    assert.equal(stdout.toString(), '', 'stdout should be empty on error');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---- validate-openai-agent-config error output tests ----

test('validate-openai-agent-config: error to stderr when no skill dirs found', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-voac-empty-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'skills'), { recursive: true });

    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await validateOpenaiAgentConfigHandler([], {
      sourceRoot: tmpDir,
      stdout,
      stderr,
    });

    assert.equal(code, 1);
    const err = stderr.toString();
    assert.ok(err.includes('No top-level skill directories found.'));
    assert.equal(stdout.toString(), '', 'stdout should be empty on error');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validate-openai-agent-config: validation errors to stderr when agents/openai.yaml missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-voac-err-'));
  try {
    const skillDir = path.join(tmpDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    // SKILL.md with valid name/description but no agents/openai.yaml
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: A test skill\n---\n',
      'utf8',
    );

    const stdout = createMemoryStream();
    const stderr = createMemoryStream();
    const code = await validateOpenaiAgentConfigHandler([], {
      sourceRoot: tmpDir,
      stdout,
      stderr,
    });

    assert.equal(code, 1);
    const err = stderr.toString();
    assert.ok(err.includes('agents/openai.yaml validation failed'));
    assert.ok(err.includes('agents/openai.yaml'));
    assert.ok(err.includes('file is required'));
    assert.equal(stdout.toString(), '', 'stdout should be empty on error');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---- regression: validate tools throw UserInputError (no "Error:" prefix) ----

test('validate-skill-frontmatter validation errors are UserInputError', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-vsf-uie-'));
  try {
    // Create a skill dir with invalid frontmatter to trigger UserInputError
    const skillDir = path.join(tmpDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nfoo: bar\n---\n',
      'utf8',
    );

    const mod = await import('../../packages/tools/validate-skill-frontmatter/dist/index.js');
    const stderr = { data: '', write(c) { this.data += c; } };
    const code = await mod.tool.handler([], {
      sourceRoot: tmpDir,
      stdout: { write() {} },
      stderr,
      env: {},
    });

    assert.strictEqual(code, 1);
    // Should NOT have "Error:" prefix for UserInputError
    assert.ok(!stderr.data.includes('Error:'));
    // Should contain validation error messages
    assert.ok(stderr.data.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validate-openai-agent-config validation errors are UserInputError', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apltk-voac-uie-'));
  try {
    // Create a skill dir with valid SKILL.md but missing agents/openai.yaml
    const skillDir = path.join(tmpDir, 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: A test skill\n---\n',
      'utf8',
    );

    const mod = await import('../../packages/tools/validate-openai-agent-config/dist/index.js');
    const stderr = { data: '', write(c) { this.data += c; } };
    const code = await mod.tool.handler([], {
      sourceRoot: tmpDir,
      stdout: { write() {} },
      stderr,
      env: {},
    });

    assert.strictEqual(code, 1);
    // Should NOT have "Error:" prefix for UserInputError
    assert.ok(!stderr.data.includes('Error:'));
    // Should contain validation error messages
    assert.ok(stderr.data.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
