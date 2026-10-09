// vNext client boundaries, run against the real browser scripts in a sandbox (no DOM library, no network):
// - the floor count and every "all on track" / "handling it" summary follow the same 60-second rule as the went-dark banner
// - "With you" comes only from owner-conversation events, never presence heartbeats
// - the public "Run this job" only copies the template and budget: no request, no account, nothing runs
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const NOW = Date.parse('2026-10-09T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();

/* ---------- core.js ---------- */
const net = [];
const win = { BB: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1440, localStorage: { getItem: () => null, setItem() { } } };
const ctx = { window: win, document: { addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], hidden: false }, matchMedia: win.matchMedia, innerWidth: 1440, localStorage: win.localStorage, fetch: (...a) => { net.push(a); throw Error('NO NETWORK'); }, setInterval: () => 0, clearInterval() { }, setTimeout: () => 0, clearTimeout() { }, console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } } };
ctx.Date.parse = Date.parse; ctx.Date.UTC = Date.UTC;
vm.createContext(ctx); vm.runInContext(read('public/js/core.js'), ctx);
const BB = win.BB;
const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'custom', connection: { status: 'active', transport: 'gateway' }, lastSeen: ago(10), state: null }, o || {});
function state(agents, extra) { BB.S = Object.assign({ killed: false, agents, tasks: [], requests: [], events: [] }, extra || {}); BB.money = { requests: [] }; BB.cards = { proposals: [] }; }

// 1. everyone active, nothing pending: the only case that may say "all on track"
state([bot('a1', 'Muse'), bot('a2', 'Grok Bot')]);
let s = BB.teamSummary();
assert.equal(s.count, '2 of 2 active'); assert.equal(s.calm, true); assert.equal(s.text, '2 of 2 active · all on track');
assert.equal(BB.onYou().length, 0);

// 2. one bot went dark (connected, no accepted activity for 60s): the count, the summary and "on you" all say so
state([bot('a1', 'Muse', { lastSeen: ago(180) }), bot('a2', 'Grok Bot')]);
s = BB.teamSummary();
assert.equal(s.count, '1 of 2 active'); assert.equal(s.calm, false);
assert.ok(s.text.includes('Muse went dark'), s.text); assert.ok(!/all on track|handling/i.test(s.text), s.text);
assert.deepEqual(BB.onYou().map(i => i.type), ['dark']);
// the banner rule and the count agree for every bot: dark implies inactive, and only active bots are counted
for (const a of BB.S.agents) { if (BB.wentDark(a)) assert.equal(BB.signal(a), 'inactive'); }
assert.equal(s.active, BB.S.agents.filter(a => BB.signal(a) !== 'inactive').length);
// exactly at the 60-second edge the bot is dark (same >= 60000 rule as the banner)
state([bot('a1', 'Muse', { lastSeen: ago(60) })]); assert.equal(BB.wentDark(BB.S.agents[0]), true); assert.equal(BB.teamSummary().calm, false);
state([bot('a1', 'Muse', { lastSeen: ago(59) })]); assert.equal(BB.wentDark(BB.S.agents[0]), false); assert.equal(BB.teamSummary().calm, true);

// 3. something needs the owner: never "all on track"
state([bot('a1', 'Muse')], { requests: [{ id: 'q1', agentId: 'a1', status: 'pending', action: 'notes.write', params: {}, costCents: 2, createdAt: ago(5) }] });
s = BB.teamSummary(); assert.equal(s.calm, false); assert.ok(s.text.includes('1 needs you'), s.text); assert.ok(!/all on track/.test(s.text));
state([bot('a1', 'Muse', { lastSeen: ago(300) }), bot('a2', 'Grok Bot')], { tasks: [{ id: 't1', title: 'x', status: 'queued', assignee: null, createdAt: ago(5) }] });
s = BB.teamSummary(); assert.ok(s.text.includes('1 needs you') && s.text.includes('Muse went dark'), s.text);

// 4. a running job whose bot is dark is not counted as running or busy
state([bot('a1', 'Muse', { lastSeen: ago(120) })], { tasks: [{ id: 't1', title: 'Memo', status: 'running', assignee: 'a1', startedAt: ago(600), createdAt: ago(600) }] });
s = BB.teamSummary(); assert.equal(s.running, 0); assert.equal(s.working, 0); assert.equal(BB.botState(BB.S.agents[0]).kind, 'dark');
state([bot('a1', 'Muse')], { tasks: [{ id: 't1', title: 'Memo', status: 'running', assignee: 'a1', startedAt: ago(600), createdAt: ago(600) }] });
s = BB.teamSummary(); assert.equal(s.running, 1); assert.equal(s.text, '1 of 1 active · 1 busy');

