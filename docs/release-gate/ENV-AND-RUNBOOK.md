# Environment inventory, isolated-Preview runbook and rollback

Everything below comes from the code at `a9978f1`, unless it is marked *reported* (from the owner or an earlier session) or *unknown*.

**What couldn't be checked here:**
- **No Vercel access:** no CLI, no token, no project link (`.vercel/`). So the env vars actually set in Production or Preview, the project settings and the deployment protection mode are unknown.
- **No docs:** the public Vercel and Upstash docs didn't resolve from this session (`getaddrinfo ENOTFOUND vercel.com`, `upstash.com`). Every docs-dependent fact is marked *unverified*.

## 1. How the app chooses its store (api/index.js:52-53, 58-66)

```js
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK  = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
```

- **URL:** `KV_REST_API_URL` wins, and `UPSTASH_REDIS_REST_URL` is only a fallback.
- **Token:** chosen **independently**: `KV_REST_API_TOKEN` wins, and `UPSTASH_REDIS_REST_TOKEN` is the fallback.
- **The pair must come from one store:** set `KV_REST_API_URL` and `KV_REST_API_TOKEN` together, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` together. A KV URL with an Upstash token, or the reverse, pairs credentials from what may be different stores.
- **A shared `KV_*` pair silently overrides a Preview-only `UPSTASH_*` pair.** To isolate a Preview, the `KV_*` names themselves must point at the Preview store for that Preview.
- **No URL at all:** the app runs on an in-memory store that is lost on every cold start. A Preview like that is not a usable test target.
- **Transport:** every command, Lua `EVAL` included (there is no `EVALSHA`), is a JSON `POST` to the REST URL with `Authorization: Bearer <token>`.
- **Workspace isolation:** workspaces are isolated inside one database by the `w:<ws>:` key prefix (api/index.js:49). That is **not** isolation between deployments.
- **`/api/health`** (api/index.js:1804) reports only `store: "upstash"` or `"memory"`, never which store.

## 2. Every environment variable the code reads

**Read by:** `api/index.js`, `api/og.js`, `issuer-webhook.cjs`. `middleware.js`, `lib/*.cjs` and `api/bot-link.js` read none.

**Production status:**
- No variable has been seen directly. Production status is unknown for all of them, unless stated.
- *Reported:* `ALTER_MODEL_KEY` and `ALTER_MODEL_WS` were absent from Production at the last check, so the business engine is inert there.
- *Reported:* `feat/email-send-gate` has its own Preview bindings, and this branch does not, so this branch's Preview would use the general Preview bindings, which are reported to share the production KV store.

| Variable (label only) | Read at | Purpose | If missing | Preview of this branch should |
|---|---|---|---|---|
| `KV_REST_API_URL` | api/index.js:52 | Store REST URL (wins) | Falls back to `UPSTASH_REDIS_REST_URL`, then memory | **Point at the Preview-only store** |
| `KV_REST_API_TOKEN` | api/index.js:53 | Store token (wins) | Falls back to `UPSTASH_REDIS_REST_TOKEN` | **Preview-only store's token, same store as the URL** |
| `UPSTASH_REDIS_REST_URL` | api/index.js:52 | Fallback store URL | — | Either unset, or point at the same Preview store |
| `UPSTASH_REDIS_REST_TOKEN` | api/index.js:53 | Fallback store token | — | Either unset, or the same Preview store's token |
| `ENC_SECRET` | api/index.js:912 | AES-GCM key for stored provider keys (`fm:secret`), runner session keys (`gl:runner`) and OAuth codes | **Silently derives the key from the store token, or the literal `'dev'`** | **Set to a freshly generated value; never reuse production's** |
| `CRON_SECRET` | api/index.js:2350 | Bearer for `/api/cron/business-daily` | Route answers 401 | Leave unset |
| `RESEND_API_KEY` | api/index.js:203, 215, 385, 407, 429-432, 1343 | email.send, wake emails, delivery checks | email.send reports "email_not_configured"; no wake email | **Leave unset** (no real email from the Preview) |
| `WAKE_EMAIL_FROM` | api/index.js:201-204, 385, 407, 429-432 | Sender for email.send and wakes | Same as above | Leave unset |
| `ALTER_EMAIL_ALLOWED_TO` | api/index.js:137 | Recipient allowlist for email.send | Every recipient refused | Leave unset |
| `WAKE_INSTINCT_EMAIL`, `WAKE_GROK_EMAIL` | api/index.js:405, 431-432 | Wake inboxes | No wake ping; bots poll | Leave unset |
| `WAKE_GROK_SLACK_WEBHOOK` | api/index.js:413, 433 | Slack wake ping | No Slack ping | Leave unset |
| `WAKE_GITHUB_TOKEN`, `WAKE_GITHUB_REPO` | api/index.js:416-419, 434 | GitHub-issue wake ping | No GitHub ping | Leave unset |
| `ALTER_MODEL_KEY`, `ALTER_MODEL_WS` | api/index.js:2115, 2118 | Business engine key and workspace allowlist | Engine reports "not configured / not enabled"; no provider call | Leave unset (no model enabling in this gate) |
| `ALTER_MODEL_BASE_URL`, `ALTER_MODEL_NAME` | api/index.js:2116-2117 | Engine endpoint and model (defaults: api.groq.com, `openai/gpt-oss-120b`) | Defaults used, inert without the key | Leave unset |
| `BRAND_NAME` | api/index.js:114, api/og.js:11 | Display name (default "Alter") | Default | Optional, not a secret |
| `STRIPE_ISSUING_TEST_WEBHOOK_SECRET` | api/index.js:1914, issuer-webhook.cjs:21-23 | Test-only issuer webhook signature | Webhook answers 503 | Leave unset |

**What the preflight enforces:** it fails if the Preview carries any of these outbound-capable variables, unless you explicitly allow a named one: `RESEND_API_KEY`, `WAKE_EMAIL_FROM`, `WAKE_INSTINCT_EMAIL`, `WAKE_GROK_EMAIL`, `WAKE_GROK_SLACK_WEBHOOK`, `WAKE_GITHUB_TOKEN`, `WAKE_GITHUB_REPO`, `ALTER_MODEL_KEY`, `ALTER_MODEL_WS`, `CRON_SECRET`, `STRIPE_ISSUING_TEST_WEBHOOK_SECRET`.

**The minimum isolated-Preview binding set** is a Preview-only store pair (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) and a fresh `ENC_SECRET`. Nothing else is needed for the bot proof.

**Cost:**
- A second database is **cost unknown**: it couldn't be verified that a second free database is available on this Hobby team or Upstash account.
- Env var scoping is free.

### Bot paths that exist on a Preview

- **HTTP gateway (bring-your-own bot with a gateway key):** works on any deployment. Since `8521a10`, the setup and runner links name the Preview's own origin.
- **Bot-link pairing (Instinct / Grok / Muse) and the runner page:** links name the deployment's own origin (`setupOriginFor`, api/index.js:1568). These exist and are tested offline (`setup-origin-server-regression.cjs`).
- **Remote MCP + OAuth:** **production-only.** The OAuth issuer is fixed at `https://foreman-core.vercel.app` / `https://www.alterhq.app` (api/index.js:1562-1563), and the Connect wizard says "Remote MCP sign-in is not available on this Preview." Future work; not part of this gate.
- **Signup on the empty Preview store:** open at the API level. `/auth/signup` needs an email and an 8+ character password, and creates a fresh workspace (api/index.js, `handleAuth`). No invite or founding gate applies to signup.

### Deployment protection

- **Unknown** whether Vercel Deployment Protection is on for this project's Previews. It can't be read without Vercel access, and the docs were unreachable.
- If it is on (Vercel Authentication), a bot calling `https://<preview>/api/...` without a Vercel login is expected to be stopped before it reaches Alter, which would block every bot path above.
- No bypass (protection-bypass secret, shareable link, path or domain exception) is proposed as approved. This is an owner decision in the approval packet.

## 3. Runbook (to execute only after approval; isolation before deploy)

Every step that touches Vercel, Upstash or GitHub is an **owner action at the time of execution**. Nothing below has been run.

0. **Recheck before starting.**
   - `git ls-remote origin refs/heads/fix/email-loop-hardening` must still show `bc95f92`.
   - Local HEAD must match the approved manifest.
   - The local suite must pass (`for t in $(git ls-files '*-regression.cjs'); do node "$t" || echo FAIL "$t"; done`).
   - `node scripts/real-redis-proof.cjs` must pass (needs a local redis-server).
1. **Create the Preview-only store (owner, dashboard).**
   - Create a separate Redis database, only if it is shown as free at creation time; otherwise stop.
   - Connect it to **Preview only**, and if the UI allows it, only to the Git branch `fix/email-loop-hardening`. Whether branch scoping is offered for a storage connection is *unverified*.
2. **Make this branch's Preview resolve to that store.**
   - Ensure `KV_REST_API_URL` **and** `KV_REST_API_TOKEN` for this branch's Preview come from the new store.
   - If the general Preview scope still carries the production `KV_*` pair, add branch-scoped values for this branch that override both.
   - Also cover `KV_URL`, `REDIS_URL` and `KV_REST_API_READ_ONLY_TOKEN` if they are present.
   - Which scope wins when general-Preview and branch values overlap is *unverified*; the preflight checks the resolved result instead.
3. **Set a fresh `ENC_SECRET`** for this branch's Preview only.
   - Generate it on your own machine, for example `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   - Paste it straight into Vercel. Never into chat, never reusing production's.
4. **Confirm no outbound-capable variables** apply to this branch's Preview (list in §2).
5. **Run the preflight (owner's machine).**
   - Export the effective variables for both environments. With the Vercel CLI that would be `vercel env pull preview.env --environment=preview --git-branch=fix/email-loop-hardening` and `vercel env pull production.env --environment=production`. These flags are *unverified*; check them with `vercel env pull --help`.
   - Then run `node scripts/preview-isolation-preflight.cjs --preview preview.env --production production.env`.
   - **Require `RESULT: PASS` and exit code 0.** On FAIL, stop.
   - Delete both `.env` files afterwards: they hold secret values. The script never prints them.
6. **Only then push.**
   - `git push origin fix/email-loop-hardening` is a fast-forward from `bc95f92`. If the remote moved, stop.
   - It is *unverified* that the Git integration then builds a Preview for the branch.
   - CI does **not** run on this push (see CI-ALIGNMENT.md); it needs a pull request.
7. **Verify isolation before any bot touches it.** This is part of the future authorized run, not this pass.
   - Check that `GET https://<preview>/api/health` shows `store: "upstash"`. That proves only "not memory".
   - Sign up a fresh test owner on the Preview.
   - In the Upstash console, confirm the new `gl:user:*` key appears in the **Preview** database and that the **production** database's key count didn't change.
   - The health endpoint can't show store identity, and no new public field is proposed.

## 4. Rollback

- **A Preview doesn't change production.** Rolling back the Preview means stopping traffic to it and disconnecting or deleting the Preview-only database. Whether you can delete or disable a single Preview deployment on Hobby, and how, is *unverified*.
- **The branch push itself:** the remote branch can be moved back to `bc95f92` only with a force-push. That rewrites shared history and needs separate approval. The safer route is a new revert commit.
- **Production is not touched by this gate.** Vercel's Instant Rollback or redeploy of an earlier production deployment exists in general, but its exact Hobby-plan limits are **unknown** here (docs unreachable). Don't rely on it until checked.
