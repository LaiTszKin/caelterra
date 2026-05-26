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
  const str = String(value);
  const colon = str.indexOf(':');
  const level = colon === -1 ? str : str.slice(0, colon);
  const source = colon === -1 ? '' : str.slice(colon + 1);
  if (!EVIDENCE_LEVELS.includes(level)) {
    throw new Error(`Invalid evidence level: "${level}". Must be one of: ${EVIDENCE_LEVELS.join(', ')}`);
  }
  return { level, source };
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
    errors.push({ message: 'meta: missing object (no automatic fix)', fixCommand: null });
    return;
  }
  if (meta.title !== undefined) requireField(errors, 'meta', 'title', meta.title, isNonEmptyString);
  if (meta.summary !== undefined && typeof meta.summary !== 'string') {
    errors.push({ message: 'meta: "summary" must be a string when present (no automatic fix)', fixCommand: null });
  }
}

function validateActor(actor, errors, idx) {
  const where = `actors[${idx}]`;
  requireField(errors, where, 'id', actor && actor.id, isSlug, 'kebab-case slug');
  requireField(errors, where, 'label', actor && actor.label, isNonEmptyString);
}

function validateFunction(fn, errors, where, featureSlug, subSlug, formatFix) {
  requireField(errors, where, 'name', fn && fn.name, isNonEmptyString);
  if (fn && fn.in !== undefined && typeof fn.in !== 'string') errors.push({ message: `${where}: "in" must be a string (no automatic fix)`, fixCommand: null });
  if (fn && fn.out !== undefined && typeof fn.out !== 'string') errors.push({ message: `${where}: "out" must be a string (no automatic fix)`, fixCommand: null });
  if (fn && fn.side !== undefined && !SIDE_EFFECTS.includes(fn.side)) {
    errors.push({
      message: `${where}: "side" must be one of ${SIDE_EFFECTS.join('|')}`,
      fixCommand: fn && fn.name && formatFix
        ? formatFix({ type: 'function', action: 'add', feature: featureSlug, submodule: subSlug, name: fn.name, side: SIDE_EFFECTS[0] })
        : null,
    });
  }
  if (fn && fn.purpose !== undefined && typeof fn.purpose !== 'string') {
    errors.push({ message: `${where}: "purpose" must be a string (no automatic fix)`, fixCommand: null });
  }
}

function validateVariable(v, errors, where, featureSlug, subSlug, formatFix) {
  requireField(errors, where, 'name', v && v.name, isNonEmptyString);
  if (v && v.type !== undefined && typeof v.type !== 'string') errors.push({ message: `${where}: "type" must be a string (no automatic fix)`, fixCommand: null });
  if (v && v.scope !== undefined && !VARIABLE_SCOPES.includes(v.scope)) {
    errors.push({
      message: `${where}: "scope" must be one of ${VARIABLE_SCOPES.join('|')}`,
      fixCommand: v && v.name && formatFix
        ? formatFix({ type: 'variable', action: 'add', feature: featureSlug, submodule: subSlug, name: v.name, scope: VARIABLE_SCOPES[0] })
        : null,
    });
  }
  if (v && v.purpose !== undefined && typeof v.purpose !== 'string') {
    errors.push({ message: `${where}: "purpose" must be a string (no automatic fix)`, fixCommand: null });
  }
}

function validateError(err, errors, where) {
  requireField(errors, where, 'name', err && err.name, isNonEmptyString);
  if (err && err.when !== undefined && typeof err.when !== 'string') errors.push({ message: `${where}: "when" must be a string (no automatic fix)`, fixCommand: null });
  if (err && err.means !== undefined && typeof err.means !== 'string') errors.push({ message: `${where}: "means" must be a string (no automatic fix)`, fixCommand: null });
}

