// ============================================================================
// juice.js — the cheap-tricks toolkit. No EffectComposer, ever. Everything is
// either additive camera rotation noise, a HUD-layer DOM div, or a per-material
// color lerp on the LambertMaterials already in the scene.
//
// Ordering contract (main.js): juice.update(rawDt) runs AFTER rig.update() and
// BEFORE world.render(), so the shake noise is added on top of the rig's base
// rotation each frame and cleared next frame. All motion respects
// prefers-reduced-motion; the color/opacity effects (vignette, desat) still run
// so reduced-motion players keep the readability cues without the nausea.
// ============================================================================

import * as THREE from 'three';

export function createJuice({ world, rig, storage }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hud = world.hud;
  const camera = world.camera;

  // --- Shake -----------------------------------------------------------------
  // Additive rotation noise applied after rig.update. Decays over its duration.
  const shakeState = { mag: 0, dur: 0, t: 0 };

  function shake(mag, dur) {
    if (reducedMotion) return;
    // Take the stronger of any in-flight shake so a big hit isn't swallowed.
    if (mag >= shakeState.mag * (1 - shakeState.t / Math.max(shakeState.dur, 1e-3))) {
      shakeState.mag = mag;
      shakeState.dur = dur;
      shakeState.t = 0;
    }
  }

  // --- Damage flash (HUD div, CSS animation) ---------------------------------
  const flashEl = document.createElement('div');
  flashEl.className = 'juice-damage';
  hud.appendChild(flashEl);

  function flashDamage() {
    flashEl.classList.remove('fire');
    void flashEl.offsetWidth; // reflow → restart the animation
    flashEl.classList.add('fire');
  }

  // --- Center banners: a big legible "you got hit" / "you nailed it" beat -----
  // Playtest: damage and success weren't landing. These are the loud, obvious
  // callouts — one red, one green — that punctuate the moment.
  const bannerEl = document.createElement('div');
  bannerEl.className = 'juice-banner';
  hud.appendChild(bannerEl);
  let bannerTimer = null;

  function showBanner(text, kind) {
    bannerEl.textContent = text;
    bannerEl.className = `juice-banner ${kind}`;
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    if (bannerTimer) cancelAnimationFrame(bannerTimer);
    // Auto-clear via the CSS animationend (no wall-clock timer needed).
  }
  bannerEl.addEventListener('animationend', () => bannerEl.classList.remove('show'));

  // A damage callout: strong red flash + shake + the reason, centered.
  function damage(text, mag = 0.016) {
    flashDamage();
    shake(mag, 0.4);
    if (text) showBanner(text, 'bad');
  }

  // A success callout: green banner + optional confetti/FOV punch handled by
  // the caller (deal close etc.).
  function celebrate(text) {
    if (text) showBanner(text, 'good');
  }

  // An amber warning callout (e.g. a creator is about to walk).
  function warn(text) {
    if (text) showBanner(text, 'warn');
  }

  // --- Vignette (HUD div, opacity-driven) ------------------------------------
  const vignetteEl = document.createElement('div');
  vignetteEl.className = 'juice-vignette';
  vignetteEl.style.opacity = '0';
  hud.appendChild(vignetteEl);

  function setVignette(alpha) {
    vignetteEl.style.opacity = String(Math.max(0, Math.min(1, alpha)));
  }

  // --- Scene decay (burnout desaturation) ------------------------------------
  // On first call we walk the WebGL scene once and cache every LambertMaterial's
  // base color plus its grayscale luminance. Each frame f changes by >0.02 we
  // lerp every cached material toward gray. The CSS3D layer gets a saturate()
  // + slight blur filter that scales with f.
  let decayCache = null; // [{ mat, r,g,b, lum }]
  let lastDecay = -1;

  function buildDecayCache() {
    decayCache = [];
    world.scene.traverse((obj) => {
      const m = obj.material;
      const mats = Array.isArray(m) ? m : m ? [m] : [];
      for (const mat of mats) {
        if (mat.isMeshLambertMaterial && mat.color) {
          const c = mat.color;
          const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
          decayCache.push({ mat, r: c.r, g: c.g, b: c.b, lum });
        }
      }
    });
  }

  function setSceneDecay(f) {
    f = Math.max(0, Math.min(1, f));
    if (!decayCache) buildDecayCache();
    if (Math.abs(f - lastDecay) <= 0.02) return;
    lastDecay = f;
    for (const e of decayCache) {
      e.mat.color.setRGB(
        THREE.MathUtils.lerp(e.r, e.lum, f),
        THREE.MathUtils.lerp(e.g, e.lum, f),
        THREE.MathUtils.lerp(e.b, e.lum, f),
      );
    }
    // CSS3D layer: desaturate + faint blur (≤2px), scaling with f.
    const cssLayer = document.getElementById('css3d-layer');
    if (cssLayer) {
      if (f <= 0.001) {
        cssLayer.style.filter = '';
      } else {
        const sat = 1 - 0.85 * f;
        const blur = Math.min(2, 2 * f);
        cssLayer.style.filter = `saturate(${sat.toFixed(3)}) blur(${blur.toFixed(2)}px)`;
      }
    }
  }

  // --- Jitter (Last Stand) ---------------------------------------------------
  // Continuous small shake + a heavy-blur CSS class on both layers.
  let jittering = false;

  function jitterOn() {
    jittering = true;
    document.getElementById('gl-layer')?.classList.add('juice-jitter');
    document.getElementById('css3d-layer')?.classList.add('juice-jitter');
  }
  function jitterOff() {
    jittering = false;
    document.getElementById('gl-layer')?.classList.remove('juice-jitter');
    document.getElementById('css3d-layer')?.classList.remove('juice-jitter');
  }

  // --- Commission floaters (gold +$ / red −$) --------------------------------
  // A HUD div spawned at the screen-projection of a world position; it arcs to
  // the commission counter and fades. Losses drop a red −$ from the counter.
  const MAX_FLOATERS = 6;
  const floaters = []; // { el, t, dur, x0,y0, x1,y1, arcX, arcY, drop }
  const _projV = new THREE.Vector3();

  function worldToScreen(worldPos) {
    if (!worldPos) return null;
    _projV.copy(worldPos).project(camera);
    // Behind the camera → treat as offscreen (caller falls back to center).
    if (_projV.z > 1) return null;
    const x = (_projV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_projV.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y };
  }

  function counterPoint() {
    const el = document.querySelector('.hud-commission .commission-value');
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: window.innerWidth * 0.5, y: 70 };
  }

  // amount: signed. worldPos: THREE.Vector3 source (gains) or null (center).
  function commissionFloater(amount, worldPos) {
    if (!amount) return;
    if (floaters.length >= MAX_FLOATERS) {
      const dead = floaters.shift();
      dead?.el.remove();
    }
    const gain = amount > 0;
    const target = counterPoint();
    let start;
    if (gain) {
      start = worldToScreen(worldPos) || { x: window.innerWidth * 0.5, y: window.innerHeight * 0.6 };
    } else {
      // Losses drop downward from the counter.
      start = { x: target.x, y: target.y };
    }
    const el = document.createElement('div');
    el.className = `juice-floater ${gain ? 'gain' : 'loss'}`;
    el.textContent = `${gain ? '+' : '−'}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
    hud.appendChild(el);
    const f = {
      el,
      t: 0,
      dur: gain ? 0.9 : 0.8,
      x0: start.x,
      y0: start.y,
      x1: gain ? target.x : start.x,
      y1: gain ? target.y : start.y + 70,
      arcY: gain ? -40 - Math.random() * 30 : 0,
      drop: !gain,
    };
    el.style.left = `${f.x0}px`;
    el.style.top = `${f.y0}px`;
    floaters.push(f);
  }

  function updateFloaters(rawDt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += rawDt;
      const k = Math.min(1, f.t / f.dur);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      const x = f.x0 + (f.x1 - f.x0) * e;
      // Arc: a parabola hump for gains that settles at the counter.
      const arc = f.arcY * Math.sin(Math.PI * e);
      const y = f.y0 + (f.y1 - f.y0) * e + arc;
      f.el.style.transform = `translate(-50%, -50%)`;
      f.el.style.left = `${x}px`;
      f.el.style.top = `${y}px`;
      f.el.style.opacity = String(k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.6) / 0.4));
      if (k >= 1) {
        f.el.remove();
        floaters.splice(i, 1);
      }
    }
  }

  // --- Confetti (THREE.Points burst at a world position) ---------------------
  const bursts = []; // { points, geom, mat, vel:[], life, ttl, positions }
  const CONFETTI_COLORS = [0xffc94d, 0x45c489, 0xff5b5b]; // gold / mint / coral

  function resolveScene() {
    return world.scene;
  }

  // Confetti is allowed under prefers-reduced-motion (spec: floaters ok,
  // confetti ok — only camera shake is suppressed, which shake() handles).
  function confettiBurst(worldPos, { count = 80, goldOnly = false, spread = 0.13 } = {}) {
    if (!worldPos) return;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const vel = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = worldPos.x;
      positions[i * 3 + 1] = worldPos.y;
      positions[i * 3 + 2] = worldPos.z;
      const hex = goldOnly ? 0xffc94d : CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      c.setHex(hex);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      vel.push({
        x: (Math.random() - 0.5) * spread,
        y: 0.15 + Math.random() * spread,
        z: (Math.random() - 0.5) * spread,
      });
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const points = new THREE.Points(geom, mat);
    points.renderOrder = 999;
    resolveScene().add(points);
    bursts.push({ points, geom, mat, vel, life: 0, ttl: 1.4, positions });
  }

  function updateBursts(rawDt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life += rawDt;
      const arr = b.positions;
      for (let j = 0; j < b.vel.length; j++) {
        b.vel[j].y -= 0.45 * rawDt; // gravity
        arr[j * 3] += b.vel[j].x * rawDt;
        arr[j * 3 + 1] += b.vel[j].y * rawDt;
        arr[j * 3 + 2] += b.vel[j].z * rawDt;
      }
      b.geom.attributes.position.needsUpdate = true;
      b.mat.opacity = Math.max(0, 1 - b.life / b.ttl);
      if (b.life >= b.ttl) {
        b.points.parent?.remove(b.points);
        b.geom.dispose();
        b.mat.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  function clearBursts() {
    for (const b of bursts) {
      b.points.parent?.remove(b.points);
      b.geom.dispose();
      b.mat.dispose();
    }
    bursts.length = 0;
  }

  // --- WebAudio blips (synthesized only, low gain, gesture-lazy) --------------
  let audioCtx = null;
  let soundOn = storage ? storage.getSoundOn() : true;
  const MASTER = 0.15; // hard cap on gain

  function ensureAudio() {
    // Created lazily on first user gesture (autoplay policy).
    if (audioCtx) return audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    } catch {
      audioCtx = null;
    }
    return audioCtx;
  }
  // Resume on the first real gesture so we never touch audio before one.
  function primeAudioOnGesture() {
    if (!soundOn) return;
    const ctx = ensureAudio();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  window.addEventListener('pointerdown', primeAudioOnGesture, { passive: true });
  window.addEventListener('keydown', primeAudioOnGesture);

  function blip({ freq = 440, type = 'sine', dur = 0.12, gain = 0.08, slideTo = null, delay = 0 }) {
    if (!soundOn) return;
    const ctx = audioCtx; // only play if a gesture already created it
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const vol = Math.min(MASTER, gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst({ dur = 0.18, gain = 0.06, cutoff = 900 }) {
    if (!soundOn) return;
    const ctx = audioCtx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = Math.min(MASTER, gain);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t0);
  }

  // Named cues used across channels.
  const sound = {
    spawnTick: () => blip({ freq: 660, type: 'triangle', dur: 0.05, gain: 0.03 }),
    resolveDing: (combo = 0) =>
      blip({ freq: 520 + Math.min(combo, 8) * 40, type: 'sine', dur: 0.12, gain: 0.07 }),
    expireBuzz: () =>
      blip({ freq: 150, type: 'sawtooth', dur: 0.16, gain: 0.06, slideTo: 90 }),
    dealClose: () => {
      // 3-note arpeggio.
      blip({ freq: 523, type: 'triangle', dur: 0.1, gain: 0.08, delay: 0 });
      blip({ freq: 659, type: 'triangle', dur: 0.1, gain: 0.08, delay: 0.09 });
      blip({ freq: 784, type: 'triangle', dur: 0.14, gain: 0.09, delay: 0.18 });
    },
    coffeeSlurp: () => noiseBurst({ dur: 0.28, gain: 0.05, cutoff: 700 }),
    alarm: () => {
      blip({ freq: 880, type: 'square', dur: 0.14, gain: 0.06 });
      blip({ freq: 880, type: 'square', dur: 0.14, gain: 0.06, delay: 0.2 });
    },
  };

  function setSoundOn(v) {
    soundOn = !!v;
    storage?.setSoundOn(soundOn);
    if (soundOn) primeAudioOnGesture();
  }
  function isSoundOn() {
    return soundOn;
  }

  // --- Per-frame -------------------------------------------------------------

  function update(rawDt) {
    let noiseYaw = 0;
    let noisePitch = 0;

    if (!reducedMotion) {
      // Decaying one-shot shake.
      if (shakeState.t < shakeState.dur) {
        shakeState.t += rawDt;
        const k = Math.max(0, 1 - shakeState.t / shakeState.dur);
        const amp = shakeState.mag * k * k;
        noiseYaw += (Math.random() * 2 - 1) * amp;
        noisePitch += (Math.random() * 2 - 1) * amp;
      }
      // Continuous jitter while Last Stand is up.
      if (jittering) {
        noiseYaw += (Math.random() * 2 - 1) * 0.01;
        noisePitch += (Math.random() * 2 - 1) * 0.01;
      }
    }

    if (noiseYaw !== 0 || noisePitch !== 0) {
      camera.rotation.y += noiseYaw;
      camera.rotation.x += noisePitch;
    }

    updateFloaters(rawDt);
    updateBursts(rawDt);
  }

  // Full reset for startDay / runItBack: clear all FX to neutral.
  function reset() {
    shakeState.mag = 0;
    shakeState.dur = 0;
    shakeState.t = 0;
    setVignette(0);
    setSceneDecay(0);
    jitterOff();
    for (const f of floaters) f.el.remove();
    floaters.length = 0;
    clearBursts();
  }

  return {
    update,
    shake,
    flashDamage,
    setVignette,
    setSceneDecay,
    jitterOn,
    jitterOff,
    reset,
    reducedMotion,
    damage,
    celebrate,
    warn,
    // Slice 6a juice
    commissionFloater,
    confettiBurst,
    worldToScreen,
    sound,
    setSoundOn,
    isSoundOn,
  };
}
