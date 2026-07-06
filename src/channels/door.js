// ============================================================================
// channels/door.js — the walk-ins. An engine channel whose "station" is the
// door behind your shoulder. Only ever one live at a time (≤3 per run). While
// a door task is live and you're NOT turned to the door, the door mesh rattles
// and knocks; the shared attention system paints the "!" + edge arrow (main.js
// maps the door channel to the 'door' station). Turn to the door → the CSS3D
// card fades in with the event.
//
// Three event kinds (content-driven DOOR_EVENTS):
//   boss        — chips; "Of course" locks the camera 8 real-seconds then pays.
//   intern      — one chip; surprise coffee → coffee.addCharge().
//   maintenance — NO chips; card shows 3s while juice.shake runs, auto-resolves.
//
// Timing: ttl countdown is engine game-dt (slow-mo reaches it). The boss lock
// and the maintenance 3s window run on REAL dt via updateReal() (like calls),
// so they feel wall-clock but stay pause-safe.
// ============================================================================

import { LOCK_MESSAGES } from '../content.js';

const MAX_LIVE = 1;
const MAX_TOTAL = 4; // playtest wanted more walk-ins across the day
const BOSS_LOCK_SECONDS = 8;
const MAINTENANCE_SECONDS = 3;
const KNOCK_INTERVAL = 1.5; // seconds between knock pulses while unattended

