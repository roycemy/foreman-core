# Stripe Issuing authorization adapter (test only)

## What is shipped

A signed `issuing_authorization.request` endpoint at `/api/issuing` returns HTTP 200, a pinned `Stripe-Version: 2025-03-31.basil`, and `{approved: boolean}`. It uses `pending_request.amount`, not the initially-zero authorization amount. All live-mode events decline. Raw bytes and the Stripe-Signature HMAC/timestamp are checked before work. No Stripe payment API is called.

Internal decision budget: 1000 ms, reserving part of Stripe's 2-second response window for transport. Storage timeouts and unknown cards/mandates decline. This does not prove production cold-start/issuer round-trip latency. Configure Stripe timeout/default behavior to DECLINE, and do not enable an approve fallback. Stripe can make decisions without this webhook in some network/issuer cases; monitor created/updated events and request_history, not approved alone.

## One owner card and job attribution

One account/card is bound per owner in test mode. A shared card does not identify the bot or job. The owner must pre-approve one exact pending spend for a running job: USD amount, issuer network merchant id, issuer category, bot, job and job budget. That single-use mandate expires after 10 minutes. There can only be one unexpired mandate on that card. Merchant/webhook metadata never selects the workspace. Unmatched, stale, ambiguous or replayed authorizations decline. Human approval cannot happen inside the issuer window; review first, then retry the purchase.

The issuer-test budget is separate from the gateway ledger and synthetic card budget. Admission consumes the mandate and reserves cents atomically in Redis. Reservations are deliberately never automatically released; unknown outcomes stay reserved. Replays decline even if an earlier delivery was approved. These conservative test semantics can cause false declines. Capture/reversal/partial/incremental reconciliation is NOT shipped; this adapter must NOT be activated live.

## Setup still required

1. Select the user's Stripe account and activate Issuing in a sandbox only. Current docs say sandbox access is instant without sales. Do not activate live mode, accept live agreements, create billable cards or fund a real balance.
2. Configure the test synchronous endpoint to the deployed `/api/issuing` URL. Set decline on timeout and match the pinned API version. The regular webhook must eventually collect authorization.created/updated and transactions for reconciliation; this version does not implement that monitor.
3. Install the endpoint-specific test signing secret as `STRIPE_ISSUING_TEST_WEBHOOK_SECRET` in the deployment's secret environment. Use a secure vault path for credentials, never chat. KV REST storage must be configured; production cannot use memory-only admission.
4. Create a test cardholder/card and fake Issuing balance using Dashboard/test helpers. Test cards cannot purchase externally. Capture the test account/card IDs (non-secrets).
5. Register a test mandate through the authenticated owner API `POST /api/issuer/test/mandate` with same-origin protection:
   `confirmed`, `accountId`, `cardId`, `botId`, `taskId`, `amountCents`, `jobBudgetCents`, `merchantNetworkId`, `category`.
6. Use Stripe's test authorization helper against that card. Verify an approved exact request, blocked budget/merchant/revoke requests, duplicate delivery and configured timeout decline. Inspect Stripe request_history to prove webhook_approved/webhook_declined. Measure full issuer-delivery latency over repeated cold/warm requests before claiming the response window is met.

## Costs and live requirements checked October 14, 2026

Official card docs list US virtual card creation at $0.10 and standard physical cards at $3.50 plus shipping. Stripe's pricing page lists cross-border issuing at 1% + 30 cents; some fee amounts are omitted by its text renderer, so verify the actual account's terms before committing. No billable action was performed. Sandbox funds are fake funds.

Live standard programs require an eligibility review. Current business docs list standard limits: 25 cards/week, $5,000/week spend, $500/card/day, with some use-case single-use/virtual restrictions. Multi-customer programs use Connect accounts with the platform responsible for requirements collection and losses. Connect requirements include legal identity/business address/tax info, representative and relevant beneficial-owner verification, Issuing terms acceptance and capabilities. Company, individual or nonprofit types are documented; a Delaware C-corp is not a blanket technical prerequisite. The exact chosen account/program review decides eligibility. Terms, liability, funding, compliance approval and user spending authority remain gates before live deployment.

## Sources

- https://docs.stripe.com/issuing/controls/real-time-authorizations
- https://docs.stripe.com/issuing/controls/real-time-authorizations/direct-webhook-migration
- https://docs.stripe.com/issuing/for-your-business
- https://docs.stripe.com/issuing/connect
- https://docs.stripe.com/issuing/testing?testing-method=with-code
- https://docs.stripe.com/webhooks/signature
- https://docs.stripe.com/issuing/choose-cards
- https://docs.stripe.com/issuing/cards/virtual
- https://stripe.com/pricing
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function

Lithic is another actual issuer-decision route: ASA allows 6 seconds and recommends 3; it needs a configured program/responder and signed delivery. It is not an easy bypass for eligibility/issuer setup. Stripe is selected only as the test integration here, not a purchased live issuer commitment.
- https://docs.lithic.com/docs/auth-stream-access-asa
