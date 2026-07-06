// ============================================================================
// main.js — bootstrap, the game loop, global timeScale, and the run state
// machine (title → running → report). Slice 2 wires the task engine, meters,
// the email channel, and station attention cues on top of slice 1's world.
// ============================================================================

import * as THREE from 'three';
import {
  applyPaletteToCSS,
  TITLE_SCREEN,
  INSTRUCTIONS,
  EMAIL_TOASTS,
  DAMAGE_LABELS,
  PRAISE_LABELS,
  DM_TOASTS,
  CREATORS,
  CREATOR_LEAVES,
  LOCK_MESSAGES,
  DEAL_BOARD,
  NEGOTIATIONS,
  INVOICES,
  TONE_STOPS,
  TONE_MIN_DAYS,
  NEGOTIATION_GREEN_ZONE,
  DOOR_EVENTS,
  BURNOUT,
  AUGUST,
  AUGUST_NAME,
  SOUND,
} from './content.js';
import * as CONTENT from './content.js';
import { createSceneManager } from './world/scene.js';
import { buildRoom } from './world/room.js';
import { buildDesk } from './world/desk.js';
import { addLights } from './world/lights.js';
import { createCameraRig } from './camera.js';
import { createScreenPanel } from './screens.js';
import { createTaskEngine } from './tasks.js';
import { createMeters } from './meters.js';
import { createEmailChannel } from './channels/email.js';
import { createDMChannel } from './channels/dms.js';
import { createNegotiationChannel } from './channels/negotiation.js';
import { createInvoiceChannel } from './channels/invoice.js';
import { createDoorChannel } from './channels/door.js';
import { createAttention } from './attention.js';
import { createJuice } from './juice.js';
import { createInteract } from './interact.js';
import { createStorage } from './storage.js';
import { createReport } from './report.js';

// --- Global game state (imported by later systems) ----------------------------
export const G = {
  timeScale: 1, // coffee slow-mo dials this down; camera/UI ignore it
  runState: 'title', // title | running | report
  dayT: 0, // 0..1 across the 180s workday
  paused: false, // creator-leaves overlay freezes the running block + channels
};

export const DAY_LENGTH = 180; // seconds, 9:00 AM → 6:00 PM

// Burnout points shed per game-second while running — the passive relief that
// replaced coffee. Tuned below the damage rates so chaos still bites.
const BURNOUT_RECOVERY = 1.1;

// --- Boot ---------------------------------------------------------------------
applyPaletteToCSS();

const app = document.getElementById('app');
const world = createSceneManager(app);

const room = buildRoom();
world.scene.add(room.group);

const desk = buildDesk();
world.scene.add(desk.group);

const lights = addLights(world.scene, desk.glowPositions);

const rig = createCameraRig(world.camera);

// --- Persistence (best commission, August unlock/on, sound) -------------------
const storage = createStorage();

// August Mode boot state: body flag + a live `august` object main.js reads.
const august = {
  unlocked: storage.getAugustUnlocked(),
  on: storage.getAugustOn(),
  usedThisRun: false, // sampled at startDay + on mid-run toggle
};
function applyAugustBodyFlag() {
  document.body.dataset.august = august.on ? '1' : '';
}
applyAugustBodyFlag();

// Juice toolkit (shake / vignette / decay / jitter / damage flash / floaters /
// confetti / sound). Created early so the engine's expire hook and the burnout
// reactions can use it. Storage drives the persisted sound toggle.
const juice = createJuice({ world, rig, storage });

// --- Screen panels -------------------------------------------------------------
// Inbox is the live email channel; phone is the live DM channel this slice.
// Deals stays a placeholder (negotiation lands slice 4).
const inboxPanel = createScreenPanel('inbox');
world.registerScreen({ ...desk.screens.inbox, dom: inboxPanel });

const phonePanel = createScreenPanel('phone');
world.registerScreen({ ...desk.screens.phone, dom: phonePanel });

