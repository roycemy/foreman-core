#!/usr/bin/env node
'use strict';
// Spend-envelope proof against a real Stripe Issuing SANDBOX (test mode) and a deployed Alter with ALTER_SPEND_ENVELOPES=1.
//
// What this is: a script that drives Stripe's own test helpers (the same ones the Dashboard uses) so that Stripe itself
// sends signed webhooks to the deployed /api/issuing endpoint, then reads the envelope back through the owner's /api/money
// view and compares it with what the accounting model says should have happened. Every place the real events differ from
// the fixtures used in issuer-regression.cjs shows up as a failed or observed step in the report.
//
// What this is not: a unit test (the offline self-test is envelope-sandbox-proof-regression.cjs), a load test, or anything
// that touches live mode. The Stripe key must be sk_test_/rk_test_; the script refuses anything else. No card is ever
// charged: test-mode authorizations cannot move real money.
//
// Secrets: read from the environment only, never printed, never written to the report (redact() runs on every string).

const fs = require('fs');
const path = require('path');
const ENVELOPE = require('../spend-envelope.cjs');

const STRIPE_VERSION = '2025-03-31.basil';
const TEST_KEY = /^(sk|rk)_test_[A-Za-z0-9]+$/;
const redact = s => String(s).replace(/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/g, '$1_$2_[redacted]').replace(/\bwhsec_[A-Za-z0-9]+/g, 'whsec_[redacted]').replace(/fm_sess=[^;\s]+/g, 'fm_sess=[redacted]');

// ---------- Stripe (test mode only) ----------
function form(params, prefix, out = []) {
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach(x => out.push([`${key}[]`, String(x)]));
    else if (typeof v === 'object') form(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}
function stripeClient({ fetch: fx = globalThis.fetch, key, version = STRIPE_VERSION, timeoutMs = 20000 }) {
  if (!TEST_KEY.test(key || '')) throw Error('A Stripe TEST-mode key (sk_test_ or rk_test_) is required. Live keys are refused.');
  async function call(method, p, params, idem) {
    const qs = method === 'GET' && params ? '?' + new URLSearchParams(form(params)).toString() : '';
    const res = await fx('https://api.stripe.com' + p + qs, {
      method,
      headers: { Authorization: 'Bearer ' + key, 'Stripe-Version': version, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idem ? { 'Idempotency-Key': idem } : {}) },
      ...(method === 'POST' ? { body: new URLSearchParams(form(params)).toString() } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 200) }; }
    if (!res.ok) { const e = Error('stripe_' + res.status + ': ' + redact((j.error && (j.error.message || j.error.code)) || text.slice(0, 160))); e.status = res.status; e.body = j; throw e; }
    return j;
  }
  return {
    account: () => call('GET', '/v1/account'),
    createCardholder: (p, idem) => call('POST', '/v1/issuing/cardholders', p, idem),
    createCard: (p, idem) => call('POST', '/v1/issuing/cards', p, idem),
    getCard: id => call('GET', '/v1/issuing/cards/' + id),
    // Blocks until Stripe has asked the webhook and applied its answer, so the wall time includes the webhook round trip.
    testAuth: p => call('POST', '/v1/test_helpers/issuing/authorizations', p),
    capture: (id, p) => call('POST', `/v1/test_helpers/issuing/authorizations/${id}/capture`, p),
    reverse: (id, p) => call('POST', `/v1/test_helpers/issuing/authorizations/${id}/reverse`, p),
    expire: id => call('POST', `/v1/test_helpers/issuing/authorizations/${id}/expire`, {}),
    refund: (txId, p) => call('POST', `/v1/test_helpers/issuing/transactions/${txId}/refund`, p),
    getAuth: id => call('GET', '/v1/issuing/authorizations/' + id, { expand: ['transactions'] }),
    listEvents: (type, limit = 5) => call('GET', '/v1/events', { type, limit }),
    fetch: fx,
    key,
  };
}

