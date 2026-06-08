'use strict';

// cli.js — declarative atlas command tree under `apltk architecture`.
//
// Verbs (always operate on the resolved atlas; --spec switches reads
// and writes to the overlay snapshot under <spec_dir>/architecture_diff/):
//
//   open                                          open base atlas in browser
//   diff                                          render paginated before/after viewer
//   merge --spec <dir>|--all [--clean]            merge spec overlay(s) into base atlas
//   render                                        force-regenerate HTML from current state
//   add <feature|module|relation>                 add entities to atlas (unified)
//   remove <feature|module|relation>              remove entities from atlas (unified)
//   validate                                      schema + referential integrity check
//   scan                                          scan directory for feature candidates
//   undo                                          revert the most recent mutation
//   help / --help / -h                            usage
//
// Global flags:
//   --project <root>     project root; creates resources/project-architecture/ if missing
//   --spec <spec_dir>    single specs write to <spec_dir>/architecture_diff/atlas/; batch member paths resolve to the coordination.md root
//   --no-render          skip auto-render after a mutation
//   --no-open            for open/diff: skip launching the browser
//   --dry-run            preview mutation changes as JSON diff without writing to disk
//   --json               request structured JSON output (used by status)
//   --out <dir>          for diff: override viewer output directory
//   --clean              for merge: remove spec overlays after successful merge
//   --all                for merge: merge all pending spec overlays under docs/plans/

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const schema = require('./schema');
const stateLib = require('./state');
const renderLib = require('./render');
const { parseEvidence } = schema;
const { computeDiff } = stateLib;
const { renderDiffViewer } = require('./diff-viewer');
const cliHelp = require('./cli-help');
const { buildArchitectureHelpPage } = cliHelp;

const BOOLEAN_FLAGS = new Set(['no-render', 'no-open', 'help', 'dry-run', 'json']);
const MULTI_VERBS = new Set(['feature', 'submodule', 'function', 'variable', 'dataflow', 'error', 'edge', 'meta', 'actor']);

// Module-level staging state for batch add atomicity.
// When active, all mutations apply to an in-memory clone; single durable write on success.
let _batchStagingActive = false;
let _batchStagedState = null;

/**
 * formatFix generates apltk CLI commands from structured params.
 * The fix suggestions appear only in validation/status error output, not in help.
 */
function formatFix({ type, action, feature, submodule, name, side, scope, slug, kind }) {
  const parts = [`apltk architecture ${type} ${action}`];
  if (feature !== undefined) parts.push(`--feature ${feature}`);
  if (submodule !== undefined) parts.push(`--submodule ${submodule}`);
  if (slug !== undefined) parts.push(`--slug ${slug}`);
  if (name !== undefined) parts.push(`--name ${name}`);
  if (side !== undefined) parts.push(`--side ${side}`);
  if (scope !== undefined) parts.push(`--scope ${scope}`);
  if (kind !== undefined) parts.push(`--kind ${kind}`);
  return parts.join(' ');
}

const ATLAS_REL = path.join('resources', 'project-architecture');
const ATLAS_INDEX_REL = path.join(ATLAS_REL, 'index.html');
const ATLAS_DIRNAME = stateLib.ATLAS_DIRNAME;
const DIFF_DIRNAME = 'architecture_diff';
const PLANS_REL = path.join('docs', 'plans');
const COORDINATION_FILE = 'coordination.md';
const DEFAULT_DIFF_OUT_REL = path.join('.apollo-toolkit', 'architecture-diff');


function openInBrowser(filePath) {
  const platform = process.platform;
  let command;
  let args;
  if (platform === 'darwin') { command = 'open'; args = [filePath]; }
  else if (platform === 'win32') { command = 'cmd'; args = ['/c', 'start', '""', filePath]; }
  else { command = 'xdg-open'; args = [filePath]; }
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch (_e) { /* best effort */ }
}

function ensureResourcesLayout(projectRoot) {
  fs.mkdirSync(path.join(projectRoot, ATLAS_REL), { recursive: true });
}

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, ATLAS_INDEX_REL))) return dir;
    if (fs.existsSync(path.join(dir, ATLAS_REL, ATLAS_DIRNAME, stateLib.INDEX_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function splitList(value) {
  if (value == null) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function findFirstPositional(args) {
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === '--') return i + 1 < args.length ? i + 1 : -1;
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) { i++; continue; }
      const name = token.slice(2);
      if (BOOLEAN_FLAGS.has(name)) { i++; continue; }
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) { i += 2; } else { i++; }
      continue;
    }
    if (token === '-h') { i++; continue; }
    return i;
  }
  return -1;
}

function parseFlags(args) {
  const positional = [];
  const flags = Object.create(null);
  while (args.length > 0) {
    const token = args.shift();
    if (token === '--') { positional.push(...args); break; }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      let name;
      let value;
      if (eq !== -1) { name = token.slice(2, eq); value = token.slice(eq + 1); }
      else {
        name = token.slice(2);
        const nextIsValue = args.length > 0 && !args[0].startsWith('--');
        if (BOOLEAN_FLAGS.has(name) || !nextIsValue) value = true;
        else value = args.shift();
      }
      if (flags[name] !== undefined) {
        flags[name] = Array.isArray(flags[name]) ? [...flags[name], value] : [flags[name], value];
      } else {
        flags[name] = value;
      }
    } else if (token === '-h') {
      flags.help = true;
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

function requireFlag(flags, name) {
  if (flags[name] === undefined || flags[name] === null || flags[name] === true) {
    throw new Error(`Missing required flag --${name}`);
  }
  return flags[name];
}

function resolveProjectRoot(flags) {
  const finish = (root) => {
    ensureResourcesLayout(root);
    return root;
  };
  if (flags.project) return finish(path.resolve(String(flags.project)));
  const discovered = findProjectRoot(process.cwd());
  if (discovered) return finish(discovered);
  // No marker walking parents — use cwd and create resources/project-architecture/.
  return finish(process.cwd());
}

function specOverlayDir(projectRoot, specFlag) {
  const specDir = path.isAbsolute(String(specFlag)) ? String(specFlag) : path.resolve(projectRoot, String(specFlag));
  const plansRoot = path.join(projectRoot, PLANS_REL);
  const batchRoot = fs.existsSync(path.join(specDir, COORDINATION_FILE)) ? specDir : findBatchRoot(specDir, plansRoot);
  const rootDir = batchRoot || specDir;
  return {
    specDir,
    rootDir,
    overlayDir: path.join(rootDir, DIFF_DIRNAME, ATLAS_DIRNAME),
    htmlOutDir: path.join(rootDir, DIFF_DIRNAME),
  };
}

function baseAtlasDir(projectRoot) {
  return path.join(projectRoot, ATLAS_REL, ATLAS_DIRNAME);
}

function baseHtmlOutDir(projectRoot) {
  return path.join(projectRoot, ATLAS_REL);
}

function loadResolvedState(projectRoot, flags) {
  // In batch staging mode, return from the in-memory staged state
  // (includes cumulative changes from previously processed entities)
  if (_batchStagingActive) {
    if (flags.spec) {
      const merged = stateLib.mergeOverlay(_batchStagedState.base, _batchStagedState.overlay);
      return { base: _batchStagedState.base, merged, overlay: _batchStagedState.overlay };
    }
    return { base: _batchStagedState, merged: _batchStagedState, overlay: null };
  }
  const base = stateLib.load(baseAtlasDir(projectRoot));
  if (!flags.spec) return { base, merged: base, overlay: null };
  const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
  const overlay = stateLib.loadOverlay(overlayDir);
  const merged = stateLib.mergeOverlay(base, overlay);
  return { base, merged, overlay };
}

function findFeature(state, slug) {
  return (state.features || []).find((f) => f.slug === slug);
}

function findSubmodule(feature, slug) {
  return ((feature && feature.submodules) || []).find((s) => s.slug === slug);
}

function ensureBaseAtlasDir(projectRoot) {
  const dir = baseAtlasDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });
}

async function performMutation(projectRoot, flags, action, args, mutate, io) {
  // --dry-run: clone resolved state, apply mutation, print JSON diff, return
  if (flags['dry-run']) {
    const { base, merged, overlay } = loadResolvedState(projectRoot, flags);
    const before = merged;
    const dryRunState = JSON.parse(JSON.stringify(merged));
    if (flags.spec) {
      mutate(dryRunState, base, overlay);
    } else {
      mutate(dryRunState, dryRunState, null);
    }
    const diff = computeDiff(before, dryRunState);
    const { addedFeatures, modifiedFeatures, removedFeatures } = diff;
    try {
      io.stdout.write(JSON.stringify({ action: 'dry-run', diff: { addedFeatures, modifiedFeatures, removedFeatures } }) + '\n');
    } catch (err) {
      io.stderr.write(`dry-run error: ${err.message}\n`);
    }
    return;
  }

  // Batch staging mode: apply mutation to in-memory staged state without disk writes.
  // All mutations accumulate in _batchStagedState; a single durable write happens after
  // all entities in the batch succeed, eliminating the crash-window risk of per-entity saves.
  if (_batchStagingActive) {
    if (flags.spec) {
      const merged = stateLib.mergeOverlay(_batchStagedState.base, _batchStagedState.overlay);
      mutate(merged, _batchStagedState.base, _batchStagedState.overlay);
      _batchStagedState.overlay = stateLib.deriveOverlay(_batchStagedState.base, merged);
    } else {
      mutate(_batchStagedState, _batchStagedState, null);
    }
    return;
  }

  const isSpec = Boolean(flags.spec);
  const base = stateLib.load(baseAtlasDir(projectRoot));
  let merged = base;

  if (isSpec) {
    const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
    const overlay = stateLib.loadOverlay(overlayDir);
    merged = stateLib.mergeOverlay(base, overlay);
    const before = JSON.parse(JSON.stringify({ base, overlay }));
    if (!flags.skipUndo) stateLib.writeUndoSnapshot(overlayDir, before);
    mutate(merged, base, overlay);
    stateLib.saveOverlay(overlayDir, stateLib.deriveOverlay(base, merged));
    if (!flags.skipUndo) stateLib.appendHistory(overlayDir, { action, args, mode: 'spec' });
  } else {
    ensureBaseAtlasDir(projectRoot);
    const before = JSON.parse(JSON.stringify({ base }));
    if (!flags.skipUndo) stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), before);
    mutate(base, base, null);
    stateLib.save(baseAtlasDir(projectRoot), base);
    if (!flags.skipUndo) stateLib.appendHistory(baseAtlasDir(projectRoot), { action, args, mode: 'base' });
  }

  if (!flags['no-render']) {
    await runRender({ projectRoot, flags, preloadedMerged: isSpec ? merged : base, preloadedBase: isSpec ? base : null });
  }
}

