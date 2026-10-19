# ROUND 2: Quiet floor (patch note)

Applies on top of round 1. Only the HQ floor and its roster change. Approve/deny, presence, connect/reconnect, routes, API calls and the brand token stay the same.

## What changed for the owner
- **Quiet by default.** Each employee is just a figure with one small status dot: green = working, hollow = idle, vermilion = needs you, link badge = reconnect, dashed = not connected yet. No text floats above anyone.
- **One label at a time.** Name plus a short status (4 words or fewer) appears only on hover, keyboard focus or selection. It is placed so it never covers a room sign, the island card or another figure. Two signals still show without hover: a small vermilion **!** on whoever waits at the island, and the **reconnect** badge.
- **Plain words.** Raw status strings are mapped to short human statuses. The full text lives in the drawer (and in the Team row tooltip).
- **New characters.** Six custom SVG people replace the robots. Each has a distinct silhouette and one accessory (headset, beanie, glasses, scarf, cap, bun), and colour comes from a curated palette with no vermilion. Poses are idle, a 2-frame walk and seated typing on a laptop. With reduced motion there is no walk cycle or typing. Ghost (Prepared/Waiting) is dashed; Reconnect stays solid with a badge.
- **Rooms for any kind of work.** Rooms are data: name, icon and three themed props. Ten types: Studio, Library, Workshop, Mailroom, War Room, Lab, Lounge, Front Desk, Garden, Vault.
- **More alive, still calm.** Themed props appear in every room. Ambient life is limited to coffee steam, blinking server LEDs, a breathing lamp glow, a swaying planter and a turning record, all of it off under reduced motion. The floor gets warm light and a deeper floating shadow, with no extra text.
- **Island as the focal point.** A layered white-and-vermilion plinth with a warm under-glow that breathes only while something waits. It has a dark tray holding the request papers (the top sheet edged in vermilion) and a desk lamp. The card header now reads "Needs you" (plus "1 of N" when there are several). The strip says "Grok Bot is bringing you a request. Review".

## Where each removed pop-up came from
| Seen in owner screenshot | Element | Source |
|---|---|---|
| Dark "Research stop" chip | `.ch .bub` | `workDestination()` → `bubble:'Research stop'`, assigned by the work-trip loop (`a.bub=dest.bubble`) and painted by base `paint()` (`txt=a.bub||…`, `.bub-on`) |
| Dark "Ambient: lounge break" chip | `.ch .bub` | `ambientTrip()` (`a.bub='Ambient: lounge break'`) in the diorama layer, plus the older ambient layer (`a.bub=label`, "Ambient: back to desk") |
| Stray unstyled "Research brief" text | `.ch .tok` | `a.carry` from `workDestination()` (`'Research brief'`, `'Document'`, `'Coffee'`) and `approvalMove()` (`'Request'`), painted with an emoji by base `paint()`. Round 1's app.css hid it, but the owner's port had no rule, so it showed as raw text. |
| "Instinct main / Working: Name research for Black…" card | `.ch .tag2` (name + role + `.st2` = raw `a.now`) and the round-1 `.worker-label` (name + raw `a.now`) | base `mkEl()` / `paint()`, round-1 `workerLabel()` |
| Others never meant for owners | `.bub` texts "Walking to Needs Approval", "Waiting for your decision", "Returning to my workstation", "Back to my desk", "Moving to …", "Approve?", "Coffee break", "Working on notes"; `.bdg` emoji badges | `approvalMove()`, work trips, room move, base `paint()` |

All of these nodes still exist (base `paint()` writes to them), but `mkEl` marks them `hidden` + `aria-hidden`, and app.css forces `display:none!important`. The logic that sets `a.bub`/`a.carry` is untouched.

## Copy mapping (`window.humanStatus(a)`)
Order matters: presence first, then state, then the text.
| Raw | Shown |
|---|---|
| presence reconnect / prepared / waiting / revoked | Reconnect needed / Not connected yet / Waiting to connect / Access revoked |
| `st=needs`, "Waiting for approval: …" | Needs you |
| `st=blocked` / `st=paused`, "Kill switch on" | Blocked / Paused |
| ambient trip, "Ambient: …" | On a break |
| "Working: web.fetch" / notes.write / notes.delete / work.handoff | Reading the web / Writing a note / Tidying notes / Handing off work |
| "Working: Name research for Black Box" | Name research |
| "Working: Writing the Q4 brief" | Writing Q4 brief |
| "Compare competitor pricing pages and summarize…" | Compare competitor pricing pages… |
| "Handing … to …" / "Received: …" | Handing off work / Got new work |
| "Task still open; no recent update: …" | No recent update |
| "Standing by", "Available…", "Connected, waiting…", empty | Available (or "Just finished" when `st=done`) |
| anything else | strip a leading `Label:` prefix, then title rule |

