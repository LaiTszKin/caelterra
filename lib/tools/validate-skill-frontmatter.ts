import fs from 'node:fs';
import path from 'node:path';
import type { ToolContext } from '../types';
import { iterSkillDirs } from '../utils/skill-discovery';

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_KEYS = new Set(['name', 'description']);
const MAX_DESCRIPTION_LENGTH = 1024;

function repoRoot(context?: ToolContext): string {
  if (context?.sourceRoot) return context.sourceRoot;
  // __dirname is dist/lib/tools/; need to go up 3 levels to project root
  const fromDirname = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(fromDirname, 'package.json'))) return fromDirname;
  return path.resolve(__dirname, '..', '..', '..');
}

function extractFrontmatter(content: string): string {
  const lines = content.split('\n');
  if (!lines.length || lines[0].trim() !== '---') {
    throw new Error("SKILL.md must start with YAML frontmatter delimiter '---'.");
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return lines.slice(1, i).join('\n');
    }
  }
  throw new Error("SKILL.md frontmatter is missing the closing '---' delimiter.");
}

function validateSkill(skillDir: string): string[] {
  const errors: string[] = [];
  const skillMd = path.join(skillDir, 'SKILL.md');

  let content: string;
  try {
    content = fs.readFileSync(skillMd, 'utf8');
  } catch (exc: any) {
    return [`${skillMd}: cannot read file (${exc.message}).`];
  }

  let frontmatterText: string;
  try {
    frontmatterText = extractFrontmatter(content);
  } catch (exc: any) {
    return [`${skillMd}: ${exc.message}`];
  }

  // Simple YAML-like parsing for frontmatter (handles the common cases)
  let frontmatter: Record<string, any> = {};
  for (const line of frontmatterText.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      frontmatter[match[1]] = match[2].trim();
    }
  }

  const keys = new Set(Object.keys(frontmatter));
  const missing = [...REQUIRED_KEYS].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !REQUIRED_KEYS.has(k));
  if (missing.length) {
    errors.push(`${skillMd}: missing required frontmatter keys: ${missing.join(', ')}.`);
  }
  if (extra.length) {
    errors.push(`${skillMd}: unsupported frontmatter keys: ${extra.join(', ')}.`);
  }

  const name = frontmatter['name'];
  if (typeof name !== 'string' || !name.trim()) {
    errors.push(`${skillMd}: 'name' must be a non-empty string.`);
  } else {
    const normalizedName = name.trim();
    if (!NAME_PATTERN.test(normalizedName)) {
      errors.push(`${skillMd}: 'name' must be kebab-case (lowercase letters, digits, and hyphens).`);
    }
    if (normalizedName !== path.basename(skillDir)) {
      errors.push(`${skillMd}: frontmatter name '${normalizedName}' must match folder name '${path.basename(skillDir)}'.`);
    }
  }

  const description = frontmatter['description'];
  if (typeof description !== 'string' || !description.trim()) {
    errors.push(`${skillMd}: 'description' must be a non-empty string.`);
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`${skillMd}: invalid description: exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  return errors;
}

export function validateSkillFrontmatterHandler(args: string[], context: ToolContext): Promise<number> {
  const root = repoRoot(context);
  const skillDirs = iterSkillDirs(root);

  if (!skillDirs.length) {
    context.stdout?.write('No top-level skill directories found.\n');
    return Promise.resolve(1);
  }

  const allErrors: string[] = [];
  for (const dir of skillDirs) {
    allErrors.push(...validateSkill(dir));
  }

  if (allErrors.length) {
    context.stdout?.write('SKILL.md frontmatter validation failed:\n');
    for (const error of allErrors) {
      context.stdout?.write(`- ${error}\n`);
    }
    return Promise.resolve(1);
  }

  context.stdout?.write(`SKILL.md frontmatter validation passed for ${skillDirs.length} skills.\n`);
  return Promise.resolve(0);
}
