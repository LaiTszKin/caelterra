import { getCodeGraphModule, closeIndex } from './cg-instance.js';
import { formatOutput } from './formatter.js';

export interface ContextOptions {
  maxNodes?: number;
  includeCode?: boolean;
  json?: boolean;
}

export async function handleContext(
  projectRoot: string,
  query: string,
  options: ContextOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const result = await cg.buildContext(query, {
    maxNodes: options.maxNodes ?? 50,
    includeCode: options.includeCode ?? true,
    format: options.json ? 'json' : 'markdown',
  });
  closeIndex(cg);

  if (typeof result === 'string') {
    process.stdout.write(result.trimEnd() + '\n');
  } else {
    process.stdout.write(formatOutput(result, { json: true }) + '\n');
  }
  return 0;
}
