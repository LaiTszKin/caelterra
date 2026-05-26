'use strict';

// schema.js — single source of truth for atlas component shapes,
// enum vocabularies, and validation. The CLI, render layer, and tests
// all consult this file so DOM/CSS hooks stay aligned with the
// declarative state.

const SUBMODULE_KINDS = Object.freeze([
  'ui',
  'api',
  'service',
  'db',
  'pure-fn',
  'queue',
  'external',
]);

const KIND_LABEL = Object.freeze({
  ui: 'UI',
  api: 'API',
  service: 'Service',
  db: 'DB',
  'pure-fn': 'Pure fn',
  queue: 'Queue',
  external: 'External',
});

const SIDE_EFFECTS = Object.freeze([
  'pure',
  'io',
  'write',
  'tx',
  'lock',
  'network',
]);

const VARIABLE_SCOPES = Object.freeze([
  'call',
  'tx',
  'persist',
  'instance',
  'loop',
]);

const EDGE_KINDS = Object.freeze([
  'call',
  'return',
  'data-row',
  'failure',
]);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function isSlug(value) {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const EVIDENCE_LEVELS = Object.freeze(['observed', 'inferred', 'assumed']);

function parseEvidence(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error('--evidence requires a string value (observed, inferred, or assumed)');
  }
  const str = String(value);
  const colon = str.indexOf(':');
  let level, source;
  if (colon === -1) {
    level = 'inferred';
    source = str;
  } else {
    level = str.slice(0, colon);
    source = str.slice(colon + 1);
    if (!EVIDENCE_LEVELS.includes(level)) {
      throw new Error(`Invalid evidence level: "${level}". Must be one of: ${EVIDENCE_LEVELS.join(', ')}`);
    }
  }
  return { level, source };
}

function noFix(message) {
  return { message: message + ' (no automatic fix)', fixCommand: null };
}

function requireField(errors, where, name, value, predicate, hint) {
  if (!predicate(value)) {
    errors.push({
      message: `${where}: invalid or missing "${name}"${hint ? ` (${hint})` : ''} (no automatic fix)`,
      fixCommand: null,
    });
    return false;
  }
  return true;
}

function validateMeta(meta, errors) {
  if (!meta || typeof meta !== 'object') {
    errors.push(noFix('meta: missing object'));
    return;
  }
  if (meta.title !== undefined) requireField(errors, 'meta', 'title', meta.title, isNonEmptyString);
  if (meta.summary !== undefined && typeof meta.summary !== 'string') {
    errors.push(noFix('meta: "summary" must be a string when present'));
  }
}

function validateActor(actor, errors, idx) {
  const where = `actors[${idx}]`;
  requireField(errors, where, 'id', actor && actor.id, isSlug, 'kebab-case slug');
  requireField(errors, where, 'label', actor && actor.label, isNonEmptyString);
}

function validateFunction(fn, errors, where, featureSlug, subSlug, formatFix) {
  requireField(errors, where, 'name', fn && fn.name, isNonEmptyString);
  if (fn && fn.in !== undefined && typeof fn.in !== 'string') errors.push(noFix(`${where}: "in" must be a string`));
  if (fn && fn.out !== undefined && typeof fn.out !== 'string') errors.push(noFix(`${where}: "out" must be a string`));
  if (fn && fn.side !== undefined && !SIDE_EFFECTS.includes(fn.side)) {
    errors.push({
      message: `${where}: "side" must be one of ${SIDE_EFFECTS.join('|')}`,
      fixCommand: formatFix && formatFix({ type: 'function', action: 'set', feature: featureSlug, submodule: subSlug, name: fn.name, side: SIDE_EFFECTS[0] }),
    });
  }
  if (fn && fn.purpose !== undefined && typeof fn.purpose !== 'string') {
    errors.push(noFix(`${where}: "purpose" must be a string`));
  }
}

function validateVariable(v, errors, where, featureSlug, subSlug, formatFix) {
  requireField(errors, where, 'name', v && v.name, isNonEmptyString);
  if (v && v.type !== undefined && typeof v.type !== 'string') errors.push(noFix(`${where}: "type" must be a string`));
  if (v && v.scope !== undefined && !VARIABLE_SCOPES.includes(v.scope)) {
    errors.push({
      message: `${where}: "scope" must be one of ${VARIABLE_SCOPES.join('|')}`,
      fixCommand: formatFix && formatFix({ type: 'variable', action: 'set', feature: featureSlug, submodule: subSlug, name: v.name, scope: VARIABLE_SCOPES[0] }),
    });
  }
  if (v && v.purpose !== undefined && typeof v.purpose !== 'string') {
    errors.push(noFix(`${where}: "purpose" must be a string`));
  }
}

