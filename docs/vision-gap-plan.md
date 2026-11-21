# Alter vision gap plan

**What this is:** the gap between the Alter master vision and the code as it stands, plus an ordered plan to close it. It is a plan only. No product code was changed to produce it.

**Spec:** "Alter - Master Vision (Working Draft)", drafted 2026-11-05. That is a direction document, not an approved spec and not an execution grant.

**Code baseline:**
- Branch `fix/email-loop-hardening` at `9cad1e6`, local and unpushed.
- It contains all of `origin/main` (`8fd2dd7`) plus 41 commits: 21 published on its branch chain and 20 local.
- `origin/main` is not ahead of it in any area.
- Line numbers below refer to `9cad1e6`.

**Evidence method:**
- A read-only Explore agent mapped the code with `path:line` citations, and a second one inventoried the unmerged branches.
- I re-checked every Done claim and every defect below against the code myself. The suite at `9cad1e6` passes 95 of 95 offline. All tests run against the in-memory store, never real Redis or real providers, so they are offline proof, not integration proof.

**Date:** 2026-11-11.

**Status update (after this document was first written):**
- **D1 and D2 are fixed locally, unpushed.**
  - D1 (the cron route crash) is commit `92aa662`, a one-line fix plus `cron-route-regression.cjs`. It applies cleanly to `origin/main` on its own, passes there, and the same test fails on `main` without it.
  - D2 (the missing Origin checks) is commit `67dbfeb`, with `owner-origin-regression.cjs`.
  - This closes tasks T0.1 and T0.2. The branch is now at `67dbfeb` and the suite is 97 of 97.
- **Q10 and Q11: owner decision pending.** They are open product decisions (D4 and D3, task T0.3), kept separate from the cron repair. A proposal for each is implemented locally and unpushed, and is NOT approved:
  - **Q10 proposal (`28f8d7b`):** the kill switch blocks new work and actions, including starting the next part of a plan and waking a bot, but still accepts completion, failure and event reports so running jobs can wind down. Pinned by `kill-switch-wind-down-regression.cjs`.
  - **Q11 proposal (`0873aa2`):** restoring a revoked bot removes its old gateway key and answers `needsNewKey: true`, so the owner must issue a new key. The same commit fixes the in-memory store's multi-key `DEL`. Pinned by `restore-new-key-regression.cjs`.
  - The options and consequences are in `docs/release-gate/APPROVAL-PACKET.md`. If the owner chooses otherwise, the commit is reverted with a new revert commit before any push, not by rewriting history.
- **Cron hotfix scope (open, Royce holding the push).** Reading `bizDailyTick` shows fixing the crash activates a feature that has never run in production:
  - It runs once per day per active responsibility, in workspaces listed in `gl:biz:workspaces`, but only where `ALTER_MODEL_KEY` is set and the workspace is in the `ALTER_MODEL_WS` allowlist (api/index.js:2112-2118). Unset or unlisted means a skip, with no provider call.
  - It produces drafts only (`bizRun`, :2291-2314): nothing is sent or posted.
  - Each run sends the responsibility's title, summary and boundary plus every owner source, up to 4,000 characters each, to the configured provider (default api.groq.com). `SRC_PROMPT_CHARS` (16,000) is defined but never applied, so a run can carry up to 40 sources, about 160,000 characters.
  - The cost caps are 200 provider calls per workspace per day (:2124) and one daily run per responsibility per 20 hours. No dollar cost was calculated; provider pricing is unverified.
  - There is no per-owner consent gate in this code. The only gate is the operator's `ALTER_MODEL_WS` allowlist. A consent gate exists on the unmerged `feat/privacy-repair` branch.
  - `bizRun` already refuses to run while the kill switch is on (:2293).
- The line numbers and the table below refer to `9cad1e6`, before these two commits.

---

## (a) Approved requirements checklist

Royce approved this checklist on 2026-11-11.

**Source tags:**
- **O** means `[Owner-stated]` in the vision.
- A number and letter, such as **1a**, means a `[Proposed]` item Royce approved in brainstorming group 1.
- **T** means a §4 trust rule Royce approved.
- **C** means the §5.5 card direction Royce approved.

### A. HQ and visibility
- **R1 (O1):** The owner can assign work to a bot, and the assignment and its progress show in the HQ as they happen.
- **R2 (O2):** Each bot shows a state (working, handing off, blocked, needs-you, available, disconnected) derived from real activity. A disconnected bot shows as disconnected, and no animation implies activity that didn't happen.
- **R3 (O11):** An office-style view shows the team's jobs, statuses, handoffs, approvals, budgets and receipts. It is not hard-coded as the main screen (Open §5.1).
- **R4 (1a):** Opening a bot shows the evidence behind its status: current job, actions, output, cost, and any blocker.
- **R5 (1b):** Adding a bot is presented as hiring a team member, not installing software. Acceptance needs Royce's definition (Q8).
- **R6 (1c):** The office, list and mobile views all render one source of truth for job status, and no view contradicts another. Mobile leads with approvals, blockers and spending.

### B. Jobs and orchestration
- **R7 (2a):** An orchestrator turns an owner request into jobs, assigns each to a suitable bot, and collects the finished work.
- **R8 (2b):** Each bot is a named specialist: a role, instructions, and a set of tool connections.
- **R9 (2c):** A separate checker reviews consequential work before it lands.
- **R10 (2d):** One ask fans out across several bots. Handoffs are visible as they happen, and the owner is pulled in only for decisions.

### C. Handoffs, failure, retries
- **R11 (O3):** Bots hand work to each other, and the owner sees each handoff.
- **R12 (8a):** A handoff has explicit states (offered, accepted, in progress, returned, failed) and carries the job's context and receipt chain.
- **R13 (8b):** A bot dying or being stopped mid-job leaves the job's state preserved and visible. The owner can reassign it, pause it, or close it with a partial-work receipt.
- **R14 (8c):** Routed actions use provider idempotency or durable dedup.
  - An unknown outcome is recorded and reconciled before any retry.
  - Where exactly-once isn't guaranteed, the product says so for that action.
  - Repeated external events are recognized as repeats.