Title rule: drop quotes and the articles a/an/the, cut at the first preposition after two words (for, to, on, with, about, from, of, in, at, into, via, using, by), keep at most 4 words or 32 characters on a word boundary, add "…" only when words were dropped, and capitalise the first letter.

## Room types (data-driven)
`ROOM_TYPES` (in `pv-diorama.js`) gives each type `{name, good, props:[3]}`; icons are in `ICONS`, props in `PROPS` (tiny isometric SVG drawings using the floor projection).
Default mapping of the **existing backend keys**: `finance → Library`, `marketing → Studio`, `sales → Mailroom`, `support → Mailroom`, `ops → Workshop`, `lounge → Lounge`.
To override per page, set `window.HQ_ROOMS = { ops: 'lab', marketing: 'warroom' }` before the floor script. Signs, the alt text, the roster, the island card, the drawer's move menu and the moveRoom toast all read `roomName(key)`.

## Backend room-key assumptions Claude Code must check
1. **Keys are unchanged.** `moveRoom` still checks `ROOMK = ['ops','sales','marketing','finance','support','lounge']` and POSTs `{room:<key>}` to `/api/agents/:id/room`. Room types are presentation only, so confirm the server still accepts exactly these keys.
2. **sales and support share one physical room.** Both map to Mailroom. The drawer's move menu hides the duplicate `support` option unless the agent is already in support. Check whether the server treats `support` differently from `sales` (routing, permissions, reports). If it does, map `support` to `frontdesk` and give it its own area. That needs a floor layout change: `BOXW`, `SEATW`, `SIGNS`, `SLOTS`.
3. **Old room names in server-made text.** Search the server for "Research Center", "Execution Center", "Outreach Center", "Creative / Marketing". Any activity, receipt, notification or setup-message text built server-side will still show the old names.
4. **Persisting the owner's choice.** `window.HQ_ROOMS` lives only on the client. Persisting a per-workspace choice needs a backend field (e.g. `workspace.roomTypes`). It is not wired; do not invent an endpoint.
5. **More than 5 physical areas.** The floor art has 4 walled rooms plus the lounge. Ten types can be *assigned*, but adding a room means a new backend key plus new floor coordinates.
6. **Status vocabulary.** `humanStatus` keys off server prefixes (`Working:`, `Waiting for approval:`, `Ambient:`, `Received:`, `Handing `, `Task still open`, `Kill switch`, `Standing by`, `Available`). If the server changes them, update the map. Better still, have the server send `{activity, taskTitle}`.

## Files
- `tools/pv-r2.js` (new): room catalog, props, island, figures, `humanStatus`, the single floor label.
- `tools/apply_r2.py` (new): splices it into `tools/pv-diorama.r1.js` (round-1 source, kept) and writes `tools/pv-diorama.js`.
- `tools/pv-diorama.js`: regenerated.
- `tools/pv-layer.js`: Team rows show `humanStatus` with the full text as a tooltip; drawer move menu dedupes.
- `tools/edits_link.py`: room-name ternaries and the drawer select use `roomName()`.
- `public/styles/app.css`: new "Round 2: quiet floor" block at the end.
- `public/index.html`: regenerated (`python3 tools/apply_r2.py && python3 tools/build_index.py <live index.html> public/index.html`).
- Unchanged: `brand.js`, `tokens.css`, `hq/floor.svg`, `oauth.html`, marketing.
- Mockups: `shots/quiet-floor-compare.png` (before | after), `quiet-floor-before.png`, `quiet-floor-after-1440.png`, `quiet-floor-after-768.png`, `quiet-floor-after-390.png`, `quiet-floor-hover-1440.png`, `quiet-floor-closeup.png`, `figures-sheet.png`, `rooms-sheet.png`.
