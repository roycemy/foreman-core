# Live runbook: one real job, one approved email

For the owner to run by hand on a branch Preview, after approving the deploy, the recipient, the sending key and the store. Nothing here has been run live by Claude. Every value in angle brackets is yours to fill in; none is chosen here.

The contract the bot follows is in `docs/AGENT-JOB-LOOP.md`. The offline proof of the same loop is `job-loop-regression.cjs`, `email-send-regression.cjs`, `email-crash-recovery-regression.cjs` and `email-gateway-auth-regression.cjs` (all external sends faked).

## 0. Preconditions (check each before starting)

| Check | How | Pass if |
|---|---|---|
| The Preview runs the commit under test | Vercel dashboard → foreman-core → Deployments → the branch row shows the commit SHA | SHA matches the one you approved |
| Durable store, not memory | `GET <PREVIEW>/api/health` | `"store":"upstash"`. `"memory"` means state is lost between requests: stop. |
| Sender configured | Vercel → Settings → Environment Variables (Preview scope) | `RESEND_API_KEY` (a sending-only key) and `WAKE_EMAIL_FROM` (an address on a domain verified in Resend) are set |
| Recipient approved | same | `ALTER_EMAIL_ALLOWED_TO` contains exactly the recipient you approved, `<RECIPIENT>` |
| Wake ping (optional) | same | `WAKE_INSTINCT_EMAIL` set to your own inbox if you want the Instinct wake ping; unset means no ping |
| Signed in on your phone | open `<PREVIEW>/hq` on the phone | the HQ loads under your account |

## 1. Connect the bot

Use the Connect flow at `<PREVIEW>/connect` and give the bot the setup message it shows. The bot keeps its key; do not paste the key into chat. Pass if HQ shows the bot as Idle or Active (not "Reconnect").

If you run the steps with `curl` instead of a bot, label the result "manual call, not a real bot": it proves the server path, not the bot loop.

## 2. Assign a job

In HQ, create a job assigned to that bot, for example "Email me a one-line status update". Pass if the job shows as assigned. If `WAKE_INSTINCT_EMAIL` is set and the bot is Instinct, one content-free wake email reaches that inbox.

## 3. The bot claims and proposes

The bot calls `GET /api/gateway/tasks/next` (job turns `running`) and then `POST /api/gateway/act` with `action: "email.send"`, the `task_id` and `to: <RECIPIENT>`. Pass if HQ shows an approval card with the full sender, recipient, subject and body and a fingerprint, and the job stays `running`.

## 4. Approve on the phone

Open the card on your phone, read it, approve. Pass if, within a few seconds:
- the request shows `executed` with a Resend id,
- the item leaves "Needs you",
- the job's receipt lists the request, outcome and Resend id,
- the email arrives at `<RECIPIENT>` (check the inbox; Alter reports acceptance, not delivery).

## 5. The bot finishes

The bot polls `GET /api/gateway/requests/<id>`, sees `executed`, then calls `POST /api/gateway/tasks/<task_id>/complete`. Pass if the job shows `done` with the receipt.

## 6. Failure drills (each on a fresh job)

| Drill | Do | Pass if |
|---|---|---|
| Deny | Deny the card | request `denied`, no email, receipt says denied, the bot can finish the job as failed |
| Expiry | Leave a card 15+ minutes | request `expired`, no email |
| Unapproved recipient | Have the bot propose to an address not on the allowlist | refused at proposal (400), no card, no email |
| Revoke | Revoke the bot in HQ, then let it propose | refused (403 `revoked`) |

Do not try to force an unknown outcome or a crash live: those are covered offline and would risk a duplicate email.

## 7. Record the evidence

For each step: the time, the Preview URL and commit SHA, the request id, the Resend id, and a screenshot of the card and the receipt. Mark anything you did not see yourself as not verified.

## 8. Undo

Remove `<RECIPIENT>` from `ALTER_EMAIL_ALLOWED_TO` and revoke the bot in HQ. Deleting the Preview deployment stops it serving. A sent email cannot be recalled.
