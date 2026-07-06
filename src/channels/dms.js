// ============================================================================
// channels/dms.js — the phone. A 260×560 handset panel: status bar (signal +
// in-game clock) over a notification stack of DM cards, newest on top. Each
// card is actionable directly (no list/detail split — DM timers are tight, one
// tap). Cards carry a conic-gradient countdown ring driven per-frame from
// task.ttl, an avatar, the message in the creator's voice, and 1–2 chips that
// stack full-width.
//
// Happiness routes to the DM's creator via meters.addHappiness (through
// applyEffects). React DMs (react:true) show one big ❤️ and pay a fast bonus
// inside the top 40% of ttl. Call chips (special:'dmCall') lock the phone for
// lockSeconds of real time, like email's quick call, paying on hang-up.
// ============================================================================

import { CREATORS, DMS, DM_TOASTS, AUGUST, LOCK_MESSAGES } from '../content.js';

const FAST_FRAC = 1 / 3; // resolved inside the top third → +3 "typing bubble"
const FAST_BONUS = 3;
const REACT_FAST_FRAC = 0.4; // react DMs pay their fastBonus inside top 40%

export function createDMChannel({ panelEl, engine, meters, rig, content }) {
  const toastCopy = content?.DM_TOASTS || DM_TOASTS;
  const creators = content?.CREATORS || CREATORS;
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  // task.id -> { task, cardEl, ringEl }
  const cards = new Map();

  // Real-time call lock (mirrors email's quick call). One at a time.
  let call = null; // { task, chip, creator, remaining }

  // --- Spawn-pool bookkeeping ------------------------------------------------
  const pool = {
    bag: [], // shuffled template ids
    retentionInjected: false, // rivalIgnored one-shot already queued
    retentionPending: 0, // spawns-remaining budget to force the retention DM
  };

  const RETENTION = DMS.find((d) => d.retention);
  const GUARANTEED = DMS.filter((d) => d.guaranteed);
  // Normal bag = everything not guaranteed and not the retention one-shot.
  const NORMAL = DMS.filter((d) => !d.guaranteed && !d.retention);

  // --- DOM skeleton ----------------------------------------------------------
  panelEl.classList.add('phone-panel');
  panelEl.innerHTML = `
    <div class="phone-statusbar">
      <span class="phone-signal">📶</span>
      <span class="phone-clock">9:00</span>
      <span class="phone-batt">100%</span>
    </div>
    <div class="phone-appbar">
      <span class="phone-app-title">💬 Messages</span>
    </div>
    <div class="phone-stack"></div>
    <div class="phone-toast-stack"></div>
    <div class="phone-call-indicator" hidden>📞 <span></span></div>
  `;
  const stackEl = panelEl.querySelector('.phone-stack');
  const clockEl = panelEl.querySelector('.phone-clock');
  const toastStack = panelEl.querySelector('.phone-toast-stack');
  const callIndicator = panelEl.querySelector('.phone-call-indicator');
  const callIndicatorText = callIndicator.querySelector('span');

  // main.js feeds this each frame from G.dayT.
  function setClock(hhmm) {
    clockEl.textContent = hhmm;
  }

  function toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `phone-toast ${kind}`.trim();
    t.textContent = text;
    toastStack.appendChild(t);
    t.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') t.remove();
    });
  }

  // --- Pool selection --------------------------------------------------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function refillBag() {
    // Only creators still on the roster contribute templates.
    const ids = NORMAL.filter((d) => !meters.isGone(d.creator)).map((d) => d.id);
    pool.bag = shuffle(ids);
  }

  // Engine calls this after picking the dm channel for the current phase.
  function pickTemplate() {
    // Retention test: once rivalIgnored flips, inject the retention DM within
    // the next 2–3 dm spawns.
    if (
      RETENTION &&
      !pool.retentionInjected &&
      meters.stats.rivalIgnored &&
      !meters.isGone(RETENTION.creator)
    ) {
      pool.retentionInjected = true;
      pool.retentionPending = 2 + Math.floor(Math.random() * 2); // 2 or 3
    }
    if (pool.retentionPending > 0 && RETENTION && !meters.isGone(RETENTION.creator)) {
      pool.retentionPending--;
      if (pool.retentionPending === 0) return RETENTION;
    }

    if (pool.bag.length === 0) refillBag();
    // Pull the first id whose creator is still around (roster can change).
    while (pool.bag.length) {
      const id = pool.bag.shift();
      const tpl = NORMAL.find((d) => d.id === id);
      if (tpl && !meters.isGone(tpl.creator)) return tpl;
    }
    return null;
  }

  // The "we need to talk" DM is a chaos guarantee.
  function guaranteedItems() {
    return GUARANTEED.filter((d) => !meters.isGone(d.creator));
  }

  function resetPool() {
    pool.bag = [];
    pool.retentionInjected = false;
    pool.retentionPending = 0;
    refillBag();
  }

  // --- Cards -----------------------------------------------------------------
  function buildCard(task) {
    const d = task.data;
    const creator = creatorById.get(d.creator) || { emoji: '💬', name: d.creator };
    const card = document.createElement('div');
    card.className = 'dm-card';
    card.dataset.taskId = task.id;
    card.innerHTML = `
      <div class="dm-card-head">
        <span class="dm-avatar"></span>
        <span class="dm-name"></span>
        <span class="dm-time"></span>
        <span class="dm-ring"><span class="dm-ring-hole"></span></span>
      </div>
      <div class="dm-text"></div>
      <div class="dm-chips"></div>
    `;
    card.querySelector('.dm-avatar').textContent = creator.emoji;
    card.querySelector('.dm-name').textContent = creator.name;
    card.querySelector('.dm-time').textContent = d.timestamp || '';
    card.querySelector('.dm-ring-hole').textContent = creator.emoji;
    card.querySelector('.dm-text').textContent = d.text;

    const chipWrap = card.querySelector('.dm-chips');
    if (d.react) {
      // Single big ❤️ react.
      const chip = d.chips[0];
      const btn = document.createElement('button');
      btn.className = 'dm-chip dm-react';
      if (chip.effects?.quality) btn.classList.add(`q-${chip.effects.quality}`);
      btn.textContent = chip.label;
      btn.addEventListener('click', () => onReact(task, chip));
      chipWrap.appendChild(btn);
    } else {
      const augustOn = document.body.dataset.august === '1';
      for (const chip of d.chips) {
        const btn = document.createElement('button');
        btn.className = 'dm-chip';
        if (chip.effects?.quality) btn.classList.add(`q-${chip.effects.quality}`);
        btn.textContent = chip.label;
        if (augustOn && chip.effects?.quality === 'good') {
          const tag = document.createElement('span');
          tag.className = 'chip-suggest';
          tag.textContent = `✓ ${AUGUST.suggests}`;
          btn.appendChild(tag);
        }
        btn.addEventListener('click', () => onChip(task, chip));
        chipWrap.appendChild(btn);
      }
    }
    return { card, ring: card.querySelector('.dm-ring') };
  }

  // Best chip quality on a DM (for the August pre-glow cue).
  function bestQuality(data) {
    for (const chip of data.chips || []) {
      if (chip.effects?.quality === 'good') return 'good';
    }
    return null;
  }
  function applyAugustGlow(entry) {
    const on = document.body.dataset.august === '1';
    const good = on && bestQuality(entry.task.data) === 'good';
    entry.cardEl.classList.toggle('august-good', good);
  }

  function spawn(task) {
    const { card, ring } = buildCard(task);
    const entry = { task, cardEl: card, ringEl: ring };
    // July AI is COACH-ONLY — it highlights the right reply (glow + "✓ July AI"
    // pill) but never taps it for you.
    cards.set(task.id, entry);
    // Newest on top.
    stackEl.prepend(card);
    applyAugustGlow(entry);
  }

  // No-op: July AI is coach-only now (kept so main.js's per-frame call is safe).
  function updateAugust() {}

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
    // Expired DM: apply onExpire effects (default −18 happiness) to the creator.
    // Left on read a few times and they walk — leaving talent is a real cost.
    const onExpire = task.data.onExpire?.effects || { happiness: -18 };
    const eff = { ...onExpire, creator: task.data.creator };
    meters.applyEffects(eff, null); // null task: no response-time push on expiry
    toast(toastCopy.expired, 'bad');
    // Red flash + drop out; heart crack is driven by addHappiness on big loss.
    const el = entry.cardEl;
    el.classList.add('expired');
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'dmExpire') el.remove();
    });
  }

  function canAccept() {
    return true; // no phone cap this slice
  }

  // --- Resolution ------------------------------------------------------------
  function isFast(task) {
    return task.ttlMax > 0 && task.ttl / task.ttlMax > 1 - FAST_FRAC;
  }

  function finishResolve(task, result) {
    engine.resolve(task, result);
    removeCard(task);
    meters.stats.dmsHandled++;
  }

  function onChip(task, chip) {
    if (task.state !== 'live') return;
    const effects = { ...(chip.effects || {}), creator: task.data.creator };

    // Call chip — lock the phone for lockSeconds real seconds, pay on hang-up.
    if (effects.special === 'dmCall') {
      startCall(task, chip);
      // Resolve immediately (remove card + engine); payout on call end.
      engine.resolve(task, { pending: 'dmCall' });
      removeCard(task);
      return;
    }

    // Top-third speed bonus ("they saw the typing bubble immediately").
    const fast = isFast(task);
    meters.applyEffects(effects, task);
    if (fast && effects.happiness > 0) {
      meters.addHappiness(task.data.creator, FAST_BONUS);
      toast(toastCopy.fast, 'good');
    } else if (chip.toast) {
      toast(chip.toast);
    }
    finishResolve(task, { quality: effects.quality });
  }

  function onReact(task, chip) {
    if (task.state !== 'live') return;
    const effects = { ...(chip.effects || {}), creator: task.data.creator };
    meters.applyEffects(effects, task);
    // React fast bonus if tapped inside the top 40%.
    const fast = task.ttlMax > 0 && task.ttl / task.ttlMax > 1 - REACT_FAST_FRAC;
    if (fast && task.data.fastBonus) {
      meters.addHappiness(task.data.creator, task.data.fastBonus);
    }
    toast(toastCopy.react, 'good');
    finishResolve(task, { react: true, fast });
  }

  // --- Call (real-time lock) -------------------------------------------------
  function startCall(task, chip) {
    const creator = creatorById.get(task.data.creator) || { name: task.data.creator };
    // Edge case: if a call is already in flight (email's or ours), don't lock —
    // apply this call's payout immediately and skip the lock.
    if (call || rig.isLocked) {
      const eff = { ...(chip.effects || {}), creator: task.data.creator };
      meters.applyEffects(eff, task);
      meters.stats.dmsHandled++;
      return;
    }
    rig.lock('phone', LOCK_MESSAGES.call);
    call = { task, chip, creator, remaining: chip.effects?.lockSeconds ?? 8 };
    callIndicatorText.textContent = toastCopy.call(creator.name);
    callIndicator.hidden = false;
    toast(toastCopy.call(creator.name));
  }

  function endCall() {
    if (!call) return;
    const { chip, task, creator } = call;
    rig.unlock();
    callIndicator.hidden = true;
    const eff = { ...(chip.effects || {}), creator: task.data.creator };
    meters.applyEffects(eff, task);
    meters.stats.dmsHandled++;
    toast(toastCopy.callDone, 'good');
    call = null;
  }

  // Real (unscaled) dt: the lock is wall-clock-feeling but still frame-driven
  // and pause-safe (main.js early-returns while tab-hidden).
  function updateReal(rawDt) {
    if (!call) return;
    call.remaining -= rawDt;
    if (call.remaining <= 0) endCall();
  }

  // endDay safety: settle any in-flight call immediately (pay + unlock).
  function forceEndCall() {
    if (call) endCall();
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

  function update() {
    for (const entry of cards.values()) {
      const t = entry.task;
      if (t.state !== 'live') continue;
      paintRing(entry.ringEl, t);
      applyAugustGlow(entry);
    }
  }

  function reset() {
    cards.clear();
    call = null;
    callIndicator.hidden = true;
    stackEl.innerHTML = '';
    toastStack.innerHTML = '';
    pool.bag = [];
    pool.retentionInjected = false;
    pool.retentionPending = 0;
  }

  return {
    // engine channel API
    spawn,
    expire,
    canAccept,
    pickTemplate,
    guaranteedItems,
    resetPool,
    // main.js per-frame hooks
    update,
    updateReal,
    updateAugust,
    forceEndCall,
    setClock,
    reset,
    get pendingCount() {
      return cards.size;
    },
    get inCall() {
      return !!call;
    },
  };
}
