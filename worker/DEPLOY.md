# Leaderboard Worker — deploy

One-time setup (from `worker/`):

```bash
# 1. Log in (opens a browser; approve once)
npx wrangler login

# 2. Create the KV namespace, then paste the printed id into wrangler.toml
npx wrangler kv namespace create LEADERBOARD

# 3. Set the admin secret (used by the in-game Cmd+Shift+E delete mode).
#    Pick a strong value; it is NEVER shipped to the browser.
echo "YOUR-ADMIN-SECRET" | npx wrangler secret put ADMIN_SECRET

# 4. Deploy — prints the https://manager-leaderboard.<sub>.workers.dev URL
npx wrangler deploy
```

Then put that URL into `src/leaderboard.js` (`ENDPOINT`) and rebuild the site.

## API

- `GET  /scores` → `{ scores: [{id,name,score,grade,ts}, ...] }` (ranked)
- `POST /scores` `{name,score,grade}` → appends, returns `{entry,rank,scores}`
- `DELETE /scores/:id` with header `X-Admin-Key: <ADMIN_SECRET>` → admin delete

Appends are open to everyone (that's the point). Deletes require the secret,
so a score can't be removed except through in-game admin mode.
