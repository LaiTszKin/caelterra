import {
  getCodeGraphModule,
  closeIndex,
  type CodeGraphProgress,
} from './cg-instance.js';
import { formatSummary, formatOutput } from './formatter.js';

export interface SyncOptions {
  json?: boolean;
}

export async function handleSync(
  projectRoot: string,
  options: SyncOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, {
    sync: false,
    readOnly: false,
  });

  const progressEvents: Array<{
    phase: string;
    current: number;
    total: number;
  }> = [];
  const result = await cg.sync({
    onProgress: (p: CodeGraphProgress) => {
      progressEvents.push({
        phase: p.phase,
        current: p.current,
        total: p.total,
      });
      if (process.stdout.isTTY) {
        process.stdout.write(
          `\r  Indexing: ${p.phase} ${String(p.current)}/${String(p.total)}`,
        );
      }
    },
  });

  if (process.stdout.isTTY) {
    process.stdout.write('\n');
  }

  closeIndex(cg);

  const output = {
    projectRoot,
    filesChecked: result.filesChecked,
    filesAdded: result.filesAdded,
    filesModified: result.filesModified,
    filesRemoved: result.filesRemoved,
    nodesUpdated: result.nodesUpdated,
    durationMs: result.durationMs,
    progress: progressEvents.length > 0 ? progressEvents : undefined,
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
      ['Duration:', `${String(result.durationMs)}ms`],
    ];
    process.stdout.write(formatSummary(summary) + '\n');
  }

  return 0;
}
