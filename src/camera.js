// ============================================================================
// camera.js — the seated first-person rig. The camera never moves; the whole
// game is where you're looking. Three layers of motion:
//   (a) head-follow: yaw/pitch ease toward a small cursor-driven offset
//   (b) edge pan: cursor in the outer 6% of the screen pans continuously
//   (c) station tweens: keys snap-tween the base framing to a station
// Plus a subtle idle breathing bob. Shake/bob respect prefers-reduced-motion.
// ============================================================================

import * as THREE from 'three';
import { BASE_FOV, EYE_HEIGHT } from './world/scene.js';

const deg = THREE.MathUtils.degToRad;

/**
 * Station framings. Yaw is degrees turning RIGHT from the main monitor,
 * matching the spec's layout; pitch is degrees up. camera.rotation.y is the
 * negation (Three.js +Y rotation turns left). Each station has a "lean-in"
 * fov so its screen is actually readable; panning away eases back out to
 * the wide room view.
 */
export const STATIONS = [
  { key: 'phone', yaw: -45, pitch: -22, fov: 40 },
  { key: 'inbox', yaw: 0, pitch: -3, fov: 42 },
  { key: 'deals', yaw: 40, pitch: -5, fov: 44 },
  { key: 'door', yaw: 130, pitch: 2, fov: 46 },
];

const YAW_MIN = -62; // a little past the phone
const YAW_MAX = 141; // the door limit
const PITCH_MIN = -25;
const PITCH_MAX = 25;

