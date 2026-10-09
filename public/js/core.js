/* Black Box vNext · core: API client, live state store, identity, presence and copy helpers.
   Every screen renders from BB.S (the server's /api/state plus /api/money and /api/cards). Nothing here invents data. */
(function () {
  'use strict';
  const BB = window.BB = window.BB || {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BB.$ = $; BB.$$ = $$; BB.esc = esc;
  BB.reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  BB.phone = () => innerWidth <= 760;
  const sleep = ms => new Promise(r => setTimeout(r, ms)); BB.sleep = sleep;

  /* ---------- API ---------- */
  BB.onAuth = null;
  BB.api = async function (path, method, body) {
    const r = await fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    if (r.status === 401 && !/^\/api\/(auth|public)/.test(path)) { if (BB.onAuth) BB.onAuth(); const e = new Error('auth'); e.auth = true; throw e; }
    let j = {}; try { j = await r.json(); } catch (e) { }
    if (!r.ok && !j.error) j.error = 'Request failed (' + r.status + ')';
    j._status = r.status; return j;
  };

  /* ---------- route hooks (the router lives in app.js) ---------- */
  BB._routeHooks = []; BB.onRoute = fn => BB._routeHooks.push(fn);

  /* ---------- state ---------- */
  const subs = new Set();
  BB.S = null; BB.money = { requests: [] }; BB.cards = { proposals: [], bots: [], ledger: [] };
  BB.on = fn => { subs.add(fn); return () => subs.delete(fn); };
  BB.emit = () => { subs.forEach(fn => { try { fn(BB.S); } catch (e) { console.error(e); } }); };
  let syncing = null, lastSide = 0;
  BB.sync = async function (full) {
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const side = full || Date.now() - lastSide > 9000;
        const [s, m, c] = await Promise.all([BB.api('/api/state'), side ? BB.api('/api/money').catch(() => null) : null, side ? BB.api('/api/cards').catch(() => null) : null]);
        if (s && !s.error) BB.S = s;
        if (m && !m.error) BB.money = m;
        if (c && !c.error) BB.cards = c;
        if (side) lastSide = Date.now();
        BB.lastSync = Date.now(); BB.offline = false;
        BB.emit();
      } catch (e) { if (!e.auth) { BB.offline = true; BB.emit(); } }
      finally { syncing = null; }
    })();
    return syncing;
  };
  let timer = null;
  BB.startPolling = () => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) BB.sync(); }, 4000); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && BB.S) BB.sync(true); });

  /* ---------- lookups ---------- */
  BB.agents = () => (BB.S && BB.S.agents) || [];
  BB.agent = id => BB.agents().find(a => a.id === id) || null;
  BB.tasks = () => (BB.S && BB.S.tasks) || [];
  BB.task = id => BB.tasks().find(t => t.id === id) || null;
  BB.pendingReqs = () => ((BB.S && BB.S.requests) || []).filter(q => q.status === 'pending');

  /* ---------- presence: derived from the server's grant state, never from a stale heartbeat ---------- */
  BB.linkWaiting = null;
  BB.presence = function (d) {
    if (!d) return 'prepared'; if (d.status === 'revoked') return 'revoked';
    const c = d.connection, seen = !!(d.lastSeen || d.state);
    if (c && c.status) {
      if (c.status === 'needs_reauth') return 'reconnect'; if (c.status === 'revoked') return 'revoked'; if (c.status === 'not_applicable') return 'connected';
      if (c.status === 'active') return seen ? 'connected' : 'waiting'; if (c.status === 'verification_pending') return 'waiting';
      if (c.status === 'awaiting_bot') return BB.linkWaiting === d.id ? 'waiting' : 'prepared';
    }
    return seen ? 'connected' : (BB.linkWaiting === d.id ? 'waiting' : 'prepared');
  };
  BB.isGhost = a => ['prepared', 'waiting'].includes(BB.presence(a));

  /* ---------- identity: six characters, curated non-vermilion palette; avatar colour matches the figure ---------- */
  const CAST = [
    { k: 'headset', c: '#2B2D31', av: '#121212', body: 'blazer', acc: '#9AA3AC' },
    { k: 'beanie', c: '#2F5DA8', av: '#2F55A4', body: 'hoodie', acc: '#D9A441' },
    { k: 'glasses', c: '#1F6F6B', av: '#1F6F5C', body: 'coat', acc: '#2B2D31' },
    { k: 'scarf', c: '#6B4C7A', av: '#5B4470', body: 'sweater', acc: '#D9A441' },
    { k: 'cap', c: '#B9862E', av: '#9A7029', body: 'tee', acc: '#2B2D31' },
    { k: 'bun', c: '#4C6A7F', av: '#46627A', body: 'dress', acc: '#E9C46A' }];
  BB.CAST = CAST;
  const PREF = { grok: 0, muse: 1, instinct: 2 };
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  BB.hash = hash;
  let castMap = {}, castSig = '';
  function assignCast() {
    const as = BB.agents(), sig = as.map(a => a.id).join(','); if (sig === castSig) return; castSig = sig; castMap = {}; const used = new Set();
    as.forEach(a => { let i = PREF[(a.providerId || '').toLowerCase()]; if (i == null) i = hash(a.id) % CAST.length; let n = 0; while (used.has(i) && n < CAST.length) { i = (i + 1) % CAST.length; n++; } used.add(i); castMap[a.id] = i; });
  }
  BB.cast = a => { assignCast(); const i = castMap[a.id] != null ? castMap[a.id] : hash(a.id || a.name) % CAST.length; return CAST[i]; };
  BB.initials = n => String(n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  BB.avColor = a => !a ? '#8C8C86' : BB.isGhost(a) ? '#8C8C86' : BB.cast(a).av;
  BB.av = (a, cls, extra) => `<span class="av ${cls || ''}" style="--av:${BB.avColor(a)}" aria-hidden="true">${esc(BB.initials(a ? a.name : '?'))}${extra || ''}</span>`;
  BB.duo = (list, size) => { const shown = list.slice(0, 3); return `<span class="duo">${shown.map(a => BB.av(a, size == null ? 's22' : size)).join('')}${list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : ''}</span>`; };

  /* ---------- time and money ---------- */
  const DAY = 864e5;
  BB.ago = iso => {
    if (!iso) return ''; const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 45) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min'; if (s < 86400) return Math.round(s / 3600) + ' h';
    const d = new Date(iso); if (Date.now() - d < 7 * DAY) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  BB.when = iso => {
    if (!iso) return ''; const d = new Date(iso), t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d >= today) return 'Today ' + t; if (d >= today - DAY) return 'Yesterday';
    if (Date.now() - d < 7 * DAY) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  BB.clock = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  BB.dateLong = iso => iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  BB.dur = ms => {
    if (!(ms >= 0)) return ''; const m = ms / 60000;
    if (m < 1) return Math.max(1, Math.round(ms / 1000)) + ' s'; if (m < 60) return Math.round(m) + ' min';
    const h = m / 60; if (h < 24) return (h < 10 ? Math.round(h * 10) / 10 : Math.round(h)) + ' h'; return Math.round(h / 24) + ' d';
  };
  BB.durWords = ms => { const s = BB.dur(ms); return s.replace(/ min$/, ' minutes').replace(/ h$/, s === '1 h' ? ' hour' : ' hours').replace(/ s$/, ' seconds').replace(/ d$/, ' days').replace(/^1 minutes$/, '1 minute').replace(/^1 days$/, '1 day'); };
  BB.usd = c => '$' + (Number(c || 0) / 100).toFixed(2);
  BB.usdShort = c => { const v = Number(c || 0) / 100; return '$' + (v % 1 ? v.toFixed(2) : v.toFixed(0)); };
  /* model costs are stored in USD (fractional cents allowed) and only exist when a provider or bot reported them */
  BB.modelCost = usd => usd == null ? null : usd < 0.01 && usd > 0 ? '<$0.01' : '$' + Number(usd).toFixed(2);
  BB.cents = c => c + '¢';

  /* ---------- plain-language copy ---------- */
  BB.ACTION_COPY = {
    'web.fetch': { verb: 'Fetch web pages', what: 'Reads public sites while researching', ask: 'Read a web page', doing: 'reading the web' },
    'notes.write': { verb: 'Write notes', what: 'Saves drafts to your workspace', ask: 'Save a note', doing: 'writing a note' },
    'notes.delete': { verb: 'Delete notes', what: 'Removes notes from your workspace', ask: 'Delete workspace notes', doing: 'tidying notes' },
    'work.handoff': { verb: 'Hand off work', what: 'Passes a job to another bot', ask: 'Hand off a job', doing: 'handing off work' },
    'work.assign': { verb: 'Assign jobs', what: 'Gives a job to another bot', ask: 'Assign a job', doing: 'assigning a job' },
    'work.enqueue': { verb: 'Queue new jobs', what: 'Adds unassigned jobs to your inbox', ask: 'Queue a job', doing: 'queueing a job' }
  };
  BB.MODE_COPY = { AUTO: 'Allowed', ASK: 'Ask first', NEVER: 'Never' };
  BB.reqTitle = q => {
    const c = BB.ACTION_COPY[q.action], p = q.params || {}, what = p.title || p.url || p.to || '';
    return (c ? c.ask : (q.label || q.action)) + (what ? ': “' + String(what).slice(0, 60) + '”' : '');
  };
  BB.reqLine = q => { const c = BB.ACTION_COPY[q.action]; return (c ? c.what.replace(/^./, m => m.toUpperCase()) : (q.label || '')) + ' · ' + q.costCents + '¢'; };

  /* status for a bot, <= 4 plain words (full detail stays in the inspector) */
  const STOP = /^(the|a|an)$/i, CUT = /^(for|to|on|with|about|from|of|in|at|into|via|using|by)$/i;
  BB.shortTitle = t => {
    const w = String(t || '').replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim().split(' ').filter(x => !STOP.test(x)); const out = []; let more = false;
    for (let i = 0; i < w.length; i++) { const x = w[i]; if (out.length >= 2 && CUT.test(x)) break; if (out.length === 4) { more = true; break; } out.push(x); }
    let s = out.join(' ').replace(/[.,:;·…-]+$/, ''); if (s.length > 32) { s = s.slice(0, 32).replace(/\s+\S*$/, ''); more = true; } if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1) + (more ? '…' : '');
  };
  BB.runningTask = a => BB.tasks().filter(t => t.assignee === a.id && t.status === 'running').sort((x, y) => String(y.startedAt || y.createdAt).localeCompare(String(x.startedAt || x.createdAt)))[0] || null;
  BB.botState = function (a) {
    /* one source of truth for the floor, the roster, the inspector header and the crew pill */
    const p = BB.presence(a);
    if (p === 'revoked') return { kind: 'off', text: 'Access revoked' };
    if (p === 'reconnect') return { kind: 'reconnect', text: 'Needs reconnecting' };
    if (p === 'prepared') return { kind: 'ghost', text: 'Not connected yet' };
    if (p === 'waiting') return { kind: 'ghost', text: 'Waiting to connect' };
    if (BB.S && BB.S.killed) return { kind: 'off', text: 'Paused (emergency stop)' };
    if (a.paused) return { kind: 'off', text: 'Paused' };
    if (BB.onYou().some(i => i.a && i.a.id === a.id && ['approval', 'spend', 'card'].includes(i.type))) return { kind: 'needs', text: 'Waiting for you' };
    const t = BB.runningTask(a); if (t) return { kind: 'run', text: t.title, task: t };
    const st = a.state, age = st ? (Date.now() - Date.parse(st.at)) / 1000 : 1e9;
    if (talking(a)) return { kind: 'talk', text: 'Talking with you' };
    if (st && age < 120 && st.kind === 'COMPLETED') return { kind: 'idle', text: 'Just finished' };
    return { kind: 'idle', text: 'Available' };
  };
  BB.statusLine = a => { const s = BB.botState(a); return s.kind === 'run' ? BB.sentenceCase(s.text) : s.text; };
  BB.sentenceCase = s => { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

  /* ---------- activity: shown only while it is happening; message > research > write ---------- */
  const RECENT = 75;
  const recent = a => ((BB.S && BB.S.events) || []).filter(e => e.agentId === a.id && (Date.now() - Date.parse(e.at)) / 1000 < RECENT);
  /* talking to the owner = an explicit INTERACTION report, or MCP presence (its contract is "actual recent interaction").
     The gateway presence call is the runner console's 30s heartbeat, so it never counts. */
  function talking(a) { return recent(a).some(e => e.kind === 'INTERACTION' && (e.type === 'reported' || (e.type === 'interaction' && e.source === 'mcp' && !/client connected/i.test(e.text)))); }
  BB.activity = function (a) {
    if (!BB.S || BB.isGhost(a) || BB.presence(a) !== 'connected' || a.status !== 'active' || a.paused || BB.S.killed) return null;
    if (['needs', 'off', 'reconnect'].includes(BB.botState(a).kind)) return null;
    const evs = recent(a);
    if (talking(a)) return 'message';
    if (evs.some(e => (e.type === 'attempt' && e.action === 'web.fetch') || (e.kind === 'TOOL_USED' && /fetch|search|research|read|brows|look/i.test(e.text)))) return 'research';
    if (evs.some(e => (e.type === 'attempt' && e.action === 'notes.write') || (e.kind === 'TOOL_USED' && /writ|draft|note|edit|calling/i.test(e.text)))) return 'write';
    return null;
  };
  BB.GLYPH = {
    message: '<svg viewBox="0 0 16 16" fill="none" stroke="#121212" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v4.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5v-2.5h0A1.5 1.5 0 0 1 3 9z"/></svg>',
    research: '<svg viewBox="0 0 16 16" fill="none" stroke="#121212" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="3.8"/><path d="M10 10l3 3"/></svg>',
    write: '<svg viewBox="0 0 16 16" fill="none" stroke="#121212" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M10.5 3.5l2 2L6 12l-2.8.8L4 10z"/></svg>',
    tick: '<svg viewBox="0 0 16 16" fill="none" stroke="#121212" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4"/></svg>'
  };
  BB.GLYPH_LABEL = { message: 'Messaging you', research: 'Researching', write: 'Writing' };
  BB.glyph = (a, delay) => { const k = BB.activity(a); return k ? `<i class="gl" style="--bd:${delay || 0}s" title="${BB.GLYPH_LABEL[k]}" aria-label="${BB.GLYPH_LABEL[k]}">${BB.GLYPH[k]}</i>` : ''; };

  /* ---------- shared jobs: one per root job with two or more different bots working on it ---------- */
  BB.sharedJobs = function () {
    const ts = BB.tasks(), byId = {}; ts.forEach(t => byId[t.id] = t);
    const live = t => t && ['running', 'queued'].includes(t.status);
    const root = t => { let r = t, n = 0; while (r.parentId && byId[r.parentId] && n++ < 8) r = byId[r.parentId]; return r; };
    const groups = {};
    ts.filter(t => t.status === 'running' && t.assignee).forEach(t => {
      const rt = root(t), g = groups[rt.id] || (groups[rt.id] = { id: rt.id, title: rt.title, bots: new Set(), tasks: [] });
      g.bots.add(t.assignee); g.tasks.push(t);
      /* a delegating bot is part of the job while its own part is still open */
      if (t.createdBy && t.createdBy !== 'owner' && t.createdBy !== t.assignee && BB.agent(t.createdBy)) {
        const parent = t.parentId && byId[t.parentId];
        if (!parent || live(parent)) g.bots.add(t.createdBy);
      }
      if (rt !== t && rt.assignee && live(rt)) g.bots.add(rt.assignee);
    });
    return Object.values(groups).map(g => ({ id: g.id, title: g.title, tasks: g.tasks, bots: [...g.bots].map(BB.agent).filter(a => a && !BB.isGhost(a)) })).filter(g => g.bots.length >= 2);
  };
  BB.sharedJobFor = t => BB.sharedJobs().find(g => g.tasks.some(x => x.id === t.id) || g.id === t.id) || null;

  /* ---------- "on you": approvals + reconnects + unassigned jobs ---------- */
  BB.onYou = function () {
    const items = [];
    BB.pendingReqs().forEach(q => { const a = BB.agent(q.agentId); items.push({ type: 'approval', id: 'req:' + q.id, at: q.createdAt, a, q }); });
    ((BB.money && BB.money.requests) || []).filter(q => q.status === 'pending_review' && Date.parse(q.expiresAt) > Date.now()).forEach(q => items.push({ type: 'spend', id: 'spend:' + q.id, at: q.createdAt, a: BB.agent(q.agentId), q }));
    ((BB.cards && BB.cards.proposals) || []).filter(q => q.status === 'pending' && Date.parse(q.expiresAt) > Date.now()).forEach(q => items.push({ type: 'card', id: 'card:' + q.id, at: q.createdAt, a: BB.agent(q.botId), q }));
    BB.agents().filter(a => BB.presence(a) === 'reconnect').forEach(a => items.push({ type: 'reconnect', id: 'rec:' + a.id, at: (a.connection && a.connection.failedAt) || a.lastSeen, a }));
    BB.tasks().filter(t => t.status === 'queued' && !t.assignee).forEach(t => items.push({ type: 'unassigned', id: 'task:' + t.id, at: t.createdAt, t }));
    const rank = { approval: 0, spend: 0, card: 0, reconnect: 1, unassigned: 2 };
    return items.sort((x, y) => rank[x.type] - rank[y.type] || String(y.at || '').localeCompare(String(x.at || '')));
  };

  /* ---------- decisions ---------- */
  BB.decide = async function (item, d) {
    let j;
    if (item.type === 'approval') j = await BB.api('/api/requests/' + item.q.id + '/' + (d === 'deny' ? 'deny' : 'approve'), 'POST');
    else if (item.type === 'spend') j = await BB.api('/api/money/' + item.q.id + '/' + (d === 'deny' ? 'deny' : 'approve'), 'POST', { detailsHash: item.q.detailsHash });
    else if (item.type === 'card') j = await BB.api('/api/cards/' + item.q.id + '/' + (d === 'deny' ? 'deny' : 'approve'), 'POST', { detailsHash: item.q.detailsHash });
    BB.toast(BB.outcome(item, j, d)); await BB.sync(true); return j;
  };
  BB.outcome = function (item, j, d) {
    if (!j || j.error) return 'Not confirmed: ' + ((j && j.error) || 'try again');
    if (item.type === 'approval') {
      const q = j.request, st = q && q.status;
      if (st === 'executed' && j.receipt && j.receipt.outcome === 'completed') return 'Approved. It ran and left a receipt.';
      if (st === 'denied') return 'Denied. Nothing ran.';
      if (st === 'blocked') return 'Blocked: ' + (q.reason || 'a permission or limit changed');
      if (st === 'failed') return 'Approved, but it failed: ' + (q.reason || (q.result && q.result.error) || 'see the job log');
      return 'Decision saved.';
    }
    if (item.type === 'spend') { const s = j.request && j.request.status; return s === 'denied' ? 'Spend denied.' : s === 'approved_not_connected' ? 'Spend approved. No payment rail is connected, so nothing was charged.' : 'Spend ' + String(s || 'updated').replace(/_/g, ' ') + '.'; }
    if (item.type === 'card') { const s = j.proposal && j.proposal.status; return s === 'simulated' ? 'Approved on the example card. No real money moved.' : s === 'denied' ? 'Card charge denied.' : s === 'limit_blocked' ? 'Over the daily limit. Not charged.' : 'Card request ' + String(s || 'updated').replace(/_/g, ' ') + '.'; }
    return 'Done.';
  };
  BB.assign = async function (taskId, botId) {
    const j = await BB.api('/api/tasks/' + taskId + '/assign', 'POST', { assignee: botId });
    BB.toast(j.error ? j.error : 'Assigned to ' + ((BB.agent(botId) || {}).name || 'the bot') + '.'); await BB.sync(true); return j;
  };
  BB.assignable = () => BB.agents().filter(a => a.status === 'active' && !a.paused && !BB.isGhost(a) && BB.presence(a) !== 'reconnect');

  /* ---------- toast ---------- */
  let tt = null;
  BB.toast = function (msg) { let t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3600); };

  /* ---------- icons ---------- */
  BB.ICON = {
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
    chev: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg>',
    floor: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l6 3.2-6 3.2-6-3.2z"/><path d="M2 8.4l6 3.2 6-3.2"/></svg>',
    stop: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5.2 1.5h5.6l3.7 3.7v5.6l-3.7 3.7H5.2l-3.7-3.7V5.2z"/><path d="M6.3 5.5v5M9.7 5.5v5" stroke-linecap="round"/></svg>',
    link: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6.6 9.4 9.4 6.6M4.9 8.2 3.6 9.5a2.3 2.3 0 0 0 3.2 3.2l1.3-1.3M11.1 7.8l1.3-1.3a2.3 2.3 0 0 0-3.2-3.2L7.9 4.6"/></svg>',
    grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 6.5h11M6.5 6.5v7"/></svg>',
    out: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3H3.5v10H6M10 5l3 3-3 3M13 8H6.5"/></svg>',
    room: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l6 3.2v5.6L8 14l-6-3.2V5.2z"/></svg>'
  };
})();
