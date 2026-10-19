// QA triage fixes (Oct 19), run in-process against the real handlers with the memory store. No network, no prod data.
// 1. A blocked action receipt now carries the job id, so a budget-blocked job can surface to the owner.
// 2. The owner can stop a running/queued assigned job; its action grant closes with it.
// 3. Pairing-code replay stays retry-safe until the key is provably in use, then the code is dead for everyone.
// 4. Invalid and expired codes share one honest message that says what to do next.
// 5. Client: a budget-blocked running job reads Blocked (never a happy "Running") and lands in "on you" until cleared.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync('api/index.js', 'utf8') + '\nmodule.exports.test={als,createAgent,issuePairing,redeemPairing,gatewayAct,routes,r,getJ,setJ,sha,stopTask,updateAgent,now};';
const ctx = { module: { exports: {} }, require, process: { env: {} }, global: {}, console, Buffer, fetch: () => { throw Error('NO NETWORK') }, URL, AbortSignal, setTimeout, clearTimeout };
vm.runInNewContext(src, ctx); const f = ctx.module.exports.test;
const res = () => ({ setHeader() { }, status(c) { this.code = c; return this }, json(j) { this.j = j; this.code = this.code || 200; return j } });

(async () => {
  const ws = 'qa_triage_test';
  let agent, key;
  await f.als.run({ ws }, async () => { agent = (await f.createAgent('Triage Bot', 'Ops', 'custom', false, {})).agent; });

  /* ---- 4. invalid vs expired: one message, with the next step ---- */
  let bad = await f.redeemPairing({ code: 'AAAAA-AAAAA', expected_agent_id: agent.id }, '9.9.9.9');
  assert.equal(bad.status, 400);
  assert.ok(/Invalid or expired pairing code/.test(bad.body.error), bad.body.error);
  assert.ok(/ask the owner for a fresh one/.test(bad.body.error), 'message must say what to do next: ' + bad.body.error);
  bad = await f.redeemPairing({ code: 'nope', expected_agent_id: agent.id }, '9.9.9.9');
  assert.equal(bad.status, 400); assert.ok(/ask the owner for a fresh one/.test(bad.body.error));

  /* ---- 3. replay: retry-safe until first proven key use, then dead ---- */
  let issue;
  await f.als.run({ ws }, async () => { issue = await f.issuePairing(agent.id); });
  assert.equal(issue.status, 200); const code = issue.body.code;
  const ip = '7.7.7.7';
  const first = await f.redeemPairing({ code, expected_agent_id: agent.id }, ip);
  assert.equal(first.status, 200); key = first.body.key; assert(/^fmk_/.test(key));
  const second = await f.redeemPairing({ code, expected_agent_id: agent.id }, ip);
  assert.equal(second.status, 200, 'lost-response retry with same code+ip must still work');
  assert.equal(second.body.key, key, 'replay returns the same key, never a new one');
  // first authenticated gateway call with the new key burns the replay
  const r1 = res();
  await f.als.run({ ws }, () => f.routes({ method: 'POST', headers: { authorization: 'Bearer ' + key }, gatewayKeyAuth: true }, r1, '/gateway/presence', {}, agent));
  assert.equal(r1.code, 200, JSON.stringify(r1.j));
  const third = await f.redeemPairing({ code, expected_agent_id: agent.id }, ip);
  assert.equal(third.status, 400, 'once the key is provably in use the one-time code is dead, even for the same IP');
  // the same burn fires for a paired runner console (session cookie, no key header)
  await f.als.run({ ws }, async () => { issue = await f.issuePairing(agent.id); });
  const k2 = (await f.redeemPairing({ code: issue.body.code, expected_agent_id: agent.id }, ip)).body.key;
  assert.equal((await f.redeemPairing({ code: issue.body.code, expected_agent_id: agent.id }, ip)).status, 200, 'retry-safe before first use');
  const r2 = res();
  await f.als.run({ ws }, () => f.routes({ method: 'POST', headers: {}, gatewayKeyAuth: true }, r2, '/gateway/presence', {}, agent));
  assert.equal(r2.code, 200, JSON.stringify(r2.j));
  assert.equal((await f.redeemPairing({ code: issue.body.code, expected_agent_id: agent.id }, ip)).status, 400, 'runner presence proves the pair landed; the code dies');

  /* ---- 1. a budget-blocked action receipts the job id ---- */
  await f.als.run({ ws }, () => f.updateAgent(agent.id, a => { a.limits = { perActionCents: 10, dailyCents: 1 }; }));
  const task = { id: 'task_triage1', title: 'Write the memo', assignee: agent.id, status: 'running', createdAt: f.now(), startedAt: f.now(), createdBy: 'owner' };
  await f.als.run({ ws }, () => f.setJ('fm:task:' + task.id, task));
  const blocked = await f.als.run({ ws }, () => f.gatewayAct(agent, { action: 'notes.write', params: { title: 'x', text: 'y' }, task_id: task.id }));
  assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'limit_daily', JSON.stringify(blocked.body));
  const receipts = await f.als.run({ ws }, async () => (await f.r(['LRANGE', 'fm:receipts', 0, 10])).map(JSON.parse));
  const brec = receipts.find(x => x.id === blocked.body.receipt_id);
  assert(brec, 'blocked receipt stored'); assert.equal(brec.taskId, task.id, 'blocked receipt carries the job id'); assert.equal(brec.code, 'limit_daily');

  /* ---- 2. owner stop: running -> failed, grant closed, not twice ---- */
  const stopped = await f.als.run({ ws }, () => f.stopTask(task.id));
  assert.equal(stopped.status, 200, JSON.stringify(stopped.body));
  assert.equal(stopped.body.task.status, 'failed'); assert.equal(stopped.body.task.result, 'Stopped by owner'); assert(stopped.body.task.finishedAt);
  assert.equal((await f.als.run({ ws }, () => f.stopTask(task.id))).status, 409, 'a terminal job cannot be stopped again');
  const q = { id: 'task_triage2', title: 'Queued job', assignee: agent.id, status: 'queued', createdAt: f.now(), createdBy: 'owner' };
  await f.als.run({ ws }, () => f.setJ('fm:task:' + q.id, q));
  assert.equal((await f.als.run({ ws }, () => f.stopTask(q.id))).status, 200, 'a queued assigned job can be stopped');
  const u = { id: 'task_triage3', title: 'Unassigned', assignee: null, status: 'queued', createdAt: f.now(), createdBy: 'owner' };
  await f.als.run({ ws }, () => f.setJ('fm:task:' + u.id, u));
  assert.equal((await f.als.run({ ws }, () => f.stopTask(u.id))).status, 409, 'an unassigned queued job stays dismiss-only');

  console.log('PASS server: blocked receipts carry the job, owner stop closes the job, pairing replay is retry-safe then dead, code errors carry a next step.');
})().catch(e => { console.error(e); process.exit(1) });

