/**
 * Format structured data for CLI output.
 *
 * - TTY mode produces human-readable tables and headings.
 * - Non-TTY or `--json` produces JSON.stringify with 2-space indent.
 * - Auto-detects TTY via `process.stdout.isTTY`.
 */

export interface FormatOptions {
  json?: boolean;
  tty?: boolean;
}

function isTTY(options: FormatOptions): boolean {
  if (options.json) return false;
  if (options.tty !== undefined) return options.tty;
  return process.stdout.isTTY;
}

/**
 * Format generic data for output.
 */
export function formatOutput(
  data: unknown,
  options: FormatOptions = {},
): string {
  if (!isTTY(options)) {
    return JSON.stringify(data, null, 2);
  }
  // Fallback: JSON for complex objects in TTY too
  if (typeof data === 'string') return data;
  if (data === null || data === undefined) return '';
  return JSON.stringify(data, null, 2);
}

/**
 * Format a key-value summary block for human-readable output.
 * Example:
 *   Files:       42
 *   Nodes:     1280
 *   Edges:     5600
 */
export function formatSummary(rows: [string, string | number][]): string {
  const width = rows.reduce((max, [key]) => Math.max(max, key.length + 1), 0);
  return rows
    .map(([key, val]) => `${key.padEnd(width, ' ')} ${String(val)}`)
    .join('\n');
}

/**
 * Format a list of search results as a human-readable table.
 */
export function formatSearchResults(
  results: Array<{
    node: { name: string; kind: string; filePath: string; startLine: number };
    score: number;
  }>,
): string {
  if (results.length === 0) return 'No results found.';
  const lines = results.map((r, i) => {
    const score = (r.score * 100).toFixed(0);
    return `  ${String(i + 1)}. ${r.node.name}  [${r.node.kind}]  ${r.node.filePath}:${String(r.node.startLine)}  (${score}%)`;
  });
  return `Results (${String(results.length)}):\n${lines.join('\n')}`;
}
