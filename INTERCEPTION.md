# Interception broker scope

Built for the existing Grok bots, Instinct and native Muse/Poster through the same authenticated runner/HTTP/MCP request path. It does not replace their native accounts or create paid model workers.

- Bots register a running assigned job, request a fixed named route with a stable sourceId, exact input and maximum cents, and wait for the owner.
- Owner reviews exact input, route, job and maximum at /interception.html. Hash mismatch blocks. Approval rechecks bot revocation, pause, kill switch and active job.
- Approval executes once inside Alter; bots read the result. No key/card/token is returned. Concurrent approvals serialize under the job lock. Denied/blocked outcomes are terminal.
- The executable adapter today is fixture.echo, which echoes text without network/payment calls. xai.chat is a visibly disabled paid adapter, even after approval. No universal interception is claimed.
- MCP: alter_broker_request, alter_broker_check. HTTP: POST /api/gateway/broker/requests; GET /api/gateway/broker/requests/:id. Paired browser console exposes the same controls.

## What remains

Native Muse, Instinct and Grok wallets/credits/tools are outside this broker. A prompt to route through Alter is cooperation, not proof of enforcement. To control all spend on a route the bot must not retain an independent payment credential, and its host must support the executor/connector. No third-party hook into every native purchase was verified. Native model subscriptions are not xAI/Meta API billing.

Paid API adapters need server-owned credentials, explicit owner account/usage authority, provider-specific admission based on verified current prices/token bounds and actual usage reconciliation. A reusable API key release would let bots bypass the gate; never implement that as interception. Browser purchases need a scoped issuer instrument or an integrated checkout executor. Stripe test webhook remains unconfigured and live-disabled, with reconciliation still outstanding.

## Muse identity

Original Oct 8 owner setup calls his existing Muse assistant "Poster"; Oct 14 owner clarified "muse runs in muse." The path is native Muse browser runner, not a new Meta API worker. Public Muse docs describe its computer/browser and native connectors/approval controls, not a universal external transaction interception hook.

Sources read October 14, 2026:
- https://introducing.muse.ai/
- https://muse.ai/business
- https://dev.meta.ai/docs/agent-frameworks (separate model API route, not native credits)
- https://docs.x.ai/developers/rest-api-reference/inference/chat-completions (separate API route)

No paid provider call, purchase, live issuer activation or pairing was performed. Fixture tests prove broker admission mechanics only, not provider-native coverage.
