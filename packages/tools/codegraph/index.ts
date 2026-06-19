import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { SystemError, UserInputError } from '@laitszkin/tool-utils';
import { findProjectRoot } from './lib/cg-instance.js';
import { handleInit } from './lib/cmd-init.js';
import { handleIndex } from './lib/cmd-index.js';
import { handleSync } from './lib/cmd-sync.js';
import { handleStatus } from './lib/cmd-status.js';
import { handleQuery } from './lib/cmd-query.js';
import { handleFiles } from './lib/cmd-files.js';
import { handleRelations } from './lib/cmd-relations.js';
import { handleImpact } from './lib/cmd-impact.js';
import { handleNode } from './lib/cmd-node.js';
import { handleContext } from './lib/cmd-context.js';

export async function codegraphHandler(
  args: string[],
  context: ToolContext,
): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  // Parse --json flag early (can appear anywhere)
  const jsonIndex = args.indexOf('--json');
  const isJson = jsonIndex >= 0;
  if (jsonIndex >= 0) args.splice(jsonIndex, 1);

  // Main help: no args, --help, -h, or "help" subcommand
  if (
    args.length === 0 ||
    args[0] === '--help' ||
    args[0] === '-h' ||
    args[0] === 'help'
  ) {
    printHelp(stdout);
    return 0;
  }

  const subcommand = args[0] ?? '';

  // Per-subcommand help: e.g., "apltk codegraph search --help"
  // Check for --help/-h at position 1 (after the subcommand name)
  const rest = args.slice(1);
  if (rest.includes('--help') || rest.includes('-h')) {
    printSubcommandHelp(subcommand, stdout, stderr);
    return 0;
  }

  // findProjectRoot uses git root as boundary, falls back to package.json
  // search. Only called after help checks so that --help works without
  // @colbymchenry/codegraph installed.
  let projectRoot: string;
  try {
    projectRoot = findProjectRoot(context.cwd || process.cwd());
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error finding project root';
    if (
      (error as { code?: string } | null)?.code === 'MODULE_NOT_FOUND' ||
      message.includes('Cannot find module')
    ) {
      throw new UserInputError(
        '`@colbymchenry/codegraph` is not installed. Run `npm install @colbymchenry/codegraph` in your project directory.',
      );
    }
    throw new SystemError(`Error finding project root: ${message}`);
  }

  // Parse --index flag for init
  const shouldIndex = rest.includes('--index');
  const indexIdx = rest.indexOf('--index');
  if (indexIdx >= 0) rest.splice(indexIdx, 1);

  // Parse limit for search
  const limitIndex = rest.indexOf('--limit');
  let limit: number | undefined;
  if (limitIndex >= 0 && limitIndex + 1 < rest.length) {
    const limitVal = rest[limitIndex + 1];
    limit = limitVal !== undefined ? parseInt(limitVal, 10) : undefined;
    rest.splice(limitIndex, 2);
  }

  const kindIndex = rest.indexOf('--kind');
  let kind: string | undefined;
  if (kindIndex >= 0 && kindIndex + 1 < rest.length) {
    kind = rest[kindIndex + 1];
    rest.splice(kindIndex, 2);
  }

  const depthIndex = rest.indexOf('--depth');
  let depth: number | undefined;
  if (depthIndex >= 0 && depthIndex + 1 < rest.length) {
    const depthVal = rest[depthIndex + 1];
    depth = depthVal !== undefined ? parseInt(depthVal, 10) : undefined;
    rest.splice(depthIndex, 2);
  }

  const filterIndex = rest.indexOf('--filter');
  let filter: string | undefined;
  if (filterIndex >= 0 && filterIndex + 1 < rest.length) {
    filter = rest[filterIndex + 1];
    rest.splice(filterIndex, 2);
  }

  const maxNodesIndex = rest.indexOf('--max-nodes');
  let maxNodes: number | undefined;
  if (maxNodesIndex >= 0 && maxNodesIndex + 1 < rest.length) {
    const maxNodesVal = rest[maxNodesIndex + 1];
    maxNodes =
      maxNodesVal !== undefined ? parseInt(maxNodesVal, 10) : undefined;
    rest.splice(maxNodesIndex, 2);
  }

  const includeCode = !rest.includes('--no-code');
  const noCodeIndex = rest.indexOf('--no-code');
  if (noCodeIndex >= 0) rest.splice(noCodeIndex, 1);

  try {
    switch (subcommand) {
      case 'init':
        return await handleInit(projectRoot, {
          index: shouldIndex,
          json: isJson,
        });

      case 'index':
        return await handleIndex(projectRoot, { json: isJson });

      case 'sync':
        return await handleSync(projectRoot, { json: isJson });

      case 'status':
        return await handleStatus(projectRoot, { json: isJson });

      case 'query':
      case 'search': {
        const query = rest.join(' ');
        if (!query) {
          throw new UserInputError(
            'Usage: apltk codegraph query <query> [--kind KIND] [--limit N] [--json]',
          );
        }
        return await handleQuery(projectRoot, query, {
          ...(kind !== undefined && { kind }),
          ...(limit !== undefined && { limit }),
          json: isJson,
        });
      }

      case 'files': {
        const filesFilter = filter || rest[0];
        return await handleFiles(projectRoot, {
          ...(filesFilter !== undefined && { filter: filesFilter }),
          json: isJson,
        });
      }

      case 'callers':
      case 'callees': {
        const symbol = rest.join(' ');
        if (!symbol) {
          throw new UserInputError(
            `Usage: apltk codegraph ${subcommand} <symbol> [--limit N] [--json]`,
          );
        }
        return await handleRelations(projectRoot, subcommand, symbol, {
          ...(limit !== undefined && { limit }),
          json: isJson,
        });
      }

      case 'impact': {
        const symbol = rest.join(' ');
        if (!symbol) {
          throw new UserInputError(
            'Usage: apltk codegraph impact <symbol> [--depth N] [--json]',
          );
        }
        return await handleImpact(projectRoot, symbol, {
          ...(depth !== undefined && { depth }),
          json: isJson,
        });
      }

      case 'node': {
        const symbol = rest.join(' ');
        if (!symbol) {
          throw new UserInputError(
            'Usage: apltk codegraph node <symbol-or-id> [--json]',
          );
        }
        return await handleNode(projectRoot, symbol, { json: isJson });
      }

      case 'context':
      case 'explore': {
        const query = rest.join(' ');
        if (!query) {
          throw new UserInputError(
            'Usage: apltk codegraph context <question> [--max-nodes N] [--no-code] [--json]',
          );
        }
        return await handleContext(projectRoot, query, {
          ...(maxNodes !== undefined && { maxNodes }),
          includeCode,
          json: isJson,
        });
      }

      default:
        throw new SystemError(
          `Unknown codegraph subcommand: ${subcommand || 'unknown'}`,
        );
    }
  } catch (error: unknown) {
    if (error instanceof SystemError || error instanceof UserInputError)
      throw error;
    throw new SystemError(
      error instanceof Error ? error.message : 'Unknown error in codegraph',
      { cause: error instanceof Error ? error : undefined },
    );
  }
}

