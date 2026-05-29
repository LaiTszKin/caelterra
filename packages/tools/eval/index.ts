/**
 * index.ts — `apltk eval` CLI entry point
 *
 * Orchestrates the full eval pipeline:
 *   1. Load .env
 *   2. Verify skill directory (skills/<name>/SKILL.md)
 *   3. Load question bank (assets/spec/{date}/test-questions.json)
 *   4. Stratified sampling (fast / standard)
 *   5. Execute tests in isolation (runAllTests)
 *   6. Score with LLM-as-Judge (scoreAllTests)
 *   7. Generate Markdown report (generateReport → writeReport)
 *   8. Optionally generate optimization plan and optimise SKILL.md
 *
 * Only uses Node.js built-in modules and other eval modules.
 * No external CLI-dependency libraries (argparse, commander, etc.).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

import { loadEnv } from './lib/env-utils.js';
import type { EnvConfig } from './lib/env-utils.js';
import { loadQuestions, sampleQuestions } from './question-loader.js';
import type { Question } from './question-loader.js';
import { runAllTests } from './executor.js';
import type { TestResult } from './executor.js';
import { scoreAllTests } from './scorer.js';
import type { ScoreResult } from './scorer.js';
import { generateReport, writeReport } from './reporter.js';
import {
  loadAllScores,
  extractIssues,
  deduplicateIssues,
  generateSuggestedFix,
  generateOptimizationPlan,
  optimizeSkillMd,
} from './optimizer.js';
import type { DedupedIssue } from './optimizer.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the project root directory.
 *
 * Priority:
 *   1. context.sourceRoot (if provided by the CLI)
 *   2. 4 levels up from source path (packages/tools/eval/index.ts)
 *   3. 5 levels up from compiled path (packages/tools/eval/dist/index.js)
 *   4. Crawl up from process.cwd()
 */
function resolveProjectRoot(context: ToolContext): string {
  if (context.sourceRoot) return context.sourceRoot;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Source path: packages/tools/eval/index.ts → 4 levels up
  const sourceCandidate = path.resolve(__dirname, '..', '..', '..', '..');
  if (fs.existsSync(path.join(sourceCandidate, 'assets', 'spec'))) {
    return sourceCandidate;
  }

  // Compiled path: packages/tools/eval/dist/index.js → 5 levels up
  const distCandidate = path.resolve(__dirname, '..', '..', '..', '..', '..');
  if (fs.existsSync(path.join(distCandidate, 'assets', 'spec'))) {
    return distCandidate;
  }

  // Fallback: crawl up from cwd (max 10 levels)
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'assets', 'spec'))) {
      return dir;
    }
    const parent = path.resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('無法確定專案根目錄：找不到 assets/spec/ 目錄');
}

/**
 * List all skill names that have a SKILL.md file.
 */
function listSkillNames(projectRoot: string): string[] {
  const skillsDir = path.join(projectRoot, 'skills');
  if (!fs.existsSync(skillsDir)) return [];

  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')),
    )
    .map((d) => d.name)
    .sort();
}

// ─── CLI argument parsing ───────────────────────────────────────────────────

interface ParsedArgs {
  skillName: string;
  mode: 'fast' | 'standard';
  optimize: boolean;
  dryRun: boolean;
  outputDir: string | null;
  help: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    skillName: '',
    mode: 'fast',
    optimize: false,
    dryRun: false,
    outputDir: null,
    help: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let key: string;
      let value: string | boolean;

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

      switch (key) {
        case 'mode':
          result.mode = (value as string) === 'standard' ? 'standard' : 'fast';
          break;
        case 'optimize':
          result.optimize = true;
          break;
        case 'dry-run':
          result.dryRun = true;
          break;
        case 'output-dir':
          result.outputDir = value as string;
          break;
      }
    } else {
      positional.push(arg);
    }
  }

  result.skillName = (positional[0] || '').trim();
  return result;
}

// ─── Help text ──────────────────────────────────────────────────────────────

function printHelp(stdout: NodeJS.WriteStream): void {
  const text = [
    'Usage: apltk eval <skill_name> [options]',
    '',
    'Evaluate and optimise agent skills using LLM-as-Judge.',
    '',
    'Arguments:',
    '  skill_name              Name of the skill to evaluate (required)',
    '',
    'Options:',
    '  --mode <fast|standard>  Sampling mode (default: fast)',
    '  --optimize              Run optimisation after evaluation',
    '  --dry-run               Only generate optimisation patch, do not modify SKILL.md',
    '  --output-dir <dir>      Custom report output directory',
    '',
    'Examples:',
    '  apltk eval spec                      Evaluate "spec" skill in fast mode',
    '  apltk eval spec --mode standard      Evaluate with standard sampling (8-12 questions)',
    '  apltk eval spec --optimise           Evaluate then optimise SKILL.md',
    '  apltk eval spec --optimise --dry-run Review optimisations without applying',
    '',
  ].join('\n');
  stdout.write(text);
}

// ─── Main handler ───────────────────────────────────────────────────────────

