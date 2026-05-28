import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ToolContext } from '../types';
import { iterSkillDirs } from '../utils/skill-discovery';

const TOP_LEVEL_ALLOWED_KEYS = new Set(['interface', 'dependencies', 'policy']);
const INTERFACE_REQUIRED_KEYS = new Set(['display_name', 'short_description', 'default_prompt']);
const INTERFACE_ALLOWED_KEYS = new Set([
  'display_name', 'short_description', 'default_prompt',
  'icon_small', 'icon_large', 'brand_color',
]);
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function repoRoot(context?: ToolContext): string {
  if (context?.sourceRoot) return context.sourceRoot;
  // __dirname is dist/lib/tools/; need to go up 3 levels to project root
  const fromDirname = path.resolve(__dirname, '..', '..', '..');
  if (fs.existsSync(path.join(fromDirname, 'package.json'))) return fromDirname;
  return path.resolve(__dirname, '..', '..', '..');
}

function extractFrontmatter(content: string): Record<string, any> {
  const lines = content.split('\n');
  if (!lines.length || lines[0].trim() !== '---') {
    throw new Error("SKILL.md must start with YAML frontmatter delimiter '---'.");
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      const raw = lines.slice(1, i).join('\n');
      const parsed = yaml.load(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('SKILL.md frontmatter must be a YAML mapping.');
      }
      return parsed as Record<string, any>;
    }
  }
  throw new Error("SKILL.md frontmatter is missing the closing '---' delimiter.");
}

function requireNonEmptyString(container: Record<string, any>, key: string, context: string, errors: string[]): void {
  const value = container[key];
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${context}: '${key}' must be a non-empty string.`);
  }
}

function validateDependencies(dependencies: any, context: string, errors: string[]): void {
  if (typeof dependencies !== 'object' || dependencies === null) {
    errors.push(`${context}: 'dependencies' must be a mapping.`);
    return;
  }

  const tools = dependencies['tools'];
  if (tools === undefined) return;
  if (!Array.isArray(tools)) {
    errors.push(`${context}: 'dependencies.tools' must be a list.`);
    return;
  }

  for (let i = 0; i < tools.length; i++) {
    const itemContext = `${context}: dependencies.tools[${i}]`;
    const item = tools[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`${itemContext} must be a mapping.`);
      continue;
    }
    requireNonEmptyString(item, 'type', itemContext, errors);
    requireNonEmptyString(item, 'value', itemContext, errors);

    if (typeof item['type'] === 'string' && item['type'] !== 'mcp') {
      errors.push(`${itemContext}: unsupported tool type '${item['type']}', only 'mcp' is allowed.`);
    }

    for (const optionalKey of ['description', 'transport', 'url']) {
      const optionalValue = item[optionalKey];
      if (optionalValue !== undefined && (typeof optionalValue !== 'string' || !optionalValue.trim())) {
        errors.push(`${itemContext}: '${optionalKey}' must be a non-empty string when provided.`);
      }
    }
  }
}

function validatePolicy(policy: any, context: string, errors: string[]): void {
  if (typeof policy !== 'object' || policy === null) {
    errors.push(`${context}: 'policy' must be a mapping.`);
    return;
  }

  const allowImplicit = policy['allow_implicit_invocation'];
  if (allowImplicit !== undefined && typeof allowImplicit !== 'boolean') {
    errors.push(`${context}: 'policy.allow_implicit_invocation' must be a boolean when provided.`);
  }
}

function validateSkill(skillDir: string): string[] {
  const errors: string[] = [];
  const skillMd = path.join(skillDir, 'SKILL.md');
  const openaiYaml = path.join(skillDir, 'agents', 'openai.yaml');

  let skillFrontmatter: Record<string, any>;
  try {
    skillFrontmatter = extractFrontmatter(fs.readFileSync(skillMd, 'utf8'));
  } catch (exc: any) {
    return [`${skillMd}: unable to read skill name for validation (${exc.message}).`];
  }

  const skillName = skillFrontmatter['name'];
  if (typeof skillName !== 'string' || !skillName.trim()) {
    return [`${skillMd}: frontmatter 'name' must be a non-empty string.`];
  }

  if (!fs.existsSync(openaiYaml)) {
    return [`${openaiYaml}: file is required for every skill.`];
  }

  let parsed: any;
  try {
    parsed = yaml.load(fs.readFileSync(openaiYaml, 'utf8'));
  } catch (exc: any) {
    return [`${openaiYaml}: invalid YAML (${exc.message}).`];
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return [`${openaiYaml}: top-level structure must be a YAML mapping.`];
  }

  const topLevelKeys = new Set(Object.keys(parsed));
  const unsupportedTopKeys = [...topLevelKeys].filter((k) => !TOP_LEVEL_ALLOWED_KEYS.has(k)).sort();
  if (unsupportedTopKeys.length) {
    errors.push(`${openaiYaml}: unsupported top-level keys: ${unsupportedTopKeys.join(', ')}.`);
  }

  const iface = parsed['interface'];
  if (typeof iface !== 'object' || iface === null) {
    errors.push(`${openaiYaml}: 'interface' must be a mapping.`);
    return errors;
  }

  const missingInterfaceKeys = [...INTERFACE_REQUIRED_KEYS].filter((k) => !(k in iface)).sort();
  if (missingInterfaceKeys.length) {
    errors.push(`${openaiYaml}: missing required interface keys: ${missingInterfaceKeys.join(', ')}.`);
  }

  const unsupportedInterfaceKeys = Object.keys(iface).filter((k) => !INTERFACE_ALLOWED_KEYS.has(k)).sort();
  if (unsupportedInterfaceKeys.length) {
    errors.push(`${openaiYaml}: unsupported interface keys: ${unsupportedInterfaceKeys.join(', ')}.`);
  }

  for (const requiredKey of [...INTERFACE_REQUIRED_KEYS].sort()) {
    requireNonEmptyString(iface, requiredKey, `${openaiYaml}`, errors);
  }

  const defaultPrompt = iface['default_prompt'];
  const expectedSkillRef = `$${skillName.trim()}`;
  if (typeof defaultPrompt === 'string' && !defaultPrompt.includes(expectedSkillRef)) {
    errors.push(`${openaiYaml}: interface.default_prompt must reference '${expectedSkillRef}'.`);
  }

  const brandColor = iface['brand_color'];
  if (brandColor !== undefined) {
    if (typeof brandColor !== 'string' || !HEX_COLOR_PATTERN.test(brandColor)) {
      errors.push(`${openaiYaml}: interface.brand_color must be a hex color like '#1A2B3C'.`);
    }
  }

  const dependencies = parsed['dependencies'];
  if (dependencies !== undefined) {
    validateDependencies(dependencies, `${openaiYaml}`, errors);
  }

  const policy = parsed['policy'];
  if (policy !== undefined) {
    validatePolicy(policy, `${openaiYaml}`, errors);
  }

  return errors;
}

export function validateOpenaiAgentConfigHandler(args: string[], context: ToolContext): Promise<number> {
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
    context.stdout?.write('agents/openai.yaml validation failed:\n');
    for (const error of allErrors) {
      context.stdout?.write(`- ${error}\n`);
    }
    return Promise.resolve(1);
  }

  context.stdout?.write(`agents/openai.yaml validation passed for ${skillDirs.length} skills.\n`);
  return Promise.resolve(0);
}
