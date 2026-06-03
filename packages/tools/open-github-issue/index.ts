import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { createToolRunner } from '@laitszkin/tool-utils';

const GITHUB_API_BASE = 'https://api.github.com';
const README_ACCEPT = 'application/vnd.github.raw+json';
const JSON_ACCEPT = 'application/vnd.github+json';
const DEFAULT_REPRO_ZH =
  '尚未穩定重現；需補充更多執行期資料。';
const DEFAULT_REPRO_EN =
  'Not yet reliably reproducible; more runtime evidence is required.';

const ISSUE_TYPE_PROBLEM = 'problem';
const ISSUE_TYPE_FEATURE = 'feature';
const ISSUE_TYPE_PERFORMANCE = 'performance';
const ISSUE_TYPE_SECURITY = 'security';
const ISSUE_TYPE_DOCS = 'docs';
const ISSUE_TYPE_OBSERVABILITY = 'observability';

const ISSUE_TYPES = [
  ISSUE_TYPE_PROBLEM,
  ISSUE_TYPE_FEATURE,
  ISSUE_TYPE_PERFORMANCE,
  ISSUE_TYPE_SECURITY,
  ISSUE_TYPE_DOCS,
  ISSUE_TYPE_OBSERVABILITY,
] as const;

const PROBLEM_BDD_MARKER_GROUPS: [RegExp, RegExp, RegExp][] = [
  [
    /Expected Behavior\s*\(BDD\)/i,
    /Current Behavior\s*\(BDD\)/i,
    /Behavior Gap/i,
  ],
  [
    /預期行為\s*[（(]BDD[）)]/i,
    /(?:目前|當前)行為\s*[（(]BDD[）)]/i,
    /行為(?:落差|差異)/i,
  ],
];

const TEXT_FIELDS = [
  'title',
  'problem_description',
  'suspected_cause',
  'reproduction',
  'proposal',
  'reason',
  'suggested_architecture',
  'impact',
  'evidence',
  'suggested_action',
  'affected_scope',
] as const;

const PAYLOAD_FIELDS = new Set([
  'title',
  'issue_type',
  'problem_description',
  'suspected_cause',
  'reproduction',
  'proposal',
  'reason',
  'suggested_architecture',
  'impact',
  'evidence',
  'suggested_action',
  'severity',
  'affected_scope',
  'repo',
  'dry_run',
]);

interface OpenIssueArgs {
  payloadFile: string | null;
  title: string | null;
  issueType: string | null;
  problemDescription: string | null;
  suspectedCause: string | null;
  reproduction: string | null;
  proposal: string | null;
  reason: string | null;
  suggestedArchitecture: string | null;
  impact: string | null;
  evidence: string | null;
  suggestedAction: string | null;
  severity: string | null;
  affectedScope: string | null;
  repo: string | null;
  dryRun: boolean;
}

// ---- Utilities ----

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runCommand(cmd: string, cmdArgs: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(cmd, cmdArgs, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: (error as NodeJS.ErrnoException & { status?: number }).status ?? 1,
        });
      } else {
        resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 });
      }
    });
  });
}

function normalizeKey(key: string): string {
  return key.replace(/-/g, '_');
}

interface PayloadEntry {
  [key: string]: unknown;
}

function readPayloadFile(rawPath: string): PayloadEntry {
  let rawContent: string;
  let context: string;

  if (rawPath === '-') {
    // We cannot read stdin here easily; throw clear error
    throw new Error('stdin payload (-) is not supported in handler mode; use a file path');
  } else {
    rawContent = readFileSync(rawPath, 'utf-8');
    context = rawPath;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawContent);
  } catch (exc) {
    throw new Error(`Invalid JSON payload in ${context}: ${(exc as Error).message}`);
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(`Invalid JSON payload in ${context}: top-level value must be an object.`);
  }

  const normalized: PayloadEntry = {};
  for (const [rawKey, value] of Object.entries(payload as Record<string, unknown>)) {
    const key = normalizeKey(rawKey);
    if (!PAYLOAD_FIELDS.has(key)) {
      throw new Error(`Unsupported payload key: ${rawKey}`);
    }
    normalized[key] = value;
  }
  return normalized;
}

