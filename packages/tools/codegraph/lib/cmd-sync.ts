import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CodeGraph } = require('@colbymchenry/codegraph');
import { closeIndex } from './cg-instance.js';
import { formatSummary, formatOutput } from './formatter.js';

export interface SyncOptions {
  json?: boolean;
}

export async function handleSync(projectRoot: string, options: SyncOptions = {}): Promise<number> {
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: false });

  let progressEvents: Array<{ phase: string; current: number; total: number }> = [];
  const result = await cg.sync({
    onProgress: (p: any) => {
      progressEvents.push({ phase: p.phase, current: p.current, total: p.total });
    },
  });

  closeIndex(cg);

  const output = {
    projectRoot,
    filesChecked: result.filesChecked,
    filesAdded: result.filesAdded,
    filesModified: result.filesModified,
    filesRemoved: result.filesRemoved,
    nodesUpdated: result.nodesUpdated,
    durationMs: result.durationMs,
  };

  if (options.json) {
    process.stdout.write(formatOutput(output, { json: true }) + '\n');
  } else {
    const summary: [string, string | number][] = [
      ['Project:', projectRoot],
      ['Checked:', result.filesChecked],
      ['Added:', result.filesAdded],
      ['Modified:', result.filesModified],
      ['Removed:', result.filesRemoved],
      ['Nodes updated:', result.nodesUpdated],
      ['Duration:', `${result.durationMs}ms`],
    ];
    process.stdout.write(formatSummary(summary) + '\n');
  }

  return 0;
}
