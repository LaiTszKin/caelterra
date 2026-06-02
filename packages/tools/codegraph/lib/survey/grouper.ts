import type { ScanResult } from './scanner.js';

export interface SubmoduleSuggestion {
  slug: string;
  kind: 'api' | 'service' | 'db' | 'ui' | 'pure-fn' | 'queue';
  role: string;
  memberFunctions: string[];
  memberFiles: string[];
}

/**
 * Group scanned symbols into suggested submodule groupings.
 *
 * Algorithm (hybrid):
 * 1. Identify entry points: exported symbols with high caller count from other files
 * 2. Group by file boundaries when no cross-file connectivity is detected
 * 3. Infer kind from symbol naming patterns and file path patterns
 */
export function groupIntoSubmodules(scan: ScanResult): SubmoduleSuggestion[] {
  if (scan.allSymbols.length === 0) return [];

  const suggestions: SubmoduleSuggestion[] = [];
  const processed = new Set<string>();

  // Group by file: each file with exported symbols becomes a candidate submodule
  for (const file of scan.files) {
    const exportedSymbols = file.symbols.filter((s) => s.isExported);
    if (exportedSymbols.length === 0 && file.symbols.length === 0) continue;

    // Build a slug from the filename (strip extension)
    const fileName = file.filePath.split('/').pop() || '';
    const slug = fileName.replace(/\.\w+$/, '').replace(/[_ ]/g, '-').toLowerCase();

    // Infer kind from file path and naming
    const kind = inferKind(file.filePath, file.symbols);
    const symbols = file.symbols.map((s) => s.name);
    if (symbols.length === 0) continue;

    // Avoid duplicating symbols already assigned
    const newSymbols = symbols.filter((s) => !processed.has(`${file.filePath}::${s}`));
    if (newSymbols.length === 0) continue;
    for (const s of symbols) processed.add(`${file.filePath}::${s}`);

    const role = inferRole(kind, slug, exportedSymbols);
    suggestions.push({
      slug,
      kind,
      role,
      memberFunctions: newSymbols,
      memberFiles: [file.filePath],
    });
  }

  // Merge small files into a single submodule when they share a common directory prefix
  const merged = mergeByDirectoryPrefix(suggestions, scan.directory);

  return merged;
}

function inferKind(filePath: string, symbols: Array<{ name: string; kind: string }>): SubmoduleSuggestion['kind'] {
  const lower = filePath.toLowerCase();

  // Detect by path patterns
  if (lower.includes('/api/') || lower.includes('/routes/') || lower.includes('/controller')) return 'api';
  if (lower.includes('/db/') || lower.includes('/model/') || lower.includes('/repository') || lower.includes('/schema')) return 'db';
  if (lower.includes('/ui/') || lower.includes('/component/') || lower.includes('/page/') || lower.includes('/view')) return 'ui';
  if (lower.includes('/queue/') || lower.includes('/job/') || lower.includes('/worker')) return 'queue';

  // Detect by symbol kinds
  const hasHandler = symbols.some((s) => s.kind === 'route' || s.kind === 'component');
  if (hasHandler) return 'api';

  const hasModel = symbols.some((s) => s.kind === 'interface' || s.kind === 'struct');
  if (hasModel) return 'db';

  return 'service';
}

function inferRole(kind: SubmoduleSuggestion['kind'], slug: string, exportedSymbols: Array<{ name: string; kind: string }>): string {
  const name = slug.replace(/-/g, ' ');
  switch (kind) {
    case 'api':
      return `Handles API requests for ${name}`;
    case 'db':
      return `Manages data access and persistence for ${name}`;
    case 'service':
      return `Contains business logic for ${name}`;
    case 'ui':
      return `Renders UI components for ${name}`;
    case 'queue':
      return `Processes background jobs for ${name}`;
    case 'pure-fn':
      return `Provides pure utility functions for ${name}`;
    default:
      return `Supports ${name} functionality`;
  }
}

function mergeByDirectoryPrefix(
  suggestions: SubmoduleSuggestion[],
  _directory: string,
): SubmoduleSuggestion[] {
  // When there are many single-file suggestions, merge those
  // that share a common 2-segment directory prefix
  const prefixMap = new Map<string, SubmoduleSuggestion>();

  for (const s of suggestions) {
    if (s.memberFiles.length !== 1) {
      // Already contains multiple files, keep as-is
      const key = s.slug;
      prefixMap.set(key, s);
      continue;
    }

    const filePath = s.memberFiles[0];
    const parts = filePath.split('/');
    // Use the parent directory as merge key for files in subdirs
    const mergeKey = parts.length >= 3 ? parts.slice(0, -1).join('/') : s.slug;

    if (prefixMap.has(mergeKey)) {
      const existing = prefixMap.get(mergeKey)!;
      existing.memberFunctions.push(...s.memberFunctions);
      existing.memberFiles.push(...s.memberFiles);
      // Keep more specific kind
      if (existing.kind === 'service' && s.kind !== 'service') {
        existing.kind = s.kind;
      }
    } else {
      prefixMap.set(mergeKey, {
        slug: mergeKey.replace(/\//g, '-'),
        kind: s.kind,
        role: s.role,
        memberFunctions: [...s.memberFunctions],
        memberFiles: [...s.memberFiles],
      });
    }
  }

  return Array.from(prefixMap.values());
}
