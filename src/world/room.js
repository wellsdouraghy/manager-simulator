// ============================================================================
// room.js — walls, window + blinds, fake light shafts, wall clock, door.
// All geometry from primitives, flat-shaded, zero textures.
// ============================================================================

import * as THREE from 'three';
import { PALETTE } from '../content.js';

// Room bounds (player seated at origin, facing -Z).
const X_MIN = -2.6;
const X_MAX = 2.4;
const Z_MIN = -2.0; // front wall (behind the monitors)
const Z_MAX = 3.0; // back wall
const HEIGHT = 3.0;

const mat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

export function buildRoom() {
  const group = new THREE.Group();

  // Bright, cozy office (per playtest: the ink-navy room read as dark/scary).
  // Warm near-whites rather than pure #fff, which blows out under flat shading.
  const WALL = 0xf2ece0; // warm off-white walls
  const FLOOR = 0xc9b79c; // light warm wood
  const CEIL = 0xfbf6ec; // near-white ceiling
  const TRIM = 0xdcd2c0; // soft taupe baseboards/frames
  const wallMat = mat(WALL);
  const floorMat = mat(FLOOR);
  const trimMat = mat(TRIM);

  // --- Shell -----------------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(X_MAX - X_MIN, 0.1, Z_MAX - Z_MIN),
    floorMat,
  );
  floor.position.set((X_MIN + X_MAX) / 2, -0.05, (Z_MIN + Z_MAX) / 2);
  group.add(floor);

  const ceiling = floor.clone();
  ceiling.material = mat(CEIL);
  ceiling.position.y = HEIGHT + 0.05;
  group.add(ceiling);

  const mkWall = (w, h, x, y, z, rotY) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), wallMat);
    wall.position.set(x, y, z);
    wall.rotation.y = rotY;
    group.add(wall);
    return wall;
  };
  mkWall(X_MAX - X_MIN, HEIGHT, (X_MIN + X_MAX) / 2, HEIGHT / 2, Z_MIN - 0.05, 0); // front
  mkWall(X_MAX - X_MIN, HEIGHT, (X_MIN + X_MAX) / 2, HEIGHT / 2, Z_MAX + 0.05, 0); // back
  mkWall(Z_MAX - Z_MIN, HEIGHT, X_MIN - 0.05, HEIGHT / 2, (Z_MIN + Z_MAX) / 2, Math.PI / 2); // left
  mkWall(Z_MAX - Z_MIN, HEIGHT, X_MAX + 0.05, HEIGHT / 2, (Z_MIN + Z_MAX) / 2, Math.PI / 2); // right

  // Baseboard strips (front + side walls only; cheap charm)
  for (const [w, x, z, rotY] of [
    [X_MAX - X_MIN, (X_MIN + X_MAX) / 2, Z_MIN + 0.02, 0],
    [Z_MAX - Z_MIN, X_MIN + 0.02, (Z_MIN + Z_MAX) / 2, Math.PI / 2],
    [Z_MAX - Z_MIN, X_MAX - 0.02, (Z_MIN + Z_MAX) / 2, Math.PI / 2],
  ]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.03), trimMat);
    board.position.set(x, 0.06, z);
    board.rotation.y = rotY;
    group.add(board);
  }

  // --- Window on the left wall (golden hour comes from here) -------------------
  const winCz = -0.9; // centered near the desk
  const winW = 1.5; // along z
  const winH = 1.5;
  const winCy = 1.7;

  // Glowing "sun" pane sits just inside the solid wall — reads as a lit window.
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshBasicMaterial({ color: 0xffdca3 }),
  );
  sun.position.set(X_MIN + 0.02, winCy, winCz);
  sun.rotation.y = Math.PI / 2;
  group.add(sun);

  // Frame
  const frameMat = mat(0x1a2138);
  for (const [h, w, y, z] of [
    [0.08, winW + 0.16, winCy + winH / 2 + 0.04, winCz],
    [0.08, winW + 0.16, winCy - winH / 2 - 0.04, winCz],
    [winH + 0.16, 0.08, winCy, winCz - winW / 2 - 0.04],
    [winH + 0.16, 0.08, winCy, winCz + winW / 2 + 0.04],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, w), frameMat);
    bar.position.set(X_MIN + 0.06, y, z);
    group.add(bar);
  }

  // Blinds: chunky slats, slightly open
  const slatMat = mat(0x39456e);
  const slatCount = 7;
  for (let i = 0; i < slatCount; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, winW), slatMat);
    slat.position.set(
      X_MIN + 0.1,
      winCy + winH / 2 - 0.1 - (i * (winH - 0.2)) / (slatCount - 1),
      winCz,
    );
    slat.rotation.z = -0.5; // tilted open, letting the light through
    group.add(slat);
  }

  // Fake light shafts: translucent prisms raking from the window to the desk.
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const [zOff, len, wide, drop] of [
    [-0.45, 3.6, 0.34, -0.36],
    [0.0, 3.8, 0.4, -0.34],
    [0.45, 3.4, 0.3, -0.38],
  ]) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, wide), shaftMat);
    shaft.position.set(X_MIN + len / 2 - 0.3, winCy + (drop * len) / 2 / 1.8, winCz + zOff);
    shaft.rotation.z = drop;
    group.add(shaft);
  }

  // --- Wall clock above the monitors (the run timer) ---------------------------
  const clock = new THREE.Group();
  clock.position.set(0, 2.15, Z_MIN + 0.06);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20),
    mat(0x2e3a63),
  );
  body.rotation.x = Math.PI / 2;
  clock.add(body);
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.052, 20),
    mat(PALETTE.glow),
  );
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.004;
  clock.add(face);
  // 12 tick marks
  const tickMat = mat(0x232b47);
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.01), tickMat);
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(Math.sin(a) * 0.14, Math.cos(a) * 0.14, 0.035);
    tick.rotation.z = -a;
    clock.add(tick);
  }
  // Hands pivot at the center; a box offset upward reads as a hand at 12.
  const mkHand = (len, w, color, zOff) => {
    const pivot = new THREE.Group();
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.012), mat(color));
    hand.position.y = len / 2 - 0.015;
    pivot.add(hand);
    pivot.position.z = zOff;
    clock.add(pivot);
    return pivot;
  };
  const hourHand = mkHand(0.09, 0.02, 0x232b47, 0.042);
  const minuteHand = mkHand(0.14, 0.014, 0x232b47, 0.05);
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8),
    mat(PALETTE.urgent),
  );
  pin.rotation.x = Math.PI / 2;
  pin.position.z = 0.055;
  clock.add(pin);
  group.add(clock);

  // Window daylight ages across the workday: soft warm morning → bright gold
  // midday → amber afternoon → deep sunset by 6PM, with the fake light shafts
  // warming and dimming to match. A glance at the window tells you how late it is.
  const SKY_STOPS = [
    { k: 0.0, sun: 0xffe6b0, shaft: 0xfff0cf, op: 0.05 }, // 9:00 — soft morning
    { k: 0.3, sun: 0xfff3d2, shaft: 0xfff2d6, op: 0.064 }, // ~11:40 — bright
    { k: 0.55, sun: 0xffd583, shaft: 0xffe1a8, op: 0.055 }, // ~2:00 — golden
    { k: 0.8, sun: 0xff9a45, shaft: 0xffb164, op: 0.04 }, // ~4:50 — amber
    { k: 1.0, sun: 0xff5320, shaft: 0xff6a34, op: 0.026 }, // 6:00 — deep sunset
  ];
  const _sunA = new THREE.Color();
  const _sunB = new THREE.Color();
  const _shA = new THREE.Color();
  const _shB = new THREE.Color();

  /** t: 0..1 across the workday → clock hands sweep + the window daylight ages. */
  function setDayProgress(t) {
    const k = THREE.MathUtils.clamp(t, 0, 1);
    const hours = 9 + 9 * k;
    hourHand.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    minuteHand.rotation.z = -(hours % 1) * Math.PI * 2;
    // Blend between the two surrounding sky stops.
    let a = SKY_STOPS[0];
    let b = SKY_STOPS[SKY_STOPS.length - 1];
    for (let i = 0; i < SKY_STOPS.length - 1; i++) {
      if (k >= SKY_STOPS[i].k && k <= SKY_STOPS[i + 1].k) {
        a = SKY_STOPS[i];
        b = SKY_STOPS[i + 1];
        break;
      }
    }
    const f = a.k === b.k ? 0 : (k - a.k) / (b.k - a.k);
    sun.material.color.copy(_sunA.setHex(a.sun).lerp(_sunB.setHex(b.sun), f));
    shaftMat.color.copy(_shA.setHex(a.shaft).lerp(_shB.setHex(b.shaft), f));
    shaftMat.opacity = a.op + (b.op - a.op) * f;
  }
  setDayProgress(0);

  // --- Door on the right wall, behind your shoulder ------------------------------
  const doorGroup = new THREE.Group();
  const doorCz = 2.0;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.06, 0.92), mat(0x3a466e));
  slab.position.set(X_MAX - 0.04, 1.03, doorCz);
  slab.name = 'door';
  slab.userData.interactive = true;
  doorGroup.add(slab);
  // Frame
  for (const [h, d, y, z] of [
    [2.16, 0.1, 1.08, doorCz - 0.51],
    [2.16, 0.1, 1.08, doorCz + 0.51],
    [0.1, 1.12, 2.16, doorCz],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, d), trimMat);
    bar.position.set(X_MAX - 0.03, y, z);
    doorGroup.add(bar);
  }
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10),
    mat(PALETTE.gold),
  );
  knob.rotation.z = Math.PI / 2;
  knob.position.set(X_MAX - 0.1, 1.02, doorCz - 0.34);
  doorGroup.add(knob);
  group.add(doorGroup);

  // Anchor for the walk-in event card (CSS3D), facing into the room (-X).
  const doorAnchor = new THREE.Object3D();
  doorAnchor.position.set(X_MAX - 0.12, 1.45, doorCz);
  doorAnchor.rotation.y = -Math.PI / 2;
  group.add(doorAnchor);

  // --- Set dressing ----------------------------------------------------------------
  // Potted plant, back-left corner
  const plant = new THREE.Group();
  plant.position.set(X_MIN + 0.5, 0, Z_MAX - 0.55);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 8), mat(0xb06a4a));
  pot.position.y = 0.15;
  plant.add(pot);
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.045, 0.4, 6), mat(0x45c489));
    leaf.position.y = 0.45 + i * 0.24;
    plant.add(leaf);
  }
  group.add(plant);

  // Framed "HANG IN THERE" cat poster on the front wall — the motivational
  // meme every burnt-out office has. Drawn to a canvas at runtime (no asset
  // files), so it stays crisp and on-brand-silly.
  const poster = new THREE.Group();
  poster.position.set(-1.32, 1.78, Z_MIN + 0.04);
  const posterFrame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.03), mat(0x2c2418));
  poster.add(posterFrame);
  const posterArt = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.8),
    new THREE.MeshBasicMaterial({ map: makeHangInThereTexture() }),
  );
  posterArt.position.z = 0.02;
  poster.add(posterArt);
  group.add(poster);

  // Rug under the desk area
  const rug = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.012, 2.0), mat(0x2a3457));
  rug.position.set(0, 0.006, -0.5);
  group.add(rug);

  return { group, setDayProgress, doorMesh: slab, doorAnchor };
}

