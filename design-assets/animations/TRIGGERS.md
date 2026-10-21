# Alter floor poses: triggers

Hard rule: every animation starts from a real signal Alter observed (a call, a job or request state change, a handoff, a heartbeat). No timers, no fake heartbeats, no fake typing, no ambient loops. If the signal didn't happen, the bot holds its current still pose.

Sources below are from `foreman-core` (branch `design/alter-v3`): `public/js/core.js` (`BB.presence`, `BB.botState`, `BB.goneDark`, inbox items), `public/js/floor.js` (`render`, `handoffs`, `doneMoment`), `api/index.js` (tasks, requests, events with `kind`).
The client sees signals through the `/api/state` poll (`agents[]`, `tasks[]`, `requests[]`, `events[]`). A pose changes when a diff between two polls shows the change. **First load never replays**: on page load every bot is drawn in its current still pose, the same rule `handoffs()` already uses.

Reduced motion (`prefers-reduced-motion: reduce`, `BB.reduced()`): no walking, no bob or stretch. Bots jump to the end pose with a 120 ms crossfade, and the label or icon carries the meaning.

## The six owner poses

| Pose | Signal | Code source | Reduced motion |
|---|---|---|---|
| P1 Asleep in bed (sleep nook) | `BB.presence(a)` is `prepared`/`waiting` (never paired), `reconnect` (`connection.status = needs_reauth`: key or session expired, token reused, login missing) | core.js `BB.presence` L66 | Static bed, Zs drawn still |
| P1b Tap the bed | Owner tap (or click) on the bed | UI only; reuses v3 `BB.reconnectFlag` copy (`Copy setup message`, reason lines) | Card appears without slide |
| P2 Gets up and stretches (once) | First transition to `presence = connected` with a first `lastSeen` for an agent that had never been seen. Plays once per bot, ever | core.js presence + `agent.lastSeen` / `state.kind = HEARTBEAT` | Skip; cut to idle |
| P3 Idle (beanbag, coffee) | `presence = connected` and no task with `assignee = a.id` and `status = running` | core.js `BB.botState` | Same still pose |
| P4 Desk, typing | Task `status = running` for this assignee. Hands move only for ~2 s after each real step event (`TOOL_USED`, `step`, `progressAt` changing) | api `TASK_STARTED`, `TOOL_USED`; task `progressAt` | Still seated, glow on, no hands |
| P5 Meeting room | New task with `parentId`, `createdBy ≠ assignee`, both bots connected (`foreman_handoff` / `work.handoff`, `HANDOFF` event) | floor.js `handoffs()` L322; api L144-165 | Both appear at table, card shows |
| P6 Muse dozes in chair | `providerId = muse` and no running job. Wakes only on an owner message to Muse (`wake_sent` event) or Muse's own `INTERACTION`/job start | api `event(...,'wake_sent',{kind:'WAKE'})` L269 | Eyes open, no walk |

## The 23 actions

