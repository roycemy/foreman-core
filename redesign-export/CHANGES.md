# CHANGES: Porcelain & Vermilion redesign (owner-approved, with changes)

Baseline: the LIVE production files fetched 2026-10-08. Live `index.html` (252,886 B) was newer than the earlier attachment by 2 hunks: the PR #3 "Install in Cursor" deeplink and the rewritten setup message. Live `oauth.html` adds one sentence ("This authorization can renew automatically…").
`public/index.html` is generated from live by `tools/build_index.py` (edits, not a rewrite). All JS behavior, routes and API calls are unchanged.

## Global
- Before: 12 stacked `<style>` layers (indigo, warm-unify, v15–v19) plus 3 JS-injected style strings. After: all removed; styling comes from `styles/tokens.css` and `styles/app.css`. The injected strings are emptied and their rules re-specified.
- Before: "Black Box" / "BLACK BOX" hardcoded in 49 places. After: one constant in `/brand.js` (`BRAND.name`). It drives `<title>`, wordmarks, JS strings, the setup message, the Cursor deeplink `name`, aria-labels and alt text, the OAuth page and marketing. Rebrand = change one line (verified with `Acme Ops`).
- Indigo palette remapped to Porcelain & Vermilion inside script-built markup (green → live #1C7A4A, red → #A62D17, etc.).
- New: skip link, `<noscript>` notice, dialog semantics, a focus trap with Escape and focus restore for `#modal`, `#emodal`, `#dr` and the account menu, and a global reduced-motion rule.

## Top bar
- Before: wordmark · nav · status text · While-you-were-away · + Connect · "Emergency controls" text link · "Sign out (email)" button.
- After: wordmark · nav (vermilion underline on the active tab) · grouped status pill (`#sum`, mono) · + Connect AI Employee · Emergency **icon button** (label shows on hover and focus, `aria-label="Emergency controls"`) · **account menu** (initials → email + Sign out).
- Emergency stays visible at 1440, 1024, 768, 390 and 320 px. Below 980 px the nav and the status pill each move to their own full-width row.

## Sign-in (bridge)
- Before: a dark full-screen overlay with a small white box. After: a split layout. An ink panel shows the tagline and "Sign in → Land on your HQ floor → Approve at the island"; a form panel follows. All ids and texts are kept; "Sign in to your HQ" is the heading.
- After sign-in, the hash goes to `#office`, so you always land on the HQ floor.

## HQ floor
- Before: raster `office.webp` with front layers, robot.webp sprites, Ledger on the floor, and floating fixed-position tools and list.
- After: `/hq/floor.svg`, an isometric environment (Research, Creative / Marketing, Outreach, Execution, Lounge, an Arrivals pad, the approval island).
  - Employees are SVG figures, distinct by provider silhouette, color and initials.
  - Walking follows a corridor graph; reduced motion teleports.
- **Ledger removed.** The Prepared example is a real connectable bot ("CEO", Instinct). It waits as a ghost on the Arrivals pad and never takes ambient trips.
- Desktop ≥1100 px: a 300 px roster column ("On the floor") beside an aspect-locked floor. The approval card is anchored beside the island with a dashed leader, and A/D shortcuts work.
- Compact (<1100 px, including 768 and 390): floor full-width, then the approval card in flow, then the roster. Zoom tools move to the empty top-left corner. Signs get smaller, labels are trimmed, and there is no horizontal page scroll.
- Fixed: "Connected, waiting for first activity" no longer appears for bots that never reported. They read Prepared or Waiting for bot.

### Floor labels at narrow widths (follow-up fix)
- Before: at 390 px Scout's name card covered the EXECUTION CENTER sign, Grok Bot's figure stood on the NEEDS APPROVAL sign, and Grok Bot's card overflowed the floor edge.
- After (<1100 px):
  - Per-employee name cards are hidden on the floor; the roster below names everyone. Only the selected employee's card shows (`.worker-label.is-sel`), and speech bubbles are hidden.
  - Needs-you (!) and Reconnect (broken-link) badges stay on the figures.
  - Room signs use short names (RESEARCH / CREATIVE / OUTREACH / EXECUTION / LOUNGE, through `.zs-full`/`.zs-short`; `#ct-*` is kept) and a smaller type size, nudged to stay inside the floor.
  - The NEEDS APPROVAL sign moved to the island's right side, away from the queue slots, so a waiting robot never covers it.
  - ≤760 px: figures are drawn smaller (30×52) but keep a transparent 44×64 tap target (`.ch .body::before`).
- Desktop: the approval card now never covers the island sign. It sits to the sign's right, or moves above or below it when there is no room. The Outreach sign moved down the wall, clear of Scout's reconnect card.
- Checked by bounding-box test at 390, 768 and 1440 px: 0 collisions between signs, labels and figures, and nothing outside the floor.

## Presence (new 4th state)
- Prepared (dashed stone) · Waiting for bot (ask wash) · **Connected** (live green, the only "live" look) · **Reconnect needed** (vermilion 1.5 px outline plus broken-link icon).
- These come from PR #4's `agent.connection.status`:
  - `needs_reauth` → Reconnect needed;
  - `active` + reported → Connected;
  - `verification_pending` → Waiting;
  - `awaiting_bot` → Prepared, or Waiting while its connect step 2 is open.
- Reconnect needed shows on the floor (solid figure at its desk plus a badge and an always-visible label), the roster, the Team row (with a **Reconnect** button), the drawer (Connection section plus **Reconnect {name}**), and `#linkstatus`.

## Connect flow (`#modal`)
- Added: a step header (1 Choose bot · 2 Name it · 3 Authorize), a close ×, a labelled dialog, and backdrop click / Escape that now also clear the poll timer.
- Step 2 before: `Install in Cursor` (btn pri) then `Copy setup message` (btn pri) then `Copy connector address`. Step 2 after: **Copy setup message** (vermilion, first) and **Install in Cursor** (ink) at identical size, in a 2-up group; `Copy connector address` becomes a small ghost button. The live code gave both buttons `btn pri`, so neither was demoted; following the owner's rule, Copy stays primary.
- All step copy, the 6-paragraph setup message and the deeplink builder are unchanged (brand only).
- `#linkstatus` gains `role=status`, `aria-live` and `data-presence`. The poll now needs `lastSeen` **and** presence = connected; it also reports when the grant drops mid-flow.
- New Reconnect mode (`reconnectBot(id)`): title "Reconnect {name}", a reconnect banner (with the reason when known), the same two actions, and status that clears only when `connection.status` is `active` again. No `POST /api/connect`.

## OAuth consent (`oauth.html`)
- Styling and layout only. All copy is verbatim (see CONSENT_COPY.md); only the brand name is a token.

## Team / Drawer / Work / Needs You / Permissions / Money
- Restyled with tokens (display-serif headings, hairline tables, mono metrics, AUTO/ASK/NEVER as live/ask/ink segments).
- Team rows and the drawer gain presence chips and Reconnect. The doll SVG avatars become identity initials.

## Card sandbox
- The SYNTHETIC notice becomes a sticky hatched banner with the kill switch at its right. The form gets visible labels; caps become compact rows.
- **Tightened spacing above "Decisions" and "Synthetic ledger"**: the gap was ~16 px card margin + 4 px + a 32 px serif heading; it is now 20 px with a 24 px heading.

## Marketing (`marketing/index.html`)
- A separate public surface. It shares tokens.css and brand.js and never loads the app shell. Sign in / Open your HQ link to `BRAND.appUrl`.

## Round 2: quiet floor (see ROUND2.md for the full patch note)
- Before: up to four text layers per figure: a dark `.bub` chip ("Research stop", "Ambient: lounge break"…), an unstyled `.tok` carry text ("Research brief"), a `.tag2` name/role/status card and the round-1 `.worker-label`. They overlapped each other and the room signs. After: a figure plus one status dot. One label (name + ≤4-word status) appears on hover, focus or selection and avoids signs, the card and other figures. Exceptions: a vermilion "!" at the island and the reconnect badge.
- Before: raw strings such as "Working: Name research for Black Box" and "Ambient: lounge break". After: `humanStatus()` gives "Name research" and "On a break". It is used on the floor label, the roster, the Team rows and figure aria-labels; the full text stays in the drawer.
- Before: robot sprites. After: six SVG characters (headset, beanie, glasses, scarf, cap, bun) on a curated non-vermilion palette, with idle, 2-frame walk and seated typing poses. Reduced motion removes the walk and typing.
- Before: rooms fixed to Research / Creative-Marketing / Outreach / Execution. After: data-driven room types (10) with icon and themed props. Existing keys map to Library / Studio / Mailroom / Workshop / Lounge, and `moveRoom` keys are unchanged.
- Floor: themed props, calm ambient life (steam, LEDs, lamp glow, planter sway; all off with reduced motion), warm light and a deeper floating shadow.
- Island: layered plinth, a tray with request papers, a lamp, and a glow that breathes only while something waits. The card header is "Needs you", and the strip reads "<name> is bringing you a request. Review".
- Signs: sentence case with an icon ("Library", "Needs you", "Arrivals").

## Round 3: calm top bar, phone sheet, fluid motion (see ROUND3.md)
- Top bar:
  - **Before:** brand · 6 nav links · status pill (working · need you · $ spent · completed) · "+ Connect AI Employee" · black-bordered emergency icon · avatar, plus a full-width pink "Needs you" strip.
  - **After:** one row: brand + nav | a "Needs you 1" chip (or "N working"), "Connect", a quiet emergency icon, the avatar. Spend moved to the account menu and the chip tooltip; the full summary stays for screen readers.
- Requests: one surface per screen. HQ uses the island card, Needs you uses its list, and other views use a compact strip. The "All clear" line is removed.
- Phones:
  - Smaller type scale.
  - One-row header.
  - Compact nav with short labels (Cards, Rules) and nothing cut off.
  - Floor first, with the request as a one-line bottom sheet that expands to Approve once / Deny.
  - Collapsible roster.
  - Slimmer queue bar; tighter views and cards.
- Motion: one easing curve for views, sheet, label, drawer and buttons; a shared 12px radius; all off under reduced motion.
- Fix: the island card no longer covers the Lounge sign at 1440.
- 3.1 follow-up: on phones the HQ floor stage fills the height between the nav and the sheet, with about 1.4× zoom centred on the island (pannable). The roster toggle sits directly above the bottom sheet, and the Needs-you chip and Connect button in the header are smaller.
- 3.2 polish:
  - Phone HQ floor anchored under the nav, zoom in the floor corner, roster open by default.
  - Natural eased walk (legs and arms alternate; one glide per trip).
  - Props depth-sorted with figures (per-prop layers in #chl).
  - Compact phone Team tiles and one-line metrics.
  - Shared type scale and radius across views; shorter copy in Work, Rules and Money (OAuth and SYNTHETIC ONLY unchanged).
- 3.3:
  - Geist sans only: no Instrument Serif, no mono or uppercase labels, kbd hint boxes hidden. `--f-code` is for real code only. Applied to app, oauth and marketing; consent copy unchanged.
  - Team: single heading, scrollable stat chips, quiet Remove, tighter cards.
  - Shorter Gateway limits help.
  - Smaller money amount and form fields on phones.
