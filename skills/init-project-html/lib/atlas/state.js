'use strict';

// state.js — YAML persistence for the declarative atlas.
//
// On-disk layout (base mode):
//   <project>/resources/project-architecture/atlas/
//     ├── atlas.index.yaml          # meta, actors, ordered feature slug list, cross-feature edges
//     ├── features/<slug>.yaml      # one file per feature (submodules + intra-feature edges)
//     ├── atlas.history.log         # append-only audit JSONL
//     └── atlas.history.undo.json   # single-step undo snapshot
//
// Overlay layout (spec mode mirrors base, plus _removed.yaml):
//   <spec_dir>/architecture_diff/atlas/
//     ├── atlas.index.yaml          # optional partial override of meta/actors/edges/feature ordering
//     ├── features/<slug>.yaml      # full proposed state of any changed feature
//     └── _removed.yaml             # {features: [...], submodules: [{feature, submodule}]}

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { emptyState } = require('./schema');

const INDEX_FILE = 'atlas.index.yaml';
const REMOVED_FILE = '_removed.yaml';
const REMOVED_TXT = '_removed.txt';
const FEATURES_DIR = 'features';
const HISTORY_FILE = 'atlas.history.log';
const UNDO_FILE = 'atlas.history.undo.json';
const UNDO_STACK_FILE = 'atlas.history.undo.stack.json';
const ATLAS_DIRNAME = 'atlas';

function readYaml(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  if (text.trim().length === 0) return null;
  return yaml.load(text);
}

function writeYaml(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = yaml.dump(data, { sortKeys: false, lineWidth: 100, noRefs: true });
  fs.writeFileSync(file, text, 'utf8');
}

// load(atlasDir) reads the full base state. Missing directories are
// treated as empty (returns emptyState()). Each referenced feature
// file is loaded eagerly; missing feature files are surfaced as empty
// stubs so validation can flag them.
function load(atlasDir) {
  const state = emptyState();
  const indexFile = path.join(atlasDir, INDEX_FILE);
  let index;
  try {
    index = readYaml(indexFile);
  } catch (e) {
    const empty = emptyState();
    empty._loadError = `Corrupted atlas index: ${e.message}`;
    return empty;
  }
  if (!index) return state;

  if (index.meta) state.meta = { ...state.meta, ...index.meta };
  if (Array.isArray(index.actors)) state.actors = index.actors;
  if (Array.isArray(index.edges)) state.edges = index.edges;

  const featureList = Array.isArray(index.features) ? index.features : [];
  state.features = featureList
    .map((entry) => {
      const slug = typeof entry === 'string' ? entry : entry && entry.slug;
      if (!slug) return null;
      try {
        const featureFile = path.join(atlasDir, FEATURES_DIR, `${slug}.yaml`);
        const feature = readYaml(featureFile);
        if (!feature) {
          return { slug, title: slug, story: '', dependsOn: [], submodules: [], edges: [] };
        }
        return normalizeFeature({ ...feature, slug: feature.slug || slug });
      } catch (e) {
        console.error(`state: skipping corrupted feature ${slug}: ${e.message}`);
        return { slug, title: slug, story: '', dependsOn: [], submodules: [], edges: [] };
      }
    })
    .filter(Boolean);

  return state;
}

function normalizeFeature(feature) {
  return {
    slug: feature.slug,
    title: feature.title || feature.slug,
    story: feature.story || '',
    dependsOn: Array.isArray(feature.dependsOn) ? feature.dependsOn : [],
    submodules: Array.isArray(feature.submodules) ? feature.submodules.map(normalizeSubmodule) : [],
    edges: Array.isArray(feature.edges) ? feature.edges : [],
    ...(feature.evidence ? { evidence: feature.evidence } : {}),
  };
}

function normalizeSubmodule(sub) {
  return {
    slug: sub.slug,
    kind: sub.kind || 'service',
    role: sub.role || '',
    functions: Array.isArray(sub.functions) ? sub.functions : [],
    variables: Array.isArray(sub.variables) ? sub.variables : [],
    dataflow: Array.isArray(sub.dataflow) ? sub.dataflow : [],
    errors: Array.isArray(sub.errors) ? sub.errors : [],
    ...(sub.evidence ? { evidence: sub.evidence } : {}),
  };
}

