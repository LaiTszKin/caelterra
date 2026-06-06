import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
import { SystemError, UserInputError } from '@laitszkin/tool-utils';
import { findProjectRoot } from './lib/cg-instance.js';
import { handleInit } from './lib/cmd-init.js';
import { handleSync } from './lib/cmd-sync.js';
import { handleStatus } from './lib/cmd-status.js';
import { handleSearch } from './lib/cmd-search.js';
import { handleExplore } from './lib/cmd-explore.js';
import { handleSurvey } from './lib/cmd-survey.js';
import { handleListApis } from './lib/cmd-list-apis.js';
import { handleVerify } from './lib/cmd-verify.js';

export async function codegraphHandler(args: string[], context: ToolContext): Promise<number> {
  const stdout = context.stdout || process.stdout;
  const stderr = context.stderr || process.stderr;

  // Parse --json flag early (can appear anywhere)
  const jsonIndex = args.indexOf('--json');
  const isJson = jsonIndex >= 0;
  if (jsonIndex >= 0) args.splice(jsonIndex, 1);

  // Main help: no args, --help, -h, or "help" subcommand
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    printHelp(stdout);
    return 0;
  }

  const subcommand = args[0];

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
    const message = error instanceof Error ? error.message : 'Unknown error finding project root';
    if ((error as any)?.code === 'MODULE_NOT_FOUND' || message.includes('Cannot find module')) {
      throw new UserInputError('`@colbymchenry/codegraph` is not installed. Run `npm install @colbymchenry/codegraph` in your project directory.');
    }
    throw new SystemError(`Error finding project root: ${message}`);
  }

  // Parse --spec <dir> for verify
  const specIndex = rest.indexOf('--spec');
  let specDir: string | undefined;
  if (specIndex >= 0 && specIndex + 1 < rest.length) {
    specDir = rest[specIndex + 1];
    rest.splice(specIndex, 2);
  }

  // Parse --all flag for list-apis
  const allIndex = rest.indexOf('--all');
  const isAll = allIndex >= 0;
  if (allIndex >= 0) rest.splice(allIndex, 1);

  // Parse --index flag for init
  const shouldIndex = rest.includes('--index');
  const indexIdx = rest.indexOf('--index');
  if (indexIdx >= 0) rest.splice(indexIdx, 1);

  // Parse --feature <name> for survey
  const featureIndex = rest.indexOf('--feature');
  let featureName: string | undefined;
  if (featureIndex >= 0 && featureIndex + 1 < rest.length) {
    featureName = rest[featureIndex + 1];
    rest.splice(featureIndex, 2);
  }

  // Parse limit for search
  const limitIndex = rest.indexOf('--limit');
  let limit: number | undefined;
  if (limitIndex >= 0 && limitIndex + 1 < rest.length) {
    limit = parseInt(rest[limitIndex + 1], 10);
    rest.splice(limitIndex, 2);
  }

  try {
    switch (subcommand) {
      case 'init':
        return await handleInit(projectRoot, { index: shouldIndex, json: isJson });

      case 'sync':
        return await handleSync(projectRoot, { json: isJson });

      case 'status':
        return await handleStatus(projectRoot, { json: isJson });

      case 'search': {
        const query = rest.join(' ');
        if (!query) {
          throw new UserInputError('Usage: apltk codegraph search <query> [--limit N] [--json]');
        }
        return await handleSearch(projectRoot, query, { limit, json: isJson });
      }

      case 'explore': {
        const query = rest.join(' ');
        if (!query) {
          throw new UserInputError('Usage: apltk codegraph explore <query> [--json]');
        }
        return await handleExplore(projectRoot, query, { json: isJson, feature: featureName });
      }

      case 'survey': {
        const dirPath = rest[0] || '.';
        return await handleSurvey(projectRoot, dirPath, { feature: featureName, json: isJson });
      }

      case 'list-apis': {
        const pathArg = rest[0];
        const combinedPath = featureName
          ? (pathArg ? `${featureName}/${pathArg.replace(/^\//, '')}` : featureName)
          : pathArg;
        return await handleListApis(projectRoot, combinedPath, { all: isAll, json: isJson });
      }

      case 'verify': {
        if (!specDir) {
          throw new UserInputError('Usage: apltk codegraph verify --spec <spec-dir> [--json]');
        }
        return await handleVerify(projectRoot, specDir, { json: isJson });
      }

      default:
        throw new SystemError(`Unknown codegraph subcommand: ${subcommand}`);
    }
  } catch (error: unknown) {
    if (error instanceof SystemError || error instanceof UserInputError) throw error;
    throw new SystemError(error instanceof Error ? error.message : 'Unknown error in codegraph', { cause: error instanceof Error ? error : undefined });
  }
}

