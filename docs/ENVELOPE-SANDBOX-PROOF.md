# Envelope sandbox proof

Runs the spend envelope against a **real Stripe Issuing sandbox** instead of fixtures. Stripe's own test helpers create authorizations, captures, reversals and expiries; Stripe sends the signed webhooks to the deployed `/api/issuing`; the script then reads the envelope back through the owner's `/api/money` view and compares it with what the accounting model says should have happened.

`issuer-regression.cjs` and `spend-envelope-regression.cjs` prove the logic is self-consistent. This proves (or disproves) that the logic matches what Stripe actually sends. Field names in `issuer-webhook.cjs` are documented as "not verified against live deliveries"; this is the verification.

Test mode only. The script refuses any Stripe key that is not `sk_test_`/`rk_test_`, never calls live endpoints, and never moves real money. It creates and then revokes one $40 envelope in the owner workspace of the deployment you point it at.

## One-time setup (you do this; no secret goes in chat)

Follow `ISSUING-TEST.md` steps 1-4 for the sandbox, then:

1. Deploy a **preview** (not production) of the branch with these environment variables set in Vercel:
   - `ALTER_SPEND_ENVELOPES=1`
   - `STRIPE_ISSUING_TEST_WEBHOOK_SECRET` (the `whsec_` of the endpoint below)
   - `STRIPE_ISSUING_TEST_READ_KEY` (a test-mode read-only key; only used by reconcile)
   - Upstash/Vercel KV REST variables (the envelope path refuses memory-only storage)
2. In the Stripe sandbox Dashboard, add a webhook endpoint at `https://<preview-host>/api/issuing` subscribed to `issuing_authorization.request`, `issuing_authorization.created`, `issuing_authorization.updated`, `issuing_transaction.created`. Use the `Stripe-Version` `2025-03-31.basil`. Set the timeout behaviour to **decline**.
3. Sign in to the preview as the owner in a browser, then copy the `fm_sess` cookie value (DevTools > Application > Cookies). That is `ALTER_SESSION_TOKEN`. Treat it like a password; it expires on its own and you can sign out to kill it.
4. Make sure the workspace has at least one active bot.

## Run

In a shell where the three secrets are set from your own password manager (not typed into a chat, not committed):

```bash
export STRIPE_TEST_SECRET_KEY=...   # sk_test_... or rk_test_...
export ALTER_BASE_URL=https://<preview-host>
export ALTER_SESSION_TOKEN=...      # the fm_sess cookie value

node scripts/envelope-sandbox-proof.cjs setup          # creates a test cardholder + virtual card, prints their ids
export PROOF_CARD_ID=ic_...                              # from the line above
node scripts/envelope-sandbox-proof.cjs run            # prints the target and stops
node scripts/envelope-sandbox-proof.cjs run --yes      # runs it
```

Optional: `PROOF_ACCOUNT_ID` (defaults to the account behind the key), `PROOF_BOT_ID`, `PROOF_OUT` (default `./proof-output/`, git-ignored).

Exit code 0 = every automated step passed, 1 = at least one failed, 2 = could not start. The report (`.md` and `.json`) holds ids, amounts, timings and observed event shapes only; credentials are redacted before writing.

If a capture fails with a balance error, add test funds to the sandbox Issuing balance in the Dashboard and re-run.

## What each step checks

| Step | Claim | Passes when |
|---|---|---|
| P0 | Environment is what we think | endpoint reports `stripe_test_only`, owner session valid, flag on, a bot is eligible |
| E1 | Owner can propose and approve | envelope approved and active for the card |
| A1 | In-envelope $10 is approved at the webhook, then confirmed by the `created` event | Stripe `request_history` says `webhook_approved`; tuple goes to `[unresolved 0, reserved 1000, settled 0, available 3000]` |
| O1 | Real event shapes | observation only, but **fails** if `event.account` is absent (see below) |
| A2 | $35 with $30 available is declined | `webhook_declined`, reason `insufficient_available`, nothing moves |
| A3 | Different merchant is declined | `webhook_declined`, reason `envelope_mismatch`, nothing moves |
| C1 | $4 partial capture that closes the authorization, in either event order | settled 400, the other 600 released, no discrepancy (a reordered capture is noted as ORDERING (handled)) |
| V1 | Reversal | held cents return to available |
| X1 | Expiry | held cents return to available |
| R1 | Refund | observation only; how Stripe links a refund to an authorization is unverified |
| T1 | Envelope vs provider | envelope settled cents equal Stripe net captured cents (captures minus refunds) across every authorization the run created |
| P1 | `stripeReader` against real objects | open, voided, expired and closed map correctly; captured cents match |
| K1 | Revoked envelope | next authorization declined at card use |
| L1 | Webhook round trip under 2s | max over every call; includes test-helper overhead, so it is an upper bound |

