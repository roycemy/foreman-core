# Foreman core (v8)
Real permission gateway for AI agents. Agents never hold credentials; they call `POST /api/gateway/act` with a Foreman key.
Foreman checks status (revoked/kill), AUTO/ASK/NEVER, per-action and daily limits, executes the action itself, and writes a hash-chained receipt.
ASK actions are paused server-side until the owner approves (`POST /api/requests/:id/approve`).
`node e2e.js <base-url>` runs the full proof against a deployment.
