// Targeted claim (owner ask, Nov 24): a bot told "claim job X" must claim exactly X or nothing.
// - foreman_next_task accepts an optional task_id (REST ?taskId=): claim that job only when it is
//   queued and available to the caller (assigned to it, or unassigned).
// - No fallback: a specified task_id that is missing, already claimed, terminal, another bot's,
//   or an orchestration parent returns nothing and leaves the rest of the queue untouched.
// - Without task_id the oldest-eligible behavior is unchanged (unassigned jobs stay claimable by any bot).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

const src = read('api/index.js') + '\nmodule.exports.t={claimTask,newTask,listTasks,getJ,setJ,r};';
const mkctx = () => { const ctx = { require, module: { exports: {} }, process: { env: {} }, global: {}, console, fetch: () => { throw Error('NO NETWORK'); }, setTimeout, clearTimeout, URL, AbortSignal }; vm.runInNewContext(src, ctx); return ctx.module.exports.t; };

const A = id => ({ id, name: id, status: 'active', providerId: 'custom', lastSeen: new Date().toISOString() });

(async () => {
  {
    const f = mkctx();
    const bot = A('agent_bot1');
    const older = await f.newTask({ title: 'older unassigned real job', brief: '', assignee: null, createdBy: 'owner' });
    const target = await f.newTask({ title: 'intended assigned job', brief: '', assignee: bot.id, assignedBy: 'owner', createdBy: 'owner' });

    // targeted claim takes the exact assigned job, skipping the older unassigned one
    const claimed = await f.claimTask(bot, target.id);
    assert.equal(claimed && claimed.id, target.id, 'targeted claim returns the requested job');
    assert.equal(claimed.status, 'running', 'requested job is running');
    assert.equal((await f.getJ('fm:task:' + older.id)).status, 'queued', 'older unassigned job untouched');

    // a second bot cannot steal the claimed job by id
    const bot2 = A('agent_bot2');
    const steal = await f.claimTask(bot2, target.id);
    assert.equal(steal, null, 'already-claimed job is not_available to another bot');

    // bot2 targeting the other bot's queued assigned job gets nothing and claims nothing else
    const mine = await f.newTask({ title: 'bot2 job', brief: '', assignee: bot2.id, assignedBy: 'owner', createdBy: 'owner' });
    const foreign = await f.newTask({ title: 'bot3 only', brief: '', assignee: 'agent_bot3', assignedBy: 'owner', createdBy: 'owner' });
    const nope = await f.claimTask(bot2, foreign.id);
    assert.equal(nope, null, 'another bot\'s assigned job is not_available');
    assert.equal((await f.getJ('fm:task:' + mine.id)).status, 'queued', 'no fallback: own queued job NOT claimed when a different task_id was requested');
    assert.equal((await f.getJ('fm:task:' + older.id)).status, 'queued', 'no fallback: older unassigned job NOT claimed either');

    // unknown and terminal ids return nothing
    assert.equal(await f.claimTask(bot2, 'task_doesnotexist'), null, 'unknown id returns nothing');
    const done = await f.newTask({ title: 'done job', brief: '', assignee: bot2.id, createdBy: 'owner' });
    await f.setJ('fm:task:' + done.id, { ...done, status: 'done', finishedAt: new Date().toISOString() });
    assert.equal(await f.claimTask(bot2, done.id), null, 'terminal job is not_available');

    // untargeted behavior unchanged: oldest eligible first, unassigned included
    const next = await f.claimTask(bot2);
    assert.equal(next && next.id, older.id, 'untargeted claim still takes the oldest eligible job');
  }
  // MCP tool schema advertises task_id and the REST route accepts ?taskId=
  const api = read('api/index.js');
  assert.ok(/foreman_next_task[\s\S]{0,400}task_id/.test(api), 'MCP foreman_next_task schema documents task_id');
  assert.ok(/searchParams\.get\('taskId'\)/.test(api), 'REST /gateway/tasks/next accepts ?taskId=');
  assert.ok(!/foreman_claim\b/.test(api), 'dead foreman_claim reference is gone');

  console.log('targeted-claim-regression: PASS');
})().catch(e => { console.error('targeted-claim-regression: FAIL', e && e.message); process.exit(1); });
