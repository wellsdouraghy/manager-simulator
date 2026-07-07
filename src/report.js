// ============================================================================
// report.js — THE report card. A full-screen "slightly-too-sincere corporate
// performance review" document rendered into the HUD layer. This is the
// screenshot that travels, so the polish lives here.
//
// Title selection: content.js TITLES is a list of { title, when } where `when`
// is a CONDITION KEY (not a function — spec keeps predicates out of content).
// The predicate table below maps each key to a (stats, meters, ctx) test, and
// we walk TITLES top-to-bottom returning the first match.
//
// Share text: SHARE.lines are templates with {tokens}; we fill and copy the
// assembled block to the clipboard (navigator.clipboard → execCommand fallback).
// ============================================================================

import {
  REPORT_CARD,
  TITLES,
  SHARE,
  AUGUST,
  AUGUST_NAME,
  CREATORS,
  GAME_URL,
  JULY_CTA,
  JULY_URL,
} from './content.js';
import { createLeaderboard } from './leaderboard.js';

// --- Title predicate table -------------------------------------------------
// ctx = { retained, dealsClosedTarget, survived }
// Calibrated to the 90-second day: a perfect, instant-response run tops out
// around $27–33k commission and ~4 closed deals (measured over the real spawn
// engine). S/A are set just under a truly excellent run — hard, but reachable
// if you're really good. The top grades also require surviving to 6PM.
const TITLE_PREDICATES = {
  // S/A — reserved for excellent runs. Perfect play in the one-minute day tops
  // out around $21–27k and ~2–4 closed deals (measured over the real spawn
  // engine), so these are hard but reachable.
  deity: (s, m, ctx) =>
    m.commission >= 14000 && ctx.retained === 5 && ctx.survived,
  closer: (s, m, ctx) => (s.dealsClosedTarget || 0) >= 2 && ctx.survived,
  // Speed also requires real output, so fast-but-wrong clicking (which tanks
  // commission) can't sneak an A.
  speed: (s, m, ctx) =>
    ctx.survived && m.avgResponseTime > 0 && m.avgResponseTime < 3 && m.commission >= 8000,
  martyr: (s, m) =>
    m.commission > 0 &&
    (s.quickCallsOffered || 0) > 0 &&
    s.quickCallsTaken === s.quickCallsOffered,
  grinding: (s, m, ctx) => m.peakBurnout >= 88 && ctx.survived && m.commission > 0,
  // Below C: F for a day that booked nothing (or lost money) or lost the whole
  // roster; D for passing out or barely scraping any commission together.
  flop: (s, m) => m.commission <= 0,
  exodus: (s) => s.failReason === 'exodus',
  passout: (s) => s.failReason === 'passout',
  rough: (s, m, ctx) => ctx.survived && m.commission < 3000,
  lostTalent: (s) => (s.creatorsLost || 0) >= 1,
  default: () => true,
};

// Returns the full persona object { title, emoji, grade, blurb, when }.
function pickTitle(stats, meters, ctx) {
  for (const t of TITLES) {
    const pred = TITLE_PREDICATES[t.when];
    if (pred && pred(stats, meters, ctx)) return t;
  }
  return TITLES[TITLES.length - 1];
}

// --- Clipboard -------------------------------------------------------------
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => execCommandCopy(text));
  }
  return Promise.resolve(execCommandCopy(text));
}
function execCommandCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// --- Report confetti (pure DOM, CSS-animated — the report overlay sits above
// the 3D layer, so a WebGL burst wouldn't show here). ------------------------
const reportReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFETTI_COLORS = ['#ffc94d', '#45c489', '#ff5b5b', '#fff4e0', '#66b6ff'];
function confettiHtml(n = 46) {
  let pieces = '';
  for (let i = 0; i < n; i++) {
    // Deterministic-ish spread without Math.random dependence concerns: spread
    // across the width, vary delay/rotation/color by index.
    const left = ((i * 97) % 100) + (i % 3);
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const delay = ((i * 53) % 900) / 1000;
    const dur = 1.6 + ((i * 31) % 120) / 100;
    const rot = (i * 47) % 360;
    const w = 7 + (i % 4) * 2;
    pieces +=
      `<span class="rd-confetti-bit" style="left:${left}%;background:${color};` +
      `width:${w}px;height:${w * 1.6}px;animation-delay:${delay}s;` +
      `animation-duration:${dur}s;transform:rotate(${rot}deg)"></span>`;
  }
  return `<div class="rd-confetti" aria-hidden="true">${pieces}</div>`;
}

