import {
  getCodeGraphModule,
  closeIndex,
  type CodeGraphSearchResult,
  type CodeGraphNode,
  type CodeGraphRelationRow,
} from './cg-instance.js';
import { formatOutput } from './formatter.js';
import { serializeNode, serializeEdge } from './graph-output.js';

export interface RelationsOptions {
  limit?: number;
  json?: boolean;
}

interface RelationReport {
  symbol: ReturnType<typeof serializeNode>;
  callers?: Array<{
    node: ReturnType<typeof serializeNode>;
    edge: ReturnType<typeof serializeEdge>;
  }>;
  callees?: Array<{
    node: ReturnType<typeof serializeNode>;
    edge: ReturnType<typeof serializeEdge>;
  }>;
}

export async function handleRelations(
  projectRoot: string,
  direction: 'callers' | 'callees',
  symbol: string,
  options: RelationsOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const matches: CodeGraphNode[] = cg
    .searchNodes(symbol, { limit: 5 })
    .map((result: CodeGraphSearchResult) => result.node);
  const reports: RelationReport[] = matches.map((node: CodeGraphNode) => {
    const relationRows =
      direction === 'callers' ? cg.getCallers(node.id) : cg.getCallees(node.id);
    return {
      symbol: serializeNode(node),
      [direction]: relationRows
        .slice(0, options.limit ?? 20)
        .map((row: CodeGraphRelationRow) => ({
          node: serializeNode(row.node),
          edge: serializeEdge(row.edge),
        })),
    };
  });
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(reports, { json: true }) + '\n');
    return 0;
  }

  if (reports.length === 0) {
    process.stdout.write('No matching symbols found.\n');
    return 0;
  }

  for (const report of reports) {
    const source = report.symbol;
    const rows = report[direction];
    process.stdout.write(
      `\n${String(source['name'])} [${String(source['kind'])}] ${String(source['filePath'])}:${String(source['startLine'])}\n`,
    );
    if (!rows || rows.length === 0) {
      process.stdout.write(`  No ${direction} found.\n`);
      continue;
    }
    for (const row of rows) {
      process.stdout.write(
        `  ${String(row.node['name'])} [${String(row.node['kind'])}] ${String(row.node['filePath'])}:${String(row.node['startLine'])}\n`,
      );
    }
  }
  return 0;
}
