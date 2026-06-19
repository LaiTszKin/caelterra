import {
  getCodeGraphModule,
  closeIndex,
  type CodeGraphFile,
} from './cg-instance.js';
import { formatOutput } from './formatter.js';

export interface FilesOptions {
  filter?: string;
  json?: boolean;
}

export async function handleFiles(
  projectRoot: string,
  options: FilesOptions = {},
): Promise<number> {
  const { CodeGraph } = getCodeGraphModule();
  if (!CodeGraph.isInitialized(projectRoot)) {
    process.stderr.write(
      'CodeGraph is not initialized. Run `apltk codegraph init` first.\n',
    );
    return 1;
  }

  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  let files = cg.getFiles();
  closeIndex(cg);

  const filter = options.filter?.replace(/^\/+/, '').replace(/\/+$/, '');
  if (filter) {
    files = files.filter(
      (file: CodeGraphFile) =>
        file.path === filter || file.path.startsWith(`${filter}/`),
    );
  }

  if (options.json) {
    process.stdout.write(formatOutput(files, { json: true }) + '\n');
    return 0;
  }

  if (files.length === 0) {
    process.stdout.write('No indexed files found.\n');
    return 0;
  }

  process.stdout.write(`Files (${String(files.length)}):\n`);
  for (const file of files) {
    process.stdout.write(
      `  ${file.path}  [${file.language}]  (${String(file.nodeCount)} symbols)\n`,
    );
  }
  return 0;
}
