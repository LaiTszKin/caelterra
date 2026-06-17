import {
  getCodeGraphModule,
  closeIndex,
  type CodeGraphNode,
  type CodeGraphSearchResult,
} from './cg-instance.js';
import { formatOutput } from './formatter.js';
import { serializeNode } from './graph-output.js';

export interface NodeOptions {
  json?: boolean;
}

interface NodeReport {
  node: Record<string, unknown>;
  code: string | null;
}

export async function handleNode(
  projectRoot: string,
  symbolOrId: string,
  options: NodeOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  let nodes: CodeGraphNode[] = [];
  const direct = cg.getNode(symbolOrId);
  if (direct) {
    nodes = [direct];
  } else {
    nodes = cg.getNodesByName(symbolOrId);
    if (nodes.length === 0) {
      nodes = cg
        .searchNodes(symbolOrId, { limit: 5 })
        .map((result: CodeGraphSearchResult) => result.node);
    }
  }

  const reports: NodeReport[] = [];
  for (const node of nodes) {
    reports.push({
      node: serializeNode(node),
      code: await cg.getCode(node.id),
    });
  }
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
    const node = report.node;
    process.stdout.write(
      `\n${String(node['name'])} [${String(node['kind'])}] ${String(node['filePath'])}:${String(node['startLine'])}-${String(node['endLine'])}\n`,
    );
    const sig = node['signature'] as string | undefined;
    if (sig) process.stdout.write(`Signature: ${sig}\n`);
    if (report.code) process.stdout.write(`\n${report.code}\n`);
  }
  return 0;
}