async function runRender({ projectRoot, flags, preloadedMerged, preloadedBase }) {
  if (flags.spec) {
    const { overlayDir, htmlOutDir } = specOverlayDir(projectRoot, flags.spec);
    const base = preloadedBase || stateLib.load(baseAtlasDir(projectRoot));
    const merged = preloadedMerged || stateLib.mergeOverlay(base, stateLib.loadOverlay(overlayDir));
    const diff = stateLib.diffPages(base, merged);
    const scope = renderLib.scopeFromDiff(diff);
    const removedPaths = renderLib.removedPagePathsFromDiff(diff);
    fs.mkdirSync(htmlOutDir, { recursive: true });
    return renderLib.renderAll({ outDir: htmlOutDir, state: merged, scope, removedPaths });
  }
  const state = preloadedMerged || stateLib.load(baseAtlasDir(projectRoot));
  return renderLib.renderAll({ outDir: baseHtmlOutDir(projectRoot), state });
}

// ---- mutation helpers ---------------------------------------------------

function ensureFeature(state, slug, init) {
  let feature = findFeature(state, slug);
  if (!feature) {
    feature = { slug, title: slug, story: '', dependsOn: [], submodules: [], edges: [], ...init };
    state.features = state.features || [];
    state.features.push(feature);
  } else if (init) {
    Object.assign(feature, init);
  }
  return feature;
}

function removeFeature(state, slug) {
  if (!state.features) return false;
  const before = state.features.length;
  state.features = state.features.filter((f) => f.slug !== slug);
  // also drop cross-feature edges that reference this slug
  state.edges = (state.edges || []).filter((e) => !endpointReferences(e.from, slug) && !endpointReferences(e.to, slug));
  // also clean up dependsOn references on remaining features
  for (const feature of state.features) {
    if (feature.dependsOn) {
      feature.dependsOn = feature.dependsOn.filter((d) => d !== slug);
    }
  }
  return state.features.length < before;
}

function endpointReferences(endpoint, slug) {
  if (!endpoint || typeof endpoint === 'string') return false;
  return endpoint.feature === slug;
}

function ensureSubmodule(feature, slug, init) {
  let sub = findSubmodule(feature, slug);
  if (!sub) {
    sub = { slug, kind: 'service', role: '', functions: [], variables: [], dataflow: [], errors: [], ...init };
    feature.submodules = feature.submodules || [];
    feature.submodules.push(sub);
  } else if (init) {
    Object.assign(sub, init);
  }
  return sub;
}

function removeSubmodule(feature, slug) {
  if (!feature.submodules) return false;
  const before = feature.submodules.length;
  feature.submodules = feature.submodules.filter((s) => s.slug !== slug);
  feature.edges = (feature.edges || []).filter((e) => {
    const f = typeof e.from === 'string' ? e.from : e.from && e.from.submodule;
    const t = typeof e.to === 'string' ? e.to : e.to && e.to.submodule;
    return f !== slug && t !== slug;
  });
  return feature.submodules.length < before;
}

function parseEndpoint(value) {
  // accepts "feature" or "feature/submodule"
  const [feat, sub] = String(value).split('/').map((s) => s && s.trim()).filter(Boolean).concat([undefined])
    .slice(0, 2);
  if (!feat) throw new Error(`Invalid endpoint: ${value}`);
  return sub ? { feature: feat, submodule: sub } : { feature: feat };
}

function isIntraFeatureEdge(from, to) {
  return from && to && from.feature && to.feature && from.feature === to.feature && from.submodule && to.submodule;
}

function sortBySimilarity(input, names) {
  if (!names || names.length === 0) return [];
  const lowerInput = input.toLowerCase();
  const scored = names.map(name => {
    const lower = name.toLowerCase();
    let score = 0;
    // Exact match (shouldn't happen in practice since we're listing alternatives)
    if (lower === lowerInput) score += 100;
    // Common prefix length
    for (let i = 0; i < Math.min(lower.length, lowerInput.length); i++) {
      if (lower[i] === lowerInput[i]) score += 2;
      else break;
    }
    // Substring match
    if (lower.includes(lowerInput)) score += 10;
    if (lowerInput.includes(lower)) score += 5;
    // Character overlap (bag of letters)
    const inputChars = new Set(lowerInput);
    const matchChars = [...lower].filter(c => inputChars.has(c)).length;
    score += matchChars;
    return { name, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5).map(s => s.name);
  const remaining = scored.length - top.length;
  if (remaining > 0) top.push(`and ${remaining} more`);
  return top;
}

function formatAvailableEdges(state, feature) {
  const edges = [];
  for (const e of (state.edges || [])) {
    const ef = e.from && (e.from.submodule ? `${e.from.feature}/${e.from.submodule}` : e.from.feature);
    const et = e.to && (e.to.submodule ? `${e.to.feature}/${e.to.submodule}` : e.to.feature);
    edges.push(`"${ef}" -> "${et}"${e.kind ? ` (${e.kind})` : ''}`);
  }
  if (feature) {
    for (const e of (feature.edges || [])) {
      const ef = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
      const et = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
      edges.push(`"${feature.slug}/${ef}" -> "${feature.slug}/${et}"${e.kind ? ` (${e.kind})` : ''}`);
    }
  } else {
    // When no specific feature is known, collect intra-feature edges from all features
    for (const f of (state.features || [])) {
      for (const e of (f.edges || [])) {
        const ef = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
        const et = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
        edges.push(`"${f.slug}/${ef}" -> "${f.slug}/${et}"${e.kind ? ` (${e.kind})` : ''}`);
      }
    }
  }
  return edges;
}

function assertEndpointExists(state, endpointValue, contextLabel) {
  // Parse "feature" or "feature/submodule" and confirm the target exists.
  const parsed = parseEndpoint(endpointValue);
  const feat = findFeature(state, parsed.feature);
  if (!feat) {
    const allFeatures = (state.features || []).map(f => f.slug);
    const similar = sortBySimilarity(parsed.feature, allFeatures);
    throw new Error(`Target "${endpointValue}" not found for ${contextLabel}. Available features: ${similar.join(', ') || '(none)'}`);
  }
  if (parsed.submodule) {
    if (!findSubmodule(feat, parsed.submodule)) {
      const availableSubs = (feat.submodules || []).map(s => s.slug);
      const similar = sortBySimilarity(parsed.submodule, availableSubs);
      throw new Error(`Submodule "${parsed.submodule}" not found in feature "${parsed.feature}" for ${contextLabel}. Available submodules: ${similar.join(', ') || '(none)'}`);
    }
  }
}

// ---- verb dispatch ------------------------------------------------------

async function verbFeature(action, flags, projectRoot, io) {
  const slug = String(requireFlag(flags, 'slug'));
  if (action === 'add' || action === 'set') {
    const init = {};
    if (flags.title !== undefined) init.title = String(flags.title);
    if (flags.story !== undefined) init.story = String(flags.story);
    if (flags['depends-on'] !== undefined) init.dependsOn = splitList(flags['depends-on']);
    if (flags.evidence !== undefined) init.evidence = parseEvidence(flags.evidence);
    // Check for duplicate before mutation
    if (action === 'add') {
      const { base, merged } = loadResolvedState(projectRoot, flags);
      const currentState = flags.spec ? merged : base;
      if (findFeature(currentState, slug)) {
        return 'skipped';
      }
    }
    return performMutation(projectRoot, flags, `feature ${action}`, { slug, ...init }, (state) => {
      ensureFeature(state, slug, init);
    }, io);
  }
  if (action === 'remove') {
    return performMutation(projectRoot, flags, 'feature remove', { slug }, (state) => {
      const removed = removeFeature(state, slug);
      if (!removed) {
        const allFeatures = (state.features || []).map(f => f.slug);
        const similar = sortBySimilarity(slug, allFeatures);
        throw new Error(`Feature "${slug}" not found. Available features: ${similar.join(', ') || '(none)'}`);
      }
    }, io);
  }
  throw new Error(`Unknown feature subverb: ${action}`);
}

async function verbSubmodule(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const slug = String(requireFlag(flags, 'slug'));
  if (action === 'add' || action === 'set') {
    const init = {};
    if (flags.kind !== undefined) init.kind = String(flags.kind);
    if (flags.role !== undefined) init.role = String(flags.role);
    if (flags.evidence !== undefined) init.evidence = parseEvidence(flags.evidence);
    // Check for duplicate before mutation
    if (action === 'add') {
      const { base, merged } = loadResolvedState(projectRoot, flags);
      const currentState = flags.spec ? merged : base;
      const feat = findFeature(currentState, featureSlug);
      if (feat && findSubmodule(feat, slug)) {
        return 'skipped';
      }
    }
    return performMutation(projectRoot, flags, `submodule ${action}`, { feature: featureSlug, slug, ...init }, (state) => {
      const feature = findFeature(state, featureSlug);
      if (!feature) {
        const available = (state.features || []).map(f => f.slug).join(', ');
        throw new Error(`Feature "${featureSlug}" not found. Available features: ${available || '(none)'}`);
      }
      ensureSubmodule(feature, slug, init);
    }, io);
  }
  if (action === 'remove') {
    return performMutation(projectRoot, flags, 'submodule remove', { feature: featureSlug, slug }, (state) => {
      const feature = findFeature(state, featureSlug);
      if (!feature) {
        const available = (state.features || []).map(f => f.slug);
        const similar = sortBySimilarity(featureSlug, available);
        throw new Error(`Feature "${featureSlug}" not found for submodule removal. Available features: ${similar.join(', ') || '(none)'}`);
      }
      const removed = removeSubmodule(feature, slug);
      if (!removed) {
        const allSubs = (feature.submodules || []).map(s => s.slug);
        const similar = sortBySimilarity(slug, allSubs);
        throw new Error(`Submodule "${slug}" not found in feature "${featureSlug}". Available submodules: ${similar.join(', ') || '(none)'}`);
      }
      // Also drop root-level cross-feature edges that reference the removed submodule
      state.edges = (state.edges || []).filter((e) => {
        const fromIsTarget = typeof e.from === 'object' && e.from && e.from.feature === featureSlug && e.from.submodule === slug;
        const toIsTarget = typeof e.to === 'object' && e.to && e.to.feature === featureSlug && e.to.submodule === slug;
        return !fromIsTarget && !toIsTarget;
      });
    }, io);
  }
  throw new Error(`Unknown submodule subverb: ${action}`);
}

async function verbFunction(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  const name = String(requireFlag(flags, 'name'));
  return performMutation(projectRoot, flags, `function ${action}`, { feature: featureSlug, submodule: subSlug, name }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    if (action === 'add') {
      sub.functions = (sub.functions || []).filter((f) => f.name !== name);
      const fn = { name };
      if (flags.in !== undefined) fn.in = String(flags.in);
      if (flags.out !== undefined) fn.out = String(flags.out);
      if (flags.side !== undefined) fn.side = String(flags.side);
      if (flags.purpose !== undefined) fn.purpose = String(flags.purpose);
      if (flags.evidence !== undefined) fn.evidence = parseEvidence(flags.evidence);
      sub.functions.push(fn);
    } else if (action === 'remove') {
      sub.functions = (sub.functions || []).filter((f) => f.name !== name);
    } else {
      throw new Error(`Unknown function subverb: ${action}`);
    }
  }, io);
}

async function verbVariable(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  const name = String(requireFlag(flags, 'name'));
  return performMutation(projectRoot, flags, `variable ${action}`, { feature: featureSlug, submodule: subSlug, name }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    if (action === 'add') {
      sub.variables = (sub.variables || []).filter((v) => v.name !== name);
      const v = { name };
      if (flags.type !== undefined) v.type = String(flags.type);
      if (flags.scope !== undefined) v.scope = String(flags.scope);
      if (flags.purpose !== undefined) v.purpose = String(flags.purpose);
      if (flags.evidence !== undefined) v.evidence = parseEvidence(flags.evidence);
      sub.variables.push(v);
    } else if (action === 'remove') {
      sub.variables = (sub.variables || []).filter((v) => v.name !== name);
    } else {
      throw new Error(`Unknown variable subverb: ${action}`);
    }
  }, io);
}