function readAtFileValue(fieldName: string, value: string | null): string | null {
  if (value == null) return null;
  if (value.startsWith('@@')) return value.slice(1);
  if (value === '@-') {
    throw new Error('stdin reading (@-) is not supported in handler mode');
  }
  if (value.startsWith('@') && value.length > 1) {
    const filePath = value.slice(1);
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (exc) {
      throw new Error(
        `Unable to read @${fieldName} file ${filePath}: ${(exc as Error).message}`,
      );
    }
  }
  return value;
}

function requireNonEmpty(value: string | null | undefined, message: string): void {
  if (!(value || '').trim()) {
    throw new Error(message);
  }
}

function hasRequiredProblemBddSections(problemDescription: string): boolean {
  const normalized = problemDescription.trim();
  return PROBLEM_BDD_MARKER_GROUPS.some((group) =>
    group.every((pattern) => pattern.test(normalized)),
  );
}

function hasGhAuth(): Promise<boolean> {
  return runCommand('gh', ['auth', 'status']).then((r) => r.exitCode === 0);
}

function getToken(env: Record<string, string | undefined>): string | null {
  return env.GITHUB_TOKEN || env.GH_TOKEN || null;
}

function validateRepo(repo: string): string {
  const candidate = repo.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate)) {
    throw new Error('Invalid repo format. Use owner/repo.');
  }
  return candidate;
}

// ---- HTTP helpers ----

function githubRequest(
  method: string,
  path: string,
  token: string | null,
  accept: string,
  payload?: Record<string, unknown>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: accept,
      'User-Agent': 'open-github-issue-skill',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body: string | undefined;
    if (payload !== undefined) {
      body = JSON.stringify(payload);
      headers['Content-Type'] = 'application/json';
    }

    const url = new URL(`${GITHUB_API_BASE}${path}`);
    const req = httpsRequest(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString('utf-8');
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            const detail = data || 'unknown error';
            reject(
              new Error(`GitHub API ${res.statusCode} ${path}: ${detail}`),
            );
          }
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`GitHub API request failed for ${path}: ${err.message}`));
    });

    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

async function fetchRemoteReadme(
  repo: string,
  ghAuthenticated: boolean,
  token: string | null,
): Promise<string> {
  if (ghAuthenticated) {
    const result = await runCommand('gh', [
      'api',
      '-H',
      `Accept: ${README_ACCEPT}`,
      `repos/${repo}/readme`,
    ]);
    if (result.exitCode === 0) {
      return result.stdout;
    }
  }

  try {
    return await githubRequest('GET', `/repos/${repo}/readme`, token, README_ACCEPT);
  } catch {
    return '';
  }
}

function detectIssueLanguage(readmeContent: string): string {
  if (!readmeContent.trim()) return 'en';

  const chineseChars = (readmeContent.match(/[一-鿿]/g) || []).length;
  const languageChars = (
    readmeContent.match(/[A-Za-z一-鿿]/g) || []
  ).length;

  if (chineseChars >= 20 && languageChars > 0 && chineseChars / languageChars >= 0.08) {
    return 'zh';
  }
  return 'en';
}

// ---- Issue body builder ----

