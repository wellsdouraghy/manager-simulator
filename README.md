# Manager Simulator

A first-person desk-survival game for talent managers: you never leave your
chair, triaging DMs, emails, negotiations, and invoice chases across one
accelerating 3-minute workday. Reach 6 PM and you get a shareable performance-
review report card — a title, your commission, and a copy-to-clipboard brag.

## Run

```bash
npm install
npm run dev      # play at the printed localhost URL
npm run build    # static dist/ — deploy to any static host (Netlify, Pages, S3…)
npm run preview  # serve the built dist/ locally
```

Requires Node 20.18+ (Vite 6).

## Controls

- **Look**: move the cursor (head-follow); push it to the screen edges to pan
- **Stations**: `1` phone · `2` inbox · `3` deal board · `4` door, or
  `A`/`D` / `←`/`→` to step between them
- **Click**: everything on the screens is real DOM — reply chips, the tug-of-war
  handle, the tone dial. The mug and the door are 3D clicks.
- **Hold** (or `SPACE`) in a negotiation to pull the tug toward your terms.
- **🔊 toggle** (bottom-right): sound on/off, persisted.

## Where content lives

**All** copy, jokes, task data, and design tokens live in `src/content.js` —
nothing is hardcoded in logic files. The main arrays:

- `EMAILS` — `{ id, sender, from, subject, preview, body, ttl, chips:[{ label,
  effects, toast? }], spam?, guaranteed?, route?, scopeCreep? }`. Chip effects:
  `{ commission, burnout, quality:'good'|'bad'|'neutral', special, coinflip }`.
- `DMS` — `{ id, creator, text, timestamp, ttl, react?, chips:[…] }` keyed to a
  creator in `CREATORS`.
- `NEGOTIATIONS` — `{ id, brand, creator, dealValue, commission, anchorLabel,
  targetLabel, ttl }`.
- `INVOICES` — `{ id, brand, number, amount, days, commission, ttl }`; the
  correct tone stop is derived from `days` via `TONE_MIN_DAYS`.
- `DOOR_EVENTS` — boss / intern / maintenance walk-in cards.

To add an item, push a new object onto the matching array following the shape
above. New good-reply chips get the August pre-glow for free; mark an email
`scopeCreep: true` to make it auto-handle under August Mode.

### Report card, titles, and share text

- `REPORT_CARD` — every label on the performance-review document.
- `TITLES` — `[{ title, when }]`, evaluated top-to-bottom, first match wins.
  `when` is a **condition key** (e.g. `'closer'`, `'passout'`), resolved by the
  predicate table in `src/report.js` — add a key there when you add a title.
- `SHARE` — the clipboard template. `{tokens}` are filled by `report.js`.

## Renaming August Mode / setting the share URL

At the top of `src/content.js`:

- `AUGUST_NAME` — the assist-mode name (default `'August'`). Referenced
  everywhere by constant, so a one-line change renames it across UI + share.
- `GAME_URL` — where the share text points. Replace before shipping.

## Palette

`src/content.js` `PALETTE` is the single source of truth for both 3D material
colors and the DOM CSS variables (`applyPaletteToCSS()` pushes them to
`:root`). Tokens: `--ink` / `--ink-deep` (navy), `--glow` (warm off-white),
`--urgent` (coral), `--mint` (success/money-good), `--gold` (commission).

## Persistence

`src/storage.js` wraps `localStorage` (all try/catch-guarded for private mode):
best commission (`ms:best`), August unlock/on (`ms:augustUnlocked`/`ms:augustOn`),
and the sound toggle (`ms:soundOn`). August Mode unlocks after the first run that
reaches 6 PM.

## Performance notes

No post-processing (no `EffectComposer`) — this is a deliberately cheap render.
The architecture is **hybrid CSS3D + WebGL**: the room, desk, monitors, and
props are flat-shaded Three.js primitives on a `WebGLRenderer`, while every
interactive screen UI is real DOM mapped onto a monitor/phone face by a
`CSS3DRenderer` sharing the same camera. That means the screens are crisp, fully
accessible DOM (real buttons, text, layout) instead of rendered textures, and
the only "effects" are additive camera-shake, HUD-div overlays (vignette, damage
flash, `+$` floaters), per-material color lerps for the burnout desaturation, and
a handful of short-lived `THREE.Points` bursts (steam, confetti). All motion
respects `prefers-reduced-motion` (camera shake is suppressed; readability cues
and floaters/confetti stay). Sounds are WebAudio-synthesized on demand — no audio
assets, created lazily on the first user gesture to satisfy autoplay policy.

Built with Vite + vanilla JS. No image/audio assets: every model is a Three.js
primitive, icons are emoji, sounds are synthesized.
