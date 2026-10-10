# Owner card and bot budgets

Owner decision: one card per owner. Per-bot budgets and job limits are policy in Alter, not separate cards. This is data/UI groundwork only. No issuing account, money movement or paid integration.

## Records
- OwnerCard: ownerId, workspaceId, issuerCardRef, status, last4, currency. No PAN, CVC or full card data in application records.
- BotBudget: workspaceId, botId, currency, dailyLimitMinor, perActionLimitMinor, status, policyRevision.
- JobLimit: workspaceId, jobId, botId, ceilingMinor, expiresAt, approvalScope, policyRevision.
- SpendRequest: immutable requestId/idempotencyKey, ownerCardRef, botId, jobId, merchant/context, amountMinor, currency, decision, decisionActor, decisionAt, issuerAuthorizationRef.
- Reservation: authorizationRef, reservedMinor, settledMinor, releasedMinor, state. Spend capacity accounts for both settled charges and pending holds.
- LedgerEntry: append-only eventId, requestId, authorizationRef, eventType, amountMinor, currency, timestamp, provenance. Corrections append entries.

## Enforcement
An amount must fit owner funding/card limits, bot limits and applicable job scope. Reserve atomically before approval/authorization to prevent concurrent requests exceeding a budget. Retries reuse the same request ID. Denial, timeout, reversal and expiration release capacity; settlement reconciles the real amount. Currency mismatch, missing bot attribution or uncertain issuer state stops the request. Owner approvals cannot override issuer controls. Issuer response deadlines and approval timing require rail research before implementation.

## UI
Card screen is the owner's single card plus funding/availability, owner-wide totals and per-bot budgets. Each spend request names bot, job, merchant, amount, currency and policy reason. Job detail shows the job limit and remaining capacity. Freeze card and revoke bot are distinct. Keep sandbox and real money visibly separate. The onboarding access card is workspace access, never proof of a funded card.
