import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { createToolRunner } from '@laitszkin/tool-utils';

const ISSUE_FIELDS = 'number,title,state,updatedAt,url,labels,assignees';

interface FindIssuesArgs {
  repo: string | null;
  state: string;
  limit: number;
  label: string[];
  search: string | null;
  output: 'table' | 'json';
}

// Holds the raw argv for re-parsing the --label option with multiple:true,
// since SchemaOption does not support the `multiple` property.
let _rawArgs: string[] = [];

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

const schema = {
  options: {
    repo: { type: 'string' as const },
    state: { type: 'string' as const },
    limit: { type: 'string' as const },
    label: { type: 'string' as const },
    search: { type: 'string' as const },
    output: { type: 'string' as const },
  },
  allowPositionals: true,
  usage: 'apltk find-github-issues [options]',
  description: 'List GitHub issues through gh.',
  handler: async (
    values: Record<string, unknown>,
    _positionals: string[],
    context: ToolContext,
  ): Promise<number> => {
    const { stdout, stderr } = context;

    // Re-parse --label with multiple:true from raw args
    const { values: parsed } = parseArgs({
      args: _rawArgs,
      options: { label: { type: 'string', multiple: true } },
      strict: false,
      allowPositionals: true,
    });
    const labels = (parsed.label as string[]) ?? [];

    const args: FindIssuesArgs = {
      repo: (values.repo as string) ?? null,
      state: (values.state as string | undefined) ?? 'open',
      limit: values.limit ? parseInt(values.limit as string, 10) : 50,
      label: labels,
      search: (values.search as string) ?? null,
      output: ((values.output as string | undefined) ?? 'table') as 'table' | 'json',
    };

    const cmd = buildCommand(args);
    const result = await runGh(cmd);

    if (result.exitCode !== 0) {
      stderr!.write(result.stderr.trim() || 'gh issue list failed.\n');
      return result.exitCode;
    }

    let issues: Array<Record<string, unknown>>;
    try {
      issues = JSON.parse(result.stdout);
    } catch {
      stderr!.write('Error: unable to parse gh output as JSON.\n');
      return 1;
    }

    if (args.output === 'json') {
      stdout!.write(JSON.stringify(issues, null, 2) + '\n');
      return 0;
    }

    printTable(issues, context);
    return 0;
  },
};

const _runner = createToolRunner(schema);

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'find-github-issues',
  category: 'GitHub workflows',
  description: 'List GitHub issues through gh.',
  handler: async (args, context) => {
    _rawArgs = args;
    return _runner(args, context);
  },
};
