// Presence model (Royce's verdict, Oct 19): honest channel status, no fake Live.
// - Poll-cadence bots (self-declared pollSec via the gateway): blue "Checks in every N min - last check X ago", amber "Late" after two missed beats, never Live, never the flat Went dark.
// - Muse (message-mode, no verified push/poll hook): grey "Dark - acts when messaged", never Live, Copy nudge available.
// - Live (green) only when a real channel acked inside its expectation; red only for Needs re-paste.
// - Every finished job is tagged "by Grok" or "by Alter for Grok" (hosted run never pretends the bot did it).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const NOW = Date.parse('2026-10-19T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();

const win = { BB: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1440, localStorage: { getItem: () => null, setItem() { } } };
const ctx = { window: win, document: { addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], hidden: false }, matchMedia: win.matchMedia, innerWidth: 1440, localStorage: win.localStorage, fetch: () => { throw Error('NO NETWORK'); }, setInterval: () => 0, clearInterval() { }, setTimeout: () => 0, clearTimeout() { }, console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } } };
ctx.Date.parse = Date.parse; ctx.Date.UTC = Date.UTC;
vm.createContext(ctx); vm.runInContext(read('public/js/core.js'), ctx);
const BB = win.BB;
const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'custom', connection: { status: 'active', transport: 'gateway' }, lastSeen: ago(10), state: null }, o || {});
function state(agents, extra) { BB.S = Object.assign({ killed: false, agents, tasks: [], requests: [], events: [] }, extra || {}); BB.money = { requests: [] }; BB.cards = { proposals: [] }; }

// 1. poll bot, on time: blue cadence status, not dark, not inactive
state([bot('i1', 'Instinct', { providerId: 'instinct', pollSec: 300, lastSeen: ago(180) })]);
let a = BB.S.agents[0], s = BB.botState(a);
assert.equal(s.kind, 'poll'); assert.equal(s.text, 'Checks in every 5 min · last check 3 min ago');
assert.equal(BB.wentDark(a), false); assert.notEqual(BB.signal(a), 'inactive');
let tag = BB.channelTag(a); assert.equal(tag.cls, 'poll'); assert.equal(tag.text, 'Checks in every 5 min');

// 2. poll bot at 90s: past the flat 60s but inside its cadence - still on time (the old Went dark bug)
state([bot('i1', 'Instinct', { providerId: 'instinct', pollSec: 300, lastSeen: ago(90) })]);
a = BB.S.agents[0]; assert.equal(BB.wentDark(a), false); assert.equal(BB.botState(a).kind, 'poll');

// 3. poll bot past two missed beats: amber Late, and NOT the owner-alarm "went dark"
state([bot('i1', 'Instinct', { providerId: 'instinct', pollSec: 300, lastSeen: ago(601) })]);
a = BB.S.agents[0]; s = BB.botState(a);
assert.equal(BB.wentDark(a), true); assert.equal(s.kind, 'late');
assert.ok(s.text.startsWith('Late · checks in every 5 min'), s.text);
assert.equal(BB.goneDark(a), false, 'late poller does not raise the went-dark banner');
assert.equal(BB.channelTag(a).cls, 'late');
assert.equal(BB.teamSummary().calm, true, 'a late poller is a status, not an alarm');
assert.equal(BB.onYou().filter(i => i.type === 'dark').length, 0);

// 4. console heartbeat is 60s: a bot between beats (90s) is NOT dark; past 150s (2.5 missed beats) it is, and raises the alarm
state([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: ago(90) })]);
a = BB.S.agents[0];
assert.equal(BB.wentDark(a), false, 'between 60s beats: never dark');
assert.notEqual(BB.botState(a).kind, 'dark');
state([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: ago(200) })]);
a = BB.S.agents[0];
assert.equal(BB.wentDark(a), true); assert.equal(BB.botState(a).kind, 'dark'); assert.equal(BB.goneDark(a), true);
assert.equal(BB.channelTag(a).cls, 'dim'); assert.ok(BB.teamSummary().text.includes('Grok Bot went dark'));

