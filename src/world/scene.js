// ============================================================================
// scene.js — both renderers (WebGL + CSS3D), the shared camera, per-frame
// sync, resize handling, and the registerScreen() contract every channel
// uses to put a DOM panel onto a 3D screen face.
// ============================================================================

import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export const EYE_HEIGHT = 1.2;
export const BASE_FOV = 62;

/**
 * Creates the full rendering stack.
 *
 * Layering: the WebGL canvas sits below and the CSS3D layer above it with
 * pointer-events disabled at the root (panels re-enable on themselves), so
 * DOM clicks hit real DOM and everything else falls through to the canvas
 * for prop raycasting. Nothing in this game ever passes in front of a
 * screen, so painting DOM over WebGL is safe.
 */
export function createSceneManager(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e1d3);
  const cssScene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    BASE_FOV,
    window.innerWidth / window.innerHeight,
    0.05,
    50,
  );
  camera.position.set(0, EYE_HEIGHT, 0);
  camera.rotation.order = 'YXZ';

  // --- WebGL layer ---------------------------------------------------------
  const gl = new THREE.WebGLRenderer({ antialias: true });
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gl.setSize(window.innerWidth, window.innerHeight);
  gl.domElement.id = 'gl-layer';
  container.appendChild(gl.domElement);

  // --- CSS3D layer ----------------------------------------------------------
  const css = new CSS3DRenderer();
  css.setSize(window.innerWidth, window.innerHeight);
  css.domElement.id = 'css3d-layer';
  container.appendChild(css.domElement);

  // The CSS3D scene runs in a world scaled up ×CSS_SCALE. Our real world is in
  // metres, so a panel would carry a ~0.0005 uniform scale (worldWidth/widthPx)
  // — matrices that tiny lose precision and the panel SMEARS into a stretched
  // streak at oblique angles (the "screens glitch when you turn" bug). At ×1000
  // the scales sit near 1 and render crisp from any angle, so panels can stay
  // visible while you shuffle between stations. The image is identical because
  // the CSS3D camera is a clone with its position/near/far scaled to match.
  // (Hit-testing is unaffected: interact.js raycasts in real-world units, not
  // through these transforms.)
  const CSS_SCALE = 1000;
  const cssCamera = new THREE.PerspectiveCamera(
    BASE_FOV,
    window.innerWidth / window.innerHeight,
    0.05 * CSS_SCALE,
    50 * CSS_SCALE,
  );

  // --- HUD layer (plain DOM, screen-space) ----------------------------------
  const hud = document.createElement('div');
  hud.id = 'hud-layer';
  container.appendChild(hud);

  // --- Screen registry -------------------------------------------------------
  /** @type {Array<{anchor: THREE.Object3D, obj: CSS3DObject, dom: HTMLElement}>} */
  const screens = [];

  /**
   * Maps a DOM panel onto a 3D screen face.
   *
   * @param {object} def
   * @param {THREE.Object3D} def.anchor  Empty placed at the screen-face
   *   center with +Z pointing out of the glass. Owned by desk.js/room.js.
   * @param {HTMLElement} def.dom       The panel element (from screens.js).
   * @param {number} def.widthPx        DOM layout width in px.
   * @param {number} def.heightPx      DOM layout height in px.
   * @param {number} def.worldWidth    Physical width of the glass in meters.
   *   World height is implied by the px aspect ratio — keep the 3D face and
   *   the panel the same aspect or the bezel alignment drifts.
   */
  function registerScreen({ anchor, dom, widthPx, heightPx, worldWidth }) {
    dom.style.width = `${widthPx}px`;
    dom.style.height = `${heightPx}px`;
    const obj = new CSS3DObject(dom);
    obj.scale.setScalar((worldWidth * CSS_SCALE) / widthPx);
    cssScene.add(obj);
    // worldHeight implied by aspect; the pointer bridge needs it for UV math.
    const entry = {
      anchor,
      obj,
      dom,
      widthPx,
      heightPx,
      worldWidth,
      worldHeight: (heightPx / widthPx) * worldWidth,
    };
    screens.push(entry);
    return entry;
  }

  // --- Per-frame sync ---------------------------------------------------------
  const _worldPos = new THREE.Vector3();
  const _worldQuat = new THREE.Quaternion();
  const _toPanel = new THREE.Vector3();
  const _camForward = new THREE.Vector3();

  function syncScreens() {
    // Mirror the real camera into CSS-scaled space (positions ×CSS_SCALE, same
    // orientation + fov) so the projected image matches the WebGL layer.
    cssCamera.quaternion.copy(camera.quaternion);
    cssCamera.position.copy(camera.position).multiplyScalar(CSS_SCALE);
    if (cssCamera.fov !== camera.fov || cssCamera.aspect !== camera.aspect) {
      cssCamera.fov = camera.fov;
      cssCamera.aspect = camera.aspect;
      cssCamera.updateProjectionMatrix();
    }

    camera.getWorldDirection(_camForward);
    for (const s of screens) {
      s.anchor.getWorldPosition(_worldPos);
      s.anchor.getWorldQuaternion(_worldQuat);
      s.obj.position.copy(_worldPos).multiplyScalar(CSS_SCALE);
      s.obj.quaternion.copy(_worldQuat);

      // With the scaled render, panels no longer distort at oblique angles, so
      // we keep them visible while shuffling. Only cull panels that are behind
      // you (they'd render mirrored/huge, and you can't see them anyway) — a
      // lenient threshold so every forward-facing screen stays lit mid-sweep.
      _toPanel.copy(_worldPos).sub(camera.position).normalize();
      const inView = _camForward.dot(_toPanel);
      const hidden = inView < 0.05; // ~>87° off / behind the camera
      const wasHidden = s.dom.style.visibility === 'hidden';
      if (wasHidden !== hidden) {
        s.dom.style.visibility = hidden ? 'hidden' : 'visible';
      }
    }
  }

  function render() {
    syncScreens();
    gl.render(scene, camera);
    css.render(cssScene, cssCamera);
  }

  // --- Resize -----------------------------------------------------------------
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    gl.setSize(window.innerWidth, window.innerHeight);
    css.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  return {
    scene,
    cssScene,
    camera,
    gl,
    hud,
    registerScreen,
    render,
    screens,
  };
}
