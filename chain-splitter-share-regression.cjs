/* Regression: inline-name splitter + bot-deliberate assignments + one-tap public share.
   1. A single-paragraph prompt with inline "Name:" segments ("... Grok: ... Muse: ... Instinct: ...") splits into
      named parts server-side (splitNamedSegments) and planTaskParts pre-assigns each to that bot; the client gates
      (app.js) route such prompts to /api/tasks/plan via BB.namedSegs.
   2. A handoff/assignment made by a bot carries assignedBy 'bot', so the asleep-fallback sweep never steals it back
      (the live bug: a handoff to Muse was moved back to Grok, the chain died at 2 Grok steps).
   3. A finished chain carries its FINAL answer (last done hop's result) in the feed model and the receipt leads with it.
   4. One-tap share: publicReceiptAuto generates every public word from non-private facts (bot names, step count,
      status, timing, budget) and publishes in one call; job text never enters the snapshot; revoke kills the link. */
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('api/index.js', 'utf8') + '\nmodule.exports.t={execute,planTaskParts,splitNamedSegments,newTask,getJ,setJ,r,listTasks,listAgents,reassignAsleepQueuedTasks,publicReceiptAuto,publicReceiptRead,publicReceiptRevoke,queueGuidance,completeTask,claimTask};';
const c = { require, module: { exports: {} }, process: { env: {} }, global: {}, console, fetch: () => { throw Error('NO NETWORK') }, setTimeout, clearTimeout, URL, AbortSignal };
vm.runInNewContext(src, c); const f = c.module.exports.t;
const BBWork = require('./public/js/work-model.js');

/* --- static asserts: client gates and receipt final block --- */
const app = fs.readFileSync('public/js/app.js', 'utf8'), core = fs.readFileSync('public/js/core.js', 'utf8');
assert(core.includes('BB.namedSegs'), 'client has the inline-name detector');
assert((app.match(/BB\.namedSegs/g) || []).length >= 2, 'both plan gates fire on inline named segments');
const rc = fs.readFileSync('public/js/receipts.js', 'utf8');
assert(rc.includes('Final answer'), 'a chain receipt leads with the final answer');
assert(rc.includes('rfinal'), 'the final answer gets its own block style');
const sh = fs.readFileSync('public/js/share.js', 'utf8');
assert(sh.includes("/api/public-receipts/auto"), 'share button calls the one-tap endpoint');
assert(!sh.includes('sh-template'), 'no more blank-fields form in the share modal');
assert(sh.includes('sh-unshare'), 'the modal offers unshare');
assert(rc.includes('One tap generates a safe snapshot'), 'receipt view explains the one-tap share');
const api = fs.readFileSync('api/index.js', 'utf8');
assert(api.includes("'/public-receipts/auto'"), 'the one-tap route exists');
assert(api.includes("assignedBy:'bot'"), 'bot-made handoffs/assignments are deliberate');
assert(api.includes('|| t0.assignedBy ||'), 'the sweep never moves a deliberately assigned job');