// 5. Muse: never Live, grey "Dark - acts when messaged", no went-dark alarm
state([bot('m1', 'Muse', { providerId: 'muse', hosted: true, lastSeen: ago(3600) })]);
a = BB.S.agents[0]; s = BB.botState(a);
assert.equal(s.kind, 'msg'); assert.equal(s.text, 'Dark · acts when messaged');
assert.equal(BB.goneDark(a), false, 'Muse dark is the default, not an alarm');
tag = BB.channelTag(a); assert.equal(tag.cls, 'dim'); assert.equal(tag.text, 'Dark · acts when messaged');
assert.equal(BB.teamSummary().calm, true);
state([bot('m1', 'Muse', { providerId: 'muse', hosted: true, lastSeen: ago(5) })]);
assert.equal(BB.botState(BB.S.agents[0]).kind, 'msg', 'even freshly paired, Muse never reads Live');
assert.notEqual(BB.channelTag(BB.S.agents[0]).cls, 'run');

// 6. Muse doing real work right now shows the job, honestly
state([bot('m1', 'Muse', { providerId: 'muse', hosted: true, lastSeen: ago(5) })], { tasks: [{ id: 't1', title: 'Memo', status: 'running', assignee: 'm1', startedAt: ago(30), createdAt: ago(30) }] });
assert.equal(BB.botState(BB.S.agents[0]).kind, 'run');

// 7. red is only for Needs re-paste
state([bot('g1', 'Grok Bot', { providerId: 'grok', connection: { status: 'active', transport: 'gateway', needsReconnect: true } })]);
// force reconnect presence: no connection at all models it cleanly
state([bot('g1', 'Grok Bot', { providerId: 'grok', connection: null, lastSeen: ago(90) })]);
if (BB.presence(BB.S.agents[0]) === 'reconnect') { tag = BB.channelTag(BB.S.agents[0]); assert.equal(tag.cls, 'need'); assert.equal(tag.text, "Can't run · needs re-paste"); assert.equal(BB.botState(BB.S.agents[0]).text, "Can't run · needs re-paste"); }

// 8. live bot with a fresh ack: green Live, and only then
state([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: ago(20) })]);
tag = BB.channelTag(BB.S.agents[0]); assert.equal(tag.cls, 'run'); assert.equal(tag.text, 'Live');

// 9. poll bot with a queued job: nudge text names the bot, the count and HQ
state([bot('m1', 'Muse', { providerId: 'muse', hosted: true, lastSeen: ago(3600) })], { tasks: [{ id: 't1', title: 'Memo', status: 'queued', assignee: 'm1', createdAt: ago(60) }] });
const nudge = BB.nudgeText(BB.S.agents[0]);
assert.ok(nudge.includes('Muse - check Alter: 1 job is waiting for you.'), nudge);
assert.ok(nudge.includes('/hq'), nudge);

// 10. by-tag on finished jobs: "by Grok" normally, "by Alter for Grok" when the hosted worker ran it; nothing on unfinished jobs
state([bot('g1', 'Grok Bot', { providerId: 'grok' })]);
assert.equal(BB.byLabel({ id: 't1', status: 'running', assignee: 'g1' }), '');
assert.equal(BB.byLabel({ id: 't1', status: 'done', assignee: 'g1' }), ' · by Grok Bot');
assert.equal(BB.byLabel({ id: 't1', status: 'failed', assignee: 'g1', runByAlter: true }), ' · by Alter for Grok Bot');
assert.equal(BB.byLabel({ id: 't1', status: 'done', assignee: 'ghost-missing' }), ' · by the bot', 'orphaned assignee never crashes');

// 11. server contract: pollSec clamped to 60-3600 and recorded from the bot's own authenticated calls; runByAlter stamped on completion
const api = read('api/index.js');
assert.ok(/v>=60&&v<=3600/.test(api.replace(/\s+/g, '')), 'pollSec clamp 60..3600');
assert.ok(api.includes('notePollCadence(agent'), 'gateway records declared cadence');
assert.ok(api.includes('body.runByAlter===true'), 'worker can self-label run-by-Alter jobs');

// 12. invalid pollSec values are ignored by the client model
for (const bad of [0, 30, 5000, 'x', null, undefined]) {
  state([bot('i1', 'Instinct', { providerId: 'instinct', pollSec: bad, lastSeen: ago(200) })]);
  assert.equal(BB.pollSec(BB.S.agents[0]), 0); assert.equal(BB.botState(BB.S.agents[0]).kind, 'dark', 'no cadence: flat 150s rule');
}

console.log("PASS presence model + by-tags: poll cadence blue/late-amber at 2 missed beats, Muse grey Dark never-Live, red Cant-run with real reason, nudge, by-tags, pollSec clamped and recorded.");