// save(atlasDir, state, {touch=true}) writes the index + every feature
// YAML, dropping orphan feature files. When touch is true, meta.updatedAt
// is refreshed.
function save(atlasDir, state, options = {}) {
  const { touch = true } = options;
  state.meta = state.meta || {};
  if (touch) state.meta.updatedAt = new Date().toISOString();

  const indexFile = path.join(atlasDir, INDEX_FILE);
  const index = {
    meta: state.meta,
    actors: state.actors || [],
    features: (state.features || []).map((f) => f.slug),
    edges: state.edges || [],
  };
  writeYaml(indexFile, index);

  const featuresDir = path.join(atlasDir, FEATURES_DIR);
  fs.mkdirSync(featuresDir, { recursive: true });
  const wanted = new Set((state.features || []).map((f) => `${f.slug}.yaml`));
  for (const entry of fs.readdirSync(featuresDir)) {
    if (entry.endsWith('.yaml') && !wanted.has(entry)) {
      fs.rmSync(path.join(featuresDir, entry));
    }
  }
  for (const feature of state.features || []) {
    writeYaml(path.join(featuresDir, `${feature.slug}.yaml`), feature);
  }
}

// loadOverlay reads the spec-mode overlay. Every field is optional.
// Returns a structured overlay object even when the overlay directory
// is missing (all-empty overlay, which merges to base unchanged).
function loadOverlay(overlayDir) {
  const overlay = {
    meta: null,
    actors: null,
    edges: null,
    featureOrder: null,
    features: {},
    removed: { features: [], submodules: [] },
  };
  if (!fs.existsSync(overlayDir)) return overlay;

  const index = readYaml(path.join(overlayDir, INDEX_FILE));
  if (index) {
    if (index.meta !== undefined) overlay.meta = index.meta;
    if (index.actors !== undefined) overlay.actors = index.actors;
    if (index.edges !== undefined) overlay.edges = index.edges;
    if (Array.isArray(index.features) && index.features.length > 0) {
      overlay.featureOrder = index.features.map((entry) => (typeof entry === 'string' ? entry : entry && entry.slug)).filter(Boolean);
    }
  }

  const featuresDir = path.join(overlayDir, FEATURES_DIR);
  if (fs.existsSync(featuresDir)) {
    for (const entry of fs.readdirSync(featuresDir)) {
      if (!entry.endsWith('.yaml')) continue;
      const data = readYaml(path.join(featuresDir, entry));
      if (data && data.slug) overlay.features[data.slug] = normalizeFeature(data);
    }
  }

  const removed = readYaml(path.join(overlayDir, REMOVED_FILE));
  if (removed) {
    if (Array.isArray(removed.features)) overlay.removed.features = removed.features;
    if (Array.isArray(removed.submodules)) overlay.removed.submodules = removed.submodules;
  }

  return overlay;
}

// saveOverlay writes only the components the caller provided. Unlike
// save(), this does not touch base files. Untouched features keep their
// base definition; explicitly written features land in
// overlayDir/features/<slug>.yaml; removed features/submodules land in
// _removed.yaml.
function saveOverlay(overlayDir, overlay) {
  fs.mkdirSync(overlayDir, { recursive: true });

  const indexPayload = {};
  if (overlay.meta !== null && overlay.meta !== undefined) indexPayload.meta = overlay.meta;
  if (overlay.actors !== null && overlay.actors !== undefined) indexPayload.actors = overlay.actors;
  if (overlay.edges !== null && overlay.edges !== undefined) indexPayload.edges = overlay.edges;
  if (overlay.featureOrder) indexPayload.features = overlay.featureOrder;
  if (Object.keys(indexPayload).length > 0) {
    writeYaml(path.join(overlayDir, INDEX_FILE), indexPayload);
  } else if (fs.existsSync(path.join(overlayDir, INDEX_FILE))) {
    fs.rmSync(path.join(overlayDir, INDEX_FILE));
  }

  const featuresDir = path.join(overlayDir, FEATURES_DIR);
  fs.mkdirSync(featuresDir, { recursive: true });
  const wanted = new Set(Object.keys(overlay.features || {}).map((slug) => `${slug}.yaml`));
  for (const entry of fs.readdirSync(featuresDir)) {
    if (entry.endsWith('.yaml') && !wanted.has(entry)) {
      fs.rmSync(path.join(featuresDir, entry));
    }
  }
  for (const [slug, feature] of Object.entries(overlay.features || {})) {
    writeYaml(path.join(featuresDir, `${slug}.yaml`), feature);
  }

  const removedFile = path.join(overlayDir, REMOVED_FILE);
  const hasRemoved = (overlay.removed.features && overlay.removed.features.length > 0)
    || (overlay.removed.submodules && overlay.removed.submodules.length > 0);
  if (hasRemoved) {
    writeYaml(removedFile, overlay.removed);
  } else if (fs.existsSync(removedFile)) {
    fs.rmSync(removedFile);
  }
}

