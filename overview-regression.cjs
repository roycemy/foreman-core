// Lane 1: owner overview + business-first first run. Front-end model is fed by the real server bizState/bizSourceAdd (in-memory store), no network.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
// server side: real business functions with an in-memory redis stand-in
const srv = { require, module: { exports: {} }, process: { env: {} }, global: {}, console, URL, Buffer, AbortSignal, setTimeout, clearTimeout, fetch: async () => { throw Error('NO NETWORK'); } };
vm.runInNewContext(read('api/index.js') + '\nmodule.exports.t={bizSourceAdd,bizState};', srv);
const api = srv.module.exports.t;
// client side
const win = { BB: undefined };
const ctx = { window: win, console, fetch: () => { throw Error('NO NETWORK'); } };
vm.createContext(ctx);
['public/js/onboarding.js', 'public/js/overview.js'].forEach(f => vm.runInContext(read(f), ctx));
const BB = win.BB;
(async () => {
  // 1) new workspace -> onboarding; saved note appears in /business/state
  let B = await api.bizState();
  assert.equal(BB.needsOnboarding(B), true, 'empty workspace lands on onboarding');
  assert(/Tell Alter about your business/.test(BB.onboardingHTML()));
  let posted = null;
  BB.api = async (p, m, b) => { posted = { p, m, b }; const r = await api.bizSourceAdd(b); return r.body; };
  assert.equal((await BB.saveOnboarding('', 'x')).error, 'Give it a short title');
  const j = await BB.saveOnboarding('Acme Plumbing', 'Calls come in while we are on jobs.');
  assert.equal(posted.p, '/api/business/sources'); assert.equal(posted.m, 'POST'); assert.equal(posted.b.kind, 'note');
  assert(j.source && j.source.id);
  B = await api.bizState();
  assert.equal(BB.needsOnboarding(B), false);
  assert(B.sources.some(s => s.id === j.source.id && /Calls come in/.test(s.text)), 'saved note is in business state');
  // 2) sections from real data, empty states labeled
  let m = BB.overviewModel(B, { tasks: [] }, []);
  assert.equal(m.context.length, 1); assert.equal(m.context[0].title, 'About Acme Plumbing');
  let h = BB.overviewHTML(m);
  ['No ongoing responsibilities yet.', 'No results yet.', 'No open exceptions.', 'Nothing needs you right now.'].forEach(t => assert(h.includes(t), 'empty label: ' + t));
  assert(h.includes('About Acme Plumbing'));
  // pending approvals: unknown -> never "nothing needs you"; known -> each listed with an inbox link
  h = BB.overviewHTML(BB.overviewModel(B, {}, null)); assert(!h.includes('Nothing needs you') && h.includes('Checking what needs you'));
  const pend = [{ id: 'a1', type: 'approval', q: { title: 'Send quote to Lee' } }, { id: 'a2', type: 'spend', q: { title: 'Buy parts $40' } }];
  m = BB.overviewModel(B, {}, pend); h = BB.overviewHTML(m, { itemCard: id => '<div data-card="' + id + '"><button data-a="approve">Approve</button></div>' });
  assert.equal(m.pending.length, 2); assert(!h.includes('Nothing needs you')); assert(h.includes('data-card="a1"') && h.includes('data-card="a2"') && h.includes('Open all 2 in the Inbox') && h.includes('href="#inbox"'));
  h = BB.overviewHTML(m); assert(h.includes('Send quote to Lee') && h.includes('Spend approval'), 'fallback card without itemCard');
  // results / exceptions: latest blocked run only, failed job resolved by a later success
  const S = { tasks: [{ id: 't1', title: 'Weekly memo', status: 'done', finishedAt: '2026-10-20T10:00:00Z' }, { id: 't2', title: 'Quote follow-up', status: 'failed', finishedAt: '2026-10-21T10:00:00Z' }, { id: 't3', title: 'Fake', status: 'done', synthetic: true }] };
  const B2 = Object.assign({}, B, { responsibilities: [{ id: 'r1', title: 'Missed-call desk', status: 'active', runs: [{ id: 'run1', at: '2026-10-22T10:00:00Z', output: 'Draft reply', blockedStep: 'Sending the reply' }] }] });
  m = BB.overviewModel(B2, S, []);
  assert.equal(m.responsibilities.length, 1); assert.equal(m.results.length, 2, 'synthetic jobs excluded');
  assert.equal(m.exceptions.length, 2); h = BB.overviewHTML(m);
  assert(h.includes('Needs you: Sending the reply') && h.includes('Job failed') && h.includes('href="#receipts/t1"'));
  const B3 = Object.assign({}, B2, { responsibilities: [Object.assign({}, B2.responsibilities[0], { runs: B2.responsibilities[0].runs.concat([{ id: 'run2', at: '2026-10-23T10:00:00Z', output: 'ok' }]) })] });
  const S3 = { tasks: S.tasks.concat([{ id: 't4', title: 'Quote follow-up', status: 'done', finishedAt: '2026-10-22T10:00:00Z' }]) };
  assert.equal(BB.overviewModel(B3, S3, []).exceptions.length, 0, 'later run/job resolves historical blocks and failures');
  const B4 = Object.assign({}, B2, { responsibilities: [Object.assign({}, B2.responsibilities[0], { status: 'retired' })] });
  assert.equal(BB.overviewModel(B4, {}, []).exceptions.length, 0, 'retired responsibility has no open exception');
  // 3) engine off (real server, no key): saved proposals stay visible + actionable; generation/run labeled unavailable
  assert.equal(B.engine.configured, false);
  const withDraft = Object.assign({}, B2, { proposals: [{ id: 'p1', title: 'Invented', status: 'draft', stale: [] }] });
  m = BB.overviewModel(withDraft, {}, []); h = BB.overviewHTML(m);
  assert.equal(m.engineOn, false); assert.equal(m.proposals.length, 1); assert(h.includes('Reasoning engine not connected') && h.includes('Saved proposals') && h.includes('New proposals unavailable'));
  assert(h.includes('data-ov-activate="p1"') && h.includes('data-ov-reject="p1"') && h.includes('data-ov-pause="r1"'), 'saved records actionable');
  assert(/<button class="b ink" type="submit" disabled/.test(h) && h.includes('Running needs the reasoning engine'), 'run disabled with reason');
  ['engine_not_configured', 'engine_not_enabled'].forEach(code => { const mm = BB.overviewModel({ error: 'x', code, _status: 503 }, {}, []); assert.equal(mm.engineOn, false); assert.equal(mm.engineCode, code); });
  m = BB.overviewModel(Object.assign({}, withDraft, { engine: { configured: true, enabled: true } }), {}, []); h = BB.overviewHTML(m);
  assert.equal(m.proposals.length, 1); assert(!h.includes('Reasoning engine not connected') && !h.includes('disabled') && h.includes('>Proposals<'));
  // stale / error states
  h = BB.overviewHTML(m, { fetchedAt: 1000, now: 1000 + 200000 }); assert(h.includes('may be out of date') && h.includes('data-ov-retry'));
  h = BB.overviewHTML(m, { fetchedAt: 1000, now: 2000, error: 'Network error' }); assert(h.includes('Couldn’t refresh: Network error') && h.includes('>Retry<'));
  // disclosure: accurate storage + model processing + synthetic-only warning, no "nothing is sent"
  const ob = BB.onboardingHTML(); h = BB.overviewHTML(m);
  [ob, h].forEach(x => { assert(x.includes('Redis') && x.includes('scoped to this workspace') && x.includes('model provider') && x.includes('synthetic or redacted data only')); assert(!/Nothing is sent anywhere/i.test(x)); });
  const apiSrc = read('api/index.js'); assert(/KV_REST_API_URL|UPSTASH/.test(apiSrc) && /w:/.test(apiSrc) && /api\.groq\.com|ALTER_MODEL/.test(apiSrc), 'disclosure claims match server');
  // two-workspace race: slow A response dropped after switching to B
  let rel = {}; BB.api = p => new Promise(res => { rel[BB.who.workspace] = res; });
  BB.who = { email: 'o@x.co', workspace: 'wsA' }; const pa = BB.overviewCtl.load();
  BB.who = { email: 'o@x.co', workspace: 'wsB' }; const pb = BB.overviewCtl.load();
  rel.wsB({ sources: [{ id: 'sB', title: 'B notes' }], engine: {} }); await pb;
  rel.wsA({ sources: [{ id: 'sA', title: 'A notes' }], engine: {} }); await pa;
  assert.equal(BB.overviewCtl.key, 'o@x.co|wsB'); assert.equal(BB.overviewCtl.B.sources[0].id, 'sB', 'B data wins'); assert(BB.overviewCtl.dropped >= 1, 'late A response dropped');
  BB.who = { email: 'p@x.co', workspace: 'wsB' }; BB.api = async () => ({ sources: [], engine: {} }); await BB.overviewCtl.load();
  assert.equal(BB.overviewCtl.B.sources.length, 0, 'different account, same workspace id -> fresh cache');
  // 4) functional labels only in new files
  ['public/js/overview.js', 'public/js/onboarding.js'].forEach(f => assert(!/grok|instinct|muse|claude/i.test(read(f)), 'provider name in ' + f));
  // routing: overview is the default view
  const app = read('public/js/app.js'), html = read('public/app.html');
  assert(/VIEWS = \['overview'/.test(app) && /: 'overview'/.test(app)); assert(html.includes('id="v-overview"') && html.includes('/js/overview.js'));
  console.log('PASS overview: business-first onboarding saves via /business/sources and shows in state, sections from real data with labeled empty states, approvals listed (never "nothing" while unknown), engine-off keeps saved proposals actionable, stale/error states, accurate disclosure, two-workspace race dropped, no provider names, Overview is default');
})().catch(e => { console.error(e); process.exit(1); });
