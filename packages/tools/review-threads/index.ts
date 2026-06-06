/*
 * review-threads — Carryover tool migrated from the pre-monorepo CLI
 * architecture (originally resolve-review-comments/scripts/review_threads.py).
 *
 * Carryover status (Round 16, 2026-06-06):
 * - Added --help/-h support for subcommand-based usage.
 * - Stdout/stderr invariant: resolved data -> stdout, failures -> stderr.
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';

const LIST_QUERY = `
query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 20) {
            nodes {
              id
              url
              body
              author {
                login
              }
              createdAt
              path
              line
              outdated
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
`;

const RESOLVE_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread {
      id
      isResolved
    }
  }
}
`;

interface ReviewThreadsArgs {
  command: string;
  repo: string | null;
  pr: number | null;
  state: string;
  output: 'table' | 'json';
  threadId: string[];
  threadIdFile: string | null;
  allUnresolved: boolean;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ReviewThreadsArgs {
  const args: ReviewThreadsArgs = {
    command: '',
    repo: null,
    pr: null,
    state: 'unresolved',
    output: 'table',
    threadId: [],
    threadIdFile: null,
    allUnresolved: false,
    dryRun: false,
    help: false,
  };

  // Check for --help/-h before positional parsing
  if (argv.includes('--help') || argv.includes('-h')) {
    args.help = true;
    return args;
  }

  // First argument is the subcommand (list/resolve)
  let i = 0;
  if (i < argv.length && !argv[i].startsWith('-')) {
    args.command = argv[i++];
  }

  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--repo':
        if (i + 1 < argv.length) args.repo = argv[++i];
        break;
      case '--pr':
        if (i + 1 < argv.length) {
          const n = parseInt(argv[++i], 10);
          if (n > 0) args.pr = n;
        }
        break;
      case '--state':
        if (i + 1 < argv.length) {
          const val = argv[++i];
          if (['unresolved', 'resolved', 'all'].includes(val)) args.state = val;
        }
        break;
      case '--output':
        if (i + 1 < argv.length) {
          const val = argv[++i];
          if (val === 'table' || val === 'json') args.output = val;
        }
        break;
      case '--thread-id':
        if (i + 1 < argv.length) args.threadId.push(argv[++i]);
        break;
      case '--thread-id-file':
        if (i + 1 < argv.length) args.threadIdFile = argv[++i];
        break;
      case '--all-unresolved':
        args.allUnresolved = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      default:
        break;
    }
    i++;
  }

  return args;
}

// ---- Utilities ----

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runGh(cmdArgs: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      'gh',
      cmdArgs,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: (error as NodeJS.ErrnoException & { status?: number }).status ?? 1,
          });
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: 0 });
        }
      },
    );
  });
}

function runGhJson(cmdArgs: string[]): Promise<Record<string, unknown>> {
  return runGh(cmdArgs).then((result) => {
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'gh command failed');
    }
    try {
      return JSON.parse(result.stdout);
    } catch (exc) {
      throw new Error('Failed to parse gh JSON output');
    }
  });
}

function parseOwnerRepo(repo: string): [string, string] {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('repo must be in owner/name format');
  }
  return [parts[0], parts[1]];
}

async function resolveRepo(repo: string | null): Promise<string> {
  if (repo) {
    parseOwnerRepo(repo);
    return repo;
  }

  const result = await runGh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'Unable to resolve current repo');
  }
  return result.stdout.trim();
}

async function resolvePrNumber(repo: string, pr: number | null): Promise<number> {
  if (pr !== null) return pr;

  const result = await runGh([
    'pr',
    'view',
    '--repo',
    repo,
    '--json',
    'number',
    '--jq',
    '.number',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      'Unable to infer PR number from current branch context',
    );
  }
  return parseInt(result.stdout.trim(), 10);
}

function ghGraphql(
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cmdArgs = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    cmdArgs.push('-F', `${key}=${JSON.stringify(value)}`);
  }
  return runGhJson(cmdArgs);
}

// ---- Thread fetching ----

async function fetchReviewThreads(
  repo: string,
  prNumber: number,
): Promise<Array<Record<string, unknown>>> {
  const [owner, name] = parseOwnerRepo(repo);
  const threads: Array<Record<string, unknown>> = [];
  let after: string | null = null;

  while (true) {
    const payload = await ghGraphql(LIST_QUERY, {
      owner,
      name,
      number: prNumber,
      after,
    });

    const pr = (payload.data as Record<string, unknown>)?.repository as Record<string, unknown> | undefined;
    if (!pr) {
      throw new Error(`PR #${prNumber} not found in ${repo}`);
    }

    const reviewThreads = pr.reviewThreads as Record<string, unknown>;
    const nodes = (reviewThreads.nodes as Array<Record<string, unknown>>) || [];
    threads.push(...nodes);

    const pageInfo = reviewThreads.pageInfo as Record<string, unknown>;
    if (!pageInfo.hasNextPage) break;
    after = (pageInfo.endCursor as string) || null;
    if (!after) break;
  }

  return threads;
}

function filterThreads(
  threads: Array<Record<string, unknown>>,
  state: string,
): Array<Record<string, unknown>> {
  if (state === 'all') return threads;
  if (state === 'resolved') {
    return threads.filter((item) => item.isResolved);
  }
  return threads.filter((item) => !item.isResolved);
}

function normalizeThread(
  thread: Record<string, unknown>,
): Record<string, unknown> {
  const commentNodes = (thread.comments as Record<string, unknown>)?.nodes as
    | Array<Record<string, unknown>>
    | undefined;
  const normalizedComments = (commentNodes || []).map((comment) => ({
    id: comment.id,
    url: comment.url,
    author: ((comment.author as Record<string, unknown>)?.login as string) || null,
    body: comment.body || '',
    created_at: comment.createdAt,
    path: comment.path,
    line: comment.line,
    outdated: comment.outdated,
  }));

  return {
    thread_id: thread.id,
    is_resolved: thread.isResolved,
    is_outdated: thread.isOutdated,
    path: thread.path,
    line: thread.line,
    start_line: thread.startLine,
    comments: normalizedComments,
  };
}

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return text.slice(0, width - 3) + '...';
}

function previewBody(thread: Record<string, unknown>): string {
  const comments = thread.comments as Array<Record<string, unknown>> | undefined;
  if (!comments || comments.length === 0) return '-';
  const body = (comments[0].body as string || '').replace(/\n/g, ' ').trim();
  return truncate(body || '-', 72);
}

function renderLocation(thread: Record<string, unknown>): string {
  const path = (thread.path as string) || '-';
  const line = thread.line;
  if (line == null) return path;
  return `${path}:${line}`;
}

function printTable(
  threads: Array<Record<string, unknown>>,
  context: ToolContext,
): void {
  const { stdout } = context;
  const widths = {
    idx: 4,
    thread: 12,
    location: 36,
    author: 18,
    preview: 72,
  };

  const header =
    `${'#'.padEnd(widths.idx)} ` +
    `${'THREAD_ID'.padEnd(widths.thread)} ` +
    `${'LOCATION'.padEnd(widths.location)} ` +
    `${'AUTHOR'.padEnd(widths.author)} ` +
    `${'COMMENT_PREVIEW'.padEnd(widths.preview)}`;
  stdout!.write(header + '\n');
  stdout!.write('-'.repeat(header.length) + '\n');

  for (let idx = 0; idx < threads.length; idx++) {
    const thread = threads[idx];
    const comments = thread.comments as Array<Record<string, unknown>> | undefined;
    const author = comments?.[0]?.author ?? '-';

    const row =
      `${String(idx + 1).padEnd(widths.idx)} ` +
      `${truncate(String(thread.thread_id ?? '-'), widths.thread).padEnd(widths.thread)} ` +
      `${truncate(renderLocation(thread), widths.location).padEnd(widths.location)} ` +
      `${truncate(String(author ?? '-'), widths.author).padEnd(widths.author)} ` +
      `${previewBody(thread).padEnd(widths.preview)}`;
    stdout!.write(row + '\n');
  }
}

// ---- Thread ID loading ----

function loadThreadIds(filePath: string): string[] {
  const raw = readFileSync(filePath, 'utf-8');
  const payload = JSON.parse(raw);

  let ids: unknown[];
  if (Array.isArray(payload)) {
    ids = payload;
  } else if (typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.thread_ids)) {
      ids = p.thread_ids;
    } else if (Array.isArray(p.adopted_thread_ids)) {
      ids = p.adopted_thread_ids;
    } else if (Array.isArray(p.threads)) {
      ids = (p.threads as Array<Record<string, unknown>>)
        .filter((item) => typeof item === 'object' && item !== null)
        .map((item) => item.thread_id)
        .filter((id) => id !== undefined);
    } else {
      throw new Error(
        'JSON must include thread_ids, adopted_thread_ids, or threads',
      );
    }
  } else {
    throw new Error('Unsupported JSON payload for thread IDs');
  }

  const output = ids
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return [...new Set(output)];
}

function collectThreadIds(
  args: ReviewThreadsArgs,
  unresolvedThreads: Array<Record<string, unknown>>,
): string[] {
  const ids: string[] = [];

  if (args.allUnresolved) {
    for (const item of unresolvedThreads) {
      if (item.thread_id) {
        ids.push(item.thread_id as string);
      }
    }
  }

  ids.push(...args.threadId);

  if (args.threadIdFile) {
    ids.push(...loadThreadIds(args.threadIdFile));
  }

  const normalized = ids.filter(Boolean);
  return [...new Set(normalized)];
}

async function resolveThreads(
  threadIds: string[],
  dryRun: boolean,
): Promise<{ resolved: string[]; failed: Array<Record<string, string>> }> {
  const resolved: string[] = [];
  const failed: Array<Record<string, string>> = [];

  for (const threadId of threadIds) {
    if (dryRun) {
      resolved.push(threadId);
      continue;
    }

    try {
      const payload = await ghGraphql(RESOLVE_MUTATION, { threadId });
      const thread = (
        payload.data as Record<string, unknown>
      )?.resolveReviewThread as Record<string, unknown> | undefined;
      if (!thread?.thread) {
        throw new Error('thread did not resolve');
      }
      const resolvedThread = thread.thread as Record<string, unknown>;
      if (!resolvedThread.isResolved) {
        throw new Error('thread did not resolve');
      }
      resolved.push(threadId);
    } catch (exc) {
      failed.push({ thread_id: threadId, error: (exc as Error).message });
    }
  }

  return { resolved, failed };
}

// ---- Subcommands ----

async function cmdList(
  args: ReviewThreadsArgs,
  context: ToolContext,
): Promise<number> {
  const { stdout } = context;

  let repo: string;
  try {
    repo = await resolveRepo(args.repo);
  } catch (err) {
    context.stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  let prNumber: number;
  try {
    prNumber = await resolvePrNumber(repo, args.pr);
  } catch (err) {
    context.stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  let threads: Array<Record<string, unknown>>;
  try {
    threads = await fetchReviewThreads(repo, prNumber);
  } catch (err) {
    context.stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  const filtered = filterThreads(threads, args.state);
  const normalized = filtered.map(normalizeThread);

  const result = {
    repo,
    pr_number: prNumber,
    state: args.state,
    thread_count: normalized.length,
    threads: normalized,
  };

  if (args.output === 'json') {
    stdout!.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    stdout!.write(`Repository: ${repo}\n`);
    stdout!.write(`PR: #${prNumber}\n`);
    stdout!.write(`Threads (${args.state}): ${normalized.length}\n`);
    printTable(normalized, context);
  }

  return 0;
}

async function cmdResolve(
  args: ReviewThreadsArgs,
  context: ToolContext,
): Promise<number> {
  const { stdout } = context;

  let repo: string;
  try {
    repo = await resolveRepo(args.repo);
  } catch (err) {
    context.stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  let prNumber: number;
  try {
    prNumber = await resolvePrNumber(repo, args.pr);
  } catch (err) {
    context.stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  let threads: Array<Record<string, unknown>>;
  try {
    threads = await fetchReviewThreads(repo, prNumber);
  } catch (err) {
    context.stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }

  const unresolved = filterThreads(threads, 'unresolved').map(normalizeThread);
  const threadIds = collectThreadIds(args, unresolved);

  if (threadIds.length === 0) {
    context.stderr!.write(
      'Error: no thread IDs selected. Use --thread-id, --thread-id-file, or --all-unresolved.\n',
    );
    return 1;
  }

  const { resolved, failed } = await resolveThreads(threadIds, args.dryRun);

  stdout!.write(JSON.stringify({ resolved }, null, 2) + '\n');
  context.stderr!.write(JSON.stringify({ failed }, null, 2) + '\n');

  return failed.length > 0 ? 1 : 0;
}

// ---- Help ----

function printHelp(stdout: NodeJS.WriteStream): void {
  stdout.write(`Usage: apltk review-threads <subcommand> [options]

List or resolve GitHub PR review threads.

Subcommands:
  list       List review threads for a pull request
  resolve    Resolve specific review threads

Options:
  --repo <owner/name>       GitHub repository (default: current repo)
  --pr <number>             PR number (default: current branch's PR)
  --state <unresolved|resolved|all>
                            Filter threads by state (default: unresolved)
  --output <table|json>     Output format for list (default: table)
  --thread-id <id>          Thread ID to resolve (may be repeated)
  --thread-id-file <path>   JSON file with thread IDs to resolve
  --all-unresolved          Resolve all unresolved threads
  --dry-run                 Simulate resolution without mutating
  --help, -h                Show this help message
`);
}

// ---- Main handler ----

export async function reviewThreadsHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const { stdout, stderr } = context;
  const args = parseArgs(argv);

  if (args.help) {
    printHelp(stdout!);
    return 0;
  }

  try {
    switch (args.command) {
      case 'list':
        return await cmdList(args, context);
      case 'resolve':
        return await cmdResolve(args, context);
      default:
        stderr!.write(`Unsupported command: ${args.command}\n`);
        return 1;
    }
  } catch (err) {
    stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'review-threads',
  category: 'GitHub workflows',
  description: 'List or resolve GitHub PR review threads.',
  handler: reviewThreadsHandler,
};