// Deals panel becomes the kanban-ish deal board: header + two columns, each
// handed to its channel (negotiation / invoice) below.
const dealsPanel = createScreenPanel('deals');
dealsPanel.classList.add('deal-board');
dealsPanel.innerHTML = `
  <div class="deal-board-head">
    <span class="deal-board-title">${DEAL_BOARD.title}</span>
    <span class="deal-board-sub">${DEAL_BOARD.subtitle}</span>
  </div>
  <div class="deal-board-cols">
    <div class="deal-board-col" data-col="deals"></div>
    <div class="deal-board-col" data-col="invoices"></div>
  </div>
`;
const negotiationColEl = dealsPanel.querySelector('[data-col="deals"]');
const invoiceColEl = dealsPanel.querySelector('[data-col="invoices"]');
world.registerScreen({ ...desk.screens.deals, dom: dealsPanel });

// --- Meters + task engine + channels ------------------------------------------
const meters = createMeters({ hud: world.hud, creators: CREATORS });

// Last Stand state (burnout == 100). Declared before the engine so the resolve
// hook can count clears during the window. Fully driven in the tick loop.
const lastStand = {
  active: false,
  fired: false, // once per run
  remaining: 0, // GAME-seconds left in the window
  cleared: 0, // resolves counted this window
  bannerEl: null,
};

const engine = createTaskEngine({
  onEvent(type, payload) {
    if (type === 'spawn') {
      juice.sound.spawnTick();
    } else if (type === 'expire') {
      // Central expiry damage: a loud red banner naming what you dropped, plus
      // the edge flash + shake + burnout. Channels still apply their own
      // per-task onExpire effects (e.g. happiness).
      const label = DAMAGE_LABELS[payload?.task?.channel] || DAMAGE_LABELS.default;
      juice.damage(label, 0.02);
      juice.sound.expireBuzz();
      meters.addBurnout(8);
    } else if (type === 'resolve') {
      // Count clears toward the Last Stand recovery goal.
      if (lastStand.active) lastStand.cleared++;
      onResolveJuice(payload);
    }
  },
});

const email = createEmailChannel({
  panelEl: inboxPanel,
  engine,
  meters,
  rig,
  content: { EMAIL_TOASTS },
});
engine.registerChannel('email', email);

const dms = createDMChannel({
  panelEl: phonePanel,
  engine,
  meters,
  rig,
  content: { DM_TOASTS, CREATORS },
});
engine.registerChannel('dm', dms);

const negotiation = createNegotiationChannel({
  columnEl: negotiationColEl,
  engine,
  meters,
  content: { DEAL_BOARD, NEGOTIATIONS, NEGOTIATION_GREEN_ZONE, CREATORS },
  storage,
  // Freezes the whole day so the first-negotiation tutorial is a calm teaching
  // beat (channel updates are gated on !G.paused in the tick).
  pauseGame: (on) => {
    G.paused = on;
  },
});
engine.registerChannel('negotiation', negotiation);

const invoice = createInvoiceChannel({
  columnEl: invoiceColEl,
  engine,
  meters,
  content: { DEAL_BOARD, INVOICES, TONE_STOPS, TONE_MIN_DAYS },
});
engine.registerChannel('invoice', invoice);

// --- Door walk-ins ------------------------------------------------------------
// Door walk-in event card: a CSS3D panel anchored at the door, facing in.
const doorPanel = createScreenPanel('door');
world.registerScreen({
  anchor: room.doorAnchor,
  dom: doorPanel,
  widthPx: 360,
  heightPx: 420,
  worldWidth: 0.9, // bigger so the walk-in card is readable across the room
});

const door = createDoorChannel({
  engine,
  meters,
  rig,
  room,
  world,
  juice,
  content: { DOOR_EVENTS },
  panelEl: doorPanel,
  isAtDoor: () => rig.station === 'door',
});
engine.registerChannel('door', door);

// --- 3D prop interaction (mug drink, door turn) -------------------------------
const interact = createInteract({
  world,
  targets: [
    {
      object3D: room.doorMesh,
      onClick: () => (rig.isLocked ? rig.refuseNav() : rig.goTo('door')),
    },
  ],
});

