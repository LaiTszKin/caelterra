import { closeIndex, getCodeGraphModule } from './cg-instance.js';
import { formatSummary, formatOutput } from './formatter.js';

export interface StatusOptions {
  json?: boolean;
}

export async function handleStatus(
  projectRoot: string,
  options: StatusOptions = {},
): Promise<number> {
  if (!getCodeGraphModule().CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }
  const cg = await getCodeGraphModule().CodeGraph.open(projectRoot, {
    sync: false,
    readOnly: true,
  });
  const stats = cg.getStats();
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(stats, { json: true }) + '\n');
  } else {
    // Summarize nodes by kind (skip zero entries)
    const kindEntries = Object.entries(stats.nodesByKind).filter(
      ([, v]) => v > 0,
    );
    const nodeKindSummary = kindEntries
      .map(([kind, count]) => `    ${kind.padEnd(14)} ${String(count)}`)
      .join('\n');

    const edgeKindEntries = Object.entries(stats.edgesByKind).filter(
      ([, v]) => v > 0,
    );
    const edgeKindSummary = edgeKindEntries
      .map(([kind, count]) => `    ${kind.padEnd(14)} ${String(count)}`)
      .join('\n');

    const langEntries = Object.entries(stats.filesByLanguage).filter(
      ([, v]) => v > 0,
    );
    const langSummary =
      langEntries.length > 0
        ? langEntries
            .map(([lang, count]) => `    ${lang.padEnd(14)} ${String(count)}`)
            .join('\n')
        : '    (no files indexed)';

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
    process.stdout.write('\nLanguages:\n');
    process.stdout.write(langSummary + '\n');
  }

  return 0;
}