function printHelp(stream: NodeJS.WriteStream): void {
  stream.write(`Usage: apltk codegraph <subcommand> [options]

CodeGraph code intelligence — local codebase exploration over symbols,
relationships, files, callers, callees, and impact radius.

Powered by @colbymchenry/codegraph (tree-sitter-backed code knowledge graph).

Subcommands:

  lifecycle:
    init               Initialize CodeGraph for the project
                       --index    Run initial indexing immediately after init
                       --json     JSON output

    index              Build or rebuild the full code graph index
                       --json     JSON output

    sync               Sync the index with current file state
                       --json     JSON output

    status             Show index statistics (files, nodes, edges, languages)
                       --json     JSON output

  discovery:
    query <query>      Search symbols via FTS5
                       --kind K   Filter by node kind (function, class, route...)
                       --limit N  Max results (default: 20)
                       --json     JSON output

    context <question> Build task-oriented context with related symbols and code
                       --max-nodes N  Max graph nodes (default: 50)
                       --no-code      Exclude source snippets
                       --json         JSON output

    files [path]       List indexed files, optionally filtered by path
                       --filter PATH  Filter to files under a path
                       --json         JSON output

    callers <symbol>   Find symbols that call a function or method
                       --limit N  Max results (default: 20)
                       --json     JSON output

    callees <symbol>   Find symbols called by a function or method
                       --limit N  Max results (default: 20)
                       --json     JSON output

    impact <symbol>    Analyze what code may be affected by changing a symbol
                       --depth N  Traversal depth (default: 2)
                       --json     JSON output

    node <symbol-or-id>
                       Show symbol details and source
                       --json     JSON output

Global options:
    --json             Output as JSON instead of human-readable format
    --help, -h         Show this help message

Use "apltk codegraph <subcommand> --help" for per-subcommand details.

Examples:
  apltk codegraph init
  apltk codegraph init --index
  apltk codegraph index
  apltk codegraph status --json
  apltk codegraph query getUser --kind function
  apltk codegraph context "How does login reach the database?"
  apltk codegraph callers handleLogin
  apltk codegraph impact UserService --depth 3
`);
}