// --- Attention cues ------------------------------------------------------------
// World anchor positions for each station's "!" marker + edge arrow.
const worldPosOf = (anchor, up = 0.24) => {
  const p = new THREE.Vector3();
  desk.group.updateMatrixWorld(true);
  anchor.getWorldPosition(p);
  p.y += up;
  return p;
};
const doorPos = (() => {
  const p = new THREE.Vector3();
  room.group.updateMatrixWorld(true);
  room.doorAnchor.getWorldPosition(p);
  return p;
})();

const attention = createAttention({
  scene: world.scene,
  camera: world.camera,
  hud: world.hud,
  isFocused: (key) => rig.station === key,
  stations: [
    { key: 'inbox', worldPos: worldPosOf(desk.screens.inbox.anchor) },
    { key: 'deals', worldPos: worldPosOf(desk.screens.deals.anchor) },
    { key: 'phone', worldPos: worldPosOf(desk.screens.phone.anchor, 0.18) },
    { key: 'door', worldPos: doorPos },
  ],
});

// Map an attention-station key to its engine channel key(s), and each channel
// back to its station. The deals station fronts BOTH deal-board channels.
const CHANNELS_OF_STATION = {
  inbox: ['email'],
  phone: ['dm'],
  deals: ['negotiation', 'invoice'],
  door: ['door'],
};

// --- Juice: commission floaters + resolve celebration -------------------------
// World anchor per channel, so a commission floater launches from the right
// station and confetti bursts at the deal monitor.
const STATION_WORLD = {
  inbox: worldPosOf(desk.screens.inbox.anchor, 0),
  deals: worldPosOf(desk.screens.deals.anchor, 0),
  phone: worldPosOf(desk.screens.phone.anchor, 0),
  door: doorPos,
};
function channelWorldPos(channel) {
  const station = STATION_OF_CHANNEL[channel] || 'inbox';
  return STATION_WORLD[station] || STATION_WORLD.inbox;
}

// Every commission change spawns a floater: gold +$ arcs from the source
// station to the counter; red −$ drops from the counter.
meters.onCommission = (amount, { channel } = {}) => {
  const src = amount > 0 ? channelWorldPos(channel) : null;
  juice.commissionFloater(amount, src);
};

// Resolve celebration: deal target-close → FOV punch + confetti + shake + ding;
// LAWYERS invoice paid → smaller gold-only confetti. Also plays the resolve
// ding for ordinary clears.
function onResolveJuice(payload) {
  const result = payload?.result || {};
  const task = payload?.task;
  const channel = task?.channel;
  if (result.closed === 'target') {
    rig.punchFov(-7);
    juice.shake(0.006, 0.25);
    juice.confettiBurst(STATION_WORLD.deals, { count: 90 });
    juice.celebrate(PRAISE_LABELS.dealClosed);
    juice.sound.dealClose();
  } else if (result.paid && result.lawyers) {
    juice.confettiBurst(STATION_WORLD.deals, { count: 60, goldOnly: true });
    juice.celebrate(PRAISE_LABELS.lawyers);
    juice.sound.dealClose();
  } else if (result.paid) {
    juice.confettiBurst(STATION_WORLD.deals, { count: 40, goldOnly: true });
    juice.celebrate(PRAISE_LABELS.invoicePaid);
    juice.sound.dealClose();
  } else if (channel === 'email' || channel === 'dm' || channel === 'negotiation') {
    // Ordinary good clear: pitch up with the spam combo where relevant.
    juice.sound.resolveDing(meters.stats.bestCombo || 0);
  }
}
const STATION_OF_CHANNEL = {
  email: 'inbox',
  dm: 'phone',
  negotiation: 'deals',
  invoice: 'deals',
  door: 'door',
};

// Per-station urgency: any live task under 25% ttl.
function stationQuery(key) {
  const channels = CHANNELS_OF_STATION[key] || [key];
  let count = 0;
  for (const ch of channels) count += engine.pendingCount(ch);
  let urgent = false;
  if (count > 0) {
    for (const t of engine.active) {
      const station = STATION_OF_CHANNEL[t.channel] || t.channel;
      if (station === key && t.state === 'live' && t.ttl / t.ttlMax < 0.25) {
        urgent = true;
        break;
      }
    }
  }
  return { count, urgent };
}

