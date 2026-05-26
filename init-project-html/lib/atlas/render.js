'use strict';

// render.js — declarative atlas → HTML/SVG.
//
// Three page types:
//   1. Macro `index.html`          (atlas-summary + atlas SVG with clusters + cross-feature edges + submodule index)
//   2. Feature `features/<slug>/index.html`  (feature story + sub-module navigation)
//   3. Sub-module `features/<slug>/<sub>.html`  (sub-io + sub-vars + sub-dataflow + sub-errors)
//
// Render output is deterministic so tests can snapshot it. Assets
// (architecture.css + viewer.client.js) are copied to <outDir>/assets/.

const fs = require('node:fs');
const path = require('node:path');

const { layoutMacro, measureSubmodule } = require('./layout');
const { EVIDENCE_LEVELS } = require('./schema');

const KIND_LABEL = {
  ui: 'UI',
  api: 'API',
  service: 'Service',
  db: 'DB',
  'pure-fn': 'Pure fn',
  queue: 'Queue',
  external: 'External',
};

const EVI_LABEL = Object.fromEntries(EVIDENCE_LEVELS.map((l) => [l, l.slice(0, 3)]));

function htmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function relAssetPath(fromPagePath, outDir) {
  const fromDir = path.dirname(fromPagePath);
  const rel = path.relative(fromDir, path.join(outDir, 'assets'));
  return (rel === '' ? '.' : rel).split(path.sep).join('/');
}

function pagePathFor(kind, { featureSlug, submoduleSlug } = {}) {
  if (kind === 'macro') return 'index.html';
  if (kind === 'feature') return `features/${featureSlug}/index.html`;
  if (kind === 'submodule') return `features/${featureSlug}/${submoduleSlug}.html`;
  throw new Error(`unknown page kind: ${kind}`);
}

function head({ title, assetRel, pageKind }) {
  return [
    '<!DOCTYPE html>',
    `<html lang="en" data-atlas-page="${pageKind}">`,
    '<head>',
    '  <meta charset="utf-8">',
    `  <title>${htmlEscape(title)}</title>`,
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="color-scheme" content="dark">',
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Geist:wght@300..700&family=JetBrains+Mono:wght@400..600&display=swap">',
    `  <link rel="stylesheet" href="${assetRel}/architecture.css">`,
    '</head>',
  ].join('\n');
}

