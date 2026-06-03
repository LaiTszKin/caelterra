import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { closeIndex } from './cg-instance.js';
import { formatSearchResults, formatOutput } from './formatter.js';

export interface SearchOptions {
  limit?: number;
  json?: boolean;
}

export async function handleSearch(
  projectRoot: string,
  query: string,
  options: SearchOptions = {},
): Promise<number> {
  const { CodeGraph } = require('@colbymchenry/codegraph');
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write('CodeGraph is not initialized. Run `apltk codegraph init` first.\n');
    return 1;
  }
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const results = cg.searchNodes(query, { limit: options.limit ?? 20 });
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(results, { json: true }) + '\n');
  } else {
    process.stdout.write(formatSearchResults(results) + '\n');
  }

  return 0;
}
