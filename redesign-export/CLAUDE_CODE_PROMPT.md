# Paste into Claude Code (run at the foreman-core repo root)

You are applying an owner-approved visual redesign ("Porcelain & Vermilion") to foreman-core. It is a restyle plus a few markup additions. **Do not change any API contract, route, endpoint, request body or server behavior.**

## Inputs
Unzip `blackbox-redesign-export.zip` into `./redesign-export/`. Read `README.md`, `CHANGES.md`, `HOOKS.md` and `CONSENT_COPY.md` first.

## 1. Place files
- `redesign-export/public/index.html` → replaces the served app shell (today `public/index.html`, served at `/`).
- `redesign-export/public/oauth.html` → replaces the file served at `/oauth/authorize` (find the route that serves it; keep the route).
- Add `public/brand.js`, `public/styles/tokens.css`, `public/styles/app.css` and `public/hq/floor.svg`. Keep any existing `public/hq/*` files other code may reference.
- `redesign-export/marketing/index.html` → add it as a separate page. **Do not change routing yet.** Recommended routing (the owner decides): marketing at `/` for signed-out visitors and the app at `/hq`; if adopted, set `appUrl:'/hq'` in `brand.js`. Make sure `/brand.js` and `/styles/*` are served with correct MIME types (check `vercel.json` rewrites so they are not swallowed by an SPA catch-all).

