# Storage isolation: Preview vs production

Status as of 2026-11-11: **Preview and production share one Upstash database.** Any request to a Preview deployment reads and writes production data. Until the steps below are done and checked, do not use a Preview for live testing of any kind.

This document changes nothing by itself. Every step under "Separating them" is an account change that needs Royce's approval.

## How the server picks its store

The server reads its store settings in `api/index.js` (lines 52–53) and nowhere else:

```js
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK  = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
```

The rules, in order:

1. **URL.** `KV_REST_API_URL` wins. If it is unset, `UPSTASH_REDIS_REST_URL` is used.
2. **Token.** `KV_REST_API_TOKEN` wins. If it is unset, `UPSTASH_REDIS_REST_TOKEN` is used.
3. **No URL at all.** The server uses an in-process memory store. That store is per instance, is lost on cold start and is never shared. It exists for local development and tests only.
4. **Workspace keys.** Inside the chosen database, workspace data is namespaced as `w:<workspace>:fm:...` (the original `legacy` workspace keeps unprefixed `fm:...` keys) and global data (users, sessions, key index) lives under `gl:...`. That isolates workspaces from each other. It does **not** isolate deployments: two deployments that point at the same database see the same workspaces.

Pitfalls these rules create:

- **The URL and token are chosen independently.** If an environment has `KV_REST_API_URL` from one database and only `UPSTASH_REDIS_REST_TOKEN` from another, the server pairs a URL with the wrong token. Every call then fails auth. Set both names from the same database, or set only one pair.
- **The wrong pair can silently win.** If the Vercel KV/Upstash integration injects `KV_REST_API_*` for all environments, a Preview-only `UPSTASH_REDIS_REST_*` override is ignored. The `KV_*` pair takes precedence. To separate Preview, the `KV_*` names themselves must differ per environment, or be absent on Preview.
- **A missing URL silently means memory.** If Preview ends up with no URL at all, it runs on the memory store. That is safe for production data, but Preview state then vanishes between invocations. `/api/health` reports `store: "memory"` in that case and `store: "upstash"` otherwise. That is the only store signal it gives; it does not say *which* database.

## Bindings to check, per Vercel environment

| Variable | Secret? | Production | Preview | Development |
|---|---|---|---|---|
| `KV_REST_API_URL` | no (hostname of the database) | production DB | **must be a different DB, or unset** | optional |
| `KV_REST_API_TOKEN` | **yes** | production DB | must match the Preview URL's DB | optional |
| `UPSTASH_REDIS_REST_URL` | no | fallback only | fallback only | optional |
| `UPSTASH_REDIS_REST_TOKEN` | **yes** | fallback only | fallback only | optional |
| `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` | yes | not read by this code | not read by this code | — |

Other environment variables the server reads include `ENC_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, the `WAKE_*` values and the `ALTER_MODEL_*` values. They do not choose the store, but a Preview that shares production's `ENC_SECRET` can decrypt production's encrypted fields. Review them when the store is split.

## Comparing environments without exposing a secret

Compare **database hostnames only**, never tokens. The hostname, such as `example-12345.upstash.io`, identifies the database and is not a credential.

**Option A: dashboard (no secret leaves Vercel).**
1. Open Vercel → Project → Storage.
2. For each connected database, read which environments it is connected to.
3. If one database lists both Production and Preview, they are shared.
4. Then open Settings → Environment Variables and filter by `KV_REST_API_URL`. Confirm there is one entry per environment, or an entry scoped to Production only, and that the Preview value shows a different hostname.

**Option B: CLI, printing hostnames only.** This option pulls secrets to a temporary file on the operator's own machine. Run it only there, and delete the file immediately.

```bash
vercel env pull /tmp/env.preview --environment=preview --yes && node -e "const t=require('fs').readFileSync('/tmp/env.preview','utf8');for(const k of ['KV_REST_API_URL','UPSTASH_REDIS_REST_URL']){const m=t.match(new RegExp('^'+k+'=\"?([^\"\\n]*)','m'));console.log(k, m&&m[1]?new URL(m[1]).hostname:'(unset)')}" ; rm -f /tmp/env.preview
```

Repeat with `--environment=production`. The two hostnames must differ, or Preview must print `(unset)` for both. Never paste the pulled file, a token, or the full URL with a query string into chat, a ticket or a log.

No new `/api/health` field is added for this. Health stays public and reports only `upstash` or `memory`.

## Separating them (needs Royce's approval)

Free option, to be confirmed against current Upstash free-tier limits before acting (not verified here):

1. Create a second Upstash Redis database on the free tier, for example `alter-preview`.
2. Connect it in Vercel to the **Preview** environment only. Remove Preview from the production database's connection, so the production `KV_REST_API_*` values are scoped to Production only.
3. Make sure Preview gets a matching `KV_REST_API_URL` and `KV_REST_API_TOKEN` pair from the new database, not a mix.
4. Redeploy the Preview, because environment changes apply only to new deployments.

Cost: none on the free tier, if the account's free database allowance is not already used. If it is, stop and ask again rather than upgrading.

Not acceptable as separation: a key prefix inside the shared database. Code bugs, scans and `notes.delete`-style bulk operations would still reach production keys.

## Checklist after separation is approved and done

- [ ] Option A or B shows different database hostnames for Production and Preview, or Preview unset.
- [ ] Production `/api/health` says `store: "upstash"` and production data is intact: sign in and see the expected bots and jobs.
- [ ] Preview `/api/health` says `store: "upstash"` (or `memory` if it was deliberately left unset).
- [ ] A Preview sign-in does **not** show production workspaces, bots or receipts.
- [ ] A write on Preview (for example, creating a test job) does not appear on production.
- [ ] Production's `ENC_SECRET` is not shared with Preview, or the sharing is a recorded, deliberate decision.
- [ ] Any test data created in the shared database before the split has been reviewed and, with approval, removed. One known item: the stray pending bot `agent_ece6417282`.
- [ ] Only then lift the "no live testing on Preview" rule.
