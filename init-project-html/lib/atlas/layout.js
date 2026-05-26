'use strict';

// layout.js — wraps elkjs to lay out the macro atlas. Features are
// nested compound nodes; submodules are leaf nodes inside them.
// hierarchyHandling=INCLUDE_CHILDREN lets cross-cluster edges route
// past intermediate nodes. The flatten step rebases every node and
// edge section into absolute (root-relative) coordinates so render.js
// can emit SVG without further math.
//
// Layout is async because elkjs returns a Promise even in Node.

const ELK = require('elkjs');
const { KIND_LABEL } = require('./schema');

// Default fallback box. The actual width/height for each sub-module
// is computed per node by measureSubmodule() so the role/description
// fits without overflowing the rectangle.
const SUB_WIDTH = 240;
const SUB_HEIGHT = 92;

// Box-sizing knobs (intrinsic SVG coordinates). The width/height caps
// are intentionally generous so CJK roles — which paint at ~1em per
// character instead of ~0.55em — can grow into a readable rectangle
// without spilling outside the box (the original ~360×220 cap was
// only honest for Latin text).
const SUB_WIDTH_MIN = 220;
const SUB_WIDTH_MAX = 520;
const SUB_HEIGHT_MIN = 92;
const SUB_HEIGHT_MAX = 360;
const SUB_SIDE_PAD = 16;
const SUB_TOP_PAD = 14;
const SUB_BOTTOM_PAD = 14;
const TITLE_LINE = 22;     // slug line
const KIND_LINE = 16;      // kind chip line
const ROLE_LINE = 16;      // each role line
const KIND_GAP = 4;
const ROLE_GAP = 8;
const MAX_ROLE_LINES = 6;

const CLUSTER_PAD_TOP = 44;
const CLUSTER_PAD_SIDE = 16;
const CLUSTER_PAD_BOTTOM = 18;

// Font sizes mirror architecture.css so the layout math agrees with
// what the SVG actually paints.
const SLUG_FONT_PX = 15;
const KIND_FONT_PX = 10;
const ROLE_FONT_PX = 11.5;
const EDGE_LABEL_FONT_PX = 11;
const EDGE_LABEL_LINE_PX = 14;
const EDGE_LABEL_LINE_WIDTH_MAX = 220;
const EDGE_LABEL_PAD_X = 18;
const EDGE_LABEL_PAD_Y = 8;

// East-Asian Wide / Full-width detection. The ranges follow the
// canonical "wide" / "fullwidth" code blocks (Unicode TR11) — we use
// them to switch between a ~0.55em-per-char Latin metric and a
// ~1.0em-per-char CJK metric so layout matches paint.
function isWideChar(ch) {
  const code = ch.codePointAt(0);
  return (
    (code >= 0x1100 && code <= 0x115F) ||
    (code >= 0x2E80 && code <= 0x9FFF) ||
    (code >= 0xA000 && code <= 0xA4CF) ||
    (code >= 0xAC00 && code <= 0xD7A3) ||
    (code >= 0xF900 && code <= 0xFAFF) ||
    (code >= 0xFE30 && code <= 0xFE4F) ||
    (code >= 0xFF00 && code <= 0xFF60) ||
    (code >= 0xFFE0 && code <= 0xFFE6) ||
    (code >= 0x20000 && code <= 0x2FFFD)
  );
}

function charWidthFactor(ch) {
  if (isWideChar(ch)) return 1.0;
  if (ch === ' ') return 0.30;
  if (/[A-Za-z0-9]/.test(ch)) return 0.55;
  return 0.50;
}

function approxTextWidth(text, fontPx) {
  if (!text) return 0;
  let w = 0;
  for (const ch of String(text)) w += fontPx * charWidthFactor(ch);
  return w;
}

// Greedy wrap by *visual* width. CJK characters break between any
// two characters; ASCII words stay whole; whitespace is a soft break.
function wrapByVisualWidth(text, maxWidthPx, fontPx) {
  if (!text) return [];
  const str = String(text);
  const lines = [];
  let line = '';
  let lineW = 0;

  function flush() {
    if (line.length > 0) lines.push(line.replace(/\s+$/, ''));
    line = '';
    lineW = 0;
  }

  let i = 0;
  while (i < str.length) {
    const cp = str.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    const advance = ch.length;

    if (ch === '\n') {
      flush();
      i += advance;
    } else if (isWideChar(ch)) {
      const w = fontPx * 1.0;
      if (line && lineW + w > maxWidthPx) flush();
      line += ch;
      lineW += w;
      i += advance;
    } else if (/\s/.test(ch)) {
      const w = fontPx * 0.30;
      if (line) {
        if (lineW + w > maxWidthPx) flush();
        else { line += ch; lineW += w; }
      }
      i += advance;
    } else {
      let word = '';
      let wordW = 0;
      while (i < str.length) {
        const cp2 = str.codePointAt(i);
        const ch2 = String.fromCodePoint(cp2);
        if (isWideChar(ch2) || /\s/.test(ch2)) break;
        word += ch2;
        wordW += fontPx * charWidthFactor(ch2);
        i += ch2.length;
      }
      if (line && lineW + wordW > maxWidthPx) flush();
      line += word;
      lineW += wordW;
    }
  }
  flush();
  return lines.filter((l) => l.length > 0);
}

