// ============================================================================
// channels/invoice.js — the INVOICES column + the tone-dial minigame.
//
// The INVOICES column shows invoice cards (brand, number, amount, big days-
// overdue) each with a conic-gradient countdown ring. Click a card → a tone-
// dial view over the panel: five fat "dial stop" buttons (softest → LAWYERS),
// with the card context still visible.
//
// Correct stop = derived from days overdue via TONE_MIN_DAYS (greatest index
// whose min ≤ days). Precomputed per seed for clarity, but re-derived on
// requeue since a too-soft nudge ages the invoice by +18 days.
//   Correct   → paid: +commission, mint flash (LAWYERS gets a special toast/pop).
//   Too soft  → nothing now; re-queue the same invoice older, up to twice.
//   Too hot   → relationship damage: −commission (~half payout), urgent flash.
//   Expired   → nothing paid, small −commission (they're never paying now).
//
// Requeue delays run on GAME dt (via update(dt)); the engine's pickTemplate()
// returns a queued, aged invoice when its timer elapses.
// ============================================================================

import { INVOICES, DEAL_BOARD, TONE_STOPS, TONE_MIN_DAYS } from '../content.js';

const MAX_LIVE = 2; // canAccept cap
const REQUEUE_MIN = 15; // game seconds before a too-soft invoice re-queues
const REQUEUE_MAX = 20;
const REQUEUE_DAYS = 18; // days added each requeue
const MAX_REQUEUES = 2; // per invoice, then it expires forever
const LAWYERS_STOP = 4; // the 90+ day nuclear option

const rand = (min, max) => min + Math.random() * (max - min);

// Correct stop for a given days-overdue: greatest index whose min ≤ days.
function correctStopFor(days, minDays) {
  let idx = 0;
  for (let i = 0; i < minDays.length; i++) {
    if (days >= minDays[i]) idx = i;
  }
  return idx;
}

