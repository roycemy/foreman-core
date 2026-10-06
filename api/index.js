// Foreman core v9: real permission gateway + external-agent adapters + work bus. Agents hold only a Foreman key; every action goes through /api/gateway/act.
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();
// v11: every workspace gets its own key namespace. 'legacy' is the original v9/v10 data (no prefix). 'gl:' keys are global (users, sessions, key index).
const wsId = () => ((als.getStore() || {}).ws) || 'legacy';
const nsKey = k => { const w = wsId(); return (typeof k === 'string' && k.startsWith('fm:') && w !== 'legacy') ? 'w:' + w + ':' + k : k; };

// ---------- storage (Upstash/Vercel KV REST; memory fallback for local dev only) ----------
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = global.__mem || (global.__mem = { kv: new Map(), lists: new Map() });
async function r(cmd0) {
  const cmd = cmd0.map((x, i) => i === 0 ? x : nsKey(x));
  if (!URL_) return memCmd(cmd);
  const res = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await res.json();
  if (j.error) throw new Error('store: ' + j.error);
  return j.result;
}
function memCmd(c) {
  const [op, k, ...a] = c; const L = () => mem.lists.get(k) || [];
  switch (op.toUpperCase()) {
    case 'MGET': return c.slice(1).map(x => mem.kv.has(x) ? mem.kv.get(x) : null);
    case 'GET': return mem.kv.has(k) ? mem.kv.get(k) : null;
    case 'SET': mem.kv.set(k, a[0]); return 'OK';
    case 'INCRBY': { const v = (parseInt(mem.kv.get(k) || '0', 10)) + parseInt(a[0], 10); mem.kv.set(k, String(v)); return v; }
    case 'LPUSH': { const l = L(); l.unshift(a[0]); mem.lists.set(k, l); return l.length; }
    case 'LRANGE': return L().slice(parseInt(a[0], 10), parseInt(a[1], 10) + 1);
    case 'LTRIM': mem.lists.set(k, L().slice(parseInt(a[0], 10), parseInt(a[1], 10) + 1)); return 'OK';
    case 'SADD': { const s = new Set(mem.kv.get(k) || []); s.add(a[0]); mem.kv.set(k, [...s]); return 1; }
    case 'SREM': { const x=(mem.kv.get(k)||[]).filter(v=>v!==a[0]); mem.kv.set(k,x); return 1; }
    case 'SMEMBERS': return mem.kv.get(k) || [];
    case 'EXPIRE': return 1;
    case 'DEL': mem.kv.delete(k); mem.lists.delete(k); return 1;
  }
  throw new Error('memcmd ' + op);
}
const CACHES = new Map(); let SEEDED = false;
const bust = () => { CACHES.delete(wsId()); };
const getJ = async k => { const v = await r(['GET', k]); return v ? JSON.parse(v) : null; };
const setJ = (k, o) => r(['SET', k, JSON.stringify(o)]);
const now = () => new Date().toISOString();
const rid = p => p + '_' + crypto.randomBytes(5).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---------- action catalog: the real things an agent can do through Foreman ----------
const ACTIONS = {
  'web.fetch':   { label: 'Fetch a live web page', costCents: 1, risk: 'read' },
  'notes.write': { label: 'Write a note to the shared workspace', costCents: 2, risk: 'write' },
  'notes.delete':{ label: 'Delete a note from the shared workspace', costCents: 5, risk: 'destructive' },
  'work.handoff':{ label: 'Hand a task to another agent', costCents: 0, risk: 'write' },
};
const DEFAULT_PERMS = { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO' };

function blockedHost(u) {
  try {
    const x = new URL(u); if (x.protocol !== 'https:') return true;
    const h = x.hostname; if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith('.internal') || h.includes(':')) return true;
    return false;
  } catch { return true; }
}
async function execute(agent, action, params) {
  if (action === 'web.fetch') {
    if (blockedHost(params.url)) throw new Error('url not allowed');
    const res = await fetch(params.url, { headers: { 'User-Agent': 'foreman-gateway/8', Accept: 'application/json,text/*' }, signal: AbortSignal.timeout(7000) });
    const body = (await res.text()).slice(0, 4000);
    return { summary: `GET ${params.url} -> HTTP ${res.status}, ${body.length} bytes`, data: { status: res.status, body: body.slice(0, 1200) } };
  }
  if (action === 'notes.write') {
    const note = { id: rid('note'), by: agent.id, title: String(params.title || 'untitled').slice(0, 120), text: String(params.text || '').slice(0, 2000), at: now() };
    await r(['LPUSH', 'fm:notes', JSON.stringify(note)]); await r(['LTRIM', 'fm:notes', 0, 99]);
    return { summary: `Wrote note "${note.title}" (${note.id}) to the shared workspace`, data: { note_id: note.id } };
  }
  if (action === 'notes.delete') {
    await r(['DEL', 'fm:notes']);
    return { summary: 'Deleted all notes', data: {} };
  }
  if (action === 'work.handoff') {
    const t = await getJ('fm:task:' + params.task_id); if (!t || t.assignee !== agent.id) throw new Error('task not found or not yours');
    const to = (await listAgents()).find(x => x.id === params.to || x.name.toLowerCase() === String(params.to || '').toLowerCase());
    if (!to || to.id === agent.id) throw new Error('unknown target agent'); if (to.status !== 'active') throw new Error('target agent is not active');
    const child = await newTask({ title: String(params.title || t.title).slice(0, 120), brief: String(params.brief || '').slice(0, 1500), assignee: to.id, parentId: t.id, context: t.result || '', createdBy: agent.id });
    t.handedTo = to.id; t.childId = child.id; await setJ('fm:task:' + t.id, t);
    await event(agent.id, 'handoff', `Handed "${t.title}" to ${to.name}`, { kind: 'HANDOFF', toAgentId: to.id, taskId: t.id, childTaskId: child.id });
    return { summary: `Handed task "${t.title}" to ${to.name} (new task ${child.id}) with context from ${agent.name}`, data: { child_task_id: child.id, to: to.name } };
  }
  throw new Error('unknown action');
}

// ---------- work bus ----------
async function newTask(o) { const t = { id: rid('task'), title: String(o.title || 'Untitled').slice(0, 120), brief: String(o.brief || '').slice(0, 1500), assignee: o.assignee || null, status: 'queued', parentId: o.parentId || null, context: String(o.context || '').slice(0, 4000), createdBy: o.createdBy || 'owner', createdAt: now(), result: null };
  bust(); await setJ('fm:task:' + t.id, t); await r(['LPUSH', 'fm:tasklist', t.id]); await r(['LTRIM', 'fm:tasklist', 0, 59]);
  if (t.assignee) { const ag = await getJ('fm:agent:' + t.assignee); if (ag && ag.hosted && ag.status === 'active') await runHosted(ag, t); }
  return t; }
