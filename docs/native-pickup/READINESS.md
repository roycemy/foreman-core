# Native bot pickup: readiness report

- **Branch:** `feat/native-bot-pickup`, from `main` at `e0b7534`.
- **State:** nothing here is deployed. Deploying needs the owner's go and a designated executor.
- **Measured:** no live latency has been measured on a real bot yet.

## The reported facts, rechecked against the code

| # | Reported | Recheck | Change on this branch |
|---|---|---|---|
| 1 | Queueing unassigned work sends no wake | **Confirmed.** No assignee means no one to wake. | Unchanged. Assigning it later wakes the assignee. |
| 2 | A second wake within 30 s is silently dropped | **Confirmed.** `SET NX PX 30000`, then a bare return. | Deferred and coalesced instead (below). |
| 3 | Runner validation order; a 401 has no reason | **Confirmed.** Order: cookie, record, agent id, expiry, agent active, epoch, key hash. | Every 401 now carries a reason code (below). |
| 4 | The cookie path may not cover the request | **Ruled out for a standard browser.** In real Chromium, Set-Cookie `Path=/api/runner/<id>` covers `/api/runner/<id>/gateway/...`. The cookie was sent and the claim returned 200. Muse's own browser is **unverified**. | None needed. |
| 5 | Wake precedence; env email only for grok and instinct | **Confirmed.** | `WAKE_<PROVIDER>_EMAIL` for any provider, Muse included. |
| 6 | Signing secrets are plaintext; runner keys are protected | **Confirmed.** **Also found:** the pairing replay record held the new gateway key in plain text for 5 minutes. | New secrets are encrypted, with an owner migration for old ones. The replay key is encrypted too. |
| 7 | Stale after 2 × pollSec (150 s if undeclared) | **Confirmed.** | The reassign sweep never uses less than 10 minutes. |
| 8 | Redeem rotates the key and creates the session together | **Confirmed.** **Also:** any later rotation (a second redeem, or the owner's "issue key") ends the earlier runner session. Reproduced in Chromium as `keyhash-mismatch`. | Visible through reason codes. |

## Muse's 401

The leading candidate is reproduced, but not asserted.

In real Chromium, the owner issuing a new gateway key after pairing reproduces the exact pattern: pairing works, then the next call returns 401 with `reason: keyhash-mismatch`, `cookiePresented: true`, `recordFound: true`. A second pairing redeem would do the same.

The other hypotheses (cookie not presented; lookup failed) now produce different reason codes (`no-cookie`, `no-record`), so one instrumented pairing separates them.

## Built (each has a regression)

| Task | What changed | Test |
|---|---|---|
| 3 Reason codes | Every runner 401 returns and logs `runner_401` with reason (`no-cookie`, `no-record`, `agent-mismatch`, `expired`, `revoked`, `epoch-mismatch`, `keyhash-mismatch`), the `cookiePresented` and `recordFound` booleans, the bot id and the route. No cookie, token or key material is logged. | `runner-reason-codes-regression.cjs` |
| 1 Coverage | `work.assign`, the trial source job and the approved trial caption job now send a content-free wake. Other assignment paths already did. | `wake-delivery-regression.cjs` |
| 2 Throttle | A throttled wake is recorded (owner-visible `wake_deferred`) and coalesced per bot. It is sent once after the window if a job still waits, and dropped otherwise. Flushes happen on the owner's HQ refresh, any bot claim and any presence call; one flusher wins. | `wake-delivery-regression.cjs` |
| 4 Encryption | Signing secrets and Bearer tokens are stored encrypted. Legacy plaintext secrets still sign. `POST /api/wake/encrypt-secrets {confirmed:true}` migrates after an exact decrypt round trip, and is idempotent. An unreadable secret raises an owner-visible `wake_failed` event naming the fix (re-enter it). | `wake-delivery-regression.cjs`, `wake-url-regression.cjs` |
| 5 Bearer mode | Owner-set routine webhook (https, x.ai or grok.com), sent with `Authorization: Bearer`, content-free. Set from the bot panel → Profile → Instant wake. | `wake-delivery-regression.cjs`, `wake-ui-regression.cjs` |
| 6 Email for any bot | `WAKE_<PROVIDER>_EMAIL` (for example `WAKE_MUSE_EMAIL`). A declared target still wins. The Instinct subject is unchanged. | `wake-delivery-regression.cjs`, `wake-trigger-regression.cjs` |
| 7 Cadence | Freshness for reassignment is `2 × max(pollSec, 300 s)`, so a 5-minute poller is never moved away. The "Late" label still follows the declared cadence. | `asleep-fallback-regression.cjs` |
| 8 Idempotency | A repeated `work.handoff` (same task, same target) returns the existing child: no second job, no second wake. The audit found no other evidenced gap: claim, complete, assign, chat task and reassign are already compare-and-set or keyed. | `handoff-idempotency-regression.cjs` |
| Measurement | `GET /api/jobs/:id` → `pickup`: assigned, wake sent and its channel, deferred, claimed, finished, and the seconds between them. | `pickup-timeline-regression.cjs` |
| Security | The pairing replay key is encrypted at rest. The branch diff contains no secrets (scanned). | `pair-replay-regression.cjs` |

**Offline suite:** 118 files, all passing (`for t in $(git ls-files '*-regression.cjs'); do node "$t"; done`).

**UI checked in Chromium:** desktop 1280×900 and iPhone 13. No console errors and no horizontal overflow. The token never appeared in the page.

## What is proven, waiting, or blocked

| Item | State | Exact next step |
|---|---|---|
| Seconds-level pickup on a real bot | **Not measured** | After deploy: assign a trivial job to Grok Bot with the Bearer webhook or email wake set, then read `pickup` from `GET /api/jobs/<id>`. Do it twice. |
| Grok Bot, Bearer route | **Built; waiting** on a routine and token from the owner | Royce creates a webhook-triggered routine on his Grok Bot, then pastes the URL and token in Profile → Instant wake. The test ping's HTTP status shows in the toast. |
| Grok Bot, email route | **Supported now; waiting** on the owner's env change | Set `WAKE_GROK_EMAIL` in Vercel Production and redeploy. Rollback: remove it and redeploy. A declared wake target overrides it. |
| Muse pickup | **Blocked by a missing dependency** | Muse reports no inbound push trigger. Next: (a) measure the floor with its recurring tasks; (b) if it can watch an inbox, set `WAKE_MUSE_EMAIL`; (c) otherwise, true push needs Meta to expose a trigger. |
| Muse 401 cause | **Waiting** on the instrumented pairing (needs owner approval) | Run the pairing test below and read the `runner_401` log lines. |
| Instinct | **Unverified** | Same trivial-job measurement. |
| Deferred wake with no traffic at all | **Gap stated** | A deferred wake goes out at the next request to Alter (owner HQ, any bot poll). Next step: a scheduled flush (for example a 5-minute GitHub Actions call to a secret-protected endpoint). That needs an owner-configured secret, so it isn't built. |
| Handoff without the owner relaying content | **Built** (trial contract plus wakes); **not live-tested** | Instinct → Grok trial on production after deploy. |
| Existing plaintext signing secrets | **Migration built, not run** | After deploy, the owner runs the migration from HQ (below). Live receivers keep working either way. |

## Validation steps for Royce to run with each bot

None of these send anything to a bot from Alter's side. You give the instructions; the bots report back.

**Instrumented pairing** (after deploy, with your approval):
1. Issue a fresh pairing code from the bot's HQ panel. Don't press "issue a key" afterwards.
2. The bot opens the runner link, pairs, then immediately presses Claim.
3. If any call fails, read the Vercel function logs for `runner_401`:
   - `cookiePresented: false` means the browser didn't send the cookie (presentation or storage isolation).
   - `recordFound: false` means the session lookup failed.
   - `keyhash-mismatch` means the key was rotated after pairing.
4. The bot reports one redacted yes or no: is there a cookie for its runner path in its browser storage? Never the value.

**Muse:** pair as above in its default persistent browser profile. Then:
- Resume the Flyopia project from its existing files, and name them to show the context survived.
- On a wake, claim assigned jobs one at a time, finish each, and stop when none remain.
- Report which pickup surfaces its app really offers (email, notifications, or polling only).

**Grok Bot:**
- **Email trigger:** set it on its own address, filtered to sender `wake@mail.alterhq.app`. On a trigger it opens its saved runner link, claims assigned jobs one at a time, finishes each, and stops when none remain. It never acts on the email's text.
- **Webhook routine:** create one with a Bearer token. You paste the URL and token into HQ (Profile → Instant wake), never into chat.
- Report the time from each trigger to its first Alter request.

**Instinct:** the same trivial-job measurement. Treat it as an unverified participant.

**Reading the measurement:** in HQ, open `https://www.alterhq.app/api/jobs/<job id>` while signed in, and read `pickup`. You'll find `secondsAssignToWake`, `secondsWakeToClaim`, `secondsAssignToClaim` and `secondsClaimToFinish`.

**Migration** (optional, after deploy): in HQ's browser console, run:

```js
fetch('/api/wake/encrypt-secrets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirmed:true})}).then(r=>r.json())
```

It answers with counts only.