async function verbDataflow(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  return performMutation(projectRoot, flags, `dataflow ${action}`, { feature: featureSlug, submodule: subSlug, step: flags.step, at: flags.at }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    sub.dataflow = sub.dataflow || [];
    if (action === 'add') {
      const step = String(requireFlag(flags, 'step'));
      const item = buildDataflowItem(step, flags);
      const atRaw = flags.at;
      if (atRaw !== undefined) {
        const at = Number(atRaw);
        if (!Number.isFinite(at) || at < 0) throw new Error('--at must be a non-negative integer');
        sub.dataflow.splice(at, 0, item);
      } else {
        sub.dataflow.push(item);
      }
    } else if (action === 'remove') {
      if (flags.at !== undefined) {
        const at = Number(flags.at);
        if (!Number.isFinite(at) || at < 0 || at >= sub.dataflow.length) throw new Error('--at out of range');
        sub.dataflow.splice(at, 1);
      } else {
        const step = String(requireFlag(flags, 'step'));
        sub.dataflow = sub.dataflow.filter((s) => stepText(s) !== step);
      }
    } else if (action === 'reorder') {
      const from = Number(requireFlag(flags, 'from'));
      const to = Number(requireFlag(flags, 'to'));
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0 || from >= sub.dataflow.length || to >= sub.dataflow.length) {
        throw new Error('--from / --to out of range');
      }
      const [moved] = sub.dataflow.splice(from, 1);
      sub.dataflow.splice(to, 0, moved);
    } else {
      throw new Error(`Unknown dataflow subverb: ${action}`);
    }
  }, io);
}

function stepText(item) {
  return typeof item === 'string' ? item : (item && typeof item.step === 'string' ? item.step : '');
}

function buildDataflowItem(step, flags) {
  const fn = flags.fn === undefined ? undefined : String(flags.fn).trim();
  const reads = splitList(flags.reads);
  const writes = splitList(flags.writes);
  const annotated = (fn && fn.length > 0) || (reads && reads.length > 0) || (writes && writes.length > 0) || flags.evidence !== undefined;
  if (!annotated) return step;
  const item = { step };
  if (fn) item.fn = fn;
  if (reads && reads.length > 0) item.reads = reads;
  if (writes && writes.length > 0) item.writes = writes;
  if (flags.evidence !== undefined) item.evidence = parseEvidence(flags.evidence);
  return item;
}

async function verbError(action, flags, projectRoot, io) {
  const featureSlug = String(requireFlag(flags, 'feature'));
  const subSlug = String(requireFlag(flags, 'submodule'));
  const name = String(requireFlag(flags, 'name'));
  return performMutation(projectRoot, flags, `error ${action}`, { feature: featureSlug, submodule: subSlug, name }, (state) => {
    const feature = ensureFeature(state, featureSlug);
    const sub = ensureSubmodule(feature, subSlug);
    if (action === 'add') {
      sub.errors = (sub.errors || []).filter((e) => e.name !== name);
      const err = { name };
      if (flags.when !== undefined) err.when = String(flags.when);
      if (flags.means !== undefined) err.means = String(flags.means);
      if (flags.evidence !== undefined) err.evidence = parseEvidence(flags.evidence);
      sub.errors.push(err);
    } else if (action === 'remove') {
      sub.errors = (sub.errors || []).filter((e) => e.name !== name);
    } else {
      throw new Error(`Unknown error subverb: ${action}`);
    }
  }, io);
}

async function verbEdge(action, flags, projectRoot, io) {
  const from = parseEndpoint(requireFlag(flags, 'from'));
  const to = parseEndpoint(requireFlag(flags, 'to'));
  return performMutation(projectRoot, flags, `edge ${action}`, { from, to, kind: flags.kind, label: flags.label, id: flags.id }, (state) => {
    if (action === 'add') {
      const edge = {
        id: flags.id ? String(flags.id) : undefined,
        from,
        to,
        kind: flags.kind ? String(flags.kind) : 'call',
        label: flags.label !== undefined ? String(flags.label) : '',
        ...(flags.evidence !== undefined ? { evidence: parseEvidence(flags.evidence) } : {}),
      };
      if (!edge.id) edge.id = `e-${Math.random().toString(36).slice(2, 8)}`;
      const intra = isIntraFeatureEdge(from, to);
      if (intra) {
        const feature = ensureFeature(state, from.feature);
        feature.edges = feature.edges || [];
        feature.edges = feature.edges.filter((e) => e.id !== edge.id);
        feature.edges.push({
          id: edge.id,
          from: from.submodule,
          to: to.submodule,
          kind: edge.kind,
          label: edge.label,
          ...(edge.evidence ? { evidence: edge.evidence } : {}),
        });
        return;
      }
      state.edges = state.edges || [];
      state.edges = state.edges.filter((e) => e.id !== edge.id);
      state.edges.push(edge);
      return;
    }
    if (action === 'remove') {
      const id = flags.id ? String(flags.id) : null;
      const intra = isIntraFeatureEdge(from, to);
      if (intra) {
        const feature = findFeature(state, from.feature);
        if (!feature) {
          const inputEdgeStr = `"${from.feature}/${from.submodule}" -> "${to.feature}/${to.submodule}"`;
          const available = formatAvailableEdges(state, null);
          const similar = sortBySimilarity(inputEdgeStr, available);
          throw new Error(`Feature "${from.feature}" not found for edge removal. Available edges: ${similar.join(', ') || '(none)'}`);
        }
        const before = (feature.edges || []).length;
        feature.edges = (feature.edges || []).filter((e) => {
          if (id && e.id === id) return false;
          if (flags.kind && e.kind !== flags.kind) return true;
          const f = typeof e.from === 'string' ? e.from : e.from && e.from.submodule;
          const t = typeof e.to === 'string' ? e.to : e.to && e.to.submodule;
          return !(f === from.submodule && t === to.submodule);
        });
        if (feature.edges.length >= before) {
          const inputEdgeStr = `"${from.submodule}" -> "${to.submodule}"`;
          const existingList = (feature.edges || []).map(e => {
            const ef = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
            const et = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
            return `"${ef}" -> "${et}"${e.kind ? ` (${e.kind})` : ''}`;
          });
          const similar = sortBySimilarity(inputEdgeStr, existingList);
          throw new Error(`Edge "${from.feature}/${from.submodule}" -> "${to.feature}/${to.submodule}" not found. Available edges: ${similar.join(', ') || '(none)'}`);
        }
        return;
      }
      const before = state.edges ? state.edges.length : 0;
      state.edges = (state.edges || []).filter((e) => {
        if (id && e.id === id) return false;
        if (flags.kind && e.kind !== flags.kind) return true;
        return !(endpointEquals(e.from, from) && endpointEquals(e.to, to));
      });
      if ((state.edges ? state.edges.length : 0) >= before) {
        const fromStr = from.submodule ? `${from.feature}/${from.submodule}` : from.feature;
        const toStr = to.submodule ? `${to.feature}/${to.submodule}` : to.feature;
        const inputEdgeStr = `"${fromStr}" -> "${toStr}"`;
        const existingList = (state.edges || []).map(e => {
          const ef = e.from && (e.from.submodule ? `${e.from.feature}/${e.from.submodule}` : e.from.feature);
          const et = e.to && (e.to.submodule ? `${e.to.feature}/${e.to.submodule}` : e.to.feature);
          return `"${ef}" -> "${et}"${e.kind ? ` (${e.kind})` : ''}`;
        });
        const similar = sortBySimilarity(inputEdgeStr, existingList);
        throw new Error(`Edge "${fromStr}" -> "${toStr}" not found. Available edges: ${similar.join(', ') || '(none)'}`);
      }
      return;
    }
    throw new Error(`Unknown edge subverb: ${action}`);
  }, io);
}

