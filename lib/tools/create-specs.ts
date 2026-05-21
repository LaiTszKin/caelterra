import fs from 'node:fs';
import path from 'node:path';
import type { ToolContext } from '../types';

const TEMPLATE_FILENAMES = [
  'spec.md',
  'tasks.md',
  'checklist.md',
  'contract.md',
  'design.md',
];
const COORDINATION_TEMPLATE = 'coordination.md';
const PREPARATION_TEMPLATE = 'preparation.md';
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

export async function createSpecsHandler(args: string[], context: ToolContext): Promise<number> {
  const stderr = context.stderr || process.stderr;

  // Parse CLI args manually for portability (no argparse dependency)
  const parsed: Record<string, string | boolean | null> = {};
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let key: string;
      let value: string | boolean | null;

      if (eqIndex !== -1) {
        key = arg.slice(2, eqIndex);
        value = arg.slice(eqIndex + 1);
      } else {
        key = arg.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          value = next;
          i++;
        } else {
          value = true;
        }
      }

      if (key === 'force' || key === 'with-coordination' || key === 'with-preparation') {
        parsed[key] = value === true || value === 'true';
      } else if (key === 'change-name' || key === 'slug') {
        parsed['change-name'] = String(value);
      } else if (key === 'batch-name') {
        parsed['batch-name'] = String(value);
      } else if (key === 'output-dir') {
        parsed['output-dir'] = String(value);
      } else if (key === 'template-dir') {
        parsed['template-dir'] = String(value);
      } else if (key === 'help' || key === 'h') {
        parsed['help'] = true;
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  if (parsed['help']) {
    const stdout = context.stdout || process.stdout;
    stdout.write(`Usage: apltk create-specs <feature_name> [options]

The tool auto-creates a <today> folder under --output-dir. Batch names
should group related specs (e.g. "membership-cutover"), NOT include date
prefixes like "2026-05-22-membership" — that produces nested date folders.

Output layout:
  Single spec:  <output-dir>/<today>/<change-name>/
  Batch:        <output-dir>/<today>/<batch-name>/<change-name>/

Options:
  --change-name, --slug   Folder name (defaults to slugified feature_name)
  --batch-name            Batch folder name (do NOT include date prefix)
  --with-coordination     Create coordination.md (requires --batch-name)
  --with-preparation      Create preparation.md (requires --batch-name)
  --output-dir            Output base directory (default: docs/plans)
  --template-dir          Template directory
  --force                 Overwrite existing files
`);
    return 0;
  }

  const featureName = (positionalArgs[0] || '').trim();
  if (!featureName) {
    stderr.write('Error: feature_name is required.\n');
    return 1;
  }

  const changeName = (parsed['change-name'] as string)?.trim() || slugify(featureName);
  if (!changeName) {
    stderr.write('Error: Unable to build change_name. Provide --change-name with ASCII letters/numbers.\n');
    return 1;
  }

  const batchName = (parsed['batch-name'] as string)?.trim() || null;

  // Warn if batch name looks like it starts with a date (common agent mistake
  // that produces nested date folders like <today>/2026-05-22-my-batch/).
  if (batchName && /^\d{4}-\d{2}-\d{2}/.test(batchName)) {
    stderr.write(`Warning: --batch-name "${batchName}" starts with a date pattern. The tool already\n`);
    stderr.write(`creates a <today> folder automatically, so this will produce nested date folders.\n`);
    stderr.write(`Use a descriptive name without date prefix, e.g. --batch-name "membership-cutover".\n\n`);
  }

  if (parsed['with-coordination'] && !batchName) {
    stderr.write('Error: --with-coordination requires --batch-name.\n');
    return 1;
  }
  if (parsed['with-preparation'] && !batchName) {
    stderr.write('Error: --with-preparation requires --batch-name.\n');
    return 1;
  }

  // Resolve template directory
  const sourceRoot = context.sourceRoot || path.resolve(__dirname, '..', '..', '..');
  const templateDirRaw = (parsed['template-dir'] as string) || path.join(sourceRoot, 'spec', 'assets', 'templates');
  const templateDir = path.resolve(templateDirRaw);

  if (!fs.existsSync(templateDir)) {
    stderr.write(`Error: Template directory not found: ${templateDir}\n`);
    return 1;
  }

  // Check template files exist
  const missingTemplates = TEMPLATE_FILENAMES.filter((name) => !fs.existsSync(path.join(templateDir, name)));
  if (parsed['with-coordination'] && !fs.existsSync(path.join(templateDir, COORDINATION_TEMPLATE))) {
    missingTemplates.push(COORDINATION_TEMPLATE);
  }
  if (parsed['with-preparation'] && !fs.existsSync(path.join(templateDir, PREPARATION_TEMPLATE))) {
    missingTemplates.push(PREPARATION_TEMPLATE);
  }
  if (missingTemplates.length > 0) {
    stderr.write(`Error: Missing template files in ${templateDir}: ${missingTemplates.join(', ')}\n`);
    return 1;
  }

  const outputDir = path.resolve(parsed['output-dir'] as string || 'docs/plans');
  const today = new Date().toISOString().slice(0, 10);

  // Prevent double-nesting: if outputDir's last component is already today's date,
  // use it directly as the date root rather than appending the date again.
  // This handles the case where --output-dir already points to an existing
  // date folder (e.g. docs/plans/2026-05-16).
  const dateRoot = path.basename(outputDir) === today ? outputDir : path.join(outputDir, today);
  const batchRoot = batchName ? path.join(dateRoot, batchName) : null;
  const outputRoot = batchRoot ? path.join(batchRoot, changeName) : path.join(dateRoot, changeName);

  const outputPaths = TEMPLATE_FILENAMES.map((name) => path.join(outputRoot, name));
  const coordinationPath = (parsed['with-coordination'] && batchRoot) ? path.join(batchRoot, COORDINATION_TEMPLATE) : null;
  const preparationPath = (parsed['with-preparation'] && batchRoot) ? path.join(batchRoot, PREPARATION_TEMPLATE) : null;

  const force = parsed['force'] === true;
  const existingFiles = outputPaths.filter((p) => fs.existsSync(p));
  if (existingFiles.length > 0 && !force) {
    stderr.write(`Error: Files already exist: ${existingFiles.join(', ')}. Use --force to overwrite.\n`);
    return 1;
  }

  fs.mkdirSync(outputRoot, { recursive: true });

  const stdout = context.stdout || process.stdout;
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

  if (coordinationPath && (force || !fs.existsSync(coordinationPath))) {
    const templateContent = fs.readFileSync(path.join(templateDir, COORDINATION_TEMPLATE), 'utf-8');
    fs.writeFileSync(
      coordinationPath,
      renderContent(templateContent, todayStr, featureName, changeName, batchName),
      'utf-8',
    );
    stdout.write(`${coordinationPath}\n`);
  }

  if (preparationPath && (force || !fs.existsSync(preparationPath))) {
    const templateContent = fs.readFileSync(path.join(templateDir, PREPARATION_TEMPLATE), 'utf-8');
    fs.writeFileSync(
      preparationPath,
      renderContent(templateContent, todayStr, featureName, changeName, batchName),
      'utf-8',
    );
    stdout.write(`${preparationPath}\n`);
  }

  return 0;
}
