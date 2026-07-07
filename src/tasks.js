// ============================================================================
// tasks.js — the spawn engine. Channel-generic: it owns run-phase pacing,
// phase channel-weighting, per-run guarantees, and per-task ttl countdown.
// Channels register themselves and own their content pools: each channel
// supplies pickTemplate(phaseKey) (its own bag / no-repeat / spam logic) and
// optionally guaranteedItems() and resetPool(). The engine picks WHICH channel
// spawns; the channel picks WHAT.
//
// Everything is driven by the game-dt passed into update() — no wall-clock
// timers anywhere, so coffee slow-mo and tab-pause come for free.
// ============================================================================

let _taskSeq = 0;

// Run-time phase table. Each phase: [startT, endT) in run seconds, plus the
// spawn-interval window (randomized inside) and the ttl scale for that phase.
const PHASES = [
  // Short, punchy warm-up then a fast climb — playtest wanted it to get busy
  // and fun sooner. Scaled to the one-minute workday: the opening script
  // (email@0 + text@~2.5s) still eases you in, but "busy" hits at 0:10 and
  // "chaos" at 0:38, so the finale is a genuine crunch.
  { key: 'warmup', start: 0, end: 8, minGap: 2.5, maxGap: 3.4, ttlScale: 1.15 },
  { key: 'busy', start: 8, end: 34, minGap: 1.8, maxGap: 2.6, ttlScale: 0.95 },
  { key: 'chaos', start: 34, end: 60, minGap: 1.1, maxGap: 1.8, ttlScale: 0.75 },
];

// Per-phase channel weights. Channels that aren't registered get weight 0 and
// the remaining weights renormalize (see pickChannel). DMs pulled back (they
// felt like the loudest thing); door pushed up (players want more walk-ins).
const CHANNEL_WEIGHTS = {
  warmup: { email: 0.58, dm: 0.34, door: 0.08 },
  busy: { email: 0.38, dm: 0.26, negotiation: 0.18, invoice: 0.12, door: 0.06 },
  chaos: { email: 0.3, dm: 0.26, negotiation: 0.2, invoice: 0.16, door: 0.08 },
};

// Per-channel ttl multiplier applied on top of the phase scale — a single knob
// for "give me a bit more time on X". Emails and (especially) DMs got longer
// fuses per playtest.
const CHANNEL_TTL_SCALE = {
  email: 1.0,
  dm: 1.1,
};

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * @param {object} cfg
 * @param {(type:'spawn'|'resolve'|'expire', payload:object) => void} cfg.onEvent
 */