function endpointEquals(a, b) {
  if (typeof a === 'string' || typeof b === 'string') return false;
  if (!a || !b) return false;
  return a.feature === b.feature && (a.submodule || null) === (b.submodule || null);
}

async function verbMeta(action, flags, projectRoot, io) {
  if (action !== 'set') throw new Error(`Unknown meta subverb: ${action}`);
  const update = {};
  if (flags.title !== undefined) update.title = String(flags.title);
  if (flags.summary !== undefined) update.summary = String(flags.summary);
  if (flags.evidence !== undefined) update.evidence = parseEvidence(flags.evidence);
  return performMutation(projectRoot, flags, 'meta set', update, (state) => {
    state.meta = { ...state.meta, ...update };
  }, io);
}

async function verbActor(action, flags, projectRoot, io) {
  const id = String(requireFlag(flags, 'id'));
  return performMutation(projectRoot, flags, `actor ${action}`, { id, label: flags.label }, (state) => {
    state.actors = state.actors || [];
    if (action === 'add') {
      state.actors = state.actors.filter((a) => a.id !== id);
      const actor = { id, label: flags.label !== undefined ? String(flags.label) : id };
      if (flags.evidence !== undefined) actor.evidence = parseEvidence(flags.evidence);
      state.actors.push(actor);
    } else if (action === 'remove') {
      state.actors = state.actors.filter((a) => a.id !== id);
    } else {
      throw new Error(`Unknown actor subverb: ${action}`);
    }
  }, io);
}

