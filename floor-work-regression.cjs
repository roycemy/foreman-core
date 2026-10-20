// Working on the floor: the walk-to-a-prop errands are gated by real state only.
// busyReal = claimed running job + connected + not paused/killed/revoked + not with owner + under the 30-minute no-progress rule.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const NOW = Date.parse('2026-10-19T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();
const noop = () => { };
const el = () => ({ style: { setProperty: noop }, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, appendChild: noop, addEventListener: noop, setAttribute: noop, querySelector: () => null, querySelectorAll: () => [], remove: noop });
const document = { addEventListener: noop, hidden: false, querySelector: () => null, querySelectorAll: () => [], createElement: el, createElementNS: el, body: el() };
const win = { matchMedia: () => ({ matches: false }), innerWidth: 1280, localStorage: { getItem: () => null, setItem: noop } };
const ctx = { window: win, document, matchMedia: win.matchMedia, innerWidth: 1280, localStorage: win.localStorage, console, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, Promise, JSON, Date, Math, URL, requestAnimationFrame: noop };
vm.createContext(ctx); vm.runInContext(read('public/js/core.js'), ctx); const BB = win.BB; BB.now = () => NOW;
vm.runInContext(read('public/js/floor.js'), ctx);
const bot = (o) => Object.assign({ id: 'i1', name: 'Instinct', status: 'active', providerId: 'instinct', connection: { status: 'active', transport: 'mcp' }, lastSeen: ago(20) }, o || {});
const job = o => Object.assign({ id: 't1', title: 'Job', status: 'running', assignee: 'i1', createdAt: ago(300), startedAt: ago(120) }, o || {});
const S = (a, tasks, extra) => { BB.S = Object.assign({ killed: false, agents: [a], tasks, requests: [], events: [] }, extra || {}); BB.money = { requests: [] }; BB.cards = { proposals: [] }; return a; };
assert.equal(typeof BB.busyReal, 'function');
assert.equal(BB.busyReal(S(bot(), [job()])), true, 'running job, connected: works');
assert.equal(BB.busyReal(S(bot(), [])), false, 'no job: idle, never walks');
assert.equal(BB.busyReal(S(bot(), [job({ status: 'queued' })])), false, 'queued is not working');
assert.equal(BB.busyReal(S(bot(), [job({ status: 'done' })])), false, 'finished stops it');
assert.equal(BB.busyReal(S(bot({ paused: true }), [job()])), false, 'paused');
assert.equal(BB.busyReal(S(bot({ status: 'revoked' }), [job()])), false, 'revoked');
assert.equal(BB.busyReal(S(bot(), [job()], { killed: true })), false, 'emergency stop');
assert.equal(BB.busyReal(S(bot({ connection: { status: 'needs_reauth' } }), [job()])), false, 'needs reconnecting');
assert.equal(BB.busyReal(S(bot({ lastSeen: ago(40 * 60) }), [job({ startedAt: ago(40 * 60) })])), false, 'stalled past 30 minutes');
assert.equal(BB.busyReal(S(bot({ lastSeen: ago(900), pollSec: 300 }), [job({ startedAt: ago(900) })])), true, 'a 5-minute poller with a claimed job still works (was standing before)');
assert.equal(BB.busyReal(S(bot({ lastSeen: ago(40 * 60) }), [job({ startedAt: ago(40 * 60), progressAt: ago(60) })])), true, 'real progress keeps it working');
// honest status line
const q = o => ({ id: 'tq', title: 'Make a note', status: 'queued', assignee: 'i1', createdAt: ago(60) });
let a = S(bot({ lastSeen: ago(180), pollSec: 300 }), [q()]); let j = BB.jobTruth(a);
assert.equal(j.kind, 'queued'); assert.ok(/^Queued · last check-in 3 min ago/.test(j.line), j.line); assert.ok(/checks in every 5 min/.test(j.why), j.why); assert.equal(BB.statusLine(a), j.line);
a = S(bot({ providerId: 'grok', lastSeen: ago(1200), connection: { status: 'active', transport: 'mcp' } }), [q(), q()]); j = BB.jobTruth(a);
assert.ok(/Queued \(2 jobs\)/.test(j.line) && /hasn't checked in for 20 min/.test(j.why), j.line + ' | ' + j.why);
a = S(bot({ connection: { status: 'needs_reauth' } }), [q()]); assert.ok(/needs reconnecting/.test(BB.jobTruth(a).why));
a = S(bot(), [job({ progressAt: ago(30) })]); j = BB.jobTruth(a); assert.equal(j.kind, 'working'); assert.ok(/^Working · /.test(j.line) && /last progress/.test(j.why), j.line + j.why);
a = S(bot(), [job()]); assert.ok(/no progress reported yet/.test(BB.jobTruth(a).why), 'claimed but silent says so');
a = S(bot(), []); assert.equal(BB.jobTruth(a), null);
// estimate: only from this bot's own finished jobs, labeled, never invented
const dn = (id, mn) => ({ id, title: 'd', status: 'done', assignee: 'i1', createdAt: ago(9999), startedAt: ago(5000 + mn * 60), finishedAt: ago(5000) });
S(bot(), [job({ startedAt: ago(120) })]); assert.ok(/No estimate yet/.test(BB.etaFor(BB.tasks()[0])), 'no history: says so');
S(bot(), [dn('d1', 8), dn('d2', 10), dn('d3', 12), job({ startedAt: ago(240) })]); let e = BB.etaFor(BB.tasks()[3]);
assert.ok(/^~[0-9]+ min left \(estimate\)$/.test(e) && /~6 min left/.test(e), e);
S(bot(), [dn('d1', 8), dn('d2', 10), dn('d3', 12), job({ startedAt: ago(20 * 60) })]); assert.ok(/Taking longer than usual \(usually about 10 min\)/.test(BB.etaFor(BB.tasks()[3])), BB.etaFor(BB.tasks()[3]));
S(bot(), [dn('d1', 8), dn('d2', 10), dn('d3', 12), q()]); assert.equal(BB.etaFor(BB.tasks()[3]), 'Usually about 10 min once started (estimate)');
S(bot(), [dn('d1', 8), dn('d2', 10), q()]); assert.equal(BB.etaFor(BB.tasks()[2]), '', 'two samples is not enough');
console.log('PASS floor work: a bot walks, gathers and sits only on a real claimed running job (connected, not paused/revoked/stopped, under the 30-minute stall rule)');
