import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CodeGraph } = require('@colbymchenry/codegraph');
import { closeIndex } from './cg-instance.js';
import { formatOutput } from './formatter.js';

export interface ExploreOptions {
  json?: boolean;
}

export async function handleExplore(
  projectRoot: string,
  query: string,
  options: ExploreOptions = {},
): Promise<number> {
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });

  // Step 1: Search for the query
  const searchResults = cg.searchNodes(query, { limit: 10 });

  if (searchResults.length === 0) {
    process.stdout.write('No symbols found matching the query.\n');
    closeIndex(cg);
    return 0;
  }

  // Step 2: For each result, get callers, callees, and source code
  type SymbolDetail = {
    name: string;
    kind: string;
    filePath: string;
    startLine: number;
    endLine: number;
    qualifiedName: string;
    signature?: string;
    callers: Array<{ name: string; filePath: string; startLine: number }>;
    callees: Array<{ name: string; filePath: string; startLine: number }>;
    code: string | null;
  };

  const details: SymbolDetail[] = [];
  for (const result of searchResults) {
    const node = result.node;
    const callers = cg.getCallers(node.id).map((c: any) => ({
      name: c.node.name,
      filePath: c.node.filePath,
      startLine: c.node.startLine,
    }));
    const callees = cg.getCallees(node.id).map((c: any) => ({
      name: c.node.name,
      filePath: c.node.filePath,
      startLine: c.node.startLine,
    }));
    const code = await cg.getCode(node.id);

    details.push({
      name: node.name,
      kind: node.kind,
      filePath: node.filePath,
      startLine: node.startLine,
      endLine: node.endLine,
      qualifiedName: node.qualifiedName,
      signature: node.signature,
      callers,
      callees,
      code,
    });
  }

  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(details, { json: true }) + '\n');
    return 0;
  }

  // Human-readable output
  for (const d of details) {
    process.stdout.write(`\n=== ${d.name} [${d.kind}] ===\n`);
    process.stdout.write(`  File: ${d.filePath}:${d.startLine}-${d.endLine}\n`);
    process.stdout.write(`  QName: ${d.qualifiedName}\n`);
    if (d.signature) process.stdout.write(`  Signature: ${d.signature}\n`);

    process.stdout.write(`\n  Callers (${d.callers.length}):\n`);
    if (d.callers.length === 0) {
      process.stdout.write('    (none)\n');
    } else {
      for (const c of d.callers.slice(0, 20)) {
        process.stdout.write(`    ${c.name}  ${c.filePath}:${c.startLine}\n`);
      }
    }

    process.stdout.write(`\n  Callees (${d.callees.length}):\n`);
    if (d.callees.length === 0) {
      process.stdout.write('    (none)\n');
    } else {
      for (const c of d.callees.slice(0, 20)) {
        process.stdout.write(`    ${c.name}  ${c.filePath}:${c.startLine}\n`);
      }
    }

    if (d.code) {
      process.stdout.write(`\n  Source (${d.filePath}):\n`);
      const lines = d.code.split('\n');
      for (let i = 0; i < Math.min(lines.length, 30); i++) {
        process.stdout.write(`    ${lines[i]}\n`);
      }
      if (lines.length > 30) {
        process.stdout.write(`    ... (${lines.length - 30} more lines)\n`);
      }
    }
  }

  return 0;
}