function printHelp(stream: NodeJS.WriteStream): void {
  stream.write(`Usage: apltk codegraph <subcommand> [options]

CodeGraph code intelligence — parse source code into a knowledge graph
of symbols (functions, classes) and relationships (call edges), backed by
a local SQLite database with FTS5 full-text search.

Powered by @colbymchenry/codegraph (tree-sitter-backed code knowledge graph).

Subcommands:

  lifecycle:
    init               Initialize CodeGraph for the project
                       --index    Run initial indexing immediately after init
                       --json     JSON output

    sync               Sync the index with current file state
                       --json     JSON output

    status             Show index statistics (files, nodes, edges, languages)
                       --json     JSON output

  discovery:
    search <query>     Search the code graph for symbols via FTS5
                       --limit N  Max results (default: 20, max: 100)
                       --json     JSON output

    explore <query>    Deep-dive on a symbol — show callers, callees, and source
                       --feature <name>  Only show results within this feature
                       --json            JSON output

    survey [dir]       Scan a directory, suggest submodule groupings and
                       cross-boundary edges for atlas modelling
                       --feature <name>  Feature context for grouping
                       --json            JSON output

    list-apis [path]   List public APIs in the project or within a sub-path
                       --all      Include non-exported (internal) symbols
                       --json     JSON output

  validation:
    verify --spec <dir>
                       Verify a spec overlay against actual code —
                       checks that every declared feature, submodule,
                       function, and edge exists in the code graph
                       --json     JSON output

Global options:
    --json             Output as JSON instead of human-readable format
    --help, -h         Show this help message

Use "apltk codegraph <subcommand> --help" for per-subcommand details.

Examples:
  apltk codegraph init
  apltk codegraph init --index
  apltk codegraph status --json
  apltk codegraph search getUser
  apltk codegraph search getUser --limit 5 --json
  apltk codegraph explore handleLogin
  apltk codegraph survey src/
  apltk codegraph survey src/ --feature auth --json
  apltk codegraph list-apis --all
  apltk codegraph verify --spec docs/plans/2026-05-11/add-2fa
`);
}

function printSubcommandHelp(subcommand: string, stream: NodeJS.WriteStream, errStream: NodeJS.WriteStream): void {
  const PAD = '  ';

  const helps: Record<string, string> = {
    init: `Usage: apltk codegraph init [--index] [--json]

Initialize the CodeGraph knowledge graph for the project.
Creates the .codegraph/ directory and SQLite database.

Flags:
  --index    Run initial indexing immediately after init, so the
             knowledge graph is ready for queries right away.
             Without this flag, you need to run "apltk codegraph sync"
             separately before searching or exploring.
  --json     Output confirmation as JSON.

Examples:
  apltk codegraph init
  apltk codegraph init --index
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
    search: `Usage: apltk codegraph search <query> [--limit N] [--json]

Full-text search the code graph for symbols (functions, classes, variables).
Uses FTS5 (SQLite full-text search) under the hood.

Arguments:
  query      Search term (required). Matches against symbol names and
             source code content.

Flags:
  --limit N  Max results to return (default: 20, max: 100).
  --json     Output results as a JSON array.

Examples:
  apltk codegraph search getUser
  apltk codegraph search handleLogin --limit 5
  apltk codegraph search "class.*Handler" --limit 10 --json
`,
    explore: `Usage: apltk codegraph explore <query> [--feature <name>] [--json]

Deep-dive on a symbol — shows who calls it, what it calls, and its
full source code. Useful for understanding how a function or class
fits into the broader codebase.

Arguments:
  query      Symbol name to explore (required).

Flags:
  --feature <name>
             Scope results to only show callers/callees within a
             specific feature directory (e.g. "auth", "billing").
  --json     Output full exploration data as JSON (callers, callees,
             source code, file path, line numbers).

Examples:
  apltk codegraph explore handleLogin
  apltk codegraph explore authenticate --feature auth
  apltk codegraph explore sendEmail --json
`,
    survey: `Usage: apltk codegraph survey [dir] [--feature <name>] [--json]

Scan a directory and produce a structured survey report with suggested
submodule groupings, cross-boundary edges, and entry points.

This is the primary input for the "init-project-html" skill's Step 1 —
it tells the LLM how to model features and submodules for the atlas.

Arguments:
  dir        Directory to scan (default: current directory ".").

Flags:
  --feature <name>
             Feature context: scope the survey to only one feature's
             boundary. Helps the grouper cluster symbols more accurately.
  --json     Output survey results as JSON — best for LLM consumption.

Examples:
  apltk codegraph survey
  apltk codegraph survey src/
  apltk codegraph survey src/auth --feature auth --json
`,
    'list-apis': `Usage: apltk codegraph list-apis [path] [--all] [--json]

List public (exported) symbols in the project or a specific sub-path.
Useful for understanding the public surface area of a module.

Arguments:
  path       Sub-path to scan (e.g. "src/auth"). When omitted, scans
             the entire project.

Flags:
  --all      Include non-exported (internal) symbols in the listing.
  --json     Output API list as JSON.

Examples:
  apltk codegraph list-apis
  apltk codegraph list-apis src/auth
  apltk codegraph list-apis --all --json
`,
    verify: `Usage: apltk codegraph verify --spec <spec-dir> [--json]

Verify a spec overlay's architecture proposals against actual code.
Checks that every feature, submodule, function, and edge referenced
in the overlay's atlas state actually exists in the code graph.

Flags:
  --spec <spec-dir>
             Path to the spec directory containing an architecture_diff/
             overlay (required). For example, "docs/plans/2026-05-11/add-2fa".
  --json     Output verification results as JSON (passed/failed checks).

Examples:
  apltk codegraph verify --spec docs/plans/2026-05-11/add-2fa
  apltk codegraph verify --spec docs/plans/2026-05-11/add-2fa --json
`,
  };

  const text = helps[subcommand];
  if (text) {
    stream.write(text);
  } else {
    errStream.write(`Unknown subcommand: "${subcommand}". Use "apltk codegraph --help" for the list of available subcommands.\n`);
  }
}

export const tool: ToolDefinition = {
  name: 'codegraph',
  category: 'Code analysis',
  description: 'CodeGraph code intelligence — init, sync, status, search, explore, survey, list-apis, verify',
  handler: codegraphHandler,
};
