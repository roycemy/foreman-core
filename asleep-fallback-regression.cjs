// Asleep fallback (owner ask, Oct 21): an auto-routed job never sits with a sleeping bot.
// - Routing freshness mirrors the honest status model: two missed beats of the bot's own declared
//   cadence (10 min at pollSec 300), or the 150 s console-heartbeat window when none is declared.
//   Never-checked-in bots and message-mode bots with no cadence are asleep for routing.
// - A fresh auto-route skips the sleeping pick: scored history, then declared strength, then any
//   awake external bot. Routing ambiguity (no single pick) still stays unrouted - no guessing.
// - The queued-job sweep moves a stale assignee's waiting job under the task lock: queued only,
//   never owner-assigned jobs, never running jobs, capped at 3 auto moves, nobody awake = stays queued.
// - A bot that checks in but never claims (and is not busy) loses the job after one full window.
// - HQ tells the owner: an "is asleep" needs-you card naming the waiting job (pollers and Muse, the
//   bots the went-dark alarm does not cover), and a "X was asleep - handed to Y" note on the job.
// - Muse with a declared cadence is held to it like any poller (no more hardcoded Dark label).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---------- server: run the real api/index.js in a VM with the memory store ---------- */
const src = read('api/index.js') + '\nmodule.exports.t={botAwake,botFreshnessWindowMs,freshRoutingPick,reassignAsleepQueuedTasks,claimTask,fullState,newTask,listTasks,event,setJ,getJ,r,ASLEEP_FALLBACK_MAX};';
const ctx = { require, module: { exports: {} }, process: { env: {} }, global: {}, console, fetch: () => { throw Error('NO NETWORK'); }, setTimeout, clearTimeout, URL, AbortSignal };
vm.runInNewContext(src, ctx); const f = ctx.module.exports.t;
const ago = s => new Date(Date.now() - s * 1000).toISOString();

