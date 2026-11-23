# Work visibility and finished work

**Scope:** progress you can see, immediate feedback on Start, short updates over bots' heads, a Work control with active and finished views, finished work that reads as one result, and stable receipt expansion.

**Out of scope, unchanged:** routing and assignment. No new router. No email, push, SMS or browser notifications. No paid calls.

## What changed for the owner

| Where | What you see |
|---|---|
| **Start** (type box, plan review, New job) | The Work button says **Sending…** the moment you press Start, and a "Sending…" row appears. It says queued only after Alter returns the task. If the answer is lost, it says **Not confirmed** (it may or may not have been received) and offers **Try again**. Retrying reuses the same request key, so it cannot create a second job. A hard refusal says **Not sent** with the reason. |
| **Work button (top right; header on desktop, page headers on phone)** | One control. **Active** lists runs with real status, queue age and the reason it is waiting. **Finished** lists finished runs with **Show receipt**. A count marks work you haven't looked at. **Work finished** replaces the label when there is something new. |
| **Over the bots' heads (Floor)** | One short line per bot, from its real task state: "Queued: …", "Working on …", "Waiting for you", "Finished: …" (for 20 s), "Didn't finish: …" (for 10 min, and it outranks routine lines). When a running bot has reported progress, its own words appear in quotes, labelled bot-reported. Anything beyond the top line is counted ("+2 more in Work") and listed under **Recent updates** in the Work panel. |
| **Receipts** | One entry per run. A plan's parts are nested under it (their own receipts stay linked) and counted ("2 of 3 parts"). A run that is only partly finished says so. Titles wrap instead of being cut. |
| **A finished run's receipt** | Result first: each part's own saved result, labelled and in order. Sources next (only links that the results themselves contain). **How it got done** (parts, steps, costs) sits underneath, expandable. |
| **Show all / Show less** | Stays as you left it across background refreshes and repaints. It resets only when you open another receipt or leave Receipts. |

## Honest limits

- **Queued is not running.** A bot is shown as working only after it claims the job. A wake notice is never treated as pickup: it reads "Wake sent by email 20 s ago; pickup not confirmed".
- **Claimed and started aren't separate in the data.** A claimed job reads **Claimed** until the bot reports real progress; only then does it read **In progress**. If the bot has reported nothing since, it says "No update since it was claimed".
- **Check-in interval is shown only if the bot declared a valid one** (60 to 3600 s). Nothing is hard-coded, and no pickup time is promised.
- **A cause is named only when state supports it:** revoked, paused, emergency stop, never checked in, last heard from X ago, waiting for the previous part, waiting for you, or no bot picked. Otherwise: "pickup not confirmed".
- **Stale data is labelled.** If a refresh fails or is late, the panel says what you see is the last known state.
- **A plan has no combined answer.** The server saves a stitched summary on a plan; it is not shown as a conclusion. If the parts are no longer available, the receipt says so and shows the saved summary.
- **"Finished" needs every part.** A plan whose parent claims done while a part isn't is not shown as finished. Mixed outcomes read **Partly finished (1 of 2 parts)**. Parts that never ran read **Not run**.
- **The in-app completion indication fires once** per run, only for a finish this page watched happen. It never replays an old completion. "Unseen" is cleared only by opening that run's receipt or **Mark all seen**, never by fetching or re-rendering. A run that finished while the page was closed shows as unseen in the Finished list, with no pop-up.

## Server changes (small, additive)

- `POST /api/tasks` accepts an optional `clientRef` (8 to 64 letters, digits, `_` or `-`). The same ref returns the task it already made (`duplicate: true`), with no second job or wake, including under concurrent posts and for plans. Refs are workspace-scoped, and a malformed ref is ignored. Without a ref, behaviour is unchanged.
- A part that never ran (an earlier part stopped) is marked `notRun: true`. Existing records without the flag are read by their "Not run:" text.
- No change to routing, assignment, permissions, spending or any external send.

## How it was checked

- `work-model-regression.cjs`: statuses, reasons, nesting, partial/not-run, results never stitched, sources, completion transitions, acknowledgement, overhead lines, update ordering and de-duplication, staleness. Pure, fixed clock.
- `work-visibility-regression.cjs`: the real server handler for retry-safe creation (sequential and concurrent), the `notRun` marker, and the model fed by real server state. It also checks the UI wiring and that **no simulation switch exists in shipped code**.
- `scripts/work-visibility-harness.cjs` (local only; see below): a real browser run of the whole flow at desktop and phone widths.

### The local harness

```bash
node scripts/work-visibility-harness.cjs . docs/work-visibility/screens
```

- **What it runs:** the real `api/index.js` on its in-memory store with a controllable clock, serving `public/` as shipped. The "bots" are scripted callers of the real gateway routes.
- **Isolation:** every outbound request is refused (none are made), and there are no credentials. It injects a visible **SIMULATED** label into the page. The app contains no simulation switch, and nothing under `public/` or `api/` references the harness (the regression above enforces that).
- **What it proves:** the local state-and-UI path only.
- **What it does not prove:** real provider connectivity, autonomous pickup, quota, or live bot-to-bot handoff reliability.

## Screens (local fixtures, labelled SIMULATED)

`docs/work-visibility/screens/`:
- **d1 and d2:** Sending…, then Not confirmed with retry.
- **d3:** the active queue with reasons.
- **d4:** Floor notes.
- **d5:** a running job.
- **d6 and d7:** the Work finished button and dropdown.
- **d8:** the receipt collapsed.
- **d9:** expanded.
- **d10:** still expanded after a background update that repainted the page.
- **d11:** the receipts list.
- **d12:** a partial receipt.
- **d13:** a failure on the Floor.
- **d14:** stale state.
- **m1 to m4:** the same on a phone.

## Still needs an owner-approved live check

None of these ran. Each needs a real bot and your go:

1. A real bot claims a real queued job, and the panel shows it in progress, with the bot's own report quoted.
2. A real wake (the paths already built) followed by a real claim, to see what "wake sent; pickup not confirmed" turns into, and how long it really takes.
3. A real multi-part run across two bots, to the finished receipt.
4. The first-load acknowledgement baseline with a real account's history: finished work from before the first visit is not marked new, by design.
