import { getCodeGraphModule, closeIndex } from './cg-instance.js';
import { formatOutput, formatSearchResults } from './formatter.js';

export interface QueryOptions {
  kind?: string;
  limit?: number;
  json?: boolean;
}

export async function handleQuery(
  projectRoot: string,
  query: string,
  options: QueryOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const searchOptions: Record<string, unknown> = { limit: options.limit ?? 20 };
  if (options.kind) searchOptions['kinds'] = [options.kind];
  const results = cg.searchNodes(query, searchOptions);
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(results, { json: true }) + '\n');
  } else {
    process.stdout.write(formatSearchResults(results) + '\n');
  }
  return 0;
}