(async () => {
  const mk = (id, name, lastSeen) => f.setJ('fm:agent:' + id, { id, name, status: 'active', providerId: id, lastSeen: lastSeen || new Date().toISOString(), pollSec: 300, permissions: {}, limits: {} }).then(() => f.r(['SADD', 'fm:agents', id]));
  await mk('g', 'Grok Bot'); await mk('m', 'Muse'); await mk('i', 'Instinct');
  const G = { id: 'g', name: 'Grok Bot' };
  const agents = await f.listAgents();

  /* --- 1: inline splitter on the owner's real prompt shape --- */
  const PROMPT = 'Team task: improve the Alter dashboard itself. Grok: research the best examples of live, interactive "AI team at work" visuals (bots moving, progress, handoffs) and what makes them feel alive. Muse: using Grok\'s research, propose concrete visual and interaction upgrades for the floor view so a founder feels the team working. Instinct: review both and ship the smallest change that makes the biggest difference.';
  const segs = f.splitNamedSegments(PROMPT, agents);
  assert(segs, 'inline named segments split');
  assert.equal(segs.length, 3, 'three inline segments');
  assert(segs[0].startsWith('Grok:') && segs[1].startsWith('Muse:') && segs[2].startsWith('Instinct:'), 'split at each name boundary in order');
  const plan = await f.planTaskParts({ title: PROMPT });
  assert.equal(plan.parts.length, 3, 'the plan keeps all three inline steps (no 120-char drop)');
  assert.equal(plan.parts[0].assignee, 'g'); assert.equal(plan.parts[1].assignee, 'm'); assert.equal(plan.parts[2].assignee, 'i');
  assert.equal(plan.parts[1].reason, 'You named Muse.');
  assert(plan.parts[0].title.length <= 120, 'part titles fit the cap; full text rides in the brief');
  const one = await f.planTaskParts({ title: 'Grok: just do this one thing quickly' });
  assert.equal(one.parts.length, 0, 'a single named segment is one task, not a plan');
  const none = f.splitNamedSegments('research the market and draft a note', agents);
  assert.equal(none, null, 'no names, no split');

  /* --- 2: bot handoffs are deliberate; the sweep leaves them alone --- */
  const parent = await f.newTask({ title: 'Root job', brief: 'owner brief', assignee: 'g' });
  const h = await f.execute(G, 'work.handoff', { task_id: parent.id, to: 'm', brief: 'take the next hop' });
  const child = await f.getJ('fm:task:' + h.data.child_task_id);
  assert.equal(child.assignedBy, 'bot', 'handoff child is marked deliberate');
  const a = await f.execute(G, 'work.assign', { assignee: 'i', title: 'Delegated job', source_id: 'src-1', brief: 'b' });
  const delegated = await f.getJ('fm:task:' + a.data.task_id);
  assert.equal(delegated.assignee, 'i'); assert.equal(delegated.assignedBy, 'bot', 'work.assign is deliberate too');
  /* put the child back to queued for Muse (handoff leaves it queued), make Muse asleep, sweep as Grok: it must stay */
  await f.setJ('fm:agent:m', Object.assign(await f.getJ('fm:agent:m'), { lastSeen: new Date(Date.now() - 3600e3).toISOString() }));
  await f.reassignAsleepQueuedTasks('g');
  const after = await f.getJ('fm:task:' + child.id);
  assert.equal(after.assignee, 'm', 'sweep never steals a bot handoff back');
  await f.setJ('fm:agent:m', Object.assign(await f.getJ('fm:agent:m'), { lastSeen: new Date().toISOString() }));

  /* --- 3: chain final answer in the feed model --- */
  const T = (id, over) => Object.assign({ id, title: id, status: 'done', createdAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:10:00Z', assignee: 'g', result: 'res ' + id }, over);
  const root = T('c1'), mid = T('c2', { parentId: 'c1', assignee: 'm', result: 'middle result', finishedAt: '2026-01-01T00:20:00Z' }), leaf = T('c3', { parentId: 'c2', assignee: 'i', result: 'THE FINAL ANSWER', finishedAt: '2026-01-01T00:30:00Z' });
  const runs = BBWork.buildRuns([root, mid, leaf]);
  const ctx = BBWork.makeCtx({ tasks: [root, mid, leaf], agents: [{ id: 'g', name: 'Grok Bot' }, { id: 'm', name: 'Muse' }, { id: 'i', name: 'Instinct' }] }, Date.parse('2026-01-01T01:00:00Z'));
  const fi = BBWork.finishedItem(runs[0], ctx);
  assert(fi.final, 'a finished chain exposes its final answer');
  assert.equal(fi.final.bot, 'Instinct', 'the final answer is the last hop\'s');
  assert.equal(fi.final.result, 'THE FINAL ANSWER');
  const solo = BBWork.finishedItem(BBWork.buildRuns([T('s1')])[0], ctx);
  assert(!solo.final, 'a single job has no separate final block');

  /* --- 4: one-tap share --- */
  const job = await f.newTask({ title: 'PRIVATE-JOB-TEXT do not share', brief: 'secret brief', assignee: 'g' });
  await f.setJ('fm:task:' + job.id, Object.assign({}, job, { status: 'done', startedAt: new Date(Date.now() - 120e3).toISOString(), finishedAt: new Date().toISOString(), result: 'private result text' }));
  const hop = await f.newTask({ title: 'PRIVATE-CHILD-TEXT', brief: 'x', assignee: 'm', parentId: job.id });
  await f.setJ('fm:task:' + hop.id, Object.assign({}, hop, { status: 'done', startedAt: new Date(Date.now() - 60e3).toISOString(), finishedAt: new Date().toISOString(), result: 'hop result' }));
  const pub = await f.publicReceiptAuto(job.id);
  assert.equal(pub.status, 201, 'one tap publishes');
  const s = pub.body.snapshot;
  assert(s.title.includes('Grok Bot') && s.title.includes('Muse'), 'generated title names the bots');
  assert(!/PRIVATE/i.test(s.title + s.summary + s.template), 'no private job text anywhere in the snapshot');
  assert(!/do not share|secret brief|private result/i.test(JSON.stringify(s)), 'briefs and results never enter the snapshot');
  assert.equal(s.outcome, 'completed');
  assert(s.steps.length >= 3, 'step codes generated');
  assert(pub.body.path.startsWith('/receipt/'), 'link path returned');
  const read = await f.publicReceiptRead(pub.body.token);
  assert(read && read.snapshot.title === s.title, 'the public link reads back the same snapshot');
  assert.equal(read.snapshot.provenance.includes('one tap'), true, 'provenance says the text was generated, not written');
  const rev = await f.publicReceiptRevoke(pub.body.token);
  assert.equal(rev.status, 200);
  assert.equal(await f.publicReceiptRead(pub.body.token), null, 'an unshared link no longer opens');
  const open = await f.newTask({ title: 'still running', assignee: 'g' });
  const notYet = await f.publicReceiptAuto(open.id);
  assert.equal(notYet.status, 404, 'only a finished job can be shared');
  const failJob = await f.newTask({ title: 'PRIVATE-FAILED-JOB', assignee: 'i' });
  await f.setJ('fm:task:' + failJob.id, Object.assign({}, failJob, { status: 'failed', startedAt: new Date(Date.now() - 30e3).toISOString(), finishedAt: new Date().toISOString() }));
  const fpub = await f.publicReceiptAuto(failJob.id);
  assert.equal(fpub.status, 201);
  assert(fpub.body.snapshot.title.includes('attempted'), 'a failed job says attempted, not completed');
  assert.equal(fpub.body.snapshot.outcome, 'failed');

  /* --- 5: queue-drain guidance (Muse asked which of 2 queued jobs to start; the answer is always: both, in order) --- */
  await mk('qb', 'Queue Bot');
  const q1 = await f.newTask({ title: 'queued one', assignee: 'qb' });
  const q2 = await f.newTask({ title: 'queued two', assignee: 'qb' });
  const g0 = await f.queueGuidance({ id: 'qb' });
  assert.equal(g0.queued_for_you, 2, 'both queued jobs counted');
  assert(/without asking the owner/.test(g0.next), 'the guidance answers the question Muse asked');
  assert(/oldest first/.test(g0.next));
  /* completing a running job reports the remaining queue */
  await mk('qc', 'Queue Bot Three');
  const run1 = await f.newTask({ title: 'running job', assignee: 'qc' });
  await f.setJ('fm:task:' + run1.id, Object.assign({}, run1, { status: 'running', startedAt: new Date().toISOString() }));
  const mq = await f.newTask({ title: 'qc queued', assignee: 'qc' });
  const done = await f.completeTask(await f.getJ('fm:agent:qc'), run1.id, { result: 'done' });
  assert.equal(done.status, 200);
  assert.equal(done.body.queued_for_you, 1, 'complete response carries the remaining queue');
  assert(/claim the next one now/.test(done.body.next));
  const empty = await f.completeTask; assert(empty, 'completeTask exported');
  const gnone = await f.queueGuidance({ id: 'never-used-agent' });
  assert.equal(gnone, null, 'no guidance when the queue is empty');
  const desc = api.match(/foreman_next_task', description: '([^']+)'/);
  assert(desc && /without asking the owner/.test(desc[1]) && /until nothing is queued/.test(desc[1]), 'the MCP tool description itself says drain the queue');

  /* --- 6: cheap standing-watch probe for bots with no free push channel (Muse on any plan) --- */
  assert(/name:'foreman_queue_probe',description:'Cheapest possible standing-watch check/.test(api), 'MCP exposes the probe tool');
  assert(/path === '\/gateway\/queue-probe' && req\.method === 'GET'/.test(api), 'REST exposes the probe');
  assert((api.match(/\/gateway\/queue-probe/g) || []).length >= 3, 'probe registered as a poll path for presence');
  assert(/foreman_queue_probe[\s\S]{0,220}queueGuidance/.test(api), 'probe reuses the queue-drain guidance');
  const conn = fs.readFileSync('public/js/connect.js', 'utf8');
  assert(conn.includes('foreman_queue_probe'), 'the Muse setup message teaches the cheap probe, not 10s claims');
  assert(!conn.includes('runs every 10 seconds'), 'the expensive 10-second watch instruction is gone');
  assert(!conn.includes('Create one scheduled task'), 'Muse setup no longer teaches scheduled polling (Meta declines it)');
  assert(conn.includes('INSTANT WAKE SETUP'), 'Muse setup leads with email instant wake');
  assert(conn.includes('wakeNonce'), 'Muse setup teaches nonce verification');
  const core = fs.readFileSync('public/js/core.js', 'utf8');
  assert(core.includes('Run your Alter queue now'), 'nudgeText is the run-my-queue drain instruction');
  const inbox = fs.readFileSync('public/js/inbox.js', 'utf8');
  assert(inbox.includes('data-runqueue'), 'asleep card carries the Run my queue button');

  console.log('chain-splitter-share regression: ALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
