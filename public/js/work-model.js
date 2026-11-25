/* Work visibility model: turns the app's real state (tasks, agents, requests, events) into runs, honest statuses and short updates.
   Pure functions, no DOM, no network: the same file runs in the browser (window.BBWork) and in the regression tests (require).
   Rules it keeps:
   - A status is only what the stored records support. Queued is not running; a notification sent is not a pickup.
   - A run is one piece of work. A plan's parts are nested under it and never counted as separate work.
   - Unknown stays unknown: "pickup not confirmed", "last heard from", never a guessed cause.
   - Cadence is shown only when the bot declared a valid one (60 to 3600 s); nothing is hard-coded or promised as an ETA.
   - Text from tasks, bots and results is data. This file builds strings only; the UI escapes them. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.BBWork = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TERMINAL = new Set(['done', 'failed', 'dismissed']);
  const FLOOR_WINDOW_MS = 150000, RECENT_FINISH_MS = 20000, FAILURE_STICKY_MS = 600000, STALE_AFTER_MS = 75000;
  const cadence = a => { const s = Number(a && a.pollSec); return Number.isFinite(s) && s >= 60 && s <= 3600 ? s : 0; };
  const ms = x => { const v = Date.parse(x || ''); return Number.isFinite(v) ? v : null; };
  const idx = list => { const m = new Map(); for (const x of list || []) if (x && x.id) m.set(x.id, x); return m; };
  const short = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const ago = (from, now) => { const d = from == null ? null : Math.max(0, now - from); if (d == null) return ''; const s = Math.round(d / 1000); if (s < 5) return 'just now'; if (s < 60) return s + ' s'; const m = Math.floor(s / 60); if (m < 60) return m + ' min'; const h = Math.floor(m / 60); if (h < 24) return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); return Math.floor(h / 24) + ' d'; };
  const agoText = (from, now) => { const a = ago(from, now); return a === 'just now' ? a : a ? a + ' ago' : ''; };

  /* a part: its parent is present, is a plan, and lists it. A part whose plan is gone from state is shown as its own item rather than hidden. */
  /* the root of a task's chain: plan parts fold under their plan, handoff children under the job that started the chain,
     so a multi-bot chain reads as ONE run with ONE receipt. A child whose parent aged out of state stands alone. */
  function partParent(t, by) { if (!t || !t.parentId) return null; let cur = t, root = null, n = 0; while (cur.parentId && by.get(cur.parentId) && n++ < 10) { cur = by.get(cur.parentId); root = cur; } return root; }

  /* task-level phase from the stored status and the few markers the server writes */
  function phaseOf(t) {
    if (!t) return 'unknown';
    if (t.status === 'done') return 'done';
    if (t.status === 'dismissed') return 'dismissed';
    if (t.status === 'failed') return t.notRun || /^Not run:/.test(String(t.result || '')) ? 'notrun' : (t.result === 'Stopped by owner' || t.autoStopped) ? 'stopped' : 'failed';
    return t.status === 'running' || t.status === 'queued' || t.status === 'waiting' ? t.status : 'unknown';
  }

  /* run status. A plan is done only when every part is done; partial means some finished and some did not. */
  function runStatus(run, parts, missing) {
    if (!run.orchestration && !parts.length) { const p = phaseOf(run); return p === 'notrun' ? 'failed' : p === 'dismissed' ? 'stopped' : p; }
    if (missing) { const s = run.status; return s === 'done' ? 'done' : s === 'failed' ? 'failed' : s === 'waiting' ? 'waiting' : 'running'; } // parts aged out of state: the plan's own status is all there is
    /* a plan is its parts; a handoff chain is its root plus every hop - the run is not done until the last hop is */
    const all = run.orchestration ? parts : [run, ...parts];
    const ph = all.map(phaseOf), done = ph.filter(x => x === 'done').length, bad = ph.filter(x => ['failed', 'stopped', 'notrun', 'dismissed'].includes(x)).length;
    if (done === all.length) return 'done';
    if (done + bad === all.length) return done ? 'partial' : (ph.includes('stopped') && !ph.includes('failed') ? 'stopped' : 'failed');
    return ph.includes('running') ? 'running' : ph.includes('queued') ? 'queued' : 'waiting';
  }

  /* group tasks into runs. Returns [{ id, task, parts, status, active, partsMissing, current }] newest activity first */
  function buildRuns(tasks) {
    const by = idx(tasks), runs = [];
    for (const t of tasks || []) {
      if (!t || !t.id || partParent(t, by)) continue;
      if (t.status === 'dismissed') continue;
      const parts = t.orchestration ? (t.partIds || []).map(i => by.get(i)).filter(Boolean) : (tasks || []).filter(x => { const p = partParent(x, by); return p && p.id === t.id; }).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))), missing = t.orchestration && parts.length < (t.partIds || []).length;
      const status = runStatus(t, parts, missing), active = ['queued', 'running', 'waiting'].includes(status);
      const current = parts.find(p => p.status === 'running') || parts.find(p => p.status === 'queued') || parts.find(p => p.status === 'waiting') || (t.orchestration ? null : t);
      const fin = !active ? Math.max(...[ms(t.finishedAt), ...parts.map(p => ms(p.finishedAt))].filter(x => x != null), 0) || null : ms(t.finishedAt);
      runs.push({ id: t.id, task: t, parts, status, active, partsMissing: !!missing, current, finishedAtMs: fin, createdAtMs: ms(t.createdAt) });
    }
    return runs;
  }

  /* is a bot able to take work right now, from stored state only */
  function botBlock(a, ctx) {
    if (!a) return { code: 'unknown_bot', text: 'The assigned bot is not in your workspace.' };
    if (a.status === 'revoked') return { code: 'revoked', text: a.name + "'s access is revoked." };
    if (ctx.killed) return { code: 'killed', text: 'Emergency stop is on.' };
    if (a.paused) return { code: 'paused', text: a.name + ' is paused.' };
    return null;
  }

  function wakeFact(taskId, events, now) {
    let best = null;
    for (const e of events || []) { if (!e || e.taskId !== taskId || !/^wake_(sent|failed|deferred|gave_up)$/.test(e.type)) continue; const at = ms(e.at); if (at != null && (!best || at > best.at)) best = { type: e.type, at, text: e.text }; }
    if (!best) return null;
    const ch = /\(([a-z]+)\)/.exec(best.text || ''); const via = ch ? ' by ' + ch[1] : '';
    return best.type === 'wake_sent' ? { code: 'wake_sent', text: 'Wake sent' + via + ' ' + agoText(best.at, now) + '; pickup not confirmed' } : best.type === 'wake_failed' ? { code: 'wake_failed', text: 'Wake failed' + via + ' ' + agoText(best.at, now) } : best.type === 'wake_gave_up' ? { code: 'wake_gave_up', text: 'Wake was not delivered; the bot picks it up at its next check-in' } : { code: 'wake_deferred', text: 'Wake held back briefly after another wake' };
  }

  /* one task's honest line: { phase, label, reason, detail[], ageMs } */
  function describe(t, ctx) {
    const now = ctx.now, by = ctx.byId, a = t.assignee && ctx.agents.get(t.assignee), name = a ? a.name : null, detail = [];
    const pend = (ctx.requests || []).filter(q => q && q.status === 'pending' && q.taskId === t.id);
    if (['done', 'failed', 'dismissed'].includes(t.status)) return { phase: phaseOf(t), label: { done: 'Finished', failed: 'Didn\'t finish', stopped: 'Stopped', notrun: 'Not run' }[phaseOf(t)] || 'Ended', reason: null, detail, ageMs: null };
    if (pend.length) return { phase: 'waiting', label: 'Waiting for you', reason: 'approval', detail: [(name || 'The bot') + ' asked to ' + (pend[0].label ? String(pend[0].label).toLowerCase() : 'take an action')], ageMs: now - (ms(pend[0].createdAt) || now) };
    if (t.status === 'running') {
      const started = ms(t.startedAt), prog = ms(t.progressAt);
      const working = prog != null && started != null && prog > started + 1000; // a post-claim progress report is the only evidence execution started
      detail.push(name ? 'Claimed by ' + name + ' ' + agoText(started, now) : 'Claimed ' + agoText(started, now));
      detail.push(working ? 'Last update ' + agoText(prog, now) : 'No update since it was claimed');
      return { phase: 'running', label: working ? 'In progress' : 'Claimed', reason: null, detail, ageMs: started == null ? null : now - started };
    }
    if (t.status === 'waiting') {
      const dep = t.dependsOn && by.get(t.dependsOn), pi = dep && dep.partIndex != null ? dep.partIndex + 1 : null;
      if (ctx.killed) return { phase: 'waiting', label: 'Waiting', reason: 'killed', detail: ['Emergency stop is on'], ageMs: null };
      return { phase: 'waiting', label: 'Waiting', reason: dep ? 'dependency' : 'hold', detail: [dep ? 'Waiting for ' + (pi ? 'part ' + pi + ' ' : 'the previous part ') + '(' + short(dep.title, 40) + ') to finish' : 'Not started yet'], ageMs: null };
    }
    // queued
    const since = ms(t.assignedAt) || ms(t.createdAt), age = since == null ? null : Math.max(0, now - since);
    if (!t.assignee) {
      const why = t.unrouted ? "Alter couldn't route it" : t.allAsleep ? 'Every bot was asleep when it was queued' : 'No bot picked yet';
      return { phase: 'queued', label: 'Needs a bot', reason: 'needs_owner', detail: [why + ': pick one in your inbox'], ageMs: age };
    }
    const blk = botBlock(a, ctx);
    if (blk) return { phase: 'waiting', label: 'Can\'t start', reason: blk.code, detail: [blk.text], ageMs: age };
    detail.push('Queued for ' + (name || 'a bot') + (age != null ? ' · ' + ago(since, now) : ''));
    const seen = a && ms(a.lastSeen), win = cadence(a) ? 2 * cadence(a) * 1000 : FLOOR_WINDOW_MS;
    let reason = 'pickup_unconfirmed';
    if (a && seen == null) { detail.push(name + " hasn't checked in yet"); reason = 'never_checked_in'; }
    else if (a && now - seen > win) { detail.push(name + ' last heard from ' + agoText(seen, now)); reason = 'stale_checkin'; }
    else if (a) detail.push(name + ' last heard from ' + agoText(seen, now));
    if (a && cadence(a)) detail.push('Declared check-in about every ' + Math.round(cadence(a) / 60 * 10) / 10 + ' min');
    const w = wakeFact(t.id, ctx.events, now); if (w) detail.push(w.text);
    detail.push('Pickup not confirmed');
    return { phase: 'queued', label: 'Queued', reason, detail, ageMs: age };
  }

  /* what the owner sees in the Active list: one row per active run */
  function activeItems(S, now) {
    const ctx = makeCtx(S, now), runs = buildRuns(S.tasks || []).filter(r => r.active);
    return runs.map(r => {
      const cur = r.current || r.task, d = describe(cur, ctx), a = cur.assignee && ctx.agents.get(cur.assignee);
      const partNo = r.task.orchestration && r.current ? (r.current.partIndex != null ? r.current.partIndex : r.parts.indexOf(r.current)) + 1 : null;
      const seq = r.task.orchestration ? r.parts : (r.parts.length ? [r.task, ...r.parts] : []);
      const progress = (r.task.orchestration || seq.length > 1) ? { done: seq.filter(p => phaseOf(p) === 'done').length, total: r.task.orchestration ? (r.task.partIds || []).length : seq.length } : null;
      return { id: r.id, title: r.task.title, status: r.status, label: d.label, phase: d.phase, reason: d.reason, detail: d.detail, bot: a ? a.name : null, botId: a ? a.id : null, ageMs: d.ageMs,
        part: r.task.orchestration ? { n: partNo, of: (r.task.partIds || []).length, title: r.current ? r.current.title : null } : null, progress, failedSoFar: r.parts.filter(p => ['failed', 'notrun', 'stopped'].includes(phaseOf(p))).length, partsMissing: r.partsMissing,
        sortAt: ms(r.task.createdAt) || 0 };
    }).sort((x, y) => y.sortAt - x.sortAt);
  }

  const urlsIn = text => { const out = [], seen = new Set(); String(text || '').replace(/https?:\/\/[^\s<>"')\]]+/g, u => { u = u.replace(/[.,;:!?]+$/, ''); try { const x = new URL(u); if ((x.protocol === 'https:' || x.protocol === 'http:') && !seen.has(x.href)) { seen.add(x.href); out.push(x.href); } } catch {} return u; }); return out.slice(0, 12); };
  const botOf = (t, ctx) => (t.assignee && ctx.agents.get(t.assignee)) || null;

  /* a finished run, shaped for the receipt and the Finished list. The result is the stored result of the work, never stitched or rewritten:
     a single task shows its own result; a plan shows each part's own result in order and says so when there is no combined answer. */
  function finishedItem(run, ctx) {
    const t = run.task, now = ctx.now;
    /* a handoff chain shows every hop including the job that started it, in order, as one finished item */
    const chain = !t.orchestration && run.parts.length > 0, seq = t.orchestration ? run.parts : (chain ? [t, ...run.parts] : []);
    const parts = seq.map((p, i) => ({ id: p.id, n: (p.partIndex != null ? p.partIndex : i) + 1, title: p.title, phase: phaseOf(p), bot: (botOf(p, ctx) || {}).name || null, result: p.result == null ? '' : String(p.result), finishedAtMs: ms(p.finishedAt) }));
    const done = parts.filter(p => p.phase === 'done').length;
    const status = run.status;
    const kind = parts.length ? 'parts' : !t.orchestration ? 'single' : 'summary_only';
    const text = kind === 'single' ? (t.result == null ? '' : String(t.result)) : kind === 'summary_only' ? String(t.result || '') : '';
    /* a chain's last finished hop IS the final answer the earlier steps fed into; show it as one, with every step below */
    const lastDone = chain ? parts.filter(p => p.phase === 'done').slice(-1)[0] : null;
    const final = lastDone ? { bot: lastDone.bot, result: lastDone.result } : null;
    return { id: run.id, title: t.title, status, finishedAtMs: run.finishedAtMs, bots: [...new Set((parts.length ? parts.map(p => p.bot) : [(botOf(t, ctx) || {}).name || null]).filter(Boolean))],
      kind, chain, final, text, parts, partsDone: done, partsTotal: t.orchestration ? (t.partIds || []).length : (parts.length || 1), partsMissing: run.partsMissing,
      note: kind === 'parts' ? (chain && final ? 'The last step produced the final answer. Every step\'s own result is shown below, in order.' : 'No single combined answer was produced. Each part\'s own result is shown, in order.') : kind === 'summary_only' ? 'The individual parts are no longer available; this is the plan\'s own saved summary.' : '',
      sources: urlsIn(kind === 'parts' ? parts.map(p => p.result).join('\n') : text) };
  }

  function finishedItems(S, now) {
    const ctx = makeCtx(S, now);
    return buildRuns(S.tasks || []).filter(r => !r.active && r.finishedAtMs != null && ['done', 'failed', 'partial', 'stopped'].includes(r.status) && !r.task.synthetic).map(r => finishedItem(r, ctx)).sort((a, b) => b.finishedAtMs - a.finishedAtMs);
  }

  /* one-time completion handling. `prev` is the last snapshot's { id: status }; returns the runs that moved from active to a final state now. */
  function snapshot(S) { const o = {}; for (const r of buildRuns(S.tasks || [])) o[r.id] = r.status; return o; }
  function transitions(prev, S, now) {
    if (!prev) return [];
    const ctx = makeCtx(S, now), out = [];
    for (const r of buildRuns(S.tasks || [])) { const was = prev[r.id]; if (was && ['queued', 'running', 'waiting'].includes(was) && !r.active && ['done', 'failed', 'partial', 'stopped'].includes(r.status)) out.push(finishedItem(r, ctx)); }
    return out;
  }
  const finishCopy = f => f.status === 'done' ? 'Finished: ' + short(f.title, 60) : f.status === 'partial' ? 'Partly finished (' + f.partsDone + ' of ' + f.partsTotal + ' parts): ' + short(f.title, 50) : f.status === 'stopped' ? 'Stopped: ' + short(f.title, 60) : "Didn't finish: " + short(f.title, 60);

  /* Updates for the progress view, from real events. Sorted by their own timestamp (not arrival order), de-duplicated by event id. */
  const EVENT_COPY = { reported: 'Bot reported', task_started: 'Claimed', completed: 'Finished', failed: 'Failed', blocked: 'Blocked', pending: 'Waiting for you', handoff: 'Handed off', assigned: 'Assigned', result_returned: 'Result returned', wake_sent: 'Wake sent', wake_failed: 'Wake failed', wake_deferred: 'Wake held back', wake_gave_up: 'Wake not delivered' };
  function recentUpdates(S, now, limit) {
    const seen = new Set(), tasks = idx(S.tasks || []), agents = idx(S.agents || []), out = [];
    for (const e of S.events || []) {
      if (!e || !e.id || seen.has(e.id) || !EVENT_COPY[e.type]) continue; seen.add(e.id);
      const at = ms(e.at); if (at == null || at > now + 60000) continue;
      const t = e.taskId && tasks.get(e.taskId); if (e.taskId && !t) continue; // an event about work no longer in state has nothing to point at
      out.push({ id: e.id, at, type: e.type, kind: EVENT_COPY[e.type], taskId: e.taskId || null, title: t ? t.title : null, bot: (agents.get(e.agentId) || {}).name || null, text: short(e.text, 140) });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit || 30);
  }

  /* The short line above a bot's head. Highest priority first: a failure (stays 10 min), waiting on you, running, queued, just finished.
     Never claims work for a bot with none, never turns a queued job into "working", and counts the rest instead of hiding them. */
  function botBubble(a, S, now) {
    const ctx = makeCtx(S, now), items = [];
    for (const t of S.tasks || []) {
      if (!t || t.assignee !== a.id || t.orchestration) continue;
      const ph = phaseOf(t), d = describe(t, ctx);
      if (ph === 'failed' || ph === 'stopped') { const f = ms(t.finishedAt); if (f != null && now - f <= FAILURE_STICKY_MS && ph === 'failed') items.push({ pri: 0, tone: 'bad', text: "Didn't finish: " + short(t.title, 38), task: t.id, at: f }); continue; }
      if (ph === 'done') { const f = ms(t.finishedAt); if (f != null && now - f <= RECENT_FINISH_MS) items.push({ pri: 4, tone: 'good', text: 'Finished: ' + short(t.title, 38), task: t.id, at: f }); continue; }
      if (ph === 'notrun' || ph === 'dismissed' || ph === 'unknown') continue;
      if (d.reason === 'approval') items.push({ pri: 1, tone: 'ask', text: 'Waiting for you', task: t.id, at: ms(t.progressAt) || 0 });
      else if (ph === 'running') { const rep = latestReport(t.id, ctx.events, now); const started = ms(t.startedAt), prog = ms(t.progressAt), working = rep || (prog != null && started != null && prog > started + 1000); items.push({ pri: 2, tone: 'work', text: (working ? 'Working on ' : 'Claimed: ') + short(t.title, 34), sub: rep ? '“' + short(rep.text, 48) + '” (bot-reported, ' + agoText(rep.at, now) + ')' : null, task: t.id, at: started || 0 }); }
      else if (ph === 'queued' && t.assignee) items.push({ pri: 3, tone: 'queue', text: (d.phase === 'waiting' ? "Can't start: " : 'Queued: ') + short(t.title, 34), task: t.id, at: ms(t.assignedAt) || ms(t.createdAt) || 0 });
      else if (ph === 'waiting') items.push({ pri: 3, tone: 'queue', text: 'Waiting: ' + short(t.title, 34), task: t.id, at: ms(t.createdAt) || 0 });
    }
    if (!items.length) return null;
    items.sort((x, y) => x.pri - y.pri || y.at - x.at);
    const top = items[0];
    return { text: top.text, tone: top.tone, task: top.task, sub: top.sub || null, more: items.length - 1 };
  }

  /* the bot's own latest progress report for a running task, only if recent. It is the bot's claim, shown in quotes, never as confirmed fact. */
  function latestReport(taskId, events, now) { let best = null; for (const e of events || []) { if (!e || e.type !== 'reported' || e.taskId !== taskId || !e.text) continue; const at = ms(e.at); if (at != null && now - at <= 120000 && at <= now + 60000 && (!best || at > best.at)) best = { at, text: String(e.text) }; } return best; }
  function makeCtx(S, now) { return { now, agents: idx(S.agents || []), byId: idx(S.tasks || []), requests: S.requests || [], events: S.events || [], killed: !!S.killed }; }

  /* is what is on screen current? `lastSyncMs` and `offline` come from the client's own sync bookkeeping */
  function freshness(now, lastSyncMs, offline) {
    if (offline) return { state: 'offline', ageMs: lastSyncMs ? now - lastSyncMs : null };
    if (!lastSyncMs) return { state: 'loading', ageMs: null };
    const age = now - lastSyncMs; return { state: age > STALE_AFTER_MS ? 'stale' : 'live', ageMs: age };
  }

  /* the owner's acknowledgement of finished work, as a pure reducer over a small record { since, seen: {id: finishedAtMs} } */
  function newAck(now) { return { v: 1, since: now, seen: {} }; }
  function unseen(finished, ack) { if (!ack) return []; return finished.filter(f => f.finishedAtMs > ack.since && !(ack.seen[f.id] >= f.finishedAtMs)); }
  function markSeen(ack, ids, finished) { const next = { ...ack, seen: { ...ack.seen } }; for (const f of finished) if (!ids || ids.includes(f.id)) next.seen[f.id] = f.finishedAtMs; const keys = Object.keys(next.seen); if (keys.length > 300) keys.sort((a, b) => next.seen[a] - next.seen[b]).slice(0, keys.length - 300).forEach(k => delete next.seen[k]); return next; }

  /* jobs finished since dayStartMs, counted as runs (a plan is one job) by their honest status: only a fully done run counts as finished; partial, failed and stopped count separately as didn't finish. */
  function finishCount(tasks, dayStartMs) {
    let done = 0, bad = 0;
    for (const r of buildRuns(tasks || [])) {
      if (!r || !r.task || r.task.synthetic) continue;
      const fin = r.finishedAtMs; if (fin == null || fin < dayStartMs) continue;
      if (r.status === 'done') done++; else if (r.status === 'partial' || r.status === 'failed' || r.status === 'stopped') bad++;
    }
    return { done, bad };
  }

  /* progress of the run one task belongs to: real steps done out of total, or null for a single-step job (no invented fractions) */
  function runProgress(tasks, taskId) {
    const by = idx(tasks), t = by.get(taskId); if (!t) return null;
    const root = partParent(t, by) || t, run = buildRuns(tasks).find(r => r.id === root.id); if (!run) return null;
    const seq = run.task.orchestration ? run.parts : (run.parts.length ? [run.task, ...run.parts] : []);
    const total = run.task.orchestration ? (run.task.partIds || []).length : seq.length;
    if (total < 2) return null;
    return { done: seq.filter(p => phaseOf(p) === 'done').length, total, status: run.status };
  }

  return { phaseOf, buildRuns, describe, activeItems, finishedItems, finishedItem, snapshot, transitions, finishCopy, recentUpdates, botBubble, freshness, newAck, unseen, markSeen, urlsIn, cadence, ago, agoText, short, partParent, makeCtx, finishCount, runProgress };
});
