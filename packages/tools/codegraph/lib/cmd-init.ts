import { createOrOpenIndex, closeIndex } from './cg-instance.js';
import { formatSummary, formatOutput } from './formatter.js';

export interface InitOptions {
  index?: boolean;
  json?: boolean;
}

export async function handleInit(
  projectRoot: string,
  options: InitOptions = {},
): Promise<number> {
  const progressEvents: Array<{
    phase: string;
    current: number;
    total: number;
  }> = [];
  const start = Date.now();
  const cg = await createOrOpenIndex(projectRoot, {
    ...(options.index !== undefined && { index: options.index }),
    onProgress: (p) => {
      progressEvents.push({
        phase: p.phase,
        current: p.current,
        total: p.total,
      });
      if (process.stdout.isTTY) {
        process.stdout.write(
          `\r  Indexing: ${p.phase} ${String(p.current)}/${String(p.total)}${p.currentFile ? `  ${p.currentFile}` : ''}`,
        );
      }
    },
  });

  if (options.index && process.stdout.isTTY) {
    process.stdout.write('\n');
  }

  const stats = cg.getStats();
  closeIndex(cg);
  const durationMs = Date.now() - start;

  const result = {
    projectRoot,
    initialized: true,
    indexed: !!options.index,
    durationMs,
    stats: {
      fileCount: stats.fileCount,
      nodeCount: stats.nodeCount,
      edgeCount: stats.edgeCount,
    },
    progress: progressEvents.length > 0 ? progressEvents : undefined,
  };

  if (options.json) {
    process.stdout.write(formatOutput(result, { json: true }) + '\n');
  } else {
    const summary: [string, string | number][] = [
      ['Project:', projectRoot],
      ['Status:', 'Initialized'],
    ];
    if (options.index) {
      summary.push(['Files:', stats.fileCount]);
      summary.push(['Nodes:', stats.nodeCount]);
      summary.push(['Edges:', stats.edgeCount]);
      summary.push(['Duration:', `${String(durationMs)}ms`]);
    }
    process.stdout.write(formatSummary(summary) + '\n');
  }

  return 0;
}
