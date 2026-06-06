import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
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
 * Walk up from `startDir` looking for `filename` (a file or directory).
 * Never goes above `upperBound`. Returns null if not found.
 */
function findInParents(startDir: string, filename: string, upperBound?: string): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, filename))) return dir;
    if (upperBound && dir === upperBound) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit filesystem root
    dir = parent;
  }
}

/**
 * Locate the project root by walking up from the given directory.
 *
 * Uses the git root as a natural upper boundary so that `.codegraph/`
 * directories in parent repos or the home directory are not picked up.
 *
 * Strategy:
 *   1. Find the nearest parent containing `.codegraph/` (bounded by git root).
 *   2. Fallback: nearest parent containing `package.json` (bounded by git root).
 *   3. Ultimate fallback: the git root itself, or `cwd` if not in a git repo.
 */
export function findProjectRoot(startPath?: string): string {
  const cwd = path.resolve(startPath || process.cwd());

  // Determine the git root as a natural project boundary
  let gitRoot: string | undefined;
  try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    // Not in a git repo; no upper boundary constraint
  }

  const upperBound = gitRoot;

  // 1. Walk up from cwd looking for .codegraph/, bounded by git root
  const codegraphDir = findInParents(cwd, '.codegraph', upperBound);
  if (codegraphDir) return codegraphDir;

  // 2. Fallback: walk up looking for package.json, bounded by git root
  const pkgDir = findInParents(cwd, 'package.json', upperBound);
  if (pkgDir) return pkgDir;

  // 3. Ultimate fallback
  return gitRoot || cwd;
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
