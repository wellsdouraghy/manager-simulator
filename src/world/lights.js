// ============================================================================
// lights.js — golden-hour key light through the window + screen-glow lights.
// No shadow maps: the light shafts in room.js fake the blinds, and the
// screens glow with small point lights. Cheap and warm.
// ============================================================================

import * as THREE from 'three';

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3[]} screenGlowPositions  World positions just in
 *   front of each screen face; each gets a warm point light.
 */
export function addLights(scene, screenGlowPositions = []) {
  // Warm afternoon sun raking in from the window on the left (-X) wall.
  const key = new THREE.DirectionalLight(0xffdcb0, 1.15);
  key.position.set(-4, 3.2, -1.2);
  key.target.position.set(0.4, 0.7, -0.6);
  scene.add(key, key.target);

  // Bright warm fill so the bright-office look holds in the shadows too
  // (the room used to read dark/scary — this lifts every unlit face).
  const hemi = new THREE.HemisphereLight(0xfff3e2, 0xd8c5a8, 1.05);
  scene.add(hemi);

  // Soft warm bounce from behind the player so the door wall isn't a void —
  // the door has to read instantly when a walk-in knocks.
  const bounce = new THREE.PointLight(0xffd9b0, 12, 8, 2);
  bounce.position.set(1.3, 2.4, 1.7);
  scene.add(bounce);

  // Screen glow — the monitors/phone are the room's main light sources.
  const glows = screenGlowPositions.map((pos) => {
    const light = new THREE.PointLight(0xcfe4ff, 1.4, 1.6, 2);
    light.position.copy(pos);
    scene.add(light);
    return light;
  });

  // --- Time-of-day arc -------------------------------------------------------
  // The sun visibly crosses the day: bright warm morning → deep golden-hour
  // evening, sinking lower and going orange as 6 PM nears. Driven from G.dayT.
  const MORNING = {
    color: new THREE.Color(0xffe9cc),
    intensity: 1.25,
    pos: new THREE.Vector3(-4, 3.6, -1.2),
    hemi: 1.1,
  };
  const EVENING = {
    color: new THREE.Color(0xff934e),
    intensity: 0.9,
    pos: new THREE.Vector3(-4.4, 1.5, -0.4),
    hemi: 0.85,
  };
  const _c = new THREE.Color();
  function setTimeOfDay(t) {
    const k = Math.max(0, Math.min(1, t));
    key.color.copy(_c.copy(MORNING.color).lerp(EVENING.color, k));
    key.intensity = THREE.MathUtils.lerp(MORNING.intensity, EVENING.intensity, k);
    key.position.copy(MORNING.pos).lerp(EVENING.pos, k);
    hemi.intensity = THREE.MathUtils.lerp(MORNING.hemi, EVENING.hemi, k);
  }
  setTimeOfDay(0);

  return { key, hemi, bounce, glows, setTimeOfDay };
}
