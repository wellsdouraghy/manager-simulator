// ============================================================================
// leaderboard.js — the shared high-score board shown on the report card.
//
// After a (non-July-AI) run you type a name and your commission is posted to a
// shared board that everyone playing sees. Scores are permanent: once added,
// nobody can remove one — EXCEPT an admin who presses Cmd+Shift+E on the report
// screen, enters the admin secret, and gets an ✕ on every row (for nuking
// inappropriate names). The secret lives only in the Worker + the admin's head,
// so the delete route can't be abused from outside the game.
//
// Backend: the Cloudflare Worker in /worker (set ENDPOINT below after deploy).
// Until ENDPOINT is set, the board transparently falls back to this browser's
// localStorage so the feature still works locally.
// ============================================================================

// Set to the deployed Worker origin, e.g. 'https://manager-leaderboard.x.workers.dev'.
// Empty string → local-per-browser fallback mode.
export const ENDPOINT = 'https://manager-leaderboard.wellsdouraghy.workers.dev';

const LS_BOARD = 'ms_leaderboard_v1'; // local fallback board
const LS_ADMIN = 'ms_admin_key'; // sessionStorage cache of the admin secret
const LS_NAME = 'ms_player_name'; // last name used, prefilled on the next run
const TOP_SHOW = 12; // rows rendered