function renderEdgePath(edge) {
  const segments = [];
  for (const section of edge.sections || []) {
    const pts = [section.startPoint, ...(section.bendPoints || []), section.endPoint];
    if (pts.length === 0) continue;
    segments.push(pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
  }
  return segments.join(' ');
}

function edgeKindFor(stateEdge) {
  return stateEdge && stateEdge.kind ? stateEdge.kind : 'call';
}

function findEdgeMeta(state, edgeId) {
  for (const feature of state.features || []) {
    for (const e of feature.edges || []) {
      if (e.id === edgeId) return { edge: e, scope: 'feature' };
    }
  }
  for (const e of state.edges || []) {
    if (e.id === edgeId) return { edge: e, scope: 'root' };
  }
  return { edge: null, scope: 'feature' };
}

function renderMacroSvg(layout, state, featureMap, edgeMetaMap) {
  if (layout.empty) {
    return '<svg class="atlas-svg" viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Atlas is empty"><text x="160" y="80" text-anchor="middle" fill="currentColor">Atlas has no features yet</text></svg>';
  }
  const pad = 24;
  const vbW = Math.max(320, Math.ceil(layout.width + pad * 2));
  const vbH = Math.max(160, Math.ceil(layout.height + pad * 2));
  const parts = [];
  parts.push(`<svg class="atlas-svg" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Project architecture atlas" data-atlas-svg="macro">`);
  parts.push('  <defs>');
  for (const kind of ['call', 'return', 'data-row', 'failure']) {
    parts.push(`    <marker id="arrow-${kind}" class="m-arrow m-arrow--${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" /></marker>`);
  }
  parts.push('  </defs>');
  parts.push(`  <g transform="translate(${pad},${pad})">`);

  for (const feat of layout.features) {
    parts.push(`    <g class="m-cluster" data-feature="${htmlEscape(feat.slug)}">`);
    parts.push(`      <rect class="m-cluster__bg" x="${feat.x.toFixed(2)}" y="${feat.y.toFixed(2)}" width="${feat.width.toFixed(2)}" height="${feat.height.toFixed(2)}" rx="14" ry="14" />`);
    const titleX = feat.x + feat.width / 2;
    const titleY = feat.y + 26;
    const featureState = featureMap?.get(feat.slug) ?? (state.features || []).find((f) => f.slug === feat.slug);
    const title = (featureState && featureState.title) || feat.slug;
    parts.push(`      <text class="m-cluster__title" x="${titleX.toFixed(2)}" y="${titleY.toFixed(2)}" text-anchor="middle">${htmlEscape(title)}</text>`);
    parts.push('    </g>');
  }

  for (const sub of layout.submodules) {
    const parent = featureMap?.get(sub.featureSlug) ?? (state.features || []).find((f) => f.slug === sub.featureSlug);
    const subState = (parent || {}).submodules || [];
    const meta = subState.find((s) => s.slug === sub.slug) || {};
    const kind = meta.kind || 'service';
    const role = meta.role || '';
    const measured = measureSubmodule({ slug: sub.slug, kind, role });

    const cx = sub.x + sub.width / 2;
    const titleY = sub.y + 14 + 16; // SUB_TOP_PAD (14) + ascent for the title line
    const kindY = titleY + 4 + 12; // KIND_GAP + kind ascent
    const roleStartY = kindY + 8 + 12; // ROLE_GAP + first role line ascent

    const href = `features/${sub.featureSlug}/${sub.slug}.html`;
    const tooltip = role ? `${sub.slug} — ${role}` : sub.slug;
    parts.push(`    <a class="m-node m-node--${kind}" href="${htmlEscape(href)}" data-feature="${htmlEscape(sub.featureSlug)}" data-submodule="${htmlEscape(sub.slug)}" tabindex="0" aria-label="${htmlEscape(tooltip)} — open sub-module page">`);
    parts.push(`      <title>${htmlEscape(tooltip)}</title>`);
    parts.push(`      <rect x="${sub.x.toFixed(2)}" y="${sub.y.toFixed(2)}" width="${sub.width.toFixed(2)}" height="${sub.height.toFixed(2)}" rx="10" ry="10" />`);
    parts.push(`      <text class="m-node__title" x="${cx.toFixed(2)}" y="${titleY.toFixed(2)}" text-anchor="middle">${htmlEscape(sub.slug)}</text>`);
    parts.push(`      <text class="m-node__kind" x="${cx.toFixed(2)}" y="${kindY.toFixed(2)}" text-anchor="middle">${htmlEscape(measured.kindLabel || KIND_LABEL[kind] || kind)}</text>`);
    measured.roleLines.forEach((line, idx) => {
      const ly = roleStartY + idx * 16;
      parts.push(`      <text class="m-node__role" x="${cx.toFixed(2)}" y="${ly.toFixed(2)}" text-anchor="middle">${htmlEscape(line)}</text>`);
    });
    parts.push('    </a>');
  }

  for (const edge of layout.edges) {
    const { edge: meta, scope } = edgeMetaMap?.get(edge.id) ?? findEdgeMeta(state, edge.id);
    const kind = edgeKindFor(meta);
    const d = renderEdgePath(edge);
    if (!d) continue;
    const scopeClass = scope === 'root' ? ' m-edge--cross' : '';
    parts.push(`    <g class="m-edge m-edge--${kind}${scopeClass}" data-edge="${htmlEscape(edge.id)}">`);
    parts.push(`      <path d="${d}" fill="none" marker-end="url(#arrow-${kind})" />`);
    for (const label of edge.labels || []) {
      if (!label.text) continue;
      const lines = String(label.text).split('\n');
      const cx = label.x + (label.width || 0) / 2;
      const lineH = 14; // matches EDGE_LABEL_LINE_PX in layout.js
      const blockH = lines.length * lineH;
      const firstBaseline = label.y + ((label.height || 0) - blockH) / 2 + (lineH - 3);
      parts.push(`      <text class="m-edge__label" x="${cx.toFixed(2)}" y="${firstBaseline.toFixed(2)}" text-anchor="middle">`);
      lines.forEach((line, idx) => {
        if (idx === 0) {
          parts.push(`        <tspan x="${cx.toFixed(2)}">${htmlEscape(line)}</tspan>`);
        } else {
          parts.push(`        <tspan x="${cx.toFixed(2)}" dy="${lineH}">${htmlEscape(line)}</tspan>`);
        }
      });
      parts.push('      </text>');
    }
    parts.push('    </g>');
  }

  parts.push('  </g>');
  parts.push('</svg>');
  return parts.join('\n');
}

function renderAtlasSubmoduleIndex(state) {
  const items = [];
  for (const feature of state.features || []) {
    for (const sub of feature.submodules || []) {
      items.push({
        feature: feature.slug,
        featureTitle: feature.title || feature.slug,
        sub: sub.slug,
        kind: sub.kind,
        role: sub.role,
      });
    }
  }
  if (items.length === 0) return '';
  const rows = items.map((it) => `        <li class="atlas-submodule-index__item">
          <a href="features/${htmlEscape(it.feature)}/${htmlEscape(it.sub)}.html">
            <span class="atlas-submodule-index__feature">${htmlEscape(it.featureTitle)}</span>
            <span class="atlas-submodule-index__sub">${htmlEscape(it.sub)}</span>
            <span class="atlas-submodule-index__kind atlas-submodule-index__kind--${htmlEscape(it.kind)}">${htmlEscape(KIND_LABEL[it.kind] || it.kind)}</span>
          </a>
          ${it.role ? `<p class="atlas-submodule-index__role">${htmlEscape(it.role)}</p>` : ''}
        </li>`).join('\n');
  return `      <ul class="atlas-submodule-index">
${rows}
      </ul>`;
}

function renderMacro({ state, layout, outDir }) {
  const pageRel = pagePathFor('macro');
  const assetRel = relAssetPath(path.join(outDir, pageRel), outDir);
  const featureMap = new Map((state.features || []).map((f) => [f.slug, f]));
  const edgeMetaMap = new Map();
  for (const f of state.features || []) {
    for (const e of f.edges || []) {
      edgeMetaMap.set(e.id, { edge: e, scope: 'feature' });
    }
  }
  for (const e of state.edges || []) {
    edgeMetaMap.set(e.id, { edge: e, scope: 'root' });
  }
  const svg = renderMacroSvg(layout, state, featureMap, edgeMetaMap);
  const title = (state.meta && state.meta.title) || 'Project architecture';
  const summary = (state.meta && state.meta.summary) || '';
  const submoduleIndex = renderAtlasSubmoduleIndex(state);

  const body = `<body>
  <header class="atlas-header">
    <h1>${htmlEscape(title)}</h1>
    ${summary ? `<p class="atlas-summary">${htmlEscape(summary)}</p>` : ''}
  </header>
  <main class="atlas-main">
    <section class="atlas-canvas" aria-label="Macro architecture diagram">
      <div class="atlas-canvas__toolbar" role="toolbar" aria-label="Diagram controls">
        <button type="button" data-pan-zoom="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" data-pan-zoom="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" data-pan-zoom="fit" aria-label="Reset view">Fit</button>
      </div>
      <div class="atlas-canvas__viewport" data-pan-zoom-viewport>
${svg}
      </div>
      <ol class="atlas-legend" aria-label="Edge legend">
        <li><span class="legend-swatch legend-swatch--call"></span>call</li>
        <li><span class="legend-swatch legend-swatch--return"></span>return</li>
        <li><span class="legend-swatch legend-swatch--data-row"></span>data-row</li>
        <li><span class="legend-swatch legend-swatch--failure"></span>failure</li>
      </ol>
    </section>
    <section class="atlas-index" aria-label="Submodule index">
      <h2>Submodule index</h2>
${submoduleIndex}
    </section>
  </main>
  <script src="${assetRel}/viewer.client.js" defer></script>
</body>
</html>`;

  return `${head({ title, assetRel, pageKind: 'macro' })}\n${body}\n`;
}

function renderSubmoduleCard(featureSlug, sub) {
  const kindLabel = KIND_LABEL[sub.kind] || sub.kind;
  const link = `${sub.slug}.html`;
  return `      <li class="submodule-card">
        <a class="submodule-card__link" href="${htmlEscape(link)}">
          <span class="submodule-card__name">${htmlEscape(sub.slug)}</span>
          <span class="submodule-card__kind submodule-card__kind--${htmlEscape(sub.kind)}">${htmlEscape(kindLabel)}</span>
        </a>
        ${sub.role ? `<p class="submodule-card__role">${htmlEscape(sub.role)}</p>` : ''}
      </li>`;
}

function renderFeaturePage({ feature, outDir }) {
  const pageRel = pagePathFor('feature', { featureSlug: feature.slug });
  const assetRel = relAssetPath(path.join(outDir, pageRel), outDir);
  const title = feature.title || feature.slug;
  const subNav = (feature.submodules || []).map((s) => renderSubmoduleCard(feature.slug, s)).join('\n');
  const dependsOn = Array.isArray(feature.dependsOn) ? feature.dependsOn : [];
  const dependsList = dependsOn.length > 0
    ? `<p class="feature-depends">Depends on: ${dependsOn.map((d) => `<a href="../${htmlEscape(d)}/index.html">${htmlEscape(d)}</a>`).join(', ')}</p>`
    : '';
  const intraEdges = (feature.edges || []).filter((e) => e.kind && e.label);

  const body = `<body>
  <header class="feature-header">
    <nav class="feature-breadcrumb"><a href="../../index.html">← Atlas</a></nav>
    <h1>${htmlEscape(title)}</h1>
    ${dependsList}
  </header>
  <main class="feature-main">
    ${feature.story ? `<section class="feature-story"><p>${htmlEscape(feature.story)}</p></section>` : ''}
    <section class="feature-submodules" aria-label="Submodules">
      <h2>Submodules</h2>
      <ul class="submodule-nav">
${subNav}
      </ul>
    </section>
    ${intraEdges.length > 0 ? `<section class="feature-edges" aria-label="Intra-feature edges">
      <h2>Intra-feature edges</h2>
      <ul class="feature-edges__list">
${intraEdges.map((e) => {
  const from = typeof e.from === 'string' ? e.from : (e.from && e.from.submodule);
  const to = typeof e.to === 'string' ? e.to : (e.to && e.to.submodule);
  return `        <li class="feature-edges__item feature-edges__item--${htmlEscape(e.kind)}"><span class="feature-edges__endpoints">${htmlEscape(from)} → ${htmlEscape(to)}</span><span class="feature-edges__kind">${htmlEscape(e.kind)}</span><span class="feature-edges__label">${htmlEscape(e.label || '')}</span></li>`;
}).join('\n')}
      </ul>
    </section>` : ''}
  </main>
</body>
</html>`;

  return `${head({ title, assetRel, pageKind: 'feature' })}\n${body}\n`;
}

function renderEvidenceBadge(ev) {
  if (!ev || !ev.level) return '';
  const label = EVI_LABEL[ev.level] || ev.level;
  const title = ev.source ? htmlEscape(ev.source) : '';
  const titleAttr = title ? ` title="${title}"` : '';
  return `<span class="evi evi--${ev.level}"${titleAttr}>${label}</span>`;
}

function renderSubmoduleTable(headers, rows, evidences) {
  const hasEvCol = Array.isArray(evidences) && evidences.some((ev) => ev && ev.level);
  const allHeaders = hasEvCol ? [...headers, 'Evidence'] : headers;
  return `<table class="sub-table">
        <thead><tr>${allHeaders.map((h) => `<th scope="col">${htmlEscape(h)}</th>`).join('')}</tr></thead>
        <tbody>
${rows.map((r, ri) => {
  const baseCells = r.map((c) => `<td>${htmlEscape(c == null ? '' : c)}</td>`);
  const cells = hasEvCol ? [...baseCells, `<td>${renderEvidenceBadge(evidences[ri])}</td>`] : baseCells;
  return `          <tr>${cells.join('')}</tr>`;
}).join('\n')}
        </tbody>
      </table>`;
}

function normalizeDataflowStep(item) {
  if (typeof item === 'string') return { step: item, fn: '', reads: [], writes: [] };
  if (!item || typeof item !== 'object') return { step: '', fn: '', reads: [], writes: [] };
  return {
    step: typeof item.step === 'string' ? item.step : '',
    fn: typeof item.fn === 'string' ? item.fn.trim() : '',
    reads: Array.isArray(item.reads) ? item.reads.filter((v) => typeof v === 'string' && v.trim()) : [],
    writes: Array.isArray(item.writes) ? item.writes.filter((v) => typeof v === 'string' && v.trim()) : [],
  };
}

function renderInternalDataflowSvg(steps) {
  if (!steps || steps.length === 0) {
    return '<p class="sub-dataflow__empty">No internal dataflow steps recorded.</p>';
  }

  // Each step renders as a box with three optional zones: a top fn pill
  // (which function executes this step), the step description in the
  // middle, and a bottom row of variable chips (← reads / → writes).
  // The surrounding viewport handles zoom/pan, so we size boxes to the
  // content rather than the viewport.
  const boxW = 520;
  const lineHeight = 20;
  const innerPadY = 18;
  const fnRowH = 32;       // fn pill + spacing
  const chipsRowH = 26;    // chips row + spacing
  const minBoxH = 72;
  const gap = 44;
  const padLeft = 80;      // room for the left-side step-number badge
  const padTop = 32;
  const padBottom = 32;
  const padRight = 28;

  const normalized = steps.map(normalizeDataflowStep);
  const layouts = normalized.map((s) => {
    const lines = wrapText(s.step, 60);
    const hasFn = s.fn.length > 0;
    const hasChips = s.reads.length > 0 || s.writes.length > 0;
    const textBlockH = lines.length * lineHeight;
    const boxH = Math.max(minBoxH, innerPadY * 2 + (hasFn ? fnRowH : 0) + textBlockH + (hasChips ? chipsRowH : 0));
    return { lines, hasFn, hasChips, boxH };
  });

  const totalH = padTop + layouts.reduce((a, l) => a + l.boxH, 0) + (normalized.length - 1) * gap + padBottom;
  const totalW = padLeft + boxW + padRight;

  const parts = [];
  parts.push(`<svg class="sub-dataflow__svg" data-atlas-svg="sub-dataflow" viewBox="0 0 ${totalW} ${totalH}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Internal dataflow">`);
  parts.push('  <defs>');
  parts.push('    <marker id="sub-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" /></marker>');
  parts.push('  </defs>');

  let cursorY = padTop;
  normalized.forEach((s, i) => {
    const layout = layouts[i];
    const boxX = padLeft;
    const boxY = cursorY;
    const boxH = layout.boxH;
    const badgeCx = padLeft - 38;
    const badgeCy = boxY + boxH / 2;

    parts.push('  <g class="sub-dataflow__step">');
    parts.push(`    <circle class="sub-dataflow__badge" cx="${badgeCx}" cy="${badgeCy}" r="18" />`);
    parts.push(`    <text class="sub-dataflow__badge-text" x="${badgeCx}" y="${badgeCy + 5}" text-anchor="middle">${i + 1}</text>`);
    parts.push(`    <rect class="sub-dataflow__box" x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="14" ry="14" />`);

    if (layout.hasFn) {
      const fnLabel = `fn ${s.fn}`;
      const pillX = boxX + 14;
      const pillY = boxY + 14;
      const pillW = Math.max(72, fnLabel.length * 7.4 + 20);
      parts.push(`    <rect class="sub-dataflow__fn-bg" x="${pillX}" y="${pillY}" width="${pillW}" height="20" rx="10" ry="10" />`);
      parts.push(`    <text class="sub-dataflow__fn-text" x="${pillX + 10}" y="${pillY + 14}">${htmlEscape(fnLabel)}</text>`);
    }

    const topUsed = layout.hasFn ? fnRowH : 0;
    const bottomUsed = layout.hasChips ? chipsRowH : 0;
    const textZoneH = boxH - topUsed - bottomUsed;
    const textBlockH = layout.lines.length * lineHeight;
    const textStartY = boxY + topUsed + (textZoneH - textBlockH) / 2 + lineHeight - 4;
    layout.lines.forEach((line, idx) => {
      parts.push(`    <text class="sub-dataflow__text" x="${boxX + boxW / 2}" y="${textStartY + idx * lineHeight}" text-anchor="middle">${htmlEscape(line)}</text>`);
    });

    if (layout.hasChips) {
      const chipY = boxY + boxH - 12;
      if (s.reads.length > 0) {
        const text = `← reads: ${s.reads.join(', ')}`;
        parts.push(`    <text class="sub-dataflow__chip sub-dataflow__chip--reads" x="${boxX + 14}" y="${chipY}">${htmlEscape(text)}</text>`);
      }
      if (s.writes.length > 0) {
        const text = `→ writes: ${s.writes.join(', ')}`;
        parts.push(`    <text class="sub-dataflow__chip sub-dataflow__chip--writes" x="${boxX + boxW - 14}" y="${chipY}" text-anchor="end">${htmlEscape(text)}</text>`);
      }
    }

    parts.push('  </g>');

    if (i < normalized.length - 1) {
      const aY = boxY + boxH + 6;
      const bY = aY + gap - 14;
      const x = boxX + boxW / 2;
      parts.push(`  <line class="sub-dataflow__arrow" x1="${x}" y1="${aY}" x2="${x}" y2="${bY}" marker-end="url(#sub-arrow)" />`);
    }
    cursorY += boxH + gap;
  });
  parts.push('</svg>');
  return parts.join('\n');
}

function wrapText(text, maxChars) {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) { current = word; continue; }
    if ((current.length + 1 + word.length) <= maxChars) current = `${current} ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  // Allow up to 4 lines so long error/rollback notes stay readable; the
  // surrounding viewport handles scroll/zoom for anything beyond.
  return lines.slice(0, 4);
}

function renderSubmodulePage({ feature, sub, outDir }) {
  const pageRel = pagePathFor('submodule', { featureSlug: feature.slug, submoduleSlug: sub.slug });
  const assetRel = relAssetPath(path.join(outDir, pageRel), outDir);
  const title = `${feature.title || feature.slug} · ${sub.slug}`;

  // Evidence data
  const fnEvidences = (sub.functions || []).map((fn) => fn.evidence || null);
  const varEvidences = (sub.variables || []).map((v) => v.evidence || null);
  const errEvidences = (sub.errors || []).map((e) => e.evidence || null);

  // Evidence summary
  const allComponents = [...(sub.functions || []), ...(sub.variables || []), ...(sub.errors || [])];
  const eviCounts = Object.fromEntries(EVIDENCE_LEVELS.map((l) => [l, 0]));
  let hasAnyEvidence = false;
  for (const c of allComponents) {
    if (c.evidence && c.evidence.level && eviCounts[c.evidence.level] !== undefined) {
      eviCounts[c.evidence.level]++;
      hasAnyEvidence = true;
    }
  }
  const eviSummaryParts = EVIDENCE_LEVELS.filter((l) => eviCounts[l] > 0).map((l) => `${eviCounts[l]} ${l}`);
  const evidenceSummaryHtml = hasAnyEvidence
    ? `<p class="submodule-evidence-summary">Evidence: ${eviSummaryParts.join(', ')}</p>`
    : '';

  const ioRows = (sub.functions || []).map((fn) => [fn.name, fn.in || '', fn.out || '', fn.side || '', fn.purpose || '']);
  const varRows = (sub.variables || []).map((v) => [v.name, v.type || '', v.scope || '', v.purpose || '']);
  const errRows = (sub.errors || []).map((e) => [e.name, e.when || '', e.means || '']);

  const body = `<body>
  <header class="submodule-header">
    <nav class="submodule-breadcrumb"><a href="../../index.html">← Atlas</a> · <a href="index.html">← ${htmlEscape(feature.title || feature.slug)}</a></nav>
    <h1>${htmlEscape(sub.slug)} <small class="submodule-kind submodule-kind--${htmlEscape(sub.kind)}">${htmlEscape(KIND_LABEL[sub.kind] || sub.kind)}</small></h1>
    ${sub.role ? `<p class="submodule-role">${htmlEscape(sub.role)}</p>` : ''}
    ${evidenceSummaryHtml}
  </header>
  <main class="submodule-main">
    <section class="sub-io" aria-label="Function I/O">
      <h2>Function I/O</h2>
      ${ioRows.length > 0
        ? renderSubmoduleTable(['Name', 'In', 'Out', 'Side', 'Purpose'], ioRows, fnEvidences)
        : '<p class="sub-section__empty">No functions recorded.</p>'}
    </section>
    <section class="sub-vars" aria-label="Variables">
      <h2>Variables</h2>
      ${varRows.length > 0
        ? renderSubmoduleTable(['Name', 'Type', 'Scope', 'Purpose'], varRows, varEvidences)
        : '<p class="sub-section__empty">No variables recorded.</p>'}
    </section>
    <section class="sub-dataflow" aria-label="Internal data flow">
      <h2>Internal data flow</h2>
      ${(sub.dataflow && sub.dataflow.length > 0)
        ? `<div class="sub-dataflow__canvas" data-pan-zoom-container>
        <div class="sub-dataflow__toolbar" role="toolbar" aria-label="Diagram controls">
          <button type="button" data-pan-zoom="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" data-pan-zoom="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" data-pan-zoom="fit" aria-label="Reset view">Fit</button>
        </div>
        <div class="sub-dataflow__viewport" data-pan-zoom-viewport>
          ${renderInternalDataflowSvg(sub.dataflow)}
        </div>
      </div>`
        : renderInternalDataflowSvg(sub.dataflow)}
    </section>
    <section class="sub-errors" aria-label="Errors">
      <h2>Errors</h2>
      ${errRows.length > 0
        ? renderSubmoduleTable(['Name', 'When', 'Means'], errRows, errEvidences)
        : '<p class="sub-section__empty">No errors recorded.</p>'}
    </section>
  </main>
  <script src="${assetRel}/viewer.client.js" defer></script>
</body>
</html>`;

  return `${head({ title, assetRel, pageKind: 'submodule' })}\n${body}\n`;
}

function copyAssets(outDir) {
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const srcCss = path.join(__dirname, 'assets', 'architecture.css');
  const srcJs = path.join(__dirname, 'assets', 'viewer.client.js');
  fs.copyFileSync(srcCss, path.join(assetsDir, 'architecture.css'));
  fs.copyFileSync(srcJs, path.join(assetsDir, 'viewer.client.js'));
}

// renderAll({outDir, state, scope?}) writes every page for the
// resolved state. When scope is provided, only the listed pages are
// emitted; this is how spec mode generates the proposed-after subset.
async function renderAll({ outDir, state, scope = null, removedPaths = [] }) {
  fs.mkdirSync(outDir, { recursive: true });
  copyAssets(outDir);

  const layout = await layoutMacro(state);

  const shouldEmit = (kind, slug, subSlug) => {
    if (!scope) return true;
    if (kind === 'macro') return scope.macro === true;
    if (kind === 'feature') return scope.features && scope.features.has(slug);
    if (kind === 'submodule') {
      return (scope.submodules || []).some((s) => s.feature === slug && s.submodule === subSlug);
    }
    return false;
  };

  const written = [];

  if (shouldEmit('macro')) {
    const html = renderMacro({ state, layout, outDir });
    const file = path.join(outDir, pagePathFor('macro'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html, 'utf8');
    written.push(pagePathFor('macro'));
  }

  for (const feature of state.features || []) {
    if (shouldEmit('feature', feature.slug)) {
      const html = renderFeaturePage({ feature, outDir });
      const file = path.join(outDir, pagePathFor('feature', { featureSlug: feature.slug }));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, html, 'utf8');
      written.push(pagePathFor('feature', { featureSlug: feature.slug }));
    }
    for (const sub of feature.submodules || []) {
      if (shouldEmit('submodule', feature.slug, sub.slug)) {
        const html = renderSubmodulePage({ feature, sub, outDir });
        const file = path.join(outDir, pagePathFor('submodule', { featureSlug: feature.slug, submoduleSlug: sub.slug }));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html, 'utf8');
        written.push(pagePathFor('submodule', { featureSlug: feature.slug, submoduleSlug: sub.slug }));
      }
    }
  }

  if (removedPaths && removedPaths.length > 0) {
    const lines = ['# Pages removed by this spec. Used by `apltk architecture diff`.', ...removedPaths];
    fs.writeFileSync(path.join(outDir, '_removed.txt'), `${lines.join('\n')}\n`, 'utf8');
  } else {
    const file = path.join(outDir, '_removed.txt');
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  // Full base render (no scope): sweep stale HTML so `apltk architecture
  // render` is a true refresh — old feature folders or renamed sub-modules
  // do not linger with the previous (broken) markup or styling.
  if (!scope) {
    sweepOrphanFeaturePages(outDir, state);
  } else {
    sweepScopedHtml(outDir, new Set(written.map((file) => file.split(path.sep).join('/'))));
  }

  return { written, layout };
}

