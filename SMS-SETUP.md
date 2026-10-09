# SMS gateway approvals

Live delivery is OFF unless BLACKBOX_SMS_LIVE is exactly true. Do not enable until the account owner approves current charges and the chosen sender is compliant and approved. This does not add merchant payments.

Server-only configuration:
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN (never in client code, chat, source control or logs)
- TWILIO_SMS_FROM (verified sender in E.164)
- BLACKBOX_PUBLIC_ORIGIN (exact canonical HTTPS origin without trailing slash)
- BLACKBOX_SMS_LIVE (default unset/off)

Twilio inbound webhook: POST <canonical origin>/api/sms/inbound
Twilio status webhook: POST <canonical origin>/api/sms/status
Do not append query strings or change webhook URLs without updating canonical origin. Signature verification uses Twilio SDK and every form parameter. Empty TwiML responses send no reply SMS.

Owner signs into HQ, opens SMS approvals, enters their own number and confirms consent. Texting the displayed START token proves possession and binds that number to that workspace. An enrolled number cannot be bound to another workspace. Re-enrollment invalidates older decision codes. STOP disables alert delivery and old replies. Twilio's own STOP/START opt-out control must also be respected; app re-enrollment does not override carrier/provider blocks.

Existing ASK gateway requests may be texted when live delivery and enrollment are ready. Replies require YES <code> or NO <code> from the bound number to the configured sender. No bare yes/no: SMS has no trustworthy reply-to identity. Codes expire in 15 minutes. Full action parameters and ledger cost bind to the code. Changed/revoked/expired requests cannot execute. Sensitive, non-ASCII, long or confusing decision content stays in-app. Gateway ledger cents are not a merchant charge.

No automatic outbound retry after ambiguous provider acceptance. Status callbacks track delivered/failed separately from queued. An HTTP acceptance does not prove delivery. Setup/UI tests are synthetic. Real delivery and real client continuation must be verified before calling this live.

The server executes the approved gateway action once, stores its receipt/result and emits its normal event. A bot must read its request result and continue itself. This does not force external bot apps to wake or implement their client polling. Do not retry the action after approval. Hosted or external long-running clients need a separate real-client continuation acceptance test.

Local regression: node sms-regression.cjs
Existing heartbeat, OAuth, room, reconnect and spend tests must remain passing. Local SMS tests mock Twilio: zero texts, zero charges. Preview environments must have BLACKBOX_SMS_LIVE unset.

Operational limits: existing shared KV is required for production durability. An unknown dispatch is not automatically retried; unresolved alerts remain reviewable in-app. Long-term delivery tooling, reconciliation/retry UI, help-message customization, real carrier STOP behavior and bot continuation need operational testing. SMS possession is not phishing-resistant MFA; phone compromise/SIM swap remains a risk.