async function listTasks() { const ids = await r(['LRANGE', 'fm:tasklist', 0, 29]); if (!ids.length) return []; return (await r(['MGET', ...ids.map(i => 'fm:task:' + i)])).filter(Boolean).map(x => JSON.parse(x)); }
async function claimTask(agent) { const ts = (await listTasks()).filter(t => t.status === 'queued' && (t.assignee === agent.id || !t.assignee)).reverse(); const t = ts[0]; if (!t) return null;
  t.status = 'running'; t.assignee = agent.id; t.startedAt = now(); await setJ('fm:task:' + t.id, t); await event(agent.id, 'task_started', 'Started: ' + t.title, { kind: 'TASK_STARTED', taskId: t.id }); return t; }
async function completeTask(agent, id, body) { const t = await getJ('fm:task:' + id); if (!t || t.assignee !== agent.id) return { status: 404, body: { error: 'task not found' } };
  const failed = body.status === 'failed'; t.status = failed ? 'failed' : 'done'; t.result = String(body.result || '').slice(0, 4000); t.finishedAt = now(); await setJ('fm:task:' + id, t);
  await event(agent.id, failed ? 'failed' : 'completed', (failed ? 'Failed: ' : 'Finished: ') + t.title, { kind: failed ? 'FAILED' : 'COMPLETED', taskId: t.id }); return { status: 200, body: { task: t } }; }
async function reportEvent(agent, body, source) { const kind = normKind(body.kind || body.type || body.status || body.event); if (!kind) return { status: 400, body: { error: 'unrecognized event kind', allowed: KINDS } };
  if (!agent.lastSeen || Date.now() - Date.parse(agent.lastSeen) > 15000) { agent.lastSeen = now(); await setJ('fm:agent:' + agent.id, agent); }
  if (agent.status !== 'active') { await event(agent.id, 'blocked', 'Blocked event report: access revoked', { kind: 'BLOCKED' }); return { status: 403, body: { status: 'blocked', reason: 'Access revoked by owner' } }; }
  const text = String(body.text || body.message || body.summary || kind).slice(0, 200);
  await event(agent.id, 'reported', text, { kind, taskId: body.task_id || null, source: source || 'gateway' }); return { status: 200, body: { status: 'ok', kind } }; }
// ---------- providers: honest integration tiers ----------
const PROVIDERS = [
  { id: 'instinct', name: 'Instinct', tier: 'verified', how: 'HTTP gateway', note: 'Proven live: a real Instinct agent connected, worked through tasks, and was gated by AUTO, ASK and NEVER, then revoked.' },
  { id: 'custom', name: 'Custom agent', tier: 'verified', how: 'HTTP gateway', note: 'Any agent that can make HTTPS calls. Same adapter Instinct uses.' },
  { id: 'mcp', name: 'API / MCP agent', tier: 'verified', how: 'MCP server (JSON-RPC over HTTPS) or REST', note: 'Foreman exposes /api/mcp. MCP-capable agents get gated tools.' },
  { id: 'grok', name: 'Grok / Grok bots', tier: 'verified', how: 'xAI API worker (HTTP gateway)', note: 'Proven live: a real Grok worker (xAI API, grok-4.3) received a handed-off task through the work bus, did the work, and was gated by ASK on its write.' },
  { id: 'muse', name: 'Muse', tier: 'waiting', how: 'Waiting on provider access', note: 'No public agent API verified for Muse yet. It can join through the generic adapter once it can call out. Not faked.' },
];