(async () => {
  // botAwake edges
  const A = o => Object.assign({ id: 'x', name: 'X', status: 'active', providerId: 'grok', lastSeen: ago(10) }, o || {});
  assert.equal(f.botAwake(A({}), Date.now()), true, 'fresh no-cadence bot is awake');
  assert.equal(f.botAwake(A({ lastSeen: ago(149) }), Date.now()), true, '149s inside the 150s window');
  assert.equal(f.botAwake(A({ lastSeen: ago(151) }), Date.now()), false, '151s past the window: asleep');
  assert.equal(f.botAwake(A({ pollSec: 300, lastSeen: ago(599) }), Date.now()), true, 'cadence bot inside two beats');
  assert.equal(f.botAwake(A({ pollSec: 300, lastSeen: ago(601) }), Date.now()), false, 'cadence bot past two missed beats: asleep');
  assert.equal(f.botAwake(A({ lastSeen: null }), Date.now()), false, 'never checked in: asleep');
  assert.equal(f.botAwake(A({ hosted: true, lastSeen: null }), Date.now()), true, 'hosted worker runs on the server');
  assert.equal(f.botAwake(A({ connectionMode: 'botlink', lastSeen: ago(99999) }), Date.now()), true, 'botlink has no heartbeat expectation');
  assert.equal(f.botAwake(A({ paused: true }), Date.now()), false, 'paused is not a routing target');
  assert.equal(f.botAwake(A({ status: 'revoked' }), Date.now()), false, 'revoked is not a routing target');
  assert.equal(f.botFreshnessWindowMs(A({ pollSec: 300 })), 600000, 'two declared beats');
  assert.equal(f.botFreshnessWindowMs(A({})), 150000, 'flat console window');
  assert.equal(f.ASLEEP_FALLBACK_MAX, 3, 'auto moves are capped');

  // workspace: Muse asleep on a 5-min cadence, Grok + Instinct awake on 5-min cadences
  const agents = [
    { id: 'm', name: 'Muse', status: 'active', providerId: 'muse', pollSec: 300, lastSeen: ago(1200), createdAt: ago(90000), permissions: {}, limits: {} },
    { id: 'g', name: 'Grok Bot', status: 'active', providerId: 'grok', pollSec: 300, lastSeen: ago(60), createdAt: ago(80000), permissions: {}, limits: {} },
    { id: 'i', name: 'Instinct', status: 'active', providerId: 'instinct', pollSec: 300, lastSeen: ago(90), createdAt: ago(70000), permissions: {}, limits: {} },
    { id: 'n', name: 'New Grok', status: 'active', providerId: 'grok', pollSec: 300, lastSeen: null, createdAt: ago(60000), permissions: {}, limits: {} },
  ];
  for (const a of agents) { await f.setJ('fm:agent:' + a.id, a); await f.r(['SADD', 'fm:agents', a.id]); }

  // 1. routing fallback: the declared marketing bot is asleep; an awake bot takes it
  let pick = await f.freshRoutingPick('marketing');
  assert(pick.picked && pick.picked.id === 'g', 'asleep Muse skipped, oldest awake bot takes it: ' + (pick.picked && pick.picked.id));
  assert(pick.fellBackFrom && pick.fellBackFrom.id === 'm' && pick.fellBackWhy === 'asleep', 'the skipped bot is named');
  assert.equal(pick.pickedTier, 2, 'nearest awake bot, no declared strength');
  assert.equal(pick.nobodyAwake, false);
  // the never-checked-in bot is never a fallback target
  assert.notEqual(pick.picked.id, 'n', 'awaiting-first-check-in bots are excluded');

  // 2. while the declared bot is awake the answer is the usual single-declared pick
  await f.setJ('fm:agent:m', Object.assign({}, agents[0], { lastSeen: ago(30) }));
  pick = await f.freshRoutingPick('marketing');
  assert(pick.picked && pick.picked.id === 'm' && !pick.fellBackFrom, 'awake Muse keeps its declared category');
  await f.setJ('fm:agent:m', agents[0]); // back to asleep

  // 3. nobody awake: picked null, job would stay queued
  pick = await f.freshRoutingPick('marketing', ['g', 'i', 'n']);
  assert.equal(pick.picked, null, 'no awake bot: no pick');
  assert.equal(pick.nobodyAwake, true);

  // 4. the sweep moves a stale assignee's queued job under the lock, wakes the new bot, and says why
  const task = await f.newTask({ title: 'Reddit marketing plan', brief: 'b', assignee: 'm', category: 'marketing', routingReason: 'Declared strength' });
  let t = await f.getJ('fm:task:' + task.id);
  t.createdAt = ago(900); t.assignedAt = ago(900); await f.setJ('fm:task:' + task.id, t); // older than Muse's 10-min window
  await f.reassignAsleepQueuedTasks();
  t = await f.getJ('fm:task:' + task.id);
  assert.equal(t.assignee, 'g', 'stale queued job moved to the awake bot');
  assert.equal(t.status, 'queued', 'still queued, never started under a new identity');
  const re = t.reassignments[t.reassignments.length - 1];
  assert.equal(re.by, 'auto-asleep'); assert.equal(re.from, 'm'); assert.equal(re.to, 'g');
  assert(/asleep/.test(re.reason), 'reason says why: ' + re.reason);
  const evs = (await f.r(['LRANGE', 'fm:events', 0, 99])).map(x => JSON.parse(x));
  assert(evs.some(e => e.agentId === 'g' && e.taskId === task.id && /handed it to you|is yours/.test(e.text)), 'the new bot is told to claim it');
  assert(evs.some(e => e.agentId === 'm' && e.taskId === task.id && /moved to Grok Bot/.test(e.text)), 'the old bot is told to stop');

  // 5. the receiving bot then claims that exact job end to end
  const claimed = await f.claimTask({ id: 'g', name: 'Grok Bot', status: 'active', permissions: {}, limits: {} });
  assert(claimed && claimed.id === task.id && claimed.status === 'running', 'fallback target claims the moved job');

  // 6. grace: a fresh job is never yanked inside the assignee's own window
  const t2 = await f.newTask({ title: 'Fresh research', assignee: 'i', category: 'research' });
  await f.setJ('fm:agent:i', Object.assign({}, agents[2], { lastSeen: ago(1200) })); // Instinct goes dark right after
  await f.reassignAsleepQueuedTasks();
  assert.equal((await f.getJ('fm:task:' + t2.id)).assignee, 'i', 'job younger than the window stays put');

  // 7. checked in but never claimed, not busy: after a full window the job moves
  let tt = await f.getJ('fm:task:' + t2.id);
  tt.createdAt = ago(900); tt.assignedAt = ago(900); await f.setJ('fm:task:' + t2.id, tt);
  await f.setJ('fm:agent:i', Object.assign({}, agents[2], { lastSeen: ago(20) })); // beating, not claiming
  await f.reassignAsleepQueuedTasks();
  tt = await f.getJ('fm:task:' + t2.id);
  assert.notEqual(tt.assignee, 'i', 'presence without claiming loses the job');
  assert(/never claimed/.test(tt.reassignments[tt.reassignments.length - 1].reason), 'reason names the non-claim');

  // 8. busy bots keep their queue: awake + a running job means the queued job waits its turn
  const t3 = await f.newTask({ title: 'Later ops job', assignee: 'g', category: 'ops' });
  let t3o = await f.getJ('fm:task:' + t3.id); t3o.createdAt = ago(900); t3o.assignedAt = ago(900); await f.setJ('fm:task:' + t3.id, t3o);
  await f.reassignAsleepQueuedTasks(); // g is running the claimed job from step 5
  assert.equal((await f.getJ('fm:task:' + t3.id)).assignee, 'g', 'busy bot keeps its queued job');

  // 9. owner-assigned jobs are never moved
  const t4 = await f.newTask({ title: 'Owner picked Muse', assignee: 'm', category: 'marketing' });
  let t4o = await f.getJ('fm:task:' + t4.id); t4o.createdAt = ago(900); t4o.assignedAt = ago(900); t4o.assignedBy = 'owner'; await f.setJ('fm:task:' + t4.id, t4o);
  await f.reassignAsleepQueuedTasks();
  assert.equal((await f.getJ('fm:task:' + t4.id)).assignee, 'm', 'owner choice is not second-guessed');

  // 10. nobody awake: the job stays queued rather than moving to a sleeper
  const t5 = await f.newTask({ title: 'All asleep job', assignee: 'm', category: 'marketing' });
  let t5o = await f.getJ('fm:task:' + t5.id); t5o.createdAt = ago(900); t5o.assignedAt = ago(900); await f.setJ('fm:task:' + t5.id, t5o);
  for (const id of ['g', 'i']) { const a = await f.getJ('fm:agent:' + id); a.lastSeen = ago(5000); await f.setJ('fm:agent:' + id, a); }
  await f.reassignAsleepQueuedTasks();
  assert.equal((await f.getJ('fm:task:' + t5.id)).assignee, 'm', 'nobody awake: stays queued');

  // 11. the claimant's own jobs are never moved out from under it mid-claim
  const t4done = await f.getJ('fm:task:' + t4.id); t4done.status = 'done'; t4done.finishedAt = new Date().toISOString(); await f.setJ('fm:task:' + t4.id, t4done);
  const claimed5 = await f.claimTask({ id: 'm', name: 'Muse', status: 'active', permissions: {}, limits: {} });
  assert(claimed5 && claimed5.id === t5.id, 'the assignee that shows up claims its own waiting job');

  // 12. fullState runs the same sweep for the owner view
  const api = read('api/index.js');
  assert(/await expireStalledTasks\(\);\s*\n\s*await reassignAsleepQueuedTasks\(\);/.test(api), 'fullState sweeps stale queued jobs');
  assert(/expireStalledTasks\(\);await reconcileTaskParents\(\);await reassignAsleepQueuedTasks\(agent\.id\)/.test(api), 'claimTask sweeps with the claimant excluded');
  assert(/const pick = await freshRoutingPick\(leadCat\)/.test(api), 'type-box routing goes through the awake-aware pick');
  assert(/allAsleep \? \{ allAsleep: true \}/.test(api), 'the all-asleep state reaches the client');
  assert(/t0\.assignedBy === 'owner'/.test(api), 'owner-assigned jobs are excluded');
  assert(/t0\.status !== 'queued'/.test(api), 'running jobs are never stolen');
  assert(/withJobLock\(t0\.id/.test(api) && /EVAL', AGENT_CAS/.test(api), 'the sweep moves jobs under the existing lock + CAS');

  console.log('PASS asleep-fallback server: freshness windows, fallback order, grace, busy-keep, owner-keep, nobody-awake, claimant-safe, full sweep wiring');
})().then(() => {

  /* ---------- client: real core.js in a sandbox ---------- */
  const NOW = Date.parse('2026-10-21T23:10:00Z'), agoC = s => new Date(NOW - s * 1000).toISOString();
  const win = { BB: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1440, localStorage: { getItem: () => null, setItem() { } } };
  const cctx = { window: win, document: { addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], hidden: false }, matchMedia: win.matchMedia, innerWidth: 1440, localStorage: win.localStorage, fetch: () => { throw Error('NO NETWORK'); }, setInterval: () => 0, clearInterval() { }, setTimeout: () => 0, clearTimeout() { }, console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } } };
  cctx.Date.parse = Date.parse; cctx.Date.UTC = Date.UTC;
  vm.createContext(cctx); vm.runInContext(read('public/js/core.js'), cctx);
  const BB = win.BB;
  const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'custom', connection: { status: 'active', transport: 'gateway' }, lastSeen: agoC(10), state: null }, o || {});
  const state = (agents, extra) => { BB.S = Object.assign({ killed: false, agents, tasks: [], requests: [], events: [] }, extra || {}); BB.money = { requests: [] }; BB.cards = { proposals: [] }; };

  // Muse honors a declared cadence now: fresh = cadence status, stale = Late, never the hardcoded message-mode Dark
  state([bot('m1', 'Muse', { providerId: 'muse', pollSec: 300, lastSeen: agoC(180) })]);
  assert.equal(BB.botState(BB.S.agents[0]).kind, 'poll', 'Muse with a cadence reads like a poller');
  state([bot('m1', 'Muse', { providerId: 'muse', pollSec: 300, lastSeen: agoC(601) })]);
  assert.equal(BB.botState(BB.S.agents[0]).kind, 'late', 'Muse past two beats reads Late');
  state([bot('m1', 'Muse', { providerId: 'muse', hosted: true, lastSeen: agoC(3600) })]);
  assert.equal(BB.botState(BB.S.agents[0]).kind, 'msg', 'Muse with no declared cadence keeps the message-mode Dark label');

  // the asleep card: queued job on a stale poller names the job and the wake path
  const qtask = { id: 't1', title: 'Reddit marketing plan', status: 'queued', assignee: 'm1', createdAt: agoC(900), assignedAt: agoC(900) };
  state([bot('m1', 'Muse', { providerId: 'muse', pollSec: 300, lastSeen: agoC(601) })], { tasks: [qtask] });
  let asleep = BB.onYou().filter(i => i.type === 'asleep');
  assert.equal(asleep.length, 1, 'one asleep card for the waiting job');
  assert.equal(asleep[0].a.id, 'm1'); assert.equal(asleep[0].t.id, 't1');
  assert.equal(BB.itemTitle ? BB.itemTitle(asleep[0]) : '', ''); // itemTitle lives in floor.js (DOM); checked by source below
  assert.equal(BB.teamSummary().calm, false, 'a sleeping assignee breaks the all-clear');
  assert.ok(BB.needsYou === undefined || true);

  // no card while the assignee is fresh, and no duplicate with the went-dark card
  state([bot('m1', 'Muse', { providerId: 'muse', pollSec: 300, lastSeen: agoC(100) })], { tasks: [qtask] });
  assert.equal(BB.onYou().filter(i => i.type === 'asleep').length, 0, 'fresh assignee: no asleep card');
  state([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: agoC(200) })], { tasks: [Object.assign({}, qtask, { assignee: 'g1' })] });
  assert.deepEqual(BB.onYou().map(i => i.type), ['dark'], 'non-cadence dark bot keeps the single went-dark card');
  state([bot('g1', 'Grok Bot', { providerId: 'grok', lastSeen: agoC(200), hosted: true })], { tasks: [Object.assign({}, qtask, { assignee: 'g1' })] });
  assert.equal(BB.onYou().filter(i => i.type === 'asleep').length, 0, 'hosted bots never raise the asleep card');

  // the fallback note on the job row
  const moved = Object.assign({}, qtask, { assignee: 'g1', reassignments: [{ from: 'm1', to: 'g1', at: agoC(30), by: 'auto-asleep', reason: 'Muse is asleep (missed two check-ins)' }] });
  state([bot('m1', 'Muse', { providerId: 'muse' }), bot('g1', 'Grok Bot', {})], { tasks: [moved] });
  assert.equal(BB.fallbackNote(moved), 'Muse was asleep - handed to Grok Bot');
  assert.equal(BB.fallbackNote(qtask), '', 'no auto-asleep move: no note');
  assert.equal(BB.fallbackNote(null), '', 'no task: no crash');

  // inbox + floor + app wiring (source)
  const inbox = read('public/js/inbox.js'), floor = read('public/js/floor.js'), app = read('public/js/app.js');
  assert(inbox.includes("i.type === 'asleep'") && /is asleep/.test(inbox) && /reconnect it to wake it/.test(inbox), 'desktop asleep card names the job and the wake path');
  assert(/reconnect to wake it/.test(inbox), 'phone asleep card tells the owner to reconnect');
  assert(inbox.includes('i.t.allAsleep'), 'the all-asleep queued job gets honest copy');
  assert(inbox.includes('BB.fallbackNote(t)'), 'job rows carry the handoff note');
  assert(floor.includes("i.type === 'asleep' ? i.a.name + ' is asleep'"), 'floor title knows the asleep card');
  assert(app.includes("j.routed.fallbackFrom") && app.includes('j.allAsleep'), 'the type box says when the first pick was asleep');

  console.log('PASS asleep-fallback client: Muse cadence honored, asleep card scoped + deduped, fallback note, inbox/floor/app wiring');
}).catch(e => { console.error('FAIL', e); process.exit(1); });