### D. Shared context
- **R15 (O4):** Bots work from a shared picture of the business instead of starting cold.
- **R16 (3a):** A shared memory holds the business's notes, documents, decisions and past receipts.
- **R17 (3b):** Memory is scoped: a bot sees only what its job needs, and owner-private material stays private unless the owner includes it.
- **R18 (3c):** Every memory entry records who wrote it and when, and a revoked bot's contributions can be quarantined.
- **R19 (3d):** Conflicting entries surface with their sources, and the newer entry doesn't silently win.

### E. Owner rules and approvals
- **R20 (O5):** The owner sets what each bot may do.
- **R21 (4d):** Standing rules (AUTO, ASK or NEVER per action type) are visible, scoped and revocable.
- **R22 (7a):** The permission layer stays on until the owner changes it.
- **R23 (O6):** Sensitive actions wait for the owner's decision before they go out. Which actions count as sensitive is Q6.
- **R24 (O6):** Approval requests reach the owner where they will see them, with context and cost. Which channels count is Q7.
- **R25 (4a):** An approval binds to one exact action with its parameters and cost.
- **R26 (4b):** An approval expires.
- **R27 (4c):** At execution, Alter re-verifies the action, budget, limits and target. A mismatch voids the approval and re-asks.
- **R28 (T5 and 4d):** The product never infers consent from silence.

### F. Receipts and honest status
- **R29 (O8):** Every action leaves a receipt recording what was attempted, why, what actually happened, what was checked, and what it cost.
- **R30 (5a):** Jobs use an enforced status vocabulary (queued, working, blocked, needs-you, done, failed). "Built", "tested" and "live" are distinct claims, each needing its own evidence.
- **R31 (5b and T4):** Every displayed status, handoff or completion traces to a real event or receipt. Nothing rests on a bot's self-report alone, and consequential claims carry checkable output.

### G. Budgets
- **R32 (O7):** Per-bot and per-job spending limits are checked before money moves.
- **R33 (6a):** Budgets compose per action, job, bot and period, and the tightest limit wins.
- **R34 (6b):** Budgets also cover metered external costs (model usage, paid tool calls), so a job's cost is complete.
- **R35 (6c):** Expected spend is reserved up front and actuals reconcile against it. Releases and overruns are recorded.

### H. Gate, connections, stop and revoke, honesty
- **R36 (O9):** For routed actions, credentials stay behind the gate and bots get proxied access, never raw keys.
- **R37 (O12):** A bot connects once and stays connected, and the product shows the true connection state.
- **R38 (7b):** Each bot shows the capability tier Alter can honestly claim for it.
- **R39 (O10):** The owner can halt a bot and cut its access.
- **R40 (8d and T3):** Stop blocks further routed actions and is recorded, and revoke cuts gate access. The product reports what was stopped versus what had already gone out.
- **R41 (T1):** Control claims are scoped to routed actions. Where a bot can act outside Alter's path, the owner is shown that gap.
- **R42 (T2):** No product copy claims any bot is bypass-proof.

### I. Entry points
- **R43 (9a):** Bring your own bots: connect existing assistants and control them all in one place.
- **R44 (9b):** Managed-team onboarding: describe the business, see suggested work with evidence, pick a starting point and set limits, with no technical setup. Which entry point ships first stays Open (§5.6).

### J. Card
- **R45 (C):** Per-bot budgets on a payment card with real-time controls, including real issuing and live spending. It comes last, and each step is gated on Royce's approval and the provider prerequisites.

**Not counted as requirements:**
- §6 is reported and unverified, so it is orientation only.
- §8 holds working agreements, which are followed as process.
- §9 is vocabulary.
- The plan uses the §7 phase order as its default sequence, as Royce chose.

---

## (b) Done / Partial / Missing

**Rules:**
- **Done:** code that does it, plus a test that covers it. I re-checked these against the code.
- **Partial:** some of it exists; the gap is stated. "(unmerged)" means the missing part exists only on a branch that isn't merged.
- **Missing:** nothing found where the mapper and I searched.
- **⚑** marks something not verifiable offline. Live behavior with real bots, real Redis and real providers is unverified everywhere.

**Totals:** 10 Done, 32 Partial, 3 Missing.

