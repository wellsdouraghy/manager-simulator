// ============================================================================
// attention.js — station attention cues. Two layers:
//   (1) a bobbing low-poly gold "!" floating in 3D above each station that has
//       pending tasks (flat-shaded boxes, desk.js's material language);
//   (2) screen-space edge arrows in the HUD when a station with pending tasks
//       is off-view, with a badge count.
// Urgent (any task under 25% ttl) turns the "!" and the arrow red and pulses.
// Respects prefers-reduced-motion: static markers, no bob/pulse.
// ============================================================================

import * as THREE from 'three';
import { PALETTE } from './content.js';

const mat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// Fraction of the viewport (from center) inside which a station counts as
// "on screen" — outside this, we show an edge arrow. Generous, because the
// per-station FOV lean-in pushes markers toward the frame edges.
const ON_SCREEN_FRAC = 0.9;

/**
 * @param {object} cfg
 * @param {THREE.Scene} cfg.scene   WebGL scene to add the 3D markers to.
 * @param {THREE.Camera} cfg.camera
 * @param {HTMLElement} cfg.hud     HUD layer for the edge arrows.
 * @param {Array<{key,worldPos:THREE.Vector3}>} cfg.stations  Marker anchors.
 * @param {(key:string) => boolean} [cfg.isFocused]  True when the player is
 *   already framed on this station — its cues are pure noise then.
 */
export function createAttention({ scene, camera, hud, stations, isFocused }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- 3D bang markers -------------------------------------------------------
  function buildBang() {
    const g = new THREE.Group();
    const gold = mat(PALETTE.gold);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.09, 0.032), gold);
    stem.position.y = 0.035;
    g.add(stem);
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.032), gold);
    dot.position.y = -0.05;
    g.add(dot);
    g.visible = false;
    return { group: g, stem, dot, gold };
  }

  // Station → the number key you press to go there (matches camera.js STATIONS
  // order: phone 1, inbox 2, deals 3, door 4). The edge arrow leads with this
  // keycap so the number reads as "press this key", not "N tasks".
  const STATION_KEY_NUMBER = { phone: 1, inbox: 2, deals: 3, door: 4 };

  const markers = stations.map((s) => {
    const bang = buildBang();
    bang.group.position.copy(s.worldPos);
    scene.add(bang.group);
    // Edge arrow (HUD DOM): a keycap of the key to press + a "N new" count.
    const arrow = document.createElement('div');
    arrow.className = 'attn-arrow';
    arrow.hidden = true;
    arrow.innerHTML =
      `<span class="attn-tip"></span>` +
      `<kbd class="attn-key">${STATION_KEY_NUMBER[s.key] ?? '?'}</kbd>` +
      `<span class="attn-count"></span>`;
    hud.appendChild(arrow);
    return {
      key: s.key,
      worldPos: s.worldPos.clone(),
      bang,
      arrow,
      countEl: arrow.querySelector('.attn-count'),
      count: 0,
      urgent: false,
    };
  });

  const _v = new THREE.Vector3();
  const _invQuat = new THREE.Quaternion();

  /**
   * @param {(key:string) => {count:number, urgent:boolean}} query  Returns the
   *   pending count and urgency for a station key.
   */
  function update(dt, query) {
    const t = performance.now() / 1000;
    for (const m of markers) {
      const { count, urgent } = query(m.key) || { count: 0, urgent: false };
      m.count = count;
      m.urgent = urgent;
      const focused = isFocused?.(m.key) ?? false;

      // (1) 3D bang — hidden while the player is framed on this station;
      // the panel itself is already showing the work.
      const show = count > 0 && !focused;
      m.bang.group.visible = show;
      if (show) {
        const color = urgent ? PALETTE.urgent : PALETTE.gold;
        m.bang.gold.color.set(color);
        if (!reducedMotion) {
          const bob = Math.sin(t * 3 + m.worldPos.x) * 0.05;
          m.bang.group.position.y = m.worldPos.y + bob;
          const pulse = urgent ? 1 + Math.sin(t * 10) * 0.12 : 1;
          m.bang.group.scale.setScalar(pulse);
        } else {
          m.bang.group.position.y = m.worldPos.y;
          m.bang.group.scale.setScalar(1);
        }
      }

      // (2) edge arrow — direction in VIEW space (never the screen projection,
      // which is singular near ±90° and can flip the arrow the wrong way). We
      // put the marker into camera space: +x right, +y up, forward is -z. Then
      // (x, y) is the on-screen direction toward it, correct at ANY angle,
      // in front or behind.
      _invQuat.copy(camera.quaternion).invert();
      _v.copy(m.worldPos).sub(camera.position).applyQuaternion(_invQuat);
      const inFront = _v.z < 0;
      const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
      const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
      const hAng = Math.atan2(_v.x, -_v.z); // yaw offset from centre
      const vAng = Math.atan2(_v.y, -_v.z); // pitch offset from centre
      const onScreen =
        inFront &&
        Math.abs(hAng) < halfH * ON_SCREEN_FRAC &&
        Math.abs(vAng) < halfV * ON_SCREEN_FRAC;

      if (count > 0 && !onScreen && !focused) {
        m.arrow.hidden = false;
        m.countEl.textContent = count === 1 ? '1 new' : `${count} new`;
        m.arrow.classList.toggle('urgent', urgent);

        // Screen-space direction toward the station (y up). Robust in all cases.
        const dx = _v.x;
        const dy = _v.y;
        const ang = Math.atan2(dy, dx);
        const marginX = 46; // px from edge
        const marginY = 46;
        const halfW = window.innerWidth / 2 - marginX;
        const halfH = window.innerHeight / 2 - marginY;
        // Scale the unit vector out to the rectangle edge.
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        const scale = Math.min(
          halfW / Math.max(Math.abs(cx), 1e-3),
          halfH / Math.max(Math.abs(cy), 1e-3),
        );
        const px = window.innerWidth / 2 + cx * scale;
        const py = window.innerHeight / 2 - cy * scale; // screen y is flipped
        m.arrow.style.left = `${px}px`;
        m.arrow.style.top = `${py}px`;
        // Point the arrow tip outward (toward the station).
        m.arrow.style.setProperty('--attn-rot', `${(-ang * 180) / Math.PI}deg`);
      } else {
        m.arrow.hidden = true;
      }
    }
  }

  function reset() {
    for (const m of markers) {
      m.bang.group.visible = false;
      m.arrow.hidden = true;
    }
  }

  return { update, reset, markers };
}
