/**
 * optimizer.ts -- Evaluation Optimization Engine
 *
 * Extracts issues from scorer-produced score.json files, deduplicates them,
 * generates an optimization plan, and applies FIND/REPLACE-style improvements
 * to SKILL.md files.
 *
 * This is the TypeScript version migrated from scripts/optimize.mjs,
 * providing a modular API for the eval pipeline.
 *
 * Only uses Node.js built-in modules and lib/ modules. No external dependencies.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

import type { ScoreResult } from './scorer.js';
import { getProjectRoot } from './lib/project-root.js';
import type { EnvConfig } from './lib/env-utils.js';
import { callJudgeModelRaw } from './lib/judge-api.js';
import type { Message } from './lib/judge-api.js';
import { promisePool } from './lib/promise-pool.js';

// --- Public Types ---

export interface RawIssue {
  severity: string;
  category: string;
  description: string;
  evidence: string;
  testNo: string;
}

export interface DedupedIssue {
  category: string;
  severity: string;
  frequency: number;
  affectedTests: string[];
  description: string;
  evidence: string[];
  suggestedFix: string;
}

export interface OptimizationPlan {
  date: string;
  generatedAt: string;
  summary: {
    totalScores: number;
    totalIssues: number;
    dedupedIssues: number;
  };
  issues: {
    id: string;
    category: string;
    severity: string;
    frequency: number;
    affectedTests: string[];
    description: string;
    evidence: string[];
    suggestedFix: string;
  }[];
}

// --- Internal Types (pipeline bookkeeping, stripped before public output) ---

interface RawIssueWithKeywords extends RawIssue {
  _descKeywords: Set<string>;
  _evidKeywords: Set<string>;
}

interface DedupedIssueInternal {
  _index: number;
  _cluster: RawIssueWithKeywords[];
  _descKeywords: Set<string>;
  _evidKeywords: Set<string>;
  _suggestedFix?: string;
  category: string;
  severity: string;
  frequency: number;
  affectedTests: string[];
  description: string;
  evidence: string[];
}

// --- Constants ---

/** Severity ranking for consistent sorting. Lower rank = more severe. */
const SEVERITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

/**
 * Common words to filter out in keyword extraction.
 * Preserves the full list from scripts/optimize.mjs.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
  'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them',
  'their', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
  'how', 'if', 'then', 'else',
  'agent', 'model', 'file', 'files', 'issue', 'issues',
  '描述', '問題', '沒有', '無法', '未能', '需要', '應該', '可以',
  '進行', '使用', '處理', '檢查', '確認', '提供', '包含', '存在',
  '因為', '所以', '但是', '而且', '或者', '以及', '關於', '這個',
  '一個', '一些', '所有', '每個',
]);

/** ALLOWED_FILES whitelist for optimization targets. */
const ALLOWED_FILES = [
  'skills/<name>/SKILL.md',
  'skills/<name>/scripts/',
  'skills/<name>/references/',
  'skills/<name>/assets/',
];

// --- Internal Helpers ---

/**
 * Simple English stemmer: strips inflectional suffixes to normalize word forms.
 * Conservative approach: only removes clearly inflectional endings (plurals, tense, gerunds).
 * Keeps minimum stem length of 4 to avoid over-stemming short words.
 *
 * Ported verbatim from scripts/optimize.mjs.
 *
 * @param word - Input word
 * @returns Stemmed word
 */
function simpleStem(word: string): string {
  if (word.length <= 4) return word;

  // Step 1: -ies -> -y (e.g., "dependencies" -> "dependency")
  if (word.endsWith('ies') && word.length > 5) {
    return word.slice(0, -3) + 'y';
  }

  // Step 2: -es -> (only when stem ends in s, x, z, sh, ch per English rule)
  // e.g., "dishes" -> "dish", "matches" -> "match"
  // NOT "templates" -> "template" (that's just -s plural)
  if (word.endsWith('es') && word.length > 5) {
    const stem = word.slice(0, -2);
    const lastChars = stem.slice(-2);
    if ((/[sxz]$/.test(stem) || lastChars === 'sh' || lastChars === 'ch') && stem.length >= 4) {
      return stem;
    }
    // -es preceded by consonant+vowel: also a valid -es suffix (e.g., "tomatoes")
    if (stem.length >= 4 && /[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]o$/.test(stem)) {
      return stem;
    }
    // Fall through to -s check
  }

  // Step 3: -s (plural) - only if result looks like a valid word
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 5) {
    const stem = word.slice(0, -1);
    if (stem.length >= 4) return stem;
  }

  // Step 4: -ing (gerund)
  if (word.endsWith('ing') && word.length > 6) {
    const stem = word.slice(0, -3);
    if (stem.length >= 4) return stem;
  }

  // Step 5: -ed (past tense)
  if (word.endsWith('ed') && word.length > 5) {
    const stem = word.slice(0, -2);
    if (stem.length >= 4) return stem;
  }

  // Step 6: -ly (adverb)
  if (word.endsWith('ly') && word.length > 5) {
    const stem = word.slice(0, -2);
    if (stem.length >= 4) return stem;
  }

  // Step 7: -ment, -ness
  if ((word.endsWith('ment') || word.endsWith('ness')) && word.length > 7) {
    const stem = word.slice(0, -4);
    if (stem.length >= 4) return stem;
  }

  return word;
}