// ---------- Alter (owner session) ----------
function alterClient({ fetch: fx = globalThis.fetch, base, token, timeoutMs = 15000 }) {
  const u = new URL(base), origin = u.origin;
  if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) throw Error('ALTER_BASE_URL must be https (or localhost)');
  async function call(method, p, body) {
    const res = await fx(origin + p, { method, headers: { Cookie: 'fm_sess=' + token, Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 200) }; }
    return { status: res.status, body: j };
  }
  const own = async hash => { const m = await call('GET', '/api/money'); return { status: m.status, money: m.body, envelope: m.body && m.body.envelopes ? m.body.envelopes.find(e => e.hash === hash) : undefined }; };
  return {
    origin,
    issuingInfo: () => call('GET', '/api/issuing'),
    money: () => call('GET', '/api/money'),
    view: own,
    propose: terms => call('POST', '/api/money/envelopes', terms),
    decide: (hash, d) => call('POST', `/api/money/envelopes/${hash}/${d}`, {}),
    reconcile: hash => call('POST', `/api/money/envelopes/${hash}/reconcile`, {}),
  };
}

// ---------- helpers ----------
const usd = env => (env && env.buckets || []).find(b => b.currency === 'usd') || { unresolvedCents: 0, reservedCents: 0, declinedPendingCents: 0, settledCents: 0, availableCents: 0, overspendCents: 0 };
// [unresolved, reserved, settled, available]: the same tuple issuer-regression.cjs asserts.
const tuple = env => { const b = usd(env); return [b.unresolvedCents, b.reservedCents, b.settledCents, b.availableCents]; };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const lastReq = a => { const h = a && a.request_history; return Array.isArray(h) && h.length ? h[h.length - 1] : null; };
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const sleepReal = ms => new Promise(r => setTimeout(r, ms));

