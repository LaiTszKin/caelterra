import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError } from '@laitszkin/tool-utils';

const ISSUE_FIELDS = 'number,title,state,updatedAt,url,labels,assignees';

interface FindIssuesArgs {
  repo: string | null;
  state: string;
  limit: number;
  label: string[];
  search: string | null;
  output: 'table' | 'json';
}

function parseArgsFn(argv: string[]): FindIssuesArgs {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string' },
      state: { type: 'string' },
      limit: { type: 'string' },
      label: { type: 'string', multiple: true },
      search: { type: 'string' },
      output: { type: 'string' },
    },
    allowPositionals: true,
  });

  const state = (values.state as string | undefined) ?? 'open';
  if (state !== 'open' && state !== 'closed' && state !== 'all') {
    throw new UserInputError(`Invalid state: ${state}. Use open, closed, or all.`);
  }

  const limit = values.limit ? parseInt(values.limit as string, 10) : 50;
  if (limit <= 0) {
    throw new UserInputError('Invalid limit: must be a positive number.');
  }

  const output = (values.output as string | undefined) ?? 'table';
  if (output !== 'table' && output !== 'json') {
    throw new UserInputError(`Invalid output: ${output}. Use table or json.`);
  }

  return {
    repo: (values.repo as string) ?? null,
    state,
    limit,
    label: (values.label as string[]) ?? [],
    search: (values.search as string) ?? null,
    output,
  };
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

export async function findGitHubIssuesHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const { stdout, stderr } = context;

  try {
    const args = parseArgsFn(argv);

    const cmd = buildCommand(args);
    const result = await runGh(cmd);

    if (result.exitCode !== 0) {
      throw new UserInputError(result.stderr.trim() || 'gh issue list failed.');
    }

    let issues: Array<Record<string, unknown>>;
    try {
      issues = JSON.parse(result.stdout);
    } catch {
      throw new UserInputError('Unable to parse gh output as JSON.');
    }

    if (args.output === 'json') {
      stdout!.write(JSON.stringify(issues, null, 2) + '\n');
      return 0;
    }

    printTable(issues, context);
    return 0;
  } catch (err) {
    stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'find-github-issues',
  category: 'GitHub workflows',
  description: 'List GitHub issues through gh.',
  handler: findGitHubIssuesHandler,
};