// --- Public Functions ---

/**
 * Validate that a parsed JSON object conforms to the ScoreResult shape.
 * Returns the object unchanged if valid, or null if invalid.
 */
function validateScoreResult(obj: unknown): ScoreResult | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.testId !== 'string') return null;
  if (typeof o.overallScore !== 'number') return null;
  if (!Array.isArray(o.dimensions)) return null;
  if (!Array.isArray(o.issues)) return null;
  return obj as ScoreResult;
}

/**
 * Scan results directory and load all score.json files.
 * Skips missing or corrupt files with a warning.
 *
 * @param date - Date string like "2026-05-28"
 * @param sourceRoot - Optional project root directory; defaults to auto-detected root
 * @returns Array of ScoreResult objects
 */
export async function loadAllScores(date: string, sourceRoot?: string): Promise<ScoreResult[]> {
  const root = sourceRoot ?? getProjectRoot();
  const resultsBase = resolve(root, 'results', 'spec', date);

  if (!existsSync(resultsBase)) {
    console.warn(`Results directory not found: ${resultsBase}`);
    console.warn('Skipping score loading. Run \'apltk eval <skill>\' to generate scores first.');
    return [];
  }

  const entries = await readdir(resultsBase, { withFileTypes: true });
  const scorePromises: Array<Promise<ScoreResult | null>> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('test_')) continue;

    const testNo = entry.name.replace('test_', '');
    const scorePath = join(resultsBase, entry.name, 'score.json');

    if (!existsSync(scorePath)) {
      console.warn(`Warning: No score.json for ${testNo} -- skipped`);
      continue;
    }

    scorePromises.push(
      (async (): Promise<ScoreResult | null> => {
        try {
          const raw = await readFile(scorePath, 'utf-8');
          const parsed = validateScoreResult(JSON.parse(raw));
          if (!parsed) {
            console.warn(`Warning: Corrupt score.json for ${testNo}: validation failed -- skipped`);
            return null;
          }
          return parsed;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`Warning: Corrupt score.json for ${testNo}: ${msg} -- skipped`);
          return null;
        }
      })(),
    );
  }

  const results = await Promise.all(scorePromises);
  return results.filter((r): r is ScoreResult => r !== null);
}

/**
 * Collect all issues from all scores, tagging each with its source testNo.
 *
 * @param scores - Array of ScoreResult objects
 * @returns Array of RawIssue objects
 */
export function extractIssues(scores: ScoreResult[]): RawIssue[] {
  const allIssues: RawIssue[] = [];

  for (const score of scores) {
    if (!score.issues || !Array.isArray(score.issues)) continue;

    for (const issue of score.issues) {
      allIssues.push({
        severity: issue.severity || 'P2',
        category: issue.category || 'other',
        description: issue.description || '',
        evidence: issue.evidence || '',
        testNo: score.testId,
      });
    }
  }

  return allIssues;
}

/**
 * Extract meaningful keywords from text for similarity comparison.
 * Returns a set of normalized word tokens (lowercased, min length 2, stop words removed).
 * Uses basic stemming to normalize word forms for better matching.
 *
 * Ported verbatim from scripts/optimize.mjs.
 *
 * @param text - Input text
 * @returns Set of keyword strings
 */
export function extractKeywords(text: string): Set<string> {
  if (!text || typeof text !== 'string') return new Set();

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t));

  // Apply stemming normalization
  const stemmed = tokens.map(t => {
    // Don't stem short words or Chinese characters
    if (t.length <= 3 || /[一-鿿]/.test(t)) return t;
    return simpleStem(t);
  });

  // Also extract bigrams from stemmed tokens for better phrase matching
  const bigrams: string[] = [];
  for (let i = 0; i < stemmed.length - 1; i++) {
    bigrams.push(`${stemmed[i]} ${stemmed[i + 1]}`);
  }

  return new Set([...stemmed, ...bigrams]);
}

/**
 * Compute Jaccard similarity between two sets.
 *
 * @param setA - First set
 * @param setB - Second set
 * @returns Similarity coefficient in range [0, 1]
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;

  let intersection = 0;
  const union = setA.size + setB.size;

  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
    }
  }

  return intersection / (union - intersection || 1);
}

// --- ALLOWED_FILES Validation ---

/**
 * Check whether a file path is within the allowed optimization targets.
 * Replaces `<name>` placeholders in ALLOWED_FILES with the given skill name.
 *
 * @param filePath - Absolute path to the file to check
 * @param skillName - Skill name used to resolve `<name>` placeholders
 * @returns true if the file path matches an allowed target
 */
export function isAllowedFile(filePath: string, skillName: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of ALLOWED_FILES) {
    const resolved = pattern.replace(/<name>/g, skillName).replace(/\/$/, '');
    if (normalized.includes(resolved)) return true;
  }
  return false;
}

/**
 * Validate the Markdown structure of a SKILL.md file.
 * Checks for: (a) at least one `## ` heading, (b) no unclosed ``` blocks,
 * (c) file is non-empty.
 *
 * @param content - File content to validate
 * @returns Object with valid flag and list of issues found
 */
