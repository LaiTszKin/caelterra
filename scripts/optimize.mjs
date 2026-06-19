#!/usr/bin/env node

/**
 * optimize.mjs -- Complete optimization pipeline
 *
 * 從測試評分結果中提取 issue、去重、生成優化計劃，並自動優化 SKILL.md 和 apltk 工具。
 *
 * CLI 使用方式：
 *   node scripts/optimize.mjs [date] [--dry-run] [--plan-only]
 *
 * date 預設值: "2026-05-28"
 * --dry-run: 僅產生修補檔案，不實際修改原始碼
 * --plan-only: 僅產生優化計劃，不執行優化
 *
 * 產出物：
 *   results/spec/{date}/optimization-plan.json               優化計劃
 *   results/spec/{date}/skill-optimization-patch.md          SKILL.md 修補 (dry-run)
 *   results/spec/{date}/apltk-optimization-patch.md          apltk 修補 (dry-run)
 *
 * 僅使用 Node.js 內建模組。
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

const __dirname = new URL('.', import.meta.url).pathname;
const ROOT_DIR = resolve(__dirname, '..');

/** Severity ranking for consistent sorting */
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2 };

// --- Common words to filter out in keyword extraction ---
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'if',
  'then',
  'else',
  'agent',
  'model',
  'file',
  'files',
  'issue',
  'issues',
  '描述',
  '問題',
  '沒有',
  '無法',
  '未能',
  '需要',
  '應該',
  '可以',
  '進行',
  '使用',
  '處理',
  '檢查',
  '確認',
  '提供',
  '包含',
  '存在',
  '因為',
  '所以',
  '但是',
  '而且',
  '或者',
  '以及',
  '關於',
  '這個',
  '一個',
  '一些',
  '所有',
  '每個',
]);

/**
 * Simple English stemmer: strips inflectional suffixes to normalize word forms.
 * Conservative approach: only removes clearly inflectional endings (plurals, tense, gerunds).
 * Keeps minimum stem length of 4 to avoid over-stemming short words.
 *
 * @param {string} word
 * @returns {string} stemmed word
 */
