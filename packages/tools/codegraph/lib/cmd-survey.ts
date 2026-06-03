import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { existsSync } from 'node:fs';
import path from 'node:path';
import { closeIndex } from './cg-instance.js';
import { formatOutput } from './formatter.js';
import { scanDirectory } from './survey/scanner.js';
import { groupIntoSubmodules } from './survey/grouper.js';

export interface SurveyOptions {
  feature?: string;
  json?: boolean;
}

export interface SurveyReport {
  directory: string;
  feature?: string;
  totalFiles: number;
  totalSymbols: number;
  files: Array<{
    filePath: string;
    language: string;
    symbolCount: number;
  }>;
  entryPoints: Array<{
    name: string;
    kind: string;
    filePath: string;
    startLine: number;
    isExported: boolean;
  }>;
  suggestedSubmodules: Array<{
    slug: string;
    kind: string;
    role: string;
    memberFunctions: string[];
    memberFiles: string[];
  }>;
  suggestedEdges: Array<{
    source: string;
    target: string;
    kind: string;
    label: string;
  }>;
}

export async function handleSurvey(
  projectRoot: string,
  dirPath: string,
  options: SurveyOptions = {},
): Promise<number> {
  // Check that the target directory exists
  const targetPath = path.resolve(projectRoot, dirPath);
  if (!existsSync(targetPath)) {
    process.stderr.write(`Error: Directory not found: ${dirPath}\n`);
    return 1;
  }

  const { CodeGraph } = require('@colbymchenry/codegraph');
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });

  // Scan the directory
  const scan = await scanDirectory(cg, dirPath);

  const fileSet = new Set(scan.files.map((f) => f.filePath));

  // Group into submodule suggestions
  const suggestions = groupIntoSubmodules(scan, cg);

  // Build edge suggestions from cross-file call relationships
  const edgeSuggestions = buildEdgeSuggestions(scan, cg, fileSet);

  // Determine entry points: exported symbols called from outside the scanned directory
  const entryPoints = scan.allSymbols.filter(s => {
    if (!s.isExported) return false;
    const nodes = cg.getNodesByName(s.name);
    for (const node of nodes) {
      if (node.filePath !== s.filePath) continue;
      const callers = cg.getCallers(node.id);
      for (const caller of callers) {
        if (!fileSet.has(caller.node.filePath)) {
          return true;
        }
      }
    }
    return false;
  });

  closeIndex(cg);

  const report: SurveyReport = {
    directory: dirPath,
    feature: options.feature,
    totalFiles: scan.totalFiles,
    totalSymbols: scan.totalSymbols,
    files: scan.files.map((f) => ({
      filePath: f.filePath,
      language: f.language,
      symbolCount: f.symbols.length,
    })),
    entryPoints,
    suggestedSubmodules: suggestions.map((s) => ({
      slug: s.slug,
      kind: s.kind,
      role: s.role,
      memberFunctions: s.memberFunctions,
      memberFiles: s.memberFiles,
    })),
    suggestedEdges: edgeSuggestions,
  };

  if (options.json) {
    process.stdout.write(formatOutput(report, { json: true }) + '\n');
  } else {
    // Human-readable output
    process.stdout.write(`\n=== Survey: ${dirPath} ===\n`);
    if (report.feature) {
      process.stdout.write(`Feature: ${report.feature}\n`);
    }
    process.stdout.write('\n');

    process.stdout.write(`Files: ${report.totalFiles}  Symbols: ${report.totalSymbols}\n\n`);

    process.stdout.write('Files:\n');
    for (const f of report.files) {
      process.stdout.write(`  ${f.filePath}  [${f.language}]  (${f.symbolCount} symbols)\n`);
    }

    process.stdout.write('\nEntry Points:\n');
    if (report.entryPoints.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      for (const ep of report.entryPoints) {
        process.stdout.write(`  ${ep.name}  [${ep.kind}]  ${ep.filePath}:${ep.startLine}\n`);
      }
    }

    process.stdout.write('\nSuggested Submodules:\n');
    if (report.suggestedSubmodules.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      for (const sub of report.suggestedSubmodules) {
        process.stdout.write(`  ${sub.slug}  [${sub.kind}]  ${sub.role}\n`);
        process.stdout.write(`    Functions: ${sub.memberFunctions.join(', ')}\n`);
        process.stdout.write(`    Files: ${sub.memberFiles.join(', ')}\n\n`);
      }
    }

    process.stdout.write('Suggested Edges:\n');
    if (report.suggestedEdges.length === 0) {
      process.stdout.write('  (none)\n');
    } else {
      for (const edge of report.suggestedEdges) {
        process.stdout.write(`  ${edge.source} --[${edge.kind}]--> ${edge.target}  (${edge.label})\n`);
      }
    }

    process.stdout.write('\n');
  }

  return 0;
}

/**
 * Build suggested edges from cross-file call relationships in the scanned directory.
 */
function buildEdgeSuggestions(
  scan: Awaited<ReturnType<typeof scanDirectory>>,
  cg: any,
  fileSet: Set<string>,
): SurveyReport['suggestedEdges'] {
  const edges: SurveyReport['suggestedEdges'] = [];
  const dedup = new Set<string>();

  // For each symbol in the scan, check if it calls symbols outside the scanned directory
  for (const sym of scan.allSymbols) {
    const nodes = cg.getNodesByName(sym.name);
    for (const node of nodes) {
      if (node.filePath !== sym.filePath) continue;
      const callees = cg.getCallees(node.id);
      for (const callee of callees) {
        // Only consider callees OUTSIDE the scanned directory (cross-boundary edges)
        if (!fileSet.has(callee.node.filePath)) {
          const edgeKey = `${sym.name}::${callee.node.name}`;
          if (dedup.has(edgeKey)) continue;
          dedup.add(edgeKey);
          edges.push({
            source: sym.name,
            target: callee.node.name,
            kind: 'call',
            label: `${sym.filePath} -> ${callee.node.filePath}`,
          });
        }
      }
    }
  }

  return edges;
}
