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
| C1 | $4 partial capture that closes the authorization | settled 400, the other 600 released |
| V1 | Reversal | held cents return to available |
| X1 | Expiry | held cents return to available |
| R1 | Refund | observation only; how Stripe links a refund to an authorization is unverified |
| P1 | `stripeReader` against real objects | open, voided, expired and closed map correctly; captured cents match |
| K1 | Revoked envelope | next authorization declined at card use |
| L1 | Webhook round trip under 2s | max over every call; includes test-helper overhead, so it is an upper bound |

The tuple is `[unresolved, reserved, settled, available]` in cents, the same one `issuer-regression.cjs` asserts.

## Things the offline self-test already says to look for

`envelope-sandbox-proof-regression.cjs` drives this same script against the real `issuer-webhook.cjs` and `api/index.js` with a fake Stripe. Two findings come from the code itself, independent of Stripe:

1. **Direct account vs Connect.** `issuerEnvelopeTarget()` and `issuerEnvelopeForEvent()` require `event.account` to match `/^acct_/`. Stripe puts `account` on events for connected accounts; as far as I understand Stripe's event model (not yet verified against your sandbox), events for your own platform account do not carry it. If so, every authorization on a direct-account card is declined with no envelope found, and the envelope can never be used. The fake with `account` removed fails exactly this way: A1 fails, O1 names the cause, later steps skip. O1 reads the real events and tells you which case you are in. If it fails, the fix is a design decision (use a Connect connected account for the card, or fall back to the account id configured at propose time when `event.account` is absent), not something to patch blind.
2. **Event ordering.** Stripe does not promise `issuing_authorization.updated` (closed) arrives after `issuing_transaction.created` (capture). If "closed" lands first, the remaining reserved cents are released, then the capture arrives at a closed authorization and is recorded as `discrepancy:capture_after_closed`. Totals come out right, but the owner is shown a spurious discrepancy notice. C1 reports `ORDERING` in its note if this happens against the real Stripe.

## What this does not prove

- Duplicate delivery, webhook timeout, secret rotation and the 7-day reconcile are listed as manual checks at the bottom of every report; the script cannot trigger them.
- Production Redis concurrency under parallel authorizations.
- Latency from a real card network. Test-helper calls are a lower-fidelity stand-in.
- Anything in live mode. Live issuing needs eligibility review, terms and funding first (`ISSUING-TEST.md`).

## After the run

Treat every FAIL and every ORDERING/observation note as a finding. Fix the code or the expectation, add the real event shape to `issuer-regression.cjs` as a fixture so it stays proven offline, and re-run.