// ---------- the proof ----------
// opts: { stripe, alter, cardId, accountId, botId, merchantId, otherMerchantId, maxCents, clock, sleep, pollMs, settleMs, log }
async function run(opts) {
  const { stripe, alter, cardId, accountId } = opts;
  const merchantId = opts.merchantId || 'alter_proof_merchant_1', otherMerchantId = opts.otherMerchantId || 'alter_proof_merchant_other';
  const MAX = opts.maxCents || 4000, sleep = opts.sleep || sleepReal, pollMs = opts.pollMs ?? 1000, settleMs = opts.settleMs ?? 30000;
  const clock = opts.clock || Date.now, log = opts.log || (() => {});
  const steps = [], latencies = [], observations = {};
  let hash = null, histLen = 0;
  const failed = new Set();

  const view = async () => (await alter.view(hash)).envelope;
  // Poll the owner view until pred(env) holds. Records how long the real webhook chain took.
  async function settle(pred) {
    const t0 = clock(); let env = await view();
    while (!pred(env) && clock() - t0 < settleMs) { await sleep(pollMs); env = await view(); }
    return { env, ok: !!pred(env), ms: clock() - t0 };
  }
  const newHistory = env => { const h = (env && env.history) || []; const out = h.slice(histLen).map(x => x.kind); histLen = h.length; return out; };
  async function step(id, title, fn, { needs = [], observeOnly = false } = {}) {
    const dep = needs.find(n => failed.has(n));
    if (dep) { failed.add(id); steps.push({ id, title, status: 'skipped', note: 'depends on ' + dep + ' (failed or skipped)' }); return null; } // skips propagate to dependents
    const t0 = clock(); log(`${id} ${title}`);
    let r;
    try { r = await fn(); } catch (e) { r = { pass: false, note: 'error: ' + redact(e && e.message || e) }; }
    const status = r.pass === undefined ? 'observed' : r.pass ? 'pass' : observeOnly ? 'observed' : 'fail';
    if (status === 'fail') failed.add(id);
    steps.push({ id, title, status, ms: clock() - t0, ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'pass')) });
    return r;
  }
  const auth = async (amount, merchant = merchantId) => {
    const t0 = clock();
    const a = await stripe.testAuth({ card: cardId, amount, currency: 'usd', merchant_data: { category: 'computer_software_stores', network_id: merchant, name: 'Alter proof merchant' } });
    const ms = clock() - t0; latencies.push(ms);
    return { a, ms, req: lastReq(a) };
  };
  const decl = (r, wantApproved) => r.a.approved === wantApproved && (!r.req || (wantApproved ? /approved/.test(r.req.reason || '') : /declined/.test(r.req.reason || '')));
  const ids = {};

  await step('P0', 'Preflight: sandbox, endpoint, owner session, flag, eligible bot', async () => {
    const info = await alter.issuingInfo();
    const m = await alter.money();
    const acct = await stripe.account().catch(e => ({ error: e.message }));
    const bot = opts.botId || (m.body && m.body.envelopeEligible && (m.body.envelopeEligible.bots[0] || {}).id);
    ids.bot = bot;
    observations.stripeAccount = acct.error ? { error: acct.error } : { id: acct.id, type: acct.type || null, country: acct.country || null, cardIssuing: (acct.capabilities || {}).card_issuing || null };
    observations.accountIdUsedForEnvelope = accountId;
    const problems = [];
    if (!(info.body && info.body.mode === 'stripe_test_only' && info.body.liveEnabled === false)) problems.push('GET /api/issuing did not report stripe_test_only / liveEnabled:false (status ' + info.status + ')');
    if (m.status === 401) problems.push('owner session rejected (401): ALTER_SESSION_TOKEN missing, expired or for another host');
    else if (!(m.body && m.body.envelopesEnabled === true)) problems.push('envelopesEnabled is not true: set ALTER_SPEND_ENVELOPES=1 on the deployment');
    if (!bot) problems.push('no active bot is eligible for an envelope');
    return { pass: problems.length === 0, note: problems.join('; ') || 'ok', expected: 'stripe_test_only, envelopes enabled, owner session valid, a bot available', actual: { issuing: info.body && info.body.mode, envelopesEnabled: m.body && m.body.envelopesEnabled, bot } };
  });

  await step('E1', `Propose and approve a $${MAX / 100} envelope for the card`, async () => {
    const p = await alter.propose({ botId: ids.bot, accountId, cardId, merchantNetworkId: merchantId, currency: 'usd', maxTotalCents: MAX, expiresAtMs: clock() + 2 * 3600 * 1000 });
    if (p.status !== 201) return { pass: false, note: 'propose -> ' + p.status + ' ' + redact(JSON.stringify(p.body)).slice(0, 160) };
    hash = p.body.envelope.hash;
    const d = await alter.decide(hash, 'approve');
    const env = await view(); newHistory(env);
    return { pass: d.status === 200 && d.body.code === 'approved' && env.activeForCard === true, expected: 'approved, active for card', actual: { decide: d.body.code, activeForCard: env && env.activeForCard }, hash };
  }, { needs: ['P0'] });

  await step('A1', 'Authorization inside the envelope ($10) is approved by the webhook, reserved, then confirmed', async () => {
    const r = await auth(1000); ids.a1 = r.a.id;
    const s = await settle(e => same(tuple(e), [0, 1000, 0, MAX - 1000]));
    const kinds = newHistory(s.env);
    return { pass: decl(r, true) && s.ok, expected: { stripeApproved: true, requestHistory: 'webhook_approved', tuple: [0, 1000, 0, MAX - 1000] }, actual: { stripeApproved: r.a.approved, requestHistory: r.req && r.req.reason, alterReason: (r.a.metadata || {}).alter_reason || null, tuple: tuple(s.env), historyKinds: kinds }, webhookRoundTripMs: r.ms, confirmedAfterMs: s.ms };
  }, { needs: ['E1'] });

  await step('O1', 'Observe real event shapes (account present? card string or object? capture sign?)', async () => {
    const out = {};
    for (const type of ['issuing_authorization.request', 'issuing_authorization.created', 'issuing_authorization.updated', 'issuing_transaction.created']) {
      try {
        const l = await stripe.listEvents(type, 3); const e = (l.data || [])[0];
        if (!e) { out[type] = 'no events found'; continue; }
        const o = (e.data || {}).object || {};
        out[type] = { accountFieldPresent: typeof e.account === 'string', account: e.account || null, livemode: e.livemode, cardIs: typeof o.card === 'object' && o.card ? 'object' : typeof o.card, authorizationIs: typeof o.authorization, merchantNetworkId: ((o.merchant_data || {}).network_id) || null, amountSample: o.amount ?? (o.pending_request || {}).amount ?? null, status: o.status || null, type: o.type || null };
      } catch (e) { out[type] = 'unavailable: ' + redact(e.message); }
    }
    observations.events = out;
    const req = out['issuing_authorization.request'];
    const risk = req && req.accountFieldPresent === false ? 'event.account is ABSENT on this account\'s events. issuerEnvelopeTarget() and issuerEnvelopeForEvent() require /^acct_/ in event.account, so an envelope would never be found for these events. See docs/ENVELOPE-SANDBOX-PROOF.md, "Direct account vs Connect".' : null;
    return { note: risk || 'recorded in observations.events', ...(risk ? { pass: false } : {}), actual: out };
  }, { needs: ['E1'] }); // runs even when A1 failed: that is exactly when the event shape explains why

  await step('A2', 'Authorization above the available cents ($35 with $30 available) is declined, nothing moves', async () => {
    const before = tuple(await view()); const r = await auth(3500);
    await sleep(Math.min(pollMs * 3, 3000)); const env = await view(); const kinds = newHistory(env);
    return { pass: decl(r, false) && same(tuple(env), before), expected: { stripeApproved: false, requestHistory: 'webhook_declined', tuple: before }, actual: { stripeApproved: r.a.approved, requestHistory: r.req && r.req.reason, alterReason: (r.a.metadata || {}).alter_reason || null, tuple: tuple(env), historyKinds: kinds }, webhookRoundTripMs: r.ms };
  }, { needs: ['A1'] });

  await step('A3', 'Authorization at a different merchant is declined, nothing moves', async () => {
    const before = tuple(await view()); const r = await auth(100, otherMerchantId);
    await sleep(Math.min(pollMs * 3, 3000)); const env = await view(); newHistory(env);
    return { pass: decl(r, false) && same(tuple(env), before), expected: { stripeApproved: false, tuple: before }, actual: { stripeApproved: r.a.approved, requestHistory: r.req && r.req.reason, alterReason: (r.a.metadata || {}).alter_reason || null, tuple: tuple(env) }, webhookRoundTripMs: r.ms };
  }, { needs: ['A1'] });

  await step('C1', 'Partial capture of the $10 authorization ($4, closing it) settles $4 and releases $6', async () => {
    await stripe.capture(ids.a1, { capture_amount: 400, close_authorization: true });
    const s = await settle(e => same(tuple(e), [0, 0, 400, MAX - 400]));
    const kinds = newHistory(s.env);
    // Stripe does not order the closed update against the capture transaction (https://docs.stripe.com/webhooks). A reordered capture is expected and
    // handled (capture_after_close_reordered: no discrepancy, no notice). Any discrepancy on an ordinary partial capture is a real finding.
    const bad = kinds.find(k => /^discrepancy:/.test(k)), reordered = kinds.includes('capture_after_close_reordered');
    return { pass: s.ok && !bad, expected: { tuple: [0, 0, 400, MAX - 400], discrepancies: 0 }, actual: { tuple: tuple(s.env), historyKinds: kinds }, settledAfterMs: s.ms, note: bad ? 'DISCREPANCY ' + bad + ' on an ordinary partial capture: the owner would be shown a notice.' : reordered ? 'ORDERING (handled): Stripe delivered "closed" before the capture; recorded as capture_after_close_reordered, no owner notice, totals correct.' : 'events arrived in the expected order' };
  }, { needs: ['A1'] });

  await step('V1', 'Reversal of a $5 authorization releases it', async () => {
    const r = await auth(500); ids.v1 = r.a.id;
    const held = await settle(e => same(tuple(e), [0, 500, 400, MAX - 400 - 500]));
    await stripe.reverse(ids.v1, {});
    const s = await settle(e => same(tuple(e), [0, 0, 400, MAX - 400]));
    return { pass: decl(r, true) && held.ok && s.ok, expected: { held: [0, 500, 400, MAX - 900], afterReverse: [0, 0, 400, MAX - 400] }, actual: { held: tuple(held.env), afterReverse: tuple(s.env), historyKinds: newHistory(s.env) }, webhookRoundTripMs: r.ms, releasedAfterMs: s.ms };
  }, { needs: ['C1'] });

  await step('X1', 'Expiry of a $5 authorization releases it', async () => {
    const r = await auth(500); ids.x1 = r.a.id;
    const held = await settle(e => same(tuple(e), [0, 500, 400, MAX - 900]));
    await stripe.expire(ids.x1);
    const s = await settle(e => same(tuple(e), [0, 0, 400, MAX - 400]));
    return { pass: decl(r, true) && held.ok && s.ok, expected: { afterExpire: [0, 0, 400, MAX - 400] }, actual: { held: tuple(held.env), afterExpire: tuple(s.env), historyKinds: newHistory(s.env) }, releasedAfterMs: s.ms };
  }, { needs: ['C1'] });

  await step('R1', 'Refund of the captured transaction (observed only: how Stripe links a refund is unverified)', async () => {
    const a = await stripe.getAuth(ids.a1); const tx = a.transactions && a.transactions.data && a.transactions.data[0];
    if (!tx) return { pass: false, note: 'authorization has no expanded transaction to refund' };
    const before = tuple(await view()); await stripe.refund(tx.id, { refund_amount: 100 });
    await sleep(Math.min(settleMs, 6000)); const env = await view(); const kinds = newHistory(env);
    observations.refund = { authorizationOnRefundTx: 'unknown until the refund event is listed', tupleBefore: before, tupleAfter: tuple(env), historyKinds: kinds };
    return { note: 'Expectation if Stripe links the refund to the authorization: settled drops by 100. Anything else is the finding.', actual: { before, after: tuple(env), historyKinds: kinds } };
  }, { needs: ['C1'], observeOnly: true });

  await step('P1', 'Provider reader maps real Stripe objects: open, voided, expired, closed(+captured cents)', async () => {
    const reader = ENVELOPE.stripeReader({ fetch: stripe.fetch, key: stripe.key });
    const open = await auth(100); ids.open = open.a.id;
    const got = { open: await reader(ids.open), voided: await reader(ids.v1), expired: await reader(ids.x1), closed: await reader(ids.a1) };
    await stripe.reverse(ids.open, {});
    const want = { open: 'open', voided: 'voided', expired: 'expired', closed: 'closed' };
    const bad = Object.keys(want).filter(k => got[k].state !== want[k]);
    const capOk = got.closed.capturedCents === 400 || got.closed.capturedCents === 300; // 300 only if the refund above was linked
    return { pass: bad.length === 0 && capOk, expected: { states: want, closedCapturedCents: '400 (300 if the refund linked to the authorization)' }, actual: got, note: bad.length ? 'mismatched: ' + bad.join(',') : 'reader agrees with Stripe on all four states' };
  }, { needs: ['V1', 'X1'] });

  // The ledger-vs-provider check. There is no job receipt carrying envelope cost yet, so this compares the envelope's own settled cents (the
  // authoritative card record Alter keeps) with what Stripe says was captured, net of refunds, across every authorization this run created.
  await step('T1', 'Reconciliation: envelope settled cents equal the provider\'s net captured cents across every proof authorization', async () => {
    const env = await view(), settled = usd(env).settledCents, rows = []; let net = 0;
    for (const id of [ids.a1, ids.v1, ids.x1, ids.open].filter(Boolean)) {
      const a = await stripe.getAuth(id), tx = (a.transactions && a.transactions.data) || [];
      const n = tx.reduce((s, t) => s - Number(t.amount || 0), 0); net += n; rows.push({ authorization: id, status: a.status, transactions: tx.length, netCapturedCents: n });
    }
    return { pass: settled === net, expected: { envelopeSettledCents: net }, actual: { envelopeSettledCents: settled, providerNetCapturedCents: net, authorizations: rows }, note: settled === net ? 'envelope and provider agree to the cent' : 'MISMATCH: the envelope and Stripe disagree on what was captured' };
  }, { needs: ['C1'] });

  await step('K1', 'Revoked envelope declines at card use', async () => {
    const d = await alter.decide(hash, 'revoke');
    const r = await auth(100);
    return { pass: d.status === 200 && decl(r, false), expected: { stripeApproved: false }, actual: { revoke: d.body.code, stripeApproved: r.a.approved, requestHistory: r.req && r.req.reason, alterReason: (r.a.metadata || {}).alter_reason || null }, webhookRoundTripMs: r.ms };
  }, { needs: ['E1'] });

  await step('L1', 'Webhook latency against the 2s issuer window (upper bound: includes Stripe test-helper overhead)', async () => {
    const lat = { samples: latencies.length, minMs: Math.min(...latencies), medianMs: median(latencies), maxMs: Math.max(...latencies), firstMs: latencies[0] };
    observations.latency = lat;
    return { pass: lat.maxMs < 2000, expected: 'every round trip < 2000ms', actual: lat, note: 'First sample is the cold start. A pass here does not prove production latency: these are test-helper calls.' };
  }, { needs: ['A1'] });

  const manual = [
    'Duplicate delivery: Dashboard > Developers > Webhooks > the endpoint > resend an issuing_authorization.created event; the envelope must not change (history gains only a duplicate marker).',
    'Webhook timeout: temporarily make the endpoint slow (or point it at a sleeping URL) and confirm Stripe records webhook_timeout and declines. Restore after.',
    'Seven-day reconcile: cannot be fast-forwarded in a sandbox. After a week, an uncaptured open authorization should show under "past deadline" and reconcile only after the provider read.',
    'Webhook endpoint secret rotation: rotate whsec and confirm the new secret is accepted and the old one is rejected (400).',
  ];
  const counts = steps.reduce((m, s) => (m[s.status] = (m[s.status] || 0) + 1, m), {});
  return { startedAt: new Date(clock()).toISOString(), envelopeHash: hash, cardId, accountId, counts, ok: !steps.some(s => s.status === 'fail'), steps, observations, manual };
}

