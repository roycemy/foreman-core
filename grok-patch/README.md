# Alter multi-bot link: changed files

Built locally from the owner's source pack (foreman-core: main d67990f plus draft PR44, PR46 and PR47 combined, as described in GROK-START-HERE.txt).
Nothing was pushed, merged or deployed, and nothing was spent. Only obviously fake values (`test_...`, `@example.test`) are used. The full diff is in `changes.patch`.

## What changed
- **api/bot-link.js (new):** one core for every bot type.
  - **Adapter interface:** `adapter(type)` gives connect/verify/call/reconnect/revoke/status over three transports: MCP (Grok), HTTP gateway key (Muse) and paired runner (Instinct). Adding a bot type is one `BOT_TYPES` entry, and the UI renders from `/api/botlink/types`.
  - **Pairing:** the pairing link holds no secret and lasts 10 minutes. The bot says hello with a single-use nonce and a hash of a caller secret it keeps. If a second caller uses the link, the pairing is killed and the owner is alerted; the first caller does not win. The owner approves once on a screen showing bot type, account and caller fingerprint (transport, user agent, region). The bot then polls `GET /api/pair/:id` with `Authorization: Pairing <callerSecret>` and collects its key exactly once.
  - **Keys:** stored only as SHA-256 hashes. Every real call rotates the key, renews 30-day idle expiry and can never pass the 90-day absolute cap. Reusing a rotated key drops the bot to Needs re-paste (`key_reuse_detected`) and alerts the owner.
  - **Status is a pure read:** Connected (real call within 6h), Quiet ("does not mean the bot is offline") or Needs re-paste, plus "last spoke X ago". `presence` and `typing` are always null.
  - **Tiers:** Connected / Governed / Live. Live is "Not possible" for Muse and Instinct; for Grok it is "only with real events".
  - **Re-paste:** reuses the same record. It needs the old key or the owner naming the existing bot. The old key is revoked the moment the new one is issued, and a new workerId means one live worker per record. A Grok account can add several bots (Grok, Grok #2).
  - **Revoke:** affects that bot only. A hook marks its Alter agent revoked and blocks its pending broker approvals.
- **api/index.js:** wiring only.
  - Bot routes: `POST/GET /api/pair/:id` (requires a live pairing ID plus the caller secret) and `POST /api/link/call` (requires a bot key).
  - Owner routes `/api/botlink/*`: existing HttpOnly session plus a per-session CSRF token and an Origin check on every write.
  - `rejectPendingBrokerFor(agentId)`.
  - No existing route changed. owner-conversation and MCP foreman_owner_conversation are untouched.
- **worker/live-bridge/bridge.cjs:** `halt(id, reason)` stops one bot's retry queue and drops its held events, so stale events are never replayed as live.
- **public/connect.html (new), vercel.json (`/connect` rewrite):** one phone-first flow: pick bot, copy message, approve, wait for echo, Connected, bot drawer, Needs re-paste with one-tap copy. The page has no per-bot code and no presence or typing UI.
- **Tests (new):**
  - `botlink-leaked-paste`, `botlink-stolen-key`, `botlink-quiet-decay`, `botlink-reattach`: acceptance tests 1, 2, 4 and 5, plus expiry, idempotent re-paste and no events without a real signal.
  - `botlink-gateway-e2e`: the Muse HTTP path end to end through the real handler, plus acceptance test 3 for revoke isolation (broker and bridge).
  - `botlink-adapter-regression.cjs`.
  - `botlink-helpers.cjs`: shared fixtures; not a suite.

## Test results
- **Before:** 19 suites (`*-regression.cjs`), 19 passed. The owner's brief said 17; the pack actually has 19.
- **After:** 25 suites, 25 passed (19 existing plus 6 new).
- **Mutation checks:** I broke three fixes on purpose (made pairing first-wins, removed the cap, kept the old key on reissue). The matching test failed each time, so the tests catch those regressions.
- **Not run:** `e2e.js` and `e2e9.js` need a live deployed URL.

## Proven vs unproven per bot
Everything below marked "proven" was run in-process against the memory store. Nothing was run against production Redis or a real bot.
- **Muse (HTTP key):**
  - Proven: pair, approve, collect-once, echo, Connected over HTTP through the real handler; revoke isolation; no Live tier.
  - Unproven: a real Meta Muse following the message (whether it can generate a nonce and secret and poll), real fingerprint headers on Vercel.
- **Grok (MCP):**
  - Proven: the shared core, and several bots per account.
  - Unproven: the link key is not yet accepted on `/api/mcp`. Grok currently uses `/api/link/call` over HTTP. Wiring the MCP transport into `resolveAgent` is still to do. Live still depends only on the existing real foreman_owner_conversation events; it is not linked to bot-link status yet.
  - Not run: a real Grok.
- **Instinct (runner):**
  - Proven: one worker per record, and re-paste replacing the key.
  - Unproven: the runner transport is not yet bridged to the PR44 runner cookie session (the 30-day code-free reopen is unchanged). Instinct uses `/api/link/call`. Not run in a real browser worker.
- **All bots:**
  - Rotation and claims rely on Redis `SET NX`. They were not tested against Upstash under real concurrency.
  - Strict rotate-on-every-call means a lost response (network drop) forces a re-paste. A grace window may be wanted.
  - In-memory `events` is a test hook only; it is not durable.

## Remaining asks for the owner
1. Review this patch and decide whether to open a draft PR. Nothing was pushed.
2. Vault and env: no new secrets are needed. Production needs the existing `KV_REST_API_URL`/`KV_REST_API_TOKEN`, set in Vercel and never in code. If a bridge VPS is used, it needs per-bot gateway and intake key files with owner-only permissions.
3. Decide the policy numbers: 90-day cap, 6h Connected window, 10-minute pairing, and strict vs grace rotation.
4. Give an explicit deploy go-ahead before anything reaches main, which auto-deploys.
5. Test against a real Muse, Grok and Instinct before claiming any of them is proven.
