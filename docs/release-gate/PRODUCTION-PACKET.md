# Production go/no-go packet: three-bot trial, connect flow and password recovery

**Prepared 2026-11-21. Nothing here is deployed.**
- **Production:** `0991388` (`main`).
- **Release candidate:** branch `feat/two-bot-handoff-trial` (head named in the PR).
- **Deploy condition:** one explicit go from the owner after reading this.

## 1. What changes on production

### The branch did not contain production (found and fixed)
- The branch was based on `8fd2dd7`. It lacked `main`'s last 10 commits (#119–#129: waitlist screens and numbers, waitlist-admin enrollment, founding-seat card, hero video, copy).
- Shipping it as it was would have **removed** those from production.
- `e0ede61` merges `0991388` in cleanly. `git log HEAD..origin/main` is now empty.

### What lands, in plain terms
| Area | Effect on production | Commits |
|---|---|---|
| **Two-bot trial** (the test) | New owner page: account menu → Two-bot trial. A bot proposes moments from your transcript; you approve or deny the exact package on your phone; only then does the second bot get one caption job. The paired runner page can run trial jobs. | `77979ad`..`a923785` |
| **Password recovery** | "Forgot password?" on sign-in mails a single-use, 30-minute link. Founder accounts only, existing sender, rate-limited. A successful reset **deletes every prior session of the account from the store**, including sessions made before this release, so no version of the code can use them, rollback included. | `214978f` and the session-sweep fix |
| **Job safety stack** (needed by the trial) | Owner-approved actions run once, even across crashes and retries: once-only receipts and charges, and one-decision-only approvals. Requests expire (24 h; email 15 min). A bot can act only on a job it is running, and can't finish a job with an open proposal. Owner writes require the app's own Origin. | `af832a5`..`a9978f1` |
| **Notes** | Note approvals show the whole note. Saved notes can be opened. The owner can delete a note. An interrupted note save can be finished, once. | in the stack |
| **email.send** | A bot may *propose* an email. It always waits for the owner, goes only to addresses in `ALTER_EMAIL_ALLOWED_TO`, and comes from `WAKE_EMAIL_FROM`. If those aren't set, it is refused. | `5cd93f2` and follow-ups |
| **Wake pings** | No hard-coded Instinct inbox. A bot-declared email wake target is mailed only if it is on `ALTER_EMAIL_ALLOWED_TO`. | `1edcd2e`..`2c16936` |
| **Setup links** | Pairing and runner links use the deployment's own origin. | `8521a10` |
| **CI** | The full regression suite runs on pull requests and pushes to `main`. `main` has no CI today. | `71554b8` |

### Why the whole stack, not a smaller cut
The trial's guarantees rest on stack pieces production lacks:
- `RECEIPT_ONCE` and `CHARGE_ONCE`
- request expiry
- `claimReq`, so a decision is taken once
- `job_not_yours` and `proposal_unresolved`
- Origin checks

`main` has none of these (counted in `api/index.js` on each side). Lifting the trial alone would mean rebuilding them.

### Owner decisions carried by the stack (decide them at the go)
- **Q10, `28f8d7b`:** with the kill switch on, no new work is announced or started. Running jobs can still report and finish. Recommended: keep.
- **Q11, `0873aa2`:** restoring a revoked bot deletes its old gateway key; you issue a new one. Recommended: keep.
- **D1, `92aa662`:** the daily business cron route no longer crashes after auth. It is inert unless `ALTER_MODEL_KEY` and `ALTER_MODEL_WS` are set in Production; if they are set, it would make paid model calls. **Go condition:** confirm those two names are absent in Production (names only), or say "revert D1".

Choosing "drop" for any of these means a revert commit before the merge.

### Three of production's own tests were already failing
`in-person-seats`, `marketing-port` and `waitlist-og` fail on `0991388` itself, because #125 changed the waitlist behavior and copy. `7c48686` aligns the tests with production; it changes no page or code.

The two tags #125 dropped are not restored here; they're your call: `og:image:type`, and the image alt text on the link card.

## 2. Evidence it is safe (pre-deploy)

