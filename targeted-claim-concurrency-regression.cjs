// Concurrency proof for the targeted claim (owner ask, Nov 24): the server claim must be atomic
// under simultaneous callers, not just sequentially eligible.
// - Two bots racing to claim the SAME job by id: exactly one wins; the loser gets null; the job
//   is claimed exactly once (one running record, one TASK_STARTED event).
// - The same bot firing repeated simultaneous claims on one job: claimed exactly once.
// - Untargeted race: two bots racing claimTask() on one eligible job: exactly one wins.
// - Targeted vs untargeted race on the same job: exactly one winner.
// Atomicity comes from the AGENT_CAS compare-and-set (EVAL), which the local store executes
// atomically; on production Redis the same EVAL is server-side atomic.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const src = read('api/index.js') + '\nmodule.exports.t={claimTask,newTask,listTasks,getJ,setJ,r};';
const mkctx = () => { const ctx = { require, module: { exports: {} }, process: { env: {} }, global: {}, console, fetch: () => { throw Error('NO NETWORK'); }, setTimeout, clearTimeout, URL, AbortSignal }; vm.runInNewContext(src, ctx); return ctx.module.exports.t; };

const A = id => ({ id, name: id, status: 'active', providerId: 'custom', lastSeen: new Date().toISOString() });

async function startedEvents(f, taskId) {
  const all = (await f.r(['LRANGE', 'fm:events', 0, 299])).filter(Boolean).map(x => JSON.parse(x));
  return all.filter(e => e.kind === 'TASK_STARTED' && e.taskId === taskId);
}

(async () => {
  // 1) two bots race a targeted claim on the same unassigned job
  {
    const f = mkctx();
    const job = await f.newTask({ title: 'race me', brief: '', assignee: null, createdBy: 'owner' });
    const [w1, w2] = await Promise.all([f.claimTask(A('agent_ra'), job.id), f.claimTask(A('agent_rb'), job.id)]);
    const winners = [w1, w2].filter(Boolean);
    assert.equal(winners.length, 1, 'exactly one of two concurrent targeted claims wins');
    assert.equal(winners[0].id, job.id, 'the winner holds the raced job');
    const live = await f.getJ('fm:task:' + job.id);
    assert.equal(live.status, 'running', 'raced job is running');
    assert.ok(['agent_ra', 'agent_rb'].includes(live.assignee), 'raced job has one assignee');
    assert.equal((await startedEvents(f, job.id)).length, 1, 'exactly one TASK_STARTED event for the raced job');
    assert.equal((await f.listTasks()).filter(t => t.status === 'running').length, 1, 'exactly one running task after the race');
  }
  // 2) the same bot fires repeated simultaneous targeted claims
  {
    const f = mkctx();
    const bot = A('agent_rc');
    const job = await f.newTask({ title: 'double tap', brief: '', assignee: null, createdBy: 'owner' });
    const res = await Promise.all([f.claimTask(bot, job.id), f.claimTask(bot, job.id), f.claimTask(bot, job.id)]);
    assert.ok(res.every(x => !x || x.id === job.id), 'repeated simultaneous claims never return a different job');
    const live = await f.getJ('fm:task:' + job.id);
    assert.equal(live.status, 'running', 'double-tapped job is running');
    assert.equal(live.assignee, bot.id, 'double-tapped job belongs to the caller');
    assert.equal((await startedEvents(f, job.id)).length, 1, 'repeated simultaneous claims produce exactly one TASK_STARTED event');
  }
  // 3) untargeted race: two bots, one eligible job
  {
    const f = mkctx();
    const job = await f.newTask({ title: 'untargeted race', brief: '', assignee: null, createdBy: 'owner' });
    const [w1, w2] = await Promise.all([f.claimTask(A('agent_rd')), f.claimTask(A('agent_re'))]);
    const winners = [w1, w2].filter(Boolean);
    assert.equal(winners.length, 1, 'exactly one of two concurrent untargeted claims wins');
    assert.equal(winners[0].id, job.id, 'untargeted race winner holds the only eligible job');
    assert.equal((await startedEvents(f, job.id)).length, 1, 'untargeted race yields exactly one TASK_STARTED event');
  }
  // 4) targeted vs untargeted race on the same job
  {
    const f = mkctx();
    const job = await f.newTask({ title: 'mixed race', brief: '', assignee: null, createdBy: 'owner' });
    const [w1, w2] = await Promise.all([f.claimTask(A('agent_rf'), job.id), f.claimTask(A('agent_rg'))]);
    const winners = [w1, w2].filter(Boolean);
    assert.equal(winners.length, 1, 'exactly one winner when targeted and untargeted claims race');
    assert.equal(winners[0].id, job.id, 'mixed-race winner holds the raced job');
    assert.equal((await startedEvents(f, job.id)).length, 1, 'mixed race yields exactly one TASK_STARTED event');
  }

  console.log('targeted-claim-concurrency-regression: PASS');
})().catch(e => { console.error('targeted-claim-concurrency-regression: FAIL', e && e.message); process.exit(1); });