export function getSavedName() {
  try {
    return localStorage.getItem(LS_NAME) || '';
  } catch {
    return '';
  }
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');

// --- Transport (Worker when configured, localStorage otherwise) --------------
const usingServer = () => !!ENDPOINT;

async function apiList() {
  if (!usingServer()) return readLocal();
  const r = await fetch(`${ENDPOINT}/scores`, { method: 'GET' });
  if (!r.ok) throw new Error('list failed');
  const data = await r.json();
  return Array.isArray(data.scores) ? data.scores : [];
}

async function apiAdd(entry) {
  if (!usingServer()) {
    const board = readLocal();
    const row = {
      id: `l-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: cleanName(entry.name),
      score: Math.round(entry.score),
      grade: String(entry.grade || '').slice(0, 2),
      ts: Date.now(),
    };
    board.push(row);
    board.sort((a, b) => b.score - a.score);
    writeLocal(board);
    return { entry: row, rank: board.findIndex((e) => e.id === row.id) + 1, scores: board };
  }
  const r = await fetch(`${ENDPOINT}/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error('add failed');
  return r.json();
}

async function apiDelete(id, adminKey) {
  if (!usingServer()) {
    const board = readLocal().filter((e) => e.id !== id);
    writeLocal(board);
    return { ok: true, scores: board };
  }
  const r = await fetch(`${ENDPOINT}/scores/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': adminKey || '' },
  });
  if (r.status === 403) throw new Error('forbidden');
  if (!r.ok) throw new Error('delete failed');
  return r.json();
}

function readLocal() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_BOARD) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeLocal(board) {
  try {
    localStorage.setItem(LS_BOARD, JSON.stringify(board.slice(0, 500)));
  } catch {
    /* ignore quota */
  }
}
function cleanName(raw) {
  let s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (s.length > 24) s = s.slice(0, 24);
  return s || 'Anonymous';
}

// ---------------------------------------------------------------------------
export function createLeaderboard() {
  let hostEl = null; // the section we render into
  let board = []; // last-known scores
  let myId = null; // this run's entry id once submitted
  let adminMode = false;
  let keyHandler = null;
  let runScore = 0;
  let runGrade = '';

  function h(html) {
    hostEl.innerHTML = html;
  }

  function rowHtml(e, i) {
    const mine = e.id && e.id === myId ? ' lb-row-mine' : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const del = adminMode
      ? `<button class="lb-del" data-id="${esc(e.id)}" title="Delete score">✕</button>`
      : '';
    return `
      <div class="lb-row${mine}">
        <span class="lb-rank">${medal}</span>
        <span class="lb-name">${esc(e.name)}</span>
        <span class="lb-score">${fmt$(e.score)}</span>
        ${del}
      </div>`;
  }

  function rowsHtml() {
    const top = board.slice(0, TOP_SHOW);
    if (!top.length) {
      return `<div class="lb-empty">No scores yet — be the first.</div>`;
    }
    let html = top.map(rowHtml).join('');
    // Your entry always shows, even ranked below the cutoff — appended after a
    // "…" separator so you're never left wondering whether your score saved.
    const myIdx = myId ? board.findIndex((e) => e.id === myId) : -1;
    if (myIdx >= TOP_SHOW) {
      html += `<div class="lb-gap">⋯</div>${rowHtml(board[myIdx], myIdx)}`;
    }
    return html;
  }

  function adminBadge() {
    return adminMode ? `<span class="lb-admin-badge">ADMIN — click ✕ to remove</span>` : '';
  }

  // View 1: name entry (before submitting this run's score).
  function renderEntry() {
    h(`
      <div class="lb-head">
        <span class="lb-title">🏆 Leaderboard</span>
        ${adminBadge()}
      </div>
      <div class="lb-entry">
        <span class="lb-entry-label">Your run: <b>${fmt$(runScore)}</b></span>
        <div class="lb-entry-form">
          <input class="lb-input" id="lb-name" maxlength="24" placeholder="Enter your name"
                 autocomplete="off" spellcheck="false" />
          <button class="lb-submit" id="lb-submit">Add to board</button>
        </div>
      </div>
      <div class="lb-list" id="lb-list">${rowsHtml()}</div>
    `);
    const input = hostEl.querySelector('#lb-name');
    const submit = hostEl.querySelector('#lb-submit');
    input?.focus();
    const go = () => doSubmit(input.value);
    submit?.addEventListener('click', go);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    wireDeletes();
  }

  // View 2: after submitting — the board with your entry highlighted.
  function renderBoard() {
    const myRank = myId ? board.findIndex((e) => e.id === myId) + 1 : 0;
    const rankLine =
      myRank > 0
        ? `<span class="lb-entry-label">You're <b>#${myRank}</b> with ${fmt$(runScore)}</span>`
        : `<span class="lb-entry-label">Saved — ${fmt$(runScore)}</span>`;
    h(`
      <div class="lb-head">
        <span class="lb-title">🏆 Leaderboard</span>
        ${adminBadge()}
      </div>
      <div class="lb-entry lb-entry-done">${rankLine}</div>
      <div class="lb-list" id="lb-list">${rowsHtml()}</div>
    `);
    wireDeletes();
  }

  function render() {
    if (myId) renderBoard();
    else renderEntry();
  }

  function wireDeletes() {
    hostEl.querySelectorAll('.lb-del').forEach((btn) => {
      btn.addEventListener('click', () => onDelete(btn.dataset.id));
    });
  }

  async function refresh() {
    try {
      board = await apiList();
      board.sort((a, b) => b.score - a.score);
    } catch {
      /* keep last-known board */
    }
    render();
  }

  // Returns true on success so callers (the in-tab form AND the report card's
  // name gate) can tell whether the score actually made it onto the board.
  async function doSubmit(rawName) {
    const name = cleanName(rawName);
    const submitBtn = hostEl?.querySelector('#lb-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
    }
    try {
      const res = await apiAdd({ name, score: runScore, grade: runGrade });
      board = Array.isArray(res.scores) ? res.scores : board;
      board.sort((a, b) => b.score - a.score);
      myId = res.entry?.id || null;
    } catch {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Retry';
      }
      return false;
    }
    try {
      localStorage.setItem(LS_NAME, name);
    } catch {
      /* ignore */
    }
    render();
    return true;
  }

  function getAdminKey() {
    if (!usingServer()) return 'local';
    let k = '';
    try {
      k = sessionStorage.getItem(LS_ADMIN) || '';
    } catch {
      /* ignore */
    }
    if (!k) {
      k = window.prompt('Admin secret:') || '';
      if (k) {
        try {
          sessionStorage.setItem(LS_ADMIN, k);
        } catch {
          /* ignore */
        }
      }
    }
    return k;
  }

  async function onDelete(id) {
    if (!id) return;
    const key = getAdminKey();
    if (!key) return;
    try {
      const res = await apiDelete(id, key);
      board = Array.isArray(res.scores) ? res.scores : board.filter((e) => e.id !== id);
    } catch (err) {
      if (String(err.message) === 'forbidden') {
        try {
          sessionStorage.removeItem(LS_ADMIN);
        } catch {
          /* ignore */
        }
        window.alert('Wrong admin secret.');
      }
      return;
    }
    render();
  }

  function toggleAdmin() {
    adminMode = !adminMode;
    render();
  }

  // Mount into `container`; `run` = { score, grade }. Adds the Cmd+Shift+E hook.
  function mount(container, run = {}) {
    hostEl = container;
    runScore = Math.round(run.score || 0);
    runGrade = run.grade || '';
    myId = null;
    adminMode = false;
    render();
    refresh();
    keyHandler = (e) => {
      // Cmd+Shift+E (mac) / Ctrl+Shift+E — toggle admin delete mode.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        toggleAdmin();
      }
    };
    window.addEventListener('keydown', keyHandler, true);
  }

  function unmount() {
    if (keyHandler) window.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
    hostEl = null;
  }

  // `submit` lets the report card's name gate post the mounted run's score
  // directly (same path as the in-tab form; resolves true on success).
  // `refresh` refetches the board — called when the Leaderboard tab is opened
  // so it always shows scores posted since the report card rendered.
  return { mount, unmount, submit: (name) => doSubmit(name), refresh };
}