// --- "Hang in there" cat poster texture ---------------------------------------
// A stylized orange kitten clinging to a branch over a warm cream backdrop,
// with the classic block-letter caption. Everything is drawn with Canvas 2D so
// there are zero external asset files.
function makeHangInThereTexture() {
  const W = 512;
  const H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  // Backdrop — soft photo-poster cream with a gentle vignette.
  g.fillStyle = '#f4e6c6';
  g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, 300, 80, W / 2, 300, 420);
  vg.addColorStop(0, 'rgba(255,255,255,0.35)');
  vg.addColorStop(1, 'rgba(120,90,40,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  // Branch the kitten dangles from.
  g.strokeStyle = '#7a4f26';
  g.lineWidth = 30;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(40, 150);
  g.lineTo(472, 128);
  g.stroke();
  g.strokeStyle = '#98663a';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(60, 142);
  g.lineTo(452, 122);
  g.stroke();

  const ORANGE = '#f0a24b';
  const ORANGE_D = '#d98530';
  const CREAM = '#ffe9cf';

  // Dangling body (tapered, hanging straight down under the paws).
  g.fillStyle = ORANGE;
  g.beginPath();
  g.moveTo(196, 250);
  g.quadraticCurveTo(150, 400, 210, 500);
  g.quadraticCurveTo(256, 545, 302, 500);
  g.quadraticCurveTo(362, 400, 316, 250);
  g.closePath();
  g.fill();
  // Cream tummy.
  g.fillStyle = CREAM;
  g.beginPath();
  g.ellipse(256, 400, 46, 96, 0, 0, Math.PI * 2);
  g.fill();
  // Back paws at the bottom of the dangle.
  g.fillStyle = ORANGE_D;
  for (const px of [222, 290]) {
    g.beginPath();
    g.ellipse(px, 505, 26, 20, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Two front paws gripping over the branch.
  g.fillStyle = ORANGE;
  for (const px of [196, 316]) {
    g.beginPath();
    g.ellipse(px, 138, 30, 40, 0, 0, Math.PI * 2);
    g.fill();
    // toe lines
    g.strokeStyle = ORANGE_D;
    g.lineWidth = 3;
    for (const dx of [-9, 0, 9]) {
      g.beginPath();
      g.moveTo(px + dx, 120);
      g.lineTo(px + dx, 148);
      g.stroke();
    }
  }

  // Head (big, just under the paws — the face that sells the meme).
  const hx = 256;
  const hy = 250;
  // ears
  g.fillStyle = ORANGE;
  for (const [ex, dir] of [[196, -1], [316, 1]]) {
    g.beginPath();
    g.moveTo(ex, hy - 40);
    g.lineTo(ex + dir * 44, hy - 96);
    g.lineTo(ex + dir * 60, hy - 30);
    g.closePath();
    g.fill();
    g.fillStyle = '#f7c9a0';
    g.beginPath();
    g.moveTo(ex + dir * 6, hy - 44);
    g.lineTo(ex + dir * 40, hy - 84);
    g.lineTo(ex + dir * 46, hy - 40);
    g.closePath();
    g.fill();
    g.fillStyle = ORANGE;
  }
  // head fill
  g.fillStyle = ORANGE;
  g.beginPath();
  g.ellipse(hx, hy, 96, 86, 0, 0, Math.PI * 2);
  g.fill();
  // tabby stripes on the forehead
  g.strokeStyle = ORANGE_D;
  g.lineWidth = 8;
  g.lineCap = 'round';
  for (const dx of [-20, 0, 20]) {
    g.beginPath();
    g.moveTo(hx + dx, hy - 78);
    g.lineTo(hx + dx * 1.4, hy - 40);
    g.stroke();
  }
  // cheeks (cream)
  g.fillStyle = CREAM;
  g.beginPath();
  g.ellipse(hx, hy + 26, 74, 52, 0, 0, Math.PI * 2);
  g.fill();
  // worried eyes
  g.fillStyle = '#2a2018';
  for (const ex of [hx - 38, hx + 38]) {
    g.beginPath();
    g.ellipse(ex, hy - 4, 17, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(ex + 5, hy - 12, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2018';
  }
  // worried eyebrows
  g.strokeStyle = '#2a2018';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(hx - 56, hy - 34);
  g.lineTo(hx - 22, hy - 26);
  g.moveTo(hx + 56, hy - 34);
  g.lineTo(hx + 22, hy - 26);
  g.stroke();
  // nose
  g.fillStyle = '#c9695f';
  g.beginPath();
  g.moveTo(hx - 10, hy + 20);
  g.lineTo(hx + 10, hy + 20);
  g.lineTo(hx, hy + 32);
  g.closePath();
  g.fill();
  // mouth (little worried :3 )
  g.strokeStyle = '#2a2018';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(hx, hy + 32);
  g.quadraticCurveTo(hx - 14, hy + 44, hx - 24, hy + 34);
  g.moveTo(hx, hy + 32);
  g.quadraticCurveTo(hx + 14, hy + 44, hx + 24, hy + 34);
  g.stroke();
  // whiskers
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(60,45,30,0.7)';
  for (const s of [-1, 1]) {
    for (const wy of [22, 34, 46]) {
      g.beginPath();
      g.moveTo(hx + s * 40, hy + wy - 6);
      g.lineTo(hx + s * 128, hy + wy - 14 + (wy - 34) * 0.4);
      g.stroke();
    }
  }

  // Caption.
  g.textAlign = 'center';
  g.fillStyle = '#3a2b14';
  g.font = '900 78px Georgia, "Times New Roman", serif';
  g.fillText('HANG IN', W / 2, 618);
  g.fillText('THERE', W / 2, 686);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
