import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { closeIndex } from './cg-instance.js';
import { formatApiList, formatApiListGrouped, formatOutput } from './formatter.js';

export interface ListApisOptions {
  json?: boolean;
  all?: boolean;
}

export async function handleListApis(
  projectRoot: string,
  feature?: string,
  options: ListApisOptions = {},
): Promise<number> {
  const { CodeGraph } = require('@colbymchenry/codegraph');
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });

  let nodes = cg.getNodesByKind('function');

  // Filter by feature directory if specified
  if (feature) {
    const featurePath = feature.replace(/^\/?/, '').replace(/\/?$/, '/');
    nodes = nodes.filter((n: any) => n.filePath.startsWith(featurePath));
  }

  // Only exported functions unless --all is specified
  if (!options.all) {
    nodes = nodes.filter((n: any) => n.isExported);
  }

  type ApiEntry = {
    name: string;
    kind: string;
    filePath: string;
    startLine: number;
    endLine: number;
    qualifiedName: string;
    signature?: string;
    isExported: boolean;
    callerCount: number;
    callers: Array<{ name: string; filePath: string; startLine: number }>;
  };

  const apis: ApiEntry[] = [];
  for (const node of nodes) {
    const callers = cg.getCallers(node.id).map((c: any) => ({
      name: c.node.name,
      filePath: c.node.filePath,
      startLine: c.node.startLine,
    }));
    apis.push({
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      qualifiedName: node.qualifiedName,
      signature: node.signature,
      isExported: !!node.isExported,
      callerCount: callers.length,
      callers,
    });
  }

  closeIndex(cg);

  if (options.json) {
    // For JSON with --all, group by directory
    if (options.all) {
      const grouped: Record<string, ApiEntry[]> = {};
      for (const api of apis) {
        const dir = api.filePath.substring(0, api.filePath.lastIndexOf('/'));
        if (!grouped[dir]) grouped[dir] = [];
        grouped[dir].push(api);
      }
      process.stdout.write(formatOutput(grouped, { json: true }) + '\n');
    } else {
      process.stdout.write(formatOutput(apis, { json: true }) + '\n');
    }
  } else {
    if (options.all) {
      process.stdout.write(formatApiListGrouped(apis) + '\n');
    } else {
      process.stdout.write(formatApiList(apis) + '\n');
    }
  }

  return 0;
}