export function createDoorChannel({
  engine,
  meters,
  rig,
  room,
  world,
  juice,
  content,
  panelEl,
  isAtDoor,
}) {
  const EVENTS = content?.DOOR_EVENTS || {};
  const reducedMotion = juice?.reducedMotion ?? false;

  // Live task bookkeeping. One at a time, so a single slot is enough.
  let live = null; // { task, event }
  let spawnedTotal = 0;

  // Boss "nodding…" lock + maintenance auto-resolve both live here, on real dt.
  let lock = null; // { task, chip } — boss lock
  let auto = null; // { task, remaining } — maintenance timer

  // Rattle state (game-agnostic; animated on real dt in update()).
  const doorMesh = room.doorMesh;
  const baseRotY = doorMesh.rotation.y;
  let rattleT = 0;
  let knockClock = 0;

  // --- Panel skeleton --------------------------------------------------------
  panelEl.classList.add('door-panel');
  panelEl.innerHTML = `
    <div class="door-card" hidden>
      <div class="door-kicker"></div>
      <div class="door-title"></div>
      <div class="door-body"></div>
      <div class="door-chips"></div>
      <div class="door-indicator" hidden></div>
    </div>
    <div class="door-toast-stack"></div>
  `;
  const cardEl = panelEl.querySelector('.door-card');
  const kickerEl = panelEl.querySelector('.door-kicker');
  const titleEl = panelEl.querySelector('.door-title');
  const bodyEl = panelEl.querySelector('.door-body');
  const chipsEl = panelEl.querySelector('.door-chips');
  const indicatorEl = panelEl.querySelector('.door-indicator');
  const toastStack = panelEl.querySelector('.door-toast-stack');

  function toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `door-toast ${kind}`.trim();
    t.textContent = text;
    toastStack.appendChild(t);
    t.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') t.remove();
    });
  }

  // --- Engine pool -----------------------------------------------------------
  // Non-guaranteed pool: everything not tagged guaranteed. Guarantees are
  // returned separately (boss in busy, maintenance in chaos, per content).
  // Only real event objects (skip helper strings like _expired).
  const ALL = Object.values(EVENTS).filter((e) => e && typeof e === 'object' && e.id);
  const NORMAL = ALL.filter((e) => !e.guaranteed);
  const GUARANTEED = ALL.filter((e) => e.guaranteed);

  let bag = [];
  function refillBag() {
    bag = NORMAL.map((e) => e.id);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function pickTemplate() {
    if (!canAccept()) return null;
    if (bag.length === 0) refillBag();
    const id = bag.shift();
    return ALL.find((e) => e.id === id) || null;
  }

  function guaranteedItems() {
    return GUARANTEED;
  }

  function canAccept() {
    return !live && spawnedTotal < MAX_TOTAL;
  }

  function resetPool() {
    refillBag();
  }

  // --- Spawn / resolve -------------------------------------------------------
  function spawn(task) {
    live = { task, event: task.data };
    spawnedTotal++;
    rattleT = 0;
    knockClock = 0;
    // If the player is already looking at the door when it spawns, show it.
    if (isAtDoor?.()) showCard();
  }

  function finish(task, result) {
    engine.resolve(task, result);
    clearLive();
  }

  function clearLive() {
    live = null;
    hideCard();
    doorMesh.rotation.y = baseRotY;
  }

  function expire(task) {
    if (!live || live.task !== task) return;
    // They wander off — no damage, wry toast.
    toast(EVENTS._expired || 'They wandered off.', '');
    clearLive();
  }

  // --- Card ------------------------------------------------------------------
  function showCard() {
    if (!live) return;
    const ev = live.event;
    kickerEl.textContent = ev.kicker || '';
    titleEl.textContent = ev.title || '';
    bodyEl.textContent = ev.body || '';
    chipsEl.innerHTML = '';
    indicatorEl.hidden = true;

    if (ev.kind === 'maintenance') {
      // No chips — the annoyance IS the interaction. Start the shake window if
      // it hasn't started (spawn may have happened off-door).
      if (!auto && live.task.state === 'live') startMaintenance(live.task);
      indicatorEl.hidden = false;
      indicatorEl.textContent = ev.indicator || '';
    } else if (lock && lock.task === live.task) {
      // Boss lock already running — show the nodding indicator, no chips.
      indicatorEl.hidden = false;
      indicatorEl.textContent = ev.lockIndicator || 'nodding…';
    } else {
      for (const chip of ev.chips || []) {
        const btn = document.createElement('button');
        btn.className = 'door-chip';
        btn.textContent = chip.label;
        btn.addEventListener('click', () => onChip(live.task, chip));
        chipsEl.appendChild(btn);
      }
    }
    cardEl.hidden = false;
    cardEl.classList.remove('in');
    void cardEl.offsetWidth;
    cardEl.classList.add('in');
  }

  function hideCard() {
    cardEl.hidden = true;
    cardEl.classList.remove('in');
  }

  // --- Chip handling ---------------------------------------------------------
  function onChip(task, chip) {
    if (!task || task.state !== 'live') return;

    if (chip.special === 'bossLock') {
      startBossLock(task, chip);
      return;
    }

    // Plain chip (e.g. boss "walk with me" quick payout, the intern's coffee
    // burnout relief — all handled by the generic effects path below).
    if (chip.effects) meters.applyEffects(chip.effects, task);
    if (chip.toast) toast(chip.toast);
    finish(task, { door: 'chip' });
  }

  // --- Boss lock (real-time) -------------------------------------------------
  function startBossLock(task, chip) {
    rig.lock('door', LOCK_MESSAGES.boss);
    lock = { task, chip, remaining: BOSS_LOCK_SECONDS };
    // Swap the card to the nodding indicator.
    chipsEl.innerHTML = '';
    indicatorEl.hidden = false;
    indicatorEl.textContent = live?.event?.lockIndicator || 'nodding…';
  }

  function endBossLock() {
    if (!lock) return;
    const { task, chip } = lock;
    rig.unlock();
    if (chip.effects) meters.applyEffects(chip.effects, task);
    if (chip.doneToast) toast(chip.doneToast, 'good');
    lock = null;
    finish(task, { door: 'bossLock' });
  }

  // --- Maintenance (real-time, shakes the whole time) ------------------------
  function startMaintenance(task) {
    auto = { task, remaining: MAINTENANCE_SECONDS };
  }
  function endMaintenance() {
    if (!auto) return;
    const { task } = auto;
    auto = null;
    if (EVENTS.maintenance?.doneToast) toast(EVENTS.maintenance.doneToast);
    finish(task, { door: 'maintenance' });
  }

  // --- Real-dt hook (locks + maintenance shake) ------------------------------
  function updateReal(rawDt) {
    if (lock) {
      lock.remaining -= rawDt;
      if (lock.remaining <= 0) endBossLock();
    }
    if (auto) {
      // Shake the whole time (reduced-motion: no shake, still the wait).
      if (!reducedMotion) juice?.shake?.(0.01, 0.2);
      auto.remaining -= rawDt;
      if (auto.remaining <= 0) endMaintenance();
    }
  }

  // --- Per-frame (rattle + card visibility) — real dt ------------------------
  function update(rawDt) {
    const atDoor = isAtDoor?.() ?? false;

    // Card visibility tracks whether we're facing the door.
    if (live) {
      if (atDoor && cardEl.hidden) showCard();
      else if (!atDoor && !cardEl.hidden) hideCard();
    }

    // Rattle the door while a task is live AND we're not attending it.
    const rattling = !!live && !atDoor;
    if (rattling && !reducedMotion) {
      rattleT += rawDt;
      knockClock += rawDt;
      // Small continuous wobble.
      let wobble = Math.sin(rattleT * 22) * 0.012;
      // Knock pulses every ~1.5s — a sharper kick.
      if (knockClock >= KNOCK_INTERVAL) knockClock -= KNOCK_INTERVAL;
      const knockPhase = knockClock / KNOCK_INTERVAL;
      if (knockPhase < 0.18) {
        wobble += Math.sin(knockPhase / 0.18 * Math.PI) * 0.05;
      }
      doorMesh.rotation.y = baseRotY + wobble;
    } else {
      doorMesh.rotation.y = baseRotY;
    }
  }

  // endDay safety: settle any in-flight boss lock / maintenance immediately so
  // the report never shows behind a pinned camera or drops a payout.
  function forceEnd() {
    if (lock) endBossLock();
    if (auto) endMaintenance();
  }

  function reset() {
    // Settle any lock first so a reset never leaves the camera pinned.
    if (lock) {
      rig.unlock();
      lock = null;
    }
    auto = null;
    live = null;
    spawnedTotal = 0;
    bag = [];
    doorMesh.rotation.y = baseRotY;
    hideCard();
    toastStack.innerHTML = '';
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
    forceEnd,
    reset,
    get pendingCount() {
      return live ? 1 : 0;
    },
    get isLive() {
      return !!live;
    },
    get spawnedTotal() {
      return spawnedTotal;
    },
  };
}
