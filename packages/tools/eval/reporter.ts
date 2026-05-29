/**
 * reporter.ts — Eval Score Report Generator
 *
 * Aggregates ScoreResult arrays into structured Markdown reports with:
 *   - Title, timestamp, and skill context
 *   - Overall and per-dimension average scores
 *   - Per-test detail table
 *   - Deducted points summary (issues sorted by severity)
 *   - Common problem pattern analysis
 *
 * Only uses Node.js built-in modules. No external dependencies.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ScoreResult, Issue } from './scorer.js';

// --- Report Generation ---

/**
 * Calculate the average of an array of numbers.
 *
 * @param values - Numeric array
 * @returns Average value (0 for empty arrays)
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Format a score as a percentage string with one decimal place.
 *
 * @param score - Score value (0-100)
 * @returns Formatted string like "85.3"
 */
function fmtScore(score: number): string {
  return score.toFixed(1);
}

/**
 * Generate a structured Markdown report from an array of ScoreResults.
 *
 * The report includes:
 *   1. Title and timestamp
 *   2. Summary statistics (total tests, average scores)
 *   3. Per-dimension average breakdown
 *   4. Per-test detail table
 *   5. Issues summary sorted by severity (P0 > P1 > P2)
 *   6. Common problem pattern analysis
 *
 * @param scores - Array of ScoreResult objects
 * @param date - Date string for the report header
 * @param skillName - Optional skill name for context
 * @returns Complete Markdown report string
 */
export function generateReport(
  scores: ScoreResult[],
  date: string,
  skillName?: string,
): string {
  const now = new Date().toISOString();
  const totalTests = scores.length;

  if (totalTests === 0) {
    return [
      `# 評分報告`,
      '',
      `**日期**: ${date}`,
      `**產生時間**: ${now}`,
      skillName ? `**技能**: ${skillName}` : '',
      '',
      '> 無測試結果可供報告。',
      '',
    ].filter(line => line !== '').join('\n');
  }

  // --- Overall statistics ---
  const overallScores = scores.map(s => s.overallScore);
  const overallAvg = average(overallScores);
  const overallMin = Math.min(...overallScores);
  const overallMax = Math.max(...overallScores);

  // --- Per-dimension statistics ---
  // Collect all dimension names from the first result that has dimensions
  const dimNames: string[] = [];
  for (const s of scores) {
    if (s.dimensions.length > 0) {
      for (const d of s.dimensions) {
        if (!dimNames.includes(d.name)) {
          dimNames.push(d.name);
        }
      }
      break;
    }
  }

  // If no dimension data found in any result, try a broader scan
  if (dimNames.length === 0) {
    for (const s of scores) {
      for (const d of s.dimensions) {
        if (!dimNames.includes(d.name)) {
          dimNames.push(d.name);
        }
      }
      if (dimNames.length > 0) break;
    }
  }

  const dimStats = dimNames.map(name => {
    const dimScores = scores
      .filter(s => s.dimensions.some(d => d.name === name))
      .map(s => s.dimensions.find(d => d.name === name)!)
      .map(d => d.score);

    return {
      name,
      avg: average(dimScores),
      min: dimScores.length > 0 ? Math.min(...dimScores) : 0,
      max: dimScores.length > 0 ? Math.max(...dimScores) : 0,
      count: dimScores.length,
      weight: scores.length > 0 && scores[0].dimensions.some(d => d.name === name)
        ? scores[0].dimensions.find(d => d.name === name)!.weight
        : 0,
    };
  });

  // --- Issue collection and sorting ---
  const allIssues: Issue[] = [];
  for (const s of scores) {
    for (const issue of s.issues) {
      allIssues.push(issue);
    }
  }

  // Sort: P0 first, then P1, then P2; within each severity, by category
  const severityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  const sortedIssues = [...allIssues].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return a.category.localeCompare(b.category);
  });

  // --- Common patterns ---
  const patterns: string[] = [];

  // Pattern: low-scoring dimensions
  for (const ds of dimStats) {
    if (ds.avg < 60 && ds.count > 0) {
      patterns.push(`- **${ds.name}** 維度平均分數偏低 (${fmtScore(ds.avg)})，需要關注`);
    }
  }

  // Pattern: issue category distribution
  const categoryCount: Record<string, number> = {};
  for (const issue of allIssues) {
    categoryCount[issue.category] = (categoryCount[issue.category] ?? 0) + 1;
  }
  const topCategory = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (topCategory.length > 0) {
    const catSummary = topCategory.map(([cat, count]) => `${cat} (${count} 項)`).join(', ');
    patterns.push(`- 主要問題類別: ${catSummary}`);
  }

  // Pattern: issues per severity
  const severityCount: Record<string, number> = { P0: 0, P1: 0, P2: 0 };
  for (const issue of allIssues) {
    severityCount[issue.severity] = (severityCount[issue.severity] ?? 0) + 1;
  }
  const sevSummary = ['P0', 'P1', 'P2']
    .filter(sev => severityCount[sev] > 0)
    .map(sev => `${sev}: ${severityCount[sev]} 項`)
    .join(', ');
  if (sevSummary) {
    patterns.push(`- 問題嚴重度分佈: ${sevSummary}`);
  }

  // Pattern: tests with extremely low scores
  const lowScoreTests = scores.filter(s => s.overallScore < 30);
  if (lowScoreTests.length > 0) {
    patterns.push(`- ${lowScoreTests.length} 個測試總分低於 30: ${lowScoreTests.map(s => s.testId).join(', ')}`);
  }

  // Pattern: tests with extremely high scores
  const highScoreTests = scores.filter(s => s.overallScore >= 90);
  if (highScoreTests.length > 0) {
    patterns.push(`- ${highScoreTests.length} 個測試總分達到 90 以上: ${highScoreTests.map(s => s.testId).join(', ')}`);
  }

  if (patterns.length === 0) {
    patterns.push('- 未發現明顯的問題模式');
  }

  // --- Build report sections ---

  const sections: string[] = [];

  // 1. Title
  sections.push(
    '# 評分報告',
    '',
    `**日期**: ${date}`,
    `**產生時間**: ${now}`,
    skillName ? `**技能**: ${skillName}` : '',
    `**測試總數**: ${totalTests}`,
    '',
  );

  // 2. Overall score summary
  sections.push(
    '## 整體評分摘要',
    '',
    `| 指標 | 數值 |`,
    `|------|------|`,
    `| 平均總分 | ${fmtScore(overallAvg)} |`,
    `| 最低總分 | ${fmtScore(overallMin)} |`,
    `| 最高總分 | ${fmtScore(overallMax)} |`,
    `| 標準差 | ${fmtScore(Math.sqrt(overallScores.reduce((sq, s) => sq + (s - overallAvg) ** 2, 0) / overallScores.length))} |`,
    `| 總問題數 | ${allIssues.length} |`,
    '',
  );

  // 3. Per-dimension average breakdown
  sections.push(
    '## 各維度平均分數',
    '',
    '| 維度 | 平均分數 | 權重 | 最低分 | 最高分 | 有分數的測試數 |',
    '|------|---------|------|--------|--------|---------------|',
  );
  for (const ds of dimStats) {
    sections.push(
      `| ${ds.name} | ${fmtScore(ds.avg)} | ${ds.weight.toFixed(2)} | ${fmtScore(ds.min)} | ${fmtScore(ds.max)} | ${ds.count} |`,
    );
  }
  sections.push('');

  // 4. Per-test detail table
  sections.push(
    '## 各題評分明細',
    '',
    '| 題目 ID | 總分 | 各維度分數 | 摘要 |',
    '|---------|------|-----------|------|',
  );

  for (const s of scores) {
    const dimParts = s.dimensions.map(d => `${d.name}: ${fmtScore(d.score)}`).join(', ');
    const summary = s.summary.length > 50 ? s.summary.substring(0, 50) + '...' : s.summary;
    sections.push(`| ${s.testId} | ${fmtScore(s.overallScore)} | ${dimParts} | ${summary} |`);
  }
  sections.push('');

  // 5. Issue summary
  if (sortedIssues.length > 0) {
    sections.push(
      '## 扣分項摘要',
      '',
      '| 嚴重度 | 類別 | 題目 | 描述 | 證據 |',
      '|--------|------|------|------|------|',
    );

    for (const issue of sortedIssues) {
      // Glue the issue to its test(s) by matching description context
      const affectedTests = scores
        .filter(s => s.issues.some(i =>
          i.description === issue.description &&
          i.severity === issue.severity &&
          i.category === issue.category,
        ))
        .map(s => s.testId)
        .join(', ');

      const ev = issue.evidence.length > 40 ? issue.evidence.substring(0, 40) + '...' : issue.evidence;
      const desc = issue.description.length > 60 ? issue.description.substring(0, 60) + '...' : issue.description;
      sections.push(`| ${issue.severity} | ${issue.category} | ${affectedTests || '(多個)'} | ${desc} | ${ev} |`);
    }
    sections.push('');
  }

  // 6. Common patterns
  sections.push(
    '## 常見問題模式',
    '',
    ...patterns,
    '',
  );

  // 7. Footer
  sections.push(
    '---',
    '',
    `*報告由 Apollo Toolkit eval-reporter 自動產生於 ${now}*`,
    '',
  );

  return sections.join('\n');
}

