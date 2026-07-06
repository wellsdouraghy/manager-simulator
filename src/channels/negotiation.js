// ============================================================================
// channels/negotiation.js — the DEALS column + the tug-of-war minigame.
//
// The DEALS column shows negotiation cards (brand, creator, deal value, and the
// anchor→target joke line) each carrying a conic-gradient countdown ring driven
// per-frame from task.ttl. Click a card → a tug-of-war overlay takes over the
// whole deal panel while the board underneath keeps ticking.
//
// Tug physics (all game-dt so coffee slow-mo in slice 5 makes deals easier):
//   handle p ∈ [0,1], starts 0.35.
//   HOLD (pointerdown on the tug view, or SPACE while open) pulls p → 1 at PULL.
//   The brand pulls back constantly (BRAND base + sine + telegraphed gusts).
//   Green zone [start, start+width] (from content). Hold inside it for
//   HOLD_TO_CLOSE continuous game-seconds → closed on YOUR terms (pay commission).
//   p reaching 0 → closed on THEIR terms (tiny pay + −10 happiness to creator).
//   ttl still drains while negotiating; expiry mid-tug evaporates the deal (−5).
//
// The engine calls spawn/expire/canAccept/pickTemplate; the channel calls
// engine.resolve(task, {closed:'target'|'anchor'}) so slice-6 juice can hook it.
// ============================================================================

import { NEGOTIATIONS, DEAL_BOARD, NEGOTIATION_GREEN_ZONE, CREATORS } from '../content.js';

// --- Tug feel-tuning constants (game-dt space) ------------------------------
const START_P = 0.35;
const PULL = 0.34; // per second toward 1 while holding
const BRAND_BASE = 0.16; // constant pull-back toward 0
const BRAND_SINE_AMP = 0.1; // + this * sin(t*1.7)
const BRAND_SINE_W = 1.7;
const GUST_AMP = 0.18; // extra pull-back during a gust
const GUST_DUR = 0.6; // gust lasts this long (game seconds)
const GUST_TELEGRAPH = 0.35; // red flare / shake this long before the gust bites
const GUST_MIN_GAP = 1.5; // next gust scheduled this..that seconds out
const GUST_MAX_GAP = 3.0;
const HOLD_TO_CLOSE = 2.0; // continuous seconds inside the green zone to win
const MAX_LIVE = 2; // canAccept cap

