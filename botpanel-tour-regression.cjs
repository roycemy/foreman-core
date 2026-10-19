// Bot panel "one main action" (Oct 19). Client vm test, same pattern as qa-triage-regression.cjs.
// The inspector header shows exactly ONE state-appropriate action:
//   ghost (never connected) -> Finish connecting, lost access -> Reconnect,
//   revoked -> Restore access, otherwise -> Edit permissions.
// The profile tab keeps only destructive secondaries (Revoke, Remove); the connect buttons live in the header now.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const NOW = Date.parse('2026-10-19T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();

const stubEl = () => ({ onclick: null, onchange: null, onkeydown: null, focus() { }, setAttribute() { }, scrollTop: 0, dataset: {}, classList: { add() { }, remove() { }, contains: () => false }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 }) });
const panelState = { on: false };
const P = {
  innerHTML: '',
  classList: { contains: x => x === 'on' && panelState.on, add(x) { if (x === 'on') panelState.on = true; }, remove(x) { if (x === 'on') panelState.on = false; } },
  setAttribute() { }, focus() { }, contains: () => false, addEventListener() { },
  querySelector: () => stubEl(), querySelectorAll: () => [],
};
const win = { BB: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900, localStorage: { getItem: () => null, setItem() { } } };
const c2 = {
  window: win, matchMedia: win.matchMedia, innerWidth: 1440, innerHeight: 900, localStorage: win.localStorage,
  document: { addEventListener() { }, querySelector: s => (s === '#insp' ? P : null), querySelectorAll: () => [], hidden: false, activeElement: null, body: { append() { } } },
  fetch: () => { throw Error('NO NETWORK') }, setInterval: () => 0, clearInterval() { }, setTimeout: () => 0, clearTimeout() { }, requestAnimationFrame: () => 0,
  console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } },
};
c2.Date.parse = Date.parse; c2.Date.UTC = Date.UTC;
vm.createContext(c2); vm.runInContext(read('public/js/core.js'), c2);
const BB = win.BB;
BB.route = () => ({ v: 'floor' }); BB.jobs = () => BB.tasks(); BB.figureSVG = () => '<svg></svg>'; BB.homeRoomOf = () => 'studio'; BB.ROOMS = ['studio']; BB.roomName = k => k; BB.phone = () => false; BB.go = () => { }; BB.onRoute = () => { };
vm.runInContext(read('public/js/inspector.js'), c2);

const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'custom', hosted: false, connection: { status: 'active', transport: 'gateway' }, lastSeen: ago(10), state: null, permissions: {}, limits: {} }, o || {});
function state(agents) { BB.S = Object.assign({ killed: false, agents, tasks: [], requests: [], events: [], receipts: [] }, {}); BB.money = { requests: [] }; BB.cards = { bots: [], proposals: [] }; }

function open(id, o) { panelState.on = false; P.innerHTML = ''; BB.openInspector(id, o); return P.innerHTML; }
const body = h => h.slice(h.indexOf('role="tabpanel"'));
const MAIN = ['Finish connecting', 'Reconnect', 'Restore access', 'Edit permissions'];
const mainCount = h => MAIN.filter(m => h.includes(m)).length;

// ghost: one main action = Finish connecting; never "Edit permissions"
state([bot('g1', 'Muse', { connection: null, lastSeen: null })]);
let h = open('g1');
assert.equal(mainCount(h), 1, 'exactly one main action for a ghost'); assert(h.includes('Finish connecting')); assert(!h.includes('Edit permissions'));
// its profile tab has no connect button row, but keeps Revoke + Remove
h = body(open('g1', { tab: 'profile' }));
assert(!h.includes('data-rec'), 'profile body no longer carries the connect button'); assert(h.includes('data-revoke')); assert(h.includes('data-remove'));

// connected: one main action = Edit permissions
state([bot('c1', 'Grok Bot')]);
h = open('c1');
assert.equal(mainCount(h), 1); assert(h.includes('Edit permissions')); assert(!h.includes('data-rec'));
h = body(open('c1', { tab: 'profile' }));
assert(!h.includes('data-rec')); assert(h.includes('data-revoke'), 'revoke stays tucked in profile');

// lost access: one main action = Reconnect
state([bot('r1', 'Instinct', { connection: { status: 'needs_reauth', transport: 'oauth' } })]);
h = open('r1');
assert.equal(mainCount(h), 1); assert(h.includes('>Reconnect<')); assert(!h.includes('Edit permissions'));

// revoked: one main action = Restore access; profile drops Revoke
state([bot('v1', 'Old Bot', { status: 'revoked' })]);
h = open('v1');
assert.equal(mainCount(h), 1); assert(h.includes('Restore access'));
h = body(open('v1', { tab: 'profile' }));
assert(!h.includes('data-revoke'), 'no Revoke button for an already-revoked bot'); assert(h.includes('data-remove'));

// hosted ghost (Muse-style): no runner connect flow, so Edit permissions stays the main action
state([bot('h1', 'Hosted Muse', { hosted: true, connection: null, lastSeen: null })]);
h = open('h1');
assert.equal(mainCount(h), 1); assert(h.includes('Edit permissions')); assert(!h.includes('data-rec'), 'hosted bots never get the runner connect button');

console.log('PASS client: bot panel shows exactly one state-appropriate main action; profile keeps only destructive secondaries.');
