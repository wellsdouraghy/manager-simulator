// ============================================================================
// interact.js — ALL pointer interaction with the 3D scene: prop raycasting
// (mug, door) AND the screen pointer bridge.
//
// Why a bridge: Chromium (and Safari, worse) cannot hit-test DOM through the
// CSS3D perspective transform — panels PAINT correctly but native pointer
// events never reach them; clicks fall through to the canvas. Verified
// empirically: with any `perspective` in the chain, elementFromPoint misses
// every panel descendant; without it, it hits. So the panels are rendered
// pointer-events:none and the canvas catches everything. For each pointer
// event we raycast against the registered screen planes (scene.js `screens`
// entries carry anchor + px/world dims), convert the hit to panel-local px,
// pick the target element by LAYOUT geometry (offsetLeft/Top are unaffected
// by transforms), and dispatch synthetic pointer/click events. Hover is
// forwarded as a `.sim-hover` class + pointerover/out; wheel scrolls the
// scrollable under the point.
// ============================================================================

import * as THREE from 'three';

const HOVERABLE = 'button, .email-row, .deal-card, .invoice-card';

/**
 * @param {object} cfg
 * @param {object} cfg.world  Scene manager (.gl.domElement, .camera, .screens).
 * @param {Array<{object3D: THREE.Object3D, onClick: () => void}>} cfg.targets
 */
export function createInteract({ world, targets }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const canvas = world.gl.domElement;
  const camera = world.camera;
  const screens = world.screens;

  function setNdc(e) {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }

  // --- Screen-plane picking ----------------------------------------------------
  const _p0 = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _n = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _hit = new THREE.Vector3();
  const _d = new THREE.Vector3();

  /**
   * Raycast the cursor against every visible screen plane. Returns the
   * nearest `{ entry, px, py }` (panel-local CSS pixels) or null.
   */
  function screenHitAt(e) {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    let best = null;
    let bestT = Infinity;
    for (const s of screens) {
      if (s.dom.style.visibility === 'hidden' || s.dom.style.display === 'none') continue;
      s.anchor.getWorldPosition(_p0);
      s.anchor.getWorldQuaternion(_q);
      _n.set(0, 0, 1).applyQuaternion(_q);
      const denom = ray.direction.dot(_n);
      if (denom > -1e-6) continue; // back-facing or parallel
      const t = _d.copy(_p0).sub(ray.origin).dot(_n) / denom;
      if (t < 0 || t >= bestT) continue;
      _hit.copy(ray.direction).multiplyScalar(t).add(ray.origin);
      _d.copy(_hit).sub(_p0);
      _right.set(1, 0, 0).applyQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      const lx = _d.dot(_right);
      const ly = _d.dot(_up);
      const px = (lx / s.worldWidth + 0.5) * s.widthPx;
      const py = (0.5 - ly / s.worldHeight) * s.heightPx;
      if (px < 0 || px > s.widthPx || py < 0 || py > s.heightPx) continue;
      bestT = t;
      best = { entry: s, px, py };
    }
    return best;
  }

  // --- Layout-space element picking ---------------------------------------------
  // offsetLeft/Top/Width/Height are layout values, untouched by the CSS3D
  // transform — so we can find "the element under (px, py)" ourselves.
  function panelRectOf(el, panel) {
    let x = 0;
    let y = 0;
    let node = el;
    while (node && node !== panel) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent;
    }
    if (node !== panel) return null; // fixed/foreign offset chain — skip
    for (let p = el.parentElement; p && p !== panel; p = p.parentElement) {
      x -= p.scrollLeft;
      y -= p.scrollTop;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  // Only these are ever click/hover targets. Querying this focused set instead
  // of every node — and dropping the per-element getComputedStyle — is what
  // keeps the bridge cheap on each pointermove (the old '*' + style walk was
  // the cause of the mid-game frame hitch).
  const CLICKABLE =
    'button, .email-row, .deal-card, .invoice-card, .dial-stop, .dm-card,' +
    ' .dm-chip, .door-chip, .tug-overlay, .dial-overlay, [data-task-id]';

  /**
   * Deepest/last-painted clickable element of `panel` containing panel-local
   * (x, y), or the panel itself. Document order ≈ paint order for these flat
   * UIs, so the last match wins (a chip over the card that holds it).
   */
  function pickInPanel(panel, x, y) {
    let best = panel;
    for (const el of panel.querySelectorAll(CLICKABLE)) {
      if (el.offsetWidth === 0 && el.offsetHeight === 0) continue; // hidden
      const r = panelRectOf(el, panel);
      if (!r || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      best = el;
    }
    return best;
  }

  function targetAt(e) {
    const hit = screenHitAt(e);
    if (!hit) return null;
    return { el: pickInPanel(hit.entry.dom, hit.px, hit.py), hit };
  }

  // --- Synthetic event dispatch ----------------------------------------------------
  function fire(el, type, e) {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: e.pointerId ?? 1,
        pointerType: e.pointerType ?? 'mouse',
        button: e.button ?? 0,
      }),
    );
  }

  // --- Prop raycast (mug, door) ------------------------------------------------------
  function pickProp() {
    raycaster.setFromCamera(ndc, camera);
    let best = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const hits = raycaster.intersectObject(t.object3D, true);
      if (hits.length && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = t;
      }
    }
    return best;
  }

  // --- Canvas listeners ------------------------------------------------------------------
  let downTarget = null;

  canvas.addEventListener('pointerdown', (e) => {
    const t = targetAt(e);
    if (t) {
      downTarget = t.el;
      fire(t.el, 'pointerdown', e);
      return;
    }
    downTarget = null;
    setNdc(e);
    const hit = pickProp();
    if (hit) hit.onClick?.();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!downTarget) return;
    const t = targetAt(e);
    // pointerup goes to whatever we pressed (pointer-capture-lite: the tug
    // view must release even if the cursor slid off it).
    fire(downTarget, 'pointerup', e);
    // click only if the press and release agree.
    if (t && (t.el === downTarget || downTarget.contains(t.el) || t.el.contains(downTarget))) {
      fire(downTarget.contains(t.el) ? t.el : downTarget, 'click', e);
    }
    downTarget = null;
  });

  // --- Hover forwarding (throttled) -----------------------------------------------
  let hoverEl = null;
  let moveCount = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (++moveCount % 2 !== 0) return;
    const t = targetAt(e);
    const next = t ? t.el.closest(HOVERABLE) || t.el : null;
    if (next !== hoverEl) {
      if (hoverEl) {
        hoverEl.classList.remove('sim-hover');
        fire(hoverEl, 'pointerout', e);
      }
      if (next) {
        next.classList.add('sim-hover');
        fire(next, 'pointerover', e);
      }
      hoverEl = next;
    }
    if (t) {
      document.body.style.cursor = next && next.closest(HOVERABLE) ? 'pointer' : '';
    } else {
      setNdc(e);
      document.body.style.cursor = pickProp() ? 'pointer' : '';
    }
  });

  // --- Wheel → scroll the scrollable under the cursor --------------------------------
  canvas.addEventListener(
    'wheel',
    (e) => {
      const t = targetAt(e);
      if (!t) return;
      let el = t.el;
      while (el && el !== t.hit.entry.dom.parentElement) {
        const cs = getComputedStyle(el);
        if (
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        ) {
          el.scrollTop += e.deltaY;
          e.preventDefault();
          return;
        }
        el = el.parentElement;
      }
    },
    { passive: false },
  );

  return { pick: pickProp, screenHitAt, pickInPanel, targetAt };
}