// Short labels (feature title, sub-module slug) — single-line width
// only. Capped so very long ASCII slugs do not blow up the cluster
// header band; CJK titles still get an honest visual width.
function estimateLabelWidth(text) {
  if (!text) return 0;
  return Math.min(320, Math.max(40, Math.ceil(approxTextWidth(text, 13)) + 16));
}

// Edge labels — wrap into a tall enough rectangle so elkjs reserves
// proportional edge length (longer text ⇒ longer arrow). The wrapped
// text is stored with '\n' separators so render.js can paint each
// line as its own <tspan> centered on the same anchor.
function measureEdgeLabel(text) {
  if (!text) return { text: '', lines: [], width: 0, height: 0 };
  const raw = String(text);
  const singleW = approxTextWidth(raw, EDGE_LABEL_FONT_PX);
  if (singleW <= EDGE_LABEL_LINE_WIDTH_MAX) {
    return {
      text: raw,
      lines: [raw],
      width: Math.max(40, Math.ceil(singleW) + EDGE_LABEL_PAD_X),
      height: EDGE_LABEL_LINE_PX + EDGE_LABEL_PAD_Y,
    };
  }
  const lines = wrapByVisualWidth(raw, EDGE_LABEL_LINE_WIDTH_MAX, EDGE_LABEL_FONT_PX);
  const widestLine = lines.reduce((m, l) => Math.max(m, approxTextWidth(l, EDGE_LABEL_FONT_PX)), 0);
  return {
    text: lines.join('\n'),
    lines,
    width: Math.ceil(widestLine) + EDGE_LABEL_PAD_X,
    height: lines.length * EDGE_LABEL_LINE_PX + EDGE_LABEL_PAD_Y,
  };
}

// measureSubmodule picks a width + height that fit the slug, the kind
// chip, and the wrapped role text. Both layout.js (when telling elkjs
// how much room each node needs) and render.js (when actually drawing
// the text inside the box) call it so the rendered text never spills
// outside the rectangle the layout engine reserved.
function measureSubmodule(sub) {
  const slug = (sub && sub.slug) || '';
  const kindLabel = KIND_LABEL[sub && sub.kind] || (sub && sub.kind) || 'Service';
  const role = (sub && sub.role) || '';

  const slugW = approxTextWidth(slug, SLUG_FONT_PX);
  // Kind chip is upper-cased + letter-spaced in CSS (0.22em); add ~30% slack.
  const kindW = approxTextWidth(kindLabel.toUpperCase(), KIND_FONT_PX) * 1.3;
  const baseInner = Math.max(slugW, kindW);

  // Auto-expand the box to fit the role with as few lines as
  // possible: prefer 1 line if it fits inside SUB_WIDTH_MAX, else 2,
  // else 3 — and only wrap further when even 3 lines would exceed
  // the cap. This is what "boxes auto-expand to their content" means
  // for CJK roles whose glyphs are ~2× wider than Latin.
  const roleVisualW = approxTextWidth(role, ROLE_FONT_PX);
  const maxInner = SUB_WIDTH_MAX - SUB_SIDE_PAD * 2;
  let chosenInner;
  if (!role) {
    chosenInner = baseInner;
  } else {
    let target;
    if (roleVisualW <= maxInner) target = roleVisualW;
    else if (Math.ceil(roleVisualW / 2) <= maxInner) target = Math.ceil(roleVisualW / 2);
    else target = Math.ceil(roleVisualW / 3);
    chosenInner = Math.max(baseInner, Math.max(180, target));
  }
  const width = Math.max(SUB_WIDTH_MIN, Math.min(SUB_WIDTH_MAX, Math.ceil(chosenInner + SUB_SIDE_PAD * 2)));

  // With the chosen width fixed, wrap the role for real and count lines.
  const innerW = width - SUB_SIDE_PAD * 2;
  let roleLines = role ? wrapByVisualWidth(role, innerW, ROLE_FONT_PX) : [];
  if (roleLines.length > MAX_ROLE_LINES) {
    roleLines = roleLines.slice(0, MAX_ROLE_LINES);
    const last = roleLines[MAX_ROLE_LINES - 1];
    roleLines[MAX_ROLE_LINES - 1] = last.length > 3 ? `${last.slice(0, -1)}…` : `${last}…`;
  }

  const roleBlock = roleLines.length > 0 ? ROLE_GAP + roleLines.length * ROLE_LINE : 0;
  const intrinsicH = SUB_TOP_PAD + TITLE_LINE + KIND_GAP + KIND_LINE + roleBlock + SUB_BOTTOM_PAD;
  const height = Math.max(SUB_HEIGHT_MIN, Math.min(SUB_HEIGHT_MAX, Math.ceil(intrinsicH)));

  return { width, height, roleLines, kindLabel };
}

