import type { ToolDefinition, ToolContext } from '@laitszkin/tool-registry';
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
  const projectRoot = findProjectRoot(context.cwd || process.cwd());

  // Parse --json flag early (can appear anywhere)
  const jsonIndex = args.indexOf('--json');
  const isJson = jsonIndex >= 0;
  if (jsonIndex >= 0) args.splice(jsonIndex, 1);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp(stdout);
    return 0;
  }

  const subcommand = args[0];
  const rest = args.slice(1);

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
          stderr.write('Usage: apltk codegraph search <query> [--limit N] [--json]\n');
          return 1;
        }
        return await handleSearch(projectRoot, query, { limit, json: isJson });
      }

      case 'explore': {
        const query = rest.join(' ');
        if (!query) {
          stderr.write('Usage: apltk codegraph explore <query> [--json]\n');
          return 1;
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
          stderr.write('Usage: apltk codegraph verify --spec <spec-dir> [--json]\n');
          return 1;
        }
        return await handleVerify(projectRoot, specDir, { json: isJson });
      }

      default:
        stderr.write(`Unknown subcommand: ${subcommand}\n\n`);
        printHelp(stderr);
        return 1;
    }
  } catch (error: any) {
    if (error.code === 'MODULE_NOT_FOUND' || (error.message && error.message.includes('Cannot find module'))) {
      stderr.write('`@colbymchenry/codegraph` is not installed. Run `npm install @colbymchenry/codegraph` in your project directory.\n');
    } else {
      stderr.write(`Error running codegraph ${subcommand}: ${error.message}\n`);
    }
    return 1;
  }
}

function printHelp(stream: NodeJS.WriteStream): void {
  stream.write(`Usage: apltk codegraph <subcommand> [options]

Subcommands:

  lifecycle:
    init               Initialize CodeGraph for the project
                       --index    Run initial indexing after init

    sync               Sync the index with current file state

    status             Show index statistics (files, nodes, edges)

  discovery:
    search <query>     Search the code graph for symbols
                       --limit N  Max results (default: 20)

    explore <query>    Deep-dive on a symbol (callers, callees, source)
                       --json     JSON output

    survey [dir]       Scan a directory and suggest submodule groupings
                       --feature <name>  Feature context
                       --json            JSON output

    list-apis [path]   List public APIs in the project or a sub-path
                       --all      Include non-exported symbols
                       --json     JSON output

  validation:
    verify             Verify a spec overlay against the actual code
                       --spec <dir>  Spec directory (required)
                       --json        JSON output

Global options:
    --json             Output as JSON instead of human-readable format
    --help             Show this help message
`);
}

export const tool: ToolDefinition = {
  name: 'codegraph',
  category: 'Code analysis',
  description: 'CodeGraph code intelligence — init, sync, status, search, explore, survey, list-apis, verify',
  handler: codegraphHandler,
};