function validateSubmodule(sub, errors, where, featureSlug, formatFix) {
  requireField(errors, where, 'slug', sub && sub.slug, isSlug, 'kebab-case slug');
  if (sub && sub.kind !== undefined && !SUBMODULE_KINDS.includes(sub.kind)) {
    errors.push({
      message: `${where}: "kind" must be one of ${SUBMODULE_KINDS.join('|')}`,
      fixCommand: sub && sub.slug && formatFix
        ? formatFix({ type: 'submodule', action: 'set', feature: featureSlug, slug: sub.slug, kind: SUBMODULE_KINDS[0] })
        : null,
    });
  }
  if (sub && sub.role !== undefined && typeof sub.role !== 'string') {
    errors.push({ message: `${where}: "role" must be a string (no automatic fix)`, fixCommand: null });
  }

  if (sub && sub.functions) {
    if (!Array.isArray(sub.functions)) {
      errors.push({ message: `${where}: "functions" must be an array (no automatic fix)`, fixCommand: null });
    } else {
      sub.functions.forEach((fn, i) => validateFunction(fn, errors, `${where}.functions[${i}]`, featureSlug, sub.slug, formatFix));
    }
  }
  if (sub && sub.variables) {
    if (!Array.isArray(sub.variables)) {
      errors.push({ message: `${where}: "variables" must be an array (no automatic fix)`, fixCommand: null });
    } else {
      sub.variables.forEach((v, i) => validateVariable(v, errors, `${where}.variables[${i}]`, featureSlug, sub.slug, formatFix));
    }
  }
  if (sub && sub.dataflow) {
    if (!Array.isArray(sub.dataflow)) {
      errors.push({ message: `${where}: "dataflow" must be an array (no automatic fix)`, fixCommand: null });
    } else {
      const fnNames = new Set((sub.functions || []).map((f) => f && f.name).filter(Boolean));
      const varNames = new Set((sub.variables || []).map((v) => v && v.name).filter(Boolean));
      sub.dataflow.forEach((step, i) => {
        const stepWhere = `${where}.dataflow[${i}]`;
        if (typeof step === 'string') {
          if (!step.trim()) errors.push({ message: `${stepWhere}: step text must be non-empty (no automatic fix)`, fixCommand: null });
          return;
        }
        if (!step || typeof step !== 'object') {
          errors.push({ message: `${stepWhere}: must be a string or an object with "step" (no automatic fix)`, fixCommand: null });
          return;
        }
        if (!isNonEmptyString(step.step)) {
          errors.push({ message: `${stepWhere}: "step" must be a non-empty string (no automatic fix)`, fixCommand: null });
        }
        if (step.fn !== undefined) {
          if (typeof step.fn !== 'string' || !step.fn.trim()) {
            errors.push({ message: `${stepWhere}: "fn" must be a non-empty string when present (no automatic fix)`, fixCommand: null });
          } else if (!fnNames.has(step.fn)) {
            errors.push({
              message: `${stepWhere}: "fn" references unknown function "${step.fn}" — declare it via \`function add\` first`,
              fixCommand: formatFix
                ? formatFix({ type: 'function', action: 'add', feature: featureSlug, submodule: sub.slug, name: step.fn })
                : null,
            });
          }
        }
        for (const field of ['reads', 'writes']) {
          if (step[field] === undefined) continue;
          if (!Array.isArray(step[field])) {
            errors.push({ message: `${stepWhere}: "${field}" must be an array of variable names (no automatic fix)`, fixCommand: null });
            continue;
          }
          step[field].forEach((name, j) => {
            const refWhere = `${stepWhere}.${field}[${j}]`;
            if (typeof name !== 'string' || !name.trim()) {
              errors.push({ message: `${refWhere}: variable name must be a non-empty string (no automatic fix)`, fixCommand: null });
              return;
            }
            if (!varNames.has(name)) {
              errors.push({
                message: `${refWhere}: unknown variable "${name}" — declare it via \`variable add\` first`,
                fixCommand: formatFix
                  ? formatFix({ type: 'variable', action: 'add', feature: featureSlug, submodule: sub.slug, name })
                  : null,
              });
            }
          });
        }
      });
    }
  }
  if (sub && sub.errors) {
    if (!Array.isArray(sub.errors)) {
      errors.push({ message: `${where}: "errors" must be an array (no automatic fix)`, fixCommand: null });
    } else {
      sub.errors.forEach((err, i) => validateError(err, errors, `${where}.errors[${i}]`));
    }
  }
}

function validateEdgeEndpoint(endpoint, errors, where, allowSelf = false) {
  if (typeof endpoint === 'string') {
    if (allowSelf) {
      if (!isSlug(endpoint)) errors.push({ message: `${where}: endpoint slug must be kebab-case (no automatic fix)`, fixCommand: null });
      return;
    }
    errors.push({ message: `${where}: cross-feature endpoint must be an object {feature, submodule} (no automatic fix)`, fixCommand: null });
    return;
  }
  if (!endpoint || typeof endpoint !== 'object') {
    errors.push({ message: `${where}: endpoint missing (no automatic fix)`, fixCommand: null });
    return;
  }
  if (!isSlug(endpoint.feature)) errors.push({ message: `${where}: endpoint.feature must be a kebab-case slug (no automatic fix)`, fixCommand: null });
  if (endpoint.submodule !== undefined && endpoint.submodule !== null && !isSlug(endpoint.submodule)) {
    errors.push({ message: `${where}: endpoint.submodule must be a kebab-case slug when present (no automatic fix)`, fixCommand: null });
  }
}

function validateEdge(edge, errors, where, { allowSelf = false } = {}) {
  if (edge && edge.id !== undefined && !isSlug(edge.id)) {
    errors.push({ message: `${where}: "id" must be a kebab-case slug (no automatic fix)`, fixCommand: null });
  }
  if (edge && edge.kind !== undefined && !EDGE_KINDS.includes(edge.kind)) {
    errors.push({ message: `${where}: "kind" must be one of ${EDGE_KINDS.join('|')} (no automatic fix)`, fixCommand: null });
  }
  validateEdgeEndpoint(edge && edge.from, errors, `${where}.from`, allowSelf);
  validateEdgeEndpoint(edge && edge.to, errors, `${where}.to`, allowSelf);
  if (edge && edge.label !== undefined && typeof edge.label !== 'string') {
    errors.push({ message: `${where}: "label" must be a string (no automatic fix)`, fixCommand: null });
  }
}