function validateError(err, errors, where) {
  requireField(errors, where, 'name', err && err.name, isNonEmptyString);
  if (err && err.when !== undefined && typeof err.when !== 'string') errors.push(noFix(`${where}: "when" must be a string`));
  if (err && err.means !== undefined && typeof err.means !== 'string') errors.push(noFix(`${where}: "means" must be a string`));
}

function validateSubmodule(sub, errors, where, featureSlug, formatFix) {
  requireField(errors, where, 'slug', sub && sub.slug, isSlug, 'kebab-case slug');
  if (sub && sub.kind !== undefined && !SUBMODULE_KINDS.includes(sub.kind)) {
    errors.push({
      message: `${where}: "kind" must be one of ${SUBMODULE_KINDS.join('|')}`,
      fixCommand: formatFix({ type: 'submodule', action: 'set', feature: featureSlug, slug: sub.slug, kind: SUBMODULE_KINDS[0] }),
    });
  }
  if (sub && sub.role !== undefined && typeof sub.role !== 'string') {
    errors.push(noFix(`${where}: "role" must be a string`));
  }

  if (sub && sub.functions) {
    if (!Array.isArray(sub.functions)) {
      errors.push(noFix(`${where}: "functions" must be an array`));
    } else {
      sub.functions.forEach((fn, i) => validateFunction(fn, errors, `${where}.functions[${i}]`, featureSlug, sub.slug, formatFix));
    }
  }
  if (sub && sub.variables) {
    if (!Array.isArray(sub.variables)) {
      errors.push(noFix(`${where}: "variables" must be an array`));
    } else {
      sub.variables.forEach((v, i) => validateVariable(v, errors, `${where}.variables[${i}]`, featureSlug, sub.slug, formatFix));
    }
  }
  if (sub && sub.dataflow) {
    if (!Array.isArray(sub.dataflow)) {
      errors.push(noFix(`${where}: "dataflow" must be an array`));
    } else {
      const fnNames = new Set((sub.functions || []).map((f) => f && f.name).filter(Boolean));
      const varNames = new Set((sub.variables || []).map((v) => v && v.name).filter(Boolean));
      sub.dataflow.forEach((step, i) => {
        const stepWhere = `${where}.dataflow[${i}]`;
        if (typeof step === 'string') {
          if (!step.trim()) errors.push(noFix(`${stepWhere}: step text must be non-empty`));
          return;
        }
        if (!step || typeof step !== 'object') {
          errors.push(noFix(`${stepWhere}: must be a string or an object with "step"`));
          return;
        }
        if (!isNonEmptyString(step.step)) {
          errors.push(noFix(`${stepWhere}: "step" must be a non-empty string`));
        }
        if (step.fn !== undefined) {
          if (typeof step.fn !== 'string' || !step.fn.trim()) {
            errors.push(noFix(`${stepWhere}: "fn" must be a non-empty string when present`));
          } else if (!fnNames.has(step.fn)) {
            errors.push({ message: `${stepWhere}: "fn" references unknown function "${step.fn}" — declare it via \`function add\` first`, fixCommand: formatFix({ type: 'function', action: 'add', feature: featureSlug, submodule: sub.slug, name: step.fn }) });
          }
        }
        for (const field of ['reads', 'writes']) {
          if (step[field] === undefined) continue;
          if (!Array.isArray(step[field])) {
            errors.push(noFix(`${stepWhere}: "${field}" must be an array of variable names`));
            continue;
          }
          step[field].forEach((name, j) => {
            const refWhere = `${stepWhere}.${field}[${j}]`;
            if (typeof name !== 'string' || !name.trim()) {
              errors.push(noFix(`${refWhere}: variable name must be a non-empty string`));
              return;
            }
            if (!varNames.has(name)) {
              errors.push({ message: `${refWhere}: unknown variable "${name}" — declare it via \`variable add\` first`, fixCommand: formatFix({ type: 'variable', action: 'add', feature: featureSlug, submodule: sub.slug, name }) });
            }
          });
        }
      });
    }
  }
  if (sub && sub.errors) {
    if (!Array.isArray(sub.errors)) {
      errors.push(noFix(`${where}: "errors" must be an array`));
    } else {
      sub.errors.forEach((err, i) => validateError(err, errors, `${where}.errors[${i}]`));
    }
  }
}

