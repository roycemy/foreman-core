// Design pack v3: job time estimate (median of the bot's last 10 finished jobs, min 3, four copy variants)
// and honest status (Working only on a real running job; Queued with real last check-in and real cadence; Needs reconnect; Paused).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const NOW = Date.parse('2026-10-19T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();
const win = { BB: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1440, localStorage: { getItem: () => null, setItem() { } } };
const D = class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }; D.parse = Date.parse; D.UTC = Date.UTC;
const ctx = { window: win, document: { addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], hidden: false }, matchMedia: win.matchMedia, innerWidth: 1440, localStorage: win.localStorage, fetch: () => { throw Error('NO NETWORK'); }, setInterval: () => 0, clearInterval() { }, setTimeout: () => 0, clearTimeout() { }, console, Date: D };
vm.createContext(ctx);
['public/js/core.js', 'public/js/components/bot-status.js', 'public/js/components/estimate.js'].forEach(f => vm.runInContext(read(f), ctx));
const BB = win.BB;
const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'custom', connection: { status: 'active', transport: 'gateway' }, lastSeen: ago(10), state: null }, o || {});
const job = (id, as, mins, endAgoMin, o) => Object.assign({ id, assignee: as, status: 'done', title: 'Job ' + id, startedAt: ago(endAgoMin * 60 + mins * 60), finishedAt: ago(endAgoMin * 60) }, o || {});
function state(agents, tasks) { BB.S = { killed: false, agents, tasks: tasks || [], requests: [], events: [] }; BB.money = { requests: [] }; BB.cards = { proposals: [] }; }

// estimate: fewer than 3 finished jobs
let tasks = [job('a', 'g', 6, 100), job('b', 'g', 6, 90)];
assert.equal(BB.estimate({ id: 'q', assignee: 'g', status: 'queued' }, tasks).text, 'No estimate yet');
// median of 3: 4, 6, 9 -> 6
tasks = [job('a', 'g', 4, 100), job('b', 'g', 6, 90), job('c', 'g', 9, 80), job('x', 'other', 60, 70)];
assert.equal(BB.medianMs('g', tasks), 6 * 60000);
assert.equal(BB.estimate({ id: 'q', assignee: 'g', status: 'queued' }, tasks).text, 'Usually about 6 min once started (estimate)');
assert.equal(BB.estimate({ id: 'r', assignee: 'g', status: 'running', startedAt: ago(120) }, tasks).text, '~4 min left (estimate)');
assert.equal(BB.estimate({ id: 'r', assignee: 'g', status: 'running', startedAt: ago(390) }, tasks).text, '~1 min left (estimate)');
assert.equal(BB.estimate({ id: 'r', assignee: 'g', status: 'running', startedAt: ago(8 * 60) }, tasks).text, 'Taking longer than usual (usually about 6 min)');
// only the last 10 count: 10 recent 2-min jobs outweigh 5 old 30-min ones
tasks = [...Array(5)].map((_, i) => job('o' + i, 'g', 30, 500 + i)).concat([...Array(10)].map((_, i) => job('n' + i, 'g', 2, 10 + i)));
assert.equal(BB.medianMs('g', tasks), 2 * 60000);
// failed jobs do not count
tasks = [job('a', 'g', 4, 100), job('b', 'g', 6, 90), job('c', 'g', 9, 80, { status: 'failed' })];
assert.equal(BB.medianMs('g', tasks), null);
// no seconds, ever
assert.ok(!/sec|\d+:\d\d/.test(BB.estimateHTML({ id: 'r', assignee: 'g', status: 'running', startedAt: ago(30) }, [job('a', 'g', 4, 100), job('b', 'g', 6, 90), job('c', 'g', 9, 80)])));
console.log('PASS estimate: median of last 10 finished jobs (min 3), four copy variants, whole minutes');

// status: working only with a real running job and a working signal
const grok = bot('g', 'Grok Bot', { providerId: 'grok', pollSec: 300, lastSeen: ago(240), lastClaimAt: ago(4) });
state([grok], [{ id: 't1', assignee: 'g', status: 'running', title: 'Draft launch note', startedAt: ago(60) }]);
let s = BB.honestStatus(grok); assert.equal(s.s, 'working'); assert.equal(s.line, 'Working · Draft launch note');
state([grok], [{ id: 't1', assignee: 'g', status: 'queued', title: 'Draft launch note' }]);
s = BB.honestStatus(grok); assert.equal(s.s, 'queued'); assert.equal(s.line, 'Queued · last check-in 4 min ago'); assert.equal(s.why, 'Grok checks in about every 5 min');
// a running job but no recent activity is NOT working
const stale = bot('h', 'Scout', { lastSeen: ago(3600) });
state([stale], [{ id: 't2', assignee: 'h', status: 'running', title: 'X', startedAt: ago(4000) }]);
s = BB.honestStatus(stale); assert.notEqual(s.s, 'working'); assert.equal(s.line, 'Offline', 'silent 30+ min reads Offline (never Working)');
const slow = bot('k', 'Scout2', { lastSeen: ago(20), lastClaimAt: ago(2) });
state([slow], [{ id: 't3', assignee: 'k', status: 'queued', title: 'X' }]);
s = BB.honestStatus(slow); assert.equal(s.s, 'queued'); assert.equal(s.why, '', 'no declared cadence means no promise');
// muse: message mode
const muse = bot('m', 'Muse', { providerId: 'muse' }); state([muse]);
assert.equal(BB.honestStatus(muse).why, 'Muse checks in when you message it');
// reconnect with real API reason codes, fallback to session expired
const rc = r => bot('r', 'Grok Bot', { connection: { status: 'needs_reauth', reason: r } });
[['refresh_replay', 'Its renewal token was used twice'], ['persistent_grant_missing', 'Its saved login is missing'], ['bot_revoked', 'Its access was revoked'], ['quiet', 'No check-in for over 30 min'], [undefined, 'Its session expired'], ['something_new', 'Its session expired']].forEach(([r, w]) => {
  const a = rc(r); state([a]); s = BB.honestStatus(a); assert.equal(s.s, 'reconnect'); assert.equal(s.line, 'Needs reconnect'); assert.equal(s.why, w);
});
// paused
const p = bot('p', 'Scout', { paused: true }); state([p]); s = BB.honestStatus(p); assert.equal(s.s, 'paused'); assert.equal(s.why, 'You paused this bot');
console.log('PASS honest status: Working only on a real running job; Queued with real check-in and cadence; Needs reconnect reasons; Paused');
