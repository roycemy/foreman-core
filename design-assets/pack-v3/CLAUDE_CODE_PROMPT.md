# Claude Code prompt: apply Alter design pack v3

Repo: `roycemy/foreman-core`, branch from `design/alter-pack`. The job is visual only: keep every behavior, API call and copy source as it is. Read `SPEC.md` for exact values and `CONFLICTS.md` for the reasons. Don't add features that aren't listed here: no new logos, no recap, no streaks, no night mode, no room tints. The H1 logo stays.

## Files to add
- `public/styles/tokens.css`: append the contents of `tokens.css` from this pack (only `--a-*` tokens; existing tokens are untouched).
- `public/styles/components/`: copy `components/*.css` here, and link them from `public/app.html` after `app.css`.
- `public/js/components/`: copy `components/*.js` here, and load them in `public/app.html` after `floor.js` and before `app.js`, in this order: `dock.js`, `bot-status.js`, `estimate.js`, `bot-work.js`, `meeting.js`, `receipt-ship.js`, `reconnect-flag.js`.

## Edits to existing files (all were applied on the fly to make the shots; see `tools/patch.js`)
1. `public/js/floor.js`
   - `ROOM_TYPES`: add `meeting: { name: 'Meeting room', props: ['maptable', 'board', 'mugs'], verb: 'meeting' }`.
   - `ROOM_MAP`: change `sales: 'mailroom', support: 'mailroom'` to `'meeting'`.
   - `fit()`: before `f.style.setProperty('--px', …)`, add `if (BB.clampPan) pan = BB.clampPan(pan, fw, W, H);`.
   - `draw()`: idle and queued bots at home sit. The pose becomes `(r.tk && r.tk.startsWith('home') && !ghost && s.kind !== 'reconnect') ? 'sit' : 'stand'` (walking still wins). Set `r.el.dataset.idle = String(s.kind !== 'run')` so the typing animation runs only on a real job.
   - At the end, export `BB.W2P = W2P; BB.PJ = PJ; BB.F = F; BB.walkTo = walkTo; BB.setPos = setPos;` and `BB.propPoint(room, i)` (the prop slot plus half its footprint; see `tools/patch.js`).
   - In `place()`, for each bot with `BB.signal(a) === 'working'`, append a `.wdot` to `#ov` at `[r.x, r.y - (sit ? 11.2 : 14)]%`. When `BB.useDots()` is true, skip the activity glyph.
   - In `render()`, when a bot first gets a running job, call `BB.workCycle(r, a, t.p)`.
   - In `build()`, append `BB.meetGlowSVG()` into `#fx`.
   - On a real HANDOFF event between two bots, call `BB.handoff(rFrom, rTo, BB.handoffLine(...), [homeFrom, homeTo])`.
2. `public/js/app.js`
   - After boot, call `BB.reconnectFlag.mount()`. It moves `#crew` and `#roster` into `.a-corner`.
   - In the `BB.on` diff where tasks flip to `done`/`failed`, call `BB.shipReceipt(task)`. Call `BB.receiptsBadge()` on boot.
   - Roster rows (`paintRoster`): render the name and the honest status with `BB.honestStatus(a)`. Markup: `<b>name</b><span class="bst-line"><i class="bst-dot"></i>line</span><span class="bst-why">why</span>`, and the row gets `class="r bst" data-s="…"`.
3. `public/js/connect.js`: export the existing setup-message builder as `BB.setupMessage(agent)`. Don't change the text. The flag copies exactly that.
4. `public/js/inspector.js`
   - Header: replace the status `<p>` with the `.bst` block from `BB.honestStatus(a)`.
   - In `jobHTML`, for `running`/`queued` rows, append `BB.estimateHTML(t, BB.tasks())` after the `<small>`.
   - Repaint estimates once a minute, not every second.
5. `public/js/receipts.js`: at the end of `list()`, call `BB.markNewRows(V)`.
6. `public/js/core.js`: no change. `BB.presence`, `BB.signal` and `BB.runningTask` stay the single source of truth.
7. `api/`: the reconnect reason is read from `agent.connection.reason`, one of `session_expired | token_reused | login_missing | revoked | quiet`. If the API doesn't send it yet, map it from the existing `needs_reauth` cause, or default to `session_expired`. No other backend change.

## Check
- `npm test` (all regression suites).
- Shots: `cd <pack>/tools && node jobs.js` reproduces every context shot against your working copy (edit `PUB` in `shoot.js`).
- At 390, 768 and 1440, check that nothing overlaps: flag, crew pill, tour, heading, chips, type box and tab bar.
- Turn on reduced motion and confirm there's no flight, walk, bob or glow.