export function createReport({ meters, content, storage, juice }) {
  const copy = content?.REPORT_CARD || REPORT_CARD;
  const share = content?.SHARE || SHARE;
  const august = content?.AUGUST || AUGUST;
  const roster = content?.CREATORS || CREATORS;
  const url = content?.GAME_URL || GAME_URL;
  const augustName = content?.AUGUST_NAME || AUGUST_NAME;

  // The overlay lives in the HUD layer; created lazily on first show().
  let root = null;
  let onRunBackCb = null;
  let onToggleAugustCb = null;
  let countRaf = 0;
  const leaderboard = createLeaderboard();

  // Commission count-up. The final value is already rendered, so if rAF is
  // starved (background tab) nothing looks broken — this only animates 0→final.
  function countUp(elm, target) {
    if (!elm || !target || reportReducedMotion()) return;
    if (countRaf) cancelAnimationFrame(countRaf);
    const start = performance.now();
    const dur = 900;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      elm.textContent = '$' + Math.round(target * eased).toLocaleString('en-US');
      if (k < 1) countRaf = requestAnimationFrame(step);
    };
    countRaf = requestAnimationFrame(step);
  }

  // Derive the numbers we display + share. Kept together so the doc and the
  // share block never disagree.
  function computeModel({ augustUsed }) {
    const s = meters.stats;
    const rosterSize = roster.length;
    let retained = 0;
    const hearts = [];
    for (const c of roster) {
      const gone = meters.isGone(c.id);
      if (!gone) retained++;
      hearts.push(gone ? '💔' : '💜');
    }
    const survived = !s.failReason;
    const ctx = {
      retained,
      dealsClosedTarget: s.dealsClosedTarget || 0,
      survived,
    };
    const persona = pickTitle(s, meters, ctx);
    return {
      commission: Math.round(meters.commission),
      dealsClosed: s.dealsClosedTarget || 0,
      dealsAttempted: s.dealsAttempted || 0,
      invoicesPaid: s.invoicesPaid || 0,
      retained,
      rosterSize,
      hearts,
      avgResponse: meters.avgResponseTime,
      peakBurnout: Math.round(meters.peakBurnout),
      tasksMissed: s.expired || 0,
      survived,
      failReason: s.failReason || null,
      persona,
      title: persona.title,
      emoji: persona.emoji,
      grade: persona.grade,
      blurb: persona.blurb,
      augustUsed,
    };
  }

  function buildShareText(model) {
    const first = model.survived ? share.survivedLine : share.failedLine;
    const map = {
      commission: model.commission.toLocaleString('en-US'),
      dealsClosed: model.dealsClosed,
      dealsAttempted: model.dealsAttempted,
      retained: model.retained,
      roster: model.rosterSize,
      burnout: model.peakBurnout,
      missed: model.tasksMissed,
      title: model.title,
      emoji: model.emoji,
      grade: model.grade,
      blurb: model.blurb,
      url,
    };
    const body = share.lines.map((line) =>
      line.replace(/\{(\w+)\}/g, (_, k) => (k in map ? map[k] : `{${k}}`)),
    );
    return [first, ...body].join('\n');
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'report-overlay';
    root.className = 'report-doc-overlay';
    meters && null; // (meters is captured; nothing to init here)
    // Attach to the HUD layer (same layer as #run-overlay).
    document.getElementById('hud-layer')?.appendChild(root);
    return root;
  }

  function fmtResponse(v) {
    return (Math.round(v * 10) / 10).toFixed(1);
  }

  function statRow(label, valueHtml, { star, tag } = {}) {
    const starMark = star ? '<span class="rd-star">*</span>' : '';
    const tagMark = tag ? `<span class="rd-tag">${tag}</span>` : '';
    return `
      <div class="rd-row">
        <span class="rd-label">${label}</span>
        <span class="rd-dots"></span>
        <span class="rd-value">${valueHtml}${starMark}${tagMark}</span>
      </div>`;
  }

  // The July-AI end screen: a clean, sales-oriented CTA to the real product
  // (not a shareable brag). Shown when the run used the assist.
  function showJulyCta(el, model) {
    const c = content?.JULY_CTA || JULY_CTA;
    const julyUrl = content?.JULY_URL || JULY_URL;
    const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

    // The point of this screen is "July AI made you better." Compare against
    // your last honest (no-assist) run and GUARANTEE a lift: at least +15% and
    // at least +$1,500 absolute, so even a tiny/zero baseline shows a real jump.
    // If you genuinely scored higher, we show the real (bigger) number.
    const baseline = Math.max(0, storage ? storage.getLastScore() : 0);
    let improved = Math.max(model.commission, Math.round(baseline * 1.15), baseline + 1500);
    improved = Math.round(improved / 50) * 50; // tidy the figure
    const pct = baseline > 0 ? Math.round(((improved - baseline) / baseline) * 100) : null;

    const headline =
      baseline > 0
        ? `<div class="jc-compare">
             <div class="jc-cmp-old"><span>${c.improvePrefix}</span><b>${money(baseline)}</b></div>
             <div class="jc-cmp-arrow">→</div>
             <div class="jc-cmp-new"><span>${c.improveWith}</span><b>${money(improved)}</b><em class="jc-cmp-delta">+${pct}%</em></div>
           </div>`
        : `<div class="jc-stat">${c.statPrefix} <b>${money(improved)}</b> ${c.statSuffix}</div>`;

    el.innerHTML = `
      <div class="report-doc july-cta">
        <div class="jc-logo">${c.logo}</div>
        ${headline}
        <h1 class="jc-title">${c.title}</h1>
        <p class="jc-body">${c.body}</p>
        <a class="jc-cta" href="${julyUrl}" target="_blank" rel="noopener noreferrer">${c.cta}</a>
        <button class="jc-again" id="rd-again">${c.again}</button>
      </div>
    `;
    // Play again → a normal, no-assist run.
    el.querySelector('#rd-again')?.addEventListener('click', () => {
      onToggleAugustCb?.(false);
      onRunBackCb?.();
    });
    el.classList.add('show');
    el.dataset.julyCta = '1';
  }

  function show({ august: augustUsed = false, onRunBack, onToggleAugust } = {}) {
    onRunBackCb = onRunBack || null;
    onToggleAugustCb = onToggleAugust || null;
    const model = computeModel({ augustUsed });
    const el = ensureRoot();

    // Played with July AI? This result isn't a brag to share — it's the moment
    // to point at the real product. Show the sales CTA instead of the card.
    if (augustUsed) {
      showJulyCta(el, model);
      return;
    }

    const best = storage ? storage.getBestCommission() : 0;
    const beatBest = model.survived && model.commission > best && model.commission > 0;
    // Persist the new best BEFORE we render the tag, but read `best` above so we
    // compare against the pre-run value.
    if (model.commission > best) storage?.setBestCommission(model.commission);
    // Record this honest run as the baseline the July-AI CTA improves on.
    storage?.setLastScore(model.commission);

    const star = model.augustUsed ? '<span class="rd-star">*</span>' : '';
    const heading = model.survived ? copy.survivedHeading : copy.incompleteHeading;
    const failLine = !model.survived
      ? (copy.fail[model.failReason] || copy.fail.generic)
      : '';

    const augustUnlocked = storage ? storage.getAugustUnlocked() : false;
    const augustOn = storage ? storage.getAugustOn() : false;

    // A win worth confetti = survived with grade S/A/B.
    const celebratory = model.survived && ['S', 'A', 'B'].includes(model.grade);
    const confetti = celebratory ? confettiHtml() : '';

    el.innerHTML = `
      <div class="report-doc grade-${model.grade} ${model.survived ? '' : 'is-incomplete'}">
        <div class="rd-datebar">${copy.docTitle}</div>
        <div class="rd-rule rd-rule-double"></div>

        <div class="rd-tabs" role="tablist">
          <button class="rd-tab is-active" data-tab="results">${copy.tabResults || '📄 Results'}</button>
          <button class="rd-tab" data-tab="leaderboard">${copy.tabLeaderboard || '🏆 Leaderboard'}</button>
        </div>

        <div class="rd-tab-panel is-active" data-panel="results">
          <div class="rd-hero">
            <div class="rd-grade-wrap">
              <div class="rd-grade">${model.grade}</div>
              <div class="rd-grade-label">${copy.gradeLabel}</div>
            </div>
            <div class="rd-persona">
              <div class="rd-emoji">${model.emoji}</div>
              <div class="rd-stamp rd-stamp-title ${model.survived ? '' : 'rd-stamp-fail'}">${model.title}</div>
              <div class="rd-blurb">“${model.blurb}”</div>
            </div>
          </div>
          <div class="rd-heading-mini">${heading}${failLine ? ` — ${failLine}` : ''}</div>

          <div class="rd-rule"></div>

          <div class="rd-rows">
            ${statRow(copy.labels.commission, `<span id="rd-commission">$${model.commission.toLocaleString('en-US')}</span>${star}`, {
              tag: beatBest ? copy.personalBest : '',
            })}
            ${statRow(copy.labels.deals, `${model.dealsClosed} / ${model.dealsAttempted}${star}`)}
            ${statRow(copy.labels.invoices, `${model.invoicesPaid}${star}`)}
            ${statRow(
              copy.labels.retained,
              `${model.retained} / ${model.rosterSize} <span class="rd-hearts">${model.hearts.join('')}</span>${star}`,
            )}
            ${statRow(copy.labels.response, `${fmtResponse(model.avgResponse)}${copy.units.response}${star}`)}
            ${statRow(copy.labels.tasksMissed, `${model.tasksMissed}${star}`)}
          </div>

          <div class="rd-rule rd-rule-double"></div>

          ${
            model.augustUsed
              ? `<div class="rd-august-legend">${copy.augustFootnote(augustName)}</div>
                 <div class="rd-august-deadpan">${copy.augustDeadpan}</div>`
              : ''
          }

          <div class="rd-footer">${copy.reviewedBy}</div>

          <div class="rd-actions">
            <button class="rd-btn rd-btn-copy" id="rd-copy">${copy.copy}</button>
            <button class="rd-btn rd-btn-again" id="rd-again">${copy.again}</button>
            ${
              augustUnlocked
                ? `<button class="rd-btn rd-btn-august" id="rd-august">${august.tryAgainLabel(augustName)}</button>`
                : ''
            }
          </div>
          ${augustUnlocked ? `<div class="rd-august-desc">${august.description}</div>` : ''}
        </div>

        <div class="rd-tab-panel" data-panel="leaderboard">
          <div class="rd-leaderboard" id="rd-leaderboard"></div>
        </div>

        ${model.survived ? '' : `<div class="rd-watermark">${copy.incompleteStamp}</div>`}
      </div>
      ${confetti}
    `;

    // Tab switching (Results ↔ Leaderboard).
    const tabs = [...el.querySelectorAll('.rd-tab')];
    const panels = [...el.querySelectorAll('.rd-tab-panel')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panels.forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
      });
    });

    // Delight: a fanfare sting on a win, a sad buzz on a fail.
    if (juice?.sound) {
      if (celebratory) juice.sound.dealClose?.();
      else if (!model.survived) juice.sound.expireBuzz?.();
    }
    // Commission count-up (enhancement; the final value is already in the DOM).
    countUp(el.querySelector('#rd-commission'), model.commission);

    // COPY RESULT
    const copyBtn = el.querySelector('#rd-copy');
    copyBtn?.addEventListener('click', () => {
      const text = buildShareText(model);
      copyToClipboard(text);
      copyBtn.textContent = copy.copied;
      copyBtn.classList.add('is-copied');
      setTimeout(() => {
        copyBtn.textContent = copy.copy;
        copyBtn.classList.remove('is-copied');
      }, 1600);
    });

    // RUN IT BACK → a normal run (July AI OFF).
    el.querySelector('#rd-again')?.addEventListener('click', () => {
      onToggleAugustCb?.(false);
      onRunBackCb?.();
    });

    // TRY AGAIN WITH JULY AI → restart with the assist ON, in one click.
    el.querySelector('#rd-august')?.addEventListener('click', () => {
      onToggleAugustCb?.(true);
      onRunBackCb?.();
    });

    // Mount the shared leaderboard (name entry → ranked board → Cmd+Shift+E
    // admin delete). Scored on this run's commission.
    const lbEl = el.querySelector('#rd-leaderboard');
    if (lbEl) leaderboard.mount(lbEl, { score: model.commission, grade: model.grade });

    el.classList.add('show');
    // Expose the built share text + title for headless verification.
    el.dataset.shareText = buildShareText(model);
    el.dataset.title = model.title;
  }

  function hide() {
    if (countRaf) cancelAnimationFrame(countRaf);
    countRaf = 0;
    leaderboard.unmount();
    if (root) {
      root.classList.remove('show');
      root.innerHTML = '';
    }
  }

  return {
    show,
    hide,
    // Exposed for tests: build the share text for a hypothetical model.
    _buildShareText: (m) => buildShareText(m),
    _pickTitle: (s, m, ctx) => pickTitle(s, m, ctx),
  };
}
