// ============================================================================
// coffee.js — the mug. 3 charges/run. Clicking the mug (wired via interact.js)
// drinks: burnout −10 and 3.0 REAL-seconds of slow-mo (eases G.timeScale down
// to 0.4, holds, eases back to 1). Slow-mo makes tasks/timers crawl but the
// camera/DOM keep real time — negotiation and the door maintenance shake get
// legitimately easier while it's active, which is the point.
//
// All timing here is real (rawDt) and driven from main.js's per-frame hook, so
// it's pause-safe and never touches wall-clock.
// ============================================================================

import * as THREE from 'three';

const MAX_CHARGES = 4; // start at 3, intern can top to 4
const START_CHARGES = 3;

// Slow-mo envelope (real seconds).
const SLOW_SCALE = 0.4;
const EASE_IN = 0.15;
const HOLD = 3.0; // "3.0 real-seconds of slow-mo" — the hold is the headline
const EASE_OUT = 0.4;
const TOTAL = EASE_IN + HOLD + EASE_OUT;

const BURNOUT_RELIEF = 10;
const VIGNETTE_PEAK = 0.5;

// Mug fill geometry (local to the mug group; mirrors desk.js).
const FILL_TOP_Y = 0.1; // full coffee sits here
const FILL_BOTTOM_Y = 0.052; // near-empty sits low in the cup