The tuple is `[unresolved, reserved, settled, available]` in cents, the same one `issuer-regression.cjs` asserts.

## The two findings from the first offline pass

### 1. `event.account` (open: needs a sandbox run; no code changed)

What the code does: `issuerEnvelopeTarget()` and `issuerEnvelopeForEvent()` return nothing unless `event.account` matches `/^acct_/`, and the mapping key is `<account>:<card>`. An event with no `account` never finds an envelope, so the authorization is declined.

Documented by Stripe (read 2026-11-05):
- The Event object's `account` is "the connected account that originates the event". https://docs.stripe.com/api/events/object
- "Each event for a connected account contains a top-level `account` property." https://docs.stripe.com/connect/webhooks
- Endpoints have a scope: "Your account" (own resources) or "Connected accounts" (resources in connected accounts). https://docs.stripe.com/connect/webhooks
- Issuing on Connect: cards and cardholders belong to connected accounts, and the platform acts on their behalf. https://docs.stripe.com/issuing/connect
- Sandboxes need their own webhook endpoints. https://docs.stripe.com/connect/webhooks

Not stated anywhere I could read, so it still needs a sandbox run:
- That events for your **own** (direct) account omit `account`. The Event page marks the field nullable but does not say when it is null, and its example has no `account` key. The inference is reasonable, not documented.
- Whether `issuing_authorization.*` and `issuing_transaction.created` carry `account` for a direct account, and which endpoint scope receives them for a connected account's card. None of the Issuing pages says. https://docs.stripe.com/issuing/controls/real-time-authorizations, https://docs.stripe.com/issuing/connect
- Whether the `card` field in event payloads is an expanded object or a string. The code accepts either.

How to settle it: step O1 lists the latest real events and records `accountFieldPresent`. If it is false, A1 fails with a named cause and the rest skip.

Proposed fix, NOT applied (decide after O1 shows which case you are in):
- If `account` is present (connected-account card, "Connected accounts" endpoint): no code change. Set up Connect as described in the setup section.
- If `account` is absent (direct account): when `event.account` is missing, use one configured account id (a new server-side setting such as `STRIPE_ISSUING_TEST_ACCOUNT_ID`, never read from the payload) in `issuerEnvelopeTarget`, `issuerEnvelopeForEvent` and the webhook's `decide`. The account stays part of the binding hash, the mapping key and the owner registry; the signed endpoint secret and the unique `ic_` card id are what tie the event to its owner. About 10 lines plus a regression for "absent account uses the configured account, and an unconfigured server still declines".

### 2. Closed-before-capture ordering (fixed)

Stripe says events are not delivered in the order they are generated (https://docs.stripe.com/webhooks), and a capture closes the authorization and creates a transaction (https://docs.stripe.com/issuing/purchases/authorizations), so `issuing_authorization.updated` (closed) can arrive before `issuing_transaction.created` (capture). Before the fix the capture was recorded as `discrepancy:capture_after_closed` and the owner was notified. Totals were always correct.

Now, and only now, a capture after a close is an expected reordering (history kind `capture_after_close_reordered`, no discrepancy, no notice) when all of these hold: the authorization was **approved** and its own status is **closed** (not reversed, not expired, not declined); nothing had been captured before the close; the capture arrives within three days of the close (the live-mode retry horizon, https://docs.stripe.com/webhooks); and the captured cents, summed over late captures, do not exceed the cents the close released. Anything else after a close is still a discrepancy with an owner notice. Regressions: `spend-envelope-regression.cjs` (OC1-OC9) and `issuer-regression.cjs` (signed webhook, both orders, owner feed).

Still unknown until a sandbox run: whether real Stripe emits the closed update with an approved status in the shapes the code expects, and whether Stripe ever lets a capture follow an expiry (its docs say an expired authorization keeps "any remaining amount authorized for possible late captures"). That case is deliberately left as a discrepancy.


## What this does not prove

- Duplicate delivery, webhook timeout, secret rotation and the 7-day reconcile are listed as manual checks at the bottom of every report; the script cannot trigger them.
- Production Redis concurrency under parallel authorizations.
- Latency from a real card network. Test-helper calls are a lower-fidelity stand-in.
- Anything in live mode. Live issuing needs eligibility review, terms and funding first (`ISSUING-TEST.md`).

## After the run

Treat every FAIL and every ORDERING/observation note as a finding. Fix the code or the expectation, add the real event shape to `issuer-regression.cjs` as a fixture so it stays proven offline, and re-run.
