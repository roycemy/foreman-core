'use strict';
// Run receipts for the bot-link run op. A thin layer over what exists: every terminal (done, failed, killed,
// rejected) is written through the injected record() hook, which in production is api/index.js receipt() and
// so lands in the hash-chained fm:receipts list. That list keeps only the newest 300 per workspace, so each run
// is ALSO appended to one per-job key, fm:jobreceipt:<jobId>, kept 400 days after its last write. 400 days is a
// compromise (the store has no del and receipts should outlive the job), not forever.
//
// Every field is required and non-null. fm:receipts outcomes map onto the existing vocabulary
// (done -> completed, failed -> failed, killed/rejected -> blocked); the exact run outcome rides in run.outcome.
const DAY = 864e5, RETAIN_MS = 400 * DAY, MAX_RUNS = 100;
const FIELDS = ['jobId', 'botId', 'costCents', 'outcome', 'ts', 'overrun', 'output'];
const OUTCOMES = { done: 'completed', failed: 'failed', killed: 'blocked', rejected: 'blocked' };

function complete(rec) {
  for (const f of FIELDS) if (rec[f] === null || rec[f] === undefined) throw Error('receipt field ' + f + ' is missing');
  if (!(rec.outcome in OUTCOMES)) throw Error('receipt outcome ' + rec.outcome + ' is not a run terminal');
  if (!Number.isSafeInteger(rec.costCents) || rec.costCents < 0) throw Error('receipt costCents must be a non-negative integer');
  return true;
}
function makeReceipts({ record, kv, now = Date.now }) {
  const key = jobId => 'fm:jobreceipt:' + jobId;
  async function append(ws, rec) {
    const s = kv(ws);
    for (let i = 0; i < 16; i++) {
      const raw = await s.get(key(rec.jobId)), v = raw ? JSON.parse(raw) : { jobId: rec.jobId, runs: [] };
      v.runs = [...v.runs, rec].slice(-MAX_RUNS);
      const next = JSON.stringify(v);
      if (raw ? (await s.cas(key(rec.jobId), raw, next, RETAIN_MS)) === 1 : await s.add(key(rec.jobId), next, RETAIN_MS)) return;
    }
    throw Error('receipt append contended');
  }
  return {
    RETAIN_MS,
    // (ws, rec, ctx) — the BotLink receipt hook.
    async write(ws, rec, ctx = {}) {
      complete(rec);
      const r = { jobId: rec.jobId, botId: rec.botId, costCents: rec.costCents, outcome: rec.outcome, ts: rec.ts, overrun: !!rec.overrun, output: rec.output };
      await record(ws, r, OUTCOMES[r.outcome], ctx);
      await append(ws, r);
      return r;
    },
    async forJob(ws, jobId) { const raw = await kv(ws).get(key(jobId)); return raw ? JSON.parse(raw).runs : []; },
  };
}
module.exports = { makeReceipts, OUTCOMES, RETAIN_MS, complete };
