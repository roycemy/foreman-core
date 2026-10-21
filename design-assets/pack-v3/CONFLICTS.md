# Conflicts with the calm style, and the fix

1. **Red slab reconnect flag:** today it's heavy and overlaps the tour card and the crew pill. Fix: a white card with a 1px red-tint edge and one red dot, inside a single flex column with the crew pill, so it can't overlap. The flag waits while the tour runs.
2. **Several bots means several red cards:** fix: one card, "N bots need reconnecting", with one row per bot.
3. **"Copied" in green or red:** fix: a black tick and "Copied". After copying, the paste card drops the red (ink dot, neutral edge), because nothing is wrong any more.
4. **A flying receipt is motion on a calm floor:** fix: once per finished job, 800ms, small, and it shrinks into the tab. It's skipped with reduced motion or when the tab is hidden.
5. **Red highlight on new receipt rows would add a second red meaning:** fix: an ink dot and a 3.5% ink wash that settles after 2.4s. Only the badge is red.
6. **Seven walking, bobbing bots with glyphs is busy:** fix: the walk happens once per job start, and with 6+ working bots the indicators collapse to 5px ink dots. No labels on the floor.
7. **Idle bots sitting with the typing animation would fake work:** fix: typing is off unless the job is truly running (`data-idle`).
8. **An estimate can look like a countdown:** fix: whole minutes, "~" or "about", the word "estimate", refreshed once a minute. No progress bar. "Taking longer" is grey, not red.
9. **Meeting glow and bubble:** fix: a white glow once (600ms), never red. One bubble, short copy, 4.5s.
10. **Floor sliding under the heading, chips and type box on pan:** fix: a solid dock with a 56px fade, plus the pan clamp.
11. **The inspector header squeezes the status on phone:** fix: "Edit permissions" wraps below the status at ≤760px.
