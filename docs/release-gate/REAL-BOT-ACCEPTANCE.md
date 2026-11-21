# Real-bot acceptance test: hosted, isolated Preview

**STATUS: NOT RUN.** Nothing in this plan has been executed, simulated or faked. The only proof so far is local: the offline suite and a scripted job against a local redis-server through a local REST shim (`scripts/real-redis-proof.cjs`). That is not a hosted proof and not a real bot.

## Preconditions (all required, else stop)

- **Approvals:** every item on the approval packet's critical path is approved, including Q10 and Q11 and the deployment-protection approach.
- **Preflight:** `scripts/preview-isolation-preflight.cjs` printed `RESULT: PASS` for this branch's Preview against Production. Keep the printed output, which contains hosts only.
- **Deployed commit:** the Preview deployment's commit SHA equals the approved manifest HEAD.
- **Bot path:** a real bot is chosen that can reach the Preview through a path that exists there, either the HTTP gateway with a gateway key or bot-link pairing. Remote MCP is production-only and can't be used.
- **Phone:** your phone is signed in to the **Preview**, under a Preview-only test owner account. No push or SMS channel exists, so approvals are seen only while Alter is open on the phone.

## Steps and the evidence to capture

| # | Step | Pass condition | Evidence to capture |
|---|---|---|---|
| 1 | Open `https://<preview>/api/health`. | `ok: true`, `store: "upstash"` | Response JSON, time, Preview URL |
| 2 | Sign up a fresh test owner on the Preview. | Account created; HQ loads empty | Screenshot. Upstash console: the new `gl:user:*` key is in the **Preview** database, and the **production** key count is unchanged (before and after numbers) |
| 3 | Pair the real bot (Connect → gateway or bot-link). | The bot shows as connected on its first real call | HQ screenshot of the bot and its connection state; the bot's own log of its first call (status code) |
| 4 | Submit one job to that bot. | Job is assigned, then claimed | Job id; HQ screenshot; job detail timeline showing "took the job" |
| 5 | The bot proposes `notes.write` for the job. | An ASK request appears with the exact note title and text, plus cost | Request id; the bot's response (`202`, `request_id`) |
| 6 | You open the request **on your phone** and approve it. | Request becomes `executed` | Phone screenshot before and after; request id; decision time |
| 7 | The result is saved. | A note exists with the approved text, and a completed receipt exists | Note id; receipt id; job detail showing "Saved notes" |
| 8 | The bot completes the job. | Job is `done` | Job detail screenshot showing status and timeline |
| 9 | Fresh readback after reload, ideally on a second device or after closing the app. | The note opens with exactly the approved text, linked to its job and request | Screenshot of the note view; `GET /api/notes/<id>` result as seen in the app |
| 10 | Retry: the bot re-sends the same proposal for the same job, using the same `source_id` if it supports one. | No second request, note, receipt or charge | Request id returned (equal to step 5's); receipt count for the job; spend unchanged |
| 11 | Revoke the bot from HQ. | The bot's next call is refused with a 403 "revoked" answer; pending requests become blocked | Bot log showing the status code; HQ screenshot; blocked receipt id |
| 12 | Restore the bot, per your **Q11 decision**. | **If restore requires a new key:** the old key gets 401, and a newly issued key works. **If restore re-enables the old key:** the old key works again. | Bot log status codes before and after; which key was used (label only, never the value) |
| 13 | *(Optional, per your Q10 decision.)* Turn the kill switch on while a job is running. | Matches your Q10 decision | Bot log; job status; event list |
| 14 | Isolation check after the run. | The production database shows no keys from this run | Upstash console: production key count compared with step 2 |

**Not covered by this plan:**
- Real email, wake pings, model calls or money: those variables stay unset on the Preview.
- Remote MCP and OAuth: production-only.
- Load and concurrency on Upstash.

Each failed step stops the run; record it, then report.
