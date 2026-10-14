# Saved pair and executor availability

The production runner already pairs into an HttpOnly, Secure, SameSite=Strict cookie scoped to the exact bot's runner API. The full gateway credential is encrypted in server storage, not returned to the browser. Reloading the saved browser profile restores without a code. Production's current idle lifetime is a fixed 30 days.

This branch adds a rolling 30-day idle lifetime renewed on an authenticated session restore. It keeps the token and CSRF stable for simultaneous tabs. Every restore checks the bot, authorization epoch, current gateway key and expiry. Owner revoke, workspace reset, key rotation, explicit disconnect or 30 idle days prevents restore. Invalid origins and cross-site restores cannot renew it.

Session inspection reports saved authorization separately from recent executor presence. No session restore writes presence, task activity or owner conversation events. The existing 60-second stale detection remains intact. Runner copy shows this distinction and confirms restored expiry.

## What this does not promise

A saved pair can survive around the clock without an open page until its idle expiry. It is not an always-on executor. This browser console sends presence only while open and visible. It does not run the existing Instinct assistant while that assistant is unavailable, intercept native tools, claim tasks automatically, or spend provider credits.

Real 24/7 execution needs a continuously running executor in the existing assistant's environment, with an authorized supported event/transport integration. Alter cannot install one inside a provider that exposes no such connection. A server timer sending heartbeat messages would be false availability and is intentionally not implemented. Reconnect to saved authorization does not require such a timer.

## Validation

Run node runner-durable-regression.cjs and node runner-session-regression.cjs. Coverage: rolling renewal, cookie scope, stable CSRF, encrypted server credential, absent fake presence, stale detection, origin/cross-site rejection, exact bot and key binding, revoke/reset, idle expiry and disconnect. All existing regression suites must also pass.

No live tokens or owner policies were changed while developing this branch. Not deployed.