export function validateMarkdownStructure(content: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!content || content.trim().length === 0) {
    issues.push('File is empty.');
    return { valid: false, issues };
  }

  // (a) At least one ## heading
  if (!/^## /m.test(content)) {
    issues.push('No level-2 heading (## ) found. SKILL.md should have at least one ## section.');
  }

  // (b) No unclosed fenced code blocks
  const fenceMatches = content.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    issues.push('Unclosed fenced code block (odd number of ``` delimiters).');
  }

  return { valid: issues.length === 0, issues };
}

// --- Internal: Dedup Refinement with Judge Model ---

/**
 * Use judge model to refine deduplication by comparing semantic similarity.
 * Groups pairs of deduped issues and asks the judge model if they should be merged.
 * Uses union-find for transitive closure merging.
 *
 * Ported from scripts/optimize.mjs refineDedupWithJudge().
 *
 * @param deduped - Keyword-deduped issues
 * @param env - Environment configuration
 * @returns Refined deduped issues
 */
async function refineDedupWithJudge(
  deduped: DedupedIssueInternal[],
  env: EnvConfig,
): Promise<DedupedIssueInternal[]> {
  // Only call judge model if there are enough issues to potentially merge
  if (deduped.length <= 1) return deduped;

  // Build pairs of potentially similar issues (same category + same severity)
  const pairs: Array<{ a: DedupedIssueInternal; b: DedupedIssueInternal }> = [];
  const byCategory: Record<string, DedupedIssueInternal[]> = {};
  for (const issue of deduped) {
    const cat = issue.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(issue);
  }

  for (const [, group] of Object.entries(byCategory)) {
    if (group.length <= 1) continue;

    // Group by severity to reduce O(n²) pairs: only compare same-severity issues
    const bySeverity: Record<string, DedupedIssueInternal[]> = {};
    for (const issue of group) {
      const sev = issue.severity || 'P2';
      if (!bySeverity[sev]) bySeverity[sev] = [];
      bySeverity[sev].push(issue);
    }

    const MAX_PAIRS_PER_CATEGORY = 100;
    let pairCount = 0;

    for (const [, sevGroup] of Object.entries(bySeverity)) {
      if (sevGroup.length <= 1) continue;
      for (let i = 0; i < sevGroup.length && pairCount < MAX_PAIRS_PER_CATEGORY; i++) {
        for (let j = i + 1; j < sevGroup.length && pairCount < MAX_PAIRS_PER_CATEGORY; j++) {
          pairs.push({ a: sevGroup[i], b: sevGroup[j] });
          pairCount++;
        }
      }
    }
  }

  if (pairs.length === 0) return deduped;

  const judgeConcurrency = env.JUDGE_CONCURRENCY > 0 ? env.JUDGE_CONCURRENCY : 5;

  const comparisonResults = await promisePool(
    pairs,
    async ({ a, b }) => {
      // Quick pre-filter: compute keyword similarity from cached sets, skip if too different
      const aKeys = a._descKeywords;
      const bKeys = b._descKeywords;
      const descSim = jaccardSimilarity(aKeys, bKeys);
      if (descSim < 0.25) return null;

      const prompt = [
        'You are comparing two optimization issues to determine if they describe the same underlying problem.',
        '',
        'Issue A:',
        `  Description: ${a.description}`,
        `  Evidence: ${a.evidence.join?.('; ') || '(none)'}`,
        '',
        'Issue B:',
        `  Description: ${b.description}`,
        `  Evidence: ${b.evidence.join?.('; ') || '(none)'}`,
        '',
        'Reply with exactly one word: "YES" if they describe the same issue, "NO" otherwise.',
      ].join('\n');

      try {
        const { content } = await callJudgeModelRaw(
          [{ role: 'user', content: prompt } as Message],
          env,
        );
        const trimmed = content.trim().toUpperCase();
        return { a, b, shouldMerge: trimmed.startsWith('YES') };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Judge comparison failed for pair: ${msg.split('\n')[0]}`);
        return null;
      }
    },
    judgeConcurrency,
  );

  const comparisons = comparisonResults.filter(Boolean) as Array<{
    a: DedupedIssueInternal;
    b: DedupedIssueInternal;
    shouldMerge: boolean;
  }>;

  // Build merge groups using union-find
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    const px = parent.get(x)!;
    if (px !== x) {
      parent.set(x, find(px));
    }
    return parent.get(x)!;
  };
  const union = (x: number, y: number): void => {
    parent.set(find(x), find(y));
  };

  for (const item of deduped) {
    parent.set(item._index, item._index);
  }

  for (const { a, b, shouldMerge } of comparisons) {
    if (shouldMerge) {
      union(a._index, b._index);
    }
  }

  // Group by root
  const groups = new Map<number, DedupedIssueInternal[]>();
  for (const item of deduped) {
    const root = find(item._index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(item);
  }

  // Merge each group
  const result: DedupedIssueInternal[] = [];
  for (const [, group] of groups) {
    const maxSeverity = group
      .map(i => i.severity)
      .reduce((max, s) => {
        const rank = SEVERITY_RANK;
        return (rank[s] ?? 2) < (rank[max] ?? 2) ? s : max;
      }, 'P2');

    const affectedTests = [...new Set(group.flatMap(i => i.affectedTests))].sort();
    const allEvidence = [...new Set(group.flatMap(i => i.evidence).filter(Boolean))];
    const totalFrequency = group.reduce((sum, i) => sum + i.frequency, 0);

    const merged: DedupedIssueInternal = {
      ...group[0],
      severity: maxSeverity,
      frequency: totalFrequency,
      affectedTests,
      evidence: allEvidence,
    };

    result.push(merged);
  }

  // Re-assign IDs
  result.forEach((item, i) => {
    item._index = i + 1;
  });

  return result;
}

// --- Internal: Template-based Fix Suggestions ---

/**
 * Generate a template-based fix suggestion when judge model is unavailable.
 *
 * Ported from scripts/optimize.mjs generateTemplateSuggestion().
 *
 * @param issue - Issue with category and description
 * @returns Template-based fix suggestion string
 */
function generateTemplateSuggestion(issue: { category: string; description: string; evidence: string[] }): string {
  const desc = issue.description.toLowerCase();

  if (issue.category === 'skill') {
    if (desc.includes('流程') || desc.includes('process') || desc.includes('workflow')) {
      return 'Review the skill workflow steps and add explicit decision points where the agent should stop and verify. Consider adding guard clauses for scenarios described in the failing test cases.';
    }
    if (desc.includes('格式') || desc.includes('format') || desc.includes('template')) {
      return 'Add explicit format requirements in the skill definition. Include concrete examples of expected output format. Strengthen the validation checklist with format-specific checks.';
    }
    if (desc.includes('architecture') || desc.includes('架構') || desc.includes('atlas')) {
      return 'Add clearer instructions for architecture diff generation. Include fallback behavior when atlas data is missing or stale. Strengthen the drift detection threshold guidance.';
    }
    if (desc.includes('scope') || desc.includes('範圍') || desc.includes('邊界')) {
      return 'Clarify the scope boundaries in the skill definition. Add explicit criteria for when this skill should vs. should not be used. Add negative examples to the skill description.';
    }
    if (desc.includes('驗收') || desc.includes('checklist') || desc.includes('verify')) {
      return 'Strengthen the verification checklist with concrete pass/fail criteria. Require the agent to explicitly check each item before delivering. Add self-review prompts.';
    }
    return 'Review the relevant section of the skill definition. Ensure instructions are specific and unambiguous. Add concrete examples showing both correct and incorrect behavior.';
  }

  if (issue.category === 'apltk') {
    if (desc.includes('template') || desc.includes('模板')) {
      return 'Update the template rendering logic to handle edge cases. Review the placeholder substitution code for completeness. Ensure all placeholder patterns are matched.';
    }
    if (desc.includes('error') || desc.includes('錯誤') || desc.includes('message')) {
      return 'Improve error messages to be more specific and actionable. Include contextual information in error output. Add guidance for common failure modes.';
    }
    if (desc.includes('cli') || desc.includes('參數') || desc.includes('flag')) {
      return 'Review the CLI argument parsing logic. Ensure all documented options work correctly. Add validation for mutually exclusive or dependent flags.';
    }
    if (desc.includes('path') || desc.includes('路徑') || desc.includes('directory')) {
      return 'Review path resolution logic. Ensure relative paths are resolved correctly relative to the expected base directory. Add path normalization.';
    }
    return 'Review the relevant apltk tool implementation. Check input validation, error handling, and edge cases. Ensure consistent behavior across all code paths.';
  }

  // Generic fallback for "other" category
  if (desc.includes('超時') || desc.includes('timeout')) {
    return 'Investigate whether the issue is a resource limitation or a code inefficiency. Consider adding timeouts or breaking the task into smaller sub-tasks.';
  }
  if (desc.includes('parse') || desc.includes('解析') || desc.includes('json')) {
    return 'Add robust parsing with fallback handlers. Handle common JSON format variations. Add validation before processing.';
  }

  return 'Investigate the specific test failures and address the root cause. Consider adding guard clauses, better error handling, or clearer documentation depending on the exact nature of the issue.';
}

// --- Public: Deduplication ---

/**
 * Deduplicate issues: group by category, merge similar issues by keyword similarity.
 * Optionally use judge model for semantic similarity if available.
 *
 * Phase 1: Jaccard similarity within category groups (threshold > 0.35).
 * Phase 2 (optional): Judge model semantic similarity refinement via union-find.
 *
 * Ported from scripts/optimize.mjs deduplicateIssues().
 *
 * @param issues - Flat list of tagged issues
 * @param env - Environment configuration
 * @param judgeAvailable - Whether judge model is usable for phase 2 refinement
 * @returns Array of deduplicated DedupedIssue objects
 */
export async function deduplicateIssues(
  issues: RawIssue[],
  env: EnvConfig,
  judgeAvailable: boolean,
): Promise<DedupedIssue[]> {
  if (issues.length === 0) return [];

  // Pre-compute keyword sets for each issue
  const issueKeys: RawIssueWithKeywords[] = issues.map(issue => ({
    ...issue,
    _descKeywords: extractKeywords(issue.description),
    _evidKeywords: extractKeywords(issue.evidence),
  }));

  // Group by category
  const categoryGroups: Record<string, RawIssueWithKeywords[]> = {};
  for (const issue of issueKeys) {
    const cat = issue.category || 'other';
    if (!categoryGroups[cat]) {
      categoryGroups[cat] = [];
    }
    categoryGroups[cat].push(issue);
  }

  // Within each category, merge similar issues
  const deduped: DedupedIssueInternal[] = [];
  let optIdCounter = 0;

  for (const [category, groupIssues] of Object.entries(categoryGroups)) {
    const used = new Set<number>();
    const merged: DedupedIssueInternal[] = [];

    for (let i = 0; i < groupIssues.length; i++) {
      if (used.has(i)) continue;

      const base = groupIssues[i];
      const cluster: RawIssueWithKeywords[] = [base];
      used.add(i);

      // Find similar issues
      for (let j = i + 1; j < groupIssues.length; j++) {
        if (used.has(j)) continue;

        const candidate = groupIssues[j];

        // Check description similarity
        const descSim = jaccardSimilarity(base._descKeywords, candidate._descKeywords);

        // Check evidence similarity
        const evidSim = jaccardSimilarity(base._evidKeywords, candidate._evidKeywords);

        // Merge if description similarity > 0.35 OR they share trace evidence
        // (threshold accounts for stemming normalization and synonym variation)
        if (descSim > 0.35 || (base.evidence && candidate.evidence && evidSim > 0.4)) {
          cluster.push(candidate);
          used.add(j);
        }
      }

      // Merge cluster into a single deduped issue
      const maxSeverity = cluster
        .map(i => i.severity)
        .reduce((max, s) => {
          const rank = SEVERITY_RANK;
          return (rank[s] ?? 2) < (rank[max] ?? 2) ? s : max;
        }, 'P2');

      const affectedTests = [...new Set(cluster.map(i => i.testNo))].sort();
      const allEvidence = [...new Set(cluster.map(i => i.evidence).filter(Boolean))];

      // Use the longest/most descriptive description from the cluster
      const bestDescription = cluster
        .map(i => i.description)
        .reduce((best, d) => (d.length > best.length ? d : best), '');

      optIdCounter++;
      merged.push({
        _index: optIdCounter,
        _cluster: cluster,
        _descKeywords: extractKeywords(bestDescription),
        _evidKeywords: new Set(
          cluster.flatMap(i => [...i._evidKeywords]),
        ),
        category,
        severity: maxSeverity,
        frequency: cluster.length,
        affectedTests,
        description: bestDescription,
        evidence: allEvidence,
      });
    }

    deduped.push(...merged);
  }

  // Optionally use judge model for semantic similarity refinement
  if (judgeAvailable && deduped.length > 0) {
    try {
      console.log('Using judge model for semantic similarity refinement...');
      const refined = await refineDedupWithJudge(deduped, env);
      return refined.map(item => ({
        category: item.category,
        severity: item.severity,
        frequency: item.frequency,
        affectedTests: item.affectedTests,
        description: item.description,
        evidence: item.evidence,
        suggestedFix: item._suggestedFix ?? '',
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Judge model dedup refinement failed: ${msg}`);
      console.warn('Falling back to keyword-based dedup results.');
    }
  }

  return deduped.map(item => ({
    category: item.category,
    severity: item.severity,
    frequency: item.frequency,
    affectedTests: item.affectedTests,
    description: item.description,
    evidence: item.evidence,
    suggestedFix: '',
  }));
}

