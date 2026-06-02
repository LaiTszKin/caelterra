import type { CodeGraph } from '@colbymchenry/codegraph';

export interface VerifyItem {
  type: 'feature' | 'submodule' | 'function' | 'edge' | 'variable';
  location: string;
  action?: string;
  suggestion?: string;
}

export interface VerifyReport {
  passed: number;
  failed: VerifyItem[];
  skipped: number;
  total: number;
}

/**
 * Verify an architecture overlay against the actual CodeGraph to confirm
 * that every referenced symbol, submodule, and edge actually exists in the
 * indexed codebase.
 *
 * Overlay format follows the atlas convention:
 * ```json
 * {
 *   "features": {
 *     "<slug>": {
 *       "submodules": [{ "slug": "...", "kind": "...", "role": "...", "functions": [...] }],
 *       "edges": [{ "from": "...", "to": "...", "kind": "..." }]
 *     }
 *   },
 *   "removed": { "features": [...], "submodules": [...] }
 * }
 * ```
 */
export async function verifyOverlay(
  cg: CodeGraph,
  overlay: any,
): Promise<VerifyReport> {
  const passed: VerifyItem[] = [];
  const failed: VerifyItem[] = [];
  let skipped = 0;

  const features = overlay.features || {};

  for (const [slug, feature] of Object.entries<any>(features)) {
    // If the feature itself declares `action: add`, it's a new feature — skip verification
    if (feature.action === 'add') {
      skipped++;
      continue;
    }

    // Check feature slug exists in codebase
    const featureSearch = cg.searchNodes(slug, { limit: 5 });
    // Features are directory-level; we check if any file matches the slug pattern
    const hasFeatureFiles = cg.getFiles().some((f) => f.path.startsWith(slug + '/') || f.path.includes('/' + slug + '/'));
    if (!hasFeatureFiles && featureSearch.length === 0) {
      failed.push({
        type: 'feature',
        location: slug,
        suggestion: `No files or symbols found matching feature "${slug}". Verify the feature slug is correct or add it with "action: add".`,
      });
      continue;
    }
    passed.push({ type: 'feature', location: slug });

    // Check each submodule
    const submodules = feature.submodules || [];
    for (const sub of submodules) {
      if (sub.action === 'add') {
        skipped++;
        continue;
      }

      // Check submodule functions exist in the codebase
      const functions = sub.functions || [];
      for (const fn of functions) {
        if (typeof fn === 'string') {
          // Simple string function name
          const fnSearch = cg.searchNodes(fn, { limit: 3 });
          if (fnSearch.length === 0) {
            failed.push({
              type: 'function',
              location: `${slug}/${sub.slug}::${fn}`,
              suggestion: `Function "${fn}" not found in codeGraph index for ${slug}/${sub.slug}. Verify the name or add via "action: add".`,
            });
          } else {
            passed.push({ type: 'function', location: `${slug}/${sub.slug}::${fn}` });
          }
        } else if (typeof fn === 'object' && fn.name) {
          const fnSearch = cg.searchNodes(fn.name, { limit: 3 });
          if (fnSearch.length === 0) {
            failed.push({
              type: 'function',
              location: `${slug}/${sub.slug}::${fn.name}`,
              suggestion: `Function "${fn.name}" not found in codeGraph index.`,
            });
          } else {
            passed.push({ type: 'function', location: `${slug}/${sub.slug}::${fn.name}` });
          }
        }
      }
    }

    // Check edges
    const edges = feature.edges || [];
    for (const edge of edges) {
      const { from, to } = edge;
      const fromName = typeof from === 'string' ? from : from?.submodule;
      const toName = typeof to === 'string' ? to : to?.submodule;

      if (fromName) {
        const fromSearch = cg.searchNodes(fromName, { limit: 3 });
        if (fromSearch.length === 0) {
          failed.push({
            type: 'edge',
            location: `${slug}: ${fromName} -> ${toName || '?'}`,
            suggestion: `Edge source "${fromName}" not found in codeGraph index.`,
          });
        } else {
          passed.push({ type: 'edge', location: `${slug}: ${fromName}` });
        }
      }

      if (toName) {
        const toSearch = cg.searchNodes(toName, { limit: 3 });
        if (toSearch.length === 0) {
          failed.push({
            type: 'edge',
            location: `${slug}: ${fromName || '?'} -> ${toName}`,
            suggestion: `Edge target "${toName}" not found in codeGraph index.`,
          });
        } else {
          passed.push({ type: 'edge', location: `${slug}: -> ${toName}` });
        }
      }
    }
  }

  return {
    passed: passed.length,
    failed,
    skipped,
    total: passed.length + failed.length + skipped,
  };
}
