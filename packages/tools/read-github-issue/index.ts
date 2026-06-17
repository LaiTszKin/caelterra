import { execFile } from 'node:child_process';
import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import {
  UserInputError,
  SystemError,
  createToolRunner,
} from '@laitszkin/tool-utils';
const ISSUE_FIELDS =
  'number,title,body,state,author,labels,assignees,comments,createdAt,updatedAt,closedAt,url';

interface ReadIssueArgs {
  issue: string | null;
  repo: string | null;
  comments: boolean;
  json: boolean;
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
            exitCode:
              (error as NodeJS.ErrnoException & { status?: number }).status ??
              1,
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
    .map((item) => (typeof item[key] === 'string' ? item[key] : ''))
    .filter(Boolean);
  return values.length > 0 ? values.join(', ') : '-';
}

function printSummary(
  issue: Record<string, unknown>,
  includeComments: boolean,
  context: ToolContext,
): void {
  const stdout = context.stdout ?? process.stdout;

  const issueNumber =
    typeof issue['number'] === 'string' ? issue['number'] : '';
  const issueTitle = typeof issue['title'] === 'string' ? issue['title'] : '';
  const issueState = typeof issue['state'] === 'string' ? issue['state'] : '';
  const issueUrl = typeof issue['url'] === 'string' ? issue['url'] : '';
  stdout.write(`Number: #${issueNumber}\n`);
  stdout.write(`Title: ${issueTitle}\n`);
  stdout.write(`State: ${issueState}\n`);
  stdout.write(`URL: ${issueUrl}\n`);

  const authorObj = issue['author'] as Record<string, unknown> | undefined;
  const author =
    typeof authorObj?.['login'] === 'string' ? authorObj['login'] : '-';
  stdout.write(`Author: ${author}\n`);
  stdout.write(
    `Labels: ${joinNames(issue['labels'] as Array<Record<string, unknown>> | undefined, 'name')}\n`,
  );
  stdout.write(
    `Assignees: ${joinNames(issue['assignees'] as Array<Record<string, unknown>> | undefined, 'login')}\n`,
  );

  const created =
    typeof issue['createdAt'] === 'string' ? issue['createdAt'] : '';
  const updated =
    typeof issue['updatedAt'] === 'string' ? issue['updatedAt'] : '';
  const closed =
    typeof issue['closedAt'] === 'string' ? issue['closedAt'] : '-';
  stdout.write(`Created: ${created}\n`);
  stdout.write(`Updated: ${updated}\n`);
  stdout.write(`Closed: ${closed}\n`);
  stdout.write('\n');
  stdout.write('Body:\n');
  stdout.write(`${(issue['body'] as string) || '-'}\n`);

  if (includeComments) {
    const comments = issue['comments'] as
      | Array<Record<string, unknown>>
      | undefined;
    stdout.write('\n');
    stdout.write(`Comments (${String(comments?.length ?? 0)}):\n`);

    if (!comments || comments.length === 0) {
      stdout.write('-\n');
      return;
    }

    for (const comment of comments) {
      const commentAuthorObj = comment['author'] as
        | Record<string, unknown>
        | undefined;
      const commentAuthor =
        typeof commentAuthorObj?.['login'] === 'string'
          ? commentAuthorObj['login']
          : '-';
      const commentCreated =
        typeof comment['createdAt'] === 'string' ? comment['createdAt'] : '';
      const body = (comment['body'] as string) || '-';
      stdout.write(`- [${commentCreated}] ${commentAuthor}: ${body}\n`);
    }
  }
}

/**
 * readGitHubIssueHandler — Wrapped in createToolRunner for schema-based
 * argument parsing. The schema (see tool export) declares --repo, --json,
 * --comments, and --help. Positional <issue> argument comes via positionals[0].
 *
 * Error handling uses UserInputError/SystemError which propagate through
 * createToolRunner's catch block to formatAppError.
 */
export async function readGitHubIssueHandler(
  args: ReadIssueArgs,
  context: ToolContext,
): Promise<number> {
  const stdout = context.stdout ?? process.stdout;

  if (!args.issue) {
    throw new UserInputError('Issue number or URL is required.');
  }

  const cmd = buildCommand(args);
  const result = await runGh(cmd);

  if (result.exitCode !== 0) {
    throw new SystemError(result.stderr.trim() || 'gh issue view failed');
  }

  let issue: Record<string, unknown>;
  try {
    issue = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    throw new SystemError('Unable to parse gh output as JSON');
  }

  if (args.json) {
    stdout.write(JSON.stringify(issue, null, 2) + '\n');
    return 0;
  }

  printSummary(issue, args.comments, context);
  return 0;
}

// ---- Tool definition ----

export const tool: ToolDefinition = {
  name: 'read-github-issue',
  category: 'GitHub workflows',
  description: 'Read GitHub issue details through gh.',
  handler: createToolRunner({
    options: {
      repo: { type: 'string' as const },
      json: { type: 'boolean' as const },
      comments: { type: 'boolean' as const },
    },
    allowPositionals: true,
    usage: 'apltk read-github-issue [options] <issue>',
    description: 'Read GitHub issue details through gh.',
    handler: (values, positionals, context) => {
      const args: ReadIssueArgs = {
        issue: positionals[0] || null,
        repo: (values['repo'] as string) || null,
        comments: values['comments'] === true,
        json: values['json'] === true,
      };
      return readGitHubIssueHandler(args, context);
    },
  }),
};