function markdown(rep) {
  const L = [`# Envelope sandbox proof`, '', `Result: **${rep.ok ? 'PASS' : 'FAIL'}** (${Object.entries(rep.counts).map(([k, v]) => k + ' ' + v).join(', ')})`, `Card ${rep.cardId} on ${rep.accountId}; envelope ${rep.envelopeHash || 'not created'}.`, '', '| Step | Status | Note |', '|---|---|---|'];
  for (const s of rep.steps) L.push(`| ${s.id} ${s.title.replace(/\|/g, '/')} | ${s.status}${s.webhookRoundTripMs != null ? ' (' + s.webhookRoundTripMs + 'ms)' : ''} | ${(s.note || '').replace(/\|/g, '/').slice(0, 220)} |`);
  L.push('', '## Details', '```json', JSON.stringify({ steps: rep.steps, observations: rep.observations }, null, 1), '```', '', '## Manual checks this script cannot do', ...rep.manual.map(m => '- ' + m));
  return L.join('\n');
}

// ---------- setup + CLI ----------
async function setup(stripe) {
  const h = await stripe.createCardholder({ type: 'individual', name: 'Alter Proof', email: 'alter-proof@example.com', phone_number: '+18008675309', status: 'active', individual: { first_name: 'Alter', last_name: 'Proof', dob: { day: 1, month: 1, year: 1990 } }, billing: { address: { line1: '1 Test St', city: 'San Francisco', state: 'CA', postal_code: '94111', country: 'US' } } });
  const c = await stripe.createCard({ cardholder: h.id, currency: 'usd', type: 'virtual', status: 'active' });
  return { cardholderId: h.id, cardId: c.id, livemode: c.livemode };
}
async function main(argv, env) {
  const cmd = argv[0] || 'help';
  if (cmd === 'help' || cmd === '--help') { console.log('usage: node scripts/envelope-sandbox-proof.cjs <setup|run> [--yes]\nenv: STRIPE_TEST_SECRET_KEY, ALTER_BASE_URL, ALTER_SESSION_TOKEN, PROOF_CARD_ID, PROOF_ACCOUNT_ID (optional), PROOF_BOT_ID (optional), PROOF_OUT (optional dir)\nSee docs/ENVELOPE-SANDBOX-PROOF.md'); return 0; }
  const stripe = stripeClient({ key: env.STRIPE_TEST_SECRET_KEY });
  if (cmd === 'setup') {
    const out = await setup(stripe);
    if (out.livemode !== false) { console.error('Refusing: card is not test-mode.'); return 2; }
    console.log(JSON.stringify(out, null, 1) + '\nExport PROOF_CARD_ID=' + out.cardId + ' and run again with "run".'); return 0;
  }
  if (cmd !== 'run') { console.error('unknown command ' + cmd); return 2; }
  if (!env.ALTER_BASE_URL || !env.ALTER_SESSION_TOKEN || !env.PROOF_CARD_ID) { console.error('ALTER_BASE_URL, ALTER_SESSION_TOKEN and PROOF_CARD_ID are required (run "setup" for a card).'); return 2; }
  const alter = alterClient({ base: env.ALTER_BASE_URL, token: env.ALTER_SESSION_TOKEN });
  const accountId = env.PROOF_ACCOUNT_ID || (await stripe.account()).id;
  console.log(`Target: ${alter.origin}\nStripe account: ${accountId} (test mode)\nCard: ${env.PROOF_CARD_ID}\nThis creates and revokes one $40 envelope in the owner workspace of that deployment and makes test-mode authorizations only.`);
  if (!argv.includes('--yes')) { console.log('Re-run with --yes to proceed.'); return 0; }
  const rep = await run({ stripe, alter, cardId: env.PROOF_CARD_ID, accountId, botId: env.PROOF_BOT_ID, log: s => console.log('  ' + s) });
  const dir = env.PROOF_OUT || path.join(process.cwd(), 'proof-output'); fs.mkdirSync(dir, { recursive: true });
  const stamp = rep.startedAt.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, `envelope-proof-${stamp}.json`), redact(JSON.stringify(rep, null, 1)));
  fs.writeFileSync(path.join(dir, `envelope-proof-${stamp}.md`), redact(markdown(rep)));
  console.log(`\n${rep.ok ? 'PASS' : 'FAIL'}: ${JSON.stringify(rep.counts)}\nReport written to ${dir}`);
  return rep.ok ? 0 : 1;
}

module.exports = { run, markdown, setup, stripeClient, alterClient, tuple, redact, STRIPE_VERSION };
if (require.main === module) main(process.argv.slice(2), process.env).then(c => process.exit(c), e => { console.error(redact(e && e.message || e)); process.exit(2); });
