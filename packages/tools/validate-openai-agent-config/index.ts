import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import {
  UserInputError,
  iterSkillDirs,
  createToolRunner,
} from '@laitszkin/tool-utils';

const TOP_LEVEL_ALLOWED_KEYS = new Set(['interface', 'dependencies', 'policy']);
const INTERFACE_REQUIRED_KEYS = new Set([
  'display_name',
  'short_description',
  'default_prompt',
]);
const INTERFACE_ALLOWED_KEYS = new Set([
  'display_name',
  'short_description',
  'default_prompt',
  'icon_small',
  'icon_large',
  'brand_color',
]);
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function repoRoot(context?: ToolContext): string {
  if (context?.sourceRoot) return context.sourceRoot;
  // Use cwd as the fallback since __dirname is not available in ESM
  return process.cwd();
}

function extractFrontmatter(content: string): Record<string, unknown> {
  const lines = content.split('\n');
  if (!lines.length || (lines[0] ?? '').trim() !== '---') {
    throw new UserInputError(
      "SKILL.md must start with YAML frontmatter delimiter '---'.",
    );
  }
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      const raw = lines.slice(1, i).join('\n');
      const parsed = yaml.load(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new UserInputError(
          'SKILL.md frontmatter must be a YAML mapping.',
        );
      }
      return parsed as Record<string, unknown>;
    }
  }
  throw new UserInputError(
    "SKILL.md frontmatter is missing the closing '---' delimiter.",
  );
}