// --- Run-state overlays (title / report) --------------------------------------
const overlay = document.createElement('div');
overlay.id = 'run-overlay';
world.hud.appendChild(overlay);

// The real report card (serif corporate performance-review document).
const report = createReport({ meters, content: CONTENT, storage, juice });

// --- Sound toggle (corner 🔊, bottom-right above the coffee pips) --------------
const soundToggle = document.createElement('button');
soundToggle.className = 'hud-sound';
soundToggle.title = SOUND.title;
function renderSoundToggle() {
  const on = juice.isSoundOn();
  soundToggle.textContent = on ? SOUND.onLabel : SOUND.offLabel;
  soundToggle.classList.toggle('is-off', !on);
}
soundToggle.addEventListener('click', () => {
  juice.setSoundOn(!juice.isSoundOn());
  renderSoundToggle();
});
world.hud.appendChild(soundToggle);
renderSoundToggle();

// --- Day-progress HUD (top center): how far you are from 6 PM -----------------
// The wall clock alone wasn't obvious enough — this is the explicit "the day
// is ending" readout, a sun crawling a track from 9 AM to 6 PM.
const dayBar = document.createElement('div');
dayBar.className = 'hud-day';
dayBar.innerHTML = `
  <span class="hud-day-time">9:00 AM</span>
  <div class="hud-day-track"><div class="hud-day-fill"></div><div class="hud-day-sun">☀️</div></div>
  <span class="hud-day-end">6 PM</span>
`;
world.hud.appendChild(dayBar);
const dayTimeEl = dayBar.querySelector('.hud-day-time');
const dayFillEl = dayBar.querySelector('.hud-day-fill');
const daySunEl = dayBar.querySelector('.hud-day-sun');
function renderDayBar(dayT) {
  const t = Math.max(0, Math.min(1, dayT));
  dayTimeEl.textContent = clockText(dayT);
  dayFillEl.style.width = `${t * 100}%`;
  daySunEl.style.left = `${t * 100}%`;
}

function setRunState(s) {
  G.runState = s;
  document.body.dataset.runState = s; // CSS hooks (HUD visibility etc.)
}

// --- August Mode toggle (shared by title screen + report card) ----------------
// Flip the persisted state + body flag. If the run is currently in progress and
// we're turning it on, mark it used this run.
function toggleAugust(on) {
  august.on = !!on;
  storage.setAugustOn(august.on);
  applyAugustBodyFlag();
  if (august.on && G.runState === 'running') august.usedThisRun = true;
}

function showTitle() {
  const best = storage.getBestCommission();
  const bestLine = best > 0
    ? `<div class="overlay-best">Personal best: $${best.toLocaleString('en-US')}</div>`
    : '';
  // July AI is intentionally NOT offered here — you can only reach it via the
  // report card's "TRY AGAIN WITH JULY AI" after a run (the "easy mode" is a
  // second-attempt option, not a first-play choice).
  overlay.className = 'show title-overlay';
  overlay.innerHTML = `
    <div class="overlay-card">
      <div class="overlay-kicker">${TITLE_SCREEN.tagline}</div>
      <h1 class="overlay-title">${TITLE_SCREEN.title}</h1>
      <div class="overlay-sub">${TITLE_SCREEN.subtitle}</div>
      <button class="overlay-btn" id="start-day">${TITLE_SCREEN.start}</button>
      ${bestLine}
    </div>
  `;
  overlay.querySelector('#start-day').addEventListener('click', showInstructions, {
    once: true,
  });
}

function showReport() {
  // The title overlay stays cleared; the report card is its own HUD overlay.
  hideOverlay();
  report.show({
    august: august.usedThisRun,
    // The report's RUN IT BACK / TRY AGAIN WITH JULY AI restart straight into a
    // fresh run (they've already seen the title + how-to). The toggle fires
    // first, so beginRun samples the right July-AI state.
    onRunBack: beginRun,
    onToggleAugust: (on) => toggleAugust(on),
  });
}

function hideOverlay() {
  overlay.className = '';
  overlay.innerHTML = '';
}