/* ---- 5. client boundaries (same vm pattern as vnext-client-regression) ---- */
const read = f2 => fs.readFileSync(path.join(__dirname, f2), 'utf8');
const NOW = Date.parse('2026-10-19T20:00:00Z'), ago = s => new Date(NOW - s * 1000).toISOString();
const win = { BB: undefined, matchMedia: () => ({ matches: false }), innerWidth: 1440, localStorage: { getItem: () => null, setItem() { } } };
const c2 = { window: win, document: { addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], hidden: false }, matchMedia: win.matchMedia, innerWidth: 1440, localStorage: win.localStorage, fetch: () => { throw Error('NO NETWORK') }, setInterval: () => 0, clearInterval() { }, setTimeout: () => 0, clearTimeout() { }, console, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } } };
c2.Date.parse = Date.parse; c2.Date.UTC = Date.UTC;
vm.createContext(c2); vm.runInContext(read('public/js/core.js'), c2);
const BB = win.BB;
const bot = (id, name, o) => Object.assign({ id, name, status: 'active', providerId: 'custom', connection: { status: 'active', transport: 'gateway' }, lastSeen: ago(10), state: null }, o || {});
const task = (id, o) => Object.assign({ id, title: 'Write the memo', assignee: 'a1', status: 'running', createdAt: ago(30), startedAt: ago(29) }, o || {});
const brec = (id, at) => ({ id, taskId: 't1', agentId: 'a1', action: 'notes.write', outcome: 'blocked', code: 'limit_daily', summary: 'BLOCKED: Daily budget 1c would be exceeded (spent 0c)', at });
function state(agents, extra) { BB.S = Object.assign({ killed: false, agents, tasks: [], requests: [], events: [], receipts: [] }, extra || {}); BB.money = { requests: [] }; BB.cards = { proposals: [] }; }

// a budget-blocked running job: blocked on the floor, in "on you", never "all on track"
state([bot('a1', 'Grok Bot')], { tasks: [task('t1')], receipts: [brec('r1', ago(5))] });
let t1 = BB.S.tasks[0];
assert(BB.budgetBlock(t1), 'budget block detected from the blocked receipt');
assert.equal(BB.botState(BB.S.agents[0]).kind, 'blocked', 'the floor reads Blocked, not Running');
assert.equal(BB.botState(BB.S.agents[0]).text, 'Blocked: over action budget');
assert.deepEqual(BB.onYou().map(i => i.type), ['budget']);
assert.equal(BB.onYou()[0].t.id, 't1'); assert.equal(BB.onYou()[0].a.id, 'a1');
assert.equal(BB.teamSummary().calm, false); assert.ok(/1 needs you/.test(BB.teamSummary().text));

// a later successful action on the same job clears it
state([bot('a1', 'Grok Bot')], { tasks: [task('t1')], receipts: [brec('r1', ago(5)), { id: 'r2', taskId: 't1', agentId: 'a1', action: 'notes.write', outcome: 'completed', at: ago(1) }] });
assert.equal(BB.budgetBlock(BB.S.tasks[0]), null, 'a completed action after the block clears it');
assert.equal(BB.botState(BB.S.agents[0]).kind, 'run');
assert.equal(BB.onYou().filter(i => i.type === 'budget').length, 0);

// a stopped or finished job never shows the item
state([bot('a1', 'Grok Bot')], { tasks: [task('t1', { status: 'failed', finishedAt: ago(2) })], receipts: [brec('r1', ago(5))] });
assert.equal(BB.budgetBlock(BB.S.tasks[0]), null);
assert.equal(BB.onYou().filter(i => i.type === 'budget').length, 0);

// non-budget blocks and other jobs' blocks do not leak in
state([bot('a1', 'Grok Bot')], { tasks: [task('t1')], receipts: [{ id: 'r9', taskId: 't1', agentId: 'a1', outcome: 'blocked', code: 'never', at: ago(5) }] });
assert.equal(BB.budgetBlock(BB.S.tasks[0]), null, 'a NEVER block is not a budget item');
state([bot('a1', 'Grok Bot')], { tasks: [task('t1')], receipts: [{ id: 'r8', taskId: 'other', agentId: 'a1', outcome: 'blocked', code: 'limit_daily', at: ago(5) }] });
assert.equal(BB.budgetBlock(BB.S.tasks[0]), null, 'another job’s block does not attach');

console.log('PASS client: budget-blocked jobs read Blocked, land in "on you", and clear on a later success or job end.');
