// ============================================================================
// desk.js — the desk, two monitors, the phone, mug, keyboard, and clutter.
// Exports screen definitions (anchor + px/world dims) that main.js feeds to
// scene.registerScreen(); the 3D bezels and the CSS3D panels derive from the
// same constants so they can't drift apart.
// ============================================================================

import * as THREE from 'three';
import { PALETTE } from '../content.js';
import { EYE_HEIGHT } from './scene.js';

const mat = (color, opts = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });

// Screen glass dimensions (meters) and their DOM panel resolutions (px).
// Keep aspect ratios identical or bezel alignment drifts.
const MAIN = { w: 0.62, h: 0.34875, pxW: 880, pxH: 495 }; // 16:9
const DEAL = { w: 0.55, h: 0.309375, pxW: 800, pxH: 450 }; // 16:9
// Comically large phone — it's your whole life, and DM chips need to be
// readable/tappable at the phone framing.
const PHONE = { w: 0.13, h: 0.28, pxW: 260, pxH: 560 };

const BEZEL = 0.022;
const DESK_TOP_Y = 0.74;

/** Rotate a group so its +Z faces the seated player (yaw only). */
function facePlayer(obj) {
  obj.rotation.y = Math.atan2(-obj.position.x, -obj.position.z);
}

function buildMonitor({ glassW, glassH, screenCenterY }) {
  const g = new THREE.Group();
  const plastic = mat(0x2c3552);

  // Stand
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.16), plastic);
  base.position.y = DESK_TOP_Y + 0.01;
  g.add(base);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.045, screenCenterY - DESK_TOP_Y, 0.045), plastic);
  neck.position.y = DESK_TOP_Y + (screenCenterY - DESK_TOP_Y) / 2;
  neck.position.z = -0.02;
  g.add(neck);

  // Body (glass + bezel all around)
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(glassW + BEZEL * 2, glassH + BEZEL * 2, 0.045),
    plastic,
  );
  body.position.y = screenCenterY;
  g.add(body);

  // Emissive glass face — the WebGL stand-in behind the CSS3D panel, so the
  // screen still reads lit when the panel is hidden (back-facing/loading).
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(glassW, glassH),
    new THREE.MeshBasicMaterial({ color: 0x131a30 }),
  );
  glass.position.set(0, screenCenterY, 0.0235);
  g.add(glass);

  // Anchor for the CSS3D panel: at the glass center, +Z out of the glass.
  const anchor = new THREE.Object3D();
  anchor.position.set(0, screenCenterY, 0.026);
  g.add(anchor);

  return { group: g, anchor, glass };
}

