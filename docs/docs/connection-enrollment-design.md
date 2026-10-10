# One-paste connection: design for review

Status: proposed, not built. Current runner-first copy is a safer interim flow, not the final one-paste flow.

## Target
The owner copies one non-secret setup message. The assistant opens the exact production runner. The owner sees the enrollment request in Alter and approves that identity. The runner receives a session without a key or code being copied into chat. A connection is confirmed only after the server accepts presence. No promise that every assistant supports a browser or background execution.

## Enrollment
- Create an expiring enrollment handle scoped to workspace, bot, authorization epoch and intended runner origin. The handle is an identifier, not permission to obtain a credential.
- Runner generates its own random challenge and registers a pending request. No credentials from GET requests, page previews, link unfurls or scanners.
- Owner approves the exact bot and request in authenticated Alter. Showing a recognizable challenge prevents approving the wrong browser. This owner approval is the remaining interaction; claiming literally zero owner interaction would be inaccurate.
- Bind approval to that runner's short-lived HttpOnly, Secure, SameSite cookie. Redeem once with CSRF/origin protection and atomic consume. Do not place credentials in URLs, chat, source code or browser storage accessible to scripts.
- Use a separate runner origin/session scope from owner authentication. A runner cannot become the owner or enroll another bot.
- Approved enrollment does not replace an existing bot key silently. Require an explicit reconnect/replace action and show its consequence.

## Persistence
Use a revocable server-side bot session behind an HttpOnly cookie, with rotating short-lived access and refresh state. Browser profile persistence determines whether reopening can resume. Providers without retained browser sessions need secure connector storage or re-enrollment. Do not store bearer keys in localStorage. This is persistent authorization, not guaranteed perpetual availability.

## Limits and attacks
Forwarded setup messages expose only an enrollment identifier. An attacker cannot redeem before owner approval; pending requests must show enough detail to reject an unfamiliar request. Rate-limit enumeration and pending requests. Expire challenges quickly. Atomically reject replays, epoch changes, removed bots, revoked sessions and workspace resets. Logs redact handles/session material. No automatic retries on revoked access.

## Acceptance before shipping
Tests: replay/concurrent consume, wrong bot/workspace/origin, stale epoch, scanner GET, CSRF, revoke/reset, two pending browsers, refresh reuse and recovery. Live provider tests: Instinct, Studio, Grok, Muse and a browser-capable unknown provider. Verify privacy settings, browser-session retention, owner consent and disappearance of stale Connected labels. Only then remove the current manual pairing step or claim one paste is delivered.
