/* Regression: the five chain fixes from the live 3-bot prospecting run.
   A. work.handoff never silently truncates the brief (full text rides in context, sender is told).
   B. every handoff child brief leads with a scope pin naming the owner's ROOT request (bots cannot widen scope unnoticed).
   C. floor labels de-collide by actual position, and the handoff bubble owns the space above the sender (static asserts).
   D. a handoff chain is ONE run with ONE receipt: descendants fold under the root, status/cost/steps aggregate.
   E. planTaskParts pre-assigns a part to the bot its text names ("Muse: ..." -> Muse), before any category routing. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('api/index.js', 'utf8') + '\nmodule.exports.t={execute,planTaskParts,newTask,getJ,setJ,r,listTasks,listAgents,jobDetail,matchNamedBots,completeTask,claimTask};';
const c = { require, module: { exports: {} }, process: { env: {} }, global: {}, console, fetch: () => { throw Error('NO NETWORK') }, setTimeout, clearTimeout, URL, AbortSignal };
vm.runInNewContext(src, c); const f = c.module.exports.t;
const BBWork = require('./public/js/work-model.js');

/* --- C: static asserts on the floor de-collision --- */
const fl = fs.readFileSync('public/js/floor.js', 'utf8'), mt = fs.readFileSync('public/js/components/meeting.js', 'utf8');
assert(fl.includes('Math.abs(q.x-r.x)<7'), 'labels shift by actual on-screen proximity, not home room');
assert(fl.includes("querySelectorAll('.mbub')"), 'status notes stack apart from the handoff bubble');
assert(mt.includes("(at[1]-17)"), 'handoff bubble rides above the label line');
const rc = fs.readFileSync('public/js/receipts.js', 'utf8'), wm = fs.readFileSync('public/js/work-model.js', 'utf8');
assert(rc.includes('(t.orchestration || (j.children || []).length) && done'), 'chain roots get the combined run layout');
assert(rc.includes("f.chain ? 'Step' : 'Part'"), 'chain steps label as steps');
assert(wm.includes('run.orchestration ? parts : [run, ...parts]'), 'chain status covers root plus every hop');