function endpointId(endpoint, ownerFeature) {
  if (typeof endpoint === 'string') {
    return `submodule::${ownerFeature}::${endpoint}`;
  }
  if (endpoint && endpoint.submodule) {
    return `submodule::${endpoint.feature}::${endpoint.submodule}`;
  }
  if (endpoint && endpoint.feature) {
    return `feature::${endpoint.feature}`;
  }
  return null;
}

function clusterLayoutOptions(feature, isCrossEdgeEndpoint) {
  // If the feature declares intra-feature flow edges OR is an
  // endpoint of any root-level cross-feature edge, the cluster must
  // use a hierarchy-friendly directional algorithm (layered) so elk
  // can route edges into/out of its children. Mixing rectpacking
  // with layered hierarchy edges raises UnsupportedGraphException.
  //
  // Otherwise (truly isolated leaf cluster) pack sub-modules into a
  // roughly square grid so a 10-sub-module feature does not become a
  // tall column that wastes the rest of the viewport.
  const hasInternalEdges = Array.isArray(feature.edges) && feature.edges.length > 0;
  const common = {
    'elk.padding': `[top=${CLUSTER_PAD_TOP},left=${CLUSTER_PAD_SIDE},bottom=${CLUSTER_PAD_BOTTOM},right=${CLUSTER_PAD_SIDE}]`,
    'elk.spacing.nodeNode': '16',
    'elk.nodeLabels.placement': '[H_CENTER, V_TOP, INSIDE]',
  };
  if (hasInternalEdges || isCrossEdgeEndpoint) {
    return {
      ...common,
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '28',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    };
  }
  return {
    ...common,
    'elk.algorithm': 'rectpacking',
    'elk.aspectRatio': '1.4',
    'elk.rectpacking.optimizationGoal': 'MAX_SCALE_DRIVEN',
  };
}

function collectCrossEdgeFeatures(state) {
  const set = new Set();
  function note(endpoint) {
    if (endpoint && typeof endpoint === 'object' && endpoint.feature) set.add(endpoint.feature);
  }
  for (const edge of state.edges || []) {
    note(edge.from);
    note(edge.to);
  }
  return set;
}

function buildGraph(state) {
  const crossEndpoints = collectCrossEdgeFeatures(state);
  const children = (state.features || []).map((feature) => ({
    id: `feature::${feature.slug}`,
    labels: [{
      id: `feature::${feature.slug}::label`,
      text: feature.title || feature.slug,
      width: estimateLabelWidth(feature.title || feature.slug),
      height: 24,
    }],
    layoutOptions: clusterLayoutOptions(feature, crossEndpoints.has(feature.slug)),
    children: (feature.submodules || []).map((sub) => {
      const box = measureSubmodule(sub);
      return {
        id: `submodule::${feature.slug}::${sub.slug}`,
        width: box.width,
        height: box.height,
        labels: [{
          id: `submodule::${feature.slug}::${sub.slug}::label`,
          text: sub.slug,
          width: estimateLabelWidth(sub.slug),
          height: 18,
        }],
      };
    }),
  }));

  let nextEdgeId = 0;
  const rootEdges = [];
  const nestedEdges = new Map(); // feature slug → edges[]

  function pushEdge(list, raw, sourceId, targetId) {
    if (!sourceId || !targetId) return;
    const id = raw.id || `e-${nextEdgeId++}`;
    let labels = [];
    if (raw.label) {
      const m = measureEdgeLabel(raw.label);
      labels = [{
        id: `${id}::label`,
        text: m.text,
        width: m.width,
        height: m.height,
      }];
    }
    list.push({ id, sources: [sourceId], targets: [targetId], labels });
  }

  for (const feature of state.features || []) {
    const list = [];
    for (const edge of feature.edges || []) {
      pushEdge(list, edge, endpointId(edge.from, feature.slug), endpointId(edge.to, feature.slug));
    }
    if (list.length > 0) nestedEdges.set(feature.slug, list);
  }
  for (const edge of state.edges || []) {
    pushEdge(rootEdges, edge, endpointId(edge.from), endpointId(edge.to));
  }

  for (const child of children) {
    const slug = child.id.replace(/^feature::/, '');
    if (nestedEdges.has(slug)) child.edges = nestedEdges.get(slug);
  }

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      // 16:9 hint so elk stops sprawling along one axis and leaving
      // the other half of the viewport empty.
      'elk.aspectRatio': '1.778',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.edgeLabels.inline': 'false',
      'elk.edgeLabels.placement': 'CENTER',
      // Tighter post-layout placement: BALANCED keeps related nodes
      // adjacent, EDGE_LENGTH compaction pulls disconnected
      // sub-graphs in toward each other so unused columns collapse.
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
    },
    children,
    edges: rootEdges,
  };
}