| ID | Status | Evidence (code at `9cad1e6`) | Tests | What is missing or flagged |
|---|---|---|---|---|
| R1 | Partial | `assignTask` api/index.js:653-662; POST /tasks api/index.js:1929-1993; assign event :660; progressAt bump :1049; client poll public/js/core.js:55, 1 s redraw :57 | vnext, job-loop, plain-task-routing | No live push. The client polls every 30 s and server state is cached up to 30 s (api/index.js:88-89), so "as it happens" can lag about 60 s. The target latency is open (Q12). |
| R2 | Partial | `botState` core.js:211-242; `honestStatus` public/js/components/bot-status.js:21-32 ("Working" only with a running task and a working signal); floor label public/js/floor.js:281; `connectionState` api/index.js:1575-1592 | presence-model, status-truth, alter-v3, poses-asleep, anim-signals, feed-accuracy | There is no "handing off" bot state; a handoff is only an animation (components/meeting.js). Working, blocked, needs-you, available and disconnected exist under other names. |
| R3 | Partial | floor.js:1-3 ("every state comes from BB.S"); approval tray :207-219; shared jobs :316-332; handoff meetings :336-351; done chip :379-393; receipt ship-out components/receipt-ship.js | floor-fit, anim-signals, vnext-client | The budget shown on the floor is the sandbox card grant (components/motion.js:10, `task.sandboxGrant`), not the job ledger (`jobSpent`, api/index.js:1081-1084). |
| R4 | **Done** | inspector.js:30 loads GET /api/jobs/:id; :47 honest status; :55-58 timeline, result, cost ("Cost not reported" when absent); blocker words core.js:237 and inbox.js:17-26; `jobDetail` api/index.js:688-699, `timelineOf` :708-740 | inspector-layout, botpanel-tour, vnext, job-loop | Output is truncated to 280 characters (inspector.js:55). |
| R5 | Partial | Copy: connect.js:43 "Connect your existing bot"; connect.js:162 "Access card granted … Your AI team, one HQ"; default name 'AI employee' api/index.js:2057 | connect-copy, connect-choices | No hiring framing found. Acceptance is undefined (Q8). |
| R6 | Partial | One store `BB.S` (core.js:1-2); shared `BB.jobStatus` used by rail, phone and inspector (inbox.js:17, :96, :150; inspector.js:51); phone order "Needs you" first (inbox.js:156-159); rank core.js:380 | vnext-client, demo-phone-first-run, mobile-motion | The floor derives its own label words (floor.js:281) instead of `BB.jobStatus`, so views can word the same state differently. The phone has no spending summary (spend lives on the Card view, card.js:24-28). |
| R7 | Partial | Routing api/index.js:1930-1993 (named bots, categories, `freshRoutingPick`, `generalRoutingPick`); parts `createTaskParts` :539-542 with the comment "Rule-based split of your explicit steps, not AI reasoning" (:538); results aggregated into the parent :545 | task-parts, plain-task-routing, auto-route-p1, asleep-fallback, room | No orchestrator decomposes an arbitrary request. The split is rule-based, 2-4 explicit steps. A lead-bot model exists only on `feat/team-picker-smart-delegation` (unmerged). |
| R8 | Partial | name, role, provider, model api/index.js:1376; strengths :2036, `DEFAULT_STRENGTHS` :488-489; per-action permissions :2037 | auto-route-p1, room | No per-bot instructions field and no editable role route. "Tool connections" exist only as action permissions. |
| R9 | **Missing** | Nothing found. Owner approvals are the only gate (searched api/index.js task, review and routing code) | — | No checker step or role. |
| R10 | Partial | handoffPlan api/index.js:1952-1980 ("Each hop happens only on a real handoff", :1955); sequential parts :539-545; "then … (planned)" inbox.js:97 | task-parts, vnext | No parallel fan-out; parts run in order (:538). |
| R11 | **Done** | `work.handoff` api/index.js:307-315 creates a child task with context; HANDOFF event :313; timeline "Handed part of it to" :715; meeting animation floor.js:340-351 | vnext (asserts the handoff completes), heartbeat-cas (asserts the child goes to the target bot) | — |
| R12 | Partial | Child task statuses queued, running, done, failed; context = parent result api/index.js:311; 'result_returned' event :852 | — | No offered or accepted states, no explicit returned or failed handoff state, and no receipt chain carried. No test. |
| R13 | Partial | 30-minute stall auto-stop api/index.js:669-678; reassign with history :632-650; owner stop :679-686; asleep fallback :551-583 | stall-expire, asleep-fallback, vnext | No pause per job and no partial-work receipt; only `t.result` text. |
| R14 | Partial | Resend idempotency key = request id (api/index.js:215, 240); unknown outcome never retried (:1104-1108), reconcile with a 23 h window (:1311-1330); atomic CHARGE_ONCE and RECEIPT_ONCE (:98-99); note dedup (:184-199); source_id and request-id dedup (:290, 357, 1161, 1479, 1513, 2657); issuer replay declined (:2630); event_id duplicates (:876); botlink retry by requestId (api/bot-link.js:231-242); user-facing "Outcome unknown: Alter did not retry" (:728) | email-crash-recovery, email-idempotency-window, email-send, auto-note-idempotency, approved-receipt-once, cost-once, receipt-trim, note-crash-recovery, issuer, botlink-hostile | web.fetch and other AUTO actions without a source_id are not deduped. No per-action exactly-once statement except for email. No inbound provider webhooks (delivery is polled). ⚑ The Lua scripts have never run on real Redis. |
| R15 | Partial | `task.context` from the parent result and previous part (api/index.js:311, 543); bot tools foreman_teammates, foreman_inbox, foreman_read_task (:1424-1427) | business | Bots cannot read notes, business sources or receipts. There is no shared picture beyond the parent result. |
| R16 | Partial | Notes store api/index.js:160-176, 249-258; owner read :1821-1839; business sources :2169-2197 | note-readback, note-legacy, note-delete, business | No bot-side read path. No documents, decisions or receipts memory. |
| R17 | **Missing** | Notes record `taskId` (api/index.js:166) but the `fm:notes` list is workspace-wide. No owner-private scope found | — | Everything. |
| R18 | Partial | Note provenance `{by, at, requestId, taskId}` api/index.js:166; bot name shown on read :1838 | note-readback | Notes only. No quarantine of a revoked bot's contributions (revoke handler :2034-2043). |
| R19 | **Missing** | Nothing. `bizStale` (api/index.js:2154-2156) only flags changed source versions | — | Everything. |
| R20 | **Done** | POST /agents/:id/permissions api/index.js:2031 (validation), :2037 (set); inspector selects public/js/inspector.js:71-80, call :125 | authorization, qa-triage (NEVER permissions block actions); heartbeat-cas (permission changes persist under concurrency) | ⚑ No test calls the owner route `POST /agents/:id/permissions` itself; T0.2's test will. That route has no Origin check (D2). email.send is fixed to ASK (:1136) and is not editable, by design. |
| R21 | **Done** | DEFAULT_PERMS api/index.js:128; presets :910-914; job and standing scope :832; job grant :833; overview grid inspector.js:185-192 | authorization, rules-input | — |
| R22 | **Done** | "Policy JSON is authoritative; heartbeats never rewrite it." api/index.js:92; CAS with policyRevision :103-112 | heartbeat-cas | Job grants close automatically when a job ends (:835), which is by design. |
| R23 | Partial | ASK flow api/index.js:1154-1166; email always ASK :1136; defaults :128 | email-send, note-approval, job-loop | Defaults leave web.fetch and work.handoff on AUTO. Whether that matches "sensitive" depends on Q6. |
| R24 | Partial | In-app only: core.js:363-382, public/js/pop.js, inbox.js, floor.js:352-364; `notificationStatus:'in_app_only'` api/index.js:1481 | vnext-client, email-popdown | No push, email, SMS or Slack to the owner. SMS approvals exist only on `sms-approvals` (unmerged, dark, heavy conflicts). ⚑ The live landing page claims "Requests that need you reach your phone." (public/index.html:36). |
| R25 | Partial | detailsHash and costCents on the request api/index.js:1158, `reqHash` :1173; hash checked at approval :1192-1194; client sends it core.js:405; full email and note review core.js:70-78 | note-approval, email-send, spend, broker, authorization | The server requires the hash only for email.send (:1192). Other actions can be approved without it. The approval card shows only a one-line summary for other actions (inbox.js:51). |
| R26 | **Done** | TTLs api/index.js:136 (email 15 min, others 24 h); expired → expired receipt :1195-1200; spend :1481, card :1514, broker :2658, issuer mandate :2617 | email-send, note-approval, spend, vnext | — |
| R27 | Partial | Re-checks jobPolicy and policy at approval (api/index.js:1201-1209); email re-validate and re-hash :1204; card :1534; note recovery :1287 | email-send, note-crash-recovery, authorization | A mismatch sets 'blocked' with "Ask the bot again" and does not re-ask automatically. Execution follows approval immediately, so the approval-time check doubles as the execution-time check. |
| R28 | **Done** | No auto-approve path (searched api/ and public/js for autoApprove, approveAll and similar). Requests stay pending until decided or expired (api/index.js:1181, 1195) | email-send, note-approval | — |
| R29 | Partial | `receipt()` api/index.js:1053-1061 records action, params, outcome, costCents, summary, approvedBy, code, detailsHash and prevHash/hash; blocked :1142 and denied :1150 receipts | approved-receipt-once, qa-triage, email-send | No "why" field and no explicit "what was checked". Chat tasks, claims, completions and reports create events, not receipts. |
| R30 | Partial | Task statuses waiting, queued, running, done, failed, dismissed (api/index.js:457, 541, 666, 847); "Waiting for you" and "Blocked" are client-derived (inbox.js:21) | — | The vocabulary differs from the required set and isn't enforced server-side. No built/tested/live distinction. Depends on Open §5.3. |
| R31 | Partial | Timeline built from events, receipts and requests (api/index.js:708-740) with `reported:true` (:714); "Delivered" only on provider delivery (:738); provenance "reported by the bot, not verified" (:792) | public-receipt-delivery, feed-accuracy, status-truth | Job completion is bot self-report (:841-854). No checkable output is required for consequential completions. |
| R32 | **Done** (ledger) | Policy checks run before execution in `gatewayAct`: `jobPolicy` then `policy` (api/index.js:1140) before `runAndReceipt` (:1168); per-action and daily limits :1071-1073; job budget via `jobSpent` :1081-1084 | authorization, cost-once, qa-triage, spend | Applies to the internal ledger for routed gateway actions. No real money moves anywhere today ("no money moves", :1077); real spend is R45. |
| R33 | Partial | jobPolicy then policy (api/index.js:1140); card AUTHZ checks per action, hourly velocity, daily and job (:17-26) | authorization | The daily limit is skipped for job-scoped bots (:1073 `permissionScope!=='job'`), so the tightest limit doesn't always win. No period other than daily (Q13). |
| R34 | Partial | Model cost recorded (api/index.js:894-896, 951, 848); business engine call cap (:2124) | vnext | Model and tool costs are recorded but never checked against any budget. |
| R35 | Partial (unmerged) | Issuer test reservation `reservedCents` (api/index.js:2616, 2639); card "persist admission before provider invocation" (:1536-1537) | issuer, authorization | Gateway charges after execution (:1096). Reserve, reconcile, release and overrun exist on the envelope branches (`fix/envelope-stranded-holds-and-unreserved`: spend-envelope.cjs:67, 236, 251, 265), unmerged and behind a flag. |
| R36 | Partial | Resend key server-side (api/index.js:130-135, 213); provider keys encrypted at `fm:secret` (:907-909, 2069); web.fetch proxied (:243-248); broker "No reusable credential ever leaves the server" (:2647), fixture only (:2666) | email-send, broker | Only email.send and web.fetch are real proxied tools. The broker runs fixture.echo only (paid adapters disabled). External bots use their own credentials (see R41). |
| R37 | **Done** ⚑ | OAuth refresh grants with no routine expiry (api/index.js:1566-1567); `connectionState` :1575-1592; runner 30-day rolling session :1691; bot-link idle and cap windows api/bot-link.js:19-26; client presence core.js:121-130 | oauth-persistence, runner-durable, botlink-quiet-decay, status-truth, reconnect | ⚑ Never verified with a real bot. Bot-link has a 90-day hard cap and the runner a 30-day rolling session, after which the owner re-pastes. |
| R38 | Partial | Tiers Connected/Governed/Live in api/bot-link.js:285-308 (Live is always 'unavailable'), rendered only in public/connect.html:64; PROVIDERS tiers api/index.js:898-904 | botlink-adapter, botlink-quiet-decay | No tier shown in the HQ, inspector or list, and none for OAuth, gateway, runner or hosted bots. |
| R39 | Partial | pause api/index.js:2039, revoke :2034, remove :2052, kill :2053; bot-link revoke api/bot-link.js:275-282; emergency stop public/js/app.js:102-117 | vnext, botlink-hostile, reconnect, spend | Revoke leaves the gateway key, and restore (:2035) re-enables the same key (Q11). The kill switch doesn't block completion (:841-847) or event reports (:887-893), which check only `agent.status` (Q10). |
| R40 | Partial | Policy blocks revoked, paused and killed bots with a receipt (api/index.js:1067-1069, 1142); pending requests blocked on revoke (:2043); kill event (:2053) | email-gateway-auth, botlink-gateway-e2e | No report of what was stopped versus what had already gone out. |
| R41 | Partial | REVOKE_COPY "It cannot stop calls the bot makes outside Alter." api/bot-link.js:45; BROKER_COVERAGE api/index.js:2649; connect.js:206 "Work outside this gateway is not visible or controlled by Alter"; public/security.html:5 | botlink-adapter, connect-copy | The gap is stated in setup copy only. No per-bot gap indicator in the HQ. |
| R42 | Partial ⚑ | Copy hits: public/hero-a.html:15 "Nothing spends, sends or deletes without your tap." (unscoped); public/index.html:44 "The kill switch blocks every action through Alter at once." (scoped, fine); public/index.html:36 "Requests that need you reach your phone." (no such channel exists); public/js/app.js:107 "Pause blocks every action until you resume." (unscoped) | connect-copy (partial) | No literal "bypass-proof" claim was found, but some copy is unscoped. ⚑ hero-a.html is served from public/; I didn't check whether anything links to it. |
| R43 | **Done** ⚑ | POST /connect api/index.js:2055-2084; OAuth MCP :1603-1665; gateway key :2012; runner :1709; bot-link :1734-1779; connect wizard connect.js:43 | botlink-*, onepaste, connect-copy, setup-origin-server | ⚑ Never verified end to end with a real external bot in this branch. |
| R44 | Partial | Business V1: "learn the business from the owner's own notes, propose takeovers with verifiable evidence" (api/index.js:2093-2098); verbatim evidence check :2229; activate :2266-2276 | business | Proposals never become jobs or bots (:2095). Limits are free text (:2256). Needs a platform model key (:2104-2117). The bigger delegation and team work is on `feat/biz-grokbot-backend` (96 commits, unmerged, heavy conflicts) and `lane1-owner-overview` (frontend, unmerged). |
| R45 | Partial (unmerged) | Sandbox card only: `CARD_PROVIDER … live:false` api/index.js:1498, `liveMoneyEnabled:false` :1506, issuer `deny('live_mode_disabled')` :2623, card.js:7 "Sandbox. No real money moves." | issuer, authorization, spend | Live issuing and live spending are missing. The envelope accounting is on the unmerged envelope branches and has never met a real provider. |

