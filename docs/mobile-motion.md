# Mobile HQ and observed motion

The phone opens on approvals, jobs and team status. The floor remains an optional view. The public landing labels its static workspace and approval as examples.

## State and motion coverage

- Sleep nook: never connected, reconnect required or missed declared check-ins. Tap opens connection setup.
- First connection: stretch once on an observed first handshake, then walk to the current target. `firstSeenAt` prevents reconnection being presented as a new bot.
- Idle: lounge beanbags. Muse dozes without a running job.
- Work: desk with an indeterminate running ring. Hands move only after a real progress/tool event, for two seconds.
- New queued job: paper drop. Routed job: paper slide. Claimed job: paper pickup.
- Tool event: walk to a mapped tool station, gather and carry back. Mail goes to the meeting/mail room, spend to finance, research to workshop tools.
- Completed job: receipt print, carry to tray, receipt flight and new badge. Failed/stopped job: shrug and failure mark.
- Handoff: walk to the table and pass folder. Meeting card carries the job title while the child is queued. Parent with open child shows a clock.
- Approval: raised hand, lock and one Inbox pulse. Approved swaps to unlocked. Denied shows blocked stamp.
- Sandbox spend: card tap and remaining job-budget bar from actual grant values. Limit block: red bar and stop mark. No real-money claims.
- Owner interaction: only the observed bot looks up; wake test and heartbeat records do not count as a conversation.
- Other bots' real events: idle bots glance once.
- Owner revocation: leave. Provider/unknown access loss sleeps instead. Removed bots fade from their last position.

## Rules

First snapshot draws current state without replaying history. Events are deduped. Each bot keeps at most one pending gesture. Reduced motion skips choreography and keeps the state/label. No idle typing, breathing, steam, LEDs or drifting connector loops. The running ring and walking legs only run during their actual state.

## Verification

Local fixtures only, no real pairing or approvals. Check 390px phone, 820px tablet and 1440px desktop. Regression covers baseline, diff, repeated snapshot and reduced motion. Live authenticated job verification may be unavailable when the Redis account quota is exhausted; static deployment success does not imply database recovery.
