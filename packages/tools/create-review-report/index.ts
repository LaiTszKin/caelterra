import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError, createToolRunner } from '@laitszkin/tool-utils';

const TEMPLATE_RELATIVE_PATH = 'skills/review/assets/templates/REPORT.md';
const OUTPUT_FILENAME = 'REPORT.md';
const SPEC_FILENAMES = ['SPEC.md', 'spec.md'];
const PLANS_DIR = 'docs/plans';
const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasSpecFile(dirPath: string): boolean {
  return SPEC_FILENAMES.some((name) => fs.existsSync(path.join(dirPath, name)));
}

function resolveTargetDir(inputPath: string): string {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    throw new UserInputError(`Path not found: ${inputPath}`);
  }

  // If it's a file, use its parent directory
  const dir = stat.isFile() ? path.dirname(inputPath) : inputPath;

  // Normalise and check directory exists
  let dirStat: fs.Stats;
  try {
    dirStat = fs.statSync(dir);
  } catch {
    throw new UserInputError(`Directory not found: ${dir}`);
  }
  if (!dirStat.isDirectory()) {
    throw new UserInputError(`Not a directory: ${dir}`);
  }

  const parentDir = path.dirname(dir);
  const hasSpecHere = hasSpecFile(dir);
  const hasSpecInParent = hasSpecFile(parentDir);

  if (hasSpecHere) {
    return dir;
  }

  if (hasSpecInParent) {
    return parentDir;
  }

  throw new UserInputError(`${dir} is not a valid spec directory (no SPEC.md found).`);
}

function findLatestDateDir(baseDir: string): string | null {
  if (!fs.existsSync(baseDir)) return null;

  const entries = fs.readdirSync(baseDir);
  const dateDirs = entries
    .filter((name) => DATE_DIR_PATTERN.test(name))
    .sort()
    .reverse();

  return dateDirs.length > 0 ? dateDirs[0] : null;
}

function autoDetectTargetDir(): string {
  const plansDir = path.resolve(PLANS_DIR);
  if (!fs.existsSync(plansDir)) {
    throw new UserInputError(`No ${PLANS_DIR}/ directory found. Specify the spec path manually.`);
  }

  const latestDate = findLatestDateDir(plansDir);
  if (!latestDate) {
    throw new UserInputError(`No dated spec directories found in ${PLANS_DIR}/. Specify the spec path manually.`);
  }

  const datePath = path.join(plansDir, latestDate);
  const subEntries = fs.readdirSync(datePath);

  // Look for spec directories (containing SPEC.md or spec.md)
  const singleSpecs: { name: string; path: string }[] = [];
  const batchDirs: { name: string; path: string }[] = [];

  for (const name of subEntries) {
    const subPath = path.join(datePath, name);
    if (!fs.statSync(subPath).isDirectory()) continue;

    if (hasSpecFile(subPath)) {
      singleSpecs.push({ name, path: subPath });
    } else {
      // Check if it's a batch dir (has subdirs with SPEC.md / spec.md)
      const subSubEntries = fs.readdirSync(subPath);
      for (const subName of subSubEntries) {
        const subSubPath = path.join(subPath, subName);
        if (fs.statSync(subSubPath).isDirectory() && hasSpecFile(subSubPath)) {
          batchDirs.push({ name, path: subPath });
          break;
        }
      }
    }
  }

  if (batchDirs.length === 1) {
    return batchDirs[0].path;
  }

  if (batchDirs.length > 1) {
    let msg = `Multiple batch specs found in ${datePath}. Specify the path manually:`;
    for (const bd of batchDirs) {
      msg += `\n  apltk create-review-report ${bd.path}`;
    }
    throw new UserInputError(msg);
  }

  if (singleSpecs.length === 1) {
    return singleSpecs[0].path;
  }

  if (singleSpecs.length > 1) {
    let msg = `Multiple specs found in ${datePath}. Specify the path manually:`;
    for (const ss of singleSpecs) {
      msg += `\n  apltk create-review-report ${ss.path}`;
    }
    throw new UserInputError(msg);
  }

  throw new UserInputError(`No specs found in ${datePath}.`);
}

const schema = {
  options: {
    force: { type: 'boolean' as const, short: 'f' },
  },
  allowPositionals: true,
  usage: 'apltk create-review-report [options] [<spec-path>]',
  description: 'Copy the code review report template (REPORT.md) to the spec directory.',
  handler: async (
    values: Record<string, unknown>,
    positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const stdout = context.stdout || process.stdout;
    const sourceRoot = context.sourceRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

    const force = values.force === true;

    // Resolve template path
    const templatePath = path.join(sourceRoot, TEMPLATE_RELATIVE_PATH);
    if (!fs.existsSync(templatePath)) {
      throw new UserInputError(`Review report template not found: ${templatePath}`);
    }

    // Resolve target directory
    const targetDir = positionals.length > 0
      ? resolveTargetDir(path.resolve(positionals[0]))
      : autoDetectTargetDir();

    // Copy template
    const outputPath = path.join(targetDir, OUTPUT_FILENAME);
    if (fs.existsSync(outputPath) && !force) {
      throw new UserInputError(`${outputPath} already exists. Use --force to overwrite.`);
    }

    fs.copyFileSync(templatePath, outputPath);
    stdout.write(`${outputPath}\n`);
    return 0;
  },
};

export const tool: ToolDefinition = {
  name: 'create-review-report',
  category: 'Planning & architecture',
  description: 'Copy the code review report template (REPORT.md) to the spec directory.',
  handler: createToolRunner(schema),
};
