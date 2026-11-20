# Preview gate for `feat/two-bot-handoff-trial`

**Status (Nov 20):** steps 1-4 are done, as reported from the owner's Vercel project:
- The suppressed push created no deployment.
- Six Preview-only variables are scoped to this branch: the five below, plus `KV_REST_API_READ_ONLY_TOKEN` overridden to the isolated store.
- The preflight printed `RESULT: PASS`, with the Preview host `valued-glider-198085.upstash.io` differing from production's. That is static configuration evidence, not a runtime proof.

Step 5 removes the suppression block.

## The real order

Vercel refuses branch-scoped variables for a branch that isn't on GitHub yet ("Branch … not found in the connected Git repository"). A plain push would build a Preview bound to the shared production store. So:

1. **Push with suppression.** The pushed head's `vercel.json` has `"git": {"deploymentEnabled": {"feat/two-bot-handoff-trial": false}}`. Per Vercel's Git configuration docs, this map names branches that "should not trigger a deployment upon commits"; branches not listed keep deploying.
2. **Confirm no deployment exists** for this branch in the project's Deployments list. If one exists, stop.
3. **Set the five branch-scoped Preview variables** (below).
4. **Run the preflight** (below). It must print `RESULT: PASS`.
5. **Remove the suppression block and push.** The first deployment builds bound to the isolated database. Check that its commit equals the branch head, and that `/api/health` shows `store: "upstash"`.
6. **Open the draft pull request** based on `fix/email-loop-hardening`. Never merge it.

## What was checked (from the repo, without secrets)

**Store clients.** There is one, at `api/index.js:52-53`:
- `URL = KV_REST_API_URL || UPSTASH_REDIS_REST_URL`
- `TOKEN = KV_REST_API_TOKEN || UPSTASH_REDIS_REST_TOKEN`

With neither set, the app uses an in-memory store. That writes nothing durable, but the trial wouldn't work across function invocations. The bot-link store goes through the same `r()`. `api/og.js` reads only `BRAND_NAME`. No other storage client exists.

**Outbound paths the trial can reach:** none.
- Creating a trial and dispatching B's job write records and events only.
- They never call `maybeWakeBot` or `newTask`, so there is no wake webhook, email or hosted model run.
- While a bot holds an unfinished trial job, every routed action except `pilot.handoff` is refused, including `email.send` and `web.fetch` (tested).
- The offline test asserts that no trial path makes an outbound request.

**Outbound paths elsewhere in the app** (not part of the trial, but live on any Preview where their variables are set):
- wake pings: `WAKE_*`
- email: `RESEND_API_KEY`, `WAKE_EMAIL_FROM`, `ALTER_EMAIL_ALLOWED_TO`
- the daily model tick: `CRON_SECRET`, `ALTER_MODEL_*`
- the Stripe test webhook

`scripts/preview-isolation-preflight.cjs` fails if any of these is present on the Preview, unless you explicitly allow it.

**Environment precedence (corrected after an independent read of the live Vercel project):**
- The Preview-only `KV_REST_API_URL`, `KV_REST_API_TOKEN` and `ENC_SECRET` are scoped to the branch `fix/email-loop-hardening`.
- Shared defaults scoped to **Production and Preview** also exist, including `KV_URL` and `REDIS_URL`. They point at the production store.
- A new branch does not inherit another branch's overrides. Without its own overrides, `feat/two-bot-handoff-trial`'s Preview gets the shared defaults.
- The preflight requires every store URL variable in the Preview export (`KV_REST_API_URL`, `UPSTASH_REDIS_REST_URL`, `KV_URL`, `REDIS_URL`) to name one single host, and that host must differ from production's. With only the REST pair overridden, the export would still carry the production `KV_URL`/`REDIS_URL` host, and the preflight fails with "ambiguous store". The app reads only the REST pair (`api/index.js:52-53`), but the preflight is strict on purpose.

## Step 3: five branch-scoped Preview variables

For **Preview** only, scoped to the **branch `feat/two-bot-handoff-trial`**, add:

1. `KV_REST_API_URL`: the non-production database already used for the `fix/email-loop-hardening` Preview, or a new free one.
2. `KV_REST_API_TOKEN`: from the same database.
3. `KV_URL`: the same non-production database's `rediss://` URL. Its host is the same as the REST URL's host.
4. `REDIS_URL`: the same value as `KV_URL`.
5. `ENC_SECRET`: freshly generated, for example with `openssl rand -hex 32`. It must not be the production value or the other branch's value.

Notes:
- `KV_REST_API_READ_ONLY_TOKEN` may stay as it is. The app code does not read it, and the preflight does not check it.
- No outbound-capable variable (`RESEND_API_KEY`, `WAKE_*`, `ALTER_MODEL_*`, `CRON_SECRET`, `STRIPE_*`) currently applies to this branch's Preview, so no empty-value overrides are needed. The preflight still checks them, and that check must pass.

Then, on your machine, pull both environments for this branch and run the preflight. Check `vercel env pull --help` for the branch flag first (`--git-branch` in current CLIs). Any export that shows this branch's effective Preview values will do. Keep both files `chmod 600` and outside the repo:

Run this from the repo root, on your machine. The env files live in a private temporary folder outside the repo, and they are deleted even if a step fails:

```bash
D=$(mktemp -d) && chmod 700 "$D" && trap 'rm -rf "$D"' EXIT && umask 077 && vercel env pull --environment=preview --git-branch=feat/two-bot-handoff-trial "$D/preview.env" && vercel env pull --environment=production "$D/production.env" && node scripts/preview-isolation-preflight.cjs --preview "$D/preview.env" --production "$D/production.env"; rm -rf "$D"; trap - EXIT
```

`RESULT: PASS` (hosts only, no secrets) is the evidence I need before pushing.

## After PASS

Steps 5 and 6 above, then the owner self-test in ASSISTANTS.md: sign up a Preview-only owner, connect the two assistants, and run one approve and one deny.
