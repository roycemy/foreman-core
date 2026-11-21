# Two-bot handoff trial: spec, plan and progress

## Goal

Two assistants, each on its own account, pass one piece of text work through Alter, with the owner deciding exactly what crosses:
1. Assistant A finds useful moments in an owner-supplied transcript.
2. A proposes handing those moments to assistant B.
3. The owner sees the exact package and the exact recipient, and approves or denies it.
4. Only an approval queues work for B. B drafts captions under its own identity, and the result returns to the owner.

This is a text handoff, not video clipping.

## Base

- **Branch:** `feat/two-bot-handoff-trial`.
- **Built from:** draft PR #118's head, `413e49a` (`fix/email-loop-hardening`), plus the cherry-picked release-gate docs and preflight script from `e76e1a5`.
- **Why the stack and not `main`:** the trial relies on things only the stack has:
  - bot actions tied to a running job (`job_not_yours`)
  - a job can't finish with an open approval (`proposal_unresolved`)
  - request expiry (`REQ_TTL_MS`, 24 h)
  - atomic, once-only receipts and charges
  - Origin checks on owner writes
- **Pending decisions on the base:** the base also carries the Q10 and Q11 proposals (`28f8d7b`, `0873aa2`), which are still owner decisions.

**Baseline before any change:** 102/102 regression files pass.

## Contract

**Opt-in only.** Nothing changes for existing jobs, presets, or the legacy AUTO `work.handoff`. A trial exists only when the owner creates one: `POST /api/pilots` (owner session, same Origin). The trial record fixes:
- the workspace
- source bot A and target bot B: both active, external (not hosted), and different
- A's instructions and the owner's transcript
- B's job title and instructions

**What crosses.** Exactly one immutable snapshot:
- `moments`: 1-5 items, each one of these shapes:
  - `{start, end, reason, excerpt}`, with timestamps that must look like `m:ss`, `mm:ss` or `h:mm:ss`
  - `{ref, reason, excerpt}`, with a paragraph reference `¶N` or `¶N-M`; used only when the transcript has no timestamps, and labelled as such
- `request`: B's title and instructions, written by the owner. A can't choose them.
- the identity of A and B

Nothing else crosses: not A's job, transcript, notes, receipts, keys or permissions. Unknown fields are rejected outright. Bounds:
- `reason`: up to 200 characters
- `excerpt`: up to 400 characters
- transcript: up to 20,000 characters
- instructions: up to 1,000 characters each

**Why a snapshot, not a reference.** A reference to A's whole result would let B read whatever A wrote. Instead:
- A proposes the minimal snapshot.
- Alter canonicalizes it (NFC, trimmed, no control characters) and stores it immutably at `fm:handoff:<request id>` with `SET NX`.
- The approval fingerprint is the SHA-256 of that snapshot, which includes the workspace, the trial, A's job and its version, A, B, the payload, B's requested task, both bots' policy revisions and the expiry.
- B can read only that snapshot, through `GET /gateway/tasks/<B's job>/input`, and only when every check passes at the moment of reading.

**Lifecycle.**
1. A claims its trial job (status running) and reads its input through the same route (the owner's transcript and A's instructions).
2. A proposes `pilot.handoff` while its job is running. This creates an ASK request linked to the job; it is always ASK, whatever the preset, and NEVER is honored.
3. A's job shows "Waiting for your approval". The stall sweep skips a trial job waiting on a pending, unexpired approval, so the wait doesn't count as stalled. If the approval expires, the sweep records it as expired.
4. **On approve:** re-check everything, then dispatch:
   - B's job is created with a deterministic id via `SET NX`, assigned to B, created by the owner, with no copied context, no inherited grant and no wake ping.
   - A's job finishes as "handed off".
5. **On deny or expiry:** A's job finishes as denied or expired, no B job exists, and nothing is readable.
6. B claims its job, reads the snapshot, and completes it with captions (result capped at 4,000 characters, as today). The owner sees the linked result.

**Receipts on both sides:**
- the proposal (A's side)
- the decision (approved, denied, expired or blocked)
- the delivery of the snapshot to B (B's side)
- B's completion

Every one is written once, keyed so it can't be duplicated.

**Re-checks at approval, at dispatch and at input resolution.** Any failure blocks the step:
- the trial is active and its record is unchanged
- A's job is running, still A's, and not stopped
- the snapshot hash matches
- B is active, not paused and not revoked
- A is not revoked (at resolution)
- the kill switch is off
- both policy revisions are unchanged

**Contract enforcement:**
- On a trial job, the only allowed action is `pilot.handoff`, by the source bot.
- While a bot holds an unfinished trial job, every other routed action is refused, including standing ones: `work.*`, `web.fetch`, notes and email. So trial text can't leave through Alter any other way.
- Other bots and other jobs are unaffected.

**Credential screen.** The transcript, instructions and every snapshot field are checked for credential-looking values: common provider key formats, bearer tokens, private keys, JWTs, Alter keys, and `password=` or `token=` pairs. A hit is refused, with a receipt naming the kind and never the value. Pattern matching can't catch every secret or every piece of personal data; the minimal payload and the owner's exact-content review remain necessary.

**Text is inert.** Snapshot and transcript text is returned as data with an explicit note. The UI escapes it. Nothing in it can change the recipient, the permissions or the task.

## Limits (stated, not hidden)

- **Manual start.** Real assistants are started manually: trial jobs send no wake pings. No always-on pickup is claimed.
- **No retraction.** Alter cannot recall text after B has read it.
- **No outside control.** Alter governs only what is routed through it. An assistant with its own internet access can share text outside Alter.

**System bookkeeping is not progress.** Alter's own cancellation of a job's pending requests no longer refreshes that job's heartbeat. This was pre-existing on the stack: it also made stopping a job with a pending request fail with "Job changed" whenever the clock moved.

## Where things are

| Piece | Location |
|---|---|
| Contract code | `api/index.js` (search `two-bot handoff trial`) |
| Owner page and review | `public/js/trial.js`, `public/styles/components/trial.css` |
| Real-assistant matrix and connection steps | `ASSISTANTS.md` |
| Synthetic input | `fixture-transcript.txt` |
| Remote delivery gate | `PREVIEW-GATE.md` |

## How to verify

Offline suite, which includes `pilot-handoff-regression.cjs`, `pilot-ui-regression.cjs` and `trial-adapter-regression.cjs`:
```bash
for t in $(git ls-files '*-regression.cjs'); do node "$t" || echo "FAIL $t"; done
```

Real local Redis, scripted workers:
```bash
node scripts/pilot-real-redis-e2e.cjs
```

## Progress log

- Base created; baseline 102/102.
- Contract built. 103/103.
- Real-Redis E2E 5/5. The original real-Redis proof is still 6/6.
- Owner page and review modal built; local Chromium check at desktop and iPhone 13 widths:
  - no page errors and no horizontal overflow
  - adversarial text renders as text
  - HQ "Approve" opens the review first
  - the phone review scrolls inside its box
- Security review fixes:
  - participants have no other routed action
  - the expiry is bound to the package
  - the sweep takes no lock for trials still waiting on the owner
  - the heartbeat and stop race is fixed (pre-existing)
- Real-assistant adapter and its test added. Suite 105/105.
- **Remote delivery is blocked on the Preview binding (PREVIEW-GATE.md).** No push, no PR, no real assistant run.
