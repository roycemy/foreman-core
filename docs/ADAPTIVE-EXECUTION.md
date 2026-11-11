# Adaptive execution: design note (draft for review)

Status: design only. Nothing here is built or enabled. The shipped Business workspace
(PR #107 + fixes #108-#111) is intentionally draft-only: proposals become responsibilities
whose runs produce drafts inside an owner-set boundary. This note maps the path from that
baseline to adaptive execution, including the original prospect-research goal.

## Where V1 stands (verified baseline)

- Owner adds business notes/docs as versioned sources.
- "Look for work" sends source texts to the reasoning engine (Groq, OpenAI-compatible) and
  returns proposals whose every evidence excerpt is verified verbatim against the owner's
  source; invented or misquoted evidence is dropped and counted.
- Owner edits/rejects/activates. Activation discloses per-run transmission + daily check-ins.
- Runs (manual + daily check-in) send full current source texts and return drafts with a
  fixed product boundary: nothing is sent, posted, purchased or connected.
- Audit log, per-workspace daily call cap, kill-switch, fail-closed cron, workspace allowlist.

## The gap

1. Runs cannot use tools. The engine only reads sources and writes drafts. Real work
   (researching prospects, checking a system, preparing a send) needs tool calls.
2. The boundary is a constant, not a ladder. There is no path from "drafts only" to
   "acts within limits I set", per responsibility.
3. The original goal - adaptive responsibilities like ongoing prospect research - needs
   both: tools (web research) and graduated authority (e.g. auto-compile a weekly list,
   never contact anyone).

## Existing rails to reuse (do not build a second policy system)

foreman-core already ships the machinery for graduated, receipted authority for bots:

- `ACTIONS` + `DEFAULT_PERMS`: per-action AUTO / ASK / NEVER modes.
- `grantJob()`: owner issues a per-job grant - exact action set, AUTO/ASK only, NEVER stays
  blocked, exact ledger budget in cents, re-confirmation of assignee, grant change cancels
  pending requests. Explicitly "Gateway ledger only. Not payment authorization."
- Receipts and the public receipt page for finished work.
- Kill-switch (`fm:kill`) already honored by business runs.

Business responsibilities should execute tools through this same gate, with the
responsibility's boundary compiled into a scoped grant, not through a parallel system.

## Graduated autonomy ladder (per responsibility, owner-set at activation, changeable later)

- **L0 Read and summarize.** No tools. Engine reads sources, reports. (Shipped.)
- **L1 Draft.** No tools beyond read-only retrieval the owner enabled (e.g. re-read a
  source's linked document). Output is a draft. (Shipped, minus retrieval.)
- **L2 Prepare.** Tools may gather (web search/fetch, read connected-system data the owner
  granted) and prepare an action (a reply, a list, a booking request). Nothing executes;
  the owner approves each prepared action with one tap. Every tool call is receipted.
- **L3 Bounded auto-act.** Owner grants a narrow action set with hard caps (count, budget,
  window) - e.g. "compile up to 10 prospect dossiers per week from public web sources".
  Auto-acts stay inside the grant; anything outside becomes an ASK. Owner sees every act
  in the log and can pause/retire instantly.

L2/L3 use `grantJob()` semantics: AUTO/ASK modes, NEVER stays blocked, budget-capped,
change invalidates pending asks.

## Prospect research (the original goal), concretely

An L2/L3 "Prospect research" responsibility:

- Tools: web search + page fetch, routed through the gateway policy gate. No account
  creation, no contact, no signups.
- Output: sourced prospect dossiers as drafts. Evidence verification generalizes from
  verbatim-source matching to cited-URL verification: every claim links a fetched URL, and
  the server re-fetches and checks the quote exists before the dossier is shown (same
  anti-invention discipline as proposal evidence).
- Disclosure: the activation copy states which tools run and what leaves the workspace
  (search queries derived from sources), matching the per-transmission standard set in #111.

## Safety invariants (hold at every level)

- Nothing ships past L1 without this design reviewed and an owner-visible grant UI.
- Every tool call: policy-gated, logged, receipted; kill-switch halts immediately.
- Per-workspace daily engine cap already exists; add per-tool caps at L2+.
- No send/post/purchase/connect without a connected-system grant the owner made for that
  system - the fixed boundary relaxes only per responsibility, per action, by the owner.
- Provider disclosure decision gates any real business data; synthetic data only until then.

## Phasing

- **P1** Tool-mediated research drafts: web search/fetch through the gate, cited-URL
  verification, receipts. Boundary still "drafts only".
- **P2** Prepared actions with one-tap approval (L2), grant UI, per-tool caps.
- **P3** Bounded auto-act (L3) with owner-set caps, starting with prospect research.

Each phase is its own review and deploy. This note commits to none of them.