function collectAbsolute(node, offsetX, offsetY, acc) {
  // node may be root, a cluster, or a leaf.
  const absX = offsetX + (node.x || 0);
  const absY = offsetY + (node.y || 0);

  if (node.id && node.id.startsWith('feature::')) {
    acc.features.push({
      id: node.id,
      slug: node.id.replace(/^feature::/, ''),
      x: absX,
      y: absY,
      width: node.width || 0,
      height: node.height || 0,
      labels: (node.labels || []).map((l) => ({
        text: l.text,
        x: absX + (l.x || 0),
        y: absY + (l.y || 0),
        width: l.width || 0,
        height: l.height || 0,
      })),
    });
  } else if (node.id && node.id.startsWith('submodule::')) {
    const parts = node.id.split('::');
    acc.submodules.push({
      id: node.id,
      featureSlug: parts[1],
      slug: parts[2],
      x: absX,
      y: absY,
      width: node.width || SUB_WIDTH,
      height: node.height || SUB_HEIGHT,
      labels: (node.labels || []).map((l) => ({
        text: l.text,
        x: absX + (l.x || 0),
        y: absY + (l.y || 0),
        width: l.width || 0,
        height: l.height || 0,
      })),
    });
  }

  for (const edge of node.edges || []) {
    const sections = (edge.sections || []).map((section) => ({
      startPoint: { x: section.startPoint.x + absX, y: section.startPoint.y + absY },
      endPoint: { x: section.endPoint.x + absX, y: section.endPoint.y + absY },
      bendPoints: (section.bendPoints || []).map((p) => ({ x: p.x + absX, y: p.y + absY })),
    }));
    const labels = (edge.labels || []).map((label) => ({
      text: label.text,
      x: absX + (label.x || 0),
      y: absY + (label.y || 0),
      width: label.width || 0,
      height: label.height || 0,
    }));
    acc.edges.push({ id: edge.id, sections, labels });
  }

  for (const child of node.children || []) {
    collectAbsolute(child, absX, absY, acc);
  }
}

function assertNoOverlap(layout) {
  const boxes = [];
  for (const sub of layout.submodules) {
    boxes.push({ id: sub.id, x: sub.x, y: sub.y, w: sub.width, h: sub.height });
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlapX && overlapY) {
        throw new Error(`atlas layout: submodule rectangles overlap: ${a.id} vs ${b.id}`);
      }
    }
  }
}

async function layoutMacro(state) {
  if (!state.features || state.features.length === 0) {
    return { width: 320, height: 160, features: [], submodules: [], edges: [], empty: true };
  }
  const elk = new ELK();
  const graph = buildGraph(state);
  const laidOut = await elk.layout(graph);
  const acc = { features: [], submodules: [], edges: [] };
  collectAbsolute(laidOut, 0, 0, acc);
  const layout = {
    width: laidOut.width || 0,
    height: laidOut.height || 0,
    features: acc.features,
    submodules: acc.submodules,
    edges: acc.edges,
    empty: false,
  };
  assertNoOverlap(layout);
  return layout;
}

module.exports = {
  SUB_WIDTH,
  SUB_HEIGHT,
  SUB_WIDTH_MIN,
  SUB_WIDTH_MAX,
  SUB_HEIGHT_MIN,
  SUB_HEIGHT_MAX,
  layoutMacro,
  assertNoOverlap,
  buildGraph,
  measureSubmodule,
  measureEdgeLabel,
  approxTextWidth,
  wrapByVisualWidth,
};
