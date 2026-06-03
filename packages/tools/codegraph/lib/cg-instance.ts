import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let _codeGraphModule: any = null;
export function getCodeGraphModule(): { CodeGraph: any; findNearestCodeGraphRoot: any } {
  if (!_codeGraphModule) {
    _codeGraphModule = require('@colbymchenry/codegraph');
  }
  return _codeGraphModule;
}

/**
 * Locate the project root by walking up from the given directory.
 * Returns the nearest parent containing `.codegraph/`, or falls back
 * to the nearest parent containing `package.json`.
 */
export function findProjectRoot(startPath?: string): string {
  const cwd = startPath || process.cwd();
  const codegraphRoot = getCodeGraphModule().findNearestCodeGraphRoot(cwd);
  if (codegraphRoot) return codegraphRoot;

  // Fallback: walk up looking for package.json
  let dir = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return cwd; // hit filesystem root
    dir = parent;
  }
}

/**
 * Initialize a CodeGraph index for the given project root.
 *
 * If the project is already initialized, throws an error suggesting
 * `apltk codegraph sync` instead. Otherwise, initializes a new CodeGraph
 * project. When `options.index` is true, runs initial indexing after init.
 *
 * Note: `CodeGraph.init()` supports an `{ index: true }` shorthand that
 * runs initial indexing inline -- this deviates from a two-step init-then-index
 * pattern but is the supported API through the npm package.
 */
export async function createOrOpenIndex(
  projectRoot: string,
  options?: { index?: boolean; onProgress?: (progress: any) => void },
): Promise<any> {
  const isInit = getCodeGraphModule().CodeGraph.isInitialized(projectRoot);
  if (isInit) {
    throw new Error(
      `Project is already initialized at ${projectRoot}. Use \`apltk codegraph sync\` to update the index.`,
    );
  }
  return getCodeGraphModule().CodeGraph.init(projectRoot, {
    index: options?.index ?? false,
    onProgress: options?.onProgress,
  });
}

/**
 * Close a CodeGraph instance and release resources.
 */
export function closeIndex(cg: any): void {
  cg.close();
}