// mergeOverlay produces the after-state given a base state and an
// overlay. Overlay features fully replace base features of the same
// slug; removed features/submodules drop from the merged result.
// When overlay.featureOrder is provided it controls the order of
// features in the merged output (unlisted features keep base ordering
// at the tail).
function mergeOverlay(base, overlay) {
  const merged = JSON.parse(JSON.stringify(base));
  if (overlay.meta) merged.meta = { ...merged.meta, ...overlay.meta };
  if (overlay.actors !== null && overlay.actors !== undefined) merged.actors = overlay.actors || [];
  if (overlay.edges !== null && overlay.edges !== undefined) merged.edges = overlay.edges || [];

  const featureMap = new Map((merged.features || []).map((f) => [f.slug, f]));
  for (const [slug, feature] of Object.entries(overlay.features || {})) {
    featureMap.set(slug, feature);
  }

  if (overlay.removed && Array.isArray(overlay.removed.features)) {
    for (const slug of overlay.removed.features) featureMap.delete(slug);
  }
  if (overlay.removed && Array.isArray(overlay.removed.submodules)) {
    for (const { feature: fslug, submodule: sslug } of overlay.removed.submodules) {
      const f = featureMap.get(fslug);
      if (f) f.submodules = (f.submodules || []).filter((s) => s.slug !== sslug);
    }
  }

  let orderedSlugs;
  if (overlay.featureOrder) {
    const seen = new Set();
    orderedSlugs = [];
    for (const slug of overlay.featureOrder) {
      if (featureMap.has(slug) && !seen.has(slug)) {
        orderedSlugs.push(slug);
        seen.add(slug);
      }
    }
    for (const slug of featureMap.keys()) {
      if (!seen.has(slug)) orderedSlugs.push(slug);
    }
  } else {
    orderedSlugs = [...featureMap.keys()];
  }
  merged.features = orderedSlugs.map((slug) => featureMap.get(slug));

  return merged;
}

function deriveOverlay(base, merged) {
  const overlay = {
    meta: null,
    actors: null,
    edges: null,
    featureOrder: null,
    features: {},
    removed: { features: [], submodules: [] },
  };

  if (JSON.stringify(merged.meta || {}) !== JSON.stringify(base.meta || {})) {
    overlay.meta = merged.meta || {};
  }
  if (JSON.stringify(merged.actors || []) !== JSON.stringify(base.actors || [])) {
    overlay.actors = merged.actors || [];
  }
  if (JSON.stringify(merged.edges || []) !== JSON.stringify(base.edges || [])) {
    overlay.edges = merged.edges || [];
  }

  const baseOrder = (base.features || []).map((feature) => feature.slug);
  const mergedOrder = (merged.features || []).map((feature) => feature.slug);
  if (JSON.stringify(mergedOrder) !== JSON.stringify(baseOrder)) {
    overlay.featureOrder = mergedOrder;
  }

  const baseFeatures = new Map((base.features || []).map((feature) => [feature.slug, feature]));
  const mergedFeatures = new Map((merged.features || []).map((feature) => [feature.slug, feature]));

  for (const [slug, feature] of mergedFeatures) {
    const baseFeature = baseFeatures.get(slug);
    if (!baseFeature || JSON.stringify(feature) !== JSON.stringify(baseFeature)) {
      overlay.features[slug] = feature;
    }
  }

  for (const slug of baseFeatures.keys()) {
    if (!mergedFeatures.has(slug)) {
      overlay.removed.features.push(slug);
    } else {
      // Check for removed submodules within features that exist in both states
      const baseFeat = baseFeatures.get(slug);
      const mergedFeat = mergedFeatures.get(slug);
      if (baseFeat && mergedFeat) {
        const baseSubs = new Set((baseFeat.submodules || []).map(s => s.slug));
        const mergedSubs = new Set((mergedFeat.submodules || []).map(s => s.slug));
        for (const subSlug of baseSubs) {
          if (!mergedSubs.has(subSlug)) {
            overlay.removed.submodules.push({ feature: slug, submodule: subSlug });
          }
        }
      }
    }
  }

  return overlay;
}