function validateEdgeEndpoint(endpoint, errors, where, allowSelf = false) {
  if (typeof endpoint === 'string') {
    if (allowSelf) {
      if (!isSlug(endpoint)) errors.push(noFix(`${where}: endpoint slug must be kebab-case`));
      return;
    }
    errors.push(noFix(`${where}: cross-feature endpoint must be an object {feature, submodule}`));
    return;
  }
  if (!endpoint || typeof endpoint !== 'object') {
    errors.push(noFix(`${where}: endpoint missing`));
    return;
  }
  if (!isSlug(endpoint.feature)) errors.push(noFix(`${where}: endpoint.feature must be a kebab-case slug`));
  if (endpoint.submodule !== undefined && endpoint.submodule !== null && !isSlug(endpoint.submodule)) {
    errors.push(noFix(`${where}: endpoint.submodule must be a kebab-case slug when present`));
  }
}

function validateEdge(edge, errors, where, { allowSelf = false, featureSlug, formatFix } = {}) {
  if (edge && edge.id !== undefined && !isSlug(edge.id)) {
    errors.push(noFix(`${where}: "id" must be a kebab-case slug`));
  }
  if (edge && edge.kind !== undefined && !EDGE_KINDS.includes(edge.kind)) {
    errors.push({
      message: `${where}: "kind" must be one of ${EDGE_KINDS.join('|')}`,
      fixCommand: (typeof formatFix === 'function' ? formatFix : () => null)({ type: 'edge', action: 'set', kind: EDGE_KINDS[0] }),
    });
  }
  validateEdgeEndpoint(edge && edge.from, errors, `${where}.from`, allowSelf);
  validateEdgeEndpoint(edge && edge.to, errors, `${where}.to`, allowSelf);
  if (edge && edge.label !== undefined && typeof edge.label !== 'string') {
    errors.push(noFix(`${where}: "label" must be a string`));
  }
}

function validateFeature(feature, errors, where, formatFix) {
  requireField(errors, where, 'slug', feature && feature.slug, isSlug, 'kebab-case slug');
  if (feature && feature.title !== undefined) requireField(errors, where, 'title', feature.title, isNonEmptyString);
  if (feature && feature.story !== undefined && typeof feature.story !== 'string') {
    errors.push(noFix(`${where}: "story" must be a string`));
  }
  if (feature && feature.dependsOn) {
    if (!Array.isArray(feature.dependsOn)) errors.push(noFix(`${where}: "dependsOn" must be a list of feature slugs`));
    else feature.dependsOn.forEach((slug, i) => {
      if (!isSlug(slug)) errors.push(noFix(`${where}.dependsOn[${i}]: must be kebab-case slug`));
    });
  }
  if (feature && feature.submodules) {
    if (!Array.isArray(feature.submodules)) errors.push(noFix(`${where}: "submodules" must be an array`));
    else {
      const slugs = new Set();
      feature.submodules.forEach((sub, i) => {
        validateSubmodule(sub, errors, `${where}.submodules[${i}]`, feature.slug, formatFix);
        if (sub && isSlug(sub.slug)) {
          if (slugs.has(sub.slug)) errors.push(noFix(`${where}: duplicate submodule slug "${sub.slug}"`));
          slugs.add(sub.slug);
        }
      });
    }
  }
  if (feature && feature.edges) {
    if (!Array.isArray(feature.edges)) errors.push(noFix(`${where}: "edges" must be an array`));
    else feature.edges.forEach((edge, i) => validateEdge(edge, errors, `${where}.edges[${i}]`, { allowSelf: true, featureSlug: feature.slug, formatFix }));
  }
}