export function buildDesk() {
  const group = new THREE.Group();

  // --- Desk ------------------------------------------------------------------
  const wood = mat(0x96714e);
  const woodDark = mat(0x7a5a3d);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.05, 0.85), wood);
  top.position.set(0, DESK_TOP_Y - 0.025, -0.62);
  group.add(top);
  for (const [x, z] of [
    [-1.08, -0.28],
    [1.08, -0.28],
    [-1.08, -0.96],
    [1.08, -0.96],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, DESK_TOP_Y - 0.05, 0.07), woodDark);
    leg.position.set(x, (DESK_TOP_Y - 0.05) / 2, z);
    group.add(leg);
  }

  // --- Main monitor (inbox), dead ahead ------------------------------------------
  const mainMon = buildMonitor({ glassW: MAIN.w, glassH: MAIN.h, screenCenterY: 1.22 });
  mainMon.group.position.set(0, 0, -0.95);
  facePlayer(mainMon.group);
  group.add(mainMon.group);

  // --- Deal board monitor, to the right (~+40° yaw) --------------------------------
  const dealMon = buildMonitor({ glassW: DEAL.w, glassH: DEAL.h, screenCenterY: 1.18 });
  dealMon.group.position.set(0.68, 0, -0.81);
  facePlayer(dealMon.group);
  group.add(dealMon.group);

  // --- Phone on a chunky stand, to the left (~-45° yaw) ------------------------------
  const phoneGroup = new THREE.Group();
  phoneGroup.position.set(-0.48, 0, -0.48);
  facePlayer(phoneGroup);
  group.add(phoneGroup);

  const standBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.03), mat(0x2c3552));
  // Face center targeted at ~0.9m so the phone framing stays inside the
  // ±25° pitch clamp. The stand leans the phone back toward the eye.
  const faceCenterY = 0.9;
  const lean = Math.atan2(
    Math.hypot(phoneGroup.position.x, phoneGroup.position.z),
    EYE_HEIGHT - faceCenterY,
  ); // tilt so glass normal points up at the eye
  const phoneBody = new THREE.Group();
  phoneBody.position.y = faceCenterY;
  phoneBody.rotation.x = -(Math.PI / 2 - lean);
  phoneGroup.add(phoneBody);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(PHONE.w + 0.012, PHONE.h + 0.02, 0.012),
    mat(0x11162a),
  );
  slab.name = 'phone';
  slab.userData.interactive = true;
  phoneBody.add(slab);
  const phoneGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(PHONE.w, PHONE.h),
    new THREE.MeshBasicMaterial({ color: 0x131a30 }),
  );
  phoneGlass.position.z = 0.007;
  phoneBody.add(phoneGlass);
  const phoneAnchor = new THREE.Object3D();
  phoneAnchor.position.z = 0.009;
  phoneBody.add(phoneAnchor);

  standBack.position.set(0, faceCenterY - 0.08, -0.05);
  standBack.rotation.x = -0.35;
  phoneGroup.add(standBack);
  const standFoot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.12), mat(0x2c3552));
  standFoot.position.set(0, DESK_TOP_Y + 0.008, -0.02);
  phoneGroup.add(standFoot);

  // --- Keyboard --------------------------------------------------------------------
  const kb = new THREE.Group();
  kb.position.set(0, DESK_TOP_Y + 0.012, -0.42);
  const kbBase = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.022, 0.16), mat(0x323b5c));
  kb.add(kbBase);
  for (let row = 0; row < 4; row++) {
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.4 - row * 0.01, 0.012, 0.026), mat(0x3d4770));
    keys.position.set(0, 0.014, -0.055 + row * 0.036);
    kb.add(keys);
  }
  group.add(kb);

  // --- Coffee mug (set dressing) ---------------------------------------------
  // A ceramic mug of coffee. The coffee disc sits just PROUD of the rim (the
  // cup is a solid cylinder, so a disc level with the top face z-fights — that
  // was the flicker). A hair above = a clean, full cup.
  const mugColor = 0xe9e0cf; // warm ceramic
  const mug = new THREE.Group();
  mug.position.set(0.33, DESK_TOP_Y, -0.38);
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.105, 14),
    mat(mugColor),
  );
  cup.position.y = 0.0525;
  cup.name = 'mug';
  mug.add(cup);
  const coffee = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 0.012, 14),
    mat(0x4a3121), // rich coffee brown
  );
  coffee.position.y = 0.102; // top ~0.108, ~3mm above the 0.105 rim → no z-fight
  coffee.name = 'coffee-fill';
  mug.add(coffee);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.055, 0.035), mat(mugColor));
  handle.position.set(0.058, 0.055, 0);
  mug.add(handle);
  group.add(mug);

  // --- Clutter ------------------------------------------------------------------------
  // Papers
  for (const [x, z, rot] of [
    [-0.85, -0.62, 0.3],
    [-0.8, -0.58, -0.15],
    [0.88, -0.5, 0.55],
  ]) {
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.004, 0.28), mat(0xe8e0cc));
    paper.position.set(x, DESK_TOP_Y + 0.004, z);
    paper.rotation.y = rot;
    group.add(paper);
  }
  // Pen cup
  const penCup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8), mat(0x31548a));
  penCup.position.set(0.95, DESK_TOP_Y + 0.045, -0.75);
  group.add(penCup);
  for (const [ox, oz, tilt, color] of [
    [-0.008, 0.006, 0.12, PALETTE.gold],
    [0.01, -0.005, -0.18, PALETTE.mint],
    [0.002, 0.012, 0.05, PALETTE.urgent],
  ]) {
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5), mat(color));
    pen.position.set(0.95 + ox, DESK_TOP_Y + 0.12, -0.75 + oz);
    pen.rotation.z = tilt;
    group.add(pen);
  }
  // Sticky notes on the main monitor bezel
  for (const [ox, oy, color, rot] of [
    [-0.36, 1.32, PALETTE.gold, 0.1],
    [-0.37, 1.24, PALETTE.mint, -0.08],
  ]) {
    const sticky = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.004), mat(color));
    sticky.position.set(ox, oy, -0.92);
    sticky.rotation.z = rot;
    group.add(sticky);
  }

  // --- Screen definitions consumed by scene.registerScreen() ---------------------------
  const screens = {
    inbox: { anchor: mainMon.anchor, widthPx: MAIN.pxW, heightPx: MAIN.pxH, worldWidth: MAIN.w },
    deals: { anchor: dealMon.anchor, widthPx: DEAL.pxW, heightPx: DEAL.pxH, worldWidth: DEAL.w },
    phone: { anchor: phoneAnchor, widthPx: PHONE.pxW, heightPx: PHONE.pxH, worldWidth: PHONE.w },
  };

  // World positions for the screen-glow lights (just in front of each glass).
  const glowPositions = Object.values(screens).map((s) => {
    const p = new THREE.Vector3();
    // Force a world-matrix update since the group isn't in the scene yet.
    group.updateMatrixWorld(true);
    s.anchor.getWorldPosition(p);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(
      s.anchor.getWorldQuaternion(new THREE.Quaternion()),
    );
    return p.addScaledVector(n, 0.18);
  });

  return { group, screens, glowPositions, mugMesh: cup, coffeeFill: coffee, phoneMesh: slab };
}