// diffPages compares the merged after-state against the base and
// classifies which HTML pages must be regenerated (modified) versus
// emitted fresh (added) versus listed in _removed.txt (removed).
function diffPages(base, merged) {
  const baseFeatures = new Map((base.features || []).map((f) => [f.slug, f]));
  const mergedFeatures = new Map((merged.features || []).map((f) => [f.slug, f]));

  const addedFeatures = new Set();
  const modifiedFeatures = new Set();
  const removedFeatures = new Set();
  const addedSubmodules = []; // {feature, submodule}
  const modifiedSubmodules = [];
  const removedSubmodules = [];

  for (const [slug, mergedFeat] of mergedFeatures) {
    const baseFeat = baseFeatures.get(slug);
    if (!baseFeat) {
      addedFeatures.add(slug);
      for (const sub of mergedFeat.submodules || []) {
        addedSubmodules.push({ feature: slug, submodule: sub.slug });
      }
      continue;
    }
    if (JSON.stringify(featureVisualOf(baseFeat)) !== JSON.stringify(featureVisualOf(mergedFeat))) {
      modifiedFeatures.add(slug);
    }
    const baseSubMap = new Map((baseFeat.submodules || []).map((s) => [s.slug, s]));
    const mergedSubMap = new Map((mergedFeat.submodules || []).map((s) => [s.slug, s]));
    for (const [subSlug, mergedSub] of mergedSubMap) {
      const baseSub = baseSubMap.get(subSlug);
      if (!baseSub) addedSubmodules.push({ feature: slug, submodule: subSlug });
      else if (JSON.stringify(baseSub) !== JSON.stringify(mergedSub)) {
        modifiedSubmodules.push({ feature: slug, submodule: subSlug });
      }
    }
    for (const subSlug of baseSubMap.keys()) {
      if (!mergedSubMap.has(subSlug)) removedSubmodules.push({ feature: slug, submodule: subSlug });
    }
  }
  for (const slug of baseFeatures.keys()) {
    if (!mergedFeatures.has(slug)) {
      removedFeatures.add(slug);
      for (const sub of baseFeatures.get(slug).submodules || []) {
        removedSubmodules.push({ feature: slug, submodule: sub.slug });
      }
    }
  }

  const macroChanged = (
    JSON.stringify(macroVisualOf(base)) !== JSON.stringify(macroVisualOf(merged))
  );

  return {
    addedFeatures,
    modifiedFeatures,
    removedFeatures,
    addedSubmodules,
    modifiedSubmodules,
    removedSubmodules,
    macroChanged,
  };
}

// featureVisualOf returns the projection of a feature that drives its
// own page (title, story, dependsOn, submodule navigation cards, and
// intra-feature edge list). Sub-module internals are compared
// separately in diffPages.
// summarize returns a structured digest of the atlas state, suitable for
// both human-readable and JSON output. Every field in the return value is
// derived from the state object; no external I/O is performed.
function summarize(state) {
  const features = state.features || [];
  let submoduleCount = 0;

  const featureList = features.map((f) => {
    const subs = (f.submodules || []).length;
    submoduleCount += subs;
    return { slug: f.slug, title: f.title || f.slug, submoduleCount: subs };
  });

  const crossFeatureEdges = (state.edges || []).length;
  let intraFeatureEdges = 0;
  for (const f of features) {
    intraFeatureEdges += (f.edges || []).length;
  }

  return {
    meta: state.meta || {},
    counts: {
      features: features.length,
      submodules: submoduleCount,
      crossFeatureEdges,
      intraFeatureEdges,
      actors: (state.actors || []).length,
    },
    featureList,
  };
}

// computeDiff compares two atlas states and returns a JSON-serializable
// summary of feature-level changes (features added, modified, or removed).
function computeDiff(before, after) {
  const beforeFeatures = new Map((before.features || []).map((f) => [f.slug, f]));
  const afterFeatures = new Map((after.features || []).map((f) => [f.slug, f]));

  const addedFeatures = [];
  const modifiedFeatures = [];
  const removedFeatures = [];

  for (const [slug, feature] of afterFeatures) {
    if (!beforeFeatures.has(slug)) {
      addedFeatures.push(slug);
    } else if (JSON.stringify(feature) !== JSON.stringify(beforeFeatures.get(slug))) {
      modifiedFeatures.push(slug);
    }
  }

  for (const slug of beforeFeatures.keys()) {
    if (!afterFeatures.has(slug)) {
      removedFeatures.push(slug);
    }
  }

  // Detect non-feature changes (meta, actors, cross-feature edges)
  const metaChanged = after.meta && before.meta
    ? JSON.stringify(after.meta) !== JSON.stringify(before.meta)
    : after.meta !== before.meta;

  const beforeActors = new Map((before.actors || []).map((a) => [a.id, a]));
  const afterActors = new Map((after.actors || []).map((a) => [a.id, a]));
  const addedActors = [];
  const removedActors = [];
  for (const id of afterActors.keys()) {
    if (!beforeActors.has(id)) addedActors.push(id);
  }
  for (const id of beforeActors.keys()) {
    if (!afterActors.has(id)) removedActors.push(id);
  }

  const addedEdges = [];
  const removedEdges = [];
  const beforeEdges = JSON.stringify(before.edges || []);
  const afterEdges = JSON.stringify(after.edges || []);
  if (beforeEdges !== afterEdges) {
    const be = before.edges || [];
    const ae = after.edges || [];
    for (let i = 0; i < ae.length; i++) {
      if (!be.some((e) => JSON.stringify(e) === JSON.stringify(ae[i]))) {
        addedEdges.push(ae[i]);
      }
    }
    for (let i = 0; i < be.length; i++) {
      if (!ae.some((e) => JSON.stringify(e) === JSON.stringify(be[i]))) {
        removedEdges.push(be[i]);
      }
    }
  }

  return { addedFeatures, modifiedFeatures, removedFeatures, metaChanged, addedActors, removedActors, addedEdges, removedEdges };
}

