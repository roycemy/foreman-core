# Alter design pack v3: spec

Scope is the brief and nothing else. The behavior stays the same; this pack only changes how things look and move. Every shot is the real app (`foreman-core`, branch `design/alter-pack`), served locally with fake data. The floor art is the real `public/hq/floor.svg` plus the real prop kit in `floor.js`. The H1 logo is unchanged.

Tokens are in `tokens.css` (all named `--a-*`, additive to `public/styles/tokens.css`). Values below are exact. Type is Geist only, with Geist Mono only for the pairing code. Sentence case, no uppercase labels. Red (`--a-red` #E2452B) is used only for needs-you: the reconnect flag, the Inbox count, the "N new" badge and the tray dot. Confirmations are black.

## 0. Bottom dock (the earlier fix)
- The floor can't slide under the "Tell your team what to do" heading, the chips or the type box.
- `.stage::after` paints a solid dock of `--a-floor`, `--dock` tall (desktop 188px, ≤940px 96px, phone 84px), with a 56px fade above it (`--a-dock-fade`, transparent to `--a-floor`). It uses z-index 15, so it sits above the floor and props and below the controls (z 20). There's a 20px top fade under the top bar.
- Pan clamp: `BB.clampPan(pan, fw, W, H)` (`components/dock.js`) runs in `fit()` before `--px/--py` are written. The floor centre stays inside the free band between the top bar and the dock, with ±25% of the stage width sideways. Anything beyond that is cut by the dock fade.
- Shots: `01-dock-before` (today, dragged 420px down: the floor runs under the heading) and `02-dock-after` (same drag: the floor stops above the dock).

## 1. Reconnect flag
**Placement and stacking rule (no overlaps, ever)**
- The flag, the crew roster and the crew pill sit in ONE flex column, `.a-corner`: `left 24, bottom 24, width 340, gap 8, column`. The order is flag, roster (when open), crew pill. Nothing in that column is absolutely positioned, so the pieces can't overlap.
- Phone: `left 16, right 16, bottom 84 + safe-area`, full width above the tab bar.
- While the roster is open, the flag steps aside, because the roster row already says "Needs reconnect".
- While the welcome tour is on screen, the flag waits (`body:has(.tour)`) and returns when the tour ends. The Inbox still shows "1 need you", so nothing is lost and the user has no extra step.

**Card** `.rcf`
- `bg #fff`, `border 1px --a-red-edge (rgba(226,69,43,.28))`, `radius 14`, `shadow --a-sh-2`, `padding 12 14` (phone 14 16).
- Title: 14/20 semibold, `-.01em`, with an 8px red dot and an 8px gap. "Grok Bot needs reconnecting".
- Reason: 13/18 `--a-ink-2`, indented 16, `margin 2 0 10`. One line, plain words:

| reason | copy |
|---|---|
| session expired | Its session expired. |
| renewal token reused | Its renewal token was used twice. |
| saved login missing | Its saved login is missing. |
| access revoked | Its access was revoked. |
| quiet 30+ min | No check-in for over 30 min. |

- One action: an ink button 32px tall (phone 36), `radius 10`, `padding 0 12`, 13px medium white: "Copy setup message". Console bots say "Get pairing code".

**States**
1. Default: the card above.
2. Copied: the button turns into a black tick and "Copied" (13px medium ink) for 1.6s (`--a-d-copied`; 600ms with reduced motion).
3. Just paste, chat bot: the border goes to `--a-line-2` and the dot goes ink, because the red is done. Title: "Paste it in Grok's chat". Line: "The setup message is copied. Grok does the rest." Button: "Open Grok's chat" (ink).
4. Just paste, console bot: title "Enter this code in the console", line "It works once, for the next 10 min.", then the code in Geist Mono 20px, `letter-spacing .12em`, `padding 8 12`, `radius 10`, `bg --a-surface-2`.
5. Several bots: one card. Title "2 bots need reconnecting", then one row per bot (name 13 medium, reason 12 `--a-ink-3`, with a 28px "Copy setup" button that turns into "Copied" on its row). Rows are split by 1px `--a-line`.
- Enter: 180ms fade and 4px rise. The card is re-rendered only when its HTML changes.

## 2. Receipts that ship
**Card** `.rship`: 232 wide, `bg #fff`, `border --a-line`, `radius 14`, `shadow --a-sh-3`, `padding 12 14`.
- Top row: 20px avatar (bot colour) and the bot name, 12 `--a-ink-3`.
- Job title: 14/20 semibold.
- Result: first line of the result, 13/18 `--a-ink-2`, ellipsis. A failed job says "Didn't finish".
- Footer: a 1px dashed `--a-line-2` rule, then "Receipt" on the left and the cost on the right (12, ink, tabular). A cost that isn't reported shows "–".

**Flight** (800ms, `cubic-bezier(.22,.9,.32,1)`, Web Animations)
- 0%: 50px above the bot's head, scale .96, opacity 0.
- 18%: same spot, scale 1, opacity 1 (a short beat so the owner can read it).
- 60%: arc midpoint, scale .62. Desktop: level with the start, halfway to the tab. Phone: halfway down.
- 100%: the centre of the Receipts link, scale .12, opacity .2. Then the link does a 240ms 1.06 "catch" and the badge appears.
- **Landing target:** desktop is `#nav a[data-v=receipts]` in the top bar. At 390px the top nav is hidden, so the target is the **Receipts tab in the bottom tab bar** (`#tabs a[data-v=receipts]`).
- Reduced motion or a hidden tab: no flight, and the badge updates in place.

**Badge** `.nnew`: red pill with white text, "2 new".
- Desktop: 18px tall, `padding 0 6`, 11px semibold, 6px after the "Receipts" label.
- Phone: 16px tall, 10px semibold, at `top 4, left 50%+6` of the tab, so it sits on the icon's top-right and clears the label.

**Opening Receipts** (`BB.markNewRows`): clears the badge and gives this visit's new rows `.is-new`.
- `.is-new` adds a `--a-new-wash` (ink at 3.5%) background and a 6px ink dot at the row's left edge.
- The wash settles to transparent after 2.4s (600ms fade). The dot stays for the visit. No red in the list.

## 3. Bots working
- **Only** while `BB.runningTask(a)` exists. Idle and queued bots sit at their desks with the typing animation off (`data-idle=true`).
- **Cycle, once per job start:**
  - stand (200ms)
  - walk to the room's prop: workshop toolbox, library bookcase, studio canvases, meeting map table, lounge records. It uses floor.js `walkTo` at the same pace, 42ms per unit, with legs clamped to 320–1900ms.
  - gather: 3 bobs of 400ms each, a 6% figure-height dip
  - the crate appears in the arms
  - walk back
  - sit (200ms)
  - the crate is set on the desk beside the monitor and stays while the job runs
- If the job ends mid-walk, the bot walks home without a crate.
- **Carry prop:** an isometric kraft crate (`BB.CRATE`, faces #E2C9A0 / #C9A673 / #B38F5E, with an ochre tape strip) at 0.46 of the figure width, held at 62% of figure height. The desk crate is 0.42.
- **Working indicator:** one 5px ink dot above the head, with a 2.4s opacity pulse (1 to .35), offset per bot so the dots don't pulse together. No text on the floor; the hover tip already has the live line.
- **6+ working:** the activity glyphs collapse to the dot, so seven bots read as seven dots (shot 35).
- **Reduced motion:** no walk and no bob. The crate appears on the desk and the dot is static (shot 36).

## 4. Meeting room
- In floor.js the `sales`/`support` room type changes from `mailroom` to a new `meeting` type: `{ name: 'Meeting room', props: ['maptable','board','mugs'], verb: 'meeting' }`. It's the same room position and the same SLOTS. The map table, board and mugs are existing props in the real art kit, so the room is drawn exactly like the rest of the floor. The room's desks in floor.svg stay; they are the home desks for bots placed there.
- **Handoff** (real HANDOFF only):
  - both bots walk to the two table seats `[27,93]` and `[32.5,88]` (world units)
  - the table glows once: a white radial ellipse 9×4.5 units, opacity 0 → .85 → 0 over 600ms. Never red.
  - a bubble shows over the sender for 4.5s: "Handing you the research". The bubble is `bg #fff`, `border --a-line`, `radius 10`, `shadow --a-sh-2`, `padding 7 11`, 13/18 medium, with an 8px tail.
  - both walk home
- Reduced motion: no walk and no glow. The bubble shows 4.5s over the sender where it stands.

## 5. Honest status (crew roster rows, inspector header, hover tip)

| state | dot | line | quiet reason (12/16 `--a-ink-3`) |
|---|---|---|---|
| Working | ink, pulse | Working · Draft launch note | none |
| Queued | hollow 1.5px `--a-ink-3` ring | Queued · last check-in 4 min ago | Grok checks in about every 5 min |
| Needs reconnect | red | Needs reconnect | Its session expired |
| Paused | 8px `--a-ink-3` rounded square | Paused | You paused this bot |

- "Working" requires a running job AND `BB.signal(a)==='working'`. Anything else is Queued, with the real `lastSeen`.
- Line is 13/18 `--a-ink-2`; the name is 14/20 medium.
- Phone: 15 / 14 / 13 and the line wraps. Desktop: one line with an ellipsis.
- In the inspector header on phone, "Edit permissions" moves below so the status keeps its width.

## 6. Job time estimate (inspector rows)
- Its own line under the job title, 12/16 `--a-ink-3`, indented 20 to line up with the title.
- The rule is the median of the bot's last 10 finished jobs, minimum 3. Whole minutes only, always "~" or "about" and "(estimate)". It refreshes once a minute. No bars, no seconds, no ticking.
  - fewer than 3 finished jobs: "No estimate yet"
  - running, more than a minute left: "~4 min left (estimate)"
  - running, past the median but within 125%: "~1 min left (estimate)"
  - running, past 125% of the median: "Taking longer than usual (usually about 6 min)", in `--a-ink-2`, not red
  - queued: "Usually about 6 min once started (estimate)"

## Motion tokens

| token | value |
|---|---|
| `--a-d-tap` | 120ms |
| `--a-d-pop` | 180ms |
| `--a-d-swap` | 240ms |
| `--a-d-panel` | 280ms |
| `--a-d-fly` | 800ms |
| `--a-d-bob` | 400ms ×3 |
| `--a-d-sit` | 200ms |
| `--a-d-meet` | 4500ms |
| `--a-d-glow` | 600ms |
| `--a-d-copied` | 1600ms |
| `--a-d-newrow` | 2400ms |

Easing: out `.2,.8,.2,1`, in-out `.45,.05,.3,1` (the floor.js walk), fly `.22,.9,.32,1`. `prefers-reduced-motion` zeroes the fly, bob, sit, glow and pop.

## Shots
- `shots/00-overview.png`
- `shots/sheets/<component>-{1440,390}.png`: isolated, all states
- `shots/context/<nn-name>-{1440,390}.png`: on the real floor
