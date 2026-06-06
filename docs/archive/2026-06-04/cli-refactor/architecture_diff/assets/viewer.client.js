/* viewer.client.js — pan/zoom for every atlas SVG on the page.
 *
 * Each `[data-pan-zoom-viewport]` element gets its own state and
 * handlers, so a single page can host the macro atlas SVG AND
 * sub-module-internal dataflow SVGs simultaneously. Toolbar buttons
 * (`[data-pan-zoom="zoom-in|zoom-out|fit"]`) are scoped to the
 * containing `[data-pan-zoom-container]` (falls back to the viewport's
 * direct parent), so multiple toolbars on one page do not collide.
 * Keyboard shortcuts (`←` / `→` / `↑` / `↓` / `+` / `−` / `0`) drive
 * the page's first viewport — the "primary" diagram of that page
 * (macro SVG on `index.html`; sub-dataflow SVG on a sub-module page).
 */

(function () {
  'use strict';

  const viewports = Array.from(document.querySelectorAll('[data-pan-zoom-viewport]'));
  const controllers = viewports.map(setupViewport).filter(Boolean);
  if (controllers.length === 0) return;

  const primary = controllers[0];
  document.addEventListener('keydown', function (evt) {
    if (evt.target && (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA')) return;
    if (evt.key === 'ArrowLeft') { primary.pan(-1, 0); }
    else if (evt.key === 'ArrowRight') { primary.pan(1, 0); }
    else if (evt.key === 'ArrowUp') { primary.pan(0, -1); }
    else if (evt.key === 'ArrowDown') { primary.pan(0, 1); }
    else if (evt.key === '+' || evt.key === '=') { primary.zoom(1 / 1.2); }
    else if (evt.key === '-' || evt.key === '_') { primary.zoom(1.2); }
    else if (evt.key === '0') { primary.fit(); }
  });

  function setupViewport(viewport) {
    const svg = viewport.querySelector('[data-atlas-svg]');
    if (!svg) return null;
    const initial = svg.getAttribute('viewBox');
    if (!initial) return null;
    const [ix, iy, iw, ih] = initial.split(/\s+/).map(Number);
    const state = { x: ix, y: iy, w: iw, h: ih };

    function apply() {
      svg.setAttribute('viewBox', `${state.x} ${state.y} ${state.w} ${state.h}`);
    }
    function fit() {
      state.x = ix; state.y = iy; state.w = iw; state.h = ih;
      apply();
    }
    function zoom(factor, cx, cy) {
      const newW = Math.max(40, Math.min(state.w * factor, iw * 8));
      const newH = newW * (state.h / state.w);
      if (cx == null) { cx = state.x + state.w / 2; cy = state.y + state.h / 2; }
      state.x = cx - (cx - state.x) * (newW / state.w);
      state.y = cy - (cy - state.y) * (newH / state.h);
      state.w = newW;
      state.h = newH;
      apply();
    }
    function pan(dirX, dirY) {
      const stepX = state.w * 0.08;
      const stepY = state.h * 0.08;
      state.x += dirX * stepX;
      state.y += dirY * stepY;
      apply();
    }
    function clientToSvg(evt) {
      const rect = svg.getBoundingClientRect();
      const xRatio = (evt.clientX - rect.left) / rect.width;
      const yRatio = (evt.clientY - rect.top) / rect.height;
      return { x: state.x + xRatio * state.w, y: state.y + yRatio * state.h };
    }

    // The diagram viewport owns the wheel gesture entirely: ANY wheel
    // event that lands inside the viewport is consumed so the host page
    // never scrolls underneath the user. The wheel zooms the SVG around
    // the cursor; trackpad pinch-zoom (which arrives as ctrlKey wheel
    // on macOS) is treated the same way for a single predictable model.
    viewport.addEventListener('wheel', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      const absX = Math.abs(evt.deltaX);
      const absY = Math.abs(evt.deltaY);
      if (absX < 0.5 && absY < 0.5) return;
      const factor = evt.deltaY > 0 ? 1.08 : 1 / 1.08;
      const pt = clientToSvg(evt);
      zoom(factor, pt.x, pt.y);
    }, { passive: false });

    // Drag-pan: defer the pointer capture (and the "is-grabbing" class)
    // until the pointer actually moves past a small threshold. Without
    // this, a single click on an SVG <a> (sub-module link) would be
    // captured by the viewport and never reach the link.
    const DRAG_THRESHOLD_PX = 4;
    let pending = null;
    let dragging = null;
    viewport.addEventListener('pointerdown', function (evt) {
      if (evt.button !== 0) return;
      pending = { x: evt.clientX, y: evt.clientY, pointerId: evt.pointerId };
    });
    viewport.addEventListener('pointermove', function (evt) {
      if (!dragging && pending && pending.pointerId === evt.pointerId) {
        const dx = evt.clientX - pending.x;
        const dy = evt.clientY - pending.y;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        dragging = { x: pending.x, y: pending.y, pointerId: pending.pointerId };
        pending = null;
        viewport.classList.add('is-grabbing');
        try { viewport.setPointerCapture(dragging.pointerId); } catch (e) { /* ignore */ }
      }
      if (!dragging || dragging.pointerId !== evt.pointerId) return;
      evt.preventDefault();
      const rect = svg.getBoundingClientRect();
      const dx = ((evt.clientX - dragging.x) / rect.width) * state.w;
      const dy = ((evt.clientY - dragging.y) / rect.height) * state.h;
      state.x -= dx;
      state.y -= dy;
      dragging.x = evt.clientX;
      dragging.y = evt.clientY;
      apply();
    });
    function endDrag(evt) {
      pending = null;
      if (!dragging) return;
      const draggedId = dragging.pointerId;
      dragging = null;
      viewport.classList.remove('is-grabbing');
      try { viewport.releasePointerCapture(draggedId); } catch (e) { /* ignore */ }
      // Suppress the synthetic click that would follow a drag-release
      // on top of a sub-module <a>; only the no-movement case should
      // navigate.
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      viewport.addEventListener('click', swallow, { capture: true, once: true });
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('pointerleave', endDrag);

    const container = viewport.closest('[data-pan-zoom-container]') || viewport.parentElement || document;
    container.querySelectorAll('[data-pan-zoom="zoom-in"]').forEach((btn) => btn.addEventListener('click', () => zoom(1 / 1.2)));
    container.querySelectorAll('[data-pan-zoom="zoom-out"]').forEach((btn) => btn.addEventListener('click', () => zoom(1.2)));
    container.querySelectorAll('[data-pan-zoom="fit"]').forEach((btn) => btn.addEventListener('click', fit));

    return { zoom, fit, pan };
  }
})();
