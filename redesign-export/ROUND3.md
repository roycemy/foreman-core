# ROUND 3: Calm top bar, phone sheet, fluid motion (patch note)

Applies on top of rounds 1 and 2, across all app views. These stay unchanged: hooks, routes, API calls, presence states, consent copy, `BRAND`, both connect actions, approve/deny, the SYNTHETIC ONLY notice, keyboard access and reduced motion.

## Desktop top bar: one calm row
- Left: brand and nav. Right: one status chip, **Connect**, the emergency icon and the avatar.
- `#sum` (still `role=status`, `aria-live`) now renders a single chip:
  - "Needs you **N**" when something waits,
  - otherwise "N working" / "N blocked" / "All clear".
- The full old summary (working · need you · spend · completed · idle) is still there as `.sr-only` text and the `title` tooltip.
- Today's spend also moves into the account menu (`#acct-today`). The Money view is unchanged.
- The Needs-you chip on HQ opens the island card and focuses **Approve once**. On other views it goes to `#approvals`.
- Connect button: the visible label is "Connect"; `aria-label` stays "Connect AI Employee".
- Emergency (`#emer`): a quiet round outline icon that turns vermilion on hover/focus. The label, tooltip and confirm dialog are unchanged.

## One request surface per screen
| Screen | Request surface |
|---|---|
| HQ, once the employee reaches the island | the island card (or the phone sheet); the strip is hidden |
| HQ, while the employee is still walking to the island | the slim strip: "<name> is bringing you a request. Review" |
| Needs you (`#approvals`) | its own list; the strip is hidden |
| Every other view | a compact strip with Approve/Deny |

- The "✓ All clear" strip line is gone everywhere.
- Done with CSS `:has()`. `#strip` and its `[data-r][data-d]` buttons are unchanged.

## Phones (≤759px; 390 and 320 checked, 768 checked)
- **Smaller scale:** font tokens drop one step. Tap targets stay at least 40–44px.
- **Header:** brand mark, the Needs-you chip, Connect, emergency icon and avatar fit in one row. At ≤480 the wordmark hides; at ≤360 the chip shows only its count and Connect becomes "+" (labels kept for screen readers).
- **Nav:** a compact scrollable row with short labels, so "Cards" and "Rules" are no longer cut off. Hrefs and `data-v` are unchanged, and `aria-label` keeps the full name.
- **HQ layout:** the floor comes first.
- **Request as a bottom sheet:** the island card becomes a fixed bottom sheet above the queue bar. Collapsed, it is one line: "Grok Bot wants to Save a note · **Review**". Tapping it expands to Approve once / Deny, focus moves to Approve, and Escape collapses it.
- **Roster:** collapsed behind "On the floor 5 ⌄", which is a keyboard toggle. This applies to the whole compact layout (≤1099px).
- **Other views:** tighter view padding and cards. The status text line in the queue bar is hidden; the bar is slimmer and stays sticky.

## Fluidity
- One easing curve (`--r3-ease`, 180ms) for:
  - view switches,
  - the floor label,
  - the island card / sheet (slides up),
  - the drawer,
  - buttons and nav.
- Shared 12px radius on cards, requests, the island card and the label.
- All of this is off under reduced motion.

## Also fixed
- The island card no longer covers the Lounge sign at 1440: `placeCard()` moves it below (or above) the sign.

## Files
- `tools/pv-r3.js` (new, appended by `build_index.py` step 10): status chip, account-menu spend, sheet (`.fa-peek`, `window.HQ_SHEET`), roster toggle, short nav labels, `--goal-h`.
- `public/styles/app.css`: two "Round 3" blocks at the end.
- `tools/apply_r2.py`:
  - the strip's walking state uses `className='walking'` instead of `'clear'`,
  - the Lounge-sign rule is added to `placeCard()`.
- Regenerated: `tools/pv-diorama.js`, `public/index.html`.
- `tools/verify.js`: the strip Deny test now runs on `#work` (the strip is hidden on HQ by design). 11 new R3 checks.
- `tools/r3shots.js`: round-3 screenshots.

## 3.1 follow-up: phone HQ fills the screen
- **Floor stage grows:** on phones the stage (`.floorwrap`) is now `flex:1` with `min-height:58vh`. It measures 68% of the screen at 390 and 59% at 320. The floor is centred inside it and can be panned in both directions.
- **Default zoom:** `fit()` applies an adaptive zoom, about 1.4–1.5× at 390 and 1.3× at 320, never below 1.3 or above 1.5. Override with `window.HQ_PHONE_ZOOM`.
  - The view is centred on the island, and re-centres when the size or zoom changes until the user pans.
  - The +/− zoom buttons still work on top of it.