async function verbAdd(args, flags, projectRoot, io) {
  // In batch mode (called with rawArgs), args contains interleaved --flags
  // In single-entity mode, args is positional only and flags are pre-parsed
  // Batch mode detection: if more than 2 positional args we have type/name pairs.
  // This heuristic works because entity type keywords (feature/module/relation)
  // don't start with '--', and flag names always do.
  const isBatchMode = args.length > 2;

  // Validate --spec directory exists before any entity processing
  if (flags.spec) {
    const specPath = path.isAbsolute(String(flags.spec))
      ? String(flags.spec)
      : path.resolve(projectRoot, String(flags.spec));
    if (!fs.existsSync(specPath)) {
      throw new Error(`Spec directory not found: ${flags.spec}`);
    }
  }

  async function processAddEntity(entityType, entityName, entityFlags) {
    switch (entityType) {
      case 'feature':
        {
          const { base, merged } = loadResolvedState(projectRoot, entityFlags);
          const preState = entityFlags.spec ? merged : base;

          // Check for duplicate before validating depends-on targets
          if (findFeature(preState, entityName)) {
            return await verbFeature('add', {
              slug: entityName,
              'depends-on': entityFlags['depends-on'],
              spec: entityFlags.spec,
              'no-render': true,
              project: entityFlags.project,
              'dry-run': entityFlags['dry-run'],
              evidence: entityFlags.evidence,
              skipUndo: entityFlags.skipUndo,
            }, projectRoot, io);
          }

          // Validate --depends-on targets before creating the feature (only for new features)
          const featDependsOn = entityFlags['depends-on'];
          if (featDependsOn) {
            const targets = String(featDependsOn).split(',').map(s => s.trim()).filter(Boolean);
            const availableFeatures = (preState.features || []).map(f => f.slug);
            for (const target of targets) {
              if (!availableFeatures.includes(target)) {
                throw new Error(`Dependency target "${target}" not found. Available features: ${availableFeatures.join(', ') || '(none)'}`);
              }
            }
          }

          const featResult = await verbFeature('add', {
            slug: entityName,
            'depends-on': entityFlags['depends-on'],
            spec: entityFlags.spec,
            'no-render': true,
            project: entityFlags.project,
            'dry-run': entityFlags['dry-run'],
            evidence: entityFlags.evidence,
            skipUndo: entityFlags.skipUndo,
          }, projectRoot, io);
          if (featResult === 'skipped') return 'skipped';

          // Create dependency edges if --depends-on specified (supports comma-separated)
          if (featDependsOn) {
            const targets = String(featDependsOn).split(',').map(s => s.trim()).filter(Boolean);
            for (const target of targets) {
              await verbEdge('add', {
                from: entityName,
                to: target,
                kind: 'dependency',
                spec: entityFlags.spec,
                'no-render': true,
                project: entityFlags.project,
                'dry-run': entityFlags['dry-run'],
                skipUndo: true,
              }, projectRoot, io);
            }
          }

          return featResult;
        }
      case 'module': {
        if (!entityFlags['part-of']) throw new Error('Missing required flag --part-of for module');

        // Prevalidate all endpoint targets before creating the submodule
        const implementsTarget = entityFlags.implements;
        const deployedOnTarget = entityFlags['deployed-on'];
        const dependsOn = entityFlags['depends-on'];
        const dataFlowTo = entityFlags['data-flow-to'];
        const { merged: preState } = loadResolvedState(projectRoot, entityFlags);
        if (implementsTarget) {
          assertEndpointExists(preState, implementsTarget, '--implements');
        }
        if (dependsOn) {
          const targets = String(dependsOn).split(',').map(s => s.trim()).filter(Boolean);
          const availableFeatureSlugs = (preState.features || []).map(f => f.slug);
          for (const target of targets) {
            const [featSlug, subSlug] = target.split('/').map(s => s.trim());
            if (subSlug) {
              const feat = findFeature(preState, featSlug);
              if (!feat) {
                throw new Error(`Dependency target feature "${featSlug}" not found. Available features: ${availableFeatureSlugs.join(', ') || '(none)'}`);
              }
              if (!findSubmodule(feat, subSlug)) {
                const availableSubs = (feat.submodules || []).map(s => s.slug).join(', ') || '(none)';
                throw new Error(`Dependency target submodule "${subSlug}" not found in feature "${featSlug}". Available submodules: ${availableSubs}`);
              }
            } else {
              if (!availableFeatureSlugs.includes(featSlug)) {
                throw new Error(`Dependency target "${featSlug}" not found. Available features: ${availableFeatureSlugs.join(', ') || '(none)'}`);
              }
            }
          }
        }
        if (dataFlowTo) {
          assertEndpointExists(preState, dataFlowTo, '--data-flow-to');
        }
        if (deployedOnTarget) {
          assertEndpointExists(preState, deployedOnTarget, '--deployed-on');
        }

        const result = await verbSubmodule('add', {
          feature: entityFlags['part-of'],
          slug: entityName,
          spec: entityFlags.spec,
          'no-render': true,
          project: entityFlags.project,
          'dry-run': entityFlags['dry-run'],
          kind: entityFlags.kind,
          evidence: entityFlags.evidence,
          skipUndo: entityFlags.skipUndo,
        }, projectRoot, io);
        if (result === 'skipped') return 'skipped';

        // Create implements/deployed-on edges if specified
        if (implementsTarget) {
          await verbEdge('add', {
            from: `${entityFlags['part-of']}/${entityName}`,
            to: implementsTarget,
            kind: 'implements',
            spec: entityFlags.spec,
            'no-render': true,
            project: entityFlags.project,
            'dry-run': entityFlags['dry-run'],
            skipUndo: true,
          }, projectRoot, io);
        }
        if (deployedOnTarget) {
          await verbEdge('add', {
            from: `${entityFlags['part-of']}/${entityName}`,
            to: deployedOnTarget,
            kind: 'deployed-on',
            spec: entityFlags.spec,
            'no-render': true,
            project: entityFlags.project,
            'dry-run': entityFlags['dry-run'],
            skipUndo: true,
          }, projectRoot, io);
        }

        // Create dependency edges if --depends-on specified
        if (dependsOn) {
          const targets = String(dependsOn).split(',').map(s => s.trim()).filter(Boolean);
          for (const target of targets) {
            await verbEdge('add', {
              from: `${entityFlags['part-of']}/${entityName}`,
              to: target,
              kind: 'dependency',
              spec: entityFlags.spec,
              'no-render': true,
              project: entityFlags.project,
              'dry-run': entityFlags['dry-run'],
              skipUndo: true,
            }, projectRoot, io);
          }
        }

        // Create data-flow edge if --data-flow-to specified
        if (dataFlowTo) {
          await verbEdge('add', {
            from: `${entityFlags['part-of']}/${entityName}`,
            to: dataFlowTo,
            kind: 'data-row',
            spec: entityFlags.spec,
            'no-render': true,
            project: entityFlags.project,
            'dry-run': entityFlags['dry-run'],
            skipUndo: true,
          }, projectRoot, io);
        }

        return result;
      }
      case 'relation': {
        const dataFlowTo = entityFlags['data-flow-to'];
        const implementsTarget = entityFlags.implements;
        const deployedOn = entityFlags['deployed-on'];
        const dependsOn = entityFlags['depends-on'];
        const to = dataFlowTo || implementsTarget || deployedOn;
        if (!to && !dependsOn) throw new Error('Missing required flag --data-flow-to, --implements, --deployed-on, or --depends-on for relation');
        let kind = 'call';
        if (dataFlowTo) kind = 'data-row';
        else if (implementsTarget) kind = 'implements';
        else if (deployedOn) kind = 'deployed-on';

        const { base, merged } = loadResolvedState(projectRoot, entityFlags);
        const currentState = entityFlags.spec ? merged : base;

        // Validate source endpoint exists before any edge creation
        assertEndpointExists(currentState, entityName, 'relation source');

        // Check for duplicate edge before creation (cross-feature + intra-feature)
        if (to) {
          const edges = currentState.edges || [];
          const fromEndpoint = parseEndpoint(entityName);
          const toEndpoint = parseEndpoint(to);
          const hasExistingEdge = edges.some(e =>
            endpointEquals(e.from, fromEndpoint) && endpointEquals(e.to, toEndpoint) && (e.kind || 'call') === kind
          );
          // Check intra-feature edges if both endpoints share a feature
          let hasExistingIntraEdge = false;
          if (fromEndpoint && toEndpoint && isIntraFeatureEdge(fromEndpoint, toEndpoint)) {
            const feature = findFeature(currentState, fromEndpoint.feature);
            if (feature) {
              const intraEdges = feature.edges || [];
              hasExistingIntraEdge = intraEdges.some(e => {
                const eFrom = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
                const eTo = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
                return eFrom === fromEndpoint.submodule && eTo === toEndpoint.submodule && (e.kind || 'call') === kind;
              });
            }
          }
          if (hasExistingEdge || hasExistingIntraEdge) {
            return 'skipped';
          }
        }

        // Check for duplicate dependency-only relation (all comma-separated targets)
        if (!to && dependsOn) {
          const dependsOnItems = splitList(dependsOn);
          const edges = currentState.edges || [];
          const fromEndpoint = parseEndpoint(entityName);
          const existingDepEdges = edges.filter(e =>
            e.kind === 'dependency' &&
            endpointEquals(e.from, fromEndpoint)
          );
          for (const depTarget of dependsOnItems) {
            const depEndpoint = parseEndpoint(depTarget);
            const hasExistingDep = existingDepEdges.some(e =>
              endpointEquals(e.to, depEndpoint)
            );
            if (hasExistingDep) return 'skipped';
          }
        }

        // Validate dependency targets exist before creating edges
        if (dependsOn) {
          const depTargets = String(dependsOn).split(',').map(s => s.trim()).filter(Boolean);
          const availableFeatureSlugs = (currentState.features || []).map(f => f.slug);
          for (const target of depTargets) {
            if (!availableFeatureSlugs.includes(target)) {
              throw new Error(`Dependency target "${target}" not found. Available features: ${availableFeatureSlugs.join(', ') || '(none)'}`);
            }
          }
        }

        // Create the primary edge (data-flow, implements, or deployed-on)
        let result;
        if (to) {
          // Validate target endpoint exists before writing edge
          const ctxLabel = dataFlowTo ? '--data-flow-to' : implementsTarget ? '--implements' : '--deployed-on';
          assertEndpointExists(currentState, to, ctxLabel);
          result = await verbEdge('add', {
            from: entityName,
            to,
            kind,
            spec: entityFlags.spec,
            'no-render': true,
            project: entityFlags.project,
            'dry-run': entityFlags['dry-run'],
            id: entityFlags.id,
            skipUndo: true,
          }, projectRoot, io);
        }

        // Create dependency edge if --depends-on specified
        if (dependsOn) {
          const targets = String(dependsOn).split(',').map(s => s.trim()).filter(Boolean);
          for (const target of targets) {
            await verbEdge('add', {
              from: entityName,
              to: target,
              kind: 'dependency',
              spec: entityFlags.spec,
              'no-render': true,
              project: entityFlags.project,
              'dry-run': entityFlags['dry-run'],
              skipUndo: true,
            }, projectRoot, io);
          }
        }

        return result;
      }
      default:
        throw new Error(`Unknown entity type: ${entityType}. Supported types: feature, module, relation`);
    }
  }

  if (isBatchMode) {
    // Batch mode with raw interleaved args: parse entities and their flags
    if (args.some(t => t.startsWith('--'))) {
      const entities = [];
      let i = 0;
      while (i < args.length) {
        const token = args[i];
        if (token === 'feature' || token === 'module' || token === 'relation') {
          const entityType = token;
          i++;
          const entityName = args[i];
          if (!entityName || entityName.startsWith('--')) {
            throw new Error(`Missing name for entity type: ${entityType}`);
          }
          i++;

          const entityFlags = {};
          while (i < args.length && !['feature', 'module', 'relation'].includes(args[i])) {
            const t = args[i];
            if (t.startsWith('--')) {
              const eq = t.indexOf('=');
              let name, value;
              if (eq !== -1) {
                name = t.slice(2, eq);
                value = t.slice(eq + 1);
                i++;
              } else {
                name = t.slice(2);
                const isBool = BOOLEAN_FLAGS.has(name);
                const nextIsValue = i + 1 < args.length && !args[i + 1].startsWith('--') && !['feature', 'module', 'relation'].includes(args[i + 1]);
                if (isBool || !nextIsValue) {
                  value = true;
                  i++;
                } else {
                  value = args[i + 1];
                  i += 2;
                }
              }
              entityFlags[name] = value;
            } else if (t === '-h') {
              entityFlags.help = true;
              i++;
            } else {
              i++; // skip unexpected tokens
            }
          }

          // Also copy global flags to entity flags
          if (flags.project !== undefined) entityFlags.project = flags.project;
          if (flags.spec !== undefined) entityFlags.spec = flags.spec;
          if (flags['no-render'] !== undefined) entityFlags['no-render'] = flags['no-render'];
          if (flags['dry-run'] !== undefined) entityFlags['dry-run'] = flags['dry-run'];
          if (flags.evidence !== undefined) entityFlags.evidence = flags.evidence;
          // Entity-specific relation flags MUST be defined per-entity and not leak from global scope
          // Only true global flags (project, spec, no-render, dry-run, evidence) are copied above

          // Validate that value-required flags have actual values
          if (entityFlags['depends-on'] === true) {
            throw new Error(`--depends-on requires a value (e.g., --depends-on feature-name)`);
          }
          if (entityFlags['part-of'] === true) {
            throw new Error(`--part-of requires a value (e.g., --part-of feature-name)`);
          }

          entities.push({ type: entityType, name: entityName, flags: entityFlags });
        } else {
          i++;
        }
      }

      // Check for empty entity list
      if (entities.length === 0) {
        throw new Error('No valid entities found. Usage: apltk architecture add <feature|module|relation> <name> [--flags...]');
      }

      // Pre-validation phase: check all entities before processing any
      let error;
      for (const entity of entities) {
        try {
          validateEntity(entity);
        } catch (e) {
          error = e;
          break;
        }
      }
      if (error) throw error;

      // All valid — process with staged atomicity: in-memory mutations, single commit on success
      let preBatchState, preBatchOverlayState;
      let overlayDir;
      if (!flags['dry-run']) {
        _batchStagingActive = true;
      }
      if (flags.spec) {
        const specResult = specOverlayDir(projectRoot, flags.spec);
        overlayDir = specResult.overlayDir;
        preBatchOverlayState = JSON.parse(JSON.stringify(stateLib.loadOverlay(overlayDir)));
        if (_batchStagingActive) {
          _batchStagedState = { base: stateLib.load(baseAtlasDir(projectRoot)), overlay: JSON.parse(JSON.stringify(preBatchOverlayState)) };
        }
      } else {
        preBatchState = stateLib.load(baseAtlasDir(projectRoot));
        if (_batchStagingActive) {
          _batchStagedState = JSON.parse(JSON.stringify(preBatchState));
        }
      }
      let skipped = 0;
      try {
        for (const entity of entities) {
          entity.flags.skipUndo = true;
          const result = await processAddEntity(entity.type, entity.name, entity.flags);
          if (result === 'skipped') skipped++;
        }
      } catch (e) {
        _batchStagingActive = false;
        _batchStagedState = null;
        throw e;
      }

      // Commit staged state: single durable write + batch undo snapshot
      if (!flags['dry-run']) {
        if (flags.spec) {
          stateLib.saveOverlay(overlayDir, _batchStagedState.overlay);
          stateLib.writeUndoSnapshot(overlayDir, { base: _batchStagedState.base, overlay: preBatchOverlayState });
          stateLib.appendHistory(overlayDir, {
            action: `batch add (${entities.length} entities: ${entities.map(e => `${e.type}:${e.name}`).join(', ')})`,
            args: entities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
            mode: 'spec',
          });
        } else {
          stateLib.save(baseAtlasDir(projectRoot), _batchStagedState);
          stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), { base: preBatchState });
          stateLib.appendHistory(baseAtlasDir(projectRoot), {
            action: `batch add (${entities.length} entities: ${entities.map(e => `${e.type}:${e.name}`).join(', ')})`,
            args: entities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
            mode: 'base',
          });
        }
        _batchStagingActive = false;
        _batchStagedState = null;
      }

      // Determine if any entity requested --no-render
      const anyEntityNoRender = entities.some(e => e.flags['no-render']);
      if (!flags['dry-run'] && !flags['no-render'] && !anyEntityNoRender) {
        await runRender({ projectRoot, flags });
      }
      const dryRunPrefix = flags['dry-run'] ? ' (dry-run, no changes written)' : '';
      const applied = entities.length - skipped;
      if (skipped > 0 && applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exists)${dryRunPrefix}\n`);
      } else if (applied > 0) {
        io.stdout.write(`atlas: add applied — ${applied} entities${dryRunPrefix}\n`);
      } else if (skipped > 0) {
        io.stdout.write(`atlas: add — all ${skipped} entities already exist, skipped${dryRunPrefix}\n`);
      }
      if (entities.length > 0) {
        for (const e of entities) {
          io.stdout.write(`  ${e.type}: "${e.name}"${dryRunPrefix}\n`);
        }
      }
      return 0;
    }

    // Batch mode without interleaved flags — simple sequential pairs
    let preBatchState, preBatchOverlayState;
    let overlayDir;
    if (!flags['dry-run']) {
      _batchStagingActive = true;
    }
    if (flags.spec) {
      const specResult = specOverlayDir(projectRoot, flags.spec);
      overlayDir = specResult.overlayDir;
      preBatchOverlayState = JSON.parse(JSON.stringify(stateLib.loadOverlay(overlayDir)));
      if (_batchStagingActive) {
        _batchStagedState = { base: stateLib.load(baseAtlasDir(projectRoot)), overlay: JSON.parse(JSON.stringify(preBatchOverlayState)) };
      }
    } else {
      preBatchState = stateLib.load(baseAtlasDir(projectRoot));
      if (_batchStagingActive) {
        _batchStagedState = JSON.parse(JSON.stringify(preBatchState));
      }
    }

    // Pre-validate all entities before processing
    const simpleEntities = [];
    for (let i = 0; i < args.length; i += 2) {
      const entityType = args[i];
      const entityName = args[i + 1];
      if (!entityName) throw new Error(`Missing name for entity type: ${entityType}`);
      simpleEntities.push({ type: entityType, name: entityName, flags: { ...flags, skipUndo: true } });
    }
    let preError;
    for (const entity of simpleEntities) {
      try {
        validateEntity(entity);
      } catch (e) {
        preError = e;
        break;
      }
    }
    if (preError) throw preError;

    let skipped = 0;
    try {
      for (const entity of simpleEntities) {
        const result = await processAddEntity(entity.type, entity.name, entity.flags);
        if (result === 'skipped') skipped++;
      }
    } catch (e) {
      _batchStagingActive = false;
      _batchStagedState = null;
      throw e;
    }

    // Commit staged state: single durable write + batch undo snapshot
    if (!flags['dry-run']) {
      if (flags.spec) {
        stateLib.saveOverlay(overlayDir, _batchStagedState.overlay);
        stateLib.writeUndoSnapshot(overlayDir, { base: _batchStagedState.base, overlay: preBatchOverlayState });
        stateLib.appendHistory(overlayDir, {
          action: `batch add (${simpleEntities.length} entities: ${simpleEntities.map(e => `${e.type}:${e.name}`).join(', ')})`,
          args: simpleEntities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
          mode: 'spec',
        });
      } else {
        stateLib.save(baseAtlasDir(projectRoot), _batchStagedState);
        stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), { base: preBatchState });
        stateLib.appendHistory(baseAtlasDir(projectRoot), {
          action: `batch add (${simpleEntities.length} entities: ${simpleEntities.map(e => `${e.type}:${e.name}`).join(', ')})`,
          args: simpleEntities.map(e => ({ type: e.type, name: e.name, flags: e.flags })),
          mode: 'base',
        });
      }
      _batchStagingActive = false;
      _batchStagedState = null;
    }

    const anyEntityNoRender = simpleEntities.some(e => e.flags['no-render']);
    if (!flags['dry-run'] && !flags['no-render'] && !anyEntityNoRender) {
      await runRender({ projectRoot, flags });
    }
    const dryRunPrefix = flags['dry-run'] ? ' (dry-run, no changes written)' : '';
    const applied = simpleEntities.length - skipped;
    if (skipped > 0) {
      io.stdout.write(`atlas: add applied — ${applied} entity(ies) added, ${skipped} skipped (already exist)${dryRunPrefix}\n`);
    } else {
      io.stdout.write(`atlas: add applied — ${applied} entities${dryRunPrefix}\n`);
    }
    for (const entity of simpleEntities) {
      io.stdout.write(`  ${entity.type}: "${entity.name}"${dryRunPrefix}\n`);
    }
    return 0;
  }

  // Single-entity mode
  const type = args[0];
  const name = args[1];

  if (!type || !name) {
    throw new Error('Usage: apltk architecture add <feature|module|relation> <name> [relation-flags...]');
  }

  validateEntity({ type, name, flags });
  const addResult = await processAddEntity(type, name, flags);
  if (addResult !== 'skipped' && !flags['dry-run'] && !flags['no-render']) {
    await runRender({ projectRoot, flags });
  }
  if (addResult === 'skipped') {
    io.stdout.write(`atlas: no change — ${type} "${name}" already exists\n`);
  } else {
    const addedFlags = [];
    const flagConsumed = {
      feature: new Set(['depends-on']),
      module: new Set(['part-of', 'depends-on', 'data-flow-to', 'implements', 'deployed-on']),
      relation: new Set(['data-flow-to', 'implements', 'deployed-on', 'depends-on']),
    };
    const consumed = flagConsumed[type] || new Set();
    if (consumed.has('part-of') && flags['part-of']) addedFlags.push(`part-of: ${flags['part-of']}`);
    if (consumed.has('depends-on') && flags['depends-on']) addedFlags.push(`depends-on: ${flags['depends-on']}`);
    if (consumed.has('data-flow-to') && flags['data-flow-to']) addedFlags.push(`data-flow-to: ${flags['data-flow-to']}`);
    if (consumed.has('implements') && flags.implements) addedFlags.push(`implements: ${flags.implements}`);
    if (consumed.has('deployed-on') && flags['deployed-on']) addedFlags.push(`deployed-on: ${flags['deployed-on']}`);
    const summary = addedFlags.length > 0 ? ` (${addedFlags.join(', ')})` : '';
    io.stdout.write(`atlas: add applied — ${type} "${name}"${summary}\n`);
  }
  return 0;
}

function validateEntity(entity) {
  if (!entity.type || !entity.name) throw new Error('Missing entity type or name');
  if (entity.type === 'module' && !entity.flags['part-of']) {
    throw new Error('Missing required flag --part-of for module');
  }
  if (entity.type === 'relation' && !entity.flags['data-flow-to'] && !entity.flags.implements && !entity.flags['deployed-on'] && !entity.flags['depends-on']) {
    throw new Error('Missing required flag --data-flow-to, --implements, --deployed-on, or --depends-on for relation');
  }
}

async function verbRemove(args, flags, projectRoot, io) {
  const type = args[0];
  const name = args[1];

  if (!type || !name) {
    throw new Error('Usage: apltk architecture remove <feature|module|relation> <name>');
  }

  switch (type) {
    case 'feature':
      await verbFeature('remove', {
        slug: name,
        spec: flags.spec,
        'no-render': flags['no-render'],
        project: flags.project,
        'dry-run': flags['dry-run'],
      }, projectRoot, io);
      if (!flags['dry-run']) {
        io.stdout.write(`atlas: remove applied — feature "${name}"\n`);
      }
      return 0;
    case 'module': {
      if (!flags['part-of']) throw new Error('Missing required flag --part-of for module');
      await verbSubmodule('remove', {
        feature: flags['part-of'],
        slug: name,
        spec: flags.spec,
        'no-render': flags['no-render'],
        project: flags.project,
        'dry-run': flags['dry-run'],
      }, projectRoot, io);
      if (!flags['dry-run']) {
        io.stdout.write(`atlas: remove applied — module "${name}"\n`);
      }
      return 0;
    }
    case 'relation': {
      if (!flags.to) throw new Error('Missing required flag --to for relation (--id is optional for precision targeting)');
      await verbEdge('remove', {
        from: name,
        to: flags.to,
        kind: flags.kind,
        id: flags.id,
        spec: flags.spec,
        'no-render': flags['no-render'],
        project: flags.project,
        'dry-run': flags['dry-run'],
      }, projectRoot, io);
      if (!flags['dry-run']) {
        const detail = flags.kind ? ` (kind: ${flags.kind})` : '';
        io.stdout.write(`atlas: remove applied — relation "${name}"${detail}\n`);
      }
      return 0;
    }
    default:
      throw new Error(`Unknown entity type: ${type}. Supported types: feature, module, relation`);
  }
}

async function verbValidate(flags, projectRoot, io) {
  const { merged } = loadResolvedState(projectRoot, flags);
  const result = schema.validate(merged, formatFix);
  if (result.valid) {
    io.stdout.write('atlas: OK\n');
    return 0;
  }
  for (const err of result.errors) {
    io.stderr.write(`${err.message}\n`);
    if (err.fixCommand) {
      io.stderr.write(`  → fix: ${err.fixCommand}\n`);
    }
  }
  return 1;
}

async function verbStatus(flags, projectRoot, io) {
  const { merged } = loadResolvedState(projectRoot, flags);
  const summary = stateLib.summarize(merged);
  const validation = schema.validate(merged, formatFix);

  if (flags.json) {
    const output = {
      meta: summary.meta,
      counts: summary.counts,
      featureList: summary.featureList,
      validation: {
        valid: validation.valid,
        errorCount: validation.errors.length,
        errors: validation.errors.map((e) => e.message),
      },
    };
    try {
      io.stdout.write(JSON.stringify(output) + '\n');
    } catch (err) {
      io.stderr.write(`status error: ${err.message}\n`);
    }
    return 0;
  }

  io.stdout.write('Atlas Status\n');
  io.stdout.write(`  Features: ${summary.counts.features}\n`);
  io.stdout.write(`  Submodules: ${summary.counts.submodules}\n`);
  io.stdout.write(`  Cross-feature edges: ${summary.counts.crossFeatureEdges}\n`);
  io.stdout.write(`  Intra-feature edges: ${summary.counts.intraFeatureEdges}\n`);
  io.stdout.write(`  Actors: ${summary.counts.actors}\n`);
  io.stdout.write(`  Updated: ${summary.meta.updatedAt || 'never'}\n`);

  if (validation.valid) {
    io.stdout.write('  Validation: OK\n');
  } else {
    io.stdout.write(`  Validation: ${validation.errors.length} error(s)\n`);
  }

  io.stdout.write('  Features:\n');
  for (const f of summary.featureList) {
    io.stdout.write(`    ${f.slug}: ${f.title} (${f.submoduleCount} submodules)\n`);
  }

  return 0;
}

async function verbScan(flags, projectRoot, io) {
  const srcSpecified = flags.src !== undefined;
  const srcRaw = srcSpecified ? String(flags.src) : 'src';
  let srcDir = path.resolve(projectRoot, srcRaw);

  let entries;
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch (e) {
    if (!srcSpecified) {
      // Fallback to project root when default src/ doesn't exist
      try {
        entries = fs.readdirSync(projectRoot, { withFileTypes: true });
        srcDir = projectRoot;
      } catch (e2) {
        io.stderr.write(`Cannot read directory: ${projectRoot}\n`);
        return 1;
      }
    } else {
      io.stderr.write(`Cannot read directory: ${srcDir}\n`);
      return 1;
    }
  }

  const skipDirs = new Set(['node_modules', '.git', 'dist', '__tests__', 'coverage', '.turbo', 'build']);
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (skipDirs.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const suggestion = entry.name
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      || entry.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    results.push({
      name: entry.name,
      path: path.relative(projectRoot, path.join(srcDir, entry.name)),
      suggestion,
    });
  }

  try {
    io.stdout.write(JSON.stringify(results) + '\n');
  } catch (err) {
    io.stderr.write(`scan error: ${err.message}\n`);
  }
  return 0;
}

async function verbUndo(flags, projectRoot, io) {
  const dir = flags.spec ? specOverlayDir(projectRoot, flags.spec).overlayDir : baseAtlasDir(projectRoot);
  const stepsRaw = flags.steps === undefined ? 1 : Number(flags.steps);
  if (!Number.isInteger(stepsRaw) || stepsRaw < 1) {
    io.stderr.write('--steps must be a positive integer.\n');
    return 1;
  }
  const snapshot = stateLib.consumeUndoSnapshot(dir, stepsRaw);
  if (!snapshot) {
    io.stderr.write(stepsRaw === 1 ? 'No undo snapshot found.\n' : `Unable to undo ${stepsRaw} steps; history is shorter.\n`);
    return 1;
  }
  if (flags.spec) {
    stateLib.saveOverlay(dir, snapshot.overlay);
    stateLib.appendHistory(dir, { action: 'undo', mode: 'spec' });
  } else {
    stateLib.save(baseAtlasDir(projectRoot), snapshot.base);
    stateLib.appendHistory(baseAtlasDir(projectRoot), { action: 'undo', mode: 'base' });
  }
  if (!flags['no-render']) await runRender({ projectRoot, flags });
  io.stdout.write(`atlas: undo applied (${stepsRaw} step${stepsRaw === 1 ? '' : 's'})\n`);
  return 0;
}

async function verbOpen(flags, projectRoot, io) {
  if (flags.spec) {
    const { htmlOutDir } = specOverlayDir(projectRoot, flags.spec);
    // Render spec overlay if needed
    const overlayHtml = path.join(htmlOutDir, 'index.html');
    if (!fs.existsSync(overlayHtml)) {
      await runRender({ projectRoot, flags });
    }
    if (!fs.existsSync(overlayHtml)) {
      io.stderr.write(`Spec overlay not found after render: ${overlayHtml}\n`);
      return 1;
    }
    io.stdout.write(`${overlayHtml}\n`);
    if (!flags['no-open']) openInBrowser(overlayHtml);
    return 0;
  }
  // Existing base atlas logic
  const atlas = path.join(projectRoot, ATLAS_INDEX_REL);
  if (!fs.existsSync(atlas)) {
    // Before rendering a fresh (empty) base atlas, check if spec overlays exist
    const plansRoot = path.join(projectRoot, PLANS_REL);
    const diffDirs = walkArchitectureDiffDirs(plansRoot);
    if (diffDirs.length > 0) {
      io.stdout.write(`Base atlas not found. Use --spec <dir> to open a spec overlay, or remove spec overlays to start fresh.\n`);
      return 0;
    }
    await runRender({ projectRoot, flags: { ...flags, spec: undefined } });
  }
  if (!fs.existsSync(atlas)) {
    io.stderr.write(`Atlas not found after render: ${atlas}\n`);
    return 1;
  }
  io.stdout.write(`${atlas}\n`);
  if (!flags['no-open']) openInBrowser(atlas);
  return 0;
}

async function verbDiff(flags, projectRoot, io) {
  const outDir = flags.out ? path.resolve(String(flags.out)) : path.join(projectRoot, DEFAULT_DIFF_OUT_REL);
  fs.mkdirSync(outDir, { recursive: true });
  const changes = await collectDiffChanges({ projectRoot, outDir, flags });

  const html = renderDiffViewer({ changes, projectRoot, outDir });
  const indexPath = path.join(outDir, 'index.html');
  fs.writeFileSync(indexPath, html, 'utf8');
  io.stdout.write(`${indexPath}\n`);
  const diffCounts = changes.reduce((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {});
  io.stdout.write(`Diff pages: ${changes.length} (modified=${diffCounts.modified || 0}, added=${diffCounts.added || 0}, removed=${diffCounts.removed || 0})\n`);
  if (!flags['no-open']) openInBrowser(indexPath);
  return 0;
}

async function collectDiffChanges({ projectRoot, outDir, flags = {} }) {
  if (flags.spec) {
    // Single spec mode: only collect changes for the specified spec
    const specPath = path.isAbsolute(String(flags.spec)) ? String(flags.spec) : path.resolve(projectRoot, String(flags.spec));
    const { overlayDir } = specOverlayDir(projectRoot, flags.spec);
    if (hasOverlayState(overlayDir)) {
      return await collectSingleSpecChanges({ projectRoot, specDir: specPath, specLabel: String(flags.spec) });
    }
    // Fallback to HTML manifest
    return collectHtmlManifestChanges({ projectRoot, diffDir: path.join(specPath, DIFF_DIRNAME), specLabel: String(flags.spec) });
  }
  // Existing behavior: walk all plans directories
  const plansRoot = path.join(projectRoot, PLANS_REL);
  const groups = groupDiffDirsByBatch({ projectRoot, plansRoot });
  const changes = [];

  for (const group of groups) {
    if (group.kind === 'batch') {
      changes.push(...await collectBatchGroupChanges({ projectRoot, outDir, group }));
    } else {
      changes.push(...await collectSingleSpecChanges({ projectRoot, specDir: group.specDir, specLabel: group.label }));
    }
  }

  changes.sort((a, b) => {
    if (a.spec !== b.spec) return a.spec.localeCompare(b.spec);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.rel.localeCompare(b.rel);
  });
  return changes;
}

function groupDiffDirsByBatch({ projectRoot, plansRoot }) {
  const groups = new Map();
  for (const diffDir of walkArchitectureDiffDirs(plansRoot)) {
    const specDir = path.dirname(diffDir);
    const batchRoot = findBatchRoot(specDir, plansRoot);
    const isBatchMember = Boolean(batchRoot && batchRoot !== specDir);
    const key = isBatchMember ? batchRoot : specDir;
    if (!groups.has(key)) {
      groups.set(key, {
        kind: isBatchMember ? 'batch' : 'single',
        key,
        label: path.relative(projectRoot, key),
        specDir: isBatchMember ? null : specDir,
        members: [],
      });
    }
    groups.get(key).members.push({ specDir, diffDir, label: path.relative(projectRoot, specDir) });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, members: group.members.sort((a, b) => a.specDir.localeCompare(b.specDir)) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function findBatchRoot(specDir, plansRoot) {
  const absolutePlansRoot = path.resolve(plansRoot);
  let current = path.resolve(path.dirname(specDir));
  while (current.startsWith(`${absolutePlansRoot}${path.sep}`) || current === absolutePlansRoot) {
    if (fs.existsSync(path.join(current, COORDINATION_FILE))) return current;
    if (current === absolutePlansRoot) break;
    current = path.dirname(current);
  }
  return null;
}

async function collectSingleSpecChanges({ projectRoot, specDir, specLabel }) {
  const overlayDir = path.join(specDir, DIFF_DIRNAME, ATLAS_DIRNAME);
  if (!hasOverlayState(overlayDir)) {
    return collectHtmlManifestChanges({ projectRoot, diffDir: path.join(specDir, DIFF_DIRNAME), specLabel });
  }
  const base = stateLib.load(baseAtlasDir(projectRoot));
  const overlay = stateLib.loadOverlay(overlayDir);
  const merged = stateLib.mergeOverlay(base, overlay);
  const diff = stateLib.diffPages(base, merged);
  const htmlRoot = path.join(specDir, DIFF_DIRNAME);
  // Render merged state so afterPath files exist even when the overlay
  // was created with --no-render. Use scoped render to emit only pages
  // that differ from the base atlas.
  await renderLib.renderAll({
    outDir: htmlRoot,
    state: merged,
    scope: renderLib.scopeFromDiff(diff),
    removedPaths: renderLib.removedPagePathsFromDiff(diff),
  });
  return diffToChanges({
    projectRoot,
    specLabel,
    htmlRoot,
    diff,
  });
}

function hasOverlayState(overlayDir) {
  return fs.existsSync(path.join(overlayDir, stateLib.INDEX_FILE))
    || fs.existsSync(path.join(overlayDir, stateLib.FEATURES_DIR))
    || fs.existsSync(path.join(overlayDir, stateLib.REMOVED_FILE));
}

async function collectBatchGroupChanges({ projectRoot, outDir, group }) {
  const batchRootOverlayDir = path.join(group.key, DIFF_DIRNAME, ATLAS_DIRNAME);
  if (hasOverlayState(batchRootOverlayDir)) {
    return await collectSingleSpecChanges({ projectRoot, specDir: group.key, specLabel: group.label });
  }

  const memberOverlayDirs = group.members.map((member) => ({
    ...member,
    overlayDir: path.join(member.specDir, DIFF_DIRNAME, ATLAS_DIRNAME),
  }));
  if (memberOverlayDirs.some((member) => !hasOverlayState(member.overlayDir))) {
    const memberChanges = await Promise.all(group.members.map((member) => (
      collectSingleSpecChanges({ projectRoot, specDir: member.specDir, specLabel: member.label })
    )));
    return memberChanges.flat();
  }

  const base = stateLib.load(baseAtlasDir(projectRoot));
  let merged = JSON.parse(JSON.stringify(base));
  for (const member of memberOverlayDirs) {
    const overlay = stateLib.loadOverlay(member.overlayDir);
    merged = stateLib.mergeOverlay(merged, overlay);
  }
  const diff = stateLib.diffPages(base, merged);
  const htmlRoot = path.join(outDir, '_batch', group.label);
  await renderLib.renderAll({
    outDir: htmlRoot,
    state: merged,
    scope: renderLib.scopeFromDiff(diff),
    removedPaths: renderLib.removedPagePathsFromDiff(diff),
  });
  return diffToChanges({
    projectRoot,
    specLabel: group.label,
    htmlRoot,
    diff,
  });
}

function diffToChanges({ projectRoot, specLabel, htmlRoot, diff }) {
  const resourcesRoot = path.join(projectRoot, ATLAS_REL);
  const changes = [];
  const add = (kind, rel) => {
    const beforeAbs = path.join(resourcesRoot, rel);
    const afterAbs = kind === 'removed' ? null : path.join(htmlRoot, rel);
    if (kind === 'removed' && !fs.existsSync(beforeAbs)) return;
    changes.push({
      kind,
      rel,
      spec: specLabel,
      beforePath: kind === 'added' ? null : path.relative(projectRoot, beforeAbs),
      afterPath: afterAbs ? path.relative(projectRoot, afterAbs) : null,
    });
  };

  if (diff.macroChanged) {
    add('modified', renderLib.pagePathFor('macro'));
  }
  for (const slug of diff.modifiedFeatures || []) {
    add('modified', renderLib.pagePathFor('feature', { featureSlug: slug }));
  }
  for (const slug of diff.addedFeatures || []) {
    add('added', renderLib.pagePathFor('feature', { featureSlug: slug }));
  }
  for (const item of diff.modifiedSubmodules || []) {
    add('modified', renderLib.pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }
  for (const item of diff.addedSubmodules || []) {
    add('added', renderLib.pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }
  for (const slug of diff.removedFeatures || []) {
    add('removed', renderLib.pagePathFor('feature', { featureSlug: slug }));
  }
  for (const item of diff.removedSubmodules || []) {
    add('removed', renderLib.pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }

  return changes;
}

function collectHtmlManifestChanges({ projectRoot, diffDir, specLabel }) {
  const resourcesRoot = path.join(projectRoot, ATLAS_REL);
  const changes = [];
  for (const after of walkAfterStateHtml(diffDir)) {
    const beforeAbs = path.join(resourcesRoot, after.rel);
    const beforeExists = fs.existsSync(beforeAbs);
    changes.push({
      kind: beforeExists ? 'modified' : 'added',
      rel: after.rel,
      spec: specLabel,
      beforePath: beforeExists ? path.relative(projectRoot, beforeAbs) : null,
      afterPath: path.relative(projectRoot, after.abs),
    });
  }
  for (const removedRel of readRemovedManifest(diffDir)) {
    const beforeAbs = path.join(resourcesRoot, removedRel);
    if (!fs.existsSync(beforeAbs)) continue;
    changes.push({
      kind: 'removed',
      rel: removedRel,
      spec: specLabel,
      beforePath: path.relative(projectRoot, beforeAbs),
      afterPath: null,
    });
  }
  return changes;
}

function walkArchitectureDiffDirs(plansRoot) {
  const result = [];
  if (!fs.existsSync(plansRoot)) return result;
  function recurse(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === DIFF_DIRNAME) { result.push(full); continue; }
      recurse(full);
    }
  }
  recurse(plansRoot);
  return result;
}

function walkAfterStateHtml(diffDir) {
  const out = [];
  function recurse(dir, relParts) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const entry of entries) {
      if (entry.name === 'assets') continue;
      if (entry.name === ATLAS_DIRNAME) continue;
      if (entry.name === stateLib.REMOVED_TXT) continue;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const nextRel = [...relParts, entry.name];
      if (entry.isDirectory()) recurse(full, nextRel);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        out.push({ abs: full, rel: nextRel.join('/') });
      }
    }
  }
  recurse(diffDir, []);
  return out;
}

function readRemovedManifest(diffDir) {
  const file = path.join(diffDir, stateLib.REMOVED_TXT);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// ---- merge verb ---------------------------------------------------------

function collectSpecsToMerge(flags, projectRoot) {
  if (flags.spec !== undefined) {
    return Array.isArray(flags.spec) ? flags.spec.map(String) : [String(flags.spec)];
  }

  if (flags.all) {
    const plansRoot = path.join(projectRoot, PLANS_REL);
    const seen = new Set();
    const specs = [];

    for (const diffDir of walkArchitectureDiffDirs(plansRoot)) {
      const specDir = path.dirname(diffDir);
      const { rootDir } = specOverlayDir(projectRoot, path.relative(projectRoot, specDir));
      const key = path.relative(projectRoot, rootDir);
      if (!seen.has(key)) {
        seen.add(key);
        specs.push(key);
      }
    }

    return specs.sort();
  }

  return [];
}

async function verbMerge(flags, projectRoot, io) {
  const specs = collectSpecsToMerge(flags, projectRoot);
  if (specs.length === 0) {
    io.stderr.write('No spec overlays to merge. Use --spec <dir> or --all to select specs.\n');
    return 1;
  }

  const base = stateLib.load(baseAtlasDir(projectRoot));
  let merged = JSON.parse(JSON.stringify(base));
  const applied = [];

  for (const spec of specs) {
    const { overlayDir, rootDir } = specOverlayDir(projectRoot, spec);
    if (!hasOverlayState(overlayDir)) {
      io.stdout.write(`Skipping ${spec} (no overlay state found in ${path.relative(projectRoot, overlayDir)})\n`);
      continue;
    }
    const overlay = stateLib.loadOverlay(overlayDir);
    merged = stateLib.mergeOverlay(merged, overlay);
    applied.push({ spec, rootDir, overlayDir });
  }

  if (applied.length === 0) {
    io.stdout.write('No valid spec overlays to merge.\n');
    return 0;
  }

  const diff = stateLib.diffPages(base, merged);

  // Save undo snapshot before mutating base
  ensureBaseAtlasDir(projectRoot);
  stateLib.writeUndoSnapshot(baseAtlasDir(projectRoot), JSON.parse(JSON.stringify({ base })));

  // Write merged state to base
  stateLib.save(baseAtlasDir(projectRoot), merged);
  stateLib.appendHistory(baseAtlasDir(projectRoot), {
    action: 'merge',
    args: { specs: applied.map((a) => a.spec) },
    mode: 'base',
  });

  // Render unless --no-render
  if (!flags['no-render']) {
    await runRender({ projectRoot, flags: { ...flags, spec: undefined } });
  }

  // Clean overlays if --clean
  if (flags.clean) {
    for (const { rootDir } of applied) {
      const diffDir = path.join(rootDir, DIFF_DIRNAME);
      if (fs.existsSync(diffDir)) {
        fs.rmSync(diffDir, { recursive: true, force: true });
        io.stdout.write(`Removed ${path.relative(projectRoot, diffDir)}\n`);
      }
    }
  }

  // Summary
  const featParts = [];
  if (diff.addedFeatures.size > 0) featParts.push(`${diff.addedFeatures.size} added`);
  if (diff.modifiedFeatures.size > 0) featParts.push(`${diff.modifiedFeatures.size} modified`);
  if (diff.removedFeatures.size > 0) featParts.push(`${diff.removedFeatures.size} removed`);
  const featSummary = featParts.length > 0 ? featParts.join(', ') : 'no changes';

  const subParts = [];
  if (diff.addedSubmodules.length > 0) subParts.push(`${diff.addedSubmodules.length} added`);
  if (diff.modifiedSubmodules.length > 0) subParts.push(`${diff.modifiedSubmodules.length} modified`);
  if (diff.removedSubmodules.length > 0) subParts.push(`${diff.removedSubmodules.length} removed`);
  const subSummary = subParts.length > 0 ? subParts.join(', ') : 'no changes';

  io.stdout.write(`atlas: merge applied — ${applied.length} spec overlay(s) merged\n`);
  io.stdout.write(`  Features: ${featSummary}\n`);
  io.stdout.write(`  Submodules: ${subSummary}\n`);
  if (diff.macroChanged) io.stdout.write('  Macro page changed\n');

  return 0;
}

async function dispatch(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const args = [...argv];
  let verb = 'open';
  let explicitVerb = false;
  const verbIdx = findFirstPositional(args);
  if (verbIdx >= 0) {
    verb = args[verbIdx];
    explicitVerb = true;
    args.splice(verbIdx, 1);
  }
  let subverb = null;
  if (MULTI_VERBS.has(verb)) {
    const subverbIdx = findFirstPositional(args);
    if (subverbIdx >= 0) {
      subverb = args[subverbIdx];
      args.splice(subverbIdx, 1);
    }
  }
  const rawArgs = [...args];
  const { flags, positional: rest } = parseFlags(args);

  if (verb === 'apply' || verb === 'template') {
    io.stderr.write(`Error: "${verb}" has been removed. Use "apltk architecture add <feature|module|relation>" instead.\n`);
    return 1;
  }

  if (verb === 'help' || verb === '--help' || verb === '-h' || flags.help) {
    const helpText = explicitVerb && verb !== 'help' && verb !== '--help' && verb !== '-h'
      ? buildArchitectureHelpPage(verb, subverb)
      : buildArchitectureHelpPage();
    io.stdout.write(`${helpText || cliHelp.USAGE}\n`);
    return 0;
  }

  let projectRoot;
  try {
    projectRoot = resolveProjectRoot(flags);
  } catch (e) {
    io.stderr.write(`${e.message}\n\n${buildArchitectureHelpPage()}\n`);
    return 1;
  }

  try {
    switch (verb) {
      case 'open': return await verbOpen(flags, projectRoot, io);
      case 'diff': return await verbDiff(flags, projectRoot, io);
      case 'render':
        await runRender({ projectRoot, flags });
        io.stdout.write(`atlas: rendered\n`);
        return 0;
      case 'validate': return await verbValidate(flags, projectRoot, io);
      case 'status': return await verbStatus(flags, projectRoot, io);
      case 'scan': return await verbScan(flags, projectRoot, io);
      case 'undo': return await verbUndo(flags, projectRoot, io);
      case 'feature': await verbFeature(subverb, flags, projectRoot, io); break;
      case 'submodule': await verbSubmodule(subverb, flags, projectRoot, io); break;
      case 'function': await verbFunction(subverb, flags, projectRoot, io); break;
      case 'variable': await verbVariable(subverb, flags, projectRoot, io); break;
      case 'dataflow': await verbDataflow(subverb, flags, projectRoot, io); break;
      case 'error': await verbError(subverb, flags, projectRoot, io); break;
      case 'edge': await verbEdge(subverb, flags, projectRoot, io); break;
      case 'meta': await verbMeta(subverb, flags, projectRoot, io); break;
      case 'actor': await verbActor(subverb, flags, projectRoot, io); break;
      case 'merge': return await verbMerge(flags, projectRoot, io);
      case 'add':
        if (rest.length > 2) {
          return await verbAdd(rawArgs, flags, projectRoot, io);
        }
        return await verbAdd(rest, flags, projectRoot, io);
      case 'remove': return await verbRemove(rest, flags, projectRoot, io);
      default:
        io.stderr.write(`Unknown verb: ${verb}\n\n${buildArchitectureHelpPage()}\n`);
        return 1;
    }
    // Generic success for verbs without their own return — add/remove return above
    if (verb !== 'add' && verb !== 'remove' && !flags['dry-run']) {
      io.stdout.write(`atlas: ${verb}${subverb ? ` ${subverb}` : ''} applied\n`);
    }
    return 0;
  } catch (e) {
    io.stderr.write(`${e.message}\n`);
    return 1;
  }
}

module.exports = {
  dispatch,
  parseFlags,
  MULTI_VERBS,
  findProjectRoot,
  resolveProjectRoot,
  loadResolvedState,
  baseAtlasDir,
  baseHtmlOutDir,
  specOverlayDir,
  runRender,
  walkArchitectureDiffDirs,
  collectDiffChanges,
  walkAfterStateHtml,
  readRemovedManifest,
  renderDiffViewer,
  hasOverlayState,
  collectSpecsToMerge,
  verbMerge,
};