// 5. "With you" only from owner-conversation telemetry; presence heartbeats and INTERACTION events never count
state([bot('a1', 'Muse')], { events: [{ agentId: 'a1', at: ago(5), type: 'interaction', kind: 'INTERACTION', source: 'mcp', text: 'Available: interacting with owner' }, { agentId: 'a1', at: ago(4), type: 'reported', kind: 'INTERACTION', text: 'talking' }] });
assert.equal(BB.withOwner(BB.S.agents[0]), false); assert.notEqual(BB.botState(BB.S.agents[0]).kind, 'talk'); assert.notEqual(BB.activity(BB.S.agents[0]), 'message');
state([bot('a1', 'Muse', { ownerConversation: { phase: 'start', at: ago(5) } })]);
assert.equal(BB.withOwner(BB.S.agents[0]), true); assert.equal(BB.botState(BB.S.agents[0]).text, 'With you'); assert.equal(BB.activity(BB.S.agents[0]), 'message');
state([bot('a1', 'Muse', { ownerConversation: { phase: 'start', at: ago(61) } })]); assert.equal(BB.withOwner(BB.S.agents[0]), false);
state([bot('a1', 'Muse', { ownerConversation: { phase: 'end', at: ago(5) } })]); assert.equal(BB.withOwner(BB.S.agents[0]), false);
state([bot('a1', 'Muse', { ownerConversation: { phase: 'start', at: ago(20) }, state: { kind: 'TOOL_USED', at: ago(10) } })]); assert.equal(BB.withOwner(BB.S.agents[0]), false);
assert.equal(net.length, 0);
console.log('PASS floor count and summaries follow the 60-second rule (dark and needs-you always shown, "all on track" only when calm); With you only from owner conversations');

/* ---------- public receipt page: "Run this job" copies only ---------- */
const els = {}, el = id => els[id] || (els[id] = { id, hidden: true, value: '', textContent: '', innerHTML: '', classList: { add() { } }, focus() { }, select() { } });
const copied = [], pnet = [];
const snapshot = { version: 2, title: 'A launch page in an afternoon', summary: 'A bot drafted three hero lines.', template: 'Write three short hero lines.\nAsk for the audience first.', budgetCents: 84, outcome: 'completed', elapsedSeconds: 3600, reportedModelCostUsd: 0.84, externalCost: null, ledgerCents: 1, trackedActions: 2, approvals: 1, steps: [{ at: ago(3600), code: 'assigned' }, { at: ago(10), code: 'delivered' }], provenance: 'Reported by the bot.' };
const pctx = { window: { BRAND: { name: 'Black Box' } }, document: { getElementById: el }, navigator: { clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } }, fetch: (...a) => { pnet.push(a); throw Error('NO NETWORK'); }, location: { href: 'https://x/receipt/abc', assign() { throw Error('navigation'); } }, XMLHttpRequest: function () { throw Error('NO XHR'); }, crypto: undefined, TextEncoder, console };
pctx.window.__RECEIPT = { token: 'a'.repeat(48), snapshot, hash: 'f'.repeat(64), publishedAt: ago(60), expiresAt: ago(-86400) };
els.rc = { classList: { add() { } }, set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } };
vm.createContext(pctx); pctx.window.window = pctx.window;
vm.runInContext('var window=this.window;' + read('public/js/receipt-doc.js'), pctx);
pctx.publicReceiptDoc = pctx.window.publicReceiptDoc; pctx.publicTemplateText = pctx.window.publicTemplateText; pctx.__RECEIPT = pctx.window.__RECEIPT;
vm.runInContext(read('public/js/receipt-public.js').replace('window.__RECEIPT', '__RECEIPT'), pctx);
const html = els.rc.html;
assert.ok(/Run this job/.test(html)); assert.ok(!/Verified receipt/.test(html));
assert.ok(html.includes('It does not prove the work itself, its timing or its cost.'));
assert.ok(!/href="\/hq|clone/.test(html), 'Run this job must not link into the app');
(async () => {
  await els.runjob.onclick();
  assert.deepEqual(copied, ['Write three short hero lines.\nAsk for the audience first.\n\nBudget: up to $0.84.']);
  assert.equal(pnet.length, 0, 'Run this job made a network request');
  /* no script in the app auto-creates a job from a receipt link after sign-in */
  for (const f of fs.readdirSync(path.join(__dirname, 'public/js'))) { const src = read('public/js/' + f); assert.ok(!/receipts\/clone|[?&]clone=|BB\.booted\s*=/.test(src), f + ' still auto-copies a receipt into a workspace'); }
  assert.ok(!/BB\.booted\(/.test(read('public/js/app.js')));
  console.log('PASS public "Run this job" copies the template and budget only: no request, no app link, no auto-POST after sign-in; footer states what the hash proves');
})().catch(e => { console.error(e); process.exit(1); });