function requireNonEmptyString(
  container: Record<string, unknown>,
  key: string,
  context: string,
  errors: string[],
): void {
  const value = container[key];
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${context}: '${key}' must be a non-empty string.`);
  }
}

function validateDependencies(
  dependencies: unknown,
  context: string,
  errors: string[],
): void {
  if (typeof dependencies !== 'object' || dependencies === null) {
    errors.push(`${context}: 'dependencies' must be a mapping.`);
    return;
  }

  const depsRecord = dependencies as Record<string, unknown>;
  const tools = depsRecord['tools'];
  if (tools === undefined) return;
  if (!Array.isArray(tools)) {
    errors.push(`${context}: 'dependencies.tools' must be a list.`);
    return;
  }

  const toolsList = tools as Array<unknown>;
  for (let i = 0; i < toolsList.length; i++) {
    const itemContext = `${context}: dependencies.tools[${String(i)}]`;
    const item = toolsList[i];
    if (typeof item !== 'object' || item === null) {
      errors.push(`${itemContext} must be a mapping.`);
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    requireNonEmptyString(itemRecord, 'type', itemContext, errors);
    requireNonEmptyString(itemRecord, 'value', itemContext, errors);

    if (
      typeof itemRecord['type'] === 'string' &&
      itemRecord['type'] !== 'mcp'
    ) {
      errors.push(
        `${itemContext}: unsupported tool type '${itemRecord['type']}', only 'mcp' is allowed.`,
      );
    }

    for (const optionalKey of ['description', 'transport', 'url']) {
      const optionalValue = itemRecord[optionalKey];
      if (
        optionalValue !== undefined &&
        (typeof optionalValue !== 'string' || !optionalValue.trim())
      ) {
        errors.push(
          `${itemContext}: '${optionalKey}' must be a non-empty string when provided.`,
        );
      }
    }
  }
}

function validatePolicy(
  policy: unknown,
  context: string,
  errors: string[],
): void {
  if (typeof policy !== 'object' || policy === null) {
    errors.push(`${context}: 'policy' must be a mapping.`);
    return;
  }

  const policyRecord = policy as Record<string, unknown>;
  const allowImplicit = policyRecord['allow_implicit_invocation'];
  if (allowImplicit !== undefined && typeof allowImplicit !== 'boolean') {
    errors.push(
      `${context}: 'policy.allow_implicit_invocation' must be a boolean when provided.`,
    );
  }
}

function validateSkill(skillDir: string): string[] {
  const errors: string[] = [];
  const skillMd = path.join(skillDir, 'SKILL.md');
  const openaiYaml = path.join(skillDir, 'agents', 'openai.yaml');

  let skillFrontmatter: Record<string, unknown>;
  try {
    skillFrontmatter = extractFrontmatter(fs.readFileSync(skillMd, 'utf8'));
  } catch (exc: unknown) {
    return [
      `${skillMd}: unable to read skill name for validation (${(exc as Error).message}).`,
    ];
  }

  const skillName = skillFrontmatter['name'];
  if (typeof skillName !== 'string' || !skillName.trim()) {
    return [`${skillMd}: frontmatter 'name' must be a non-empty string.`];
  }

  if (!fs.existsSync(openaiYaml)) {
    return [`${openaiYaml}: file is required for every skill.`];
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(openaiYaml, 'utf8'));
  } catch (exc: unknown) {
    return [`${openaiYaml}: invalid YAML (${(exc as Error).message}).`];
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return [`${openaiYaml}: top-level structure must be a YAML mapping.`];
  }

  const parsedRecord = parsed as Record<string, unknown>;

  const topLevelKeys = new Set(Object.keys(parsedRecord));
  const unsupportedTopKeys = [...topLevelKeys]
    .filter((k) => !TOP_LEVEL_ALLOWED_KEYS.has(k))
    .sort();
  if (unsupportedTopKeys.length) {
    errors.push(
      `${openaiYaml}: unsupported top-level keys: ${unsupportedTopKeys.join(', ')}.`,
    );
  }

  const ifaceRaw = parsedRecord['interface'];
  if (typeof ifaceRaw !== 'object' || ifaceRaw === null) {
    errors.push(`${openaiYaml}: 'interface' must be a mapping.`);
    return errors;
  }

  const iface = ifaceRaw as Record<string, unknown>;

  const missingInterfaceKeys = [...INTERFACE_REQUIRED_KEYS]
    .filter((k) => !Object.prototype.hasOwnProperty.call(iface, k))
    .sort();
  if (missingInterfaceKeys.length) {
    errors.push(
      `${openaiYaml}: missing required interface keys: ${missingInterfaceKeys.join(', ')}.`,
    );
  }

  const unsupportedInterfaceKeys = Object.keys(iface)
    .filter((k) => !INTERFACE_ALLOWED_KEYS.has(k))
    .sort();
  if (unsupportedInterfaceKeys.length) {
    errors.push(
      `${openaiYaml}: unsupported interface keys: ${unsupportedInterfaceKeys.join(', ')}.`,
    );
  }

  for (const requiredKey of [...INTERFACE_REQUIRED_KEYS].sort()) {
    requireNonEmptyString(iface, requiredKey, openaiYaml, errors);
  }

  const defaultPrompt = iface['default_prompt'];
  const expectedSkillRef = `$${skillName.trim()}`;
  if (
    typeof defaultPrompt === 'string' &&
    !defaultPrompt.includes(expectedSkillRef)
  ) {
    errors.push(
      `${openaiYaml}: interface.default_prompt must reference '${expectedSkillRef}'.`,
    );
  }

  const brandColor = iface['brand_color'];
  if (brandColor !== undefined) {
    if (typeof brandColor !== 'string' || !HEX_COLOR_PATTERN.test(brandColor)) {
      errors.push(
        `${openaiYaml}: interface.brand_color must be a hex color like '#1A2B3C'.`,
      );
    }
  }

  const dependencies = parsedRecord['dependencies'];
  if (dependencies !== undefined) {
    validateDependencies(dependencies, openaiYaml, errors);
  }

  const policy = parsedRecord['policy'];
  if (policy !== undefined) {
    validatePolicy(policy, openaiYaml, errors);
  }

  return errors;
}

function validateOpenaiAgentConfigHandler(
  args: string[],
  context: ToolContext,
): number {
  const stdout = context.stdout ?? process.stdout;
  const root = repoRoot(context);
  const skillDirs = iterSkillDirs(root);

  if (!skillDirs.length) {
    throw new UserInputError('No top-level skill directories found.');
  }

  const allErrors: string[] = [];
  for (const dir of skillDirs) {
    allErrors.push(...validateSkill(dir));
  }

  if (allErrors.length) {
    stdout.write('agents/openai.yaml validation failed:\n');
    for (const error of allErrors) {
      stdout.write(`- ${error}\n`);
    }
    // Validation failure: return 1 (not throw) — this is an expected business
    // outcome (validation found issues), not an exceptional error.
    return 1;
  }

  stdout.write(
    `agents/openai.yaml validation passed for ${String(skillDirs.length)} skills.\n`,
  );
  return 0;
}

export const tool: ToolDefinition = {
  name: 'validate-openai-agent-config',
  category: 'Validation',
  description: 'Validate agents/openai.yaml configuration completeness',
  handler: createToolRunner({
    options: {},
    allowPositionals: true,
    usage: 'apltk validate-openai-agent-config',
    handler: (
      _values: Record<string, unknown>,
      positionals: string[],
      context: ToolContext,
    ) => validateOpenaiAgentConfigHandler(positionals, context),
  }),
};
