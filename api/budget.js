'use strict';
// Per-job run budget for the bot-link run op. A thin layer over what already exists: the cap is the job's
// sandboxGrant (budgetCents, spentCents), read and never written here. Run-op state lives in its own key,
// fm:jobrun:<jobId>, so the existing writers of fm:task:<id> (setJ in card control, gatewayAct's jobGrant,
// grantJob) can never clobber a reservation. jobGrant is a separate ledger and this cap does not cover it.
//
// remaining = sandboxGrant.budgetCents - sandboxGrant.spentCents - settledCents - sum(live reservations)
// Every write is ONE compare-and-set on fm:jobrun:<jobId>. A reservation is a lease: once now >= expiresAt it is
// charged at its FULL reserved amount (lazily, inside the next write or read), never released, because a run
// that crashed may have spent. No sweeper. The key is kept 30 days after its last write (the store has no del).
const crypto = require('crypto');
const DAY = 864e5, RETAIN_MS = 30 * DAY, KEEP_CLOSED = 20;
const empty = jobId => ({ jobId, settledCents: 0, reservations: [], killed: false, blocked: null });

function makeBudget({ task, kv, now = Date.now }) {
  const key = jobId => 'fm:jobrun:' + jobId;
  async function read(ws, jobId) { const raw = await kv(ws).get(key(jobId)); return { raw, v: raw ? JSON.parse(raw) : empty(jobId) }; }
  // Lazy lease expiry: a live reservation past its lease is charged in full. Returns true if anything changed.
  function fold(v, t) {
    let changed = false;
    for (const r of v.reservations) if (r.status === 'live' && t >= r.expiresAt) { r.status = 'expired_charged'; r.chargedCents = r.cents; r.closedAt = t; v.settledCents += r.cents; changed = true; }
    return changed;
  }
  function prune(v) {
    const live = v.reservations.filter(r => r.status === 'live'), closed = v.reservations.filter(r => r.status !== 'live');
    v.reservations = [...closed.slice(-KEEP_CLOSED), ...live];
  }
  // One CAS write with retries. fn(v, t) mutates v and returns {write, out}.
  async function update(ws, jobId, fn) {
    for (let i = 0; i < 16; i++) {
      const { raw, v } = await read(ws, jobId), t = now();
      const r = await fn(v, t);
      if (!r.write) return r.out;
      prune(v);
      const next = JSON.stringify(v), s = kv(ws);
      const ok = raw ? (await s.cas(key(jobId), raw, next, RETAIN_MS)) === 1 : await s.add(key(jobId), next, RETAIN_MS);
      if (ok) return r.out;
    }
    return { ok: false, code: 'busy' };
  }
  // Why a run is refused before any spend: not_assigned (the job is not this bot's), no_job_budget (the job has no active sandboxGrant for this bot,
  // so there is no cap to enforce and nothing may run), else budget_exceeded / job_killed / job_blocked_overrun from the reservation itself.
  function grantOf(t, agentId) {
    if (!t || !agentId || t.assignee !== agentId) return { code: 'not_assigned' };
    const g = t.sandboxGrant;
    if (!g || g.status !== 'active' || g.botId !== agentId || !Number.isSafeInteger(g.budgetCents) || !Number.isSafeInteger(g.spentCents || 0)) return { code: 'no_job_budget' };
    return { g };
  }
  const liveSum = v => v.reservations.filter(r => r.status === 'live').reduce((n, r) => n + r.cents, 0);
  const remainingOf = (g, v) => g.budgetCents - (g.spentCents || 0) - v.settledCents - liveSum(v);

  return {
    RETAIN_MS,
    // Reserve maxCents before any scope is minted or any downstream is called.
    async reserve(ws, jobId, { agentId, maxCents, leaseMs }) {
      const gt = grantOf(await task(ws, jobId), agentId);
      if (gt.code) return { ok: false, code: gt.code };
      return update(ws, jobId, (v, t) => {
        const folded = fold(v, t);
        if (v.killed) return { write: folded, out: { ok: false, code: 'job_killed' } };
        if (v.blocked) return { write: folded, out: { ok: false, code: 'job_blocked_overrun' } };
        const rem = remainingOf(gt.g, v);
        if (maxCents > rem) return { write: folded, out: { ok: false, code: 'budget_exceeded', remainingCents: Math.max(0, rem) } };
        const res = { id: 'res_' + crypto.randomBytes(6).toString('hex'), cents: maxCents, at: t, expiresAt: t + leaseMs, status: 'live' };
        v.reservations.push(res);
        return { write: true, out: { ok: true, resId: res.id, expiresAt: res.expiresAt, remainingCents: rem - maxCents } };
      });
    },
    // Settle a reservation at its actual cost. If the lease already expired and charged the full reservation R,
    // this RECONCILES instead of adding: actual <= R stays at R (no refund), actual > R adds actual - R and marks overrun.
    async settle(ws, jobId, resId, { actualCents, overrun = false }) {
      return update(ws, jobId, (v, t) => {
        fold(v, t);
        const r = v.reservations.find(x => x.id === resId);
        if (!r) return { write: false, out: { ok: false, code: 'unknown_reservation' } };
        if (r.status === 'settled') return { write: false, out: { ok: true, code: 'already_settled', chargedCents: r.chargedCents, overrun: !!r.overrun } };
        if (r.status === 'expired_charged') {
          if (r.reconciled) return { write: false, out: { ok: true, code: 'already_settled', chargedCents: r.chargedCents, overrun: !!r.overrun } };
          r.reconciled = true; r.actualCents = actualCents;
          if (actualCents > r.chargedCents) { v.settledCents += actualCents - r.chargedCents; r.chargedCents = actualCents; r.overrun = true; v.blocked = { at: t, resId }; }
          else if (overrun) { r.overrun = true; v.blocked = { at: t, resId }; }
          return { write: true, out: { ok: true, code: 'reconciled', chargedCents: r.chargedCents, overrun: !!r.overrun } };
        }
        r.status = 'settled'; r.chargedCents = actualCents; r.actualCents = actualCents; r.closedAt = t; v.settledCents += actualCents;
        if (overrun || actualCents > r.cents) { r.overrun = true; v.blocked = { at: t, resId }; }
        return { write: true, out: { ok: true, code: 'settled', chargedCents: actualCents, overrun: !!r.overrun } };
      });
    },
    async remaining(ws, jobId, agentId) {
      const t = await task(ws, jobId), g = t && t.sandboxGrant;
      if (!g) return null;
      const { v } = await read(ws, jobId); fold(v, now());
      return remainingOf(g, v);
    },
    async kill(ws, jobId) { return update(ws, jobId, (v, t) => { fold(v, t); if (v.killed) return { write: false, out: { ok: true, killed: true } }; v.killed = true; v.killedAt = t; return { write: true, out: { ok: true, killed: true } }; }); },
    async isKilled(ws, jobId) { return !!(await read(ws, jobId)).v.killed; },
    // Read-only view with lazy expiry applied (not written).
    async view(ws, jobId) { const { v } = await read(ws, jobId); fold(v, now()); return v; },
  };
}
module.exports = { makeBudget, RETAIN_MS };
