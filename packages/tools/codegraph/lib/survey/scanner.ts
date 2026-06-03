import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export interface FileScan {
  filePath: string;
  language: string;
  symbols: Array<{
    name: string;
    kind: string;
    qualifiedName: string;
    startLine: number;
    endLine: number;
    isExported: boolean;
    signature?: string;
  }>;
}

export interface ScanResult {
  directory: string;
  files: FileScan[];
  allSymbols: Array<{
    name: string;
    kind: string;
    filePath: string;
    qualifiedName: string;
    startLine: number;
    isExported: boolean;
  }>;
  totalFiles: number;
  totalSymbols: number;
}

/**
 * Scan a directory for all files and symbols tracked by CodeGraph.
 */
export async function scanDirectory(
  cg: any,
  dirPath: string,
): Promise<ScanResult> {
  const { CodeGraph } = require('@colbymchenry/codegraph');
  const files = cg.getFiles();
  const dirPrefix = dirPath.replace(/^\/?/, '').replace(/\/?$/, '') + '/';

  // Filter files within the directory
  const dirFiles = files.filter((f: { path: string }) => f.path.startsWith(dirPrefix));

  const fileScans: FileScan[] = [];
  const allSymbols: ScanResult['allSymbols'] = [];

  for (const file of dirFiles) {
    const nodes = cg.getNodesInFile(file.path);
    const symbols = nodes
      .filter((n: any) => !['file', 'import', 'parameter'].includes(n.kind))
      .map((n: any) => ({
        name: n.name,
        kind: n.kind,
        qualifiedName: n.qualifiedName,
        startLine: n.startLine,
        endLine: n.endLine,
        isExported: !!n.isExported,
        signature: n.signature,
      }));

    fileScans.push({
      filePath: file.path,
      language: file.language,
      symbols,
    });

    for (const sym of symbols) {
      allSymbols.push({
        name: sym.name,
        kind: sym.kind,
        filePath: file.path,
        qualifiedName: sym.qualifiedName,
        startLine: sym.startLine,
        isExported: sym.isExported,
      });
    }
  }

  return {
    directory: dirPath,
    files: fileScans,
    allSymbols,
    totalFiles: dirFiles.length,
    totalSymbols: allSymbols.length,
  };
}
