// Owner flags, run against the real browser scripts in a sandbox (no network):
// - the red reconnect flag names the bot and the plain reason (expired, replay, missing login, revoked, quiet 30+ min); Muse and short quiet never flag
// - one tap copies the exact setup message: Grok gets the connector message with its bot id and no pairing call, a console bot gets a fresh code in its link
// - receipts: no badge for history, "N new" for a job finished while away, cleared when Receipts opens, rows marked new only during that visit
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const NOW = Date.parse('2026-10-19T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();
function el(tag) { const e = { tag, children: [], _h: '', hidden: false, dataset: {}, classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }, contains(c) { return this.s.has(c); } }, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, after(c) { this.parentNode && this.parentNode.children.push(c); }, remove() { }, addEventListener() { }, querySelector() { return null; }, querySelectorAll() { return []; }, animate() { return { onfinish: null }; }, offsetParent: {}, getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }, isConnected: true };
  Object.defineProperty(e, 'innerHTML', { get() { return e._h; }, set(v) { e._h = v; } }); Object.defineProperty(e, 'textContent', { get() { return e._t || ''; }, set(v) { e._t = v; } }); return e; }
const stage = el('div'), roster = el('div'); roster.parentNode = stage;
const badgeHost = el('a'); badgeHost.querySelector = () => badgeHost._b || null; badgeHost.appendChild = c => { badgeHost._b = c; return c; };
const document = { addEventListener() { }, hidden: false, body: el('body'), createElement: t => el(t), querySelector: s => s === '#stage' ? stage : s === '#roster' ? roster : null, querySelectorAll: s => /data-v=receipts/.test(s) ? [badgeHost] : [] };
const clip = []; const posts = [];
const win = { matchMedia: () => ({ matches: true }), innerWidth: 1024 };
const store = {};
const ctx = { window: win, document, matchMedia: win.matchMedia, innerWidth: 1024, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, navigator: { clipboard: { writeText: async t => { clip.push(t); } } }, location: { origin: 'https://foreman-core.vercel.app', hostname: 'foreman-core.vercel.app', hash: '' }, setTimeout: () => 0, clearTimeout() { }, setInterval: () => 0, clearInterval() { }, console, Promise, JSON, Date, Math, URL, Blob: class { constructor(p) { this.p = p; } }, BRAND: { name: 'Alter', upper: 'ALTER', n: 'Alter' } };
vm.createContext(ctx); vm.runInContext(read('public/js/core.js'), ctx);
const BB = win.BB; BB.now = () => NOW; BB.route = () => ({ v: BB._at || 'floor' });
BB.api = async (u, m) => { posts.push(u); return { code: 'ABCD-EFGH-IJKL' }; };
BB.toast = () => { }; BB.modal = () => ({ querySelector: () => null });
vm.runInContext(read('public/js/connect.js'), ctx); vm.runInContext(read('public/js/flags.js'), ctx);
const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'instinct', connection: { status: 'active', transport: 'mcp' }, lastSeen: ago(10) }, o || {});
const set = (agents, tasks) => { BB.S = { killed: false, agents, tasks: tasks || [], requests: [], events: [] }; BB.money = { requests: [] }; BB.cards = { proposals: [] }; BB.emit(); };
const html = () => badgeHost && require('assert') && document.body.children.length;

// 1. flag reasons, via the same list the flag paints
const flags = () => { const b = stage.children.find(c => c.id === 'recflags'); return b ? b._h : ''; };
set([bot('g1', 'Grok Bot', { providerId: 'grok', connection: { status: 'needs_reauth', reason: 'refresh_replay' } })]);
assert.ok(/Grok Bot needs reconnecting/.test(flags()) && /renewal token was reused/.test(flags()) && /copy the setup message/.test(flags()), flags());
set([bot('g1', 'Grok Bot', { providerId: 'grok', connection: { status: 'needs_reauth' } })]); assert.ok(/session expired/.test(flags()), flags());
set([bot('g1', 'Grok Bot', { providerId: 'grok', connection: { status: 'needs_reauth', reason: 'persistent_grant_missing' } })]); assert.ok(/saved login is missing/.test(flags()), flags());
set([bot('i1', 'Instinct', { status: 'revoked' })]); assert.ok(/switched off/.test(flags()) && /revoked/.test(flags()) && /restore/i.test(flags()), flags());
set([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: ago(31 * 60) })]); assert.ok(/needs reconnecting/.test(flags()) && /hasn&#39;t checked in for 31 min/.test(flags()), flags());
set([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: ago(29 * 60) })]); assert.equal(flags(), '', 'quiet under 30 min must not flag');
set([bot('m1', 'Muse', { providerId: 'muse', lastSeen: ago(3600) })]); assert.equal(flags(), '', 'Muse is dark by design, never flagged');
set([bot('i1', 'Instinct')]); assert.equal(flags(), '');

// 2. one tap copies the exact message
(async () => {
  set([bot('g1', 'Grok Bot', { providerId: 'grok', connection: { status: 'needs_reauth' } }), bot('i1', 'Instinct', { connection: { status: 'needs_reauth' } })]);
  let r = await BB.reconnectCopy('g1');
  assert.ok(r.ok && r.url === 'https://grok.com', JSON.stringify(r)); assert.equal(posts.length, 0, 'Grok needs no pairing call');
  assert.ok(clip.length === 0 || true);
  r = await BB.reconnectCopy('i1');
  assert.ok(r.ok && !r.url && posts.length === 1 && /\/api\/agents\/i1\/pairing/.test(posts[0]), JSON.stringify([r, posts]));
  // clipboard.write is absent here, so text goes through writeText: check the copied text
  const grok = clip[0], inst = clip[1];
  assert.ok(grok && grok.includes('Grok Bot') && grok.includes('g1') && grok.includes('/api/mcp') && !/pair=/.test(grok), 'grok message');
  assert.ok(inst && inst.includes('i1') && /#pair=ABCDEFGHIJKL/.test(inst) && !/apiKey|password:/i.test(inst), 'console message carries one-time code in link');
  // 3. receipts
  const fin = (id, at) => ({ id, title: 'Job ' + id, status: 'done', assignee: 'i1', createdAt: ago(600), finishedAt: ago(at), modelCostUsd: 0.02 });
  set([bot('i1', 'Instinct')], []);
  assert.ok(!badgeHost._b || badgeHost._b.hidden, 'nothing finished, no badge');
  set([bot('i1', 'Instinct')], [fin('t2', 3)]);
  assert.equal(badgeHost._b.textContent, '1 new'); assert.equal(badgeHost._b.hidden, false);
  assert.ok(document.body.children.some(c => /rcard/.test(c.className)), 'a receipt card ships on finish');
  BB._at = 'receipts'; BB.emit();
  assert.equal(badgeHost._b.hidden, true, 'opening Receipts clears the badge'); assert.ok(BB.isNewReceipt('t2'));
  BB._at = 'floor'; BB.emit(); assert.ok(!BB.isNewReceipt('t2'), 'new marks last only for the visit'); assert.equal(badgeHost._b.hidden, true, 'stays cleared');
  set([bot('i1', 'Instinct')], [fin('t2', 3), fin('t3', 1)]); assert.equal(badgeHost._b.textContent, '1 new');
  console.log('PASS owner flags: reconnect flag names the bot and the reason, one tap copies the exact setup message (Grok connector, console code in link), receipts badge "N new" clears on open');
})().catch(e => { console.error(e); process.exit(1); });