function buildIssueBody(params: {
  issueType: string;
  language: string;
  title: string;
  problemDescription: string | null;
  suspectedCause: string | null;
  reproduction: string | null;
  proposal: string | null;
  reason: string | null;
  suggestedArchitecture: string | null;
  impact: string | null;
  evidence: string | null;
  suggestedAction: string | null;
  severity: string | null;
  affectedScope: string | null;
}): string {
  const {
    issueType,
    language,
    title,
    problemDescription,
    suspectedCause,
    reproduction,
    proposal,
    reason,
    suggestedArchitecture,
    impact,
    evidence,
    suggestedAction,
    severity,
    affectedScope,
  } = params;

  if (issueType === ISSUE_TYPE_FEATURE) {
    const proposalText = (proposal || title).trim();
    const reasonText = (reason || '').trim();
    const architectureText = (suggestedArchitecture || '').trim();

    if (language === 'zh') {
      return (
        '### 功能提案\n' +
        `${proposalText}\n\n` +
        '### 原因\n' +
        `${reasonText}\n\n` +
        '### 建議架構\n' +
        `${architectureText}\n`
      );
    }

    return (
      '### Feature Proposal\n' +
      `${proposalText}\n\n` +
      '### Why This Is Needed\n' +
      `${reasonText}\n\n` +
      '### Suggested Architecture\n' +
      `${architectureText}\n`
    );
  }

  if (issueType === ISSUE_TYPE_PERFORMANCE) {
    if (language === 'zh') {
      return (
        '### 效能問題\n' +
        `${(problemDescription || '').trim()}\n\n` +
        '### 影響\n' +
        `${(impact || '').trim()}\n\n` +
        '### 證據\n' +
        `${(evidence || '').trim()}\n\n` +
        '### 建議行動\n' +
        `${(suggestedAction || '').trim()}\n`
      );
    }
    return (
      '### Performance Problem\n' +
      `${(problemDescription || '').trim()}\n\n` +
      '### Impact\n' +
      `${(impact || '').trim()}\n\n` +
      '### Evidence\n' +
      `${(evidence || '').trim()}\n\n` +
      '### Suggested Action\n' +
      `${(suggestedAction || '').trim()}\n`
    );
  }

  if (issueType === ISSUE_TYPE_SECURITY) {
    if (language === 'zh') {
      return (
        '### 安全風險\n' +
        `${(problemDescription || '').trim()}\n\n` +
        '### 嚴重程度\n' +
        `${(severity || '').trim()}\n\n` +
        '### 受影響範圍\n' +
        `${(affectedScope || '').trim()}\n\n` +
        '### 影響\n' +
        `${(impact || '').trim()}\n\n` +
        '### 證據\n' +
        `${(evidence || '').trim()}\n\n` +
        '### 建議緩解\n' +
        `${(suggestedAction || '').trim()}\n`
      );
    }
    return (
      '### Security Risk\n' +
      `${(problemDescription || '').trim()}\n\n` +
      '### Severity\n' +
      `${(severity || '').trim()}\n\n` +
      '### Affected Scope\n' +
      `${(affectedScope || '').trim()}\n\n` +
      '### Impact\n' +
      `${(impact || '').trim()}\n\n` +
      '### Evidence\n' +
      `${(evidence || '').trim()}\n\n` +
      '### Suggested Mitigation\n' +
      `${(suggestedAction || '').trim()}\n`
    );
  }

  if (issueType === ISSUE_TYPE_DOCS) {
    if (language === 'zh') {
      return (
        '### 文件缺口\n' +
        `${(problemDescription || '').trim()}\n\n` +
        '### 證據\n' +
        `${(evidence || '').trim()}\n\n` +
        '### 建議更新\n' +
        `${(suggestedAction || '').trim()}\n`
      );
    }
    return (
      '### Documentation Gap\n' +
      `${(problemDescription || '').trim()}\n\n` +
      '### Evidence\n' +
      `${(evidence || '').trim()}\n\n` +
      '### Suggested Update\n' +
      `${(suggestedAction || '').trim()}\n`
    );
  }

  if (issueType === ISSUE_TYPE_OBSERVABILITY) {
    if (language === 'zh') {
      return (
        '### 可觀測性缺口\n' +
        `${(problemDescription || '').trim()}\n\n` +
        '### 影響\n' +
        `${(impact || '').trim()}\n\n` +
        '### 證據\n' +
        `${(evidence || '').trim()}\n\n` +
        '### 建議儀表化\n' +
        `${(suggestedAction || '').trim()}\n`
      );
    }
    return (
      '### Observability Gap\n' +
      `${(problemDescription || '').trim()}\n\n` +
      '### Impact\n' +
      `${(impact || '').trim()}\n\n` +
      '### Evidence\n' +
      `${(evidence || '').trim()}\n\n` +
      '### Suggested Instrumentation\n' +
      `${(suggestedAction || '').trim()}\n`
    );
  }

  // Default: problem
  if (language === 'zh') {
    const reproText = (reproduction || DEFAULT_REPRO_ZH).trim();
    return (
      '### 問題描述\n' +
      `${(problemDescription || '').trim()}\n\n` +
      '### 推測原因\n' +
      `${(suspectedCause || '').trim()}\n\n` +
      '### 重現條件（如有）\n' +
      `${reproText}\n`
    );
  }

  const reproText = (reproduction || DEFAULT_REPRO_EN).trim();
  return (
    '### Problem Description\n' +
    `${(problemDescription || '').trim()}\n\n` +
    '### Suspected Cause\n' +
    `${(suspectedCause || '').trim()}\n\n` +
    '### Reproduction Conditions (if available)\n' +
    `${reproText}\n`
  );
}

