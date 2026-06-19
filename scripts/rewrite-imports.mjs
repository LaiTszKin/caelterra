#!/usr/bin/env node
/**
 * Rewrite @laitszkin/* package imports in compiled JS to relative paths.
 *
 * The monorepo publishes only the root @laitszkin/apollo-toolkit package.
 * Compiled JS imports like `from '@laitszkin/cli'` fail in global installs
 * because the sub-packages are not on npm and not in node_modules.
 *
 * This script rewrites both static imports and dynamic import() strings
 * to relative paths so the package is self-contained.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

/** Recursively find files matching a pattern */
function findJSFiles(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory() && entry !== 'node_modules') {
        stack.push(full);
      } else if (st.isFile() && entry.endsWith('.js')) {
        results.push(full);
      }
    }
  }
  return results;
}

// Mapping: package name → path relative to repo root
const PACKAGE_MAP = {
  cli: 'packages/cli/dist/index.js',
  tui: 'packages/tui/dist/index.js',
  'tool-registry': 'packages/tool-registry/dist/index.js',
  'tool-utils': 'packages/tool-utils/dist/index.js',
};

// Known tool package names (suffix after @laitszkin/tool-)
const TOOL_NAMES = [
  'filter-logs',
  'search-logs',
  'validate-skill-frontmatter',
  'validate-openai-agent-config',
  'sync-memory-index',
  'open-github-issue',
  'find-github-issues',
  'read-github-issue',
  'review-threads',
  'extract-conversations',
  'docs-to-voice',
  'render-katex',
  'render-error-book',
  'generate-storyboard-images',
  'enforce-video-aspect-ratio',
  'architecture',
  'codegraph',
  'eval',
  'create-specs',
  'create-review-report',
  'extract-pdf-text',
];

// Build full package map
for (const name of TOOL_NAMES) {
  PACKAGE_MAP[`tool-${name}`] = `packages/tools/${name}/dist/index.js`;
}

/**
 * Map a @laitszkin/* specifier to a root-relative path.
 */
export function resolvePackage(specifier) {
  const name = specifier.replace('@laitszkin/', '');
  return PACKAGE_MAP[name] || null;
}

/**
 * Compute relative import path from sourceFile to pkgPath.
 */
export function relativePath(fromFile, pkgPath) {
  const fromDir = dirname(fromFile);
  let rel = relative(fromDir, resolve(root, pkgPath));
  if (!rel.startsWith('.')) rel = './' + rel;
  // Normalize backslashes to forward slashes — ESM import() on Windows requires forward slashes.
  return rel.replace(/\\/g, '/');
}

// Find all compiled JS files
const jsFiles = [
  ...findJSFiles(join(root, 'dist')),
  ...findJSFiles(join(root, 'packages')),
];

let totalReplacements = 0;

for (const file of jsFiles) {
  let content = readFileSync(file, 'utf-8');

  // 1. Rewrite static imports: from '@laitszkin/xxx' → from 'relative-path'
  content = content.replace(
    /from\s+['"]@laitszkin\/([^'"]+)['"]/g,
    (match, name) => {
      const fullName = `@laitszkin/${name}`;
      const pkgPath = resolvePackage(fullName);
      if (!pkgPath) {
        console.warn(
          `WARN: unknown package in static import: ${fullName} (${file})`,
        );
        return match;
      }
      const rel = relativePath(file, pkgPath);
      totalReplacements++;
      return `from '${rel}'`;
    },
  );

  // 2. Rewrite dynamic import strings in TOOL_MODULE_NAMES:
  //    '@laitszkin/tool-xxx' → 'relative-path'
  //    Only in the tool-registration file (or any file with TOOL_MODULE_NAMES)
  content = content.replace(/'@laitszkin\/(tool-[^']+)'/g, (match, name) => {
    const fullName = `@laitszkin/${name}`;
    const pkgPath = resolvePackage(fullName);
    if (!pkgPath) {
      console.warn(
        `WARN: unknown package in dynamic import: ${fullName} (${file})`,
      );
      return match;
    }
    const rel = relativePath(file, pkgPath);
    totalReplacements++;
    return `'${rel}'`;
  });

  // 3. Fix TOOL_NAMES computation: replace('@laitszkin/tool-', '') no longer works
  //    after dynamic import strings are rewritten. Replace with hardcoded set.
  if (content.includes("name.replace('@laitszkin/tool-', '')")) {
    const toolNamesLiteral = JSON.stringify([
      ...TOOL_NAMES,
      // Additional aliases/names from the original code
      'extract-pdf-text-pdfkit',
      'extract-codex-conversations',
      'extract-skill-conversations',
    ])
      .replace(/","/g, "', '")
      .replace(/^\["/, "['")
      .replace(/"\]$/, "']");

    content = content.replace(
      /const TOOL_NAMES = new Set\(\[\s*\.\.\.TOOL_MODULE_NAMES\.map\(\(name\) => name\.replace\('@laitszkin\/tool-', ''\)\),[\s\S]*?\]\);/,
      `const TOOL_NAMES = new Set(${toolNamesLiteral});`,
    );
    totalReplacements++;
  }

  if (content !== readFileSync(file, 'utf-8')) {
    writeFileSync(file, content, 'utf-8');
    console.log(
      `OK  ${relative(root, file)} (${totalReplacements} replacements so far)`,
    );
  }
}

console.log(
  `\nDone. ${totalReplacements} total replacements across ${jsFiles.length} files.`,
);
