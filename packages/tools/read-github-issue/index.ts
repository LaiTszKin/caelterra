import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { UserInputError } from '@laitszkin/tool-utils';

const ISSUE_FIELDS =
  'number,title,body,state,author,labels,assignees,comments,createdAt,updatedAt,closedAt,url';

interface ReadIssueArgs {
  issue: string | null;
  repo: string | null;
  comments: boolean;
  json: boolean;
}

function parseArgsFn(argv: string[]): ReadIssueArgs {
  const { values, positionals } = parseArgs({
    options: {
      repo: { type: 'string' },
      comments: { type: 'boolean' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  const issue = (positionals[0] as string | undefined) ?? null;

  return {
    issue,
    repo: (values.repo as string) ?? null,
    comments: values.comments === true,
    json: values.json === true,
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

function buildCommand(args: ReadIssueArgs): string[] {
  const cmd: string[] = [
    'issue',
    'view',
    args.issue || '',
    '--json',
    ISSUE_FIELDS,
  ];
  if (args.repo) {
    cmd.push('--repo', args.repo);
  }
  return cmd;
}

function joinNames(
  items: Array<Record<string, unknown>> | undefined,
  key: string,
): string {
  if (!items) return '-';
  const values = items
    .map((item) => String(item[key] || ''))
    .filter(Boolean);
  return values.length > 0 ? values.join(', ') : '-';
}

function printSummary(
  issue: Record<string, unknown>,
  includeComments: boolean,
  context: ToolContext,
): void {
  const { stdout } = context;

  stdout!.write(`Number: #${issue.number ?? ''}\n`);
  stdout!.write(`Title: ${issue.title ?? ''}\n`);
  stdout!.write(`State: ${issue.state ?? ''}\n`);
  stdout!.write(`URL: ${issue.url ?? ''}\n`);

  const author = (issue.author as Record<string, unknown> | undefined)?.login ?? '-';
  stdout!.write(`Author: ${author}\n`);
  stdout!.write(`Labels: ${joinNames(issue.labels as Array<Record<string, unknown>> | undefined, 'name')}\n`);
  stdout!.write(`Assignees: ${joinNames(issue.assignees as Array<Record<string, unknown>> | undefined, 'login')}\n`);
  stdout!.write(`Created: ${issue.createdAt ?? ''}\n`);
  stdout!.write(`Updated: ${issue.updatedAt ?? ''}\n`);
  stdout!.write(`Closed: ${issue.closedAt ?? '-'}\n`);
  stdout!.write('\n');
  stdout!.write('Body:\n');
  stdout!.write(`${(issue.body as string) || '-'}\n`);

  if (includeComments) {
    const comments = issue.comments as Array<Record<string, unknown>> | undefined;
    stdout!.write('\n');
    stdout!.write(`Comments (${comments?.length ?? 0}):\n`);

    if (!comments || comments.length === 0) {
      stdout!.write('-\n');
      return;
    }

    for (const comment of comments) {
      const commentAuthor = (comment.author as Record<string, unknown> | undefined)?.login ?? '-';
      const created = comment.createdAt ?? '';
      const body = (comment.body as string) || '-';
      stdout!.write(`- [${created}] ${commentAuthor}: ${body}\n`);
    }
  }
}

export async function readGitHubIssueHandler(
  argv: string[],
  context: ToolContext,
): Promise<number> {
  const { stdout, stderr } = context;

  try {
    const args = parseArgsFn(argv);

    if (!args.issue) {
      throw new UserInputError('Issue number or URL is required.');
    }

    const cmd = buildCommand(args);
    const result = await runGh(cmd);

    if (result.exitCode !== 0) {
      throw new UserInputError(result.stderr.trim() || 'gh issue view failed.');
    }

    let issue: Record<string, unknown>;
    try {
      issue = JSON.parse(result.stdout);
    } catch {
      throw new UserInputError('Unable to parse gh output as JSON.');
    }

    if (args.json) {
      stdout!.write(JSON.stringify(issue, null, 2) + '\n');
      return 0;
    }

    printSummary(issue, args.comments, context);
    return 0;
  } catch (err) {
    stderr!.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'read-github-issue',
  category: 'GitHub workflows',
  description: 'Read GitHub issue details through gh.',
  handler: readGitHubIssueHandler,
};
