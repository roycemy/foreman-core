# Agent job loop: the HTTP contract a bot follows

One assigned job, end to end. Every call uses the bot's own gateway key: `Authorization: Bearer <bot key>`. The key comes from Alter's Connect flow and stays in the bot's own secure storage, never in chat. Base URL: the deployment, for example the branch Preview.

| Step | Call | Answers |
|---|---|---|
| 1. Claim | `GET /api/gateway/tasks/next` | `{task}` with `status: "running"`, or `{task: null}`. A bot gets only jobs assigned to it or unassigned ones. Calling again returns the same running job. Concurrent claims give a job to one bot. This call also counts as a check-in. |
| 2. Propose | `POST /api/gateway/act` with `{"action":"email.send","task_id":"<task.id>","params":{"to":"…","subject":"…","text":"…"}}` | `202 {status:"pending", request_id}`. The owner is asked. Retrying the same content for the same job returns the same `request_id` with `duplicate: true` and its current status. `403 job_not_yours` if the job is not running under this bot. `400` if the recipient is not on the owner's allowlist or the email is malformed. |
| 3. Wait | `GET /api/gateway/requests/<request_id>` (poll) | `pending` until the owner decides. Then one of: `executed` (Alter sent it; `delivery.state: "accepted"` and `delivery.providerMessageId`), `denied`, `expired`, `blocked` (revoked, paused, kill switch or changed content), `failed` (rejected by the provider, not sent), `outcome_unknown` (no answer from the provider; Alter did not retry; the owner reconciles). |
| 4. Finish | `POST /api/gateway/tasks/<task.id>/complete` with `{"result":"…"}` or `{"status":"failed","result":"…"}` | `200`. `409 proposal_unresolved` while a proposal on the job is pending, approved, reconciling or `outcome_unknown`: waiting is not done. `403 bot_not_active` if the bot was revoked. |

MCP equivalents on `/api/mcp`, same key: `foreman_next_task`, `foreman_email_send` (with `task_id`), `foreman_check_request`, `foreman_complete_task`.

The bot never sends the email and never holds the provider key. It cannot approve or deny: decisions exist only on owner routes, which require the owner's signed-in session.

## What the owner sees

The approval card shows the full sender, recipient, subject and body, plus the fingerprint and the expiry. After the decision, the job's receipt lists the request, its outcome and, if it was sent, the Resend id. Delivery is not confirmed in-app with a sending-only key.

## Known behavior to account for

Assigning a job to a bot whose provider is Instinct triggers Alter's existing wake ping: a content-free email sent through the same Resend key. It goes only to the owner-configured `WAKE_INSTINCT_EMAIL`; when that is unset there is no ping (no hardcoded fallback). A bot-declared email wake target is mailed only if it is on `ALTER_EMAIL_ALLOWED_TO`; otherwise it is stored as pending and nothing is sent, including no fallback to the env inbox. The ping itself is content-free system mail and does not go through the approval gate. See `wake-trigger-regression.cjs` (cases 19-23) and `job-loop-regression.cjs`.
