import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, SystemError, createToolRunner } from '@laitszkin/tool-utils';

const TEMPLATE_FILENAMES = ['SPEC.md'];

const PLACEHOLDER_NAMES = ['[Feature Name]', '[功能名稱]'];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderContent(
  content: string,
  today: string,
  featureName: string,
  changeName: string,
  batchName: string | null,
): string {
  let rendered = content.replace(/\[YYYY-MM-DD\]/g, today);
  for (const placeholder of PLACEHOLDER_NAMES) {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rendered = rendered.replace(new RegExp(escaped, 'g'), featureName);
  }
  rendered = rendered.replace(/\[change_name\]/g, changeName);
  rendered = rendered.replace(/\[batch_name\]/g, batchName || 'None');
  return rendered;
}

const schema = {
  options: {
    'batch-name': { type: 'string' as const },
    'change-name': { type: 'string' as const },
    'slug': { type: 'string' as const },
    'output-dir': { type: 'string' as const, default: 'docs/plans' },
    'template-dir': { type: 'string' as const },
    'force': { type: 'boolean' as const, default: false },
  },
  allowPositionals: true,
  usage: 'apltk create-specs <feature_name> [options]',
  description: `The tool auto-creates a <today> folder under --output-dir. Batch names
should group related specs (e.g. "membership-cutover"), NOT include date
prefixes like "2026-05-22-membership" — that produces nested date folders.

Output:
  Single spec:  <output-dir>/<today>/<change-name>/SPEC.md
  Batch:        <output-dir>/<today>/<batch-name>/<change-name>/SPEC.md`,
  handler: async (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stderr = context.stderr ?? process.stderr;

    try {
      const featureName = (positionals[0] || '').trim();
      if (!featureName) {
        throw new UserInputError('feature_name is required.');
      }

      const changeName = ((values['change-name'] as string | undefined) || (values['slug'] as string | undefined) || '').trim() || slugify(featureName);
      if (!changeName) {
        throw new UserInputError('Unable to build change_name. Provide --change-name with ASCII letters/numbers.');
      }

      const batchName = (values['batch-name'] as string | undefined)?.trim() || null;

      // Warn if batch name looks like it starts with a date (common agent mistake
      // that produces nested date folders like <today>/2026-05-22-my-batch/).
      if (batchName && /^\d{4}-\d{2}-\d{2}/.test(batchName)) {
        stderr.write(`Warning: --batch-name "${batchName}" starts with a date pattern. The tool already\n`);
        stderr.write(`creates a <today> folder automatically, so this will produce nested date folders.\n`);
        stderr.write(`Use a descriptive name without date prefix, e.g. --batch-name "membership-cutover".\n\n`);
      }

      // Resolve template directory
      const sourceRoot = context.sourceRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
      const templateDirRaw = (values['template-dir'] as string) || path.join(sourceRoot, 'skills', 'spec', 'assets', 'templates');
      const templateDir = path.resolve(templateDirRaw);

      if (!fs.existsSync(templateDir)) {
        throw new UserInputError(`Template directory not found: ${templateDir}`);
      }

      // Check template files exist
      const missingTemplates = TEMPLATE_FILENAMES.filter((name) => !fs.existsSync(path.join(templateDir, name)));
      if (missingTemplates.length > 0) {
        throw new UserInputError(`Missing template files in ${templateDir}: ${missingTemplates.join(', ')}`);
      }

      const outputDir = path.resolve(values['output-dir'] as string || 'docs/plans');
      const today = new Date().toISOString().slice(0, 10);

      // Prevent double-nesting: if outputDir's last component is already today's date,
      // use it directly as the date root rather than appending the date again.
      const dateRoot = path.basename(outputDir) === today ? outputDir : path.join(outputDir, today);
      const batchRoot = batchName ? path.join(dateRoot, batchName) : null;
      const outputRoot = batchRoot ? path.join(batchRoot, changeName) : path.join(dateRoot, changeName);

      const outputPaths = TEMPLATE_FILENAMES.map((name) => path.join(outputRoot, name));

      const force = values['force'] === true;
      const existingFiles = outputPaths.filter((p) => fs.existsSync(p));
      if (existingFiles.length > 0 && !force) {
        throw new UserInputError(`Files already exist: ${existingFiles.join(', ')}. Use --force to overwrite.`);
      }

      fs.mkdirSync(outputRoot, { recursive: true });

      const stdout = context.stdout ?? process.stdout;
      const todayStr = today;

      for (const filename of TEMPLATE_FILENAMES) {
        const templatePath = path.join(templateDir, filename);
        const outputPath = path.join(outputRoot, filename);
        const content = fs.readFileSync(templatePath, 'utf-8');
        fs.writeFileSync(
          outputPath,
          renderContent(content, todayStr, featureName, changeName, batchName),
          'utf-8',
        );
        stdout.write(`${outputPath}\n`);
      }

      return 0;
    } catch (err: unknown) {
      if (err instanceof UserInputError) {
        stderr.write(`${err.message}\n`);
      } else if (err instanceof SystemError) {
        stderr.write(`${err.message}\n${err.stack}\n`);
      } else {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        stderr.write(`Error: ${msg}\n`);
      }
      return 1;
    }
  },
};

export const tool: ToolDefinition = {
  name: 'create-specs',
  category: 'Planning & architecture',
  description: 'Create spec planning documents from templates.',
  handler: createToolRunner(schema),
};
