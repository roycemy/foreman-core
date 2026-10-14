# Bot link (repair of the Grok patch)

Bot link gives every bot type the same onboarding: pick the bot, copy one message, approve once in Alter, wait for the echo, Connected. The core is in `api/bot-link.js`. The wiring is in `api/index.js`, the owner UI is `public/connect.html`, and `public/pair.html` is the bot-side page for browser-only workers.

`grok-patch/` remains reference material only. This is a rebuild that passes `review/botlink-hostile-review.cjs`.

## What the link key can do (narrowed claim)
- **Where it works:** a link key is accepted only on `POST /api/link/call`. It is refused on `/api/mcp`, on `/api/gateway/*` and by the paired runner. Tests check this.
- **`op: "echo"`:** proves the key works. This earns Connected and nothing else.
- **`op: "act"` with an action:** runs through the existing `gatewayAct` for the bot's Alter agent, with the same policy, receipts and owner approvals as any gateway call. Governed is earned only when policy actually evaluated the action (a receipt or an approval request exists). It resets when the key is re-pasted.
- **Anything else:** returns 400 and the key is not touched.
- **Live:** never shown for bot link. No link transport carries real lifecycle events today.
- **Agent IDs:** a bot is linked to an Alter agent. The owner can pick an existing agent (`agentId`, one link per agent) or Alter creates one. A new linked agent gets no hidden gateway key.

## State machine and atomicity
- **One record per change:** every transition is one compare-and-set on one record (the pairing or the bot), using `BOTLINK_CAS` (AGENT_CAS with `KEEPTTL`).
- **Pairing:** `waiting -> claimed -> approved -> collected`, plus the terminal states `killed`, `cancelled`, `expired` and `invalidated`.
  - Expiry is computed on every read, so hello, approve, steps and pickup all enforce it.
  - A second caller kills the pairing; the first caller does not win.
  - The owner's "Not me, cancel" cancels the pairing on the server.
- **Bot record:**
  - Each call rotates the key and renews the 30-day idle expiry, never past the 90-day cap.
  - A presented key that is neither current nor a valid retry means two holders, so the bot drops to Needs re-paste.
  - A key retired by a re-paste just gets 401.
- **Retry-safe rotation:** the bot may resend the same request, with the previous key and the same `requestId`, within 2 minutes if the successor key was never used.
  - Alter returns the cached result with a fresh successor and never runs the action twice. The lost successor dies.
  - A retry while the first call is still running gets 409, so the key is not killed.
- **Revoke:** the linked agent is revoked first (in-flight actions then fail policy) and pending broker requests are blocked. Then one CAS clears the key and bumps the bot's epoch.
  - Pickups, rotations and pairings created before the revoke cannot commit afterwards.
  - Revoke is terminal for that bot record and affects only that bot.
- **TTLs:** nonces, key indexes and pairing records all carry TTLs. Only registry keys (`bl:bot`, `bl:bots`, `bl:count`, `bl:agentBot`) persist.
- **Bridge:** a separate bridge process halts a revoked bot because Alter's real HTTP responses reject its gateway key (`upstream_rejected` while running, `identity_rejected` after a restart). `Bridge.halt()` remains for local operator use.

## Tests
- `review/botlink-hostile-review.cjs`: the 5 reviewer checks.
- `botlink-hostile-regression.cjs`: 22 more hostile checks covering retries, races, cancel, TTLs, Governed and external revoke.
- `botlink-gateway-e2e-regression.cjs`: the real handler end to end, including the separate-bridge halt.
- The rest of `botlink-*-regression.cjs`: acceptance tests 1-5 and the adapter.

## Unproven
- **Real clients:** no real Muse, Grok or Instinct client has followed the message. The fingerprint headers have not been checked on Vercel.
- **Production Redis:** concurrency against Upstash is untested. Atomicity relies on `EVAL` with `SET ... KEEPTTL` and `SET NX PX`; tests use an in-memory store with the same contract.
- **Retry edge case:** a retry also needs the first response's result to have been recorded. A crash between the rotation and recording the result forces a re-paste.
- **Client key storage:** the bot-side page keeps the rotating key in `sessionStorage` for that tab only.
- **HQ updates:** HQ is a 4s poll, not push. In HQ, a Quiet bot shows as Waiting and Needs re-paste shows as Reconnect needed.
- **Policy numbers:** the 90-day cap, 6h Connected window, 10-minute pairing and 2-minute retry window are the owner's decision.