// validate(state, formatFix) checks structural shape, enum membership, and
// referential integrity (every edge endpoint resolves to a known
// feature/submodule). Returns { valid, errors } where each error
// has a `message` string and an optional `fixCommand`.
//
// The optional `formatFix` callback receives ({ type, action, ...params })
// and returns a CLI command string, or null to suppress the fix. When
// absent (or null), all fixCommand fields in errors are null.
function validate(state, formatFix) {
  if (typeof formatFix !== 'function') formatFix = () => null;
  const errors = [];
  if (!state || typeof state !== 'object') {
    return { valid: false, errors: [noFix('state: must be an object')] };
  }

  validateMeta(state.meta, errors);

  if (state.actors) {
    if (!Array.isArray(state.actors)) errors.push(noFix('actors: must be an array'));
    else state.actors.forEach((actor, i) => validateActor(actor, errors, i));
  }

  if (!Array.isArray(state.features)) {
    errors.push(noFix('features: must be an array'));
  } else {
    const featureSlugs = new Set();
    state.features.forEach((feature, i) => {
      validateFeature(feature, errors, `features[${i}]`, formatFix);
      if (feature && isSlug(feature.slug)) {
        if (featureSlugs.has(feature.slug)) errors.push(noFix(`features: duplicate feature slug "${feature.slug}"`));
        featureSlugs.add(feature.slug);
      }
    });

    // referential integrity for intra-feature edges
    for (const feature of state.features) {
      if (!feature || !Array.isArray(feature.edges)) continue;
      const subSlugs = new Set((feature.submodules || []).map((s) => s && s.slug).filter(Boolean));
      feature.edges.forEach((edge, i) => {
        const where = `features[${feature.slug}].edges[${i}]`;
        for (const [side, ep] of [['from', edge && edge.from], ['to', edge && edge.to]]) {
          if (typeof ep === 'string') {
            if (!subSlugs.has(ep)) errors.push({ message: `${where}.${side}: unknown submodule "${ep}" in feature "${feature.slug}"`, fixCommand: formatFix({ type: 'submodule', action: 'add', feature: feature.slug, slug: ep }) });
          } else if (ep && typeof ep === 'object' && ep.feature && ep.feature !== feature.slug) {
            errors.push(noFix(`${where}.${side}: intra-feature edge cannot point at another feature "${ep.feature}"`));
          } else if (ep && ep.submodule && !subSlugs.has(ep.submodule)) {
            errors.push({ message: `${where}.${side}: unknown submodule "${ep.submodule}"`, fixCommand: formatFix({ type: 'submodule', action: 'add', feature: feature.slug, slug: ep.submodule }) });
          }
        }
      });
    }
  }

  if (state.edges) {
    if (!Array.isArray(state.edges)) errors.push(noFix('edges: must be an array'));
    else state.edges.forEach((edge, i) => validateEdge(edge, errors, `edges[${i}]`, { formatFix }));
  }

  // referential integrity for cross-feature edges
  if (Array.isArray(state.edges) && Array.isArray(state.features)) {
    const featureMap = new Map();
    for (const feature of state.features) {
      if (!feature || !isSlug(feature.slug)) continue;
      featureMap.set(feature.slug, new Set((feature.submodules || []).map((s) => s && s.slug).filter(Boolean)));
    }
    state.edges.forEach((edge, i) => {
      const where = `edges[${i}]`;
      for (const [side, ep] of [['from', edge && edge.from], ['to', edge && edge.to]]) {
        if (!ep || typeof ep !== 'object') continue;
        if (!featureMap.has(ep.feature)) errors.push({ message: `${where}.${side}: unknown feature "${ep.feature}"`, fixCommand: formatFix({ type: 'feature', action: 'add', slug: ep.feature }) });
        else if (ep.submodule && !featureMap.get(ep.feature).has(ep.submodule)) {
          errors.push({ message: `${where}.${side}: unknown submodule "${ep.submodule}" in feature "${ep.feature}"`, fixCommand: formatFix({ type: 'submodule', action: 'add', feature: ep.feature, slug: ep.submodule }) });
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

// emptyState() returns a minimal valid in-memory state. Used by the
// CLI when no atlas exists yet.
function emptyState({ title = 'Project architecture' } = {}) {
  return {
    meta: {
      title,
      summary: '',
      updatedAt: null,
    },
    actors: [],
    features: [],
    edges: [],
  };
}

module.exports = {
  KIND_LABEL,
  EVIDENCE_LEVELS,
  parseEvidence,
  validate,
  emptyState,
};
