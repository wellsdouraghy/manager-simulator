// ============================================================================
// channels/email.js — the inbox. A Superhuman-style list inside the main
// monitor panel: header + scrollable rows, each with a conic-gradient
// countdown ring driven per-frame from task.ttl (no CSS animation, so it
// respects pause and timeScale). Click a row → full email view with fat reply
// chips; one click resolves.
//
// Special chips: 'archive' (spam combo), 'call' (10s real-time phone lock),
// 'coinflip' (50/50), 'flagRival'. The engine calls spawn/expire/canAccept;
// the channel calls engine.resolve() and scores via meters.applyEffects().
// ============================================================================

import { EMAIL_TOASTS, EMAILS, AUGUST, LOCK_MESSAGES } from '../content.js';

const augustStampText = AUGUST.handledStamp;

const CALL_SECONDS = 10; // real-time phone lock for "Sure, calling now"

// --- Content pool (owned by the email channel as of slice 3) -----------------
// Exclude invoice-routed items (slice 4) and split spam vs gameplay so we can
// weight ~1-in-3 spawns spam. Behaviour is identical to slice-2's engine pool.
const POOL = EMAILS.filter((e) => e.route !== 'invoice');
const SPAM = POOL.filter((e) => e.spam);
const GAMEPLAY = POOL.filter((e) => !e.spam && !e.guaranteed);
const GUARANTEED = POOL.filter((e) => e.guaranteed);