// --- Creator-leaves overlay ---------------------------------------------------
// Fired by meters when a creator's happiness hits 0. Pauses the game (running
// block + channel updates freeze; rig/render keep going), shows the goodbye,
// resumes on continue. If this is the 3rd loss, the run ends instead.
function onCreatorLeaves(creator) {
  if (meters.creatorsLost >= 3) {
    // Roster exodus — end the run with the fail line on the report.
    meters.stats.failReason = 'exodus';
    endDay();
    return;
  }
  G.paused = true;
  overlay.className = 'show leaves-overlay';
  overlay.innerHTML = `
    <div class="overlay-card">
      <div class="overlay-kicker">${CREATOR_LEAVES.title}</div>
      <h1 class="overlay-title leaves-name"></h1>
      <div class="phone-bubble-card">
        <span class="leaves-avatar"></span>
        <div class="leaves-message"></div>
      </div>
      <button class="overlay-btn" id="leaves-continue">${CREATOR_LEAVES.continue}</button>
    </div>
  `;
  overlay.querySelector('.leaves-name').textContent = creator?.name || '';
  overlay.querySelector('.leaves-avatar').textContent = creator?.emoji || '💜';
  overlay.querySelector('.leaves-message').textContent = CREATOR_LEAVES.message;
  overlay.querySelector('#leaves-continue').addEventListener(
    'click',
    () => {
      hideOverlay();
      G.paused = false;
    },
    { once: true },
  );
}
meters.onCreatorLeaves = onCreatorLeaves;
// A creator is one bad beat from walking — warn loudly (there's no hearts HUD).
meters.onCreatorWarning = () => {
  juice.warn(CREATOR_LEAVES.warning);
  juice.sound.expireBuzz?.();
};
// Tried to switch screens mid-call/walk: the rig shakes "no"; say why here.
rig.onLockedNav = (reason) => {
  juice.warn(reason || LOCK_MESSAGES.default);
  juice.sound.expireBuzz?.();
};

// --- Burnout reactions + Last Stand -------------------------------------------
// A HUD banner for Last Stand (lives in the HUD layer, hidden by default).
const lastStandBanner = document.createElement('div');
lastStandBanner.className = 'last-stand-banner';
lastStandBanner.hidden = true;
world.hud.appendChild(lastStandBanner);
lastStand.bannerEl = lastStandBanner;

const LAST_STAND_WINDOW = 10; // GAME-seconds to clear 3 tasks
const LAST_STAND_GOAL = 3;
const LAST_STAND_RECOVER_TO = 60;

// Map burnout 70→100 onto scene decay 0→0.7; below 70 → 0. Called each frame.
function applyBurnoutDecay(burnout) {
  const f = burnout <= 70 ? 0 : Math.min(0.7, ((burnout - 70) / 30) * 0.7);
  juice.setSceneDecay(f);
}

function enterLastStand() {
  if (lastStand.fired) return;
  lastStand.fired = true;
  lastStand.active = true;
  lastStand.remaining = LAST_STAND_WINDOW;
  lastStand.cleared = 0;
  juice.jitterOn();
  juice.setVignette(0.7);
  juice.sound.alarm();
  lastStandBanner.textContent = BURNOUT.lastStandBanner;
  lastStandBanner.hidden = false;
}

function winLastStand() {
  lastStand.active = false;
  lastStandBanner.hidden = true;
  juice.jitterOff();
  juice.setVignette(0);
  meters.setBurnout(LAST_STAND_RECOVER_TO);
  toastCenter(BURNOUT.lastStandSuccess, 'good');
}

function loseLastStand() {
  // Pass out: slump onto the desk, then end the run with the passout report.
  lastStand.active = false;
  lastStandBanner.hidden = true;
  juice.jitterOff();
  juice.setVignette(0);
  rig.slump();
  meters.stats.failReason = 'passout';
  // Let the slump play (~1.2s) before the report drops.
  setTimeout(() => {
    if (G.runState === 'running') endDay();
  }, 1300);
}

function resetLastStand() {
  lastStand.active = false;
  lastStand.fired = false;
  lastStand.remaining = 0;
  lastStand.cleared = 0;
  lastStandBanner.hidden = true;
}

