# Bot-link patch: hostile-review failures (reproduce with review/botlink-hostile-review.cjs)

Run from a directory containing the patched source plus this file: `node botlink-hostile-review.cjs`
All five checks currently FAIL. The 25 existing suites pass, so these are gaps the supplied tests miss.

1. **expiredPickup** - pickup issues a key after the 10-minute pairing expiry (hello/approve enforce expiry; pickup does not).
2. **concurrentRevoke** - a real call racing owner revoke overwrites revoked=true; the call's new nextKey keeps working.
3. **pendingApprovalRevoke** - an already-approved reattach pairing picked up after owner revoke restores access.
4. **unknownOperation** - arbitrary op strings return accepted:true with 200; no action/policy validation.
5. **unearnedGovernance** - Governed tier shows earned after echo alone; the new key never routed a real governed request.

Additional non-test blockers:
- Redis SET NX alone does not make multi-write transitions atomic; rotate marker keys have no TTL/cleanup.
- Strict rotate-on-every-call breaks normal response-loss retries; add retry-safe request IDs.
- Bridge halt is wired by hand inside the test only, not across real processes.
- /link/call credentials are not accepted on /api/mcp or the paired runner, so Grok/Instinct transports are unproven; native Muse HTTP executor is unproven.
- UX: browser-only Instinct gets a JSON pickup URL, not a pairing page; Grok message promises JSON steps that are not returned; "Not me, cancel" does not cancel server-side; repair polling never shows the approval screen.