// --- Public: Generate Suggested Fix ---

/**
 * Generate a specific fix suggestion for a deduped issue.
 * Uses judge model if available, otherwise generates a template suggestion.
 *
 * Ported from scripts/optimize.mjs generateSuggestedFix().
 *
 * @param issue - Deduped issue
 * @param env - Environment configuration
 * @param judgeAvailable - Whether judge model is usable
 * @returns Fix suggestion string
 */
export async function generateSuggestedFix(
  issue: DedupedIssue,
  env: EnvConfig,
  judgeAvailable: boolean,
): Promise<string> {
  if (judgeAvailable) {
    try {
      const prompt = [
        'You are an expert code reviewer. Given an optimization issue found by an LLM-as-Judge scorer,',
        'generate a specific, actionable fix suggestion.',
        '',
        `Issue category: ${issue.category}`,
        `Severity: ${issue.severity}`,
        `Description: ${issue.description}`,
        `Evidence from test traces: ${issue.evidence.join('; ') || '(none)'}`,
        `Affected tests (${issue.frequency} total): ${issue.affectedTests.slice(0, 10).join(', ')}`,
        '',
        'Provide a specific fix suggestion in 2-4 sentences. Focus on:',
        '1. What exactly needs to change',
        '2. Where the change should be applied',
        '3. What the expected improvement would be',
        '',
        'Reply with just the fix suggestion text, no extra formatting.',
      ].join('\n');

      const { content } = await callJudgeModelRaw(
        [{ role: 'user', content: prompt } as Message],
        env,
      );

      return content.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Judge model fix suggestion failed: ${msg.split('\n')[0]}`);
      // Fall through to template
    }
  }

  // Template-based fallback suggestion
  return generateTemplateSuggestion(issue);
}

// --- Public: Generate Optimization Plan ---

/**
 * Generate the optimization plan and write it to disk.
 * Issues are sorted by severity (P0 > P1 > P2), then by frequency descending.
 * The plan is written to results/spec/{date}/optimization-plan.json.
 *
 * Ported from scripts/optimize.mjs generateOptimizationPlan().
 *
 * @param issues - Deduped issues with suggestedFix populated
 * @param date - Date string for directory structure
 * @param scores - Array of all ScoreResult objects (for summary statistics)
 * @returns OptimizationPlan object (also persisted to disk)
 */
export function generateOptimizationPlan(
  issues: DedupedIssue[],
  date: string,
  scores: ScoreResult[],
): OptimizationPlan {
  // Sort: P0 first, then P1, then P2. Within same severity, sort by frequency descending.
  const sortedIssues = [...issues].sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return b.frequency - a.frequency;
  });

  // Assign stable IDs based on sorted order
  const planIssues = sortedIssues.map((issue, i) => ({
    id: `OPT-${String(i + 1).padStart(3, '0')}`,
    category: issue.category,
    severity: issue.severity,
    frequency: issue.frequency,
    affectedTests: issue.affectedTests,
    description: issue.description,
    evidence: issue.evidence,
    suggestedFix: issue.suggestedFix || '',
  }));

  const totalIssues = scores.reduce((sum, score) => {
    return sum + (Array.isArray(score.issues) ? score.issues.length : 0);
  }, 0);

  const plan: OptimizationPlan = {
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalScores: scores.length,
      totalIssues,
      dedupedIssues: planIssues.length,
    },
    issues: planIssues,
  };

  // Write plan to disk
  const root = getProjectRoot();
  const resultsDir = resolve(root, 'results', 'spec', date);
  mkdirSync(resultsDir, { recursive: true });

  const planPath = join(resultsDir, 'optimization-plan.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
  console.log(`Optimization plan written: ${planPath}`);

  return plan;
}

// --- SKILL.md Optimization (Internal Helpers) ---

/**
 * Build the prompt for SKILL.md optimization using judge model.
 *
 * Ported from scripts/optimize.mjs buildSkillOptimizationPrompt().
 *
 * @param skillIssues - Filtered skill-category issues from the optimization plan
 * @param currentContent - Current SKILL.md content
 * @returns Judge model prompt string
 */
function buildSkillOptimizationPrompt(
  skillIssues: OptimizationPlan['issues'],
  currentContent: string,
): string {
  const issuesText = skillIssues
    .map(i =>
      `- [${i.severity}] ${i.description}\n  Evidence: ${i.evidence.join('; ') || '(none)'}\n  Suggested: ${i.suggestedFix || '(none)'}`,
    )
    .join('\n\n');

  return [
    'You are an expert at improving AI agent skill definitions. A spec-writing skill has been tested',
    'and the following issues were identified by an LLM-as-Judge scorer.',
    '',
    '## Issues to Fix',
    issuesText,
    '',
    '## Current SKILL.md Content',
    '```markdown',
    currentContent,
    '```',
    '',
    '## Instructions',
    'Suggest targeted improvements to the SKILL.md that address the identified issues.',
    '',
    'Critical constraints:',
    '1. ONLY modify sections relevant to the identified issues -- do NOT rewrite the entire file',
    '2. PRESERVE the frontmatter format (YAML between --- delimiters) exactly as-is',
    '3. Do NOT introduce hallucinated guidance or procedures not supported by the actual codebase',
    '4. Keep existing working procedures intact; only enhance weak spots',
    '5. Use the same language style (Traditional Chinese for descriptions, English for technical terms)',
    '',
    'Output format: Provide your suggested changes as specific edit instructions.',
    'For each change, specify:',
    '- The section header or line content to find',
    '- What to replace it with',
    '- The rationale linking back to specific issues',
    '',
    'If you suggest adding new content, specify exactly WHERE to insert it (after which section/line).',
    '',
    'Be conservative: only fix confirmed problems. If uncertain, flag it rather than guessing.',
  ].join('\n');
}

/**
 * Apply judge model suggestions to SKILL.md content.
 * Attempts to parse structured edit instructions from the judge output,
 * falling back to appending suggestions as comments if parsing fails.
 *
 * Ported from scripts/optimize.mjs applySkillChanges().
 *
 * @param currentContent - Current SKILL.md content
 * @param judgeOutput - Raw judge model output with suggested changes
 * @returns Object containing modified content and array of conflicts (unmatched FIND patterns)
 */
function applySkillChanges(
  currentContent: string,
  judgeOutput: string,
): { content: string; conflicts: Array<{find: string; replace: string}> } {
  // Attempt to extract structured edits from judge output
  // Look for patterns like "FIND: ... REPLACE WITH: ..." or "AFTER: ... INSERT: ..."
  const findReplacePattern = /(?:FIND|查找|搜尋)[:\s]*\n?```(?:markdown)?\n([\s\S]*?)\n```\s*\n(?:REPLACE WITH|替換為|取代為)[:\s]*\n?```(?:markdown)?\n([\s\S]*?)\n```/gi;

  let modifiedContent = currentContent;
  let appliedCount = 0;
  const conflicts: Array<{find: string; replace: string}> = [];

  let match: RegExpExecArray | null;
  while ((match = findReplacePattern.exec(judgeOutput)) !== null) {
    const findText = match[1].trim();
    const replaceText = match[2].trim();

    if (findText && modifiedContent.includes(findText)) {
      modifiedContent = modifiedContent.replace(findText, replaceText);
      appliedCount++;
    } else if (findText) {
      // Track unmatched FIND patterns as conflicts
      conflicts.push({ find: findText, replace: replaceText });
    }
  }

  if (appliedCount > 0) {
    console.log(`Applied ${appliedCount} structured edit(s) from judge model.`);
    if (conflicts.length > 0) {
      console.warn(`${conflicts.length} FIND pattern(s) had no match in the current content.`);
    }
    return { content: modifiedContent, conflicts };
  }

  // If no structured edits found, try parsing markdown code blocks
  // Look for a complete replacement (should be rare and explicit)
  const fullReplacement = judgeOutput.match(/```markdown\n([\s\S]*?)\n```\n*(?:END|$)/);
  if (fullReplacement) {
    const newContent = fullReplacement[1].trim();
    const newHasFrontmatter = newContent.startsWith('---');
    if (newHasFrontmatter) {
      console.log('Applied full content replacement from judge model.');
      return { content: newContent, conflicts };
    }
  }

  // Fallback: prepend the judge suggestions as a comment at the top of the file
  // (after frontmatter) -- this is a conservative fallback for manual review
  console.warn('Could not parse structured edits from judge output. No changes applied.');
  console.warn('Review the patch file for manual application.');

  return { content: currentContent, conflicts };
}

/**
 * Generate template-based SKILL.md change suggestions when judge model is unavailable.
 *
 * Ported from scripts/optimize.mjs generateSkillTemplateChanges().
 *
 * @param skillIssues - Filtered skill-category issues from the optimization plan
 * @returns Template suggestion string
 */
function generateSkillTemplateChanges(
  skillIssues: OptimizationPlan['issues'],
): string {
  const lines: string[] = [];
  lines.push('The following sections may need attention based on identified issues:');
  lines.push('');

  for (const issue of skillIssues) {
    lines.push(`### ${issue.severity}: ${issue.description}`);
    lines.push('');

    // Map issue descriptions to likely SKILL.md sections
    const desc = issue.description.toLowerCase();

    if (desc.includes('流程') || desc.includes('process') || desc.includes('步驟')) {
      lines.push('**Likely affected section**: "工作流程" (Workflow)');
      lines.push('Consider adding decision points, guard clauses, or explicit verification steps.');
      lines.push('Add clear "when to do X vs. when to skip X" guidance.');
    } else if (desc.includes('格式') || desc.includes('format') || desc.includes('輸出')) {
      lines.push('**Likely affected section**: "驗收條件" (Acceptance Criteria)');
      lines.push('Specify exact output format expectations. Add format validation steps.');
    } else if (desc.includes('architecture') || desc.includes('架構') || desc.includes('diff')) {
      lines.push('**Likely affected section**: Step 7 (architecture diff)');
      lines.push('Add instructions for handling missing/stale atlas data.');
    } else if (desc.includes('scope') || desc.includes('範圍') || desc.includes('邊界')) {
      lines.push('**Likely affected section**: "目標" (Goal) and description frontmatter');
      lines.push('Add explicit scoping rules. Clarify when the skill should NOT be used.');
    } else {
      lines.push('Review the full SKILL.md for sections related to this issue.');
    }

    lines.push('');
    lines.push(`**Suggested Fix**: ${issue.suggestedFix || 'Review and adjust based on test evidence.'}`);
    lines.push('');
  }

  return lines.join('\n');
}

// --- Public: SKILL.md Optimization ---

/**
 * Optimize SKILL.md content based on identified issues in the optimization plan.
 *
 * Workflow:
 * 1. Read current SKILL.md content
 * 2. Backup to .bak (in real mode)
 * 3. Judge model generates FIND/REPLACE suggestions (or template fallback)
 * 4. Apply changes
 * 5. Validate frontmatter with `apltk validate-skill-frontmatter`
 * 6. Revert backup on validation failure
 *
 * In dry-run mode, only writes the patch to skill-optimization-patch.md.
 *
 * Ported from scripts/optimize.mjs optimizeSkillMd().
 *
 * @param plan - Optimization plan with issues to fix
 * @param skillMdPath - Absolute path to SKILL.md file
 * @param env - Environment configuration
 * @param dryRun - If true, only write patch file; if false, apply changes to the original file
 * @param date - Date string for output directory
 * @param judgeAvailable - Whether judge model is usable for generating suggestions
 * @returns Result with success status and message
 */
export async function optimizeSkillMd(
  plan: OptimizationPlan,
  skillMdPath: string,
  env: EnvConfig,
  dryRun: boolean,
  date: string,
  judgeAvailable: boolean,
): Promise<{ success: boolean; message: string }> {
  const skillIssues = plan.issues.filter(i => i.category === 'skill');

  if (skillIssues.length === 0) {
    return { success: true, message: 'No skill issues found. Skipping SKILL.md optimization.' };
  }

  console.log(`\n=== Optimizing SKILL.md (${skillIssues.length} issues) ===`);

  // ALLOWED_FILES check (FIX-09): verify the target path is within allowed ranges
  const skillName = skillMdPath.split('/').pop()?.replace('/SKILL.md', '') || '';
  const resolvedSkillName = skillMdPath.includes('/skills/')
    ? skillMdPath.split('/skills/')[1]?.split('/')[0] || skillName
    : skillName;
  if (!isAllowedFile(skillMdPath, resolvedSkillName)) {
    return {
      success: false,
      message: `File is not in an allowed optimization target: ${skillMdPath}. Allowed patterns: ${ALLOWED_FILES.join(', ')}`,
    };
  }

  // Read current SKILL.md
  let currentContent: string;
  try {
    currentContent = readFileSync(skillMdPath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Cannot read SKILL.md at ${skillMdPath}: ${msg}` };
  }

  // Markdown structure validation (FIX-10)
  const mdValidation = validateMarkdownStructure(currentContent);
  if (!mdValidation.valid) {
    const issuesStr = mdValidation.issues.join('; ');
    console.warn(`SKILL.md structure validation failed: ${issuesStr}`);
    if (!dryRun) {
      return {
        success: false,
        message: `Markdown structure validation failed: ${issuesStr}`,
      };
    }
  }

  if (dryRun || !judgeAvailable) {
    // Build a detailed suggestions document
    const patchLines: string[] = [
      '# SKILL.md Optimization Suggestions',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Source: ${skillMdPath}`,
      `Issues analyzed: ${skillIssues.length}`,
      '',
      '---',
      '',
      '## Identified Issues',
      '',
    ];

    for (const issue of skillIssues) {
      patchLines.push(`### ${issue.id}: ${issue.severity} - ${issue.description.substring(0, 120)}`);
      patchLines.push('');
      patchLines.push(`- **Frequency**: ${issue.frequency} tests affected`);
      patchLines.push(`- **Affected Tests**: ${issue.affectedTests.join(', ')}`);
      patchLines.push(`- **Evidence**: ${issue.evidence.join('; ') || '(none)'}`);
      patchLines.push(`- **Suggested Fix**: ${issue.suggestedFix || '(none)'}`);
      patchLines.push('');
    }

    if (judgeAvailable) {
      // Use judge model to generate detailed fix suggestions
      try {
        patchLines.push('---');
        patchLines.push('');
        patchLines.push('## Judge Model Suggested Changes');
        patchLines.push('');

        const judgePrompt = buildSkillOptimizationPrompt(skillIssues, currentContent);
        const { content } = await callJudgeModelRaw(
          [{ role: 'user', content: judgePrompt } as Message],
          env,
        );

        patchLines.push(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        patchLines.push(`Judge model call failed: ${msg}`);
        patchLines.push('');
        patchLines.push('## Template-Based Suggestions');
        patchLines.push('');
        patchLines.push(generateSkillTemplateChanges(skillIssues));
      }
    } else {
      patchLines.push('---');
      patchLines.push('');
      patchLines.push('## Template-Based Suggestions');
      patchLines.push('');
      patchLines.push(generateSkillTemplateChanges(skillIssues));
    }

    const root = getProjectRoot();
    const resultsDir = resolve(root, 'results', 'spec', date);
    mkdirSync(resultsDir, { recursive: true });
    const patchPath = join(resultsDir, 'skill-optimization-patch.md');
    writeFileSync(patchPath, patchLines.join('\n'), 'utf-8');
    console.log(`Skill optimization patch written: ${patchPath}`);

    return {
      success: true,
      message: `Dry-run: patch written to ${patchPath}`,
    };
  }

  // Real mode: apply changes
  // 1. Backup
  const bakPath = skillMdPath + '.bak';
  copyFileSync(skillMdPath, bakPath);
  console.log(`Backup created: ${bakPath}`);

  // 2. Get judge model suggestions
  try {
    const judgePrompt = buildSkillOptimizationPrompt(skillIssues, currentContent);
    const { content } = await callJudgeModelRaw(
      [{ role: 'user', content: judgePrompt } as Message],
      env,
    );

    // Parse the judge's suggested changes
    const { content: newContent, conflicts } = applySkillChanges(currentContent, content);

    // Report conflicts (FIX-12): unmatched FIND patterns
    if (conflicts.length > 0) {
      console.warn(`Found ${conflicts.length} unmatched FIND pattern(s):`);
      for (const c of conflicts) {
        console.warn(`  - FIND pattern not matched: "${c.find.substring(0, 80)}..."`);
      }
    }

    // 3. Write updated SKILL.md
    writeFileSync(skillMdPath, newContent, 'utf-8');
    console.log(`SKILL.md updated: ${skillMdPath}`);

    // 4. Validate frontmatter
    try {
      const root = getProjectRoot();
      execSync('node dist/bin/apollo-toolkit.js validate-skill-frontmatter', {
        cwd: root,
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log('Frontmatter validation: PASSED');
    } catch (valErr) {
      const errorMsg = valErr instanceof Error ? valErr.message : String(valErr);
      console.error('Frontmatter validation FAILED. Restoring backup...');
      copyFileSync(bakPath, skillMdPath);
      return {
        success: false,
        message: `Frontmatter validation failed. Backup restored from ${bakPath}. Error: ${errorMsg}`,
      };
    }

    return { success: true, message: `SKILL.md optimized successfully. Backup: ${bakPath}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`SKILL.md optimization failed: ${msg}`);
    // Restore backup
    copyFileSync(bakPath, skillMdPath);
    console.log(`Backup restored from ${bakPath}`);
    return { success: false, message: `Optimization failed: ${msg}. Backup restored.` };
  }
}