// ---------- v11: secrets, owner accounts, hosted agents ----------
const ENCK = crypto.createHash('sha256').update('foreman-v11|' + (process.env.ENC_SECRET || TOK || 'dev')).digest();
const enc = t => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', ENCK, iv); const d = Buffer.concat([c.update(String(t), 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(b => b.toString('base64')).join('.'); };
const dec = t => { const [iv, tag, d] = String(t).split('.').map(x => Buffer.from(x, 'base64')); const c = crypto.createDecipheriv('aes-256-gcm', ENCK, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8'); };
const PRESETS = {
  cautious: { 'web.fetch': 'ASK', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'ASK' },
  balanced: { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO' },
  trusted:  { 'web.fetch': 'AUTO', 'notes.write': 'AUTO', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO' },
};
async function xaiChat(key, model, prompt, maxTokens) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ model, max_tokens: maxTokens || 600, messages: [{ role: 'system', content: 'You are an AI employee working inside Foreman. Use only the context given. Be concise and factual. If context is missing, say so.' }, { role: 'user', content: prompt }] }) });
  let j = {}; try { j = await res.json(); } catch {}
  if (!res.ok) { const e = new Error(res.status === 401 || res.status === 403 ? 'xAI rejected that key' : (res.status === 402 || res.status === 429) ? 'xAI says this key has no credits or is rate limited' : res.status === 400 ? 'xAI did not recognise that key' : 'xAI error ' + res.status); e.http = res.status; throw e; }
  return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
}
// Hosted agents run inline, the moment work is assigned: no polling, no cron, no tab.
async function runHosted(agent, t) {
  const live = await getJ('fm:agent:' + agent.id) || agent;
  t.status = 'running'; t.startedAt = now(); await setJ('fm:task:' + t.id, t);
  await event(agent.id, 'task_started', 'Started: ' + t.title, { kind: 'TASK_STARTED', taskId: t.id });
  const stop = live.status !== 'active' ? 'Access revoked by owner' : (await r(['GET', 'fm:kill'])) ? 'Owner kill switch is on' : null;
  if (stop) { t.status = 'failed'; t.result = 'Not run: ' + stop; t.finishedAt = now(); await setJ('fm:task:' + t.id, t); await event(agent.id, 'blocked', 'Blocked task: ' + stop, { kind: 'BLOCKED', taskId: t.id }); return; }
  try {
    const key = dec(await r(['GET', 'fm:secret:' + agent.id])); const model = live.model || 'grok-4.3';
    await event(agent.id, 'tool_used', 'Calling Grok (' + model + ')', { kind: 'TOOL_USED', taskId: t.id });
    const out = await xaiChat(key, model, 'Task: ' + t.title + '\nBrief: ' + t.brief + (t.context ? '\nContext from the previous agent (via Foreman):\n' + t.context : ''));
    t.status = 'done'; t.result = out.slice(0, 4000); t.finishedAt = now(); await setJ('fm:task:' + t.id, t);
    await event(agent.id, 'completed', 'Finished: ' + t.title, { kind: 'COMPLETED', taskId: t.id });
    try { await gatewayAct(live, { action: 'notes.write', params: { title: ('Result: ' + t.title).slice(0, 80), text: out.slice(0, 1500) } }); } catch (e) {}
  } catch (e) {
    await mark('first_task_failed', { reason: /recognise/.test(e.message) ? 'bad_key_format' : /rejected/.test(e.message) ? 'xai_rejected' : /credit|rate/.test(e.message) ? 'xai_credits' : 'run_error' }); t.status = 'failed'; t.result = String(e.message).slice(0, 300); t.finishedAt = now(); await setJ('fm:task:' + t.id, t);
    await event(agent.id, 'failed', 'Failed: ' + t.title + ' (' + t.result + ')', { kind: 'FAILED', taskId: t.id });
  }
}
// owner accounts: email + password (scrypt), session cookie, one workspace per account
const COOKIE = 'fm_sess';
const LEGACY_CLAIM_HASH = '939eed690d2af252b4940442b755cb84ba4c27be515142877a44b1a32424454d';
const cookieOf = req => { const m = String(req.headers.cookie || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)')); return m ? m[1] : null; };
async function getSession(req) { const t = cookieOf(req); if (!t) return null; const v = await r(['GET', 'gl:sess:' + sha(t)]); return v ? JSON.parse(v) : null; }
const setCookie = (res, v, maxAge) => res.setHeader('Set-Cookie', `${COOKIE}=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
async function startSession(res, user) { const t = crypto.randomBytes(32).toString('hex'); await r(['SET', 'gl:sess:' + sha(t), JSON.stringify({ uid: user.id, email: user.email, ws: user.ws }), 'EX', 2592000]); setCookie(res, t, 2592000); }
// funnel instrumentation: first time each workspace reaches a step, record it once
const STEPS = ['signup', 'connect_started', 'connected', 'first_task_started', 'approval_shown', 'approval_completed', 'first_receipt'];
async function track(step, extra, ws) { try { ws = ws || wsId(); if (!STEPS.includes(step)) return; const first = await r(['SET', 'gl:fn:' + ws + ':' + step, '1', 'NX']); if (!first) return; await r(['LPUSH', 'gl:funnel', JSON.stringify({ ws, step, at: now(), ...(extra || {}) })]); await r(['LTRIM', 'gl:funnel', 0, 4999]); } catch (e) {} }
// extra per-session events: failures and visits. Never stores keys or message text, only short reason codes.
async function mark(kind, extra, ws) { try { ws = ws || wsId(); if (kind === 'visit' && !(await r(['SET', 'gl:vis:' + ws, '1', 'NX', 'EX', 1800]))) return; await r(['LPUSH', 'gl:funnel', JSON.stringify({ ws, k: kind, at: now(), ...(extra || {}) })]); await r(['LTRIM', 'gl:funnel', 0, 4999]); } catch (e) {} }
const SLOW = { connect_started: 120, connected: 120, first_task_started: 45, approval_shown: 90, approval_completed: 180, first_receipt: 45 }; // seconds allowed since the previous step
async function funnel(only) {
  const rows = ((await r(['LRANGE', 'gl:funnel', 0, 4999])) || []).map(x => JSON.parse(x)).filter(x => x.ws !== 'legacy').reverse(); const by = {};
  rows.forEach(x => { const w = (by[x.ws] = by[x.ws] || { steps: {}, ev: [], visits: [] }); if (x.provider) w.provider = x.provider; if (x.step) w.steps[x.step] = x.at; else if (x.k === 'visit') w.visits.push(x.at); else if (x.k) w.ev.push({ kind: x.k, reason: x.reason || null, at: x.at }); });
  const ids = Object.keys(by).sort((a, b) => (by[a].steps.signup || '') < (by[b].steps.signup || '') ? -1 : 1); const sec = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
  const sessions = ids.map((w, i) => { const d = by[w], reached = STEPS.filter(st => d.steps[st]); const steps = {}; let prev = null; const slow = [];
    STEPS.forEach(st => { if (!d.steps[st]) return; const gap = prev ? sec(d.steps[prev], d.steps[st]) : null; steps[st] = { at: d.steps[st], secFromPrevious: gap }; if (gap != null && SLOW[st] && gap > SLOW[st]) slow.push({ step: st, seconds: gap, limit: SLOW[st] }); prev = st; });
    const last = reached[reached.length - 1] || null, next = last ? STEPS[STEPS.indexOf(last) + 1] || null : 'signup'; const rcpt = d.steps.first_receipt;
    const returned = rcpt ? d.visits.filter(v => sec(rcpt, v) > 300).length > 0 : false; const idle = last ? sec(d.steps[last], now()) : null;
    return { id: 'session#' + (ids.length - i), workspace: w, provider: d.provider || null, signupAt: d.steps.signup || null, steps, stoppedAfter: next ? last : null, stuckAt: next, secondsSinceLastStep: next ? idle : null, slowSteps: slow, failures: d.ev.filter(e => /fail/.test(e.kind)), reachedFirstReceipt: !!rcpt, secondsSignupToReceipt: rcpt && d.steps.signup ? sec(d.steps.signup, rcpt) : null, returnedAfterReceipt: returned, visits: d.visits.length }; }).reverse();
  const list = only ? sessions.filter(x => x.workspace === only) : sessions;
  const counts = STEPS.map(st => ({ step: st, sessions: list.filter(x => x.steps[st]).length })); const steps = counts.map((c, i) => ({ ...c, pctOfPrevious: i === 0 ? null : (counts[i - 1].sessions ? Math.round(100 * c.sessions / counts[i - 1].sessions) : null) }));
  const t = list.map(x => x.secondsSignupToReceipt).filter(x => x != null).sort((a, b) => a - b); const fails = {}; list.forEach(x => x.failures.forEach(f => { const k = f.kind + (f.reason ? ':' + f.reason : ''); fails[k] = (fails[k] || 0) + 1 }));
  const safe = list.map(x => { const y = { ...x }; if (only) y.workspace = undefined; else delete y.workspace; return y; });
  return { summary: { sessions: list.length, reachedFirstReceipt: list.filter(x => x.reachedFirstReceipt).length, returnedAfterReceipt: list.filter(x => x.returnedAfterReceipt).length, medianSecondsSignupToReceipt: t.length ? t[Math.floor(t.length / 2)] : null, failures: fails, slowLimitsSeconds: SLOW }, steps, sessions: safe };
}
function funnelHtml(f) { const e = x => String(x == null ? '' : x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); const S = f.summary;
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Foreman test sessions</title><body style="font:14px system-ui;margin:24px;color:#0f172a"><h2>Foreman test sessions</h2><p>${S.sessions} sessions - ${S.reachedFirstReceipt} reached first receipt - ${S.returnedAfterReceipt} returned after - median signup to receipt: ${S.medianSecondsSignupToReceipt == null ? 'n/a' : S.medianSecondsSignupToReceipt + 's'}</p><table cellpadding=6 style="border-collapse:collapse"><tr style="background:#f1f5f9"><th align=left>Step<th>Sessions<th>% of previous</tr>${f.steps.map(x => `<tr><td>${e(x.step)}<td align=center>${x.sessions}<td align=center>${x.pctOfPrevious == null ? '' : x.pctOfPrevious + '%'}</tr>`).join('')}</table><p>Failures: ${e(JSON.stringify(S.failures))}</p><h3>Each session</h3><table cellpadding=6 border=1 style="border-collapse:collapse;border-color:#e2e8f0"><tr style="background:#f1f5f9"><th>Session<th>Provider<th>Signed up<th>Stopped / stuck at<th>Idle since last step<th>Slow steps<th>Failures<th>Receipt<th>Returned</tr>${f.sessions.map(x => `<tr><td>${e(x.id)}<td>${e(x.provider || '-')}<td>${e(x.signupAt)}<td>${e(x.stuckAt || 'finished')}<td>${x.stuckAt ? e(x.secondsSinceLastStep) + 's' : '-'}<td>${e(x.slowSteps.map(y => y.step + ' ' + y.seconds + 's').join(', ') || '-')}<td>${e(x.failures.map(y => y.kind + (y.reason ? ':' + y.reason : '')).join(', ') || '-')}<td>${x.reachedFirstReceipt ? 'yes' + (x.secondsSignupToReceipt != null ? ' (' + x.secondsSignupToReceipt + 's)' : '') : 'no'}<td>${x.returnedAfterReceipt ? 'yes' : 'no'}</tr>`).join('')}</table></body>`; }
async function handleAuth(req, res, path, body) {
  if (path === '/me') { const s = await getSession(req); if (!s) return res.status(401).json({ error: 'auth' }); if (s.ws !== 'legacy') await mark('visit', null, s.ws); return res.json({ email: s.email, legacy: s.ws === 'legacy' }); }
  if (path === '/auth/logout') { const t = cookieOf(req); if (t) await r(['DEL', 'gl:sess:' + sha(t)]); setCookie(res, '', 0); return res.json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });
  const email = String(body.email || '').trim().toLowerCase(), pw = String(body.password || '');
  if (!/^[^@\s]{1,64}@[^@\s]{1,120}\.[^@\s]{2,}$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const rl = await r(['INCRBY', 'gl:rl:' + sha(email), 1]); await r(['EXPIRE', 'gl:rl:' + sha(email), 900]); if (rl > 12) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  if (path === '/auth/signup') {
    if (pw.length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters' });
    if (await r(['GET', 'gl:user:' + sha(email)])) return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
    let ws = 'ws' + crypto.randomBytes(6).toString('hex');
    if (body.claim) { if (sha(String(body.claim).trim()) !== LEGACY_CLAIM_HASH || await r(['GET', 'gl:legacy-owner'])) return res.status(400).json({ error: 'That claim code is not valid or was already used' }); ws = 'legacy'; await r(['SET', 'gl:legacy-owner', email]); }
    const salt = crypto.randomBytes(16).toString('hex'); const user = { id: rid('user'), email, salt, hash: crypto.scryptSync(pw, salt, 32).toString('hex'), ws, createdAt: now() };
    await r(['SET', 'gl:user:' + sha(email), JSON.stringify(user)]); await track('signup', null, ws); await startSession(res, user); return res.json({ ok: true, email, legacy: ws === 'legacy' });
  }
  if (path === '/auth/login') {
    const raw = await r(['GET', 'gl:user:' + sha(email)]); const u = raw && JSON.parse(raw);
    const okp = u && crypto.timingSafeEqual(Buffer.from(crypto.scryptSync(pw, u.salt, 32).toString('hex')), Buffer.from(u.hash));
    if (!okp) return res.status(401).json({ error: 'Email or password is wrong' });
    await startSession(res, u); return res.json({ ok: true, email, legacy: u.ws === 'legacy' });
  }
  return res.status(404).json({ error: 'not found' });
}

// ---------- core ----------
async function listAgents() { const ids = await r(['SMEMBERS', 'fm:agents']); if (!ids.length) return []; const vs = await r(['MGET', ...ids.map(i => 'fm:agent:' + i)]); return vs.filter(Boolean).map(v => JSON.parse(v)).sort((x, y) => x.createdAt < y.createdAt ? -1 : 1); }
// Universal Foreman event model. Every provider's activity is normalized into one of these kinds.
const KINDS = ['TASK_STARTED','TOOL_USED','ACTION_REQUESTED','WAITING','HANDOFF','COMPLETED','FAILED','NEEDS_APPROVAL','BLOCKED'];
const KIND_OF = { attempt:'ACTION_REQUESTED', pending:'NEEDS_APPROVAL', completed:'COMPLETED', failed:'FAILED', blocked:'BLOCKED', revoked:'BLOCKED', denied:'BLOCKED', handoff:'HANDOFF' };
// adapter-level normalizer: maps a provider's own vocabulary onto KINDS
function normKind(x) { const k = String(x || '').toUpperCase().replace(/[\s-]+/g, '_'); if (KINDS.includes(k)) return k;
  const m = [[/START|BEGIN|RUNNING|PICKED|CLAIM/, 'TASK_STARTED'],[/TOOL|CALL|INVOK/, 'TOOL_USED'],[/REQUEST|ATTEMPT|ACTION/, 'ACTION_REQUESTED'],[/WAIT|IDLE|PEND|BLOCKED_ON|QUEUE/, 'WAITING'],[/HAND|DELEGAT|TRANSFER/, 'HANDOFF'],[/DONE|COMPLET|FINISH|SUCCE/, 'COMPLETED'],[/FAIL|ERR/, 'FAILED'],[/APPROV/, 'NEEDS_APPROVAL'],[/BLOCK|DENIED|REFUS/, 'BLOCKED']];
  for (const [re, v] of m) if (re.test(k)) return v; return null; }
async function event(agentId, type, text, extra) { bust(); const e = { id: rid('ev'), at: now(), agentId, type, kind: (extra && extra.kind) || KIND_OF[type] || null, text, ...extra };
  if (agentId && e.kind) await setJ('fm:st:' + agentId, { kind: e.kind, text, at: e.at, taskId: e.taskId || null, toAgentId: e.toAgentId || null, eventId: e.id }); await r(['LPUSH', 'fm:events', JSON.stringify(e)]); await r(['LTRIM', 'fm:events', 0, 299]); return e; }
async function spentToday(agentId) { return parseInt((await r(['GET', `fm:spend:${agentId}:${now().slice(0, 10)}`])) || '0', 10); }
async function receipt(agent, action, params, outcome, cost, summary, reqId, extra) { bust(); await track('first_receipt');
  const prev = (await r(['GET', 'fm:lasthash'])) || 'genesis';
  const rec = { id: rid('rcpt'), at: now(), agentId: agent.id, agentName: agent.name, action, params: redact(params), outcome, costCents: cost, summary, requestId: reqId || null, ...extra, prevHash: prev };
  rec.hash = sha(prev + JSON.stringify(rec));
  await r(['SET', 'fm:lasthash', rec.hash]); await r(['LPUSH', 'fm:receipts', JSON.stringify(rec)]); await r(['LTRIM', 'fm:receipts', 0, 299]);
  return rec;
}
const redact = p => { const o = {}; for (const k of Object.keys(p || {})) o[k] = String(p[k]).slice(0, 200); return o; };

// Policy check, shared by first attempt and by approval time. Returns null if allowed, else {code, reason}.
async function policy(agent, action, mode) {
  const a = ACTIONS[action]; if (!a) return { code: 'unknown_action', reason: 'Action is not in the catalog' };
  if (agent.status !== 'active') return { code: 'revoked', reason: agent.status === 'revoked' ? 'Access revoked by owner' : 'Agent is not active' };
  if (await r(['GET', 'fm:kill'])) return { code: 'killed', reason: 'Owner kill switch is on' };
  if (mode === 'NEVER') return { code: 'never', reason: 'Permission is NEVER for this action' };
  const lim = agent.limits || {};
  if (lim.perActionCents != null && a.costCents > lim.perActionCents) return { code: 'limit_action', reason: `Cost ${a.costCents}c exceeds per-action limit ${lim.perActionCents}c` };
  if (lim.dailyCents != null) { const s = await spentToday(agent.id); if (s + a.costCents > lim.dailyCents) return { code: 'limit_daily', reason: `Daily budget ${lim.dailyCents}c would be exceeded (spent ${s}c)` }; }
  return null;
}

async function runAndReceipt(agent, action, params, reqId, approvedBy) {
  const a = ACTIONS[action];
  try {
    const out = await execute(agent, action, params);
    await r(['INCRBY', `fm:spend:${agent.id}:${now().slice(0, 10)}`, a.costCents]);
    const rec = await receipt(agent, action, params, 'completed', a.costCents, out.summary, reqId, { approvedBy: approvedBy || 'policy:AUTO' });
    await event(agent.id, 'completed', out.summary, { receiptId: rec.id });
    return { rec, out };
  } catch (e) {
    const rec = await receipt(agent, action, params, 'failed', 0, 'Execution failed: ' + e.message, reqId, { approvedBy: approvedBy || 'policy:AUTO' });
    await event(agent.id, 'failed', 'Execution failed: ' + e.message, { receiptId: rec.id });
    return { rec, out: null, error: e.message };
  }
}

async function resolveAgent(req) {
  const key = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim(); if (!key) return null;
  const w = await r(['GET', 'gl:key:' + sha(key)]);
  if (w) { const agent = await als.run({ ws: w }, () => authAgent(req)); return agent ? { ws: w, agent } : null; }
  const agent = await als.run({ ws: 'legacy' }, () => authAgent(req)); return agent ? { ws: 'legacy', agent } : null;
}
async function authAgent(req) {
  const h = req.headers['authorization'] || ''; const key = h.replace(/^Bearer\s+/i, '').trim(); if (!key) return null;
  const id = await r(['GET', 'fm:key:' + sha(key)]); if (!id) return null;
  return getJ('fm:agent:' + id);
}

async function gatewayAct(agent, body) {
  const action = body.action, params = body.params || {};
  if (!agent.lastSeen || Date.now() - Date.parse(agent.lastSeen) > 20000) { agent.lastSeen = now(); await setJ('fm:agent:' + agent.id, agent); }
  const mode = (agent.permissions || {})[action] || DEFAULT_PERMS[action] || 'NEVER';
  await event(agent.id, 'attempt', `Attempted ${action} (${mode})`, { action });
  const blocked = await policy(agent, action, mode);
  if (blocked) {
    const rec = await receipt(agent, action, params, 'blocked', 0, `BLOCKED: ${blocked.reason}`, null, { code: blocked.code });
    await event(agent.id, 'blocked', `Blocked ${action}: ${blocked.reason}`, { receiptId: rec.id, code: blocked.code });
    return { status: 403, body: { status: 'blocked', code: blocked.code, reason: blocked.reason, receipt_id: rec.id } };
  }
  if (mode === 'ASK') {
    const q = { id: rid('req'), agentId: agent.id, agentName: agent.name, action, params: redact(params), rawParams: params, label: ACTIONS[action].label, costCents: ACTIONS[action].costCents, status: 'pending', createdAt: now() };
    bust(); await setJ('fm:req:' + q.id, q); await r(['SADD', 'fm:reqs', q.id]);
    await event(agent.id, 'pending', `Waiting for owner approval: ${action}`, { requestId: q.id });
    return { status: 202, body: { status: 'pending', request_id: q.id, message: 'Action is paused until the owner approves or denies it.' } };
  }
  const { rec, out, error } = await runAndReceipt(agent, action, params, null, null);
  if (error) return { status: 502, body: { status: 'failed', error, receipt_id: rec.id } };
  return { status: 200, body: { status: 'completed', result: out.data, receipt_id: rec.id } };
}

async function decide(reqId, decision) {
  const q = await getJ('fm:req:' + reqId); if (!q) return { status: 404, body: { error: 'not found' } };
  if (q.status !== 'pending') return { status: 409, body: { error: 'already ' + q.status, request: pub(q) } };
  const agent = await getJ('fm:agent:' + q.agentId);
  if (decision === 'deny') {
    q.status = 'denied'; q.decidedAt = now(); await finishReq(q);
    const rec = await receipt(agent, q.action, q.params, 'denied', 0, `Owner denied ${q.action}`, q.id, { approvedBy: 'owner:deny' });
    await event(agent.id, 'denied', `Owner denied ${q.action}`, { requestId: q.id, receiptId: rec.id });
    return { status: 200, body: { request: pub(q) } };
  }
  // approval: re-check policy NOW (agent may have been revoked / budget changed while paused). Mode treated as AUTO for this one action.
  const blocked = await policy(agent, q.action, 'AUTO');
  if (blocked) {
    q.status = 'blocked'; q.decidedAt = now(); q.reason = blocked.reason; await finishReq(q);
    const rec = await receipt(agent, q.action, q.params, 'blocked', 0, `BLOCKED at approval: ${blocked.reason}`, q.id, { code: blocked.code });
    await event(agent.id, 'blocked', `Blocked at approval: ${blocked.reason}`, { requestId: q.id, receiptId: rec.id });
    return { status: 200, body: { request: pub(q) } };
  }
  q.status = 'approved'; q.decidedAt = now(); bust(); await setJ('fm:req:' + q.id, q);
  const { rec, out, error } = await runAndReceipt(agent, q.action, q.rawParams, q.id, 'owner:approve');
  q.status = error ? 'failed' : 'executed'; q.receiptId = rec.id; q.result = out ? out.data : { error }; await finishReq(q);
  return { status: 200, body: { request: pub(q), receipt: rec } };
}
const pub = q => { const { rawParams, ...rest } = q; return rest; };

async function fullState() {
  { const c = CACHES.get(wsId()); if (c && Date.now() - c.t < 1500) return c.v; }
  const agents = await listAgents();
  const ids = await r(['SMEMBERS', 'fm:reqs']);
  const parse = a => (a || []).filter(Boolean).map(x => JSON.parse(x));
  const pend = ids.length ? parse(await r(['MGET', ...ids.map(i => 'fm:req:' + i)])).map(pub) : [];
  const hist = parse(await r(['LRANGE', 'fm:reqhist', 0, 14]));
  const day = now().slice(0, 10);
  const sp = agents.length ? await r(['MGET', ...agents.map(a => `fm:spend:${a.id}:${day}`)]) : [];
  const sts = agents.length ? await r(['MGET', ...agents.map(a => 'fm:st:' + a.id)]) : []; const tasks = await listTasks();
  const agentsPub = agents.map((a, i) => ({ ...a, spentTodayCents: parseInt(sp[i] || '0', 10), state: sts[i] ? JSON.parse(sts[i]) : null })).filter(a => !a.harness);
  const [kill, receipts, events, notes] = await Promise.all([r(['GET', 'fm:kill']), r(['LRANGE', 'fm:receipts', 0, 59]), r(['LRANGE', 'fm:events', 0, 79]), r(['LRANGE', 'fm:notes', 0, 9])]);
  const v = { now: now(), killed: !!kill, actions: ACTIONS, agents: agentsPub, requests: [...pend, ...hist].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1), receipts: parse(receipts), events: parse(events), notes: parse(notes), tasks, kinds: KINDS, providers: PROVIDERS };
  CACHES.set(wsId(), { t: Date.now(), v }); return v;
}
async function finishReq(q) { bust(); await setJ('fm:req:' + q.id, q); await r(['SREM', 'fm:reqs', q.id]); await r(['LPUSH', 'fm:reqhist', JSON.stringify(pub(q))]); await r(['LTRIM', 'fm:reqhist', 0, 29]); }
async function createAgent(name, role, provider, harness, opts) { opts = opts || {};
  const id = rid('agent'); const key = 'fmk_' + crypto.randomBytes(20).toString('hex');
  const agent = { id, name: String(name || 'Agent').slice(0, 40), role: String(role || '').slice(0, 60), provider: (PROVIDERS.find(p => p.id === provider) || { name: 'Custom agent' }).name, providerId: provider || 'custom', harness: !!harness, status: 'active', permissions: { ...(PRESETS[opts.preset] || DEFAULT_PERMS) }, hosted: !!opts.hosted, model: opts.model || null, limits: { perActionCents: 10, dailyCents: 50 }, createdAt: now(), lastSeen: null, keyHint: key.slice(0, 8) + '...' + key.slice(-4) };
  bust(); await setJ('fm:agent:' + id, agent); await r(['SET', 'fm:key:' + sha(key), id]); await r(['SET', 'gl:key:' + sha(key), wsId()]); await r(['SADD', 'fm:agents', id]);
  await event(id, 'connected', `${agent.name} connected to Foreman`);
  return { agent, key };
}

// ---------- the live demo agent ("Scout"): a real client of the gateway. Each tick it makes real calls over HTTP with its own key. ----------
const SCOUT_TASKS = [
  { action: 'web.fetch', params: () => ({ url: 'https://api.github.com/repos/roycemy/blackbox-mvp' }), note: 'Check the repo status' },
  { action: 'notes.write', params: s => ({ title: 'Scout report #' + (s.n + 1), text: 'Scout checked github.com/roycemy/blackbox-mvp at ' + now() + '. Foreman gated this write.' }), note: 'File a research note' },
  { action: 'notes.delete', params: () => ({}), note: 'Tidy up old notes' },
];
async function scoutTick(origin) {
  let st = (await getJ('fm:scout:state')) || { n: 0, pending: null, log: [] };
  const key = await r(['GET', 'fm:scout:key']); if (!key) return { error: 'scout not seeded' };
  const call = async (path, method, body) => { const res = await fetch(origin + path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { http: res.status, json: await res.json() }; };
  let step;
  if (st.pending) {
    const g = await call('/api/gateway/requests/' + st.pending, 'GET');
    step = { kind: 'poll', request: st.pending, status: g.json.status };
    if (g.json.status !== 'pending') { st.pending = null; st.n++; }
  } else {
    const t = SCOUT_TASKS[st.n % SCOUT_TASKS.length];
    const g = await call('/api/gateway/act', 'POST', { action: t.action, params: t.params(st), note: t.note });
    step = { kind: 'act', action: t.action, http: g.http, status: g.json.status, code: g.json.code };
    if (g.json.status === 'pending') st.pending = g.json.request_id; else st.n++;
  }
  st.log = [{ at: now(), ...step }, ...st.log].slice(0, 20); await setJ('fm:scout:state', st);
  return { step, scout: { n: st.n, pending: st.pending } };
}
async function seed() {
  if (SEEDED) return; if (await r(['GET', 'fm:seeded'])) { SEEDED = true; const sid = await r(['GET', 'fm:scout:id']); const sa = sid && await getJ('fm:agent:' + sid); if (sa && !sa.harness) { sa.harness = true; await setJ('fm:agent:' + sid, sa); } return; } SEEDED = true;
  const { agent, key } = await createAgent('Scout', 'Research agent (live)', 'custom', true);
  agent.provider = 'Foreman live agent'; agent.live = true; await setJ('fm:agent:' + agent.id, agent);
  await r(['SET', 'fm:scout:key', key]); await r(['SET', 'fm:scout:id', agent.id]); await r(['SET', 'fm:seeded', '1']);
}

// ---------- MCP adapter (JSON-RPC 2.0 over HTTPS) ----------
const MCP_TOOLS = [
  { name: 'foreman_web_fetch', description: 'Fetch a live https web page through Foreman (policy-gated).', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, action: 'web.fetch' },
  { name: 'foreman_notes_write', description: 'Write a note to the shared workspace through Foreman (policy-gated; may pause for owner approval).', inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] }, action: 'notes.write' },
  { name: 'foreman_notes_delete', description: 'Delete workspace notes through Foreman (policy-gated).', inputSchema: { type: 'object', properties: {} }, action: 'notes.delete' },
  { name: 'foreman_handoff', description: 'Hand a task to another Foreman agent.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, to: { type: 'string' }, brief: { type: 'string' } }, required: ['task_id', 'to'] }, action: 'work.handoff' },
  { name: 'foreman_report', description: 'Report your activity. kind is one of ' + KINDS.join(', '), inputSchema: { type: 'object', properties: { kind: { type: 'string' }, text: { type: 'string' } }, required: ['kind'] } },
  { name: 'foreman_next_task', description: 'Claim the next task from the Foreman work bus.', inputSchema: { type: 'object', properties: {} } },
  { name: 'foreman_complete_task', description: 'Finish a task and store its result.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, result: { type: 'string' } }, required: ['task_id', 'result'] } },
  { name: 'foreman_check_request', description: 'Check a paused (ASK) request. Once approved Foreman has already run it; the result is included.', inputSchema: { type: 'object', properties: { request_id: { type: 'string' } }, required: ['request_id'] } },
];
async function mcpCall(agent, name, args) {
  const t = MCP_TOOLS.find(x => x.name === name); if (!t) return { isError: true, content: [{ type: 'text', text: 'unknown tool' }] };
  let out;
  if (t.action) { const g = await gatewayAct(agent, { action: t.action, params: args || {} }); out = g.body; }
  else if (name === 'foreman_report') out = (await reportEvent(agent, args || {}, 'mcp')).body;
  else if (name === 'foreman_next_task') { if (agent.status !== 'active') out = { status: 'blocked', reason: 'Access revoked by owner' }; else out = { task: await claimTask(agent) }; }
  else if (name === 'foreman_complete_task') out = (await completeTask(agent, (args || {}).task_id, args || {})).body;
  else if (name === 'foreman_check_request') { const q = await getJ('fm:req:' + (args || {}).request_id); out = q && q.agentId === agent.id ? pub(q) : { error: 'not found' }; }
  return { isError: ['blocked', 'failed'].includes(out && out.status), content: [{ type: 'text', text: JSON.stringify(out) }] };
}
async function mcpHandle(agent, m) {
  const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') return ok({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'foreman', version: '9.0.0' } });
  if (m.method === 'tools/list') return ok({ tools: MCP_TOOLS.map(({ action, ...t }) => t) });
  if (m.method === 'tools/call') return ok(await mcpCall(agent, m.params && m.params.name, m.params && m.params.arguments));
  if (m.method === 'ping') return ok({});
  if (m.id === undefined) return null;
  return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } };
}
// ---------- http ----------
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const path = (req.url || '').split('?')[0].replace(/^\/api/, '').replace(/\/$/, '') || '/';
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  try {
    if (path === '/health') return res.json({ ok: true, store: URL_ ? 'upstash' : 'memory', time: now(), v: 14 });
    if (path === '/me' || path.startsWith('/auth/')) return await handleAuth(req, res, path, body);
    if (path.startsWith('/gateway') || path === '/ingest' || path === '/mcp') {
      const ra = await resolveAgent(req);
      if (!ra) return path === '/mcp' ? res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unknown or invalid agent key' } }) : res.status(401).json({ status: 'unauthorized', reason: 'Unknown or invalid agent key' });
      return await als.run({ ws: ra.ws }, () => routes(req, res, path, body, ra.agent));
    }
    const sess = await getSession(req);
    if (!sess) return res.status(401).json({ error: 'auth', message: 'Sign in required' });
    if (path === '/funnel') { const f = await als.run({ ws: sess.ws }, () => funnel(sess.ws === 'legacy' ? null : sess.ws)); return /format=html/.test(req.url || '') ? res.setHeader('Content-Type', 'text/html; charset=utf-8').status(200).send(funnelHtml(f)) : res.json(f); }
    return await als.run({ ws: sess.ws }, () => routes(req, res, path, body, null));
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
async function routes(req, res, path, body, agentPre) {
  const send = (o) => res.status(o.status).json(o.body);
  const origin = (/^localhost/.test(req.headers.host) ? 'http://' : 'https://') + req.headers.host;
  try {
    if (wsId() === 'legacy') await seed();

    // --- agent-facing gateway ---
    if (path.startsWith('/gateway')) {
      const agent = agentPre;
      if (path === '/gateway/act' && req.method === 'POST') return send(await gatewayAct(agent, body));
      if (path === '/gateway/events' && req.method === 'POST') return send(await reportEvent(agent, body));
      if (path === '/gateway/tasks/next') { if (agent.status !== 'active') { await event(agent.id, 'blocked', 'Blocked task claim: access revoked', { kind: 'BLOCKED' }); return res.status(403).json({ status: 'blocked', reason: 'Access revoked by owner' }); } return res.json({ task: await claimTask(agent) }); }
      { const tm = path.match(/^\/gateway\/tasks\/(\w+)\/complete$/); if (tm && req.method === 'POST') return send(await completeTask(agent, tm[1], body)); }
      const m = path.match(/^\/gateway\/requests\/(\w+)$/);
      if (m) { const q = await getJ('fm:req:' + m[1]); if (!q || q.agentId !== agent.id) return res.status(404).json({ error: 'not found' }); return res.json(pub(q)); }
      return res.status(404).json({ error: 'not found' });
    }
    // --- webhook intake: a provider posts its own payload, the adapter normalizes it ---
    if (path === '/ingest' && req.method === 'POST') { return send(await reportEvent(agentPre, body, 'webhook')); }
    if (path === '/mcp') { const agent = agentPre;
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST JSON-RPC' });
      if (Array.isArray(body)) { const outs = (await Promise.all(body.map(m => mcpHandle(agent, m)))).filter(Boolean); return outs.length ? res.json(outs) : res.status(202).end(); }
      const o = await mcpHandle(agent, body); return o ? res.json(o) : res.status(202).end(); }
    // --- owner-facing ---
    if (path === '/tasks' && req.method === 'POST') { if (!String(body.title || '').trim()) return res.status(400).json({ error: 'title required' }); await track('first_task_started'); return res.json({ task: await newTask({ title: body.title, brief: body.brief, assignee: body.assignee }) }); }
    if (path === '/state') return res.json(await fullState());
    let m;
    if ((m = path.match(/^\/requests\/(\w+)\/(approve|deny)$/)) && req.method === 'POST') { const d = await decide(m[1], m[2]); if (d.status === 200) await track('approval_completed'); return send(d); }
    if (path === '/agents' && req.method === 'POST') { const c = await createAgent(body.name, body.role, body.provider); return res.json(c); }
    if ((m = path.match(/^\/agents\/(\w+)\/(revoke|restore|permissions|limits)$/)) && req.method === 'POST') {
      const a = await getJ('fm:agent:' + m[1]); if (!a) return res.status(404).json({ error: 'not found' });
      if (m[2] === 'revoke') { a.status = 'revoked'; a.revokedAt = now(); await event(a.id, 'revoked', `Owner revoked ${a.name}'s access`); 
        // pending requests of this agent are cancelled immediately
        for (const id of await r(['SMEMBERS', 'fm:reqs'])) { const q = await getJ('fm:req:' + id); if (q && q.agentId === a.id && q.status === 'pending') { q.status = 'blocked'; q.reason = 'Access revoked while pending'; q.decidedAt = now(); await finishReq(q); await receipt(a, q.action, q.params, 'blocked', 0, 'BLOCKED: access revoked while request was pending', q.id, { code: 'revoked' }); } } }
      if (m[2] === 'restore') { a.status = 'active'; delete a.revokedAt; await event(a.id, 'restored', `Owner restored ${a.name}'s access`); }
      if (m[2] === 'permissions') { if (!ACTIONS[body.action] || !['AUTO', 'ASK', 'NEVER'].includes(body.mode)) return res.status(400).json({ error: 'bad input' }); a.permissions[body.action] = body.mode; await event(a.id, 'permission', `${body.action} set to ${body.mode}`); }
      if (m[2] === 'limits') { a.limits = { perActionCents: body.perActionCents == null ? null : +body.perActionCents, dailyCents: body.dailyCents == null ? null : +body.dailyCents }; await event(a.id, 'limits', `Limits set: per action ${a.limits.perActionCents}c, daily ${a.limits.dailyCents}c`); }
      bust(); await setJ('fm:agent:' + a.id, a); return res.json({ agent: a });
    }
    if ((m = path.match(/^\/agents\/(\w+)\/remove$/)) && req.method === 'POST') { const a = await getJ('fm:agent:' + m[1]); if (!a || a.live) return res.status(400).json({ error: 'cannot remove' }); a.status = 'revoked'; await setJ('fm:agent:' + a.id, a); bust(); await r(['SREM', 'fm:agents', a.id]); await r(['DEL', 'fm:secret:' + a.id]); return res.json({ removed: true }); }
    if (path === '/kill' && req.method === 'POST') { bust(); if (body.on) await r(['SET', 'fm:kill', '1']); else await r(['DEL', 'fm:kill']); await event(null, 'kill', body.on ? 'KILL SWITCH ON: all agents stopped' : 'Kill switch off'); return res.json({ killed: !!body.on }); }
    // --- v11: one connect flow for every provider. Hosted providers (Grok) need only a pasted key; the rest get one message to paste. ---
    if (path === '/connect' && req.method === 'POST') {
      const prov = String(body.provider || 'custom'); const name = String(body.name || '').trim() || (prov === 'grok' ? 'Grok' : 'AI employee');
      const preset = PRESETS[body.preset] ? body.preset : 'balanced'; const base = origin;
      if (prov === 'muse') return res.status(400).json({ error: 'Muse is coming soon. It cannot be connected yet.' });
      if (prov === 'grok') {
        const k = String(body.apiKey || '').trim(); if (!/^xai-[A-Za-z0-9]{20,}$/.test(k)) { await mark('connect_failed', { reason: 'bad_key_format' }); return res.status(400).json({ error: 'Paste the key from console.x.ai (it starts with xai-)' }); }
        const model = String(body.model || 'grok-4.3').replace(/[^\w.\-]/g, '').slice(0, 40);
        try { await xaiChat(k, model, 'Reply with the word ready.', 5); } catch (e) { await mark('connect_failed', { reason: /recognise/.test(e.message) ? 'bad_key_format' : /rejected/.test(e.message) ? 'xai_rejected' : /credit|rate/.test(e.message) ? 'xai_credits' : 'xai_other' }); return res.status(400).json({ error: e.message + '. Check the key and that your xAI account has credits.' }); }
        if (body.check) return res.json({ ok: true });
        const c = await createAgent(name, String(body.role || '').trim() || 'Grok employee', 'grok', false, { preset, hosted: true, model });
        await r(['SET', 'fm:secret:' + c.agent.id, enc(k)]);
        await track('connected', { provider: 'grok' }); return res.json({ agent: c.agent, hosted: true });
      }
      const c = await createAgent(name, String(body.role || '').trim(), prov, false, { preset });
      const msg = `You are joining my Foreman workspace as "${name}". Foreman controls what you can do. Your key: ${c.key}\nBase URL: ${base}/api\n1) Get work: GET ${base}/api/gateway/tasks/next with header "Authorization: Bearer <key>". It returns {"task":...} or null.\n2) Do real things only through POST ${base}/api/gateway/act with {"action":"web.fetch"|"notes.write"|"work.handoff","params":{...}}. Foreman answers completed, pending (wait for my approval and poll GET ${base}/api/gateway/requests/<id>) or blocked. Never work around a block.\n3) Finish with POST ${base}/api/gateway/tasks/<task_id>/complete {"result":"..."}.\n4) Report progress with POST ${base}/api/gateway/events {"kind":"TASK_STARTED|TOOL_USED|COMPLETED|FAILED","text":"...","task_id":"..."}.\nMCP clients can use ${base}/api/mcp with the same key.`;
      await track('connected', { provider: prov }); return res.json({ agent: c.agent, hosted: false, instructions: msg, key: c.key });
    }
    if (path === '/track' && req.method === 'POST') { if (['connect_started', 'first_task_started', 'approval_shown'].includes(body.step)) await track(body.step, body.provider ? { provider: String(body.provider).slice(0, 20) } : null); return res.json({ ok: true }); }
    // --- live demo agent ---
    if (wsId() !== 'legacy' && path.startsWith('/demo/')) return res.status(404).json({ error: 'not found' });
    if (path === '/demo/scout/tick' && req.method === 'POST') return res.json(await scoutTick(origin));
    if (path === '/demo/scout/state') return res.json({ ...(await getJ('fm:scout:state') || {}), agentId: await r(['GET', 'fm:scout:id']) });
    return res.status(404).json({ error: 'not found', path });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
