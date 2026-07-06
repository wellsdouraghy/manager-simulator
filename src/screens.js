// ============================================================================
// screens.js — CSS3D panel factory. Channels build their UIs inside panels
// created here; scene.registerScreen() maps them onto the 3D screen faces.
// ============================================================================

/**
 * Creates a bare screen panel element. The caller fills it with channel UI;
 * scene.registerScreen() sets its px dimensions and mounts it in 3D.
 *
 * @param {string} name  For debugging/data attributes.
 * @param {string} [extraClass]
 */
export function createScreenPanel(name, extraClass = '') {
  const el = document.createElement('div');
  el.className = `screen-panel ${extraClass}`.trim();
  el.dataset.screen = name;
  return el;
}

/**
 * Slice-1 placeholder content: a title card plus corner dots proving the
 * panel stays pixel-aligned with its bezel through tweens and resizes.
 */
export function fillPlaceholder(el, { title, sub }) {
  el.innerHTML = `
    <div class="corner-dot tl"></div>
    <div class="corner-dot tr"></div>
    <div class="corner-dot bl"></div>
    <div class="corner-dot br"></div>
    <div class="panel-placeholder">
      <div class="panel-title"></div>
      <div class="panel-sub"></div>
    </div>
  `;
  el.querySelector('.panel-title').textContent = title;
  el.querySelector('.panel-sub').textContent = sub;
}