### Cross-cutting defects found while mapping (not requirements, but they block trust)

- **D1:** The daily business cron always fails.
  - `GET /api/cron/business-daily` calls `send(...)` at api/index.js:1800, but `send` is defined only inside `routes()` (:1856).
  - Reproduced offline: with the correct `CRON_SECRET` the route returns `500 {"error":"send is not defined"}`; with a wrong secret it returns 401.
  - The same line is on `origin/main` (api/index.js:1447), and vercel.json schedules this route daily, so this is very likely failing in production.
  - No test exercises the route; business-regression calls `bizDailyTick` directly.
- **D2:** These owner write routes have no Origin check:
  - POST /tasks (:1929) and /tasks/plan (:1928)
  - /money/:id/approve|deny (:1995)
  - /agents (:2025) and /agents/:id/(revoke|restore|permissions|limits|room|pause|strengths) (:2026)
  - /agents/:id/remove (:2052) and /kill (:2053)
  - /connect (:2055)

  Every other owner write checks `req.headers.origin === origin`, and there is no blanket guard. The `SameSite=Lax` session cookie (:965) limits cross-site exposure, so this is medium severity. The same gap exists on `origin/main` (for example :1628, :1656).
- **D3:** Revoke and restore reuse the same gateway key, so restore re-enables a key that might have leaked (`fm:key` is untouched by :2034-2035). This needs a decision (Q11).
- **D4:** The kill switch doesn't stop a bot from completing jobs or reporting events (:841-847, :887-893). This needs a decision (Q10).
- **D5:** The live site promises phone notifications that don't exist (public/index.html:36). See R24 and R42.