// --- Report Writing ---

/**
 * Resolve the project root directory (same logic as scorer.ts).
 *
 * Tries:
 *   1. 3 levels up from source path
 *   2. 4 levels up from compiled path
 *   3. Crawl up from process.cwd()
 *
 * @returns Absolute path to the project root
 */
function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Source path: packages/tools/eval/reporter.ts -> 3 levels up
  const sourceCandidate = resolve(__dirname, '..', '..', '..');
  if (existsSync(join(sourceCandidate, 'assets', 'spec'))) {
    return sourceCandidate;
  }

  // Compiled path: packages/tools/eval/dist/reporter.js -> 4 levels up
  const distCandidate = resolve(__dirname, '..', '..', '..', '..');
  if (existsSync(join(distCandidate, 'assets', 'spec'))) {
    return distCandidate;
  }

  // Fallback: crawl up from cwd (max 10 levels)
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'assets', 'spec'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error('無法確定專案根目錄：找不到 assets/spec/ 目錄');
}

/**
 * Write the report content to results/spec/{date}/REPORT.md.
 *
 * Creates the results directory if it does not exist.
 *
 * @param reportContent - Markdown report string
 * @param date - Date string for directory structure
 * @param skillName - Optional skill name (used in filename if provided)
 * @returns Absolute path to the written report file
 */
export function writeReport(
  reportContent: string,
  date: string,
  skillName?: string,
): string {
  const rootDir = getProjectRoot();
  const reportDir = resolve(rootDir, 'results', 'spec', date);

  // Ensure results directory exists
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = join(reportDir, 'REPORT.md');
  writeFileSync(reportPath, reportContent, 'utf-8');

  return reportPath;
}
