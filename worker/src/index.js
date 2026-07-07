// ============================================================================
// Manager Simulator — leaderboard Worker.
//
// A tiny append-only score store backed by Workers KV. Anyone can GET the board
// or POST a score; nobody can DELETE without the admin secret (never shipped to
// the client — the in-game Cmd+Shift+E admin mode prompts for it and sends it
// as a header, and the Worker checks it against the ADMIN_SECRET env var).
//
// KV layout: one key, "board", holding a JSON array of entries:
//   { id, name, score, grade, ts }
// The board is capped to the top TOP_CAP by score.
// ============================================================================

const TOP_CAP = 500; // keep the best N; drop the rest on write
const MAX_NAME = 24;
const KEY = 'board';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

// Strip control chars, collapse whitespace, clamp length. Keeps the board from
// being wrecked by newlines / absurdly long names. (Actual profanity is handled
// by the human admin via the in-game delete.)
function cleanName(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/[\x00-\x1f\x7f]/g, ' '); // control chars -> space
  s = s.replace(/\s+/g, ' ').trim(); // collapse whitespace
  if (s.length > MAX_NAME) s = s.slice(0, MAX_NAME);
  return s || 'Anonymous';
}

async function readBoard(env) {
  const raw = await env.LEADERBOARD.get(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeBoard(env, board) {
  board.sort((a, b) => b.score - a.score);
  if (board.length > TOP_CAP) board = board.slice(0, TOP_CAP);
  await env.LEADERBOARD.put(KEY, JSON.stringify(board));
  return board;
}

// Server-side id (never trust a client id). Time-ordered + random suffix.
function makeId(now) {
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `${now.toString(36)}-${rand}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET /scores → the ranked board.
    if (path === '/scores' && request.method === 'GET') {
      const board = await readBoard(env);
      board.sort((a, b) => b.score - a.score);
      return json({ scores: board });
    }

    // POST /scores → append one entry. Open to all (that's the point).
    if (path === '/scores' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const score = Math.round(Number(body.score));
      if (!Number.isFinite(score)) return json({ error: 'bad score' }, 400);
      const entry = {
        id: makeId(Date.now()),
        name: cleanName(body.name),
        score: Math.max(-1e9, Math.min(1e9, score)),
        grade: String(body.grade || '').slice(0, 2),
        ts: Date.now(),
      };
      const board = await readBoard(env);
      board.push(entry);
      const saved = await writeBoard(env, board);
      const rank = saved.findIndex((e) => e.id === entry.id) + 1;
      return json({ entry, rank, scores: saved });
    }

    // DELETE /scores/:id → admin only.
    if (path.startsWith('/scores/') && request.method === 'DELETE') {
      const key = request.headers.get('X-Admin-Key') || '';
      if (!env.ADMIN_SECRET || key !== env.ADMIN_SECRET) {
        return json({ error: 'forbidden' }, 403);
      }
      const id = decodeURIComponent(path.slice('/scores/'.length));
      const board = await readBoard(env);
      const next = board.filter((e) => e.id !== id);
      const saved = await writeBoard(env, next);
      return json({ ok: true, removed: board.length - next.length, scores: saved });
    }

    return json({ error: 'not found' }, 404);
  },
};
