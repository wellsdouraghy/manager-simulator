// ============================================================================
// meters.js — the run's scoreboard. Slice 2 shipped the commission counter and
// the single applyEffects() entry point channels use to score a resolution.
// Slice 3 adds the talent-happiness system: per-creator 0–100 happiness, the
// bottom-left hearts HUD, a leaves-callback when a creator hits 0, and the
// avgResponseTime stat fed by EVERY task resolve (both channels route through
// applyEffects). Burnout stays a bare number (HUD lands slice 5).
// ============================================================================

const roundK = (n) => Math.round(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const START_HAPPINESS = 58;
const CRACK_LOSS = 8; // a loss this big triggers the heart-crack animation
const BAD_CHOICE_PENALTY = 1200; // flat $ hit for any wrong reply (read the email!)
const WARN_HAPPINESS = 30; // below this, warn the player a creator may leave

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.hud  The HUD layer; meters build their DOM in here.
 * @param {Array<{id,name,emoji}>} [cfg.creators]  The roster (main.js passes it).
 */
export function createMeters({ hud, creators = [] }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Commission HUD --------------------------------------------------------
  const wrap = document.createElement('div');
  wrap.className = 'hud-commission';
  const counter = document.createElement('div');
  counter.className = 'commission-value';
  wrap.appendChild(counter);
  const combo = document.createElement('div');
  combo.className = 'commission-combo';
  wrap.appendChild(combo);
  // Burnout is an internal stress mechanic (drives scene desaturation + Last
  // Stand). The numeric "🔥 N%" HUD readout was removed — it sat at 0% most of
  // the run and read as a confusing, meaningless gauge. Kept as a detached
  // element so renderBurnout() and the rest of the code path stay unchanged.
  const burnoutEl = document.createElement('div');
  burnoutEl.className = 'commission-burnout';
  hud.appendChild(wrap);

  // --- Hearts HUD ------------------------------------------------------------
  // The bottom-left hearts row was removed per playtest feedback (creators are
  // deliberately anonymous now). The DOM is still built so the internal
  // happiness/leaves mechanic and its render code keep working — it just never
  // gets appended to the HUD. Talent-retained hearts still show on the report.
  const heartsRow = document.createElement('div');
  heartsRow.className = 'hud-hearts';
  // (intentionally not appended to `hud`)
  // creatorId -> { creator, el, emojiEl, nameEl }
  const heartEls = new Map();

  function buildHearts() {
    heartsRow.innerHTML = '';
    heartEls.clear();
    for (const c of creators) {
      const el = document.createElement('div');
      el.className = 'heart-badge';
      el.dataset.creator = c.id;
      el.innerHTML = `
        <span class="heart-icon">💜</span>
        <span class="heart-name"></span>
      `;
      el.querySelector('.heart-name').textContent = c.name;
      heartsRow.appendChild(el);
      heartEls.set(c.id, {
        creator: c,
        el,
        emojiEl: el.querySelector('.heart-icon'),
        nameEl: el.querySelector('.heart-name'),
      });
    }
  }

  const state = {
    commission: 0,
    displayed: 0, // eased toward commission for the ticking animation
    burnout: 0,
    peakBurnout: 0, // high-water mark for the report
    // creatorId -> happiness 0..100
    happiness: new Map(),
    gone: new Set(),
    warned: new Set(), // creators we've already warned are about to leave
    stats: freshStats(),
  };

  // main.js assigns this; fired whenever burnout changes so it can drive the
  // scene-decay / Last-Stand reactions without polling.
  let onBurnoutChange = null;
  // main.js assigns this; fired on every commission change with the amount and
  // a { source, channel } hint so the juice pass can spawn a station floater.
  let onCommission = null;

  function freshStats() {
    return {
      emailsHandled: 0,
      dmsHandled: 0,
      dealsHandled: 0,
      dealsAttempted: 0, // negotiation spawns (slice 6a)
      dealsClosedTarget: 0, // negotiation resolves closed on YOUR terms
      invoicesPaid: 0,
      coffees: 0, // coffee.drink() increments (slice 6a)
      completed: false, // set true when a run reaches 6PM (fail runs stay false)
      creatorsLost: 0,
      spamArchived: 0,
      quickCallsTaken: 0,
      quickCallsOffered: 0,
      bestCombo: 0,
      expired: 0,
      responseTimes: [],
      byQuality: { good: 0, bad: 0, neutral: 0 },
      rivalIgnored: false,
      failReason: null,
    };
  }

  function initRoster() {
    state.happiness.clear();
    state.gone.clear();
    state.warned.clear();
    for (const c of creators) state.happiness.set(c.id, START_HAPPINESS);
    buildHearts();
    renderHearts();
  }

  const fmt = (n) => '$' + roundK(n).toLocaleString('en-US');

  function render() {
    counter.textContent = fmt(state.displayed);
    counter.classList.toggle('negative', state.commission < 0);
  }
  render();

  // --- Burnout ---------------------------------------------------------------
  function renderBurnout() {
    burnoutEl.textContent = `🔥 ${Math.round(state.burnout)}%`;
    burnoutEl.classList.toggle('urgent', state.burnout >= 70);
  }
  renderBurnout();

  // The single clamped mutator for burnout. Every path (applyEffects, coffee,
  // central expire hook, Last Stand recovery) routes through here so peak +
  // the change callback stay correct.
  function addBurnout(n) {
    if (!n) {
      renderBurnout();
      return state.burnout;
    }
    state.burnout = clamp(state.burnout + n, 0, 100);
    if (state.burnout > state.peakBurnout) state.peakBurnout = state.burnout;
    renderBurnout();
    onBurnoutChange?.(state.burnout);
    return state.burnout;
  }
  function setBurnout(v) {
    state.burnout = clamp(v, 0, 100);
    if (state.burnout > state.peakBurnout) state.peakBurnout = state.burnout;
    renderBurnout();
    onBurnoutChange?.(state.burnout);
    return state.burnout;
  }

  // --- Hearts render ---------------------------------------------------------
  function renderHeart(id) {
    const h = heartEls.get(id);
    if (!h) return;
    const v = state.happiness.get(id) ?? 0;
    const gone = state.gone.has(id);
    h.el.classList.toggle('gone', gone);
    h.el.classList.toggle('critical', !gone && v < 30);
    h.el.classList.toggle('worn', !gone && v >= 30 && v <= 60);
    h.el.classList.toggle('full', !gone && v > 60);
    h.emojiEl.textContent = gone ? '💔' : '💜';
  }
  function renderHearts() {
    for (const id of heartEls.keys()) renderHeart(id);
  }

  // Per-frame ease so the counter ticks up/down smoothly. Driven from the HUD
  // updater in main.js (real dt is fine — this is pure juice).
  function updateVisual(dt) {
    if (Math.abs(state.displayed - state.commission) < 0.5) {
      if (state.displayed !== state.commission) {
        state.displayed = state.commission;
        render();
      }
      return;
    }
    state.displayed += (state.commission - state.displayed) * (1 - Math.exp(-9 * dt));
    render();
  }

  function popCounter(gain) {
    counter.classList.remove('pop', 'dip');
    // reflow to restart the animation
    void counter.offsetWidth;
    counter.classList.add(gain >= 0 ? 'pop' : 'dip');
  }

  function addCommission(amount, { source, channel } = {}) {
    if (!amount) return 0;
    state.commission += amount;
    popCounter(amount);
    onCommission?.(amount, { source, channel });
    return amount;
  }

  function showCombo(text) {
    combo.textContent = text;
    combo.classList.remove('show');
    void combo.offsetWidth;
    combo.classList.add('show');
  }
  function hideCombo() {
    combo.classList.remove('show');
  }

  // --- Happiness -------------------------------------------------------------
  // main.js assigns this; fired ONCE per creator when happiness hits 0.
  let onCreatorLeaves = () => {};
  // main.js assigns this; fired ONCE per creator when they get critically low.
  let onCreatorWarning = () => {};

  function heartCrack(id) {
    if (reducedMotion) return;
    const h = heartEls.get(id);
    if (!h) return;
    h.el.classList.remove('crack');
    void h.el.offsetWidth;
    h.el.classList.add('crack');
    h.el.addEventListener(
      'animationend',
      () => h.el.classList.remove('crack'),
      { once: true },
    );
  }

  function addHappiness(creatorId, delta, { reason } = {}) {
    if (!state.happiness.has(creatorId)) return 0;
    if (state.gone.has(creatorId)) return 0;
    const prev = state.happiness.get(creatorId);
    const next = clamp(prev + delta, 0, 100);
    state.happiness.set(creatorId, next);
    if (prev - next >= CRACK_LOSS) heartCrack(creatorId);
    renderHeart(creatorId);
    // On the way down: fire a one-time warning when a creator gets critical, so
    // the player (who has no hearts HUD) knows they're about to lose someone.
    if (
      next > 0 &&
      next <= WARN_HAPPINESS &&
      prev > WARN_HAPPINESS &&
      !state.warned.has(creatorId)
    ) {
      state.warned.add(creatorId);
      onCreatorWarning(creators.find((c) => c.id === creatorId));
    }
    if (next <= 0 && !state.gone.has(creatorId)) {
      // Mark gone FIRST, then fire (so isGone is already true in the callback).
      state.gone.add(creatorId);
      state.stats.creatorsLost++;
      renderHeart(creatorId);
      const creator = creators.find((c) => c.id === creatorId);
      onCreatorLeaves(creator);
    }
    return next;
  }

  function happinessOf(creatorId) {
    return state.happiness.get(creatorId) ?? 0;
  }
  function isGone(creatorId) {
    return state.gone.has(creatorId);
  }

  // --- Response-speed bonus --------------------------------------------------
  // On a good resolve, a fraction of the base commission scaled by remaining
  // ttl. Returns the bonus (already added by applyEffects).
  function noteResponseSpeed(task, baseCommission) {
    if (!task || !task.ttlMax) return 0;
    const frac = Math.max(0, Math.min(1, task.ttl / task.ttlMax));
    const bonus = roundK(baseCommission * 0.3 * frac);
    return bonus;
  }

  // --- The single scoring entry point ---------------------------------------
  // Returns a summary the channel can use for toasts. EVERY resolve (email +
  // dm) routes through here, so this is where we record response times.
  function applyEffects(effects = {}, task) {
    const out = { commission: 0, speedBonus: 0, quality: effects.quality };

    // Response time: seconds it took to act (both channels).
    if (task && task.ttlMax > 0) {
      state.stats.responseTimes.push(task.ttlMax - task.ttl);
    }

    // Burnout: explicit effect plus a flat +3 for any 'bad' resolution. Both
    // stack and route through the clamped mutator.
    let burnoutDelta = typeof effects.burnout === 'number' ? effects.burnout : 0;
    if (effects.quality === 'bad') burnoutDelta += 5;
    if (burnoutDelta) addBurnout(burnoutDelta);

    // Happiness routes to the task's creator (DM channel), or an explicit id.
    if (typeof effects.happiness === 'number' && effects.happiness !== 0) {
      const creatorId = effects.creator || task?.data?.creator;
      if (creatorId) addHappiness(creatorId, effects.happiness, { reason: task?.data?.id });
    }

    if (typeof effects.commission === 'number' && effects.commission !== 0) {
      addCommission(effects.commission, { source: task?.data?.id, channel: task?.channel });
      out.commission += effects.commission;
    }

    // Wrong-choice tax: any 'bad' reply also costs a flat commission penalty on
    // top of its authored effect, so randomly clicking (≈half your picks land
    // bad) visibly tanks the score. Reading the email is the game.
    if (effects.quality === 'bad') {
      addCommission(-BAD_CHOICE_PENALTY, { source: 'wrongChoice', channel: task?.channel });
      out.commission -= BAD_CHOICE_PENALTY;
      out.wrongChoice = true;
    }

    // Speed bonus only on genuinely good resolutions with a positive base.
    if (effects.quality === 'good' && effects.commission > 0) {
      const bonus = noteResponseSpeed(task, effects.commission);
      if (bonus) {
        addCommission(bonus, { source: 'speed', channel: task?.channel });
        out.speedBonus = bonus;
        out.commission += bonus;
      }
    }

    if (effects.quality) {
      state.stats.byQuality[effects.quality] =
        (state.stats.byQuality[effects.quality] || 0) + 1;
    }
    if (effects.flag === 'rivalIgnored') state.stats.rivalIgnored = true;

    return out;
  }

  function reset() {
    state.commission = 0;
    state.displayed = 0;
    state.burnout = 0;
    state.peakBurnout = 0;
    state.stats = freshStats();
    initRoster();
    hideCombo();
    render();
    renderBurnout();
  }

  // First build so hearts exist before the first run.
  initRoster();

  return {
    addCommission,
    applyEffects,
    addHappiness,
    addBurnout,
    setBurnout,
    happinessOf,
    isGone,
    noteResponseSpeed,
    updateVisual,
    showCombo,
    hideCombo,
    reset,
    set onCreatorLeaves(fn) {
      onCreatorLeaves = fn || (() => {});
    },
    get onCreatorLeaves() {
      return onCreatorLeaves;
    },
    set onCreatorWarning(fn) {
      onCreatorWarning = fn || (() => {});
    },
    get onCreatorWarning() {
      return onCreatorWarning;
    },
    set onBurnoutChange(fn) {
      onBurnoutChange = fn || null;
    },
    get onBurnoutChange() {
      return onBurnoutChange;
    },
    set onCommission(fn) {
      onCommission = fn || null;
    },
    get onCommission() {
      return onCommission;
    },
    get commission() {
      return state.commission;
    },
    get burnout() {
      return state.burnout;
    },
    get peakBurnout() {
      return state.peakBurnout;
    },
    get creatorsLost() {
      return state.stats.creatorsLost;
    },
    get avgResponseTime() {
      const rt = state.stats.responseTimes;
      if (!rt.length) return 0;
      return rt.reduce((a, b) => a + b, 0) / rt.length;
    },
    get stats() {
      return state.stats;
    },
  };
}