export function createCoffee({ G, meters, rig, juice, desk, hud, content }) {
  const copy = content?.COFFEE || {};
  const coffeeFill = desk.coffeeFill;
  const mug = desk.mugMesh; // the cup cylinder (for world-space steam origin)

  const state = {
    charges: START_CHARGES,
    slow: null, // { t } while a slow-mo is active
  };

  // --- HUD pip row (bottom-right, running-only) ------------------------------
  const pips = document.createElement('div');
  pips.className = 'hud-coffee';
  hud.appendChild(pips);

  const label = document.createElement('span');
  label.className = 'coffee-label';
  label.textContent = copy.hudLabel || '';
  pips.appendChild(label);

  const pipRow = document.createElement('span');
  pipRow.className = 'coffee-pips';
  pips.appendChild(pipRow);

  function renderPips() {
    pipRow.innerHTML = '';
    for (let i = 0; i < state.charges; i++) {
      const s = document.createElement('span');
      s.className = 'coffee-pip';
      s.textContent = '☕';
      pipRow.appendChild(s);
    }
  }

  // --- Mug fill visual -------------------------------------------------------
  // 3+ charges → full; 0 → bottom. Drop the fill down and shrink it as it
  // empties. Scale by remaining fraction of the *starting* 3.
  function renderFill() {
    const frac = Math.max(0, Math.min(1, state.charges / START_CHARGES));
    coffeeFill.position.y = THREE.MathUtils.lerp(FILL_BOTTOM_Y, FILL_TOP_Y, frac);
    // Never fully vanish — a dry mug still shows a dark disc at the bottom.
    coffeeFill.scale.y = 0.35 + 0.65 * frac;
    coffeeFill.visible = true;
  }

  // --- Steam particles (world-space, built here, added to scene on drink) ----
  let steam = null; // { points, life, vel:[], geom, mat }

  function spawnSteam() {
    if (juice?.reducedMotion) return; // steam is pure juice
    if (steam) removeSteam();
    const count = 14;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const vel = [];
    // Mug rim in world space.
    const rim = new THREE.Vector3();
    mug.getWorldPosition(rim);
    rim.y += 0.06; // just above the rim
    for (let i = 0; i < count; i++) {
      positions[i * 3] = rim.x + (Math.random() - 0.5) * 0.03;
      positions[i * 3 + 1] = rim.y + Math.random() * 0.02;
      positions[i * 3 + 2] = rim.z + (Math.random() - 0.5) * 0.03;
      vel.push({
        x: (Math.random() - 0.5) * 0.02,
        y: 0.08 + Math.random() * 0.05,
        z: (Math.random() - 0.5) * 0.02,
      });
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.018,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    points.renderOrder = 999;
    if (!sceneRef) resolveScene();
    if (sceneRef) sceneRef.add(points);
    steam = { points, life: 0, ttl: 1.2, vel, geom, mat, positions };
  }

  function removeSteam() {
    if (!steam) return;
    steam.points.parent?.remove(steam.points);
    steam.geom.dispose();
    steam.mat.dispose();
    steam = null;
  }

  function updateSteam(rawDt) {
    if (!steam) return;
    steam.life += rawDt;
    const arr = steam.positions;
    for (let i = 0; i < steam.vel.length; i++) {
      arr[i * 3] += steam.vel[i].x * rawDt;
      arr[i * 3 + 1] += steam.vel[i].y * rawDt;
      arr[i * 3 + 2] += steam.vel[i].z * rawDt;
    }
    steam.geom.attributes.position.needsUpdate = true;
    steam.mat.opacity = 0.5 * Math.max(0, 1 - steam.life / steam.ttl);
    if (steam.life >= steam.ttl) removeSteam();
  }

  // Scene handle so we can add/remove steam. Set by main.js after construction
  // isn't needed — desk lives in world.scene; we grab it off the fill's root.
  let sceneRef = null;
  function resolveScene() {
    let o = coffeeFill;
    while (o.parent) o = o.parent;
    sceneRef = o.isScene ? o : null;
  }
  resolveScene();

  // --- Drink -----------------------------------------------------------------
  function toast(text, kind) {
    // The mug has no panel of its own; reuse the phone toast surface if desk
    // exposes one? It doesn't — so we surface a tiny HUD toast near the pips.
    const t = document.createElement('div');
    t.className = `coffee-toast ${kind || ''}`.trim();
    t.textContent = text;
    pips.appendChild(t);
    t.addEventListener('animationend', (e) => {
      if (e.animationName === 'coffeeToastOut') t.remove();
    });
  }

  function drink() {
    if (state.slow) return; // one slow-mo at a time
    if (state.charges <= 0) {
      toast(copy.dryMug || 'the mug is empty.', 'bad');
      juice?.shake?.(0.006, 0.2);
      return;
    }
    state.charges -= 1;
    if (meters?.stats) meters.stats.coffees = (meters.stats.coffees || 0) + 1;
    meters.addBurnout(-BURNOUT_RELIEF);
    renderPips();
    renderFill();
    spawnSteam();
    rig.punchFov(-6);
    juice?.setVignette?.(VIGNETTE_PEAK);
    juice?.sound?.coffeeSlurp?.();
    state.slow = { t: 0 };
    // Per-charge toast: index of the charge just consumed (0-based from full).
    const consumedIndex = START_CHARGES - 1 - state.charges; // 0 for first sip
    const lines = copy.charges || [];
    const line = lines[Math.min(consumedIndex, lines.length - 1)];
    if (line) toast(line, 'good');
  }

  function addCharge() {
    state.charges = Math.min(MAX_CHARGES, state.charges + 1);
    renderPips();
    renderFill();
    if (copy.refill) toast(copy.refill, 'good');
  }

  // --- Slow-mo envelope + per-frame ------------------------------------------
  // Drives G.timeScale and the vignette fade on real dt.
  function update(rawDt) {
    updateSteam(rawDt);

    if (!state.slow) return;
    state.slow.t += rawDt;
    const t = state.slow.t;
    let scale;
    let vig;
    if (t < EASE_IN) {
      const k = t / EASE_IN;
      scale = THREE.MathUtils.lerp(1, SLOW_SCALE, k);
      vig = THREE.MathUtils.lerp(0, VIGNETTE_PEAK, k);
    } else if (t < EASE_IN + HOLD) {
      scale = SLOW_SCALE;
      vig = VIGNETTE_PEAK;
    } else if (t < TOTAL) {
      const k = (t - EASE_IN - HOLD) / EASE_OUT;
      scale = THREE.MathUtils.lerp(SLOW_SCALE, 1, k);
      vig = THREE.MathUtils.lerp(VIGNETTE_PEAK, 0, k);
    } else {
      scale = 1;
      vig = 0;
      state.slow = null;
    }
    G.timeScale = scale;
    juice?.setVignette?.(vig);
  }

  function reset() {
    state.charges = START_CHARGES;
    state.slow = null;
    G.timeScale = 1;
    removeSteam();
    renderPips();
    renderFill();
  }

  // Initial paint.
  renderPips();
  renderFill();

  return {
    drink,
    addCharge,
    update,
    reset,
    get charges() {
      return state.charges;
    },
    get inSlowMo() {
      return !!state.slow;
    },
  };
}