- **Signs stay in view:** on phones the Mailroom and Studio signs move inward (`PHONE_SIGNS` in `pv-r3.js`), so no room sign is cut off at the default view. Desktop positions are unchanged.
- **No dead space:** the roster toggle sits right above the bottom sheet, 8px apart. The bottom padding follows the measured sheet height (`--sheet-h`).
- **Lighter header:** the "Needs you" chip is 28px with 11.5px text. Connect is 36px tall, with a 44px tap area kept invisibly.
- **New check:** the stage fills at least 55% of the screen, the floor is zoomed and pannable, the island and every agent are in view, and the roster toggle sits 0–24px above the sheet.

## Unresolved / notes
- The floor art is wide (16:9), so the tall phone stage still has a calm band above and below the floating floor. Filling it fully would need about 2.5× zoom and would crop the rooms.
- On phones the Team view's stat tiles are still roomy. They're tighter than before but not redesigned.
- `:has()` needs a current Chromium, Safari or Firefox (121+). Older browsers just show the strip as in round 2.

## Round 3.2: polish

- **Phone HQ:** the floor now starts right under the nav, with no empty band. Zoom (− +) sits in the floor's empty top-left corner. The roster starts open and fills the space below the floor; tapping its header still collapses it.
- **Walk:** the legs alternate and each arm swings opposite, with eased keyframes instead of 2-frame steps. A trip is one glide: it eases in on the first leg, moves at constant speed through corners and eases out on the last. Reduced motion still stops all of it.
- **Depth:** every prop is its own layer in `#chl`, next to the figures, with z-index = its footprint centre's depth (same scale as `.ch`). A figure behind a bookcase is now hidden by it. The island stays on the base layer. Desks are baked into `floor.svg`, so they cannot occlude.
- **Team (phone):** compact 3-column stat tiles. Per-worker metrics now read in one line, e.g. "$0.64 today · limit $3.00 · 1 done", with the full text in a tooltip.
- **Consistency:** view titles are 24/20, body text 14/13 and card radius 12. Copy is trimmed in Work, Rules and Money (pv-r3.js `TRIM`, presentation only, same facts). Cards (SYNTHETIC ONLY) and OAuth copy are untouched.
- Shots: `shots/r32-390-hq.png`, `r32-320-hq.png`, `r32-390-team.png`, `r32-1440-hq-closeup-bookcase.png`, `r32-390-rules.png`, `r32-1440-rules.png`.

## Round 3.3: one sans family, calmer views

- **Type (owner: "no cursive, more premium and simple"):**
  - Instrument Serif is gone everywhere: app, oauth.html and marketing. Hierarchy now comes from Geist weight (500/600) and size, with tight tracking (-.02 to -.03em) and tabular figures on large numbers.
  - No monospace in UI labels or copy, no uppercase eyebrows ("On the floor", "Needs you", and stat labels are sentence-case sans), and the A/D `kbd` boxes are hidden. The shortcuts still work.
  - Mono stays only for real code, through the new `--f-code` token: the read-only connector address, `code`/`pre`, and `[data-code]`.
  - tokens.css: `--f-display` and `--f-mono` both resolve to Geist; the legacy names are kept so nothing breaks. `--tr-caps` is 0.
  - Consent copy is unchanged word for word; only its font changed. SYNTHETIC ONLY is unchanged.
- **Team (phone):** removed the duplicate "Your team" eyebrow. Stat tiles, and any `.cards` row on phones, are one even, horizontally scrollable row of compact chips, so there are no empty cells. Worker cards are tighter, with 36px Details and a quiet text-style Remove.
- **Rules:** the Gateway limits help now reads "Cents per action and per day. Blank means no limit. Provider billing is not capped."
- **Money/Cards (phone):** the request amount is 24px, form fields are 44px, and the top gap above view titles is gone.
- Shots:
  - Before: `r32-390-hq.png`, `r3-after-1440-hq.png`.
  - After: `r33-390-hq.png`, `r33-1440-hq.png`, `r33-390-team.png`, `r33-390-work.png`, `r33-390-money.png`, `r33-390-cards.png`, `r33-390-rules.png`, `r33-1440-money.png`.