function validateFeature(feature, errors, where, formatFix) {
  requireField(errors, where, 'slug', feature && feature.slug, isSlug, 'kebab-case slug');
  if (feature && feature.title !== undefined) requireField(errors, where, 'title', feature.title, isNonEmptyString);
  if (feature && feature.story !== undefined && typeof feature.story !== 'string') {
    errors.push({ message: `${where}: "story" must be a string (no automatic fix)`, fixCommand: null });
  }
  if (feature && feature.dependsOn) {
    if (!Array.isArray(feature.dependsOn)) errors.push({ message: `${where}: "dependsOn" must be a list of feature slugs (no automatic fix)`, fixCommand: null });
    else feature.dependsOn.forEach((slug, i) => {
      if (!isSlug(slug)) errors.push({ message: `${where}.dependsOn[${i}]: must be kebab-case slug (no automatic fix)`, fixCommand: null });
    });
  }
  if (feature && feature.submodules) {
    if (!Array.isArray(feature.submodules)) errors.push({ message: `${where}: "submodules" must be an array (no automatic fix)`, fixCommand: null });
    else {
      const slugs = new Set();
      feature.submodules.forEach((sub, i) => {
        validateSubmodule(sub, errors, `${where}.submodules[${i}]`, feature.slug, formatFix);
        if (sub && isSlug(sub.slug)) {
          if (slugs.has(sub.slug)) errors.push({ message: `${where}: duplicate submodule slug "${sub.slug}" (no automatic fix)`, fixCommand: null });
          slugs.add(sub.slug);
        }
      });
    }
  }
  if (feature && feature.edges) {
    if (!Array.isArray(feature.edges)) errors.push({ message: `${where}: "edges" must be an array (no automatic fix)`, fixCommand: null });
    else feature.edges.forEach((edge, i) => validateEdge(edge, errors, `${where}.edges[${i}]`, { allowSelf: true }));
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
  const errors = [];
  if (!state || typeof state !== 'object') {
    return { valid: false, errors: [{ message: 'state: must be an object (no automatic fix)', fixCommand: null }] };
  }

  validateMeta(state.meta, errors);

  if (state.actors) {
    if (!Array.isArray(state.actors)) errors.push({ message: 'actors: must be an array (no automatic fix)', fixCommand: null });
    else state.actors.forEach((actor, i) => validateActor(actor, errors, i));
  }

  if (!Array.isArray(state.features)) {
    errors.push({ message: 'features: must be an array (no automatic fix)', fixCommand: null });
  } else {
    const featureSlugs = new Set();
    state.features.forEach((feature, i) => {
      validateFeature(feature, errors, `features[${i}]`, formatFix);
      if (feature && isSlug(feature.slug)) {
        if (featureSlugs.has(feature.slug)) errors.push({ message: `features: duplicate feature slug "${feature.slug}" (no automatic fix)`, fixCommand: null });
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
            if (!subSlugs.has(ep)) errors.push({ message: `${where}.${side}: unknown submodule "${ep}" in feature "${feature.slug}" (no automatic fix)`, fixCommand: null });
          } else if (ep && typeof ep === 'object' && ep.feature && ep.feature !== feature.slug) {
            errors.push({ message: `${where}.${side}: intra-feature edge cannot point at another feature "${ep.feature}" (no automatic fix)`, fixCommand: null });
          } else if (ep && ep.submodule && !subSlugs.has(ep.submodule)) {
            errors.push({ message: `${where}.${side}: unknown submodule "${ep.submodule}" (no automatic fix)`, fixCommand: null });
          }
        }
      });
    }
  }

  if (state.edges) {
    if (!Array.isArray(state.edges)) errors.push({ message: 'edges: must be an array (no automatic fix)', fixCommand: null });
    else state.edges.forEach((edge, i) => validateEdge(edge, errors, `edges[${i}]`));
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
        if (!featureMap.has(ep.feature)) errors.push({ message: `${where}.${side}: unknown feature "${ep.feature}" (no automatic fix)`, fixCommand: null });
        else if (ep.submodule && !featureMap.get(ep.feature).has(ep.submodule)) {
          errors.push({ message: `${where}.${side}: unknown submodule "${ep.submodule}" in feature "${ep.feature}" (no automatic fix)`, fixCommand: null });
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
  SUBMODULE_KINDS,
  KIND_LABEL,
  SIDE_EFFECTS,
  VARIABLE_SCOPES,
  EDGE_KINDS,
  EVIDENCE_LEVELS,
  SLUG_PATTERN,
  isSlug,
  isNonEmptyString,
  parseEvidence,
  validate,
  emptyState,
};
