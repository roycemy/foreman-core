# Alter multi-bot lifecycle bridge

Review-only, not deployed. No model calls, credits, new provider bots or automatic task claims. This is independent of worker/worker.js, which calls a paid provider and must not be used for this transport.

## What works

A small Node 18+ loopback service accepts authenticated lifecycle metadata for any configured existing bot, then forwards it to Alter's existing gateway. One isolated intake token and one gateway credential per bot. Instinct, Grok and Muse labels do not change the protocol. The service does not contain provider-specific credentials or call any provider API.

Server events use a durable ordered queue, stable event IDs and sequences. Failed network delivery retries without changing event IDs. Unauthorized, revoked, blocked or other nonretryable upstream responses halt that bot. Late start/update/presence events halt delivery rather than replaying a false live state. Successful local intake is HTTP 202, meaning queued, not confirmed accepted upstream. Monitor local queue status through the service operator; do not represent intake success as HQ confirmation. Previously accepted typing clears through Alter's 60-second timeout if an End cannot be delivered.

Per-bot queue metadata is stored in a 0600 file. Secrets are read from separate owner-only files and never written to queue state, logs, URLs or source. Loopback intake is not remotely exposed. Do not open this port publicly or put it behind an unauthenticated proxy. A remote event source needs its own authenticated secured transport, not provided by this branch.

## Adapter contract

Each provider needs a genuine supported event source. Import createAdapter from adapter.cjs into the executor or integration that actually composes and sends responses. Pass botId and an intake token obtained from secure local storage. Use:

- start() immediately before actual response composition.
- update() only for actual continued response activity, not from timers or notification reads.
- end() after the response is sent or composition cancelled, including error cleanup.
- presence() only when the real executor is running and can receive/perform authorized work. A source may send its own liveness events during that actual connected period; this bridge schedules no presence events.

Await each call. Retry a network-failed call using the same method before moving on; the adapter retains the pending event. Rejected or stale calls must stop the affected source and alert the operator. Do not infer lifecycle from a paired label or automatically claim tasks. No conversation content is accepted.

The adapter is generic. It is NOT a built-in Instinct/Grok/Muse hook. An always-on service cannot know when these existing assistants are typing without a supported lifecycle signal from each assistant. In the current browser-only workflow that signal is still missing. This branch cannot turn that limitation into an instant integration.

## Installation plan, requires separate approval

1. Confirm existing VPS target and permission to deploy. Inspect its OS, Node, service layout and security first. No infrastructure purchase is needed by this code, but existing capacity and hosting cost are unverified.
2. Confirm exact existing bot IDs and workspace for every configured bot. Never reuse reset/revoked IDs or credentials.
3. Provision each gateway credential securely through the vault and restricted server files. Generate a random per-bot intake credential locally, store securely and provision only to that bot's event-source integration. Do not put secrets in environment dumps, chat, shell history or command-line arguments.
4. Use config.example.json as a nonsecret template, updating exact IDs and file paths. Set credential permissions 0600, state directory 0700, and a dedicated unprivileged service user. Never launch the example unchanged.
5. Review the systemd service, install code under /opt/alter-bridge, and keep intake bound to 127.0.0.1. Node 18+ is required. Deployment and enable/start require approval.
6. Connect one supported source at a time. Test exact identity, Start/End acceptance, correct owner HQ, stop and revocation. Test restart without another pairing and stale detection. No credential is returned to source code or logs.
7. Keep network intake close to actual lifecycle. This improves transport only; HQ currently polls every 4 seconds and is not instant. Use the feed accuracy PR separately. No guaranteed 24/7 uptime is claimed before deployment/monitoring.

## Tests

From repo root: node multi-bot-bridge-regression.cjs. Uses fake local transport, no external requests. Covers per-bot auth isolation, strict metadata-only intake, idempotency, sequence order, secret-free queue, restart retry, revoked bot halt and stale-delivery halt.

## Needed from Royce

- Exact existing bots to include (IDs from current setup links) and owner workspace.
- The intended existing VPS and deployment go-ahead, when ready.
- Gateway credentials via vault only, not chat. Do not collect keys until deployment and supported event sources are chosen.
- A supported lifecycle event source for each bot. Without one, the service can be built and reviewed but will have nothing truthful to send.
