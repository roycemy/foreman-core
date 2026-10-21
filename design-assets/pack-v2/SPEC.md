# Alter design pack v2 · spec
Tokens: `tokens.css` (color, room tints, radius, shadow, type scale, spacing, layout, motion; reduced-motion zeroes durations).
Breakpoints: phone ≤ 700px (390 reference), iPad 1024×715, desktop 1440×900.

## Logo (chosen: L2 Floor plan)
Isometric island: porcelain top `#F7F6F2`, ink band `#111/#2A2A2A`, two low cross walls = four rooms. Red dot `--v` sits in the front room **only** when Inbox > 0 (same rule as the tray dot). Idle = no dot. App icon: mark on paper (light) / ink (dark) at 512, 180. Favicon: L1 slab + dot at 16/32. Files in `brand/`.

## A · Floor stage + dock (components/dock.*)
- `.stage` top `--topbar` (64), bottom `--dock` (132 desktop/iPad; phone 150 + 56 for crew row). overflow hidden; 56px bottom fade, 20px top fade.
- Dock: 3 columns (left: flags + crew pill, mid ≤ 560: heading, chips, type box 52h r16, right: zoom).
- Panning: `.dock.panning` → heading fades/shrinks (180ms), chips hide, placeholder becomes "Tell your team what to do"; restores 1.2s after last move. No layout jump: stage size never changes.
- Clamp: island fully inside stage with 24px margin when it fits; when zoomed, edges travel at most 24px past.
- Shots 01 (before) / 02 (rest) / 03 (panning) at iPad, 1440, 390.

## 1 · Reconnect flag (components/reconnect-flag.*)
Card 340w, r16, `--sh-float`, 3px red left edge, 8px red dot w/ 4px wash. Title 13/600 "Reconnect {bot}", reason 12/400 stone, one ink button "Copy fix" (console bots: "Pair"). Reasons: session expired · renewal token reused (`refresh_replay`) · saved login missing (`persistent_grant_missing`) · access revoked · quiet 30+ min. Copy → edge/dot/button turn ink, text "Now paste it in Grok's chat", after 450ms the paste card replaces it: check + "Copied. Just paste it." + one line + primary "Open Grok's chat". Console: one-time code (mono 22, tracking .12em) + "Copy code". Stacked (≥2): one card "N bots need reconnecting" + names + "Review", two 6px peeks; tap expands to a list. Enter 320ms ease-out rise 6px.

## 2 · Receipts that ship (components/receipt-ship.*)
Card 240w r14: avatar + "{bot} · done", title 13/600, result 12, dashed rule, "Model costs  $0.04". Flight 800ms `--ease-out`, quadratic arc from bot head to tab (phone: receipt icon), scale 1→.18, fade last 20%. On land the "N new" badge (11/600 white on `--v`, r full) bumps 1.18×. Opening Receipts: rows newer than `seenAt` get warm wash + 2px ink edge + "New", for this visit only; badge clears. Reduced motion: card appears under tab, fades 200ms.

## 3 · Bots working
Only when `runningJob`: walk to room prop (shelf/crate/printer) at `--walk-speed` 22 wu/s, step bob 420ms; gather: 3 bobs (600ms each); carry crate (3.2×2.4 wu kraft box at chest); return and sit. Indicator: 0.75wu ink dot + ring pulsing 2.4s over head. Idle/queued: seated, no dot. 6+ bots: no labels by default, dots only, labels on hover; max one walk start per 300ms (stagger). Reduced motion: no walking, bot seated at its room seat, static dot. Shots 30–34.

## 4 · Meeting room
Room tint `--room-meeting`, map table (sage map, route line), board on back wall, two mugs. On real handoff: both bots walk to table seats (`MeetingRoom.SEATS`), total ≈ 4.5s; bubble (white, r14, file glyph + "Handing you the {thing}") above the sender for 2.2s; table glow (warm, blurred) once 900ms; then walk home. Reduced motion: bubble only over the receiver. Shots 40–41, 06 hover.

## 5 · Honest status (components/bot-status.*)
Card r16, avatar 36 with 11px state dot: Working ink, Queued faint, Needs reconnect red, Paused hollow. Line 13: "Working · {job}" (with 14px moving ink line) / "Queued · last check-in 4 min ago" / "Needs reconnect" (red ink) / "Paused". Reason 12 mute: "Grok checks in about every 5 min" / reason text / "Paused by you · jobs wait". Action only when useful: Fix, Resume.

## 6 · Estimates (components/estimate.*)
Median of last 10 finished (≥3). Running: "~4 min left (estimate)" + 56×4 soft bar (fades at the end, max 90%). Over 1.5× median: "Taking longer than usual (usually about 6 min)", dotted bar. Queued: "Usually about 6 min once started (estimate)". <3 jobs: "No estimate yet". Whole minutes only.

## Engagement
Room tints, daily recap card (top center, once per morning, ✕), week dots, day/night floor light (`--light-*`), meeting moments. See IDEAS.md.