export function createTaskEngine({ onEvent } = {}) {
  /** @type {Map<string, object>} */
  const channels = new Map();
  /** @type {object[]} live tasks across all channels */
  const active = [];

  const state = {
    running: false,
    runTime: 0,
    nextSpawnAt: 0,
    guaranteedFired: new Set(), // per-run guarantees already spawned (by id)
  };

  function phaseFor(t) {
    for (const p of PHASES) if (t >= p.start && t < p.end) return p;
    return PHASES[PHASES.length - 1];
  }

  // --- Channel selection -----------------------------------------------------
  // Weighted pick among registered channels for the current phase. Unregistered
  // channels contribute 0; the rest renormalize automatically.
  function pickChannel(phaseKey) {
    const weights = CHANNEL_WEIGHTS[phaseKey] || {};
    const pool = [];
    let total = 0;
    for (const [key, w] of Object.entries(weights)) {
      if (w > 0 && channels.has(key)) {
        pool.push({ key, w });
        total += w;
      }
    }
    if (!pool.length) return null;
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.w;
      if (r <= 0) return p.key;
    }
    return pool[pool.length - 1].key;
  }

  function makeTask(template, channelKey, phase) {
    const chanScale = CHANNEL_TTL_SCALE[channelKey] ?? 1;
    const ttlMax = (template.ttl ?? 20) * phase.ttlScale * chanScale;
    return {
      id: `t${++_taskSeq}`,
      channel: channelKey,
      data: template,
      ttl: ttlMax,
      ttlMax,
      spawnedAt: state.runTime,
      state: 'live',
    };
  }

  function spawnTemplate(template, channelKey) {
    const phase = phaseFor(state.runTime);
    const channel = channels.get(channelKey || template.channel);
    if (!channel) return null;
    if (channel.canAccept && !channel.canAccept()) return null;
    const task = makeTask(template, channelKey || template.channel, phase);
    active.push(task);
    channel.spawn(task);
    onEvent?.('spawn', { task });
    return task;
  }

  // --- Spawn flow ------------------------------------------------------------
  // 1) Guarantees: any registered channel's guaranteed item whose phase is the
  //    active phase and hasn't fired this run → spawn it now.
  // 2) Otherwise pick a channel by phase weights, then channel.pickTemplate().
  // Spawn one task from a specific channel (opening script). Returns the task
  // or null if that channel can't produce one right now.
  function spawnChannel(channelKey, phase) {
    const channel = channels.get(channelKey);
    if (!channel?.pickTemplate) return null;
    if (channel.canAccept && !channel.canAccept()) return null;
    const template = channel.pickTemplate(phase.key);
    if (!template) return null;
    if (template.guaranteed) state.guaranteedFired.add(template.id);
    return spawnTemplate(template, channelKey);
  }

  function doSpawn() {
    const phase = phaseFor(state.runTime);

    // Scripted opening beat (e.g. force an early creator text). Consumed once.
    if (state.forceNextChannel) {
      const forced = state.forceNextChannel;
      state.forceNextChannel = null;
      const task = spawnChannel(forced, phase);
      if (task) return task;
      // fall through to normal selection if the forced channel couldn't spawn
    }

    for (const [key, channel] of channels) {
      if (!channel.guaranteedItems) continue;
      for (const g of channel.guaranteedItems()) {
        if (g.guaranteed === phase.key && !state.guaranteedFired.has(g.id)) {
          state.guaranteedFired.add(g.id);
          return spawnTemplate(g, key);
        }
      }
    }

    const channelKey = pickChannel(phase.key);
    if (!channelKey) return null;
    let channel = channels.get(channelKey);
    let key = channelKey;
    let template = null;
    if (channel?.pickTemplate) {
      const cantAccept = channel.canAccept && !channel.canAccept();
      template = cantAccept ? null : channel.pickTemplate(phase.key);
    }
    // Fall back to email so a spawn tick is never lost silently when the picked
    // channel is full (canAccept false) or has nothing to hand back (null).
    if (!template && key !== 'email' && channels.has('email')) {
      key = 'email';
      channel = channels.get('email');
      const cantAccept = channel.canAccept && !channel.canAccept();
      template = cantAccept ? null : channel.pickTemplate?.(phase.key);
    }
    if (!template) return null;
    // If a channel hands back a guaranteed item on its own, don't let the
    // guarantee fire it again later.
    if (template.guaranteed) state.guaranteedFired.add(template.id);
    return spawnTemplate(template, key);
  }

  function scheduleNext() {
    const phase = phaseFor(state.runTime);
    state.nextSpawnAt = state.runTime + rand(phase.minGap, phase.maxGap);
  }

  // --- Public API ------------------------------------------------------------
  function registerChannel(key, api) {
    channels.set(key, api);
  }

  function startRun() {
    state.running = true;
    state.runTime = 0;
    state.guaranteedFired = new Set();
    state.forceNextChannel = null;
    active.length = 0;
    for (const channel of channels.values()) channel.resetPool?.();
    // Scripted opening: an email is ALREADY waiting the instant the day starts
    // (act immediately — don't sit staring at an empty inbox), and a creator
    // text lands a couple seconds later so the phone isn't silent for long.
    spawnChannel('email', phaseFor(0));
    state.forceNextChannel = 'dm';
    state.nextSpawnAt = rand(2, 3);
  }

  function endRun() {
    state.running = false;
    // Leave active tasks in place; the channel decides what to do with them
    // (the report freeze). resetRun() clears them on RUN IT BACK.
  }

  function resetRun() {
    state.running = false;
    state.runTime = 0;
    active.length = 0;
    state.guaranteedFired = new Set();
    for (const channel of channels.values()) channel.resetPool?.();
  }

  function update(dt) {
    if (!state.running) return;
    state.runTime += dt;

    // Spawn timer.
    while (state.running && state.runTime >= state.nextSpawnAt) {
      doSpawn();
      scheduleNext();
    }

    // Per-task ttl countdown; expire at 0.
    for (let i = active.length - 1; i >= 0; i--) {
      const task = active[i];
      if (task.state !== 'live') continue;
      task.ttl -= dt;
      if (task.ttl <= 0) {
        task.ttl = 0;
        task.state = 'expired';
        active.splice(i, 1);
        const channel = channels.get(task.channel);
        channel?.expire?.(task);
        onEvent?.('expire', { task });
      }
    }
  }

  /** Channels call this when the player acts on a task. */
  function resolve(task, result) {
    const idx = active.indexOf(task);
    if (idx >= 0) active.splice(idx, 1);
    if (task.state === 'live') task.state = 'resolved';
    onEvent?.('resolve', { task, result });
  }

  function pendingCount(channelKey) {
    let n = 0;
    for (const t of active) {
      if (t.state !== 'live') continue;
      if (!channelKey || t.channel === channelKey) n++;
    }
    return n;
  }

  return {
    registerChannel,
    startRun,
    endRun,
    resetRun,
    update,
    resolve,
    pendingCount,
    get phase() {
      return phaseFor(state.runTime).key;
    },
    get runTime() {
      return state.runTime;
    },
    get active() {
      return active;
    },
  };
}
