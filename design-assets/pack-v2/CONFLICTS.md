# Conflicts with the calm style, and the fix
1. **Red slab reconnect flag** (heavy, overlaps tour + crew pill) → white card, 3px red edge + red dot, sits in the dock's left column above the crew pill; several bots collapse into one stacked card ("3 bots need reconnecting").
2. **Two reds at once** (flag + Inbox + N new + tray) → all four are the same "needs you" signal; "copied/done" confirmations are ink, never red or green. Room tints exclude reds/oranges.
3. **Floor sliding under the heading/chips/type box** → stage ends above a solid dock with a 56px off-white fade; pan clamped (`AlterDock.clamp`); heading folds into the placeholder and chips hide while panning.
4. **Countdown-looking estimates** → whole minutes, "(estimate)" always, soft bar with no end tick, no seconds, refresh ≤ every 30s; "Taking longer than usual" replaces negative time.
5. **Busy floor with 6+ working bots** → working indicator is one small ink dot + slow ring per bot, labels only on hover; walk paths never cross the dock zone; reduced motion: bots stay seated, dot only.
6. **"Working" when nothing runs** → only `runningJob` shows Working; otherwise Queued + last check-in + cadence reason.
7. **Streaks/gamification** → week dots only; no numbers, flames, or scores.
8. **Mono pairing code** → the only mono on screen; it is real code.
9. **Logo detail at 16px** (L2 walls muddy) → favicon uses L1 slab + dot; L2 everywhere ≥ 24px.
10. **Phone nav hides Receipts** → a receipt icon button in the top bar carries the "N" badge and is the flight target.