---

## (d) Ordered plan

**Order:** the §7 phases (0 to 4), as Royce chose. Within and across phases, dependencies come first. Where a dependency forces a different order than §7, the task says so.

**Scope note (writing-plans scope check):** the vision spans several independent subsystems: status, approvals, budgets, gate, memory, orchestration, onboarding and card. This document is the ordered roadmap. Each task group below needs its own detailed implementation plan before execution, with exact signatures and the failing test per step, written with the writing-plans skill when that group is picked up. Nothing here authorizes execution.

**Global constraints (vision §4 and §8, verbatim intent):**
- Status honesty in code and copy: started ≠ built ≠ tested ≠ live. Tests using fakes are offline proof, not integration proof.
- Scope every control claim to routed actions. No universal bypass claims. No instant absolutes. Evidence-backed statuses only. Owner authority is explicit, and silence is never consent.
- Work is branch-only. No real keys, paid services or real money unless Royce authorizes that exact step. Never ask for secret values in chat.
- Preview and production share one Upstash database until storage is separated, so there is no live testing of any kind until then.
- Where an Open decision (§5) is involved, surface it; never choose silently.
- Every bug fix ships a regression that fails before and passes after. Crash cases use fault injection.

**Review focus:** these are the five failure modes most likely to bite an owner that no task's tests would naturally cover. Each owning task must add the test named here.
1. **A crash between two store writes on every new write path** (memory, handoff states, reservations). Expect no duplicate, no lost state, and no resurrection. Owners: T2.2, T3.2, T3.5.
2. **Cross-workspace access on every new read route** (bot memory reads, tier reads). Expect another workspace to get 404. Owners: T2.6, T3.5.
3. **Two views disagreeing during the 30 s cache window.** Expect office, list and mobile to show the same status for the same job at the same moment. Owners: T1.1, T2.12.
4. **Bot-reported numbers shown as fact** (cost, completion, model usage). Expect each to be labelled "reported" unless verified. Owners: T1.3, T2.3.
5. **Anything run against shared Preview storage before separation.** Expect every live check to be gated on T0.5. Owners: T0.5, T1.6.