export function createInvoiceChannel({ columnEl, engine, meters, content }) {
  const copy = content?.DEAL_BOARD || DEAL_BOARD;
  const seeds = content?.INVOICES || INVOICES;
  const stops = content?.TONE_STOPS || TONE_STOPS;
  const minDays = content?.TONE_MIN_DAYS || TONE_MIN_DAYS;
  const toastCopy = copy.toasts;

  // task.id -> { task, cardEl, ringEl }
  const cards = new Map();
  let openTaskId = null; // the invoice shown in the dial view, or null

  // --- Spawn-pool bookkeeping ------------------------------------------------
  // Fresh bag of seed ids + a requeue queue holding aged, timed invoices. Each
  // seed carries a per-run mutable `requeues` counter (reset in resetPool).
  const pool = {
    bag: [],
    requeue: [], // [{ tpl, readyIn }] — readyIn counts down on game dt
    requeues: new Map(), // id -> times requeued this run
  };

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
    // Ready requeued invoice takes priority (its timer has elapsed).
    const idx = pool.requeue.findIndex((r) => r.readyIn <= 0);
    if (idx >= 0) {
      const [r] = pool.requeue.splice(idx, 1);
      return r.tpl;
    }
    if (pool.bag.length === 0) refillBag();
    while (pool.bag.length) {
      const id = pool.bag.shift();
      // Skip if already live to avoid duplicate cards on the board.
      const live = [...cards.values()].some((e) => e.task.data.baseId === id || e.task.data.id === id);
      if (!live) return seeds.find((s) => s.id === id);
    }
    return null;
  }

  function resetPool() {
    pool.bag = [];
    pool.requeue.length = 0;
    pool.requeues.clear();
    refillBag();
  }

  // --- DOM skeleton ----------------------------------------------------------
  columnEl.classList.add('deal-col', 'deal-col-invoice');
  columnEl.innerHTML = `
    <div class="deal-col-head">${copy.columns.invoices}</div>
    <div class="deal-col-stack"></div>
  `;
  const stackEl = columnEl.querySelector('.deal-col-stack');

  const panelEl = columnEl.closest('.deal-board') || columnEl.parentElement;
  const dialEl = document.createElement('div');
  dialEl.className = 'dial-overlay';
  dialEl.hidden = true;
  panelEl.appendChild(dialEl);

  // Reuse the negotiation channel's toast stack if present; else make our own.
  let toastStack = panelEl.querySelector('.deal-toast-stack');
  if (!toastStack) {
    toastStack = document.createElement('div');
    toastStack.className = 'deal-toast-stack';
    panelEl.appendChild(toastStack);
  }

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
    const card = document.createElement('button');
    card.className = 'invoice-card';
    card.dataset.taskId = task.id;
    card.innerHTML = `
      <div class="invoice-card-head">
        <span class="invoice-brand"></span>
        <span class="invoice-ring deal-ring"><span class="deal-ring-hole">🧾</span></span>
      </div>
      <div class="invoice-number"></div>
      <div class="invoice-amount"></div>
      <div class="invoice-overdue"><span class="invoice-days"></span><span class="invoice-days-label">days overdue</span></div>
    `;
    card.querySelector('.invoice-brand').textContent = d.brand;
    card.querySelector('.invoice-number').textContent = d.number;
    card.querySelector('.invoice-amount').textContent =
      '$' + d.amount.toLocaleString('en-US');
    card.querySelector('.invoice-days').textContent = String(d.days);
    card.addEventListener('click', () => openDial(task.id));
    return { card, ring: card.querySelector('.invoice-ring') };
  }

  function spawn(task) {
    const { card, ring } = buildCard(task);
    cards.set(task.id, { task, cardEl: card, ringEl: ring });
    stackEl.prepend(card);
  }

  function removeCard(task) {
    const entry = cards.get(task.id);
    if (entry) {
      cards.delete(task.id);
      entry.cardEl.remove();
    }
  }

  function showList() {
    openTaskId = null;
    dialEl.hidden = true;
    dialEl.innerHTML = '';
  }

  function expire(task) {
    const entry = cards.get(task.id);
    if (!entry) return;
    cards.delete(task.id);
    meters.stats.expired++;
    if (openTaskId === task.id) showList();
    // They're never paying now: small negative commission (~10% of payout).
    const penalty = Math.round(task.data.commission * 0.1);
    if (penalty > 0) meters.applyEffects({ commission: -penalty, quality: 'bad' }, null);
    toast(toastCopy.invoiceExpired, 'bad');
    const el = entry.cardEl;
    el.classList.add('expired');
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'rowExpire') el.remove();
    });
  }

  function canAccept() {
    return cards.size < MAX_LIVE;
  }

  // --- Tone-dial view --------------------------------------------------------
  function openDial(taskId) {
    const entry = cards.get(taskId);
    if (!entry || entry.task.state !== 'live') return;
    openTaskId = taskId;
    const d = entry.task.data;

    dialEl.innerHTML = `
      <div class="dial-context">
        <div class="dial-context-brand"></div>
        <div class="dial-context-meta"></div>
        <span class="dial-ring deal-ring"><span class="deal-ring-hole">🧾</span></span>
      </div>
      <div class="dial-stops"></div>
      <div class="dial-hint">Pick a tone. Match the heat to the days.</div>
    `;
    dialEl.querySelector('.dial-context-brand').textContent = `${d.brand} · ${d.number}`;
    dialEl.querySelector('.dial-context-meta').textContent =
      `$${d.amount.toLocaleString('en-US')} · ${d.days} days overdue`;
    entry.dialRingEl = dialEl.querySelector('.dial-ring');

    // August Mode: a subtle mint tick dot on the correct stop (a hint, not a
    // glowing answer). Derived from days overdue like the resolution path.
    const august = document.body.dataset.august === '1';
    const correct = correctStopFor(d.days, minDays);

    const stopsWrap = dialEl.querySelector('.dial-stops');
    stops.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'dial-stop';
      btn.dataset.stop = String(i);
      btn.textContent = label;
      if (august && i === correct) {
        btn.classList.add('august-tick');
        const tick = document.createElement('span');
        tick.className = 'dial-tick';
        btn.appendChild(tick);
      }
      btn.addEventListener('click', () => onStop(entry.task, i));
      stopsWrap.appendChild(btn);
    });

    dialEl.hidden = false;
    paintRing(entry.dialRingEl, entry.task);
  }

  // --- Resolution ------------------------------------------------------------
  function onStop(task, stopIdx) {
    if (task.state !== 'live') return;
    const d = task.data;
    const correct = correctStopFor(d.days, minDays);

    if (stopIdx === correct) {
      const lawyers = correct === LAWYERS_STOP;
      // Slice-6 juice seam: bigger commission pop + effects hook off the
      // resolve result's `paid`/`lawyers` flags.
      engine.resolve(task, { paid: true, lawyers });
      meters.applyEffects({ commission: d.commission, quality: 'good' }, task);
      meters.stats.dealsHandled++;
      meters.stats.invoicesPaid = (meters.stats.invoicesPaid || 0) + 1;
      toast(lawyers ? toastCopy.lawyersPaid : toastCopy.invoicePaid, 'good');
      removeCard(task);
      if (openTaskId === task.id) showList();
      flashCard(task, 'paid');
      return;
    }

    if (stopIdx < correct) {
      // Too soft — nothing paid now; requeue the same invoice aged +18 days,
      // up to MAX_REQUEUES, then it just expires forever.
      engine.resolve(task, { tooSoft: true });
      toast(toastCopy.tooSoft, 'bad');
      const done = requeueInvoice(d);
      if (!done) {
        // Out of requeues: apply the small unpaid penalty like an expiry.
        const penalty = Math.round(d.commission * 0.1);
        if (penalty > 0) meters.applyEffects({ commission: -penalty, quality: 'bad' }, null);
      }
      meters.stats.dealsHandled++;
      removeCard(task);
      if (openTaskId === task.id) showList();
      return;
    }

    // Too hot — relationship damage: −commission ~ half the payout.
    engine.resolve(task, { tooHot: true });
    const dmg = Math.round(d.commission * 0.5);
    meters.applyEffects({ commission: -dmg, quality: 'bad' }, task);
    meters.stats.dealsHandled++;
    toast(toastCopy.tooHot, 'bad');
    removeCard(task);
    if (openTaskId === task.id) showList();
    flashCard(task, 'hot');
  }

  // Queue an aged copy of the invoice to re-spawn in 15–20 game seconds.
  // Returns true if requeued, false if the invoice is out of requeues.
  function requeueInvoice(d) {
    const baseId = d.baseId || d.id;
    const count = pool.requeues.get(baseId) || 0;
    if (count >= MAX_REQUEUES) return false;
    pool.requeues.set(baseId, count + 1);
    const days = d.days + REQUEUE_DAYS;
    const tpl = {
      ...d,
      id: `${baseId}-rq${count + 1}`,
      baseId,
      days,
      correctStop: correctStopFor(days, minDays),
    };
    pool.requeue.push({ tpl, readyIn: rand(REQUEUE_MIN, REQUEUE_MAX) });
    return true;
  }

  // Brief flash on nothing to persist (card already removed) — no-op seam kept
  // so slice-6 juice can target the card element before removal if desired.
  function flashCard() {}

  // --- Per-frame requeue timers (GAME dt) ------------------------------------
  function update(dt) {
    if (!pool.requeue.length) return;
    for (const r of pool.requeue) r.readyIn -= dt;
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
      if (entry.dialRingEl && openTaskId === t.id) paintRing(entry.dialRingEl, t);
    }
  }

  function reset() {
    cards.clear();
    openTaskId = null;
    dialEl.hidden = true;
    dialEl.innerHTML = '';
    stackEl.innerHTML = '';
    if (toastStack) toastStack.innerHTML = '';
    pool.bag = [];
    pool.requeue.length = 0;
    pool.requeues.clear();
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
    update, // GAME dt — drives requeue timers
    updateRings,
    reset,
    get pendingCount() {
      return cards.size;
    },
  };
}
