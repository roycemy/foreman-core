# Preview gate for `feat/two-bot-handoff-trial`

**Status: remote delivery BLOCKED.** The branch is not pushed and no pull request exists. A push can start a Vercel Preview build, and it is not established that this branch's Preview would use a non-production database.

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

**Environment precedence (from your observation; I have no Vercel access):**
- The Preview-only `KV_REST_API_URL`, `KV_REST_API_TOKEN` and `ENC_SECRET` are scoped to the branch `fix/email-loop-hardening`.
- Shared Production-and-Preview defaults also exist.
- A new branch does not inherit another branch's overrides. Unless you add overrides for `feat/two-bot-handoff-trial`, its Preview would get the shared defaults, and those are assumed to point at production.

## The one missing step (owner action in Vercel)

For **Preview** only, scoped to the **branch `feat/two-bot-handoff-trial`**, add:

1. `KV_REST_API_URL` and `KV_REST_API_TOKEN`: the same non-production database already used for `fix/email-loop-hardening`'s Preview, or a new free one.
2. `ENC_SECRET`: a freshly generated value, not the production one.
3. No `RESEND_API_KEY`, `WAKE_*`, `ALTER_MODEL_*`, `CRON_SECRET` or `STRIPE_*` for this branch. If shared defaults supply any of them, override them with empty values for this branch, or tell me which must stay.

Then, on your machine, pull both environments for this branch and run the preflight. The `--git-branch` flag is from the Vercel CLI docs as I know them and is not verified here; any export that shows this branch's effective Preview values will do:

```bash
vercel env pull --environment=preview --git-branch=feat/two-bot-handoff-trial preview.env
```

```bash
vercel env pull --environment=production production.env
```

```bash
node scripts/preview-isolation-preflight.cjs --preview preview.env --production production.env
```

```bash
rm preview.env production.env
```

`RESULT: PASS` (hosts only, no secrets) is the evidence I need before pushing.

## After PASS

1. I push the branch and open a **draft** pull request, which is never merged.
2. Confirm the Preview deployment's commit equals the branch head, and `GET /api/health` shows `store: "upstash"`.
3. Sign up a Preview-only owner.
4. Connect the two assistants (ASSISTANTS.md).
5. Run the trial. You approve or deny it yourself, on your phone or desktop.
6. Run one deny trial as well.