async function evalHandler(
  args: string[],
  context: ToolContext,
): Promise<number> {
  const stderr = context.stderr || process.stderr;
  const stdout = context.stdout || process.stdout;
  const parsed = parseArgs(args);

  // ── Help ────────────────────────────────────────────────────────────────
  if (parsed.help) {
    printHelp(stdout);
    return 0;
  }

  // ── Resolve project root ────────────────────────────────────────────────
  let projectRoot: string;
  try {
    projectRoot = resolveProjectRoot(context);
  } catch (err) {
    stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  // ── Check skill name ────────────────────────────────────────────────────
  if (!parsed.skillName) {
    const skills = listSkillNames(projectRoot);
    stderr.write('Usage: apltk eval <skill_name> [options]\n\n');
    if (skills.length === 0) {
      stderr.write('No skills found in skills/ directory.\n');
    } else {
      stderr.write('Available skills:\n');
      for (const sk of skills) {
        stderr.write(`  ${sk}\n`);
      }
    }
    stderr.write('\n');
    return 1;
  }

  const { skillName, mode, optimize, dryRun, outputDir } = parsed;

  // ── Verify skill SKILL.md exists ────────────────────────────────────────
  const skillMdPath = path.join(projectRoot, 'skills', skillName, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    stderr.write(
      `Error: SKILL.md not found for skill "${skillName}".\nExpected: ${skillMdPath}\n`,
    );
    return 1;
  }

  // ── Pipeline ────────────────────────────────────────────────────────────
  try {
    // 1. Load environment variables
    stderr.write('[1/7] Loading environment variables...\n');
    const env: EnvConfig = loadEnv();
    stderr.write('[1/7] OK\n');

    const today = new Date().toISOString().slice(0, 10);

    // 2. Load question bank
    const questionsPath = path.join(
      projectRoot,
      'assets',
      'spec',
      today,
      'test-questions.json',
    );
    stderr.write(`[2/7] Loading question bank: ${questionsPath}...\n`);
    const allQuestions: Question[] = loadQuestions(questionsPath);
    stderr.write(`[2/7] Loaded ${allQuestions.length} questions\n`);

    // 3. Stratified sampling
    stderr.write(`[3/7] Sampling questions (mode: ${mode})...\n`);
    const sampled = sampleQuestions(allQuestions, mode);
    stderr.write(
      `[3/7] Sampled ${sampled.length} questions ` +
        `(${sampled.filter((q) => q.difficulty === 'basic').length} basic, ` +
        `${sampled.filter((q) => q.difficulty === 'advanced').length} advanced, ` +
        `${sampled.filter((q) => q.difficulty === 'edge').length} edge)\n`,
    );

    // 4. Run tests
    stderr.write(`[4/7] Running ${sampled.length} tests...\n`);
    const testResults: TestResult[] = await runAllTests(
      sampled,
      env,
      today,
      skillName,
    );
    const passed = testResults.filter((r) => r.success).length;
    const failed = testResults.filter((r) => !r.success).length;
    stderr.write(`[4/7] Tests complete: ${passed} passed, ${failed} failed\n`);

    // 5. Score tests
    stderr.write('[5/7] Scoring tests...\n');
    const scores: ScoreResult[] = await scoreAllTests(today, env);
    stderr.write(`[5/7] Scored ${scores.length} tests\n`);

    // 6. Generate and persist report
    stderr.write('[6/7] Generating report...\n');
    const report = generateReport(scores, today, skillName);
    const reportPath = writeReport(report, today, skillName);
    stderr.write(`[6/7] Report written: ${reportPath}\n`);

    // Write to custom output directory if specified
    if (outputDir) {
      const customDir = path.resolve(outputDir);
      fs.mkdirSync(customDir, { recursive: true });
      const customPath = path.join(
        customDir,
        `eval-report-${today}-${skillName}.md`,
      );
      fs.writeFileSync(customPath, report, 'utf-8');
      stderr.write(`[6/7] Report also written: ${customPath}\n`);
    }

    // 7. Optimisation (optional)
    if (optimize) {
      stderr.write('[7/7] Generating optimisation plan...\n');
      const allScores = loadAllScores(today);
      const rawIssues = extractIssues(allScores);
      const deduped: DedupedIssue[] = await deduplicateIssues(
        rawIssues,
        env,
        true,
      );

      // Generate suggested fixes for each deduped issue
      stderr.write(
        `[7/7] Generating suggested fixes for ${deduped.length} issues...\n`,
      );
      const fixPromises = deduped.map(async (issue) => {
        issue.suggestedFix = await generateSuggestedFix(issue, env, true);
      });
      await Promise.all(fixPromises);

      const plan = generateOptimizationPlan(deduped, today, allScores);

      stderr.write('[7/7] Optimising SKILL.md...\n');
      const optResult = await optimizeSkillMd(
        plan,
        skillMdPath,
        env,
        dryRun,
        today,
        true,
      );
      stderr.write(`[7/7] ${optResult.message}\n`);
    } else {
      stderr.write('[7/7] Skipped (use --optimize to enable)\n');
    }

    // ── Summary ───────────────────────────────────────────────────────────
    stdout.write('\n=== Eval Complete ===\n');
    stdout.write(`Skill:   ${skillName}\n`);
    stdout.write(`Mode:    ${mode}\n`);
    stdout.write(`Date:    ${today}\n`);
    stdout.write(`Tests:   ${passed} passed, ${failed} failed out of ${testResults.length}\n`);
    stdout.write(`Report:  ${reportPath}\n`);
    if (optimize) {
      stdout.write(`Optim.:  ${dryRun ? 'dry-run (patch only)' : 'applied'}\n`);
    }
    stdout.write('\n');

    return failed > 0 ? 1 : 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`\nEval failed: ${message}\n`);
    return 1;
  }
}

// ─── ToolDefinition export ──────────────────────────────────────────────────

export const tool: ToolDefinition = {
  name: 'eval',
  category: 'Quality & testing',
  description: 'Evaluate and optimise agent skills using LLM-as-Judge.',
  handler: evalHandler,
};