**File-contention groups** (tasks in the same group touch the same code and run one after another; different groups can run in parallel):
- **G-gate:** api/index.js `gatewayAct`, `policy`, `recordCost`, `decide`, ACTIONS and DEFAULT_PERMS. Tasks T1.4, T1.5, T2.1, T2.3, T2.8, T2.11.
- **G-jobs:** api/index.js tasks, handoff, `jobDetail`, `timelineOf` and `completeTask`. Tasks T1.2, T1.3, T2.5, T2.9, T3.2, T3.3, T3.4.
- **G-client:** public/js/core.js, floor.js, inbox.js, inspector.js, components/bot-status.js, components/motion.js. Tasks T1.1 (client half), T2.6, T2.7, T2.12, T2.13.
- **G-copy:** public/*.html and public/js/connect.js. Tasks T0.8, T3.8.
- **G-security:** route guards in api/index.js `routes()`. Tasks T0.1, T0.2, T0.3.
- **G-branches:** work on separate branches: envelope stack, sms-approvals, team-picker, biz-grokbot, job-001 and job-002. Tasks T0.6, T0.7, T2.2, T2.10, T4.x.
- **G-memory:** a new module (proposed `lib/memory.cjs`) plus gateway and MCP read tools. Tasks T3.5, T3.6.
- **G-business:** api/index.js business section and public/js/business.js. Task T3.7.

api/index.js is about 2,700 lines and every server group touches it. To cut contention, new subsystems (memory, handoff contract, reservations) should land as their own modules under lib/ and be wired in with a few lines, following the existing lib/*.cjs pattern.

**Parallelism:**
- Phase 0: G-security, G-copy, T0.4 (real Redis) and T0.7 (envelope branch) can all run in parallel.
- Phase 2: G-client can run in parallel with G-gate, and G-memory can be started in parallel once T3.5's interface is agreed.
- Tasks inside one group run sequentially.

### Phase 0: prove what exists and fix what is broken
| Task | Covers | Files | Depends on | Acceptance check | Needs Royce |
|---|---|---|---|---|---|
| **T0.1** Fix the cron route crash | D1 | api/index.js:1800 | — | New regression: GET /api/cron/business-daily with a valid bearer returns 200 and runs `bizDailyTick`; a wrong bearer returns 401. It fails before the fix with "send is not defined". | Deploying the fix to production |
| **T0.2** Origin check on the remaining owner write routes | D2 (R20, R39 safety) | api/index.js:1928-2085 | — | Regression: each listed route returns 403 with `origin: https://evil.example` and works same-origin. The app client still works (the browser sends Origin on POST). | — |
| **T0.3** Kill-switch and revoke semantics | D3, D4 (R39, R40) | api/index.js:841-893, 2034-2035 | Q10, Q11 answered | Regression per Royce's answer. For example: with `fm:kill` set, completion and reports are blocked or recorded, and restore after revoke requires a new key or re-pair. | Q10, Q11 |
| **T0.4** Real-Redis check of the Lua scripts and locks | R14, R32, R35 safety | test-only (new `redis-lua-integration.cjs`), no product code | — | Against a throwaway local redis-server, not Upstash: CHARGE_ONCE, RECEIPT_ONCE, AGENT_CAS and BOTLINK_CAS return the same results as memCmd for 2- and 3-key forms, and `SET NX PX` lock expiry behaves as the code assumes. | — (local only) |
| **T0.5** Separate Preview storage, push the branch, prove CI | Phase 0 evidence; gates all live checks | docs/storage-isolation.md checklist | — | The checklist in docs/storage-isolation.md passes, the first GitHub CI run is green, and the Node version used is recorded. | Yes: storage separation (free tier only), push |
| **T0.6** Merge-readiness list per unmerged functional branch | R7, R13, R24, R32-R35, R39, R44, R45 inputs | branches only | — | For each of `alter/job-001`, `alter/job-002-live-job`, the envelope stack tip, `sms-approvals`, `feat/team-picker-smart-delegation`, `feat/biz-grokbot-backend` and `lane1-owner-overview`: rebase or port effort, its tests run against the current head, and a plain-language keep, port or drop recommendation. `alter/job-001` is a 1-commit fix touching files with no overlap, so it is the first merge candidate. | Each merge |
| **T0.7** Envelope known gaps (§7 Phase 0) | R35, R45 | envelope branch only | — | The closed-before-capture ordering regression passes for the supported sequence; the provider field assumption is cited against current provider docs; a test-mode provider run happens only if Royce sets up a test account. | Test account |
| **T0.8** Copy honesty fixes | R24, R41, R42 | public/index.html:36, public/hero-a.html:15, public/js/app.js:107 | — | A copy regression asserts that no page promises phone notifications until T2.10 ships, and that "every action" claims say "through Alter". | Copy wording |

### Phase 1: one real job, end to end
| Task | Covers | Files | Depends on | Acceptance check | Needs Royce |
|---|---|---|---|---|---|
| **T1.1** Live-enough updates | R1, R6 | core.js poll; api/index.js state cache | Q12 | Assignment and progress events appear in the owner's open view without a reload within the agreed latency. A test asserts the office, list and phone views give the same status for one job at one moment (review focus 3). | Q12 |
| **T1.2** Complete receipts | R29 | api/index.js `receipt()` :1053-1061 and its callers; claim, complete, handoff | — | Every receipt carries `why` (the request or job and the brief it came from) and `checked` (the policy, approval hash and budget checks it passed). Claim, completion and handoff produce receipts. A regression asserts the fields on each receipt type. | — |
| **T1.3** Evidence-backed completion | R31, R30 (part) | api/index.js `completeTaskUnlocked` :841-854; receipts.js | Open §5.3 | A completion shows as "reported by the bot" unless it carries checkable output (a receipt id, delivered message, diff or test run). A regression covers self-report-only versus evidenced completions (review focus 4). | §5.3 |
| **T1.4** Exact-action approval for every action | R25 | api/index.js:1190-1194; inbox.js:51 | — | Approving any ASK request without `detailsHash` returns 409 `details_required`. Approval cards show the full parameters and cost for every action type. | — |
| **T1.5** Re-ask on mismatch | R27 | api/index.js:1201-1209 | T1.4 | When the approval-time re-check fails, the request is voided and a fresh request bound to the current details is offered to the owner. A regression covers budget-changed and details-changed cases. | — |
| **T1.6** The Phase 1 run | R1, R4, R29, R32, R37, R43 live proof | none (operational) | T0.5, T1.2, T1.4 | On the separated Preview: one real bot, one real job, one owner approval of a sensitive action, and a final receipt whose cost matches the ledger. Recorded as receipts and screenshots. | Yes: bot pairing, Preview use |

### Phase 2: controls an outsider would trust
| Task | Covers | Files | Depends on | Acceptance check | Needs Royce |
|---|---|---|---|---|---|
| **T2.1** Composing budgets | R33 | api/index.js `policy` :1065-1075, `jobPolicy` :834 | Q13 | The daily limit also applies to job-scoped bots. The tightest of per-action, per-job, per-bot-daily and any added period wins. A regression matrix covers each combination. | Q13 |
| **T2.2** Reservations for routed spend | R35, R32 | port the envelope `reserve`/`reconcile` from T0.6 into a lib module | T0.6, T0.7 | Expected cost is reserved before execution; actuals reconcile; releases and overruns are recorded. The crash matrix from cost-once is extended to reservations (review focus 1). | Merge |
| **T2.3** Metered costs count | R34 | api/index.js `addModelCost`, `reportedCost`, business engine cap | T2.1 | Reported model and tool costs count against the job and bot budget, and are labelled "reported" versus "routed" (review focus 4). A regression covers a job blocked once reported cost reaches its budget. | — |
| **T2.4** Credential gate for routed tools | R36 | broker api/index.js:2647-2673 | Q14 | Each tool on the agreed routed list runs only through the gate. A hostile test asserts no response or log ever contains a raw provider key. | Q14; paid adapters |
| **T2.5** Honest stop report | R40, R39 | api/index.js kill :2053, revoke :2034-2043, stop :679-686 | T0.3 | After stop or revoke, the owner sees two lists: blocked (pending requests, refused calls) and already went out (receipts executed before the stop). A regression covers both. | — |
| **T2.6** Capability tier in the HQ | R38 | core.js presence, inspector.js, floor.js | — | Every bot shows the tier Alter can claim, for each transport (OAuth, gateway, runner, bot-link, hosted). Live shows only when real. A cross-workspace read test (review focus 2). | Tier names |
| **T2.7** Outside-path gap indicator | R41 | inspector.js, floor.js | T2.6 | A bot whose transport lets it act outside Alter shows that gap on its card and in the inspector. A copy regression. | — |
| **T2.8** Durable dedup for every routed action | R14 | api/index.js `gatewayAct` and `runAndReceipt` | T0.4 | web.fetch and work.* accept a retry key and dedupe like notes.write. A per-action exactly-once statement is shown where it can't be guaranteed. A crash matrix covers each. | — |
| **T2.9** Bot failure mid-job | R13 | api/index.js stall :669-678, stop :679-686 | T1.2 | The owner can pause a job. Stop and stall write a partial-work receipt with what was done. A regression covers a crash mid-job, then reassign. | — |
| **T2.10** Approvals outside the app | R24 | port `sms-approvals` or add an email or push channel | Q7, T0.6 | A pending ASK request reaches the chosen channel with context and cost. A reply or deep link binds to the request fingerprint and expires. A regression uses a mocked provider. | Q7; paid provider |
| **T2.11** Sensitive-action defaults | R23 | api/index.js DEFAULT_PERMS :128, PRESETS :910-914 | Q6 | Every action Royce lists as sensitive defaults to ASK in every preset. A regression covers each one. | Q6 |
| **T2.12** One status model across views | R2, R6, R30 | core.js `botState`/`signal`, floor.js:281, inbox.js `jobStatus`, components/bot-status.js | T1.1 | Adds a "handing off" state derived from an open handoff. The floor uses the shared status derivation. The job vocabulary maps to queued, working, blocked, needs-you, done and failed. A regression asserts the same words in every view. | — |
| **T2.13** Budgets on the office floor and phone | R3, R6 | components/motion.js:10, floor.js, inbox.js | T2.1 | The floor shows the job ledger budget (`jobSpent` against `budgetCents`), and the phone home leads with a spending summary after approvals and blockers. | — |
| **T2.14** Hostile-test pass (§7 Phase 2 evidence) | R36, R39-R42 | test-only | T2.4-T2.8 | Attempted bypasses are each reported as blocked or as a gap shown to the owner, never silently passed. | — |

### Phase 3: teamwork, shared memory and managed-team onboarding
| Task | Covers | Files | Depends on | Acceptance check | Needs Royce |
|---|---|---|---|---|---|
| **T3.1** Bot profile: instructions and tool connections | R8 | api/index.js agent model :1374-1381, inspector.js profile tab | — | Owner-editable role and instructions, plus a list of the tools a bot may use. A regression covers the round trip and cross-workspace denial. | — |
| **T3.2** Handoff contract | R12, R11 | new lib module and api/index.js `work.handoff` :307-315 | T1.2, T2.12 | Handoff states are offered, accepted, in progress, returned and failed. The receiver accepts or declines. Context and the receipt chain ids travel with the handoff. Crash matrix (review focus 1). | — |
| **T3.3** Orchestrator and fan-out | R7, R10 | api/index.js routing :1930-1993, parts :537-545 | T3.2, Open §5.2, §5.3 | One request becomes several jobs, including parallel ones, assigned to suitable bots, with results collected. The owner is pulled in only for approvals. Consider porting the team-picker lead model (T0.6). | §5.2, §5.3 |
| **T3.4** Checker | R9 | new | T3.3, §5.3 | Consequential work stays in "needs check" until a separate checker bot or step passes it. A regression asserts it cannot land unchecked. | §5.3 |
| **T3.5** Shared memory store and bot read path | R15, R16 | new lib module, gateway and MCP read tools | — | Bots read notes, business sources, decisions and past receipts through gated tools. A cross-workspace test (review focus 2) and a crash test on writes (review focus 1). | — |
| **T3.6** Memory scope, provenance and conflicts | R17, R18, R19 | memory module | T3.5 | Each entry carries an author and time. A bot sees only what its job is granted. Owner-private entries never reach a bot unless included. Revoking a bot can quarantine its entries. Conflicting entries are shown with their sources. A regression for each. | — |
| **T3.7** Managed-team onboarding | R44 | business section of api/index.js; port from `feat/biz-grokbot-backend`, `lane1-owner-overview` | T0.6, Open §5.4, §5.6 | Describe the business, see suggested work with evidence, pick one, set structured limits, and it runs as a job under those limits. No technical setup. §7 Phase 3 evidence: one real business, one responsibility, sustained. | §5.4, §5.6; platform model key |
| **T3.8** Hiring framing | R5 | connect.js, connect.html | Q8 | Matches Royce's acceptance definition. | Q8 |

### Phase 4: card and revenue (each step gated)
| Task | Covers | Files | Depends on | Acceptance check | Needs Royce |
|---|---|---|---|---|---|
| **T4.1** Provider and business prerequisites | R45 | none | T0.7, Open §5.5 | The requirements are confirmed at the time and written down. | Yes |
| **T4.2** Envelope on by default for routed card spend | R45, R35 | envelope module after T2.2 | T2.2, T4.1 | Real test-mode provider events reconcile against the ledger, and the receipts match. | Yes |
| **T4.3** First live transaction under a small cap | R45 | — | T4.2 | One live transaction under a small cap with Royce watching, and a receipt matching the ledger. | Yes, per step |

**Already Done, no task needed:** R4, R11, R20, R21, R22, R26, R28, R32 (ledger), R37⚑ and R43⚑. R37 and R43 are proven live by T1.6.

---

## (e) Open questions for Royce

Vision §5, listed and not decided:
1. **§5.1:** Main screen: living office, or a simpler jobs-and-approvals view? (Affects R3 and R6 emphasis; neither is hard-coded today.)
2. **§5.2:** Runtime: Alter-hosted workers, or governing external assistants? (Limits what R36, R40 and R41 can claim. Blocks T3.3.)
3. **§5.3:** What a job is, how big it is, and what proves it done. (Blocks T1.3, T3.3 and T3.4, and the R30 built/tested/live evidence.)
4. **§5.4:** Who Alter is for first. (Orders T3.7 against the bring-your-own work.)
5. **§5.5:** Revenue mechanics. (Blocks T4.1.)
6. **§5.6:** Which entry point ships first. (Orders T3.7.)
7. **§5.7:** Naming. ("Alter" is used as current.)

Raised in brainstorming and mapping:

8. **Q6:** Which actions count as "sensitive" (R23)? Today web.fetch and work.handoff default to AUTO.
9. **Q7:** Which channels count as reaching the owner (R24): push, email, SMS, Slack? Some carry a cost.
10. **Q8:** What acceptance check makes adding a bot "feel like hiring" (R5)?
11. **Q9:** R2 (bot states) and R30 (job statuses) are two different lists in the vision. Is keeping both, as written, correct?
12. **Q10 (owner decision pending; a proposal is implemented locally in `28f8d7b`):** Should the kill switch also stop job completion and event reports, or only block new work and actions?
13. **Q11 (owner decision pending; a proposal is implemented locally in `0873aa2`):** Should restoring a revoked bot require a new key?
14. **Q12:** What does "as it happens" mean in seconds for R1 and T1.1? Today it can lag about 60 s.
15. **Q13:** Which budget periods besides daily (R33): weekly, monthly, none?
16. **Q14:** Which tools count as "routed" through the gate (R36): only email and web fetch today, or more?
17. **Q15:** Approve fixing D1 (the production cron crash) and D2 (missing Origin checks) ahead of the rest of Phase 0? Both are on `main` today.

---

## Verification of this gap list (verification-before-completion, 2026-11-11)

Three Done claims were drawn at random (`shuf` over the ten): **R43, R11, R20**. Each was re-checked against the code and its tests were run fresh at `9cad1e6`.

- **R43, Done, confirmed.**
  - All five connect paths exist at the cited lines: POST /connect api/index.js:2055, `oauthRoutes` :1603, `runnerRoutes` :1709, bot-link :1734, wizard public/js/connect.js:43.
  - All 12 covering tests pass fresh: botlink-adapter, botlink-gateway-e2e, botlink-hostile, botlink-leaked-paste, botlink-quiet-decay, botlink-reattach, botlink-stolen-key, connect-copy, oauth-persistence, onepaste, runner-session, setup-origin-server.
  - Still ⚑: never run with a real external bot.
- **R11, Done, confirmed, with one citation corrected.**
  - `work.handoff` (api/index.js:307-315) creates a child task with the parent result as context (:311) and a HANDOFF event (:313), and the timeline shows it (:715).
  - Tests vnext and heartbeat-cas call it and pass fresh. The earlier citation of asleep-fallback was wrong (it doesn't call `work.handoff`); the table is corrected.
- **R20, Done, confirmed, with a flag added.**
  - The route (api/index.js:2031, :2037) and the inspector UI (public/js/inspector.js:71-80, :125) exist.
  - Enforcement is tested (authorization and qa-triage act under NEVER), and persistence is tested (heartbeat-cas). All pass fresh.
  - No test calls the owner HTTP route itself. The table's earlier test citation (authorization, vnext) was imprecise and is corrected; the route test is folded into T0.2.

**Totals recounted from the table:** 45 rows, 10 Done, 32 Partial, 3 Missing, with every ID from R1 to R45 present.

