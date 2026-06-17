import {
  getCodeGraphModule,
  closeIndex,
  type CodeGraphNode,
} from './cg-instance.js';
import { formatOutput } from './formatter.js';
import { serializeSubgraph } from './graph-output.js';

export interface ImpactOptions {
  depth?: number;
  json?: boolean;
}

export async function handleImpact(
  projectRoot: string,
  symbol: string,
  options: ImpactOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const match = cg.searchNodes(symbol, { limit: 1 })[0]?.node;
  if (!match) {
    closeIndex(cg);
    process.stdout.write('No matching symbols found.\n');
    return 0;
  }

  const impact = serializeSubgraph(
    cg.getImpactRadius(match.id, options.depth ?? 2),
  );
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(
      formatOutput({ symbol: match, impact }, { json: true }) + '\n',
    );
    return 0;
  }

  const nodes = impact['nodes'] as CodeGraphNode[];
  process.stdout.write(
    `Impact for ${match.name} (${String(nodes.length)} symbols):\n`,
  );
  for (const node of nodes) {
    process.stdout.write(
      `  ${node.name} [${node.kind}] ${node.filePath}:${String(node.startLine)}\n`,
    );
  }
  return 0;
}