| Check | Result |
|---|---|
| Offline regression suite, merged tree | **112/112** (`for t in $(git ls-files '*-regression.cjs'); do node "$t"; done`) |
| GitHub CI `regression` on the PR | see the PR checks for the head commit |
| Real Redis (local redis-server behind a local REST shim, scripted workers) | `scripts/real-redis-proof.cjs` **6/6**; `scripts/pilot-real-redis-e2e.cjs` **5/5** |
| Password reset, provider stubbed (`password-reset-regression.cjs`) | **Pass.** Covers: generic answers, founders-only recipients, 3/h per address and 10/h per IP, newest link only, single use under concurrency, 30-minute expiry, failed or missing sender returns 503 and leaves no working link, old sessions end, other accounts untouched, nothing secret printed. |
| Reset in a browser (local Chromium, desktop and iPhone 13, provider stubbed) | **Pass.** Request on desktop → link from the stub → reset form on phone (fragment stripped from the URL) → signed in → link refused on reuse → new password logs in. No page errors. |
| Reset signs out everywhere (`session-invalidation-regression.cjs`) | **Pass.** Prior sessions, new-style and in 0991388's format, are deleted from the store. A login racing the reset is withdrawn, or swept, in three orderings. A failed scan or delete returns 503, not signed in, and the same link finishes. Compare-and-set contention changes nothing. Another account is untouched. 3,000 other sessions survive a multi-page sweep. Nothing secret is printed. |
| **Rollback simulation** | **Pass.** 0991388's session check (replica in the regression above), and separately 0991388's real handler loaded beside the release on one store: all 3 pre-reset sessions return 401 after the reset (2 made by 0991388, 1 by the release). The resetter's session and the new password work; the old password is refused. |
| Real Redis sweep (`scripts/session-sweep-real-redis.cjs`, also a CI step on a stock `redis-server`) | **Pass, 4/4.** 25,444-key keyspace swept in 152 ms. 35 prior sessions (30 in 0991388's format) deleted. Another account's 401 sessions untouched. 178 logins with the old password raced the reset on two instances, and none survived. A stalled instance never reported success, and a fresh one finished with the same link. |
| Connect flow rehearsal | One-paste link with the code in the fragment (`onepaste-regression.cjs`); the runner session through the real handler: claim, read trial input, propose, the target's read and complete (`runner-trial-regression.cjs`) |
| Isolated Preview | Earlier builds deployed Ready on the branch Preview (isolated store; preflight PASS 2026-11-20) |
| Production reachability | `GET https://www.alterhq.app/api/health` returned 200 `{"ok":true,"store":"upstash",…,"v":14}`, with no Vercel sign-in redirect. **Production is not behind Vercel Authentication.** |

**Unverified until after the go:**
- **Live reset email delivery.** The sender variable names (`RESEND_API_KEY`, `WAKE_EMAIL_FROM`) are read by the code, but whether they are set in Production is unknown here. It is the same sender as the waitlist-admin activation mail.
- **Every real bot step.**

## 3. Your recovery step (after the go)
1. On your phone, open `https://www.alterhq.app/hq`.
2. Tap **Forgot password?**, enter your email, and tap **Email me a reset link**.
3. Open the email from Alter and tap the link (it works once, for 30 minutes).
4. Choose a new password. You are signed in.

Recovery mail goes only to founder accounts. If it answers "Reset email is not available right now", the sender isn't configured in Production. Nothing was changed, and we stop there.

### How the reset behaves when something fails
Order of steps:
1. Claim the link.
2. Write the new password.
3. Sweep every `gl:sess:*` session whose stored account id matches (a `SCAN` of the whole keyspace, repeated until one full pass finds none).
4. Sign you in.

Login is guarded by a barrier: it writes its session, re-reads the account, and withdraws the session if the account changed. Either a login sees the new password record, or its session existed before step 3 began, and `SCAN` returns every key that exists for the whole scan. Either way, no racing login survives.

| Failure | What you see | Store state |
|---|---|---|
| The password write loses every compare-and-set | "Your account was busy, so nothing changed. Your password is the same. Try the link again." | Password unchanged; no session touched; the link works again |
| The scan or a delete fails, or the 20-second budget runs out | "Your password was changed, but signing out your other sessions did not finish, so you are not signed in yet. Open the same link again and enter the same new password to finish." | New password set. Some old session keys may remain: the new code refuses them (`pwAt`); 0991388 would not until they're deleted. Not reported as done. The same link plus the same password finishes. |
| The function dies mid-sweep | No answer | As in the row above. The same link plus the same password finishes. |

**Cost:** each sweep pass reads the whole keyspace, about 2 store commands per 1,000 keys, and a reset makes at least 2 passes. The production key count isn't known from here, and correctness doesn't depend on it.

## 4. Connecting the three bots on production

Prior working pattern: HQ → Connect → the bot → a one-paste setup message containing `https://www.alterhq.app/runner?agent=<id>&poll=120#pair=<one-time code>`. The code sits in the link's `#fragment`, and the runner page pairs itself. Production needs no Vercel sign-in or bypass.

- **Instinct:** paste HQ's Instinct setup message, then the trial job text in `docs/two-bot-trial/THREE-BOT-RUN.md` (claim, Read trial input, `pilot.handoff` once, stop).
- **Muse:** paste HQ's Muse setup message, the same runner link. It needs Muse's own browser to open the link and press the buttons; that ability is **unverified**. As the proposer in run 2, it gets the same job text.
- **Grok Bot:**
  - If it can drive a browser: HQ's Grok browser setup message (runner link).
  - If it works only through files and commands on your PC: the adapter, with `ALTER_BASE=https://www.alterhq.app` and Grok's own key file (no bypass file on production). Running `node` is required, and whether Grok can is **unverified**.
  - If it can neither drive a browser nor run commands, the missing capability is exactly that, and Grok can't take part.

Native capabilities of all three are **unverified** from this session (their product pages are unreachable from here). The first live claim in each run is the test.

**Runs:**
1. Instinct proposes, you **approve**, Grok writes captions.
2. Muse proposes, you **deny**, and Grok's claim must come back empty.

The transcript is one you choose: non-sensitive text.

## 5. Rollback

**Code rollback:** in Vercel, Deployments → the current production deployment of `0991388` → **Instant Rollback**. Do it before any later deploy replaces it. Plan-specific limits are unverified.

**What the release writes** (no migration runs at deploy; writes happen only when features are used):
- **New key families:**
  - `fm:pilot:*`, `fm:pilotinput:*`, `fm:handoff:*`, `fm:pilotreq:*`, `fm:pilottasks`, `fm:pilotlist`
  - `fm:rcptonce:*`, `fm:done:*`, `fm:charged:*`, `fm:jobspent:*`, `fm:adopted:*`
  - `fm:note:*`, `fm:noteids`, `fm:notelock:*`
  - `fm:gatewayCall:*`, `fm:gatewayPoll:*`, `gl:wakeTest:*`
  - `gl:pwreset:*`, `gl:pwresetUser:*`, `gl:resetReq*`, `gl:resetTryIp:*`
- **New fields on existing records:**
  - tasks: `pilot`, `pilotOutcome`, `jobGrant` changes
  - requests: `detailsHash`, `expiresAt`, new statuses `expired`, `outcome_unknown`, `reconciling`, `recovering`
  - sessions: `at`
  - your user record, after a reset: new `salt`, `hash`, `pwAt`
- **Receipts:** new outcomes `proposed`, `read`, `delivered`, appended to the receipt hash chain.

**What rollback leaves behind, and old-code compatibility:**
- All keys above stay in the store. Old code ignores keys it doesn't read.
- **Trial jobs remain as ordinary-looking jobs.** Old code has no `/input` route, and B's job record carries no package text, so nothing leaks. A pending `pilot.handoff` request would be blocked by old code as an unknown action. **Before rolling back, deny any pending handoff and stop open trial jobs.**
- **Your new password stays.** It uses the same scrypt format, so old code signs you in with it.
- **Sessions from before a reset stay gone.** A reset reports success only after every session of the account has been deleted from the store. 0991388's session check finds nothing for them (rollback simulation above). `pwAt` remains as a second check in the new code only.
- **Irreversible effects** (no rollback undoes them):
  - emails actually sent: the reset email, and any `email.send` you approve
  - gateway keys deleted when a revoked bot is restored (Q11)
  - receipts appended to the hash chain
  - any note you delete (deleting a note is permanent by design)

## 6. Also found

`foreman-grok-worker` (`.github/workflows/worker.yml`) runs every 5 minutes against production with repository secrets `FOREMAN_GROK_KEY` and `XAI_API_KEY`.
- Its latest log says `revoked: stopping`: its bot is revoked, so it does nothing and makes no xAI calls.
- **Do not restore that bot.** Restoring it would restart metered xAI calls.
- Disabling the schedule or removing `XAI_API_KEY` are repository-setting changes, left to you.