// The mouse only glances AROUND the current station (bounded parallax); it
// never travels far enough to reach another station. Switching screens is
// keys 1–4 / A–D only. Kept well under the ~40° gap between stations.
const HEAD_FOLLOW_YAW = 12; // max degrees of cursor look-around
const HEAD_FOLLOW_PITCH = 8;
const TWEEN_DURATION = 0.35;
const SHAKE_NO_DUR = 0.5; // "no" head-shake length (seconds)
const SHAKE_NO_AMP = 7; // degrees of yaw wobble

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function createCameraRig(camera) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const inbox = STATIONS.find((s) => s.key === 'inbox');
  const state = {
    baseYaw: inbox.yaw,
    basePitch: inbox.pitch,
    stationKey: 'inbox',
    // head-follow offset (eased toward cursor)
    offYaw: 0,
    offPitch: 0,
    // cursor in NDC (-1..1, +y up); null until first move
    ndcX: 0,
    ndcY: 0,
    // active tween or null
    tween: null,
    // when locked (e.g. "quick call"), station input is refused
    lockedTo: null,
    lockReason: null, // why you can't leave (shown when you try)
    elapsed: 0,
    // "no" head-shake when you try to navigate while locked: a decaying yaw
    // wobble. t counts up to SHAKE_DUR.
    shakeNo: 0,
    // transient FOV kick for juice (deal close, coffee); decays to 0
    fovKick: 0,
    // Last Stand pass-out: a one-shot slump tween that overrides framing +
    // eye height and holds until unslump(). { t } while easing, then held.
    slump: null,
  };

  // --- Input ------------------------------------------------------------------
  window.addEventListener('mousemove', (e) => {
    state.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
    state.ndcY = -((e.clientY / window.innerHeight) * 2 - 1);
  });
  document.addEventListener('mouseleave', () => {
    state.ndcX = 0;
    state.ndcY = 0;
  });

  function stationIndex() {
    return STATIONS.findIndex((s) => s.key === state.stationKey);
  }

  let onLockedNav = null; // main wires this to show the "why you can't" message

  function isNavKey(e) {
    return (
      '1234'.includes(e.key) ||
      ['a', 'A', 'd', 'D', 'ArrowLeft', 'ArrowRight'].includes(e.key)
    );
  }

  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    // Locked (on a call / walking with the boss): refuse to leave — shake the
    // head "no" and tell them why, instead of silently ignoring the key.
    if (state.lockedTo) {
      if (isNavKey(e)) refuseNav();
      return;
    }
    const idx = '1234'.indexOf(e.key);
    if (idx >= 0) return goTo(STATIONS[idx].key);
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      return goTo(STATIONS[Math.max(0, stationIndex() - 1)].key);
    }
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      return goTo(STATIONS[Math.min(STATIONS.length - 1, stationIndex() + 1)].key);
    }
  });

  // A refused navigation while locked: a "no" head-shake + the reason message.
  function refuseNav() {
    if (!reducedMotion) state.shakeNo = 0.0001; // kick off the wobble
    onLockedNav?.(state.lockReason);
  }

  // --- Station tween -------------------------------------------------------------
  function goTo(key) {
    const target = STATIONS.find((s) => s.key === key);
    if (!target) return;
    // A station move always clears a pass-out slump (RUN IT BACK path).
    state.slump = null;
    state.stationKey = key;
    state.tween = {
      fromYaw: state.baseYaw,
      fromPitch: state.basePitch,
      toYaw: target.yaw,
      toPitch: target.pitch,
      t: 0,
    };
  }

  /** Lock the camera to a station (quick call, boss walk). `reason` is shown
   *  if the player tries to navigate away. */
  function lock(key, reason = null) {
    state.lockedTo = key;
    state.lockReason = reason;
    goTo(key);
  }
  function unlock() {
    state.lockedTo = null;
    state.lockReason = null;
  }

  // --- Per-frame -------------------------------------------------------------------
  // Uses real (unscaled) dt: your neck is not affected by coffee slow-mo.
  const SLUMP_DUR = 1.2;
  const SLUMP_PITCH = -55; // look down at the desk
  const SLUMP_Y = 0.85; // head drops toward the desk

  function update(dt) {
    state.elapsed += dt;

    // Pass-out slump overrides everything: ease pitch down + head down, then
    // hold until unslump(). Runs on real dt (main.js drives rig on rawDt).
    if (state.slump) {
      const s = state.slump;
      s.t = Math.min(1, s.t + dt / SLUMP_DUR);
      const k = easeInOutCubic(s.t);
      const pitch = THREE.MathUtils.lerp(s.fromPitch, SLUMP_PITCH, k);
      const yaw = s.fromYaw; // keep facing where we were
      camera.rotation.y = -deg(yaw);
      camera.rotation.x = deg(pitch);
      camera.position.y = THREE.MathUtils.lerp(s.fromY, SLUMP_Y, k);
      return;
    }

    // (c) station tween — the ONLY thing that moves the base framing. There is
    // no edge-pan: the mouse can't roam the room or reach another station, it
    // only glances around the current one (head-follow below). Screens switch
    // on keys 1–4 / A–D.
    if (state.tween) {
      const tw = state.tween;
      tw.t = Math.min(1, tw.t + dt / TWEEN_DURATION);
      const k = easeInOutCubic(tw.t);
      state.baseYaw = THREE.MathUtils.lerp(tw.fromYaw, tw.toYaw, k);
      state.basePitch = THREE.MathUtils.lerp(tw.fromPitch, tw.toPitch, k);
      if (tw.t >= 1) state.tween = null;
    }

    // (a) head-follow — eased toward the cursor; a bounded glance around the
    // current station. Parallax, so reduced-motion users get a still head.
    const followYaw = reducedMotion || state.lockedTo ? 0 : state.ndcX * HEAD_FOLLOW_YAW;
    const followPitch =
      reducedMotion || state.lockedTo ? 0 : state.ndcY * HEAD_FOLLOW_PITCH;
    const ease = 1 - Math.exp(-6 * dt);
    state.offYaw += (followYaw - state.offYaw) * ease;
    state.offPitch += (followPitch - state.offPitch) * ease;

    // idle breathing bob
    const bobY = reducedMotion ? 0 : Math.sin(state.elapsed * 1.7) * 0.005;

    // "no" head-shake: a quick decaying yaw wobble layered on top when you try
    // to leave a locked station.
    let shakeYaw = 0;
    if (state.shakeNo > 0) {
      state.shakeNo += dt;
      if (state.shakeNo >= SHAKE_NO_DUR) {
        state.shakeNo = 0;
      } else {
        const p = state.shakeNo / SHAKE_NO_DUR;
        shakeYaw = Math.sin(p * Math.PI * 6) * SHAKE_NO_AMP * (1 - p);
      }
    }

    camera.rotation.y = -deg(state.baseYaw + state.offYaw + shakeYaw);
    camera.rotation.x = deg(
      THREE.MathUtils.clamp(state.basePitch + state.offPitch, PITCH_MIN, PITCH_MAX),
    );
    camera.position.y = EYE_HEIGHT + bobY;

    // FOV: lean in while framed on the current station, ease wide otherwise.
    const st = STATIONS.find((s) => s.key === state.stationKey);
    const nearStation =
      Math.abs(state.baseYaw - st.yaw) < 18 && Math.abs(state.basePitch - st.pitch) < 14;
    const targetFov = (nearStation ? st.fov : BASE_FOV) + state.fovKick;
    state.fovKick *= Math.exp(-8 * dt);
    const nextFov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-5 * dt));
    if (Math.abs(nextFov - camera.fov) > 0.01) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
  }

  /** Juice hook: transient FOV punch (negative = zoom-in hit). */
  function punchFov(amount) {
    state.fovKick = amount;
  }

  /** Last Stand pass-out: slump the head down onto the desk over ~1.2s and
   * hold. Locks input; unslump() (or goTo via a reset) restores it. */
  function slump() {
    state.lockedTo = 'passout';
    state.tween = null;
    state.slump = {
      t: 0,
      fromYaw: state.baseYaw,
      fromPitch: state.basePitch,
      fromY: camera.position.y,
    };
  }
  function unslump() {
    state.slump = null;
    state.lockedTo = null;
  }

  return {
    update,
    goTo,
    lock,
    unlock,
    punchFov,
    slump,
    unslump,
    refuseNav,
    set onLockedNav(fn) {
      onLockedNav = fn || null;
    },
    get station() {
      return state.stationKey;
    },
    get isLocked() {
      return state.lockedTo !== null;
    },
    // True while a station tween or the pass-out slump is animating. The CSS3D
    // panels distort at the oblique transforms a sweep passes through (tiny
    // panel scale → matrix precision breaks down), so the renderer hides them
    // while this is true and pops them back on arrival.
    get isTweening() {
      return state.tween !== null || state.slump !== null;
    },
    reducedMotion,
  };
}