export function createEmailChannel({ panelEl, engine, meters, rig, content }) {
  const toastCopy = content?.EMAIL_TOASTS || EMAIL_TOASTS;

  // task.id -> { task, rowEl, ringEl }
  const rows = new Map();
  let openTaskId = null; // the task shown in the full view, or null (list)
  let spamCombo = 0;

  // --- Spawn-pool bookkeeping (moved out of tasks.js) ----------------------
  const pool = {
    bag: [], // shuffled { id, kind } remaining before reshuffle
    usedOneShots: new Set(), // guaranteed/one-shot ids already consumed
  };

  function refillBag() {
    const spamIds = SPAM.map((e) => e.id);
    const playIds = GAMEPLAY.map((e) => e.id).filter(
      (id) => !pool.usedOneShots.has(id),
    );
    // Interleave with a rough 1:2 spam:gameplay ratio by tagging each id.
    const bag = [
      ...spamIds.map((id) => ({ id, kind: 'spam' })),
      ...playIds.map((id) => ({ id, kind: 'play' })),
    ];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    pool.bag = bag;
  }

  // Engine calls this after picking the email channel. ~1-in-3 spam, no repeats
  // until the relevant sub-pool exhausts, then reshuffle (one-shots excluded).
  function pickTemplate() {
    const wantSpam = Math.random() < 1 / 3 && SPAM.length > 0;
    if (pool.bag.length === 0) refillBag();
    let idx = pool.bag.findIndex((b) => b.kind === (wantSpam ? 'spam' : 'play'));
    if (idx < 0) idx = 0;
    const [chosen] = pool.bag.splice(idx, 1);
    if (!chosen) {
      refillBag();
      return pickTemplate();
    }
    const tpl = POOL.find((e) => e.id === chosen.id);
    if (tpl?.guaranteed) pool.usedOneShots.add(tpl.id);
    return tpl;
  }

  // The PR-fire email is a chaos guarantee; the engine fires it once.
  function guaranteedItems() {
    return GUARANTEED;
  }

  function resetPool() {
    pool.bag = [];
    pool.usedOneShots = new Set();
    refillBag();
  }

  // Active "quick call" state, driven by unscaled real dt via updateReal().
  let call = null; // { task, chip, remaining, indicatorEl }

  // --- DOM skeleton ----------------------------------------------------------
  panelEl.classList.add('email-panel');
  panelEl.innerHTML = `
    <div class="email-header">
      <div class="email-brand">📥 Inbox</div>
      <div class="email-unread"><span class="email-unread-n">0</span> unread</div>
    </div>
    <div class="email-list" data-view="list"></div>
    <div class="email-open" data-view="open" hidden></div>
    <div class="email-toast-stack"></div>
    <div class="email-call-indicator" hidden>📞 <span>On a call…</span></div>
  `;
  const listEl = panelEl.querySelector('.email-list');
  const openEl = panelEl.querySelector('.email-open');
  const unreadEl = panelEl.querySelector('.email-unread-n');
  const toastStack = panelEl.querySelector('.email-toast-stack');
  const callIndicator = panelEl.querySelector('.email-call-indicator');

  // Empty state — lives inside the list so it swaps out with the first row.
  const emptyEl = document.createElement('div');
  emptyEl.className = 'email-empty';
  emptyEl.textContent = toastCopy.emptyInbox;
  listEl.appendChild(emptyEl);

  function updateUnread() {
    unreadEl.textContent = String(rows.size);
    emptyEl.hidden = rows.size > 0;
  }

  function toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `email-toast ${kind}`.trim();
    t.textContent = text;
    toastStack.appendChild(t);
    // Fade + remove is animated in CSS; we drive removal off animationend so
    // no wall-clock timers leak into game logic.
    t.addEventListener('animationend', (e) => {
      if (e.animationName === 'toastOut') t.remove();
    });
  }

  // --- List rows -------------------------------------------------------------
  function buildRow(task) {
    const d = task.data;
    const row = document.createElement('button');
    row.className = 'email-row';
    row.dataset.taskId = task.id;
    if (d.spam) row.classList.add('is-spam');
    row.innerHTML = `
      <div class="email-ring"><div class="email-ring-hole">✉️</div></div>
      <div class="email-row-main">
        <div class="email-row-top">
          <span class="email-sender"></span>
        </div>
        <div class="email-subject"></div>
        <div class="email-preview"></div>
      </div>
    `;
    row.querySelector('.email-sender').textContent = d.sender;
    row.querySelector('.email-subject').textContent = d.subject;
    row.querySelector('.email-preview').textContent = d.preview;
    row.addEventListener('click', () => openTask(task.id));
    return { row, ring: row.querySelector('.email-ring') };
  }

  // The best chip quality on an email (used for the August pre-glow cue).
  function bestQuality(data) {
    for (const chip of data.chips || []) {
      if (chip.effects?.quality === 'good') return 'good';
    }
    return null;
  }

  function spawn(task) {
    const { row, ring } = buildRow(task);
    const entry = { task, rowEl: row, ringEl: ring };
    // July AI is COACH-ONLY: it never resolves anything for you (auto-clearing
    // the inbox was too easy) — it only highlights the right reply via
    // applyAugustGlow + the "✓ July AI" chip pill. You still do every task.
    rows.set(task.id, entry);
    listEl.appendChild(row);
    updateUnread();
    // The "Quick call?" email is a call offer regardless of how it's resolved.
    if (task.data.id === 'quickcall') meters.stats.quickCallsOffered++;
    applyAugustGlow(entry);
  }

  // Mint left-edge pre-glow on rows whose best chip is a 'good' quality, only
  // while August Mode is on (body flag). Cheap; re-applied each frame in update.
  function applyAugustGlow(entry) {
    const on = document.body.dataset.august === '1';
    const good = on && bestQuality(entry.task.data) === 'good';
    entry.rowEl.classList.toggle('august-good', good);
  }

  // No-op: July AI is coach-only now — it never auto-resolves emails (that was
  // too easy). Kept so main.js's per-frame call stays valid.
  function updateAugust() {}

  function expire(task) {
    const entry = rows.get(task.id);
    if (!entry) return;
    rows.delete(task.id);
    updateUnread();
    meters.stats.expired++;
    resetCombo();
    if (openTaskId === task.id) showList();
    const el = entry.rowEl;
    el.classList.add('expired');
    toast(toastCopy.expired, 'bad');
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'rowExpire') el.remove();
    });
  }

  function canAccept() {
    return true; // no inbox cap this slice
  }

  // --- Open / full view ------------------------------------------------------
  function showList() {
    openTaskId = null;
    openEl.hidden = true;
    listEl.hidden = false;
  }

  function openTask(taskId) {
    const entry = rows.get(taskId);
    if (!entry) return;
    openTaskId = taskId;
    const d = entry.task.data;

    openEl.innerHTML = `
      <div class="email-open-bar">
        <button class="email-back">← Inbox</button>
        <div class="email-ring email-open-ring"><div class="email-ring-hole">✉️</div></div>
      </div>
      <div class="email-open-from"></div>
      <div class="email-open-subject"></div>
      <div class="email-open-body"></div>
      <div class="email-chips"></div>
    `;
    openEl.querySelector('.email-open-from').textContent = `${d.sender}  ·  ${d.from}`;
    openEl.querySelector('.email-open-subject').textContent = d.subject;
    openEl.querySelector('.email-open-body').textContent = d.body;
    openEl.querySelector('.email-back').addEventListener('click', showList);

    // Move the live ring reference to the open view so the countdown keeps
    // draining while the email is open.
    entry.openRingEl = openEl.querySelector('.email-open-ring');

    const chipWrap = openEl.querySelector('.email-chips');
    const augustOn = document.body.dataset.august === '1';
    for (const chip of d.chips) {
      const btn = document.createElement('button');
      btn.className = 'email-chip';
      if (chip.effects?.quality) btn.classList.add(`q-${chip.effects.quality}`);
      btn.textContent = chip.label;
      // July AI plainly points at the right reply so the run is easy.
      if (augustOn && chip.effects?.quality === 'good') {
        const tag = document.createElement('span');
        tag.className = 'chip-suggest';
        tag.textContent = `✓ ${AUGUST.suggests}`;
        btn.appendChild(tag);
      }
      btn.addEventListener('click', () => onChip(entry.task, chip));
      chipWrap.appendChild(btn);
    }

    listEl.hidden = true;
    openEl.hidden = false;
  }

  // --- Combo -----------------------------------------------------------------
  function resetCombo() {
    if (spamCombo > 0) meters.hideCombo();
    spamCombo = 0;
  }

  // --- Chip resolution -------------------------------------------------------
  function removeTaskRow(task) {
    const entry = rows.get(task.id);
    if (entry) {
      rows.delete(task.id);
      entry.rowEl.remove();
      updateUnread();
    }
  }

  function finishResolve(task, chip, result) {
    engine.resolve(task, result);
    removeTaskRow(task);
    meters.stats.emailsHandled++;
    if (openTaskId === task.id) showList();
  }

  function onChip(task, chip) {
    if (task.state !== 'live') return;
    const effects = chip.effects || {};
    const special = effects.special;

    // Special: quick call — lock the camera to the phone for 10 real seconds,
    // resolve + pay on unlock. Handled in updateReal(). We resolve the task
    // now (removes it from the inbox + engine) but defer the payout.
    if (special === 'call') {
      meters.stats.quickCallsTaken++;
      // Bookkeeping: this chip was the "offered" call path too.
      startCall(task, chip);
      // Remove from list/engine immediately; payout happens on call end.
      engine.resolve(task, { pending: 'call' });
      removeTaskRow(task);
      if (openTaskId === task.id) showList();
      return;
    }

    if (special === 'coinflip') {
      const win = Math.random() < 0.5;
      const payout = win ? effects.coinflip.win : effects.coinflip.lose;
      meters.applyEffects({ commission: payout, quality: win ? 'good' : 'bad' }, task);
      toast(win ? toastCopy.coinflipWin : toastCopy.coinflipLose, win ? 'good' : 'bad');
      finishResolve(task, chip, { coinflip: win });
      resetCombo();
      return;
    }

    if (special === 'archive') {
      const isSpam = !!task.data.spam;
      if (isSpam) {
        spamCombo++;
        meters.stats.spamArchived++;
        if (spamCombo > meters.stats.bestCombo) meters.stats.bestCombo = spamCombo;
        const payout = 50 * spamCombo;
        meters.applyEffects({ commission: payout, quality: 'neutral' }, task);
        meters.showCombo(toastCopy.combo(spamCombo));
      } else {
        // Archiving a non-spam email applies its (usually neutral) effects.
        meters.applyEffects(effects, task);
        resetCombo();
      }
      finishResolve(task, chip, { archived: true });
      return;
    }

    // A bad (non-archive) chip breaks the spam combo.
    if (effects.quality === 'bad') resetCombo();

    if (special === 'flagRival') {
      toast(toastCopy.flagRival, 'good');
    }

    const summary = meters.applyEffects(effects, task);
    if (chip.toast) toast(chip.toast, effects.quality === 'bad' ? 'good' : '');
    else if (summary.speedBonus) toast(`+$${summary.speedBonus} fast-reply bonus`, 'good');

    finishResolve(task, chip, summary);
  }

  // --- Quick call (real-time lock) ------------------------------------------
  function startCall(task, chip) {
    rig.lock('phone', LOCK_MESSAGES.call);
    call = { task, chip, remaining: CALL_SECONDS };
    callIndicator.hidden = false;
    toast(toastCopy.call);
  }

  function endCall() {
    if (!call) return;
    const { chip, task } = call;
    rig.unlock();
    callIndicator.hidden = true;
    // Pay out the call now that it's over (task already resolved).
    meters.applyEffects(chip.effects, task);
    meters.stats.emailsHandled++;
    toast(toastCopy.callDone, 'good');
    call = null;
  }

  // Real (unscaled) dt: the 10-second call is wall-clock-feeling but still
  // frame-driven and pause-safe (main.js early-returns while tab-hidden).
  function updateReal(rawDt) {
    if (!call) return;
    call.remaining -= rawDt;
    if (call.remaining <= 0) endCall();
  }

  // endDay safety: force any in-flight call to settle immediately (pay + unlock)
  // so the report never shows behind a locked camera or drops a payout.
  function forceEndCall() {
    if (call) endCall();
  }

  // --- Per-frame ring update (game dt not needed; reads task.ttl) -----------
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

  // Called every frame from main.js; walks live rows and repaints rings + the
  // August pre-glow cue (so a mid-run toggle takes effect immediately).
  function update() {
    for (const entry of rows.values()) {
      const t = entry.task;
      if (t.state !== 'live') continue;
      paintRing(entry.ringEl, t);
      if (entry.openRingEl && openTaskId === t.id) paintRing(entry.openRingEl, t);
      applyAugustGlow(entry);
    }
  }

  function reset() {
    rows.clear();
    openTaskId = null;
    spamCombo = 0;
    call = null;
    callIndicator.hidden = true;
    listEl.innerHTML = '';
    listEl.appendChild(emptyEl); // innerHTML='' orphans the empty state
    openEl.innerHTML = '';
    toastStack.innerHTML = '';
    showList();
    updateUnread();
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
    updateAugust, // GAME dt — scope-creep auto-handle when August is on
    forceEndCall,
    reset,
    get pendingCount() {
      return rows.size;
    },
    get inCall() {
      return !!call;
    },
  };
}
