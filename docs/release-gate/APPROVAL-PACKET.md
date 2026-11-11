# Approval packet: isolated Preview and real-bot proof

**What this packet is:** one sign-off for the next gate. Nothing in it has been executed.
- **Candidate:** `fix/email-loop-hardening` at the HEAD listed in MANIFEST.md: `a9978f1` plus one preparation-only commit.
- **Published base:** `bc95f92`. `main` and production are `8fd2dd7`.
- **Verified so far, locally only:** the suite passes 102/102, and the real-Redis proof passes 6/6 against a local redis-server through a local REST shim.
- **Not tested:** Upstash or any hosted Redis, any hosted deployment, any real bot.

**Supporting files:** MANIFEST.md (exact push contents), ENV-AND-RUNBOOK.md (bindings, ordered runbook, rollback), CI-ALIGNMENT.md, REAL-BOT-ACCEPTANCE.md (NOT RUN), and `scripts/preview-isolation-preflight.cjs`, the fail-closed static check.

## Critical path, in order

| # | Decision | What changes | Cost | Recommended default |
|---|---|---|---|---|
| 1 | **Create a separate Preview-only database** and bind this branch's Preview to it. The binding is the `KV_REST_API_URL` + `KV_REST_API_TOKEN` pair from that store, plus a freshly generated `ENC_SECRET`, with no outbound-capable variables. | A new database, plus env vars scoped to Preview (and to this branch, if offered). Production is untouched. | **Unknown.** I couldn't verify that a second free database is available on this Hobby team (no Vercel access; docs unreachable). The env var scoping itself is free. | **Approve only if the dashboard shows it as free at creation; otherwise stop and come back.** Then run the preflight and require `RESULT: PASS` before step 2. |
| 2 | **Push this branch,** a fast-forward from `bc95f92` to the manifest HEAD, after step 1 passes the preflight. | `origin/fix/email-loop-hardening` moves; Vercel likely builds a Preview from it (unverified). `main` and production don't change. | Free (unverified that Hobby build minutes are unaffected). | Approve, **after** steps 1 and 3. If you want CI to run, also approve opening a pull request, because CI does not run on a plain branch push (CI-ALIGNMENT.md). |
| 3a | **Q10: should the kill switch also stop job completion and event reports?** Owner decision pending. | **A. Ship the local proposal `28f8d7b`:** the switch blocks claiming, acting, chat jobs and presence, and also stops the next plan part starting and bots being woken. It still accepts completion, failure and event reports, so running jobs wind down honestly. **B. Stricter:** also refuse completion and reports. Running jobs freeze, and their real outcome may go unrecorded until the switch is off. **C. Drop `28f8d7b`** with a revert commit: today's behavior returns, so a finished plan part can still start the next part and wake a bot while the switch is on. | Free | **A.** It matches the vision's "stop means block further routed actions, not rewind" and keeps receipts honest. |
| 3b | **Q11: should restoring a revoked bot require a new key?** Owner decision pending. | **A. Ship the local proposal `0873aa2`:** restore removes the old gateway key; the old key gets 401, and you issue a new key from Connect. Revoke still gives an honest 403. **B. Drop `0873aa2`** with a revert commit: restore silently re-enables the old key, including one that may have leaked. Option B must keep that commit's separate in-memory `DEL` fix, which is test-only. | Free | **A.** A restore shouldn't silently re-grant a possibly leaked key. |
| 4a | **Go-ahead for the real-bot proof** on the isolated Preview (REAL-BOT-ACCEPTANCE.md). | You pair one real bot, run one job and approve on your phone; the evidence listed in the plan is captured. | Free in Alter. The bot's own provider usage, if any, is on your bot account. | Approve after steps 1-3 and the isolation check in runbook step 7. |
| 4b | **Deployment protection approach for the Preview.** | **Unknown** whether protection is on. If it is, a bot's calls to `https://<preview>/api/...` are expected to be stopped before they reach Alter. Bypass options exist in general (protection-bypass secret, shareable links, exceptions), but none is proposed or approved here. | Unknown; some bypass options may be plan-dependent. | Check the project's protection setting first. If it's on, decide how a bot may reach this one Preview, in a way you're comfortable keeping for the test window only. |

**If you choose B or C on Q10, or B on Q11:** the commit is reverted with a new commit before the push, not by rewriting history, and the manifest is regenerated.

**`92aa662` (D1 cron fix) ships with this push,** because it is inside the branch. It is dormant on a Preview: without `CRON_SECRET` the route answers 401, and Vercel Cron is commonly understood to run only on Production (unverified here). It stays a separate decision for when this branch reaches `main` (see "later"). If you'd rather the push not carry it at all, say so and it will be reverted with a new commit before the push.

## Later, not blocking this gate

- **D1 cron hotfix to production:** check the names `ALTER_MODEL_KEY` and `ALTER_MODEL_WS` in Production first. They were reported absent, which makes the tick inert.
- **Model enabling:** no.
- **The 16,000-character source cap** for the daily tick.
- **The privacy/consent branch (PR #116).**
- **Cleanup of the stray pending agent `agent_ece6417282`:** untouched, deferred.
- **Pin the Node version:** `engines`, and the Vercel project setting, once visible.
- **SHA-pin the actions in `worker.yml`.**
- **Raise CI's minimum-file guard** from 90 to the current count.

## What this pass did not do

- **No push, merge or pull request.**
- **No changes to Vercel, Upstash or GitHub settings.**
- **No env var writes and no database created.**
- **No live requests to Alter (Preview or production), to providers, or to any store.**
- **No secret values in any file.**
- **The Q10 and Q11 commits are unchanged.** Only their wording in docs/vision-gap-plan.md was corrected to "owner decision pending".
