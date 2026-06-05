import { execFile } from 'node:child_process';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { SystemError } from '@laitszkin/tool-utils';

const ISSUE_FIELDS = 'number,title,state,updatedAt,url,labels,assignees';

interface FindIssuesArgs {
  repo: string | null;
  state: string;
  limit: number;
  label: string[];
  search: string | null;
  output: 'table' | 'json';
}

function parseArgs(argv: string[]): FindIssuesArgs {
  const args: FindIssuesArgs = {
    repo: null,
    state: 'open',
    limit: 50,
    label: [],
    search: null,
    output: 'table',
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--repo':
        if (i + 1 < argv.length) args.repo = argv[++i];
        break;
      case '--state':
        if (i + 1 < argv.length) {
          const val = argv[++i];
          if (['open', 'closed', 'all'].includes(val)) args.state = val;
        }
        break;
      case '--limit':
        if (i + 1 < argv.length) {
          const n = parseInt(argv[++i], 10);
          if (n > 0) args.limit = n;
        }
        break;
      case '--label':
        if (i + 1 < argv.length) args.label.push(argv[++i]);
        break;
      case '--search':
        if (i + 1 < argv.length) args.search = argv[++i];
        break;
      case '--output':
        if (i + 1 < argv.length) {
          const val = argv[++i];
          if (val === 'table' || val === 'json') args.output = val;
        }
        break;
      default:
        break;
    }
    i++;
  }

  return args;
}

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

function buildCommand(args: FindIssuesArgs): string[] {
  const cmd: string[] = [
    'issue',
    'list',
    '--state',
    args.state,
    '--limit',
    String(args.limit),
    '--json',
    ISSUE_FIELDS,
  ];

  if (args.repo) {
    cmd.push('--repo', args.repo);
  }
  for (const label of args.label) {
    cmd.push('--label', label);
  }
  if (args.search) {
    cmd.push('--search', args.search);
  }

  return cmd;
}

function truncate(text: string, width: number): string {
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return text.slice(0, width - 3) + '...';
}

function formatLabels(issue: Record<string, unknown>): string {
  const labels = issue.labels as Array<Record<string, unknown>> | undefined;
  if (!labels) return '';
  const names = labels
    .map((item) => String(item.name || ''))
    .filter(Boolean);
  return names.join(',');
}

function formatAssignees(issue: Record<string, unknown>): string {
  const assignees = issue.assignees as Array<Record<string, unknown>> | undefined;
  if (!assignees) return '-';
  const logins = assignees
    .map((item) => String(item.login || ''))
    .filter(Boolean);
  return logins.length > 0 ? logins.join(',') : '-';
}

function printTable(
  issues: Array<Record<string, unknown>>,
  context: ToolContext,
): void {
  const { stdout } = context;
  const columns = {
    number: 7,
    title: 54,
    labels: 22,
    assignees: 18,
    updated: 20,
  };

  const header =
    `${'NUMBER'.padEnd(columns.number)} ` +
    `${'TITLE'.padEnd(columns.title)} ` +
    `${'LABELS'.padEnd(columns.labels)} ` +
    `${'ASSIGNEES'.padEnd(columns.assignees)} ` +
    `${'UPDATED'.padEnd(columns.updated)}`;
  stdout!.write(header + '\n');
  stdout!.write('-'.repeat(header.length) + '\n');

  for (const issue of issues) {
    const number = `#${issue.number ?? ''}`;
    const title = truncate(String(issue.title ?? ''), columns.title);
    const labels = truncate(formatLabels(issue), columns.labels);
    const assignees = truncate(formatAssignees(issue), columns.assignees);
    const updated = truncate(String(issue.updatedAt ?? ''), columns.updated);

    const row =
      `${number.padEnd(columns.number)} ` +
      `${title.padEnd(columns.title)} ` +
      `${labels.padEnd(columns.labels)} ` +
      `${assignees.padEnd(columns.assignees)} ` +
      `${updated.padEnd(columns.updated)}`;
    stdout!.write(row + '\n');
  }
}

/**
 * findGitHubIssuesHandler — Known carryover from createToolRunner migration.
 *
 * Reason for not using createToolRunner:
 * - This tool uses a simple flat argument set. Migration would be
 *   straightforward but is deferred — the hand-rolled parseArgs (49 lines)
 *   is stable and well-tested.
 * - Error handling uses SystemError (typed) which propagates correctly
 *   to the CLI boundary's formatAppError.
 */
export async function findGitHubIssuesHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const { stdout, stderr } = context;
  const args = parseArgs(argv);

  const cmd = buildCommand(args);
  const result = await runGh(cmd);

  if (result.exitCode !== 0) {
    throw new SystemError(result.stderr.trim() || 'gh issue list failed');
  }

  let issues: Array<Record<string, unknown>>;
  try {
    issues = JSON.parse(result.stdout);
  } catch {
    throw new SystemError('Unable to parse gh output as JSON');
  }

  if (args.output === 'json') {
    stdout!.write(JSON.stringify(issues, null, 2) + '\n');
    return 0;
  }

  printTable(issues, context);
  return 0;
}

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'find-github-issues',
  category: 'GitHub workflows',
  description: 'List GitHub issues through gh.',
  handler: findGitHubIssuesHandler,
};
