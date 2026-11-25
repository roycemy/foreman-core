/* Regression: per-task progress bars. Multi-step runs (plans and handoff chains) expose real steps done/total;

   single-step jobs expose no fraction (no invented progress); the Work panel and floor labels render the bar; CSS exists. */
const fs = require('fs'), assert = require('assert');
const BBWork = require('./public/js/work-model.js');

const T = (id, over) => Object.assign({ id, title: id, status: 'queued', createdAt: '2026-01-01T00:00:00Z', assignee: 'g', result: null }, over);
const agents = [{ id: 'g', name: 'Grok Bot', status: 'active' }, { id: 'm', name: 'Muse', status: 'active' }];

/* plan: 1 of 3 parts done, second running */
{
  const plan = T('p', { orchestration: true, status: 'running', partIds: ['p1', 'p2', 'p3'] });
  const p1 = T('p1', { parentId: 'p', partIndex: 0, status: 'done', finishedAt: '2026-01-01T00:05:00Z' });
  const p2 = T('p2', { parentId: 'p', partIndex: 1, status: 'running' });
  const p3 = T('p3', { parentId: 'p', partIndex: 2, status: 'waiting' });
  const S = { tasks: [plan, p1, p2, p3], agents, requests: [], events: [] };
  const item = BBWork.activeItems(S, Date.parse('2026-01-01T00:06:00Z'))[0];
  assert(item, 'active plan listed');
  assert.deepEqual(item.progress, { done: 1, total: 3 }, 'plan progress counts done parts');
  assert.equal(item.progress.total, 3);
  assert.deepEqual(BBWork.runProgress(S.tasks, 'p2'), { done: 1, total: 3, status: 'running' }, 'runProgress from a part resolves the plan');
  assert.deepEqual(BBWork.runProgress(S.tasks, 'p'), { done: 1, total: 3, status: 'running' }, 'runProgress from the root');
}

/* handoff chain: root done, hop 2 done, hop 3 running = 2 of 3 */
{
  const t1 = T('t1', { status: 'done', finishedAt: '2026-01-01T00:05:00Z' });
  const t2 = T('t2', { parentId: 't1', assignee: 'm', status: 'done', finishedAt: '2026-01-01T00:08:00Z' });
  const t3 = T('t3', { parentId: 't2', assignee: 'm', status: 'running' });
  const S = { tasks: [t1, t2, t3], agents, requests: [], events: [] };
  const item = BBWork.activeItems(S, Date.parse('2026-01-01T00:09:00Z'))[0];
  assert(item, 'active chain listed');
  assert.deepEqual(item.progress, { done: 2, total: 3 }, 'chain progress counts the root as a step');
  assert.deepEqual(BBWork.runProgress(S.tasks, 't3'), { done: 2, total: 3, status: 'running' });
}

/* single-step job: no progress fraction */
{
  const S = { tasks: [T('s1', { status: 'running' })], agents, requests: [], events: [] };
  const item = BBWork.activeItems(S, Date.parse('2026-01-01T00:02:00Z'))[0];
  assert.equal(item.progress, null, 'single task claims no step fraction');
  assert.equal(BBWork.runProgress(S.tasks, 's1'), null);
  assert.equal(BBWork.runProgress(S.tasks, 'missing'), null);
}

/* finished run still reports progress for receipts/work panel */
{
  const S = { tasks: [T('f', { status: 'done', finishedAt: '2026-01-01T00:05:00Z' }), T('f2', { parentId: 'f', status: 'done', finishedAt: '2026-01-01T00:07:00Z' })], agents, requests: [], events: [] };
  assert.deepEqual(BBWork.runProgress(S.tasks, 'f'), { done: 2, total: 2, status: 'done' });
}

/* UI wiring (static asserts) */
const wjs = fs.readFileSync('public/js/work.js', 'utf8'), fl = fs.readFileSync('public/js/floor.js', 'utf8');
const wc = fs.readFileSync('public/styles/components/work.css', 'utf8'), mc = fs.readFileSync('public/styles/components/motion.css', 'utf8');
assert(wjs.includes('role="progressbar"') && wjs.includes('aria-valuenow'), 'work panel bar is a real progressbar');
assert(wjs.includes('wprog ind'), 'indeterminate bar for single running jobs');
assert(!wjs.includes('aria-valuenow="${i.progress.total}"') || wjs.includes('aria-valuemax'), 'aria wired');
assert(fl.includes('lprog') && fl.includes('runProgress'), 'floor label bar wired to runProgress');
assert(wc.includes('.wprog') && wc.includes('@keyframes wprog-slide'), 'work panel bar styled');
assert(wc.includes('prefers-reduced-motion'), 'indeterminate bar respects reduced motion');
assert(mc.includes('.lprog'), 'floor label bar styled');

console.log('PASS task progress: plans and chains report real steps done/total, single jobs claim no fraction, Work panel and floor labels render accessible bars; no network.');