// ---- Issue creation ----

async function createIssueWithGh(
  repo: string,
  title: string,
  body: string,
): Promise<string> {
  // Write body to a temp file
  const tmpFile = joinPath(tmpdir(), `issue-${Date.now()}.md`);
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(tmpFile, body, 'utf-8');

  try {
    const result = await runCommand('gh', [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      title,
      '--body-file',
      tmpFile,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'gh issue create failed');
    }

    const urlMatch = result.stdout.match(
      /https:\/\/github\.com\/[^\s]+\/issues\/\d+/,
    );
    return urlMatch ? urlMatch[0] : result.stdout.trim();
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function createIssueWithToken(
  repo: string,
  title: string,
  body: string,
  token: string,
): Promise<string> {
  const response = await githubRequest('POST', `/repos/${repo}/issues`, token, JSON_ACCEPT, {
    title,
    body,
  });
  const parsed = JSON.parse(response);
  const issueUrl: string | undefined = parsed.html_url;
  if (!issueUrl) {
    throw new Error('Issue created but response did not include html_url');
  }
  return issueUrl;
}

// ---- Validation ----

function validateIssueContent(args: OpenIssueArgs): void {
  const issueType = args.issueType || ISSUE_TYPE_PROBLEM;

  if (issueType === ISSUE_TYPE_FEATURE) {
    requireNonEmpty(args.reason, 'Feature issues require --reason.');
    requireNonEmpty(
      args.suggestedArchitecture,
      'Feature issues require --suggested-architecture.',
    );
    return;
  }

  if (issueType === ISSUE_TYPE_PERFORMANCE) {
    requireNonEmpty(args.problemDescription, 'Performance issues require --problem-description.');
    requireNonEmpty(args.impact, 'Performance issues require --impact.');
    requireNonEmpty(args.evidence, 'Performance issues require --evidence.');
    requireNonEmpty(args.suggestedAction, 'Performance issues require --suggested-action.');
    return;
  }

  if (issueType === ISSUE_TYPE_SECURITY) {
    requireNonEmpty(args.problemDescription, 'Security issues require --problem-description.');
    requireNonEmpty(args.affectedScope, 'Security issues require --affected-scope.');
    requireNonEmpty(args.impact, 'Security issues require --impact.');
    requireNonEmpty(args.evidence, 'Security issues require --evidence.');
    requireNonEmpty(args.suggestedAction, 'Security issues require --suggested-action.');
    requireNonEmpty(args.severity, 'Security issues require --severity.');
    return;
  }

  if (issueType === ISSUE_TYPE_DOCS) {
    requireNonEmpty(args.problemDescription, 'Docs issues require --problem-description.');
    requireNonEmpty(args.evidence, 'Docs issues require --evidence.');
    requireNonEmpty(args.suggestedAction, 'Docs issues require --suggested-action.');
    return;
  }

  if (issueType === ISSUE_TYPE_OBSERVABILITY) {
    requireNonEmpty(args.problemDescription, 'Observability issues require --problem-description.');
    requireNonEmpty(args.impact, 'Observability issues require --impact.');
    requireNonEmpty(args.evidence, 'Observability issues require --evidence.');
    requireNonEmpty(args.suggestedAction, 'Observability issues require --suggested-action.');
    return;
  }

  // Problem issue
  requireNonEmpty(args.problemDescription, 'Problem issues require --problem-description.');
  requireNonEmpty(args.suspectedCause, 'Problem issues require --suspected-cause.');
  if (!hasRequiredProblemBddSections(args.problemDescription || '')) {
    throw new Error(
      'Problem issues require --problem-description to include ' +
        'Expected Behavior (BDD), Current Behavior (BDD), and Behavior Gap sections.',
    );
  }
}

function hydrateArgs(args: OpenIssueArgs): OpenIssueArgs {
  const result = { ...args };

  // Load from payload file if provided
  if (result.payloadFile) {
    const payload = readPayloadFile(result.payloadFile);
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'dry_run') {
        if (typeof value !== 'boolean') {
          throw new Error("Payload field 'dry_run' must be a boolean.");
        }
        if (!result.dryRun) {
          result.dryRun = value;
        }
        continue;
      }

      // String fields
      if (TEXT_FIELDS.includes(key as (typeof TEXT_FIELDS)[number])) {
        if (value !== null && typeof value !== 'string') {
          throw new Error(`Payload field '${key}' must be a string or null.`);
        }
      } else if (typeof value !== 'string') {
        throw new Error(`Payload field '${key}' must be a string.`);
      }

      const currentVal = (result as Record<string, unknown>)[key];
      if (currentVal === null || currentVal === '') {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Set default issue type
  if (!result.issueType) {
    result.issueType = ISSUE_TYPE_PROBLEM;
  }
  if (!ISSUE_TYPES.includes(result.issueType as (typeof ISSUE_TYPES)[number])) {
    throw new Error(`Invalid issue_type: ${result.issueType}`);
  }

  // Resolve @-prefixed file values
  for (const fieldName of TEXT_FIELDS) {
    const resultObj = result as Record<string, unknown>;
    const val = resultObj[fieldName] as string | null;
    resultObj[fieldName] = readAtFileValue(fieldName, val);
  }

  // Title is required
  if (!(result.title || '').trim()) {
    throw new Error('Issue title is required. Pass --title or include title in --payload-file.');
  }

  return result;
}

async function resolveRepoAsync(
  explicitRepo: string | null,
  context: ToolContext,
): Promise<string> {
  if (explicitRepo) return validateRepo(explicitRepo);

  // Try to resolve from git remote
  const result = await runCommand('git', ['remote', 'get-url', 'origin']);
  if (result.exitCode !== 0) {
    context.stderr!.write(
      'Unable to resolve origin remote. Pass --repo owner/repo.\n',
    );
    throw new Error('--repo resolution failed');
  }

  const remote = result.stdout.trim();
  const match = remote.match(
    /github\.com[:/](?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$/,
  );
  if (!match?.groups) {
    context.stderr!.write(
      'Origin remote is not a GitHub repository. Pass --repo owner/repo.\n',
    );
    throw new Error('--repo resolution failed');
  }

  return `${match.groups.owner}/${match.groups.repo}`;
}

// ---- Main handler ----

interface IssueResult {
  repo: string;
  issue_type: string;
  language: string;
  mode: string;
  issue_url: string;
  issue_title: string;
  issue_body: string;
  publish_error: string;
}

const schema = {
  options: {
    'payload-file': { type: 'string' as const },
    title: { type: 'string' as const },
    'issue-type': { type: 'string' as const },
    'problem-description': { type: 'string' as const },
    'suspected-cause': { type: 'string' as const },
    reproduction: { type: 'string' as const },
    proposal: { type: 'string' as const },
    reason: { type: 'string' as const },
    'suggested-architecture': { type: 'string' as const },
    impact: { type: 'string' as const },
    evidence: { type: 'string' as const },
    'suggested-action': { type: 'string' as const },
    severity: { type: 'string' as const },
    'affected-scope': { type: 'string' as const },
    repo: { type: 'string' as const },
    'dry-run': { type: 'boolean' as const },
  },
  allowPositionals: true,
  usage: 'apltk open-github-issue [options]',
  description: 'Publish or draft a structured GitHub issue.',
  handler: async (
    values: Record<string, unknown>,
    _positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const { stdout, stderr, env } = context;

    let args: OpenIssueArgs;
    try {
      args = hydrateArgs({
        payloadFile: (values['payload-file'] as string) ?? null,
        title: (values.title as string) ?? null,
        issueType: (values['issue-type'] as string) ?? null,
        problemDescription: (values['problem-description'] as string) ?? null,
        suspectedCause: (values['suspected-cause'] as string) ?? null,
        reproduction: (values.reproduction as string) ?? null,
        proposal: (values.proposal as string) ?? null,
        reason: (values.reason as string) ?? null,
        suggestedArchitecture: (values['suggested-architecture'] as string) ?? null,
        impact: (values.impact as string) ?? null,
        evidence: (values.evidence as string) ?? null,
        suggestedAction: (values['suggested-action'] as string) ?? null,
        severity: (values.severity as string) ?? null,
        affectedScope: (values['affected-scope'] as string) ?? null,
        repo: (values.repo as string) ?? null,
        dryRun: values['dry-run'] === true,
      });
      validateIssueContent(args);
    } catch (err) {
      stderr!.write(`Error: ${(err as Error).message}\n`);
      return 1;
    }

    const ghAuthenticated = await hasGhAuth();
    const token = getToken(env || {});

    let repo: string;
    try {
      repo = await resolveRepoAsync(args.repo, context);
    } catch {
      return 1;
    }

    const readmeContent = await fetchRemoteReadme(repo, ghAuthenticated, token);
    const language = detectIssueLanguage(readmeContent);

    const issueBody = buildIssueBody({
      issueType: args.issueType || ISSUE_TYPE_PROBLEM,
      language,
      title: args.title || '',
      problemDescription: args.problemDescription,
      suspectedCause: args.suspectedCause,
      reproduction: args.reproduction,
      proposal: args.proposal,
      reason: args.reason,
      suggestedArchitecture: args.suggestedArchitecture,
      impact: args.impact,
      evidence: args.evidence,
      suggestedAction: args.suggestedAction,
      severity: args.severity,
      affectedScope: args.affectedScope,
    });

    let mode = 'draft-only';
    let issueUrl = '';
    let publishError = '';

    if (args.dryRun) {
      mode = 'dry-run';
    } else if (ghAuthenticated) {
      try {
        issueUrl = await createIssueWithGh(repo, args.title || '', issueBody);
        mode = 'gh-cli';
      } catch (exc) {
        if (token) {
          try {
            issueUrl = await createIssueWithToken(
              repo,
              args.title || '',
              issueBody,
              token,
            );
            mode = 'github-token';
          } catch (tokenExc) {
            publishError = (tokenExc as Error).message;
          }
        } else {
          publishError = (exc as Error).message;
        }
      }
    } else if (token) {
      try {
        issueUrl = await createIssueWithToken(
          repo,
          args.title || '',
          issueBody,
          token,
        );
        mode = 'github-token';
      } catch (exc) {
        publishError = (exc as Error).message;
      }
    }

    const output: IssueResult = {
      repo,
      issue_type: args.issueType || ISSUE_TYPE_PROBLEM,
      language: language === 'zh' ? 'zh' : 'en',
      mode,
      issue_url: issueUrl,
      issue_title: args.title || '',
      issue_body: issueBody,
      publish_error: publishError,
    };

    stdout!.write(JSON.stringify(output, null, 2) + '\n');

    if (mode === 'draft-only') {
      if (publishError) {
        stderr!.write(
          `Issue publish failed. Return draft only: ${publishError}\n`,
        );
      } else {
        stderr!.write(
          'No authenticated gh CLI session and no GitHub token found. ' +
            'Return draft issue body only.\n',
        );
      }
    }

    return 0;
  },
};

// ---- Tool definition ----

const FLAG_MAP: Record<string, { flag: string; type: 'string' | 'boolean' }> = {
  payloadFile:         { flag: '--payload-file',          type: 'string' },
  title:               { flag: '--title',                 type: 'string' },
  issueType:           { flag: '--issue-type',            type: 'string' },
  problemDescription:  { flag: '--problem-description',   type: 'string' },
  suspectedCause:      { flag: '--suspected-cause',       type: 'string' },
  reproduction:        { flag: '--reproduction',          type: 'string' },
  proposal:            { flag: '--proposal',              type: 'string' },
  reason:              { flag: '--reason',                type: 'string' },
  suggestedArchitecture: { flag: '--suggested-architecture', type: 'string' },
  impact:              { flag: '--impact',                type: 'string' },
  evidence:            { flag: '--evidence',              type: 'string' },
  suggestedAction:     { flag: '--suggested-action',      type: 'string' },
  severity:            { flag: '--severity',              type: 'string' },
  affectedScope:       { flag: '--affected-scope',        type: 'string' },
  repo:                { flag: '--repo',                  type: 'string' },
  dryRun:              { flag: '--dry-run',               type: 'boolean' },
};

function buildArgsFromYargs(argv: Record<string, unknown>): string[] {
  const args: string[] = [];
  for (const [camel, { flag, type }] of Object.entries(FLAG_MAP)) {
    const value = argv[camel];
    if (type === 'boolean') {
      if (value) args.push(flag);
    } else if (value !== undefined && value !== null) {
      args.push(flag, String(value));
    }
  }
  return args;
}

export const tool: ToolDefinition = {
  name: 'open-github-issue',
  category: 'GitHub workflows',
  description: 'Publish or draft a structured GitHub issue.',
  handler: createToolRunner(schema),
};