// Advance the Last Stand window on GAME dt. Win at 3 clears, lose at timeout.
// Split out of tick() so it's directly pumpable in headless tests (rAF is
// throttled in a hidden tab, so tick() never runs there).
function stepLastStand(dt) {
  if (!lastStand.active) return;
  lastStand.remaining -= dt;
  if (lastStand.cleared >= LAST_STAND_GOAL) winLastStand();
  else if (lastStand.remaining <= 0) loseLastStand();
}

// A tiny center-screen HUD toast (Last Stand success, etc.).
let centerToastEl = null;
function toastCenter(text, kind = '') {
  if (!centerToastEl) {
    centerToastEl = document.createElement('div');
    centerToastEl.className = 'center-toast';
    world.hud.appendChild(centerToastEl);
  }
  centerToastEl.textContent = text;
  centerToastEl.className = `center-toast ${kind} show`.trim();
  centerToastEl.addEventListener(
    'animationend',
    () => centerToastEl.classList.remove('show'),
    { once: true },
  );
}

// Burnout change hook: trigger Last Stand at 100. (Decay is applied per-frame.)
meters.onBurnoutChange = (value) => {
  if (value >= 100 && !lastStand.fired && G.runState === 'running') {
    enterLastStand();
  }
};

// In-game clock text for the phone status bar. 9:00 AM → 6:00 PM, 12-hour.
function clockText(dayT) {
  const totalMin = 9 * 60 + Math.floor(Math.max(0, Math.min(1, dayT)) * 9 * 60);
  let h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// START DAY → the how-to-play card. Click anywhere on it to actually begin,
// so a first-time player reads the rules before the timers start. The warm-up
// phase is the only tutorial the run itself gives.
function showInstructions() {
  hideOverlay();
  report.hide();
  // A run started from the title is always a normal (no-assist) run — July AI
  // is only reachable via the report's "TRY AGAIN WITH JULY AI".
  toggleAugust(false);
  const rows = INSTRUCTIONS.rows
    .map((r) => {
      const cue = r.key
        ? `<span class="instr-keys">${r.key
            .split(' ')
            .map((k) => `<kbd>${k}</kbd>`)
            .join('')}</span>`
        : `<span class="instr-icon">${r.icon}</span>`;
      return `<div class="instr-row">${cue}<span class="instr-text">${r.text}</span></div>`;
    })
    .join('');
  overlay.className = 'show instructions-overlay';
  overlay.innerHTML = `
    <div class="overlay-card instr-card">
      <h1 class="overlay-title instr-title">${INSTRUCTIONS.title}</h1>
      <div class="instr-rows">${rows}</div>
      <div class="instr-go">${INSTRUCTIONS.go}</div>
    </div>
  `;
  // Click ANYWHERE on the overlay begins the run. Attach on the next frame so
  // the very click that opened this card (on the START DAY button, which is
  // inside `overlay`) doesn't bubble straight into beginRun and skip the card.
  requestAnimationFrame(() => {
    overlay.addEventListener('click', beginRun, { once: true });
  });
}

function beginRun() {
  hideOverlay();
  report.hide();
  // Defensive resets so a run always starts clean no matter what path led
  // here (instructions, RUN IT BACK, or a dev calling beginRun twice).
  G.paused = false;
  engine.resetRun();
  meters.reset();
  email.reset();
  dms.reset();
  negotiation.reset();
  invoice.reset();
  door.reset();
  attention.reset();
  juice.reset(); // vignette / decay / jitter off
  resetLastStand();
  // Sample August-used-this-run at run start; a mid-run toggle-on also sets it.
  august.usedThisRun = august.on;
  setRunState('running');
  G.dayT = 0;
  room.setDayProgress(0);
  lights.setTimeOfDay(0);
  renderDayBar(0);
  engine.startRun();
  rig.unslump();
  rig.goTo('inbox');
}

function endDay() {
  // Settle any in-flight call locks first (pay + unlock) so the report never
  // shows behind a locked/held camera or drops a call payout.
  email.forceEndCall();
  dms.forceEndCall();
  door.forceEnd();
  // Unlock August on the first COMPLETED run (reached 6PM, no fail reason).
  if (meters.stats.completed && !meters.stats.failReason && !august.unlocked) {
    august.unlocked = true;
    storage.setAugustUnlocked(true);
  }
  setRunState('report');
  G.paused = false;
  engine.endRun();
  showReport();
}

function runItBack() {
  // Full reset without a page reload: fresh engine/meters/panels.
  report.hide();
  G.paused = false;
  engine.resetRun();
  meters.reset();
  email.reset();
  dms.reset();
  negotiation.reset();
  invoice.reset();
  door.reset();
  attention.reset();
  juice.reset();
  resetLastStand();
  G.dayT = 0;
  room.setDayProgress(0);
  lights.setTimeOfDay(0);
  renderDayBar(0);
  setRunState('title');
  rig.unslump();
  rig.unlock();
  rig.goTo('inbox');
  showTitle();
}

showTitle();

// --- Loop -----------------------------------------------------------------------
const timer = new THREE.Timer();

document.addEventListener('visibilitychange', () => {
  // Flush the accumulated delta so timers don't drain in a background tab.
  if (!document.hidden) timer.reset();
});

function tick() {
  requestAnimationFrame(tick);
  if (document.hidden) return;

  timer.update();
  const rawDt = Math.min(timer.getDelta(), 0.1);
  const dt = rawDt * G.timeScale; // game time (tasks, timers)

  if (G.runState === 'running' && !G.paused) {
    G.dayT = G.dayT + dt / DAY_LENGTH;
    room.setDayProgress(G.dayT);
    lights.setTimeOfDay(G.dayT); // sun sinks + warms toward 6 PM
    renderDayBar(G.dayT); // HUD day-progress readout
    engine.update(dt);
    // Deal-board minigames run on GAME dt (tug physics + invoice requeue timers).
    negotiation.update(dt);
    invoice.update(dt);

    // Burnout bleeds off slowly when you're keeping up — so a clean stretch
    // recovers you. Damage (+8 expiry, +3 bad reply) still outruns it in chaos.
    meters.addBurnout(-BURNOUT_RECOVERY * dt);

    // Last Stand window counts down on GAME dt. Win at 3 clears, lose when
    // it runs out.
    stepLastStand(dt);

    // August scope-creep auto-handle runs on GAME dt (slow-mo-aware).
    email.updateAugust(dt);
    dms.updateAugust(dt);

    if (G.dayT >= 1) {
      G.dayT = 1;
      room.setDayProgress(1);
      // Reaching 6PM is a completed run (fail runs never get here).
      meters.stats.completed = true;
      endDay();
    }
  }

  // Channel + HUD per-frame work runs regardless of state (rings freeze
  // naturally when nothing is live; the call lock drains on real dt). The
  // creator-leaves overlay pauses channel updates so rings/calls freeze too.
  dms.setClock(clockText(G.dayT));
  if (!G.paused) {
    email.update();
    email.updateReal(rawDt);
    dms.update();
    dms.updateReal(rawDt);
    negotiation.updateRings();
    invoice.updateRings();
    // Door: rattle + card visibility on real dt; locks/maintenance on real dt.
    door.update(rawDt);
    door.updateReal(rawDt);
  }
  // Burnout desaturation follows the meter every frame while running.
  if (G.runState === 'running') applyBurnoutDecay(meters.burnout);
  meters.updateVisual(rawDt);
  attention.update(rawDt, stationQuery);

  rig.update(rawDt); // real dt: your neck is immune to slow-mo
  juice.update(rawDt); // additive shake/jitter — AFTER rig, BEFORE render
  world.render();
}
tick();

// Handy handles while developing (and for later slices' wiring).
export {
  world,
  room,
  desk,
  rig,
  engine,
  meters,
  email,
  dms,
  negotiation,
  invoice,
  attention,
  juice,
  door,
  interact,
  storage,
  report,
};
window.__ms = {
  G,
  world,
  room,
  desk,
  rig,
  lights,
  renderDayBar,
  engine,
  meters,
  email,
  dms,
  negotiation,
  invoice,
  attention,
  juice,
  door,
  interact,
  storage,
  report,
  august,
  toggleAugust,
  lastStand,
  stepLastStand,
  applyBurnoutDecay,
  showInstructions,
  beginRun,
  endDay,
  runItBack,
};