function featureVisualOf(feature) {
  return {
    title: feature.title,
    story: feature.story,
    dependsOn: feature.dependsOn || [],
    submodules: (feature.submodules || []).map((s) => ({ slug: s.slug, kind: s.kind, role: s.role })),
    edges: feature.edges || [],
  };
}

// macroVisualOf returns the projection of state that drives the macro
// SVG (cluster titles, submodule nodes + their kind/role badges, every
// edge label/kind). Sub-module-internal fields (functions, variables,
// dataflow, errors) are excluded so editing those alone does not force
// a macro re-render.
function macroVisualOf(state) {
  return {
    meta: state.meta || {},
    actors: state.actors || [],
    edges: state.edges || [],
    features: (state.features || []).map((f) => ({
      slug: f.slug,
      title: f.title,
      dependsOn: f.dependsOn || [],
      submodules: (f.submodules || []).map((s) => ({ slug: s.slug, kind: s.kind, role: s.role })),
      edges: f.edges || [],
    })),
  };
}

function appendHistory(atlasDir, entry) {
  fs.mkdirSync(atlasDir, { recursive: true });
  const file = path.join(atlasDir, HISTORY_FILE);
  fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

function writeUndoSnapshot(atlasDir, state) {
  const stack = readUndoStack(atlasDir);
  stack.push(state);
  const MAX_STACK = 50;
  if (stack.length > MAX_STACK) {
    stack.splice(0, stack.length - MAX_STACK);
  }
  writeUndoStack(atlasDir, stack);
}

function _readUndoSnapshot(atlasDir) {
  const stack = readUndoStack(atlasDir);
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

function _clearUndoSnapshot(atlasDir) {
  writeUndoStack(atlasDir, []);
}

function consumeUndoSnapshot(atlasDir, steps = 1) {
  if (!Number.isInteger(steps) || steps < 1) return null;
  const stack = readUndoStack(atlasDir);
  if (stack.length < steps) return null;
  const snapshot = stack[stack.length - steps];
  writeUndoStack(atlasDir, stack.slice(0, stack.length - steps));
  return snapshot;
}

function readUndoStack(atlasDir) {
  const stackFile = path.join(atlasDir, UNDO_STACK_FILE);
  if (fs.existsSync(stackFile)) {
    return JSON.parse(fs.readFileSync(stackFile, 'utf8'));
  }
  const latestFile = path.join(atlasDir, UNDO_FILE);
  if (fs.existsSync(latestFile)) {
    return [JSON.parse(fs.readFileSync(latestFile, 'utf8'))];
  }
  return [];
}

function writeUndoStack(atlasDir, stack) {
  const stackFile = path.join(atlasDir, UNDO_STACK_FILE);
  const latestFile = path.join(atlasDir, UNDO_FILE);
  if (!stack || stack.length === 0) {
    if (fs.existsSync(stackFile)) fs.rmSync(stackFile);
    if (fs.existsSync(latestFile)) fs.rmSync(latestFile);
    return;
  }
  fs.mkdirSync(atlasDir, { recursive: true });
  fs.writeFileSync(stackFile, JSON.stringify(stack, null, 2), 'utf8');
  fs.writeFileSync(latestFile, JSON.stringify(stack[stack.length - 1], null, 2), 'utf8');
}

module.exports = {
  ATLAS_DIRNAME,
  INDEX_FILE,
  REMOVED_FILE,
  REMOVED_TXT,
  FEATURES_DIR,
  load,
  save,
  loadOverlay,
  saveOverlay,
  mergeOverlay,
  deriveOverlay,
  diffPages,
  summarize,
  computeDiff,
  appendHistory,
  writeUndoSnapshot,
  consumeUndoSnapshot,
};