| # | Action | Signal | Code source | Reduced motion |
|---|---|---|---|---|
| 1 | Idle at desk, small head turn | A new event for a *different* bot appears in `events[]`; the idle bot turns its head toward that bot once (300 ms) | `events[]` diff | No turn |
| 2 | Offline: dim, asleep in bed nook | `presence` ≠ connected, or `BB.goneDark(a)` (no check-in for 2× poll interval) | core.js L195-207 | Static, dimmed 55% |
| 3 | Needs reconnect: red flag, wave | `connection.status = needs_reauth` (inbox item `type: reconnect`) | core.js L299 | Flag only, no wave |
| 4 | Working: faster typing, screen glow | `TOOL_USED` / step events while running (each one = 2 s burst) | api events `kind: TOOL_USED`, `step` | Glow only |
| 5 | Job assigned: paper drops in tray | New task appears with `assignee = a.id`, `status = queued` | api `newTask`, assign action L144-150 | Paper appears |
| 6 | Claims: stands, takes paper | Task `queued → running` (`TASK_STARTED`) | api L214, L549 | Paper moves to desk |
| 7 | Walks to tool station | `TOOL_USED` event; station chosen by action: `web.fetch`/research → shelf, mail/email → mail desk, card/spend → terminal | api action names | Icon at desk instead |
| 8 | Collecting: picks up, carries back | Same `TOOL_USED` event, after the walk (the event already holds the result) | as 7 | Skip |
| 9 | Progress ring | Running job. **Indeterminate** spinner only: no numeric progress field exists (only `progressAt`) | task `progressAt` | Static "Working" dot |
| 10 | Done: receipt prints, walked to tray, "N new" | Task `running → done` (`COMPLETED`, `finishedAt`) | floor.js `doneMoment()` L364, v3 receipts badge | Badge only |
| 11 | Failed / stopped: shrug, red mark | Task `→ failed` (`FAILED`; owner stop L407; auto-stop L399 `BLOCKED`) | api L397-410 | Red mark only |
| 12 | Handoff: walk, pass folder | `HANDOFF` event / handoff child task | floor.js `handoffs()` | Folder appears at receiver |
| 13 | Meeting: table, board shows job | Child task still `queued` after the handoff; ends on child `running`, `done` or `failed` | task `parentId` | Static card |
| 14 | Waiting on another bot: clock | `WAITING` event for this bot, or a running parent whose child task is still open | api `kind: WAITING` | Clock icon only |
| 15 | Needs approval: hand up, locked door, Inbox pulses once | `requests[]` item `status = pending` for this agent | core.js inbox items; api requests | No pulse; red dot steady |
| 16 | Approved: door unlocks, continues | Request `pending → approved/executed` | api L443 | Lock icon swaps |
| 17 | Denied: lowers paper, Blocked stamp | Request `→ denied` or `blocked` | api L444-446 | Stamp only |
| 18 | Spend: card taps terminal, bar ticks down | Card decision `ALLOW_SANDBOX` / ledger entry; `sandboxGrant.spentCents` increases | api L21-24, card ledger | Bar updates, no tap |
| 19 | Budget limit: bar red, bot stops | Decision denied with `limit_job`/`limit_daily` (`limit_blocked`) | api L22, L28 | Red bar only |
| 20 | Owner message: bots look up | Owner sends from the type box (POST), `wake_sent` events for the bots it reached. Only those bots look up | api L269 | No motion |
| 21 | Auto-routing: paper slides to bot | Task created with `routingReason` (`routing(category)`) and an assignee | api L146-147, L353 | Paper appears at desk |
| 22 | New bot joins: walks in, takes desk | New agent in `agents[]` with first `lastSeen` (first handshake). Combined with P2 (stretch), then walk from the nook | `agents[]` diff | Appears seated |
| 23 | Disconnected: packs desk, leaves | `agent.status = revoked` or `connection.status = revoked` (owner removed it) | core.js L67-70 | Fades out |

## Gaps (need code before this is real)

1. **No first-handshake field.** P2 and 22 need `agent.firstSeenAt` (server) or a per-bot "has stretched" flag. Today the client can only guess from a `lastSeen` that goes from empty to set during a visit.
2. **No numeric progress.** Action 9 must stay indeterminate until the bot API reports steps (for example `step n of m`).
3. **Tool station mapping.** Action 7 needs a stable action-to-station table (research, mail, card). The action names exist in `TOOL_USED` details but aren't grouped.
4. **Meeting end.** The v3 build ends the meeting after a 4.5 s dwell, which is a timer. Under the hard rule it should end on the child job's `queued → running` (or done or failed).
5. **Ambient loops to remove.** `.ch:not(.walk) .avs { animation: bb-breathe }` in app.css L77 is a constant breathing loop. It breaks the rule, so make it static.
6. **Revoked vs expired.** `presence = revoked` is both "owner removed it" (23, leaves) and "access revoked by the provider" (P1, sleep). The server should say who revoked it (`revokedBy: owner|provider`).
7. **Owner message targets.** Action 20 needs to know which bots a message reached. `wake_sent` events carry the agent id, so use only those.
8. **New characters.** Manus, Poke, ChatGPT and Devin need `PREF` entries in core.js L88. Devin also needs a 7th `CAST` entry (`visor`, `#7A5C46` blazer), mocked in poses.js.