function sweepScopedHtml(outDir, keepPaths) {
  function recurse(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const entry of entries) {
      if (entry.name === 'assets' || entry.name === 'atlas' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
        let remaining;
        try { remaining = fs.readdirSync(full); } catch (_e) { remaining = null; }
        if (remaining && remaining.length === 0) {
          fs.rmSync(full, { recursive: true, force: true });
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) continue;
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      if (!keepPaths.has(rel)) {
        fs.rmSync(full, { force: true });
      }
    }
  }

  recurse(outDir);
}

function sweepOrphanFeaturePages(outDir, state) {
  const featuresRoot = path.join(outDir, 'features');
  if (!fs.existsSync(featuresRoot)) return;
  const validFeatures = new Map();
  for (const f of state.features || []) {
    validFeatures.set(f.slug, new Set((f.submodules || []).map((s) => s.slug)));
  }
  let entries;
  try { entries = fs.readdirSync(featuresRoot, { withFileTypes: true }); } catch (_e) { return; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const featDir = path.join(featuresRoot, entry.name);
    if (!validFeatures.has(entry.name)) {
      fs.rmSync(featDir, { recursive: true, force: true });
      continue;
    }
    const wantedSubs = validFeatures.get(entry.name);
    let files;
    try { files = fs.readdirSync(featDir); } catch (_e) { continue; }
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.html')) continue;
      if (file === 'index.html') continue;
      const slug = file.slice(0, -5);
      if (!wantedSubs.has(slug)) {
        fs.rmSync(path.join(featDir, file), { force: true });
      }
    }
  }
}