const rand = (min, max) => min + Math.random() * (max - min);
const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function createNegotiationChannel({
  columnEl,
  engine,
  meters,
  content,
  storage,
  pauseGame,
}) {
  const copy = content?.DEAL_BOARD || DEAL_BOARD;
  const seeds = content?.NEGOTIATIONS || NEGOTIATIONS;
  const zone = content?.NEGOTIATION_GREEN_ZONE || NEGOTIATION_GREEN_ZONE;
  const creators = content?.CREATORS || CREATORS;
  const creatorById = new Map(creators.map((c) => [c.id, c]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const toastCopy = copy.toasts;

  // Session-scoped: the hold tutorial shows on the first negotiation of each
  // fresh page-load (so every friend who opens the link is taught), then not
  // again that session. NOT persisted — a permanent localStorage flag meant
  // only the very first player on a shared browser ever saw it.
  let tutorialTaught = false;

  // task.id -> { task, cardEl, ringEl }
  const cards = new Map();

  // The active tug session, or null. Drives physics off game dt in update(dt).
  let tug = null;

  // --- Spawn-pool bookkeeping (no-repeat bag) --------------------------------
  const pool = { bag: [] };
  function refillBag() {
    const ids = seeds.map((s) => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    pool.bag = ids;
  }
  function pickTemplate() {
    if (cards.size >= MAX_LIVE) return null;
    if (pool.bag.length === 0) refillBag();
    // Skip ids already live (avoid two identical cards on the board).
    for (let i = 0; i < pool.bag.length; i++) {
      const id = pool.bag[i];
      const live = [...cards.values()].some((e) => e.task.data.id === id);
      if (!live) {
        pool.bag.splice(i, 1);
        return seeds.find((s) => s.id === id);
      }
    }
    return null;
  }
  function resetPool() {
    pool.bag = [];
    refillBag();
  }

  // --- DOM skeleton ----------------------------------------------------------
  columnEl.classList.add('deal-col', 'deal-col-negotiation');
  columnEl.innerHTML = `
    <div class="deal-col-head">${copy.columns.deals}</div>
    <div class="deal-col-stack"></div>
  `;
  const stackEl = columnEl.querySelector('.deal-col-stack');

  // The tug overlay lives in the panel (ancestor of both columns), so it can
  // cover the whole board. Walk up to the board root from our column.
  const panelEl = columnEl.closest('.deal-board') || columnEl.parentElement;
  const tugEl = document.createElement('div');
  tugEl.className = 'tug-overlay';
  tugEl.hidden = true;
  panelEl.appendChild(tugEl);

  const toastStack = document.createElement('div');
  toastStack.className = 'deal-toast-stack';
  panelEl.appendChild(toastStack);

  function toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `deal-toast ${kind}`.trim();
    t.textContent = text;
    toastStack.appendChild(t);
    t.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') t.remove();
    });
  }

  // --- Cards -----------------------------------------------------------------
  function buildCard(task) {
    const d = task.data;
    const creator = creatorById.get(d.creator) || { emoji: '💼', name: d.creator };
    const card = document.createElement('button');
    card.className = 'deal-card';
    card.dataset.taskId = task.id;
    card.innerHTML = `
      <div class="deal-card-head">
        <span class="deal-brand"></span>
        <span class="deal-ring"><span class="deal-ring-hole">🤝</span></span>
      </div>
      <div class="deal-creator"><span class="deal-creator-emoji"></span><span class="deal-creator-name"></span></div>
      <div class="deal-value"></div>
      <div class="deal-terms"><span class="deal-anchor"></span> → <span class="deal-target"></span></div>
    `;
    card.querySelector('.deal-brand').textContent = d.brand;
    card.querySelector('.deal-creator-emoji').textContent = creator.emoji;
    card.querySelector('.deal-creator-name').textContent = creator.name;
    card.querySelector('.deal-value').textContent =
      '$' + d.dealValue.toLocaleString('en-US');
    card.querySelector('.deal-anchor').textContent = d.anchorLabel;
    card.querySelector('.deal-target').textContent = d.targetLabel;
    card.addEventListener('click', () => openTug(task.id));
    return { card, ring: card.querySelector('.deal-ring') };
  }

  function spawn(task) {
    const { card, ring } = buildCard(task);
    const entry = { task, cardEl: card, ringEl: ring };
    // July AI is coach-only: it makes closing EASIER (wider green zone below),
    // but you still hold the deal yourself — it doesn't auto-close for you.
    cards.set(task.id, entry);
    stackEl.prepend(card);
    meters.stats.dealsAttempted = (meters.stats.dealsAttempted || 0) + 1;
  }

  function removeCard(task) {
    const entry = cards.get(task.id);
    if (entry) {
      cards.delete(task.id);
      entry.cardEl.remove();
    }
  }

  function expire(task) {
    const entry = cards.get(task.id);
    if (!entry) return;
    cards.delete(task.id);
    meters.stats.expired++;
    // If this deal was mid-tug, evaporate the view too.
    if (tug && tug.task.id === task.id) closeTug();
    meters.applyEffects({ happiness: -5, creator: task.data.creator }, null);
    toast(toastCopy.evaporated, 'bad');
    const el = entry.cardEl;
    el.classList.add('expired');
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'rowExpire') el.remove();
    });
  }

  function canAccept() {
    return cards.size < MAX_LIVE;
  }

  // --- Tug-of-war view -------------------------------------------------------
  function openTug(taskId) {
    const entry = cards.get(taskId);
    if (!entry || entry.task.state !== 'live') return;
    if (tug) return; // one tug at a time
    const d = entry.task.data;
    tug = {
      task: entry.task,
      p: START_P,
      t: 0, // local game clock for the sine
      holding: false,
      zoneTime: 0, // continuous seconds inside the green zone
      nextGustAt: rand(GUST_MIN_GAP, GUST_MAX_GAP),
      gustUntil: -1, // gust active while t < gustUntil
      telegraphUntil: -1, // shake/flare active while t < telegraphUntil
    };

    // August Mode: double the green-zone width (read the body flag at open),
    // clamped so zEnd never exceeds 1.
    const august = document.body.dataset.august === '1';
    const zWidth = august ? zone.width * 2 : zone.width;
    const zStart = zone.start;
    const zEnd = Math.min(1, zone.start + zWidth);
    tugEl.innerHTML = `
      <div class="tug-brand"></div>
      <div class="tug-track">
        <div class="tug-zone"></div>
        <div class="tug-zone-fill"></div>
        <div class="tug-handle"></div>
        <div class="tug-end tug-end-left"><span class="tug-end-label"></span></div>
        <div class="tug-end tug-end-right"><span class="tug-end-label"></span></div>
      </div>
      <div class="tug-ring deal-ring"><span class="deal-ring-hole">🤝</span></div>
      <div class="tug-hint">HOLD anywhere (or SPACE) to pull toward your terms</div>
      <div class="tug-greedy" hidden></div>
      <div class="tug-tutorial" hidden>
        <div class="tug-tutorial-title"></div>
        <div class="tug-tutorial-body"></div>
        <div class="tug-tutorial-go"></div>
      </div>
    `;
    tugEl.querySelector('.tug-greedy').textContent = copy.greedyHint;
    tugEl.querySelector('.tug-brand').textContent =
      `${d.brand} · $${d.dealValue.toLocaleString('en-US')}`;
    tugEl.querySelector('.tug-end-left .tug-end-label').textContent = d.anchorLabel;
    tugEl.querySelector('.tug-end-right .tug-end-label').textContent = d.targetLabel;

    const zoneEl = tugEl.querySelector('.tug-zone');
    zoneEl.style.left = `${zStart * 100}%`;
    zoneEl.style.width = `${(zEnd - zStart) * 100}%`;
    const zoneFill = tugEl.querySelector('.tug-zone-fill');
    zoneFill.style.left = `${zStart * 100}%`;
    zoneFill.style.width = `${(zEnd - zStart) * 100}%`;

    tug.handleEl = tugEl.querySelector('.tug-handle');
    tug.zoneFillEl = zoneFill;
    tug.trackEl = tugEl.querySelector('.tug-track');
    tug.ringEl = tugEl.querySelector('.tug-ring');
    tug.zStart = zStart;
    tug.zEnd = zEnd;

    // First negotiation this session: pause the game and teach the hold.
    // Dismissed on the player's first press (which then flows into the pull).
    if (!tutorialTaught) {
      tug.tutorial = true;
      const tut = tugEl.querySelector('.tug-tutorial');
      const t = copy.tutorial || {};
      tut.querySelector('.tug-tutorial-title').textContent = t.title || 'HOLD TO PULL';
      tut.querySelector('.tug-tutorial-body').textContent = t.body || '';
      tut.querySelector('.tug-tutorial-go').textContent = t.go || '';
      tut.hidden = false;
      pauseGame?.(true); // freeze the rest of the day while they read
    }

    // Input: pointer hold on the tug view, plus SPACE (bound in openTug so it
    // only listens while a tug is open). All release paths clear `holding`.
    tugEl.addEventListener('pointerdown', onDown);
    tugEl.addEventListener('pointerup', onUp);
    tugEl.addEventListener('pointerleave', onUp);
    tugEl.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onUp);

    tugEl.hidden = false;
    paintTug();
  }

  // Clear the first-run tutorial: mark it seen and un-pause the game. The same
  // press that dismisses it also starts the pull (onDown/onKeyDown continue).
  function dismissTutorial() {
    if (!tug?.tutorial) return;
    tug.tutorial = false;
    tutorialTaught = true;
    const tut = tugEl.querySelector('.tug-tutorial');
    if (tut) tut.hidden = true;
    pauseGame?.(false);
  }

  function onDown() {
    if (!tug) return;
    dismissTutorial();
    tug.holding = true;
  }
  function onUp() {
    if (tug) tug.holding = false;
  }
  function onKeyDown(e) {
    if (tug && e.code === 'Space') {
      e.preventDefault();
      dismissTutorial();
      tug.holding = true;
    }
  }
  function onKeyUp(e) {
    if (tug && e.code === 'Space') tug.holding = false;
  }

  function detachTugInput() {
    tugEl.removeEventListener('pointerdown', onDown);
    tugEl.removeEventListener('pointerup', onUp);
    tugEl.removeEventListener('pointerleave', onUp);
    tugEl.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onUp);
  }

  // Close the tug view without resolving (expiry / reset paths).
  function closeTug() {
    if (!tug) return;
    if (tug.tutorial) pauseGame?.(false); // never leave the game frozen
    detachTugInput();
    tug = null;
    tugEl.hidden = true;
    tugEl.innerHTML = '';
  }

  function paintTug() {
    if (!tug) return;
    tug.handleEl.style.left = `${tug.p * 100}%`;
    const frac = tug.zoneTime / HOLD_TO_CLOSE;
    tug.zoneFillEl.style.transform = `scaleX(${clamp01(frac)})`;
    // Pinned past the green zone = demanding too much; teach the feather.
    const greedy = tug.p > tug.zEnd;
    const greedyEl = tugEl.querySelector('.tug-greedy');
    if (greedyEl && greedyEl.hidden === greedy) greedyEl.hidden = !greedy;
    tug.handleEl.classList.toggle('greedy', greedy);
    // Countdown ring in the tug view.
    paintRing(tug.ringEl, tug.task);
  }

  // --- Tug resolution --------------------------------------------------------
  function resolveTug(kind) {
    const task = tug.task;
    // Slice-6 juice seam: confetti / FOV punch hook off the resolve event's
    // `closed` result. Keep the payload shape stable.
    engine.resolve(task, { closed: kind });
    const d = task.data;
    if (kind === 'target') {
      meters.applyEffects({ commission: d.commission, quality: 'good' }, task);
      meters.stats.dealsClosedTarget = (meters.stats.dealsClosedTarget || 0) + 1;
      toast(toastCopy.closeTarget, 'good');
    } else {
      // closed on their terms
      const payout = Math.round(d.commission * 0.12);
      meters.applyEffects({ commission: payout, quality: 'bad' }, task);
      meters.applyEffects({ happiness: -10, creator: d.creator }, null);
      toast(toastCopy.closeAnchor, 'bad');
    }
    meters.stats.dealsHandled++;
    removeCard(task);
    closeTug();
  }

  // --- Per-frame physics (GAME dt) -------------------------------------------
  function update(dt) {
    if (!tug) return;
    if (tug.task.state !== 'live') {
      // Expired out from under us (engine.expire already toasted/penalized).
      closeTug();
      return;
    }
    tug.t += dt;

    // Gust scheduling: telegraph a beat before it bites, then apply for GUST_DUR.
    if (tug.gustUntil < tug.t && tug.t >= tug.nextGustAt) {
      tug.telegraphUntil = tug.nextGustAt + GUST_TELEGRAPH;
      tug.gustUntil = tug.nextGustAt + GUST_TELEGRAPH + GUST_DUR;
      tug.nextGustAt = tug.gustUntil + rand(GUST_MIN_GAP, GUST_MAX_GAP);
    }
    const telegraphing = tug.t < tug.telegraphUntil;
    const gusting = tug.t >= tug.telegraphUntil && tug.t < tug.gustUntil;
    if (!reducedMotion) {
      tug.trackEl?.classList.toggle('telegraph', telegraphing);
      tug.trackEl?.classList.toggle('gust', gusting);
    }

    // Brand pull-back (toward 0), your pull (toward 1).
    let brand = BRAND_BASE + BRAND_SINE_AMP * Math.sin(tug.t * BRAND_SINE_W);
    if (gusting) brand += GUST_AMP;
    let vel = -brand;
    if (tug.holding) vel += PULL;
    tug.p = clamp01(tug.p + vel * dt);

    // Green-zone hold accumulation.
    const inZone = tug.p >= tug.zStart && tug.p <= tug.zEnd;
    if (inZone) tug.zoneTime += dt;
    else tug.zoneTime = 0;

    paintTug();

    if (tug.zoneTime >= HOLD_TO_CLOSE) {
      resolveTug('target');
      return;
    }
    if (tug.p <= 0) {
      resolveTug('anchor');
    }
  }

  // --- Per-frame ring update (reads task.ttl) --------------------------------
  function paintRing(ringEl, task) {
    const frac = Math.max(0, Math.min(1, task.ttl / task.ttlMax));
    const deg = frac * 360;
    const urgent = frac < 0.25;
    const color = urgent
      ? 'var(--urgent)'
      : frac < 0.5
        ? 'var(--gold)'
        : 'var(--mint)';
    ringEl.style.setProperty('--ring-deg', `${deg}deg`);
    ringEl.style.setProperty('--ring-color', color);
    ringEl.classList.toggle('urgent', urgent);
  }

  function updateRings() {
    for (const entry of cards.values()) {
      const t = entry.task;
      if (t.state !== 'live') continue;
      paintRing(entry.ringEl, t);
    }
  }

  function reset() {
    // Kill any open tug + input listeners first (no stuck "held" state).
    detachTugInput();
    tug = null;
    tugEl.hidden = true;
    tugEl.innerHTML = '';
    cards.clear();
    stackEl.innerHTML = '';
    toastStack.innerHTML = '';
    pool.bag = [];
    refillBag();
  }

  return {
    // engine channel API
    spawn,
    expire,
    canAccept,
    pickTemplate,
    resetPool,
    // main.js per-frame hooks
    update, // GAME dt — drives tug physics
    updateRings, // rings (freeze on pause naturally)
    reset,
    get pendingCount() {
      return cards.size;
    },
    get inTug() {
      return !!tug;
    },
  };
}