function simpleStem(word) {
  if (word.length <= 4) return word;

  // Step 1: -ies → -y (e.g., "dependencies" → "dependency")
  if (word.endsWith('ies') && word.length > 5) {
    return word.slice(0, -3) + 'y';
  }

  // Step 2: -es → (only when stem ends in s, x, z, sh, ch per English rule)
  // e.g., "dishes" → "dish", "matches" → "match"
  // NOT "templates" → "template" (that's just -s plural)
  if (word.endsWith('es') && word.length > 5) {
    const stem = word.slice(0, -2);
    const lastChars = stem.slice(-2);
    if (
      (/[sxz]$/.test(stem) || lastChars === 'sh' || lastChars === 'ch') &&
      stem.length >= 4
    ) {
      return stem;
    }
    // -es preceded by consonant+vowel: also a valid -es suffix (e.g., "tomatoes")
    if (
      stem.length >= 4 &&
      /[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]o$/.test(stem)
    ) {
      return stem;
    }
    // Fall through to -s check
  }

  // Step 3: -s (plural) - only if result looks like a valid word
  if (
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('us') &&
    word.length > 5
  ) {
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

/**
 * Extract meaningful keywords from text for similarity comparison.
 * Returns a set of normalized word tokens (lowercased, min length 2, stop words removed).
 * Uses basic stemming to normalize word forms for better matching.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return new Set();

  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  // Apply stemming normalization
  const stemmed = tokens.map((t) => {
    // Don't stem short words or Chinese characters
    if (t.length <= 3 || /[一-鿿]/.test(t)) return t;
    return simpleStem(t);
  });

  // Also extract bigrams from stemmed tokens for better phrase matching
  const bigrams = [];
  for (let i = 0; i < stemmed.length - 1; i++) {
    bigrams.push(`${stemmed[i]} ${stemmed[i + 1]}`);
  }

  return new Set([...stemmed, ...bigrams]);
}

/**
 * Compute Jaccard similarity between two sets.
 *
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} similarity coefficient (0-1)
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;

  let intersection = 0;
  let union = setA.size + setB.size;

  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
    }
  }

  return intersection / (union - intersection || 1);
}

/**
 * Call the judge model and return both raw result and parsed content.
 * Thin wrapper around the shared callJudgeModel that preserves the {result, content} interface
 * used by optimize.mjs.
 */
async function callJudgeModelWithRaw(messages, env) {
  const url = `${env.JUDGE_BASE_URL}/v1/chat/completions`;

  const body = {
    model: env.JUDGE_MODEL,
    messages,
    stream: false,
  };

  if (env.JUDGE_REASONING_EFFORT) {
    body.reasoning_effort = env.JUDGE_REASONING_EFFORT;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.JUDGE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => '(unable to read error body)');
    throw new Error(`Judge API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Judge model response has no content');
  }

  return { result, content };
}

// (parseJudgeOutput is imported from shared lib/judge-api.mjs; parseJudgeJSON alias removed)

// --- Task 1: Score aggregation and deduplication ---

/**
 * Scan results directory and load all score.json files.
 * Skips missing/corrupt files with a warning.
 *
 * @param {string} date - date string like "2026-05-28"
 * @returns {Array<{testNo: string, score: object}>}
 */
function loadAllScores(date) {
  const resultsBase = resolve(ROOT_DIR, 'results', 'spec', date);

  if (!existsSync(resultsBase)) {
    console.warn(`Results directory not found: ${resultsBase}`);
    console.warn(
      'Skipping score loading. Run run-evals.mjs and score.mjs first.',
    );
    return [];
  }

  const entries = readdirSync(resultsBase, { withFileTypes: true });
  const allScores = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('test_')) continue;

    const testNo = entry.name.replace('test_', '');
    const scorePath = join(resultsBase, entry.name, 'score.json');

    if (!existsSync(scorePath)) {
      console.warn(`Warning: No score.json for ${testNo} -- skipped`);
      continue;
    }

    try {
      const raw = readFileSync(scorePath, 'utf-8');
      const score = JSON.parse(raw);
      allScores.push({ testNo, score });
    } catch (err) {
      console.warn(
        `Warning: Corrupt score.json for ${testNo}: ${err.message} -- skipped`,
      );
    }
  }

  return allScores;
}

/**
 * Collect all issues from all scores, tagging each with its source testNo.
 *
 * @param {Array<{testNo: string, score: object}>} allScores
 * @returns {Array<{severity: string, category: string, description: string, evidence: string, testNo: string}>}
 */
function extractIssues(allScores) {
  const allIssues = [];

  for (const { testNo, score } of allScores) {
    if (!score.issues || !Array.isArray(score.issues)) continue;

    for (const issue of score.issues) {
      allIssues.push({
        severity: issue.severity || 'P2',
        category: issue.category || 'other',
        description: issue.description || '',
        evidence: issue.evidence || '',
        testNo,
      });
    }
  }

  return allIssues;
}

/**
 * Deduplicate issues: group by category, merge similar issues by keyword similarity.
 * Optionally use judge model for semantic similarity if available.
 *
 * @param {Array<object>} issues - flat list of tagged issues
 * @param {object} env - environment variables
 * @param {boolean} [judgeAvailable] - whether judge model is usable
 * @returns {Promise<Array<object>>} deduped issues
 */
async function deduplicateIssues(issues, env, judgeAvailable) {
  if (issues.length === 0) return [];

  // Pre-compute keyword sets for each issue
  const issueKeys = issues.map((issue) => {
    const descWords = extractKeywords(issue.description);
    const evidWords = extractKeywords(issue.evidence);
    return {
      ...issue,
      _descKeywords: descWords,
      _evidKeywords: evidWords,
    };
  });

  // Group by category
  const categoryGroups = {};
  for (const issue of issueKeys) {
    const cat = issue.category || 'other';
    if (!categoryGroups[cat]) {
      categoryGroups[cat] = [];
    }
    categoryGroups[cat].push(issue);
  }

  // Within each category, merge similar issues
  const deduped = [];
  let optIdCounter = 0;

  for (const [category, groupIssues] of Object.entries(categoryGroups)) {
    const used = new Set();
    const merged = [];

    for (let i = 0; i < groupIssues.length; i++) {
      if (used.has(i)) continue;

      const base = groupIssues[i];
      const cluster = [base];
      used.add(i);

      // Find similar issues
      for (let j = i + 1; j < groupIssues.length; j++) {
        if (used.has(j)) continue;

        const candidate = groupIssues[j];

        // Check description similarity
        const descSim = jaccardSimilarity(
          base._descKeywords,
          candidate._descKeywords,
        );

        // Check evidence similarity (same trace reference)
        const evidSim = jaccardSimilarity(
          base._evidKeywords,
          candidate._evidKeywords,
        );

        // Merge if description similarity > 0.35 OR they share trace evidence
        // (threshold accounts for stemming normalization and synonym variation)
        if (
          descSim > 0.35 ||
          (base.evidence && candidate.evidence && evidSim > 0.4)
        ) {
          cluster.push(candidate);
          used.add(j);
        }
      }

      // Merge cluster into a single deduped issue
      const maxSeverity = cluster
        .map((i) => i.severity)
        .reduce((max, s) => {
          const rank = SEVERITY_RANK;
          return (rank[s] ?? 2) < (rank[max] ?? 2) ? s : max;
        }, 'P2');

      const affectedTests = [...new Set(cluster.map((i) => i.testNo))].sort();
      const allEvidence = [
        ...new Set(cluster.map((i) => i.evidence).filter(Boolean)),
      ];

      // Use the longest/most descriptive description from the cluster
      const bestDescription = cluster
        .map((i) => i.description)
        .reduce((best, d) => (d.length > best.length ? d : best), '');

      optIdCounter++;
      merged.push({
        _index: optIdCounter,
        category,
        severity: maxSeverity,
        frequency: cluster.length,
        affectedTests,
        description: bestDescription,
        evidence: allEvidence,
        _cluster: cluster,
      });
    }

    deduped.push(...merged);
  }

  // Optionally use judge model for semantic similarity refinement
  if (judgeAvailable && deduped.length > 0) {
    try {
      console.log('Using judge model for semantic similarity refinement...');
      const refined = await refineDedupWithJudge(deduped, env);
      return refined;
    } catch (err) {
      console.warn(`Judge model dedup refinement failed: ${err.message}`);
      console.warn('Falling back to keyword-based dedup results.');
    }
  }

  return deduped;
}

/**
 * Use judge model to refine deduplication by comparing semantic similarity.
 * Groups pairs of deduped issues and asks the judge model if they should be merged.
 *
 * @param {Array<object>} deduped - keyword-deduped issues
 * @param {object} env
 * @returns {Promise<Array<object>>}
 */
async function refineDedupWithJudge(deduped, env) {
  // Only call judge model if there are enough issues to potentially merge
  if (deduped.length <= 1) return deduped;

  // Build pairs of potentially similar issues (same category)
  const pairs = [];
  const byCategory = {};
  for (const issue of deduped) {
    const cat = issue.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(issue);
  }

  for (const [, group] of Object.entries(byCategory)) {
    if (group.length <= 1) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs.push({ a: group[i], b: group[j] });
      }
    }
  }

  if (pairs.length === 0) return deduped;

  // Send to judge model for pair comparison (parallelized with promise pool)
  const { promisePool } = await import('./lib/promise-pool.mjs');
  const judgeConcurrency = env.JUDGE_CONCURRENCY
    ? parseInt(env.JUDGE_CONCURRENCY, 10)
    : 5;

  const comparisonResults = await promisePool(
    pairs,
    async ({ a, b }) => {
      // Quick pre-filter: compute keyword similarity on-the-fly, skip if too different
      const aKeys = extractKeywords(a.description);
      const bKeys = extractKeywords(b.description);
      const descSim = jaccardSimilarity(aKeys, bKeys);
      if (descSim < 0.25) return null;

      const prompt = [
        'You are comparing two optimization issues to determine if they describe the same underlying problem.',
        '',
        'Issue A:',
        `  Description: ${a.description}`,
        `  Evidence: ${a.evidence?.join?.('; ') || '(none)'}`,
        '',
        'Issue B:',
        `  Description: ${b.description}`,
        `  Evidence: ${b.evidence?.join?.('; ') || '(none)'}`,
        '',
        'Reply with exactly one word: "YES" if they describe the same issue, "NO" otherwise.',
      ].join('\n');

      try {
        const { content } = await callJudgeModelWithRaw(
          [{ role: 'user', content: prompt }],
          env,
        );
        const trimmed = content.trim().toUpperCase();
        return { a, b, shouldMerge: trimmed.startsWith('YES') };
      } catch (err) {
        console.warn(
          `Judge comparison failed for pair: ${err.message.split('\n')[0]}`,
        );
        return null;
      }
    },
    judgeConcurrency,
  );

  const comparisons = comparisonResults.filter(Boolean);

  // Build merge groups using union-find
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  };
  const union = (x, y) => {
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
  const groups = new Map();
  for (const item of deduped) {
    const root = find(item._index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  }

  // Merge each group
  const result = [];
  for (const [, group] of groups) {
    const maxSeverity = group
      .map((i) => i.severity)
      .reduce((max, s) => {
        const rank = { P0: 0, P1: 1, P2: 2 };
        return (rank[s] ?? 2) < (rank[max] ?? 2) ? s : max;
      }, 'P2');

    const affectedTests = [
      ...new Set(group.flatMap((i) => i.affectedTests)),
    ].sort();
    const allEvidence = [
      ...new Set(group.flatMap((i) => i.evidence).filter(Boolean)),
    ];
    const totalFrequency = group.reduce((sum, i) => sum + i.frequency, 0);

    const merged = {
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

/**
 * Generate a specific fix suggestion for a deduped issue.
 * Uses judge model if available, otherwise generates a template suggestion.
 *
 * @param {object} issue - deduped issue
 * @param {object} env - environment variables
 * @param {boolean} judgeAvailable
 * @returns {Promise<string>}
 */
async function generateSuggestedFix(issue, env, judgeAvailable) {
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

      const { content } = await callJudgeModelWithRaw(
        [{ role: 'user', content: prompt }],
        env,
      );

      return content.trim();
    } catch (err) {
      console.warn(
        `Judge model fix suggestion failed: ${err.message.split('\n')[0]}`,
      );
      // Fall through to template
    }
  }

  // Template-based fallback suggestion
  return generateTemplateSuggestion(issue);
}

/**
 * Generate a template-based fix suggestion when judge model is unavailable.
 *
 * @param {object} issue
 * @returns {string}
 */
function generateTemplateSuggestion(issue) {
  const desc = issue.description.toLowerCase();

  if (issue.category === 'skill') {
    if (
      desc.includes('流程') ||
      desc.includes('process') ||
      desc.includes('workflow')
    ) {
      return 'Review the skill workflow steps and add explicit decision points where the agent should stop and verify. Consider adding guard clauses for scenarios described in the failing test cases.';
    }
    if (
      desc.includes('格式') ||
      desc.includes('format') ||
      desc.includes('template')
    ) {
      return 'Add explicit format requirements in the skill definition. Include concrete examples of expected output format. Strengthen the validation checklist with format-specific checks.';
    }
    if (
      desc.includes('architecture') ||
      desc.includes('架構') ||
      desc.includes('atlas')
    ) {
      return 'Add clearer instructions for architecture diff generation. Include fallback behavior when atlas data is missing or stale. Strengthen the drift detection threshold guidance.';
    }
    if (
      desc.includes('scope') ||
      desc.includes('範圍') ||
      desc.includes('邊界')
    ) {
      return 'Clarify the scope boundaries in the skill definition. Add explicit criteria for when this skill should vs. should not be used. Add negative examples to the skill description.';
    }
    if (
      desc.includes('驗收') ||
      desc.includes('checklist') ||
      desc.includes('verify')
    ) {
      return 'Strengthen the verification checklist with concrete pass/fail criteria. Require the agent to explicitly check each item before delivering. Add self-review prompts.';
    }
    return 'Review the relevant section of the skill definition. Ensure instructions are specific and unambiguous. Add concrete examples showing both correct and incorrect behavior.';
  }

  if (issue.category === 'apltk') {
    if (desc.includes('template') || desc.includes('模板')) {
      return 'Update the template rendering logic to handle edge cases. Review the placeholder substitution code for completeness. Ensure all placeholder patterns are matched.';
    }
    if (
      desc.includes('error') ||
      desc.includes('錯誤') ||
      desc.includes('message')
    ) {
      return 'Improve error messages to be more specific and actionable. Include contextual information in error output. Add guidance for common failure modes.';
    }
    if (
      desc.includes('cli') ||
      desc.includes('參數') ||
      desc.includes('flag')
    ) {
      return 'Review the CLI argument parsing logic. Ensure all documented options work correctly. Add validation for mutually exclusive or dependent flags.';
    }
    if (
      desc.includes('path') ||
      desc.includes('路徑') ||
      desc.includes('directory')
    ) {
      return 'Review path resolution logic. Ensure relative paths are resolved correctly relative to the expected base directory. Add path normalization.';
    }
    return 'Review the relevant apltk tool implementation. Check input validation, error handling, and edge cases. Ensure consistent behavior across all code paths.';
  }

  // Generic fallback for "other" category
  if (desc.includes('超時') || desc.includes('timeout')) {
    return 'Investigate whether the issue is a resource limitation or a code inefficiency. Consider adding timeouts or breaking the task into smaller sub-tasks.';
  }
  if (
    desc.includes('parse') ||
    desc.includes('解析') ||
    desc.includes('json')
  ) {
    return 'Add robust parsing with fallback handlers. Handle common JSON format variations. Add validation before processing.';
  }

  return 'Investigate the specific test failures and address the root cause. Consider adding guard clauses, better error handling, or clearer documentation depending on the exact nature of the issue.';
}

/**
 * Generate the optimization plan and write it to disk.
 *
 * @param {Array<object>} dedupedIssues
 * @param {string} date
 * @param {Array<{testNo: string, score: object}>} allScores
 * @returns {object} the plan object
 */
function generateOptimizationPlan(dedupedIssues, date, allScores) {
  // Sort: P0 first, then P1, then P2. Within same severity, sort by frequency descending.
  const severityRank = { P0: 0, P1: 1, P2: 2 };
  const sortedIssues = [...dedupedIssues].sort((a, b) => {
    const rankDiff =
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return b.frequency - a.frequency;
  });

  // Assign stable IDs based on sorted order
  const issues = sortedIssues.map((issue, i) => ({
    id: `OPT-${String(i + 1).padStart(3, '0')}`,
    category: issue.category,
    severity: issue.severity,
    frequency: issue.frequency,
    affectedTests: issue.affectedTests,
    description: issue.description,
    evidence: issue.evidence,
    suggestedFix: issue._suggestedFix || '',
  }));

  const totalIssues = allScores.reduce((sum, { score }) => {
    return sum + (Array.isArray(score.issues) ? score.issues.length : 0);
  }, 0);

  const plan = {
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      totalScores: allScores.length,
      totalIssues,
      dedupedIssues: issues.length,
    },
    issues,
  };

  // Write plan to disk
  const resultsDir = resolve(ROOT_DIR, 'results', 'spec', date);
  mkdirSync(resultsDir, { recursive: true });

  const planPath = join(resultsDir, 'optimization-plan.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
  console.log(`Optimization plan written: ${planPath}`);

  return plan;
}

// --- Task 2: Spec Skill SKILL.md Optimization ---

/**
 * Resolve the SKILL.md path. Checks multiple possible locations.
 *
 * @param {string} sourceRoot - repository root directory
 * @returns {string|null} resolved path or null if not found
 */
function resolveSkillMdPath(sourceRoot) {
  const candidates = [
    join(sourceRoot, 'skills', 'spec', 'SKILL.md'),
    join(sourceRoot, 'spec', 'SKILL.md'),
    join(sourceRoot, '..', 'skills', 'spec', 'SKILL.md'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

/**
 * Optimize the spec skill's SKILL.md based on identified skill issues.
 *
 * @param {object} plan - optimization plan
 * @param {string} skillMdPath - path to SKILL.md
 * @param {object} env - environment variables
 * @param {boolean} dryRun - if true, only write patch file; if false, apply changes
 * @param {string} date - date string for output directory
 * @param {boolean} judgeAvailable
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function optimizeSkillMd(
  plan,
  skillMdPath,
  env,
  dryRun,
  date,
  judgeAvailable,
) {
  const skillIssues = plan.issues.filter((i) => i.category === 'skill');

  if (skillIssues.length === 0) {
    return {
      success: true,
      message: 'No skill issues found. Skipping SKILL.md optimization.',
    };
  }

  console.log(`\n=== Optimizing SKILL.md (${skillIssues.length} issues) ===`);

  // Read current SKILL.md
  let currentContent;
  try {
    currentContent = readFileSync(skillMdPath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      message: `Cannot read SKILL.md at ${skillMdPath}: ${err.message}`,
    };
  }

  // Extract frontmatter bounds
  const frontmatterMatch = currentContent.match(/^---\n([\s\S]*?)\n---/);
  const hasFrontmatter = frontmatterMatch !== null;
  const frontmatterEnd = hasFrontmatter ? frontmatterMatch[0].length : 0;

  if (dryRun || !judgeAvailable) {
    // Build a detailed suggestions document
    const patchLines = [
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
      patchLines.push(
        `### ${issue.id}: ${issue.severity} - ${issue.description.substring(0, 120)}`,
      );
      patchLines.push('');
      patchLines.push(`- **Frequency**: ${issue.frequency} tests affected`);
      patchLines.push(
        `- **Affected Tests**: ${issue.affectedTests.join(', ')}`,
      );
      patchLines.push(
        `- **Evidence**: ${issue.evidence.join('; ') || '(none)'}`,
      );
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

        const judgePrompt = buildSkillOptimizationPrompt(
          skillIssues,
          currentContent,
        );
        const { content } = await callJudgeModelWithRaw(
          [{ role: 'user', content: judgePrompt }],
          env,
        );

        patchLines.push(content);
      } catch (err) {
        patchLines.push(`Judge model call failed: ${err.message}`);
        patchLines.push('');
        patchLines.push('## Template-Based Suggestions');
        patchLines.push('');
        patchLines.push(
          generateSkillTemplateChanges(skillIssues, currentContent),
        );
      }
    } else {
      patchLines.push('---');
      patchLines.push('');
      patchLines.push('## Template-Based Suggestions');
      patchLines.push('');
      patchLines.push(
        generateSkillTemplateChanges(skillIssues, currentContent),
      );
    }

    const resultsDir = resolve(ROOT_DIR, 'results', 'spec', date);
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
    const judgePrompt = buildSkillOptimizationPrompt(
      skillIssues,
      currentContent,
    );
    const { content } = await callJudgeModelWithRaw(
      [{ role: 'user', content: judgePrompt }],
      env,
    );

    // Parse the judge's suggested changes
    const newContent = applySkillChanges(
      currentContent,
      content,
      hasFrontmatter,
      frontmatterEnd,
    );

    // 3. Write updated SKILL.md
    writeFileSync(skillMdPath, newContent, 'utf-8');
    console.log(`SKILL.md updated: ${skillMdPath}`);

    // 4. Validate frontmatter
    try {
      execSync('node dist/bin/apollo-toolkit.js validate-skill-frontmatter', {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log('Frontmatter validation: PASSED');
    } catch (valErr) {
      console.error('Frontmatter validation FAILED. Restoring backup...');
      copyFileSync(bakPath, skillMdPath);
      return {
        success: false,
        message: `Frontmatter validation failed. Backup restored from ${bakPath}. Error: ${valErr.stderr?.toString() || valErr.message}`,
      };
    }

    return {
      success: true,
      message: `SKILL.md optimized successfully. Backup: ${bakPath}`,
    };
  } catch (err) {
    console.error(`SKILL.md optimization failed: ${err.message}`);
    // Restore backup
    copyFileSync(bakPath, skillMdPath);
    console.log(`Backup restored from ${bakPath}`);
    return {
      success: false,
      message: `Optimization failed: ${err.message}. Backup restored.`,
    };
  }
}

/**
 * Build the prompt for SKILL.md optimization.
 */
function buildSkillOptimizationPrompt(skillIssues, currentContent) {
  const issuesText = skillIssues
    .map(
      (i) =>
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
 * Simple approach: attempt to parse structured edit instructions from the judge output,
 * falling back to appending suggestions as comments if parsing fails.
 */
function applySkillChanges(
  currentContent,
  judgeOutput,
  _hasFrontmatter,
  _frontmatterEnd,
) {
  // Attempt to extract structured edits from judge output
  // Look for patterns like "FIND: ... REPLACE WITH: ..." or "AFTER: ... INSERT: ..."
  const findReplacePattern =
    /(?:FIND|查找|搜尋)[:\s]*\n?```(?:markdown)?\n([\s\S]*?)\n```\s*\n(?:REPLACE WITH|替換為|取代為)[:\s]*\n?```(?:markdown)?\n([\s\S]*?)\n```/gi;

  let modifiedContent = currentContent;
  let appliedCount = 0;

  let match;
  while ((match = findReplacePattern.exec(judgeOutput)) !== null) {
    const findText = match[1].trim();
    const replaceText = match[2].trim();

    if (findText && modifiedContent.includes(findText)) {
      modifiedContent = modifiedContent.replace(findText, replaceText);
      appliedCount++;
    }
  }

  if (appliedCount > 0) {
    console.log(`Applied ${appliedCount} structured edit(s) from judge model.`);
    return modifiedContent;
  }

  // If no structured edits found, try parsing markdown code blocks
  // Look for a complete replacement (should be rare and explicit)
  const fullReplacement = judgeOutput.match(
    /```markdown\n([\s\S]*?)\n```\n*(?:END|$)/,
  );
  if (fullReplacement) {
    const newContent = fullReplacement[1].trim();
    const newHasFrontmatter = newContent.startsWith('---');
    if (newHasFrontmatter) {
      console.log('Applied full content replacement from judge model.');
      return newContent;
    }
  }

  // Fallback: prepend the judge suggestions as a comment at the top of the file
  // (after frontmatter) -- this is a conservative fallback for manual review
  console.warn(
    'Could not parse structured edits from judge output. No changes applied.',
  );
  console.warn('Review the patch file for manual application.');

  return currentContent;
}

/**
 * Generate template-based SKILL.md change suggestions.
 */
function generateSkillTemplateChanges(skillIssues, _currentContent) {
  const lines = [];
  lines.push(
    'The following sections may need attention based on identified issues:',
  );
  lines.push('');

  for (const issue of skillIssues) {
    lines.push(`### ${issue.severity}: ${issue.description}`);
    lines.push('');

    // Map issue descriptions to likely SKILL.md sections
    const desc = issue.description.toLowerCase();

    if (
      desc.includes('流程') ||
      desc.includes('process') ||
      desc.includes('步驟')
    ) {
      lines.push('**Likely affected section**: "工作流程" (Workflow)');
      lines.push(
        'Consider adding decision points, guard clauses, or explicit verification steps.',
      );
      lines.push('Add clear "when to do X vs. when to skip X" guidance.');
    } else if (
      desc.includes('格式') ||
      desc.includes('format') ||
      desc.includes('輸出')
    ) {
      lines.push(
        '**Likely affected section**: "驗收條件" (Acceptance Criteria)',
      );
      lines.push(
        'Specify exact output format expectations. Add format validation steps.',
      );
    } else if (
      desc.includes('architecture') ||
      desc.includes('架構') ||
      desc.includes('diff')
    ) {
      lines.push('**Likely affected section**: Step 7 (architecture diff)');
      lines.push('Add instructions for handling missing/stale atlas data.');
    } else if (
      desc.includes('scope') ||
      desc.includes('範圍') ||
      desc.includes('邊界')
    ) {
      lines.push(
        '**Likely affected section**: "目標" (Goal) and description frontmatter',
      );
      lines.push(
        'Add explicit scoping rules. Clarify when the skill should NOT be used.',
      );
    } else {
      lines.push(
        'Review the full SKILL.md for sections related to this issue.',
      );
    }

    lines.push('');
    lines.push(
      `**Suggested Fix**: ${issue.suggestedFix || 'Review and adjust based on test evidence.'}`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

// --- Task 3: apltk Tool Optimization ---

/**
 * Map apltk issues to specific source files.
 *
 * @param {Array<object>} apltkIssues
 * @returns {Map<string, Array<object>>} file path -> issues
 */
function mapIssuesToFiles(apltkIssues) {
  const ALLOWED_FILES = [
    'lib/tools/create-specs.ts',
    'lib/tools/architecture.ts',
  ];

  const fileMap = new Map();

  for (const issue of apltkIssues) {
    const desc = issue.description.toLowerCase();

    // Heuristic mapping based on keywords in description
    let targetFile = null;

    if (
      desc.includes('create-specs') ||
      desc.includes('template') ||
      desc.includes('模板') ||
      desc.includes('spec.md') ||
      desc.includes('tasks.md') ||
      desc.includes('slug') ||
      desc.includes('change-name') ||
      desc.includes('batch')
    ) {
      targetFile = 'lib/tools/create-specs.ts';
    } else if (
      desc.includes('architecture') ||
      desc.includes('架構') ||
      desc.includes('atlas') ||
      desc.includes('diff') ||
      desc.includes('merge') ||
      desc.includes('render')
    ) {
      targetFile = 'lib/tools/architecture.ts';
    }

    // If no clear mapping, default to create-specs.ts (which is the main tool)
    if (!targetFile || !ALLOWED_FILES.includes(targetFile)) {
      targetFile = 'lib/tools/create-specs.ts';
    }

    if (!fileMap.has(targetFile)) {
      fileMap.set(targetFile, []);
    }
    fileMap.get(targetFile).push(issue);
  }

  return fileMap;
}

/**
 * Optimize apltk tools based on identified apltk issues.
 *
 * @param {object} plan - optimization plan
 * @param {string} sourceRoot - repository root
 * @param {object} env - environment variables
 * @param {boolean} dryRun - if true, only write patch file
 * @param {string} date - date string
 * @param {boolean} judgeAvailable
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function optimizeApltkTools(
  plan,
  sourceRoot,
  env,
  dryRun,
  date,
  judgeAvailable,
) {
  const apltkIssues = plan.issues.filter((i) => i.category === 'apltk');

  if (apltkIssues.length === 0) {
    return {
      success: true,
      message: 'No apltk issues found. Skipping apltk tool optimization.',
    };
  }

  console.log(
    `\n=== Optimizing apltk tools (${apltkIssues.length} issues) ===`,
  );

  const fileMap = mapIssuesToFiles(apltkIssues);
  const allPatches = [];
  let anyRealChange = false;

  for (const [relativePath, issues] of fileMap) {
    const filePath = resolve(sourceRoot, relativePath);

    if (!existsSync(filePath)) {
      console.warn(`Warning: Source file not found: ${filePath} -- skipping`);
      continue;
    }

    console.log(
      `\n--- Processing: ${relativePath} (${issues.length} issues) ---`,
    );

    let currentCode;
    try {
      currentCode = readFileSync(filePath, 'utf-8');
    } catch (err) {
      console.warn(`Cannot read ${filePath}: ${err.message} -- skipping`);
      continue;
    }

    // Build patch content
    const patchLines = [
      `# apltk Optimization: ${relativePath}`,
      '',
      `Generated: ${new Date().toISOString()}`,
      `Issues: ${issues.length}`,
      '',
      '## Issues',
      '',
    ];

    for (const issue of issues) {
      patchLines.push(`### ${issue.id}: ${issue.severity}`);
      patchLines.push(`- **Description**: ${issue.description}`);
      patchLines.push(`- **Frequency**: ${issue.frequency} tests affected`);
      patchLines.push(
        `- **Evidence**: ${issue.evidence.join('; ') || '(none)'}`,
      );
      patchLines.push(`- **Suggested Fix**: ${issue.suggestedFix || '(none)'}`);
      patchLines.push('');
    }

    if (judgeAvailable) {
      try {
        const judgePrompt = buildApltkOptimizationPrompt(
          issues,
          currentCode,
          relativePath,
        );
        const { content } = await callJudgeModelWithRaw(
          [{ role: 'user', content: judgePrompt }],
          env,
        );

        patchLines.push('---');
        patchLines.push('');
        patchLines.push('## Judge Model Analysis & Suggested Changes');
        patchLines.push('');
        patchLines.push(content);

        // In real mode, try to apply changes
        if (!dryRun) {
          const result = applyApltkChanges(filePath, currentCode, content);
          if (result.applied) {
            anyRealChange = true;
            console.log(`Applied changes to ${relativePath}`);
            patchLines.push('');
            patchLines.push('---');
            patchLines.push('');
            patchLines.push(
              '**Status: APPLIED** - Changes have been applied to the source file.',
            );
          } else {
            patchLines.push('');
            patchLines.push('---');
            patchLines.push('');
            patchLines.push(
              '**Status: NOT APPLIED** - Could not parse structured edits. Manual review required.',
            );
          }
        }
      } catch (err) {
        patchLines.push(`Judge model call failed: ${err.message}`);
        patchLines.push('');
        patchLines.push(
          generateApltkTemplateChanges(issues, currentCode, relativePath),
        );
      }
    } else {
      patchLines.push('---');
      patchLines.push('');
      patchLines.push('## Template-Based Suggestions');
      patchLines.push('');
      patchLines.push(
        generateApltkTemplateChanges(issues, currentCode, relativePath),
      );
    }

    allPatches.push({ relativePath, content: patchLines.join('\n') });
  }

  // Write unified patch file
  const resultsDir = resolve(ROOT_DIR, 'results', 'spec', date);
  mkdirSync(resultsDir, { recursive: true });

  const unifiedPatch = allPatches
    .map((p) => p.content)
    .join('\n\n' + '='.repeat(80) + '\n\n');

  const patchPath = join(resultsDir, 'apltk-optimization-patch.md');
  writeFileSync(patchPath, unifiedPatch, 'utf-8');
  console.log(`\napltk optimization patch written: ${patchPath}`);

  // Validate if real changes were made
  if (anyRealChange) {
    try {
      console.log('\nRunning tests to validate changes...');
      execSync('pnpm test', {
        cwd: sourceRoot,
        stdio: 'inherit',
        timeout: 120000,
      });
      console.log('Tests: PASSED');

      // Check CLI interface
      console.log('\nVerifying CLI interface...');
      const helpResult = execSync(
        'node dist/bin/apollo-toolkit.js create-specs --help',
        {
          cwd: sourceRoot,
          encoding: 'utf-8',
          timeout: 30000,
        },
      );
      console.log('CLI interface: OK');
      console.log(helpResult.split('\n').slice(0, 3).join('\n'));
    } catch (valErr) {
      return {
        success: false,
        message: `Post-optimization validation failed: ${valErr.stderr?.toString() || valErr.message}`,
      };
    }
  }

  return {
    success: true,
    message: `${dryRun ? 'Dry-run: patch written' : 'Changes applied'} to ${patchPath}`,
  };
}

/**
 * Build judge model prompt for apltk optimization.
 */
function buildApltkOptimizationPrompt(issues, currentCode, filePath) {
  const issuesText = issues
    .map(
      (i) =>
        `- [${i.severity}] ${i.description}\n  Evidence: ${i.evidence.join('; ') || '(none)'}`,
    )
    .join('\n\n');

  return [
    'You are an expert TypeScript code reviewer. An apltk CLI tool has been tested and',
    'the following issues were identified.',
    '',
    '## Issues to Fix',
    issuesText,
    '',
    `## Current Source: ${filePath}`,
    '```typescript',
    currentCode,
    '```',
    '',
    '## Instructions',
    'Suggest targeted code changes to fix ONLY the identified issues.',
    '',
    'Critical constraints:',
    '1. Do NOT modify the CLI interface -- all existing command-line flags must remain unchanged',
    '2. Do NOT import new external dependencies -- the project uses only Node.js built-ins plus js-yaml',
    '3. Keep changes minimal and focused on fixing confirmed issues',
    '4. Preserve existing TypeScript types and patterns',
    '5. All existing tests must continue to pass',
    '',
    'For each fix, use this format:',
    '```',
    'FIND: <exact lines to find>',
    'REPLACE WITH: <exact replacement>',
    'RATIONALE: <why this fix addresses the issue>',
    '```',
    '',
    'Only include FIND/REPLACE blocks for changes you are confident about.',
  ].join('\n');
}

/**
 * Apply judge model suggestions to apltk source code.
 */
function applyApltkChanges(filePath, currentCode, judgeOutput) {
  // Try structured FIND/REPLACE patterns
  const blockPattern =
    /FIND:\s*\n?```(?:typescript|ts)?\n([\s\S]*?)\n```\s*\nREPLACE WITH:\s*\n?```(?:typescript|ts)?\n([\s\S]*?)\n```/gi;

  let modifiedCode = currentCode;
  let appliedCount = 0;

  let match;
  while ((match = blockPattern.exec(judgeOutput)) !== null) {
    const findText = match[1].trim();
    const replaceText = match[2].trim();

    if (findText && modifiedCode.includes(findText)) {
      modifiedCode = modifiedCode.replace(findText, replaceText);
      appliedCount++;
    }
  }

  if (appliedCount > 0) {
    // Backup original
    const bakPath = filePath + '.bak';
    copyFileSync(filePath, bakPath);
    console.log(`Backup: ${bakPath}`);

    // Write changes
    writeFileSync(filePath, modifiedCode, 'utf-8');
    console.log(`Applied ${appliedCount} change(s) to ${filePath}`);
    return { applied: true, count: appliedCount };
  }

  // Try simpler line-based patterns: FIND: "exact line" REPLACE WITH: "exact line"
  const simplePattern = /FIND:\s*"([^"]+)"\s*\nREPLACE WITH:\s*"([^"]+)"/gi;
  while ((match = simplePattern.exec(judgeOutput)) !== null) {
    const findText = match[1];
    const replaceText = match[2];

    if (findText && modifiedCode.includes(findText)) {
      modifiedCode = modifiedCode.replace(findText, replaceText);
      appliedCount++;
    }
  }

  if (appliedCount > 0) {
    const bakPath = filePath + '.bak';
    copyFileSync(filePath, bakPath);
    console.log(`Backup: ${bakPath}`);
    writeFileSync(filePath, modifiedCode, 'utf-8');
    console.log(`Applied ${appliedCount} simple change(s) to ${filePath}`);
    return { applied: true, count: appliedCount };
  }

  return { applied: false, count: 0 };
}

/**
 * Generate template-based apltk change suggestions.
 */
function generateApltkTemplateChanges(issues, currentCode, filePath) {
  const lines = [];
  lines.push(`File: ${filePath}`);
  lines.push('');

  for (const issue of issues) {
    lines.push(`### ${issue.severity}: ${issue.description}`);
    lines.push('');
    lines.push(
      `**Suggested Fix**: ${issue.suggestedFix || 'Manual investigation required.'}`,
    );

    // Add file-specific guidance
    if (filePath.includes('create-specs')) {
      if (
        issue.description.toLowerCase().includes('template') ||
        issue.description.includes('模板')
      ) {
        lines.push('');
        lines.push(
          'Check `renderContent()` function for missing placeholder patterns.',
        );
        lines.push(
          'Ensure all TEMPLATE_FILENAMES entries have corresponding template files.',
        );
        lines.push(
          'Verify `slugify()` handles edge cases (numbers, special chars, CJK).',
        );
      }
      if (
        issue.description.toLowerCase().includes('error') ||
        issue.description.includes('錯誤')
      ) {
        lines.push('');
        lines.push(
          'Review error messages for clarity. Each `stderr.write()` should include',
        );
        lines.push(
          'actionable guidance (expected format, example valid input).',
        );
      }
    }

    if (filePath.includes('architecture')) {
      lines.push('');
      lines.push(
        'The architecture handler is a thin delegate to the atlas CLI.',
      );
      lines.push(
        'Issues may originate in `skills/init-project-html/lib/atlas/cli.js`.',
      );
      lines.push(
        'Check if the delegate needs additional error context or validation.',
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}

// --- Main ---

/**
 * Parse command-line arguments.
 *
 * @param {string[]} args
 * @returns {{ date: string, dryRun: boolean, planOnly: boolean }}
 */
function parseArgs(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const positionals = args.filter((a) => !a.startsWith('--'));

  const date = positionals[0] || '2026-05-28';
  const dryRun = flags.includes('--dry-run');
  const planOnly = flags.includes('--plan-only');

  return { date, dryRun, planOnly };
}

async function main() {
  const { date, dryRun, planOnly } = parseArgs(process.argv.slice(2));

  console.log('=== optimize.mjs ===');
  console.log(`Date: ${date}`);
  console.log(`Mode: ${planOnly ? 'plan-only' : dryRun ? 'dry-run' : 'apply'}`);
  console.log('');

  // 1. Load environment variables
  let env;
  let judgeAvailable = false;
  try {
    const { loadEnv } = await import('./env-utils.mjs');
    env = loadEnv();
    judgeAvailable = Boolean(
      env.JUDGE_API_KEY && env.JUDGE_BASE_URL && env.JUDGE_MODEL,
    );
    console.log(
      `Judge model: ${judgeAvailable ? `${env.JUDGE_MODEL} @ ${env.JUDGE_BASE_URL}` : 'NOT AVAILABLE (will use template-based suggestions)'}`,
    );
  } catch (err) {
    console.warn(`Environment variables not loaded: ${err.message}`);
    console.warn(
      'Running without judge model. Template-based suggestions only.',
    );
    env = {};
    judgeAvailable = false;
  }

  // 2. Load all scores
  console.log('\n--- Phase 1: Score Aggregation ---');
  const allScores = loadAllScores(date);
  console.log(`Loaded scores from ${allScores.length} test(s).`);

  if (allScores.length === 0) {
    console.log('\nNo scores found. Nothing to optimize.');
    console.log(
      'Run run-evals.mjs and score.mjs first to generate test results.',
    );
    // Still generate an empty plan for consistency
    const resultsDir = resolve(ROOT_DIR, 'results', 'spec', date);
    mkdirSync(resultsDir, { recursive: true });
    const emptyPlan = {
      date,
      generatedAt: new Date().toISOString(),
      summary: { totalScores: 0, totalIssues: 0, dedupedIssues: 0 },
      issues: [],
    };
    writeFileSync(
      join(resultsDir, 'optimization-plan.json'),
      JSON.stringify(emptyPlan, null, 2),
      'utf-8',
    );
    console.log(`Empty optimization plan written.`);
    return;
  }

  // 3. Extract issues
  console.log('\n--- Phase 2: Issue Extraction ---');
  const rawIssues = extractIssues(allScores);
  console.log(`Extracted ${rawIssues.length} raw issue(s) from scores.`);

  if (rawIssues.length === 0) {
    console.log('No issues found in scores. All tests passed cleanly!');
    // Generate a clean plan (return value intentionally discarded)
    generateOptimizationPlan([], date, allScores);
    return;
  }

  // Show category breakdown
  const catCounts = {};
  for (const issue of rawIssues) {
    catCounts[issue.category] = (catCounts[issue.category] || 0) + 1;
  }
  console.log('Category breakdown:', catCounts);

  // 4. Deduplicate
  console.log('\n--- Phase 3: Deduplication ---');
  const dedupedIssues = await deduplicateIssues(rawIssues, env, judgeAvailable);
  console.log(
    `Deduped: ${rawIssues.length} raw => ${dedupedIssues.length} unique issue(s).`,
  );

  // 5. Generate suggested fixes
  console.log('\n--- Phase 4: Generating Fix Suggestions ---');
  for (const issue of dedupedIssues) {
    const fix = await generateSuggestedFix(issue, env, judgeAvailable);
    issue._suggestedFix = fix;
  }
  console.log(
    `Generated fix suggestions for ${dedupedIssues.length} issue(s).`,
  );

  // 6. Generate optimization plan
  console.log('\n--- Phase 5: Optimization Plan ---');
  const plan = generateOptimizationPlan(dedupedIssues, date, allScores);

  // Print summary
  console.log('\n=== Optimization Plan Summary ===');
  console.log(`Total scores analyzed: ${plan.summary.totalScores}`);
  console.log(`Total raw issues: ${plan.summary.totalIssues}`);
  console.log(`Deduped issues: ${plan.summary.dedupedIssues}`);
  console.log('');

  if (plan.issues.length > 0) {
    const sevCounts = { P0: 0, P1: 0, P2: 0 };
    plan.issues.forEach((i) => sevCounts[i.severity]++);
    console.log(`  P0 (critical): ${sevCounts.P0}`);
    console.log(`  P1 (important): ${sevCounts.P1}`);
    console.log(`  P2 (minor): ${sevCounts.P2}`);

    const catCountsDedup = {};
    plan.issues.forEach(
      (i) =>
        (catCountsDedup[i.category] = (catCountsDedup[i.category] || 0) + 1),
    );
    for (const [cat, count] of Object.entries(catCountsDedup)) {
      console.log(`  ${cat}: ${count}`);
    }

    // Print top 5 issues
    console.log('\nTop issues:');
    for (const issue of plan.issues.slice(0, 5)) {
      console.log(
        `  ${issue.id} [${issue.severity}] (${issue.frequency}x) ${issue.description.substring(0, 80)}...`,
      );
    }
  }

  // 7. If plan-only, stop here
  if (planOnly) {
    console.log('\n--plan-only: stopping after plan generation.');
    console.log(`Plan written to: results/spec/${date}/optimization-plan.json`);
    return;
  }

  // 8. Optimize SKILL.md
  console.log('\n--- Phase 6: SKILL.md Optimization ---');
  const skillMdPath = resolveSkillMdPath(ROOT_DIR);
  if (!skillMdPath) {
    console.warn(
      'SKILL.md not found. Checked: skills/spec/SKILL.md, spec/SKILL.md',
    );
    console.warn('Skipping SKILL.md optimization.');
  } else {
    console.log(`Found SKILL.md at: ${skillMdPath}`);
    const skillResult = await optimizeSkillMd(
      plan,
      skillMdPath,
      env,
      dryRun,
      date,
      judgeAvailable,
    );
    console.log(`SKILL.md optimization: ${skillResult.message}`);
  }

  // 9. Optimize apltk tools
  console.log('\n--- Phase 7: apltk Tool Optimization ---');
  const apltkResult = await optimizeApltkTools(
    plan,
    ROOT_DIR,
    env,
    dryRun,
    date,
    judgeAvailable,
  );
  console.log(`apltk optimization: ${apltkResult.message}`);

  // 10. Final summary
  console.log('\n=== Optimization Complete ===');
  console.log(`Plan: results/spec/${date}/optimization-plan.json`);
  if (dryRun) {
    console.log('Mode: DRY-RUN (no source files modified)');
    console.log(
      `Skill patch: results/spec/${date}/skill-optimization-patch.md`,
    );
    console.log(
      `apltk patch: results/spec/${date}/apltk-optimization-patch.md`,
    );
    console.log(
      'Review patches and re-run without --dry-run to apply changes.',
    );
  } else {
    console.log('Mode: APPLY (source files may have been modified)');
    console.log('Backups saved as .bak files alongside originals.');
  }
}

// Run
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('optimize.mjs') ||
    process.argv[1].endsWith('optimize'));

if (isDirectRun) {
  main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}
