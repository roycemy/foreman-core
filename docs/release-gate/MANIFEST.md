# Push manifest: what changes when `fix/email-loop-hardening` is pushed

**State checked on 2026-11-11, at the start of this pass:**
- **Local branch:** `fix/email-loop-hardening`, HEAD `a9978f14b9ee61b4eaf44a1719fbcb64ac4b8401`. The working tree was clean apart from the untracked `docs/vision-gap-plan.md`.
- **Remote** (read-only `git ls-remote origin`):
  - `refs/heads/fix/email-loop-hardening` = `bc95f92e1dca9f4ba41768082e9256f361ca6a89`
  - `refs/heads/main` = `8fd2dd7b1972145f3ed198f356e6ab2ba98174d1`
  - `refs/heads/feat/email-send-gate` = `67a053f0637c9ce36c8c4f08c445b97ba1792ee0`
- **Matches** `a9978f1` / `bc95f92` / `8fd2dd7`: **yes, all three.** Nothing has moved, and nothing has been pushed since `bc95f92`.
- **Newer than `a9978f1`:** only this pass's preparation commit (docs, the preflight script and its regression; no product code). It's listed at the bottom.

**What a push does:** a fast-forward of `origin/fix/email-loop-hardening` from `bc95f92` to the final HEAD. It is not a merge to `main`. Production deploys from `main`, so a push alone doesn't change production. Whether the push auto-builds a Preview depends on the Vercel Git integration; it can't be verified here (no Vercel access).

**Totals since `bc95f92`:** 27 commits up to `a9978f1`, plus 1 preparation commit. Diffstat to `a9978f1`: 23 files, about 1,088 insertions and 34 deletions.

## Fixes (product code)

| Commit | What it changes | Files |
|---|---|---|
| `f8ea5e8` | Recover an owner-approved note save that never finished (F3): stable note id, note lock, owner "Finish saving" card. | api/index.js, public/js/core.js, floor.js, inbox.js, pop.js, 2 tests |
| `b39061a` | Show an interrupted note save without waiting for the 30 s state cache. | public/js/core.js, 2 tests |
| `2df210c` | Record an approved request's cost once, across a crash and recovery. | api/index.js, 2 tests |
| `993cbc7` | Find a request's completed receipt by a marker, not the last 300 receipts. | api/index.js, test |
| `24d1e4c` | Recovery adopts a note an older build already wrote instead of writing a second. | api/index.js, test |
| `9454a67` | The pop-down and phone sheet render an unknown-outcome email instead of throwing (UI only). | public/js/pop.js, test |
| `ee561a0` | **Feature (requested item F):** the owner can delete a saved note (owner-only, same-origin, confirm step, content-free tombstone). | api/index.js, public/js/receipts.js, 2 tests |
| `1d991b5` | AUTO `notes.write` is retry-safe with an explicit `source_id`; the MCP tool and setup copy mention it. | api/index.js, public/js/connect.js, test |
| `8521a10` | Server-built pairing and runner links use the deployment's own origin (Preview-safe); MCP and OAuth stay production-only. | api/index.js, 2 tests |
| `2f2c09a` | Delete copy says approval and receipt records may still hold the approved text. | public/js/receipts.js, test |
| `86dc8fd` | An old retry can't charge a job budget twice (superseded in mechanism by `df1d08c`). | api/index.js, test |
| `29cfe47` | One older note is adopted by at most one request. | api/index.js, test |
| `df1d08c` | The daily counter and the job ledger are charged in one atomic Lua operation (`CHARGE_ONCE`). | api/index.js, 2 tests |
| `512e908` | The bot's delete-all takes each note's lock. | api/index.js, 2 tests |
| `bbf5e45` | Job details and the bot's own job read show the current spend. | api/index.js, test |
| `f4835b7` | An AUTO retry after a crash can't write a second receipt (`RECEIPT_ONCE`). | api/index.js, test |
| `ef8e581` | An approved request's completed receipt is written once, atomically. | api/index.js, test |
| `9cad1e6` | A deleted note stays deleted across recovery; delete-all skips deleted notes and continues past a busy one. | api/index.js, 2 tests |
| `67dbfeb` | **Security:** ten owner write routes now require the app's own Origin (D2). | api/index.js, 3 tests |
| `76a4e92` | A plain AUTO note write can't put deleted text back after a delete-all; also corrects a vacuous test gate. | api/index.js, 2 tests |
| `11d67fe` | The adopted-older-note recovery receipt is written once, atomically. | api/index.js, test |

## Tied to a separate or pending owner decision (flagged)

| Commit | Status | Why it's flagged |
|---|---|---|
| `92aa662` | **D1 cron fix. You are keeping the D1 production hotfix as a separate decision.** | It is inside this branch, so the push carries it. On a Preview it is dormant: with no `CRON_SECRET` on the Preview the route answers 401, and it is commonly understood that Vercel Cron runs only on Production, though that couldn't be verified here (docs unreachable). It would activate the daily business tick only once this branch reaches `main`. Options are in the approval packet. |
| `28f8d7b` | **Q10 proposal. Owner decision pending.** | Implements a proposed kill-switch behavior. Not approved. If you decide otherwise, revert it with a new commit before the push. |
| `0873aa2` | **Q11 proposal. Owner decision pending.** | Implements a proposed restore behavior (new key required), plus a fix to the in-memory store's multi-key `DEL`. Not approved. Same handling as `28f8d7b`. |

## Tests, CI and docs (no product behavior)

| Commit | What |
|---|---|
| `04a92c0` | docs/storage-isolation.md: store precedence and how to separate Preview storage. |
| `71554b8` | .github/workflows/ci.yml: full suite on pull requests and pushes to `main` (see CI-ALIGNMENT.md: it does not run on a plain branch push). |
| `a9978f1` | scripts/real-redis-proof.cjs: the local real-Redis proof (needs a local redis-server; not part of CI). |
| *(this pass)* | docs/release-gate/*, scripts/preview-isolation-preflight.cjs, preview-preflight-regression.cjs, and the corrected docs/vision-gap-plan.md. **Newer than `a9978f1`; preparation only.** |

## Work in progress

None. Every commit is complete and covered by the suite: 101/101 at `a9978f1`, and 102/102 with this pass's preflight regression.
