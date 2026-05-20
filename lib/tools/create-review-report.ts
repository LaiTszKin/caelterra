import fs from 'node:fs';
import path from 'node:path';
import type { ToolContext } from '../types';

const TEMPLATE_RELATIVE_PATH = 'qa/assets/templates/code-review-report.md';
const OUTPUT_FILENAME = 'code-review-report.md';
const COORDINATION_FILENAME = 'coordination.md';
const SPEC_FILENAME = 'spec.md';
const PLANS_DIR = 'docs/plans';
const DATE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolveTargetDir(inputPath: string, stderr: { write(msg: string): boolean }): string | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(inputPath);
  } catch {
    stderr.write(`Error: Path not found: ${inputPath}\n`);
    return null;
  }

  // If it's a file, use its parent directory
  const dir = stat.isFile() ? path.dirname(inputPath) : inputPath;

  // Normalise and check directory exists
  let dirStat: fs.Stats;
  try {
    dirStat = fs.statSync(dir);
  } catch {
    stderr.write(`Error: Directory not found: ${dir}\n`);
    return null;
  }
  if (!dirStat.isDirectory()) {
    stderr.write(`Error: Not a directory: ${dir}\n`);
    return null;
  }

  const parentDir = path.dirname(dir);
  const hasCoordinationInParent = fs.existsSync(path.join(parentDir, COORDINATION_FILENAME));
  const hasCoordinationHere = fs.existsSync(path.join(dir, COORDINATION_FILENAME));
  const hasSpecHere = fs.existsSync(path.join(dir, SPEC_FILENAME));

  if (hasCoordinationHere) {
    // User pointed at a batch root → output here
    return dir;
  }

  if (hasCoordinationInParent && hasSpecHere) {
    // User pointed at a change within a batch → output at batch root (parent)
    return parentDir;
  }

  if (hasSpecHere) {
    // Single spec → output here
    return dir;
  }

  stderr.write(`Error: ${dir} is not a valid spec directory (no spec.md or coordination.md found).\n`);
  return null;
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

function autoDetectTargetDir(stderr: { write(msg: string): boolean }): string | null {
  const plansDir = path.resolve(PLANS_DIR);
  if (!fs.existsSync(plansDir)) {
    stderr.write(`Error: No ${PLANS_DIR}/ directory found. Specify the spec path manually.\n`);
    return null;
  }

  const latestDate = findLatestDateDir(plansDir);
  if (!latestDate) {
    stderr.write(`Error: No dated spec directories found in ${PLANS_DIR}/. Specify the spec path manually.\n`);
    return null;
  }

  const datePath = path.join(plansDir, latestDate);
  const subEntries = fs.readdirSync(datePath);

  // Look for batch roots (directories containing coordination.md)
  const batchRoots: string[] = [];
  const singleSpecs: string[] = [];

  for (const name of subEntries) {
    const subPath = path.join(datePath, name);
    if (!fs.statSync(subPath).isDirectory()) continue;

    if (fs.existsSync(path.join(subPath, COORDINATION_FILENAME))) {
      batchRoots.push(name);
    } else if (fs.existsSync(path.join(subPath, SPEC_FILENAME))) {
      singleSpecs.push(name);
    }
  }

  if (batchRoots.length === 1) {
    return path.join(datePath, batchRoots[0]);
  }

  if (batchRoots.length > 1) {
    stderr.write(`Error: Multiple batch specs found in ${datePath}. Specify the path manually:\n`);
    for (const name of batchRoots) {
      stderr.write(`  apltk create-review-report ${path.join(datePath, name)}\n`);
    }
    return null;
  }

  if (singleSpecs.length === 1) {
    return path.join(datePath, singleSpecs[0]);
  }

  if (singleSpecs.length > 1) {
    stderr.write(`Error: Multiple specs found in ${datePath}. Specify the path manually:\n`);
    for (const name of singleSpecs) {
      stderr.write(`  apltk create-review-report ${path.join(datePath, name)}\n`);
    }
    return null;
  }

  stderr.write(`Error: No specs found in ${datePath}.\n`);
  return null;
}

export async function createReviewReportHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;
  const sourceRoot = context.sourceRoot || path.resolve(__dirname, '..', '..', '..');

  if (args.includes('--help') || args.includes('-h')) {
    stdout.write(`Usage: apltk create-review-report [options] [<spec-path>]

Copy the QA code review report template (code-review-report.md)
to the appropriate spec directory.

Positional:
  <spec-path>    Path to the spec directory, spec.md file, or batch root.
                 If omitted, auto-detects the latest spec in docs/plans/.

Options:
  --force, -f    Overwrite existing code-review-report.md if it exists
  --help, -h     Show this help message

Examples:
  apltk create-review-report
  apltk create-review-report docs/plans/2026-05-21/my-feature
  apltk create-review-report docs/plans/2026-05-21/my-batch
  apltk create-review-report --force
`);
    return 0;
  }

  const force = args.includes('--force') || args.includes('-f');
  const positionalArgs = args.filter((a) => !a.startsWith('--'));

  // Resolve template path
  const templatePath = path.join(sourceRoot, TEMPLATE_RELATIVE_PATH);
  if (!fs.existsSync(templatePath)) {
    stderr.write(`Error: Review report template not found: ${templatePath}\n`);
    return 1;
  }

  // Resolve target directory
  let targetDir: string | null = null;

  if (positionalArgs.length > 0) {
    targetDir = resolveTargetDir(path.resolve(positionalArgs[0]), stderr);
  } else {
    targetDir = autoDetectTargetDir(stderr);
  }

  if (!targetDir) {
    return 1;
  }

  // Copy template
  const outputPath = path.join(targetDir, OUTPUT_FILENAME);
  if (fs.existsSync(outputPath) && !force) {
    stderr.write(`Error: ${outputPath} already exists. Use --force to overwrite.\n`);
    return 1;
  }

  fs.copyFileSync(templatePath, outputPath);
  stdout.write(`${outputPath}\n`);
  return 0;
}
