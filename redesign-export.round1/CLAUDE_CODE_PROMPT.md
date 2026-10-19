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
