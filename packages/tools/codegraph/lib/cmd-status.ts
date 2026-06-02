import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CodeGraph } = require('@colbymchenry/codegraph');
import { closeIndex } from './cg-instance.js';
import { formatSummary, formatOutput } from './formatter.js';

export interface StatusOptions {
  json?: boolean;
}

export async function handleStatus(projectRoot: string, options: StatusOptions = {}): Promise<number> {
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const stats = cg.getStats();
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(stats, { json: true }) + '\n');
  } else {
    // Summarize nodes by kind (skip zero entries)
    const kindEntries = Object.entries(stats.nodesByKind).filter(([, v]) => (v as number) > 0);
    const nodeKindSummary = kindEntries.map(([kind, count]) => `    ${kind.padEnd(14)} ${count}`).join('\n');

    const edgeKindEntries = Object.entries(stats.edgesByKind).filter(([, v]) => (v as number) > 0);
    const edgeKindSummary = edgeKindEntries.map(([kind, count]) => `    ${kind.padEnd(14)} ${count}`).join('\n');

    const summary: [string, string | number][] = [
      ['Project:', projectRoot],
      ['Files:', stats.fileCount],
      ['Nodes:', stats.nodeCount],
      ['Edges:', stats.edgeCount],
      ['DB size:', `${(stats.dbSizeBytes / 1024).toFixed(1)} KB`],
      ['Last updated:', new Date(stats.lastUpdated).toISOString()],
      ['', ''],
      ['Nodes by kind:', ''],
    ];
    process.stdout.write(formatSummary(summary) + '\n');
    process.stdout.write(nodeKindSummary + '\n');
    process.stdout.write('\nEdges by kind:\n');
    process.stdout.write(edgeKindSummary + '\n');
  }

  return 0;
}
