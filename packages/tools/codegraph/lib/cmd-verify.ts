import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { closeIndex } from './cg-instance.js';
import { formatOutput } from './formatter.js';
import { verifyOverlay } from './verify/checker.js';
import yaml from 'js-yaml';

export interface VerifyOptions {
  json?: boolean;
}

/**
 * Read a spec overlay from the standard atlas directory layout.
 * Loads the overlay in the same way as skills/init-project-html/lib/atlas/state.js::loadOverlay.
 */
function loadOverlay(specDir: string): any {
  const overlayDir = path.join(specDir, 'architecture_diff', 'atlas');

  if (!fs.existsSync(overlayDir)) {
    throw new Error(`No architecture diff atlas found at: ${overlayDir}. Run "apltk architecture diff" first to generate the overlay.`);
  }

  const overlay: any = {
    meta: null,
    actors: null,
    edges: null,
    featureOrder: null,
    features: {},
    removed: { features: [], submodules: [] },
  };

  // Parse atlas.index.yaml via js-yaml
  const indexFile = path.join(overlayDir, 'atlas.index.yaml');
  if (fs.existsSync(indexFile)) {
    const raw = fs.readFileSync(indexFile, 'utf8');
    if (raw.trim()) {
      const index = yaml.load(raw) as any;
      if (index && typeof index === 'object' && !Array.isArray(index)) {
        if (index.meta !== undefined) overlay.meta = index.meta;
        if (index.actors !== undefined) overlay.actors = index.actors;
        if (index.edges !== undefined) overlay.edges = index.edges;
        if (Array.isArray(index.features)) {
          overlay.featureOrder = index.features
            .map((entry: any) => (typeof entry === 'string' ? entry : entry?.slug))
            .filter(Boolean);
        }
      }
    }
  }

  // Load feature files via js-yaml
  const featuresDir = path.join(overlayDir, 'features');
  if (fs.existsSync(featuresDir)) {
    for (const entry of fs.readdirSync(featuresDir)) {
      if (!entry.endsWith('.yaml')) continue;
      const featureFile = path.join(featuresDir, entry);
      const raw = fs.readFileSync(featureFile, 'utf8');
      if (raw.trim()) {
        const data = yaml.load(raw) as any;
        if (data && typeof data === 'object' && data.slug) {
          const feature: any = {
            slug: data.slug,
            submodules: Array.isArray(data.submodules)
              ? data.submodules.map(normalizeSubmodule)
              : [],
            edges: Array.isArray(data.edges) ? data.edges : [],
          };
          if (data.action !== undefined) feature.action = data.action;
          overlay.features[data.slug] = feature;
        }
      }
    }
  }

  // Load _removed.yaml via js-yaml
  const removedFile = path.join(overlayDir, '_removed.yaml');
  if (fs.existsSync(removedFile)) {
    const raw = fs.readFileSync(removedFile, 'utf8');
    if (raw.trim()) {
      const removed = yaml.load(raw) as any;
      if (removed && typeof removed === 'object' && !Array.isArray(removed)) {
        if (Array.isArray(removed.features)) overlay.removed.features = removed.features;
        if (Array.isArray(removed.submodules)) overlay.removed.submodules = removed.submodules;
      }
    }
  }

  return overlay;
}

function normalizeSubmodule(sub: any): any {
  if (!sub || typeof sub !== 'object') return sub;
  return {
    slug: sub.slug,
    kind: sub.kind || 'service',
    role: sub.role || '',
    functions: Array.isArray(sub.functions) ? sub.functions : [],
    variables: Array.isArray(sub.variables) ? sub.variables : [],
    ...(sub.action !== undefined ? { action: sub.action } : {}),
  };
}

export async function handleVerify(
  projectRoot: string,
  specDir: string,
  options: VerifyOptions = {},
): Promise<number> {
  const resolvedSpecDir = path.resolve(specDir);

  let overlay: any;
  try {
    overlay = loadOverlay(resolvedSpecDir);
  } catch (err: any) {
    process.stderr.write(`Error loading overlay: ${err.message}\n`);
    return 1;
  }

  const { CodeGraph } = require('@colbymchenry/codegraph');
  const cg = await CodeGraph.open(projectRoot, { sync: false, readOnly: true });
  const report = await verifyOverlay(cg, overlay);
  closeIndex(cg);

  if (options.json) {
    process.stdout.write(formatOutput(report, { json: true }) + '\n');
  } else {
    process.stdout.write(`\n=== Verify Report ===\n\n`);
    process.stdout.write(`Total:  ${report.total}\n`);
    process.stdout.write(`Passed: ${report.passed}\n`);
    process.stdout.write(`Failed: ${report.failed.length}\n`);
    process.stdout.write(`Skipped: ${report.skipped}\n`);

    if (report.failed.length > 0) {
      process.stdout.write('\nFailures:\n');
      for (const f of report.failed) {
        process.stdout.write(`  [${f.type}] ${f.location}\n`);
        if (f.suggestion) process.stdout.write(`    Suggestion: ${f.suggestion}\n`);
      }
    }
    process.stdout.write('\n');
  }

  return report.failed.length > 0 ? 1 : 0;
}