## 2. Preserve shipped features (merge, don't overwrite blindly)
The export was generated from the live `index.html` on 2026-10-08 (PR #3 included; PR #4's backend already merged). Before replacing, diff the repo's current `public/index.html` against `redesign-export/tools/live-index.snapshot.html`.
If the repo has newer commits, re-run the generator instead of hand-merging:
`cd redesign-export/tools && python3 build_index.py ../../public/index.html ../public/index.html`. It fails loudly if an anchor moved; fix the anchor in `edits_link.py` / `build_index.py` and re-run.
- **PR #3 deeplink:** `#cursorinstall` must still be built as `cursor://anysphere.cursor-deeplink/mcp/install?name=<encodeURIComponent(BRAND.name)>&config=<encodeURIComponent(btoa(JSON.stringify({url: location.origin + '/api/mcp'})))>`. Do not invent a new format. Note: renaming the brand changes the MCP server name Cursor shows.
- **PR #4 reconnect backend:** the UI reads `agent.connection.status` from `GET /api/state` (`needs_reauth` → "Reconnect needed"; `active` + reported → Connected; `verification_pending` → Waiting; `awaiting_bot` → Prepared/Waiting). `window.presenceOf()` in `index.html` is the single mapping. Do not change the backend.
- All hooks in `HOOKS.md` must still exist (ids, `data-*`, window globals, route keys).

## 3. Consent copy must stay verbatim
Diff `public/oauth.html` against the live page: `curl -s https://foreman-core.vercel.app/oauth/authorize > /tmp/live-oauth.html`.
The only allowed text differences are `Black Box` → `'+BRAND.name+'` (and `{brand}` in `<title>`/`h1` slots) and three added `class="oa-scope|oa-ret|oa-foot"` attributes. Every string in `CONSENT_COPY.md` must render exactly. If the live copy changed since 2026-10-08, port the new copy into `oauth.html` unchanged.

## 4. TODO-wire (needs your judgment; keep the UI as designed)
1. **Reconnect action.** `window.reconnectBot(id)` reopens connect step 2 for the existing bot (setup message plus Install in Cursor) and waits until `connection.status === 'active'`. `POST /api/agents/:id/reconnect` needs the *client's* `client_id`, `redirect_uri` and `code_challenge` (it returns 409 `client_reconnect_required` without them), so the owner UI cannot call it directly. Only wire a direct call if a client-side flow that holds those params exists. Do not loosen the endpoint.
2. **Prepared vs Waiting for `awaiting_bot`.** This currently depends on UI state (`window.__linkWaiting` = the bot whose step 2 is open). If the backend later exposes "connect started at", use it inside `presenceOf()` only.
3. **Legacy hidden markup.** `#away` (hidden) still mentions "Ledger" in demo copy. It is never shown; delete it if it is dead code.
4. **No-JS.** Brand slots carry neutral fallback text and there is a `<noscript>` notice. The app itself requires JS (unchanged).

## 5. Run and verify
```
python3 -m http.server 8771 --bind 127.0.0.1 --directory public &
cd redesign-export/tools && npm i playwright-core   # or reuse an existing install; set the Chrome path in verify.js
node verify.js        # mocked API; prints PASS/FAIL and writes verify-results.json
```
Then smoke-test against the real backend (preview deploy):
- sign in, land on `#office`;
- connect flow steps 0–2: Copy setup message and Install in Cursor both visible;
- approve and deny a real request;
- move a worker's room;
- card sandbox actions;
- `/oauth/authorize` sign-in, consent and error states.

## 6. Acceptance checks (all must pass)
- [ ] `grep -rniE "black ?box" public marketing | grep -v public/brand.js` returns nothing. Changing `name` in `brand.js` rebrands the app, OAuth page, marketing, setup message, deeplink name, titles and aria-labels.
- [ ] No console errors on any screen (401 before sign-in is expected).
- [ ] Route keys office, work, approvals, stubs, policies, receipts→work, money and cards each show exactly one `.view.on`.
- [ ] Four presence states render distinctly; only Connected looks live; Reconnect needed is never a ghost and never "connected".
- [ ] Step 2 shows Copy setup message (primary) and Install in Cursor at equal size; the deeplink format is unchanged.
- [ ] `[data-r]`/`[data-d]` approve and deny POST `/api/requests/:id/approve|deny`; A/D keys work at the island.
- [ ] OAuth copy is verbatim per CONSENT_COPY.md.
- [ ] Emergency is reachable at 1440 / 1024 / 768 / 390 / 320 px; no horizontal page scroll; the floor fits at 390 and 768.
- [ ] Reduced motion: no walking or animation. Keyboard: skip link, visible focus, Escape closes dialogs and the drawer, focus returns.
- [ ] No API contract changes (`git diff` touches only static files in `public/`, plus routing config if the owner approves).

Open a PR; do not merge without owner review.

## Round 2: quiet floor (you already applied round 1)
Inputs: this zip again. Read `ROUND2.md` first.
1. Replace `public/index.html` and `public/styles/app.css` with the new versions (no other public file changed). If you ported round 1 into your own sources instead of copying the generated file, port these instead:
   - The round-2 module `tools/pv-r2.js`, spliced into the floor layer exactly as `tools/apply_r2.py` does. It covers `identityOf`/`figureSVG`/`avatarHTML`, `humanStatus`/`statusKind`, `ROOM_TYPES`/`ROOM_MAP`/`roomName`, props + island layer `#pv-props`, the single `#floor-label`, the `.sdot` status dot, `mkEl`/`drawFig`/`paint`/`list`/`buildFloor`/`walk`/`openDr`/`closeDr` hooks, and the card and strip copy.
   - `tools/pv-layer.js`: Team rows use `humanStatus`, and the drawer room select is deduped.
   - `tools/edits_link.py` 8g: room names go through `roomName()`.
   - The "Round 2: quiet floor" block at the end of `app.css`. It must win over any earlier `.bub/.tok/.tag2/.bdg/.worker-label` rules, so check your port has no leftover rule that shows `.tok` (that was the stray "Research brief" text).
2. Keep everything else from round 1: hooks (`.ch` role=button/tabindex/Enter → `openDr`, `[data-worker]`, `#floor-approval [data-r][data-d]`, `.zone-sign[data-room]` + `#ct-*`), presence rules, approve/deny, brand token.
3. Work through the "Backend room-key assumptions" list in ROUND2.md and report what you find. Do not add a room-type endpoint.
4. Verify: `python3 -m http.server 8771 --directory public` and `node tools/verify.js`. The new checks: quiet floor (no floating text), a status dot on every figure plus the reconnect badge and island "!", the copy mapping, one label on focus that does not overlap signs or the card, the label hiding on blur, and room signs from the catalog. Mockups: `node tools/r2sheets.js`.

## Round 3: calm top bar, phone sheet, fluid motion (you already applied rounds 1–2)
Read `ROUND3.md` first.
1. Replace `public/index.html` and `public/styles/app.css` again. If you port by hand instead:
   - add `tools/pv-r3.js` as the last inline script (`build_index.py` step 10),
   - append both "Round 3" CSS blocks to the end of app.css,
   - apply the two `apply_r2.py` changes: strip `className='walking'` and the Lounge-sign avoidance in `placeCard()`.
2. Don't change these:
   - `#sum` stays `role=status` + `aria-live`; only its inner markup changes, and the full text stays in `.sr-only`.
   - `#strip` and its `[data-r][data-d]` buttons stay (hidden on HQ/Approvals by CSS only).
   - `#addb`, `#emer` (aria-label "Emergency controls") and `#emodal` are unchanged.
   - The nav keeps its hrefs and `data-v`.
   - `#floor-approval [data-r][data-d]` and the A/D keys still work while the sheet is collapsed.
3. Check that your target browsers support CSS `:has()`. If any don't, toggle a `body.view-office` / `body.has-card` class in JS instead.
4. Round 3.1 (phone HQ fill) also changes `fit()` (adaptive phone zoom plus centring, via `apply_r2.py`), `pv-r3.js` (phone sign anchors, pan tracking, `--sheet-h`) and the "round 3.1" CSS block. The floor's DOM and hooks are unchanged.
5. Verify: `python3 -m http.server 8771 --directory public`, then `node tools/verify.js` (74 checks, including 13 R3 checks). Shots: `node tools/r3shots.js`.

## Round 3.2 (polish)
1. Phone HQ (app.css "round 3.2" block): `.floorwrap` is `flex:none`, `#floor` is top-anchored, `#diorama-tools` sits at the floor's top-left, and the roster is open by default (pv-r3.js rosterHead no longer adds `r3-collapsed`). The phone zoom is `clamp(1.3, innerHeight*.4*ASPECT/w, 1.45)` (apply_r2.py).
2. Walk: the `pv-step`/`pv-swing` keyframes use ease-in-out at .56s, with `.leg.r`/`.arm.r` delayed by half a cycle. figureSVG frames rotate the arms in opposite directions. walk() sets a per-leg timing function (ease-in, linear, ease-out).
3. Depth: pv-r2.js renderProps writes one `svg.pv-prop` per prop into `#chl`, with `z-index=round(W2P(footprint centre).y*10)` and data-kind/wx/wy. FOOT holds the footprints. Keep `#chl .pv-prop{position:absolute;inset:0}`.
4. Copy: the pv-r3.js `TRIM` table plus `.team-metrics` rewrite text after render (skips #v-office and any view with `.synth`). Never trim OAuth consent copy.
5. Verify: `node tools/verify.js`. It has new R3.2 checks for the phone floor under the nav, roster open, depth sorting and the walk cycle. Shots: `node tools/r32shots.js`.

## Round 3.3 (type + Team)
1. Fonts: use Geist only. Load only Geist + Geist Mono, never Instrument Serif. `--f-display`/`--f-mono` are Geist sans (legacy names). Use `--f-code` (Geist Mono) only for code: connector address, ids, `code`/`pre`/`[data-code]`. Headings are weight 600 with -.02em tracking. No uppercase or mono labels. `kbd` is hidden; the keyboard shortcuts remain.
2. pv-r3.js `capsFix` sentence-cases the legacy all-caps status labels (strip, island). Prefer fixing these at the source when porting.
3. Phone `.cards` are a single scrollable row of chips. Team Remove is `.btn.red` styled as a quiet text button (same handler).
4. pv-layer.js no longer inserts the "Your team" eyebrow.
5. Shots: `node tools/r33shots.js`.
