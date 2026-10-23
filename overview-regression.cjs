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
  let m = BB.overviewModel(B, { tasks: [] });
  assert.equal(m.context.length, 1); assert.equal(m.context[0].title, 'About Acme Plumbing');
  let h = BB.overviewHTML(m);
  ['No ongoing responsibilities yet.', 'No results yet.', 'No exceptions. Nothing is waiting on you.'].forEach(t => assert(h.includes(t), 'empty label: ' + t));
  assert(h.includes('About Acme Plumbing'));
  const S = { tasks: [{ id: 't1', title: 'Weekly memo', status: 'done', finishedAt: '2026-10-20T10:00:00Z' }, { id: 't2', title: 'Quote follow-up', status: 'failed', finishedAt: '2026-10-21T10:00:00Z' }, { id: 't3', title: 'Fake', status: 'done', synthetic: true }] };
  const B2 = Object.assign({}, B, { responsibilities: [{ id: 'r1', title: 'Missed-call desk', status: 'active', runs: [{ id: 'run1', at: '2026-10-22T10:00:00Z', output: 'Draft reply', blockedStep: 'Sending the reply' }] }] });
  m = BB.overviewModel(B2, S);
  assert.equal(m.responsibilities.length, 1); assert.equal(m.results.length, 2, 'synthetic jobs excluded');
  assert.equal(m.exceptions.length, 2); h = BB.overviewHTML(m);
  assert(h.includes('Needs you: Sending the reply') && h.includes('Job failed'));
  // 3) engine off: state says unconfigured (real server, no key) -> plain notice, no proposals even if drafts exist
  assert.equal(B.engine.configured, false);
  const withDraft = Object.assign({}, B, { proposals: [{ id: 'p1', title: 'Invented', status: 'draft', stale: [] }] });
  m = BB.overviewModel(withDraft, {}); h = BB.overviewHTML(m);
  assert.equal(m.engineOn, false); assert.equal(m.proposals.length, 0); assert(h.includes('Reasoning engine not connected')); assert(!h.includes('Invented'));
  ['engine_not_configured', 'engine_not_enabled'].forEach(code => { const mm = BB.overviewModel({ error: 'x', code, _status: 503 }, {}); assert.equal(mm.engineOn, false); assert.equal(mm.engineCode, code); assert.equal(mm.proposals.length, 0); });
  // engine on: real drafts shown
  m = BB.overviewModel(Object.assign({}, withDraft, { engine: { configured: true, enabled: true } }), {});
  assert.equal(m.proposals.length, 1); assert(!BB.overviewHTML(m).includes('Reasoning engine not connected'));
  // 4) functional labels only in new files
  ['public/js/overview.js', 'public/js/onboarding.js'].forEach(f => assert(!/grok|instinct|muse|claude/i.test(read(f)), 'provider name in ' + f));
  // routing: overview is the default view
  const app = read('public/js/app.js'), html = read('public/app.html');
  assert(/VIEWS = \['overview'/.test(app) && /: 'overview'/.test(app)); assert(html.includes('id="v-overview"') && html.includes('/js/overview.js'));
  console.log('PASS overview: business-first onboarding saves via /business/sources and shows in state, sections from real data with labeled empty states, engine-off shows no proposals, no provider names, Overview is default');
})().catch(e => { console.error(e); process.exit(1); });