function scopeFromDiff(diff) {
  const submodules = [];
  for (const item of diff.modifiedSubmodules || []) submodules.push(item);
  for (const item of diff.addedSubmodules || []) submodules.push(item);
  const features = new Set([...(diff.modifiedFeatures || []), ...(diff.addedFeatures || [])]);
  // If only a submodule changed but its feature isn't otherwise modified,
  // the feature index page does not need to re-emit. The submodule page
  // itself still needs the feature title/role for breadcrumb, which is
  // pulled from state at render time, so omitting the feature page is safe.
  return {
    macro: diff.macroChanged === true,
    features,
    submodules,
  };
}

function removedPagePathsFromDiff(diff) {
  const paths = [];
  for (const slug of diff.removedFeatures || []) {
    paths.push(pagePathFor('feature', { featureSlug: slug }));
  }
  for (const item of diff.removedSubmodules || []) {
    paths.push(pagePathFor('submodule', { featureSlug: item.feature, submoduleSlug: item.submodule }));
  }
  return paths;
}

module.exports = {
  KIND_LABEL,
  htmlEscape,
  pagePathFor,
  renderAll,
  renderMacro,
  renderFeaturePage,
  renderSubmodulePage,
  copyAssets,
  scopeFromDiff,
  removedPagePathsFromDiff,
};
