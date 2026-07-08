// ============================================================================
// leaderboard-page.js — the standalone /leaderboard page. A tiny read-only
// view of the shared board (no game bundle, no Three.js) so anyone can check
// standings from a link. Same Worker, same data as the in-game tab.
//
// Cmd+Shift+E (or Ctrl+Shift+E) toggles the same admin-delete mode as the
// in-game board: prompts once for the admin secret, sends it as X-Admin-Key.
// Auto-refreshes every 30s so a contest can be watched live.
// ============================================================================

import { ENDPOINT } from './leaderboard.js';

const LS_ADMIN = 'ms_admin_key'; // shared sessionStorage cache with the game

const listEl = document.getElementById('list');
const updatedEl = document.getElementById('updated');
const boardEl = document.getElementById('board');

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en-US');

let scores = [];
let adminMode = false;

function render() {
  boardEl.classList.toggle('admin', adminMode);
  if (!scores.length) {
    listEl.innerHTML = '<div class="empty">No scores yet — be the first.</div>';
    return;
  }
  listEl.innerHTML = scores
    .map((e, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      return `
        <div class="row">
          <span class="rank">${medal}</span>
          <span class="name">${esc(e.name)}</span>
          <span class="score">${fmt$(e.score)}</span>
          <button class="del" data-id="${esc(e.id)}" title="Delete score">✕</button>
        </div>`;
    })
    .join('');
  listEl.querySelectorAll('.del').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.id));
  });
}

async function refresh() {
  try {
    const r = await fetch(`${ENDPOINT}/scores`);
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    scores = (Array.isArray(data.scores) ? data.scores : []).sort((a, b) => b.score - a.score);
    render();
    updatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch {
    if (!scores.length) {
      listEl.innerHTML = '<div class="error">Couldn’t load the board — try a refresh.</div>';
    }
  }
}

function getAdminKey() {
  let k = '';
  try {
    k = sessionStorage.getItem(LS_ADMIN) || '';
  } catch { /* ignore */ }
  if (!k) {
    k = window.prompt('Admin secret:') || '';
    if (k) {
      try { sessionStorage.setItem(LS_ADMIN, k); } catch { /* ignore */ }
    }
  }
  return k;
}

async function onDelete(id) {
  if (!id) return;
  const key = getAdminKey();
  if (!key) return;
  try {
    const r = await fetch(`${ENDPOINT}/scores/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': key },
    });
    if (r.status === 403) {
      try { sessionStorage.removeItem(LS_ADMIN); } catch { /* ignore */ }
      window.alert('Wrong admin secret.');
      return;
    }
    if (!r.ok) return;
    const data = await r.json();
    scores = (Array.isArray(data.scores) ? data.scores : scores.filter((e) => e.id !== id))
      .sort((a, b) => b.score - a.score);
    render();
  } catch { /* leave the board as-is */ }
}

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault();
    adminMode = !adminMode;
    render();
  }
});

refresh();
setInterval(refresh, 30000);
// Refetch the instant the tab regains focus — the common flow is "finish a
// run in the game tab, flip over here to see your name" and a 30s poll feels
// stale for that.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
window.addEventListener('focus', refresh);