/* --- D: pure-model chain folding --- */
const T = (id, over) => Object.assign({ id, title: id, status: 'done', createdAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:10:00Z', assignee: 'g', result: 'res ' + id }, over);
{
  const root = T('t1'), mid = T('t2', { parentId: 't1', assignee: 'm', finishedAt: '2026-01-01T00:20:00Z' }), leaf = T('t3', { parentId: 't2', assignee: 'i', finishedAt: '2026-01-01T00:30:00Z' });
  const runs = BBWork.buildRuns([root, mid, leaf]);
  assert.equal(runs.length, 1, 'three-hop chain folds into one run');
  assert.equal(runs[0].id, 't1');
  assert.equal(runs[0].parts.length, 2, 'descendants across hops, not only the first');
  assert.equal(runs[0].status, 'done');
  assert.equal(runs[0].finishedAtMs, Date.parse('2026-01-01T00:30:00Z'), 'run finishes when the last hop finishes');
  const ctx = BBWork.makeCtx({ tasks: [root, mid, leaf], agents: [{ id: 'g', name: 'Grok Bot' }, { id: 'm', name: 'Muse' }, { id: 'i', name: 'Instinct' }] }, Date.parse('2026-01-01T01:00:00Z'));
  const f1 = BBWork.finishedItem(runs[0], ctx);
  assert.equal(f1.kind, 'parts');
  assert.equal(f1.chain, true);
  assert.equal(f1.partsTotal, 3, 'the root is step 1 of its own chain');
  assert.deepEqual(f1.parts.map(p => p.n), [1, 2, 3]);
  assert.deepEqual(f1.bots, ['Grok Bot', 'Muse', 'Instinct']);
  const running = BBWork.buildRuns([T('t1'), T('t2', { parentId: 't1', status: 'running', finishedAt: null })]);
  assert.equal(running[0].status, 'running', 'a chain is not done while a hop runs');
  assert.equal(running[0].active, true);
  const mixed = BBWork.buildRuns([T('t1'), T('t2', { parentId: 't1', status: 'failed' })]);
  assert.equal(mixed[0].status, 'partial', 'root done + hop failed reads partial, not done');
  const solo = BBWork.buildRuns([T('t1')]);
  assert.equal(solo[0].parts.length, 0, 'standalone job unchanged');
  assert.equal(BBWork.finishedItem(solo[0], ctx).kind, 'single');
}

(async () => {
  const mk = (id, name) => f.setJ('fm:agent:' + id, { id, name, status: 'active', providerId: id, lastSeen: new Date().toISOString(), pollSec: 300, permissions: {}, limits: {} }).then(() => f.r(['SADD', 'fm:agents', id]));
  await mk('g', 'Grok Bot'); await mk('m', 'Muse'); await mk('i', 'Instinct');
  const G = { id: 'g', name: 'Grok Bot' }, M = { id: 'm', name: 'Muse' };

  /* --- E: named parts pre-assign --- */
  const plan = await f.planTaskParts({ title: 'Grok: research prospects; Muse: draft the note; Instinct: audit the claims' });
  assert.equal(plan.parts.length, 3);
  assert.equal(plan.parts[0].assignee, 'g', 'part naming Grok pre-assigns Grok');
  assert.equal(plan.parts[1].assignee, 'm', 'part naming Muse pre-assigns Muse');
  assert.equal(plan.parts[2].assignee, 'i', 'part naming Instinct pre-assigns Instinct');
  assert(/You named/.test(plan.parts[1].reason));
  assert.equal((await f.listTasks()).length, 0, 'planning stays read-only');
  const anon = await f.planTaskParts({ title: 'research prospects; draft the note' });
  assert.equal(anon.parts.length, 2, 'unnamed parts still split and route as before');

  /* --- A + B: handoff pin and no silent truncation --- */
  const parent = await f.newTask({ title: 'Find 10 startups', brief: 'owner brief', assignee: 'g' });
  const long = 'X'.repeat(1400) + ' TAIL-MARKER-10';
  const h = await f.execute(G, 'work.handoff', { task_id: parent.id, to: 'm', brief: long });
  assert.equal(h.data.brief_in_context, true, 'spill is flagged to the sender');
  assert(/full text is in the new task/.test(h.summary));
  const child = await f.getJ('fm:task:' + h.data.child_task_id);
  assert(child.brief.length <= 1500);
  assert(child.brief.startsWith('Scope, from the owner'), 'scope pin leads the child brief');
  assert(child.brief.includes('Find 10 startups'), 'pin names the root request');
  assert(child.context.includes('TAIL-MARKER-10'), 'the full brief survives in context');
  assert(child.context.includes('Scope, from the owner'), 'the pin survives in context too');
  const p2 = await f.newTask({ title: 'Small job', assignee: 'g' });
  await f.setJ('fm:task:' + p2.id, Object.assign({}, p2, { result: 'parent result text' }));
  const h2 = await f.execute(G, 'work.handoff', { task_id: p2.id, to: 'm', brief: 'short brief' });
  assert(!h2.data.brief_in_context, 'short briefs do not spill');
  const c2 = await f.getJ('fm:task:' + h2.data.child_task_id);
  assert.equal(c2.context, 'parent result text', 'no spill: context stays the parent result');
  assert(c2.brief.startsWith('Scope, from the owner'), 'pin applies to short briefs too');
  const h3 = await f.execute(M, 'work.handoff', { task_id: child.id, to: 'i', brief: 'hop two' });
  const c3 = await f.getJ('fm:task:' + h3.data.child_task_id);
  assert(c3.brief.includes('Find 10 startups'), 'a second hop pins the ROOT request, not the middle one');

  /* --- D server: one job view for the whole chain --- */
  const d = await f.jobDetail(parent.id);
  assert.equal(d.children.length, 2, 'job detail returns descendants across hops');
  assert.deepEqual(d.children.map(x => x.id).sort(), [child.id, c3.id].sort());
  const dMid = await f.jobDetail(child.id);
  assert.equal(dMid.children.length, 1, 'a mid-chain job still shows its own subtree');

  console.log('PASS chain fixes: named-part pre-assignment (E), handoff scope pin + no silent truncation (A,B), chain folds into one run/receipt with aggregated status (D), floor de-collision wired (C); no network.');
})().catch(e => { console.error(e); process.exit(1); });
