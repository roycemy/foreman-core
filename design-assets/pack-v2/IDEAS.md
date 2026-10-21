# Alter v2 · rooms and engagement

## Rooms (each tied to real backend behavior in foreman-core)
| Room | What happens there | Trigger (real signal) |
|---|---|---|
| Research library | Web research, reading sources | running job whose actions include `web.fetch`, or category research |
| Drafting studio | Notes, memos, creative drafts | running job using `notes.write` / draft category (Muse's home) |
| Review desk | Checking work before it ships | review step in a task `handoffPlan` ("…then Grok Bot reviews it"), approval re-checks |
| Meeting room (was mailroom) | Handoffs and shared files | event `handoff` with `toAgentId` (`work.handoff`, owner move in api/index.js) |
| Outbox | Messages and connector writes waiting to go out | job finished with an outbound result; receipt card ships from here |
| Spend counter | Card purchases, spend rules, Ask decisions | `spend` / authorization decision (allow/deny/ask) on the card adapter |
| Lounge | Queued, idle, paused bots, between check-ins | no running job (`BB.status` not run), paused, or quiet |
| Tray (plaza) | Things waiting on you | approvals pending → the one red dot |

Home seat = the room of the bot's last job type; bots walk only on a real running job. Hover/focus a room shows name + one line + who is there (replaces `ROOM_TYPES` in public/js/floor.js; backend keys unchanged via `ROOM_MAP`).

## Engagement (calm, premium)
Picked and mocked:
1. **Room accent tints**: low-chroma floor colors per room, never red (shot 05, compare 52 without).
2. **Daily recap card**: once per morning, "4 jobs done overnight · $0.31 in model costs", dismiss once (shot 50).
3. **Week dots (tasteful streak)**: 7 tiny bars for days you checked in. No counters, no flames, no scores.
4. **Day/night light**: floor warms at dusk, cools at night; crew pill says "Quiet night. Your team is off until 7 am" (shot 51).
5. **Meeting moments**: two bots meet at the map table with a file bubble; the table glows once (shots 40–41).
6. **Receipts that ship**: the finished receipt flies to the tab (shot 20).

Backlog (not mocked): bot personalities via tiny idle props (Muse's sketchbook, Grok Bot's mug); sounds off by default with one soft "done" chime when enabled; first-job celebration once per bot; weekly "your team saved you N hours" (only if computed honestly, otherwise skip).
