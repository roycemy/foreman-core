# Re-recording from the live app (alterhq.app)

The current cut was recorded locally from branch `design/mobile-landing` with mocked `/api/*` (see `rec.cjs`). This plan re-shoots the same beats on the live product, so every frame is a real account.

## Setup
1. Use a fresh demo workspace (account menu → Fresh workspace), not Royce's real one.
2. Connect 3–4 real bots: Grok Bot, Instinct and Muse, plus one more. Give each bot a per-bot daily limit in Card → Daily limit (for example $50, $200, $30 and $25).
3. Set the browser to 1440×810 with the page at 133% zoom (a 1920×1080 capture), plus a phone at 390–430pt, or Chrome device mode at 432×768 with DPR 2.5.
4. Capture with OBS at 60fps, or Playwright using the `rec.cjs` approach pointed at the live URL with no API mocking. Hide the cursor except for taps.
5. Close or skip the tour first (`localStorage alter.tour=1`).

## Beat by beat

| Beat | Do this live | Needs to be true on the server |
|---|---|---|
| 1 Hook | Have a bot request a card charge (sandbox) so it walks to the tray and the dot lights. Record a wide floor shot. | A pending card proposal. |
| 2 Connect | Add a new bot (account → Connect a bot → pick it). In the wizard, tap Copy setup message, paste it into the bot's own chat (record that tab too as an optional insert), and wait for the accepted call. Record the bot walking from arrivals to its desk. | Real pairing. The wizard only says connected after an accepted call. |
| 3 Team | Have bot A finish a job and call `foreman_handoff` / `work.handoff` to bot B. Both walk to the meeting room and return when B starts. | A real handoff event. The meeting ends on B's state change, not a timer. |
| 4 Ask | Type a multi-category ask in the team box ("Research rivals, write the launch post, set an ad budget"). The toast shows the planned chain. Each hop shows only when the bots really hand off. | Routing with categorizeAll and handoffPlan. Bots must actually run and hand off, so allow minutes and speed-ramp in the edit. |
| 5 Approve/Deny | On the phone, open Inbox with two pending card asks. Approve the small one and deny the large one. Then open Card → Daily limit. | Card proposals. Note: it's a sandbox card ("No real money moved"). |
| 6 End | Reuse `build/cap/close-*.png`. | — |

## Assembly
Put the new clips into `clips/<scene>-d.mp4` / `-m.mp4` and adjust the `ss`, `pss` and zoom values in `build.py`. Then run:

```
node caps.cjs && python3 build.py
```

and re-run the encode block in the README.

## Before publishing, change these
- The connector in the setup message is still `foreman-core.vercel.app/api/mcp`. That's correct today, but it will show in any close-up of the copied text. Avoid close-ups of the message body until the server moves to alterhq.app.
- If real push notifications ship later, replace the phone Inbox shot with the actual notification, then the Inbox.
