import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CodeGraph } = require('@colbymchenry/codegraph');
import { closeIndex } from './cg-instance.js';
import { formatOutput } from './formatter.js';
import { verifyOverlay } from './verify/checker.js';

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

  const indexFile = path.join(overlayDir, 'atlas.index.yaml');
  if (fs.existsSync(indexFile)) {
    // Use dynamic import for js-yaml
    // We read the YAML file manually for simplicity
    const raw = fs.readFileSync(indexFile, 'utf8');
    if (raw.trim()) {
      // Simple YAML-like parsing for meta and edges
      const lines = raw.split('\n');
      let currentSection = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('features:')) {
          overlay.featureOrder = [];
          currentSection = 'features';
        } else if (trimmed.startsWith('edges:')) {
          currentSection = 'edges';
        } else if (trimmed.startsWith('meta:')) {
          currentSection = 'meta';
          overlay.meta = {};
        } else if (trimmed.startsWith('actors:')) {
          currentSection = 'actors';
        } else if (trimmed.startsWith('- ')) {
          if (currentSection === 'features') {
            const featureSlug = trimmed.replace(/^- /, '').trim();
            if (featureSlug) overlay.featureOrder.push(featureSlug);
          }
        }
      }
    }
  }

  // Load feature files from the overlay
  const featuresDir = path.join(overlayDir, 'features');
  if (fs.existsSync(featuresDir)) {
    for (const entry of fs.readdirSync(featuresDir)) {
      if (!entry.endsWith('.yaml')) continue;
      const featureFile = path.join(featuresDir, entry);
      const raw = fs.readFileSync(featureFile, 'utf8');
      if (raw.trim()) {
        const feature = parseSimpleYamlFeature(raw, entry.replace('.yaml', ''));
        if (feature) {
          overlay.features[feature.slug] = feature;
        }
      }
    }
  }

  // Load removed file
  const removedFile = path.join(overlayDir, '_removed.yaml');
  if (fs.existsSync(removedFile)) {
    const raw = fs.readFileSync(removedFile, 'utf8');
    if (raw.trim()) {
      if (raw.includes('features:')) {
        overlay.removed.features = extractYamlListItems(raw, 'features:');
      }
      if (raw.includes('submodules:')) {
        overlay.removed.submodules = extractYamlListItems(raw, 'submodules:');
      }
    }
  }

  return overlay;
}

/**
 * Simple YAML feature parser — extracts slug, submodules, edges, and actions
 * from a feature YAML file.
 */
function parseSimpleYamlFeature(raw: string, fallbackSlug: string): any {
  const feature: any = { slug: fallbackSlug, submodules: [], edges: [], action: undefined };
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('slug:')) {
      const val = trimmed.replace('slug:', '').trim();
      if (val) feature.slug = val;
    } else if (trimmed.startsWith('action:')) {
      feature.action = trimmed.replace('action:', '').trim();
    } else if (trimmed.startsWith('- slug:')) {
      // Parse submodule entry
      const sub: any = { slug: extractValue(trimmed, 'slug:'), functions: [], variables: [] };
      sub.kind = extractValueFromLines(lines, i, 'kind:');
      sub.role = extractValueFromLines(lines, i, 'role:');
      if (sub.action) sub.action = extractValueFromLines(lines, i, 'action:');

      // Parse functions list
      const fnStart = findLineIndex(lines, i, 'functions:');
      if (fnStart >= 0) {
        for (let j = fnStart + 1; j < Math.min(fnStart + 50, lines.length); j++) {
          const subTrimmed = lines[j].trim();
          if (subTrimmed.startsWith('- ')) {
            const fnName = subTrimmed.replace(/^- /, '').trim();
            if (fnName && !fnName.endsWith(':')) sub.functions.push(fnName);
          } else if (subTrimmed && !subTrimmed.startsWith('- ') && subTrimmed.includes(':')) {
            break; // new key
          }
        }
      }
      feature.submodules.push(sub);
    }
  }

  return feature;
}

function extractValue(line: string, prefix: string): string {
  const idx = line.indexOf(prefix);
  if (idx < 0) return '';
  return line.slice(idx + prefix.length).trim();
}

function extractValueFromLines(lines: string[], startIdx: number, key: string): string | undefined {
  for (let i = startIdx + 1; i < Math.min(startIdx + 20, lines.length); i++) {
    const line = lines[i].trim();
    if (line.startsWith(key)) return line.replace(key, '').trim();
    if (line.startsWith('- ') || line.includes(':')) continue;
    break;
  }
  return undefined;
}

function findLineIndex(lines: string[], startIdx: number, target: string): number {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim().startsWith(target)) return i;
  }
  return -1;
}

function extractYamlListItems(raw: string, sectionStart: string): string[] {
  const items: string[] = [];
  const startIdx = raw.indexOf(sectionStart);
  if (startIdx < 0) return items;

  const afterSection = raw.slice(startIdx + sectionStart.length);
  const lines = afterSection.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      const val = trimmed.replace(/^- /, '').trim();
      if (val) items.push(val);
    } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
      break; // new section
    }
  }
  return items;
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