function printSubcommandHelp(
  subcommand: string,
  stream: NodeJS.WriteStream,
  errStream: NodeJS.WriteStream,
): void {
  const helps: Record<string, string> = {
    init: `Usage: apltk codegraph init [--index] [--json]

Initialize the CodeGraph knowledge graph for the project.
Creates the .codegraph/ directory and SQLite database.

Flags:
  --index    Run initial indexing immediately after init, so the
             knowledge graph is ready for queries right away.
             Without this flag, you need to run "apltk codegraph index"
             separately before searching or exploring.
  --json     Output confirmation as JSON.

Examples:
  apltk codegraph init
  apltk codegraph init --index
`,
    index: `Usage: apltk codegraph index [--json]

Build or rebuild the full CodeGraph index for the project.

Flags:
  --json     Output indexing results as JSON.

Examples:
  apltk codegraph index
  apltk codegraph index --json
`,
    sync: `Usage: apltk codegraph sync [--json]

Sync the code graph index with the current state of files on disk.
Parses changed files and updates the SQLite database.

This is needed after you modify source files if you want queries
to reflect the latest code. Runs incrementally — only reprocesses
files whose mtime has changed.

Flags:
  --json     Output sync results (files added/removed/updated) as JSON.

Examples:
  apltk codegraph sync
  apltk codegraph sync --json
`,
    status: `Usage: apltk codegraph status [--json]

Show index statistics: file count, symbol (node) count, edge count,
languages detected, and last-sync timestamp.

Flags:
  --json     Output full statistics as a JSON object.

Examples:
  apltk codegraph status
  apltk codegraph status --json
`,
    query: `Usage: apltk codegraph query <query> [--kind KIND] [--limit N] [--json]

Full-text search the code graph for symbols.

Arguments:
  query      Search term (required). Matches against symbol names and
             source code content.

Flags:
  --kind K   Filter by node kind, such as function, class, method, or route.
  --limit N  Max results to return (default: 20).
  --json     Output results as a JSON array.

Examples:
  apltk codegraph query getUser
  apltk codegraph query handleLogin --kind function --limit 5
  apltk codegraph query UserService --json
`,
    search: `Usage: apltk codegraph search <query> [--kind KIND] [--limit N] [--json]

Alias for "apltk codegraph query". Prefer "query" in new scripts and skill instructions.
`,
    context: `Usage: apltk codegraph context <question> [--max-nodes N] [--no-code] [--json]

Build task-oriented context for an architecture or implementation question.
This uses CodeGraph's context builder: search likely entry points, expand the
relationship graph, and include relevant source snippets by default.

Arguments:
  question   Natural-language question or task description.

Flags:
  --max-nodes N  Max graph nodes to include (default: 50).
  --no-code      Exclude source snippets.
  --json         Output structured context as JSON.

Examples:
  apltk codegraph context "How does login reach the database?"
  apltk codegraph context "Where is billing authorization enforced?" --max-nodes 30
`,
    explore: `Usage: apltk codegraph explore <question> [--max-nodes N] [--no-code] [--json]

Alias for "apltk codegraph context". Prefer "context" in new scripts and skill instructions.
`,
    files: `Usage: apltk codegraph files [path] [--filter PATH] [--json]

List files currently tracked in the CodeGraph index.

Arguments:
  path       Optional path prefix to filter by.

Flags:
  --filter PATH  Filter to files under a path.
  --json         Output file records as JSON.

Examples:
  apltk codegraph files
  apltk codegraph files src/auth --json
`,
    callers: `Usage: apltk codegraph callers <symbol> [--limit N] [--json]

Find symbols that call the matched function or method.

Arguments:
  symbol     Symbol name to inspect.

Flags:
  --limit N  Max relation results per matched symbol (default: 20).
  --json     Output relation data as JSON.

Examples:
  apltk codegraph callers handleLogin
`,
    callees: `Usage: apltk codegraph callees <symbol> [--limit N] [--json]

Find symbols called by the matched function or method.

Flags:
  --limit N  Max relation results per matched symbol (default: 20).
  --json     Output relation data as JSON.

Examples:
  apltk codegraph callees handleLogin
`,
    impact: `Usage: apltk codegraph impact <symbol> [--depth N] [--json]

Analyze symbols that may be affected by changing the matched symbol.

Flags:
  --depth N  Traversal depth (default: 2).
  --json     Output impact subgraph as JSON.

Examples:
  apltk codegraph impact UserService --depth 3
`,
    node: `Usage: apltk codegraph node <symbol-or-id> [--json]

Show details and source for a specific symbol or node id.

Examples:
  apltk codegraph node handleLogin
  apltk codegraph node src/auth.ts::handleLogin --json
`,
  };

  const text = helps[subcommand];
  if (text) {
    stream.write(text);
  } else {
    errStream.write(
      `Unknown subcommand: "${subcommand}". Use "apltk codegraph --help" for the list of available subcommands.\n`,
    );
  }
}

export const tool: ToolDefinition = {
  name: 'codegraph',
  category: 'Code analysis',
  description:
    'CodeGraph codebase exploration — init, index, sync, status, query, files, callers, callees, impact, node, context',
  handler: codegraphHandler,
};
