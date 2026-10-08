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
    case 'EVAL': { const [script,n,key,expected,replacement]=[k,...a]; if(script!==AGENT_CAS || Number(n)!==1)throw Error('unsupported local EVAL'); const old=mem.kv.get(key); if(old==null)return -1;if(old!==expected)return 0;mem.kv.set(key,replacement);return 1; }
    case 'MGET': return c.slice(1).map(x => mem.kv.has(x) ? mem.kv.get(x) : null);
    case 'GET': return mem.kv.has(k) ? mem.kv.get(k) : null;
    case 'SET': if(a.includes('NX')&&mem.kv.has(k))return null;mem.kv.set(k, a[0]); return 'OK';
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
// Policy JSON is authoritative; heartbeats never rewrite it.
const AGENT_CAS = "local old=redis.call('GET',KEYS[1]); if not old then return -1 end; if old~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
async function updateAgent(id, patch) {
  const key='fm:agent:'+id;
  for(let attempt=0;attempt<8;attempt++){
    const raw=await r(['GET',key]);if(!raw)return null;
    const a=JSON.parse(raw);patch(a);a.policyRevision=(Number(a.policyRevision)||0)+1;
    const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify(a)]);
    if(won===1){bust();return a;}if(won===-1)return null;
  }
  throw new Error('Concurrent policy update; retry');
}
const now = () => new Date().toISOString();
const rid = p => p + '_' + crypto.randomBytes(5).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---------- action catalog: the real things an agent can do through Foreman ----------
const ACTIONS = {
  'web.fetch':   { label: 'Fetch a live web page', costCents: 1, risk: 'read' },
  'notes.write': { label: 'Write a note to the shared workspace', costCents: 2, risk: 'write' },
  'notes.delete':{ label: 'Delete a note from the shared workspace', costCents: 5, risk: 'destructive' },
  'work.enqueue':{ label: 'Queue an unassigned task', costCents: 0, risk: 'write' },
  'work.handoff':{ label: 'Hand a task to another agent', costCents: 0, risk: 'write' },
};
const DEFAULT_PERMS = { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO', 'work.enqueue': 'ASK' };

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
  if (action === 'work.enqueue') {
    if (typeof params.title !== 'string' || !params.title.trim()) throw new Error('title required');
    if (params.brief != null && typeof params.brief !== 'string') throw new Error('brief must be text');
    const slot = Math.floor(Date.now() / 60000), key = `fm:enqueue:${agent.id}:${slot}`;
    const n = await r(['INCRBY', key, 1]); await r(['EXPIRE', key, 120]);
    if (n > 10) throw new Error('Queue limit reached: 10 tasks per minute');
    const t = await newTask({ title: params.title.trim(), brief: params.brief || '', createdBy: agent.id });
    return { summary: `Queued unassigned task "${t.title}" (${t.id})`, data: { task_id: t.id, status: t.status, assignee: null } };
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
// Chat adapters register only work that has actually started in their own runtime.
// Idempotency is scoped to authenticated employee and workspace; this never starts hosted inference.
async function chatTask(agent, body) {
  if (agent.status !== 'active' || await r(['GET','fm:kill'])) return {status:403,body:{status:'blocked',reason:'Worker is revoked or workspace paused'}};
  const sourceId = String(body.source_id || '').trim(), title = String(body.title || '').trim();
  if (!sourceId || sourceId.length > 200 || !title || title.length > 120) return {status:400,body:{error:'source_id (max 200) and title (max 120) required'}};
  const id = 'task_' + sha(agent.id + ':' + sourceId).slice(0,24);
  const old = await getJ('fm:task:' + id);
  if (old) return {status:200,body:{task:old,duplicate:true}};
  const t = {id,title,brief:String(body.brief || '').slice(0,1500),assignee:agent.id,status:'running',parentId:null,createdBy:agent.id,createdAt:now(),startedAt:now(),result:null,origin:'chat',sourceId};
  const won=await r(['SET','fm:task:' + id,JSON.stringify(t),'NX']);if(!won)return {status:200,body:{task:await getJ('fm:task:' + id),duplicate:true}};await r(['LPUSH','fm:tasklist',id]);await r(['LTRIM','fm:tasklist',0,59]);
  await touchAgent(agent);
  await event(agent.id,'task_started','Started: '+title,{kind:'TASK_STARTED',taskId:id,source:'chat'});
  return {status:200,body:{task:t}};
}
async function touchAgent(agent) {
  const live=await getJ('fm:agent:'+agent.id);if(!live||live.status!=='active')return;
  await r(['SET','fm:seen:'+agent.id,now()]);bust();
}
async function taskForAgent(agent,id) {
  const t=await getJ('fm:task:' + id);if(!t)return null;
  // Original worker can read its delegated child result; recipient can read its own assignment.
  if(t.assignee===agent.id || t.createdBy===agent.id)return t;
  return null;
}

async function newTask(o) { const t = { id: rid('task'), title: String(o.title || 'Untitled').slice(0, 120), brief: String(o.brief || '').slice(0, 1500), assignee: o.assignee || null, status: 'queued', parentId: o.parentId || null, context: String(o.context || '').slice(0, 4000), createdBy: o.createdBy || 'owner', createdAt: now(), result: null };
  bust(); await setJ('fm:task:' + t.id, t); await r(['LPUSH', 'fm:tasklist', t.id]); await r(['LTRIM', 'fm:tasklist', 0, 59]);
  if (t.assignee) { const ag = await getJ('fm:agent:' + t.assignee); if (ag && ag.hosted && ag.status === 'active') await runHosted(ag, t); }
  return t; }
async function listTasks() { const ids = await r(['LRANGE', 'fm:tasklist', 0, 29]); if (!ids.length) return []; return (await r(['MGET', ...ids.map(i => 'fm:task:' + i)])).filter(Boolean).map(x => JSON.parse(x)); }
async function claimTask(agent) { const ts = (await listTasks()).filter(t => t.status === 'queued' && (t.assignee === agent.id || !t.assignee)).reverse(); const t = ts[0]; if (!t) return null;
  t.status = 'running'; t.assignee = agent.id; t.startedAt = now(); await setJ('fm:task:' + t.id, t); await event(agent.id, 'task_started', 'Started: ' + t.title, { kind: 'TASK_STARTED', taskId: t.id }); return t; }
async function completeTask(agent, id, body) { const t = await getJ('fm:task:' + id); if (!t || t.assignee !== agent.id) return { status: 404, body: { error: 'task not found' } };
  if (!['running','queued'].includes(t.status)) return {status:409,body:{error:'Task is already terminal',task:t}};
  const failed = body.status === 'failed'; t.status = failed ? 'failed' : 'done'; t.result = String(body.result || '').slice(0, 4000); t.finishedAt = now(); await setJ('fm:task:' + id, t);
  await touchAgent(agent);
  await event(agent.id, failed ? 'failed' : 'completed', (failed ? 'Failed: ' : 'Finished: ') + t.title, { kind: failed ? 'FAILED' : 'COMPLETED', taskId: t.id });
  if(t.parentId){const p=await getJ('fm:task:' + t.parentId);if(p&&p.assignee)await event(p.assignee,'result_returned','Delegate '+(failed?'failed: ':'result ready: ')+t.title,{kind:'WAITING',taskId:p.id,childTaskId:t.id,fromAgentId:agent.id});}
  return { status: 200, body: { task: t } }; }
async function reportEvent(agent, body, source) { const kind = normKind(body.kind || body.type || body.status || body.event); if (!kind) return { status: 400, body: { error: 'unrecognized event kind', allowed: KINDS } };
  await touchAgent(agent);
  if (agent.status !== 'active') { await event(agent.id, 'blocked', 'Blocked event report: access revoked', { kind: 'BLOCKED' }); return { status: 403, body: { status: 'blocked', reason: 'Access revoked by owner' } }; }
  if (body.task_id) {const t=await getJ('fm:task:' + body.task_id);if(!t || t.assignee!==agent.id)return {status:404,body:{error:'Task not found or not yours'}};}
  const text = String(body.text || body.message || body.summary || kind).slice(0, 200);
  await event(agent.id, 'reported', text, { kind, taskId: body.task_id || null, source: source || 'gateway' }); return { status: 200, body: { status: 'ok', kind } }; }
// ---------- providers: honest integration tiers ----------
const PROVIDERS = [
  { id: 'instinct', name: 'Instinct', tier: 'verified', how: 'HTTP gateway', note: 'Proven live: a real Instinct agent connected, worked through tasks, and was gated by AUTO, ASK and NEVER, then revoked.' },
  { id: 'custom', name: 'Custom agent', tier: 'verified', how: 'HTTP gateway', note: 'Any agent that can make HTTPS calls. Same adapter Instinct uses.' },
  { id: 'mcp', name: 'API / MCP agent', tier: 'verified', how: 'MCP server (JSON-RPC over HTTPS) or REST', note: 'Foreman exposes /api/mcp. MCP-capable agents get gated tools.' },
  { id: 'grok', name: 'Grok / Grok bots', tier: 'verified', how: 'xAI API worker (HTTP gateway)', note: 'Proven live: a real Grok worker (xAI API, grok-4.3) received a handed-off task through the work bus, did the work, and was gated by ASK on its write.' },
  { id: 'muse', name: 'Meta Muse Spark', tier: 'hosted', how: 'Meta Model API', note: 'Connect with a Meta Model API key. Model-list validation is read-only; tasks use separately billed Meta tokens. No automatic welcome task.' },
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
async function museModels(key) {
  const res = await fetch('https://api.meta.ai/v1/models', { headers: { authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Meta rejected that key or access is unavailable' : res.status === 429 ? 'Meta is rate limiting this key. Try later.' : 'Meta model lookup failed (HTTP ' + res.status + ')');
  const j = await res.json(); return (Array.isArray(j.data) ? j.data : []).map(m => m.id).filter(id => /^muse-spark-[\w.\-]+$/.test(String(id)));
}
async function museChat(key, model, prompt) {
  const res = await fetch('https://api.meta.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ model, max_completion_tokens: 1200, reasoning_effort: 'low', messages: [{ role: 'system', content: 'You are an AI employee working inside Foreman. Use only the context given. Be concise and factual. If context is missing, say so.' }, { role: 'user', content: prompt }] }) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Meta rejected this key or model access' : res.status === 402 || res.status === 429 ? 'Meta billing or rate limit prevented this task' : 'Meta task failed (HTTP ' + res.status + ')');
  const j = await res.json(); const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Meta returned no text result'); return text.trim();
}
// Hosted agents run inline, the moment work is assigned: no polling, no cron, no tab.
async function runHosted(agent, t) {
  const live = await getJ('fm:agent:' + agent.id) || agent;
  t.status = 'running'; t.startedAt = now(); await setJ('fm:task:' + t.id, t);
  await event(agent.id, 'task_started', 'Started: ' + t.title, { kind: 'TASK_STARTED', taskId: t.id });
  const stop = live.status !== 'active' ? 'Access revoked by owner' : (await r(['GET', 'fm:kill'])) ? 'Owner kill switch is on' : null;
  if (stop) { t.status = 'failed'; t.result = 'Not run: ' + stop; t.finishedAt = now(); await setJ('fm:task:' + t.id, t); await event(agent.id, 'blocked', 'Blocked task: ' + stop, { kind: 'BLOCKED', taskId: t.id }); return; }
  try {
    const key = dec(await r(['GET', 'fm:secret:' + agent.id])); const meta = live.providerId === 'muse'; const model = live.model || (meta ? 'muse-spark-1.3' : 'grok-4.3');
    await event(agent.id, 'tool_used', 'Calling ' + (meta ? 'Muse Spark' : 'Grok') + ' (' + model + ')', { kind: 'TOOL_USED', taskId: t.id });
    const prompt = 'Task: ' + t.title + '\nBrief: ' + t.brief + (t.context ? '\nContext from the previous agent (via Foreman):\n' + t.context : '');
    const out = await (meta ? museChat(key, model, prompt) : xaiChat(key, model, prompt));
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
async function listAgents() { const ids = await r(['SMEMBERS', 'fm:agents']); if (!ids.length) return []; const vs = await r(['MGET', ...ids.map(i => 'fm:agent:' + i)]), seen=await r(['MGET',...ids.map(i=>'fm:seen:'+i)]); return vs.map((v,i)=>{if(!v)return null;const a=JSON.parse(v);if(seen[i] && (!a.lastSeen || seen[i]>a.lastSeen))a.lastSeen=seen[i];return a;}).filter(Boolean).sort((x, y) => x.createdAt < y.createdAt ? -1 : 1); }
// Universal Foreman event model. Every provider's activity is normalized into one of these kinds.
const KINDS = ['INTERACTION','TASK_STARTED','TOOL_USED','ACTION_REQUESTED','WAITING','HANDOFF','COMPLETED','FAILED','NEEDS_APPROVAL','BLOCKED'];
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
  const oauth=await getJ('gl:oauth:token:'+sha(key));if(oauth){if(!oauth.grantId){await als.run({ws:oauth.ws},()=>setJ('fm:oauth:legacy:'+oauth.agentId,{seenAt:now(),epoch:oauth.epoch||0}));CACHES.delete(oauth.ws);}if(oauth.expires<Date.now())return null;if(oauth.grantId){const grant=await getJ('gl:oauth:grant:'+oauth.grantId);if(!grant||grant.revoked)return null;await als.run({ws:oauth.ws},()=>r(['SADD','fm:oauth:grants:'+oauth.agentId,oauth.grantId]));}const agent=await als.run({ws:oauth.ws},()=>getJ('fm:agent:'+oauth.agentId));return agent&&agent.status==='active'&&((oauth.epoch||0)===(agent.oauthEpoch||0))?{ws:oauth.ws,agent}:null;}
  const w = await r(['GET', 'gl:key:' + sha(key)]);
  if (w) { const agent = await als.run({ ws: w }, () => authAgent(req)); return agent ? { ws: w, agent, apiKey: true } : null; }
  const agent = await als.run({ ws: 'legacy' }, () => authAgent(req)); return agent ? { ws: 'legacy', agent, apiKey: true } : null;
}
async function authAgent(req) {
  const h = req.headers['authorization'] || ''; const key = h.replace(/^Bearer\s+/i, '').trim(); if (!key) return null;
  const id = await r(['GET', 'fm:key:' + sha(key)]); if (!id) return null;
  const current=await r(['GET','fm:gatewayKeyHash:'+id]);if(current&&current!==sha(key))return null;return getJ('fm:agent:' + id);
}

async function gatewayAct(agent, body) {
  const action = body.action, params = body.params || {};
  await touchAgent(agent);
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
  const connections=await Promise.all(agents.map(connectionState));
  const agentsPub = agents.map((a, i) => ({ ...a, connection:connections[i], spentTodayCents: parseInt(sp[i] || '0', 10), state: sts[i] ? JSON.parse(sts[i]) : null })).filter(a => !a.harness);
  const [kill, receipts, events, notes] = await Promise.all([r(['GET', 'fm:kill']), r(['LRANGE', 'fm:receipts', 0, 59]), r(['LRANGE', 'fm:events', 0, 79]), r(['LRANGE', 'fm:notes', 0, 9])]);
  const v = { now: now(), killed: !!kill, actions: ACTIONS, agents: agentsPub, requests: [...pend, ...hist].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1), receipts: parse(receipts), events: parse(events), notes: parse(notes), tasks, kinds: KINDS, providers: PROVIDERS };
  CACHES.set(wsId(), { t: Date.now(), v }); return v;
}
async function finishReq(q) { bust(); await setJ('fm:req:' + q.id, q); await r(['SREM', 'fm:reqs', q.id]); await r(['LPUSH', 'fm:reqhist', JSON.stringify(pub(q))]); await r(['LTRIM', 'fm:reqhist', 0, 29]); }
async function createAgent(name, role, provider, harness, opts) { opts = opts || {};
  const id = rid('agent'); const key = 'fmk_' + crypto.randomBytes(20).toString('hex');
  const agent = { id, name: String(name || 'Agent').slice(0, 40), role: String(role || '').slice(0, 60), provider: (PROVIDERS.find(p => p.id === provider) || { name: 'Custom agent' }).name, providerId: provider || 'custom', harness: !!harness, status: 'active', permissions: { ...(PRESETS[opts.preset] || DEFAULT_PERMS) }, hosted: !!opts.hosted, model: opts.model || null, limits: { perActionCents: 10, dailyCents: 50 }, createdAt: now(), lastSeen: null, keyHint: key.slice(0, 8) + '...' + key.slice(-4) };
  bust(); await setJ('fm:agent:' + id, agent); await r(['SET','fm:gatewayKeyHash:'+id,sha(key)]); await r(['SET', 'fm:key:' + sha(key), id]); await r(['SET', 'gl:key:' + sha(key), wsId()]); await r(['SADD', 'fm:agents', id]);
  await event(id, 'prepared', `${agent.name} connection prepared; waiting for the bot`);
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
  if (SEEDED) return; if (await r(['GET', 'fm:seeded'])) { SEEDED = true; const sid = await r(['GET', 'fm:scout:id']); const sa = sid && await getJ('fm:agent:' + sid); if (sa && !sa.harness) { await updateAgent(sid,a=>{a.harness=true;}); } return; } SEEDED = true;
  const { agent, key } = await createAgent('Scout', 'Research agent (live)', 'custom', true);
  await updateAgent(agent.id,a=>{a.provider='Foreman live agent';a.live=true;});
  await r(['SET', 'fm:scout:key', key]); await r(['SET', 'fm:scout:id', agent.id]); await r(['SET', 'fm:seeded', '1']);
}

// ---------- MCP adapter (JSON-RPC 2.0 over HTTPS) ----------
const MCP_TOOLS = [
  { name: 'foreman_web_fetch', description: 'Fetch a live https web page through Foreman (policy-gated).', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, action: 'web.fetch' },
  { name: 'foreman_notes_write', description: 'Write a note to the shared workspace through Foreman (policy-gated; may pause for owner approval).', inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] }, action: 'notes.write' },
  { name: 'foreman_notes_delete', description: 'Delete workspace notes through Foreman (policy-gated).', inputSchema: { type: 'object', properties: {} }, action: 'notes.delete' },
  { name: 'foreman_enqueue', description: 'Queue an unassigned task in your own workspace. This does not start a hosted worker. Policy-gated, zero cost, maximum 10 per minute.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, brief: { type: 'string' } }, required: ['title'] }, action: 'work.enqueue' },
  { name: 'foreman_handoff', description: 'Hand a task to another Foreman agent.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, to: { type: 'string' }, brief: { type: 'string' } }, required: ['task_id', 'to'] }, action: 'work.handoff' },
  { name: 'foreman_report', description: 'Report your activity. kind is one of ' + KINDS.join(', '), inputSchema: { type: 'object', properties: { kind: { type: 'string' }, text: { type: 'string' } }, required: ['kind'] } },
  {name:'foreman_chat_task',description:'Register a task you have actually begun from an owner chat. Does not execute work or infer from text.',inputSchema:{type:'object',properties:{source_id:{type:'string'},title:{type:'string'},brief:{type:'string'}},required:['source_id','title']}},
  {name:'foreman_read_task',description:'Read your task or the result of a task you delegated.',inputSchema:{type:'object',properties:{task_id:{type:'string'}},required:['task_id']}},
  {name:'blackbox_card_proposal',description:'Request an owner decision for a synthetic card purchase. No real money moves.',inputSchema:{type:'object',properties:{sourceId:{type:'string'},merchant:{type:'string'},amountCents:{type:'integer'},currency:{type:'string',enum:['USD']},purpose:{type:'string'}},required:['sourceId','merchant','amountCents','currency','purpose']}},
  {name:'foreman_presence',description:'Report actual recent interaction with your owner. Does not claim work is running.',inputSchema:{type:'object',properties:{}}},
  { name: 'foreman_next_task', description: 'Claim the next task from the Foreman work bus.', inputSchema: { type: 'object', properties: {} } },
  { name: 'foreman_complete_task', description: 'Finish a task and store its result.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, result: { type: 'string' } }, required: ['task_id', 'result'] } },
  { name: 'foreman_check_request', description: 'Check a paused (ASK) request. Once approved Foreman has already run it; the result is included.', inputSchema: { type: 'object', properties: { request_id: { type: 'string' } }, required: ['request_id'] } },
];
async function mcpCall(agent, name, args) {
  const t = MCP_TOOLS.find(x => x.name === name); if (!t) return { isError: true, content: [{ type: 'text', text: 'unknown tool' }] };
  let out;
  if (t.action) { const g = await gatewayAct(agent, { action: t.action, params: args || {} }); out = g.body; }
  else if (name === 'foreman_report') out = (await reportEvent(agent, args || {}, 'mcp')).body;
  else if(name==='foreman_chat_task')out=(await chatTask(agent,args||{})).body;
  else if(name==='foreman_read_task'){const task=await taskForAgent(agent,(args||{}).task_id);out=task?{task}:{error:'not found'};}
  else if(name==='blackbox_card_proposal')out=(await cardPropose(await getJ('fm:agent:'+agent.id),args||{})).body;
  else if(name==='foreman_presence'){if(agent.status!=='active'||await r(['GET','fm:kill']))out={status:'blocked'};else{await touchAgent(agent);await event(agent.id,'interaction','Available: interacting with owner',{kind:'INTERACTION',source:'mcp'});out={status:'ok'};}}
  else if (name === 'foreman_next_task') { if (agent.status !== 'active') out = { status: 'blocked', reason: 'Access revoked by owner' }; else out = { task: await claimTask(agent) }; }
  else if (name === 'foreman_complete_task') out = (await completeTask(agent, (args || {}).task_id, args || {})).body;
  else if (name === 'foreman_check_request') { const q = await getJ('fm:req:' + (args || {}).request_id); out = q && q.agentId === agent.id ? pub(q) : { error: 'not found' }; }
  return { isError: ['blocked', 'failed'].includes(out && out.status), content: [{ type: 'text', text: JSON.stringify(out) }] };
}
async function mcpHandle(agent, m) {
  const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') {await touchAgent(agent);await event(agent.id,'interaction','MCP client connected',{kind:'INTERACTION',source:'mcp'});return ok({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'foreman', version: '9.0.0' } });}
  if (m.method === 'tools/list') return ok({ tools: MCP_TOOLS.map(({ action, ...t }) => t) });
  if (m.method === 'tools/call') return ok(await mcpCall(agent, m.params && m.params.name, m.params && m.params.arguments));
  if (m.method === 'ping') return ok({});
  if (m.id === undefined) return null;
  return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } };
}
// ---------- spend review scaffold: NO payment execution ----------
// Records owner intent only. No provider adapter or execution token exists here.
async function listSpendRequests(){const ids=(await r(['SMEMBERS','fm:spendRequests']));if(!ids.length)return [];return (await r(['MGET',...ids.map(id=>'fm:spendRequest:'+id)])).filter(Boolean).map(JSON.parse).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,300);}
async function spendSummary(){const requests=await listSpendRequests(),bots={};for(const q of requests){const b=bots[q.agentId]||(bots[q.agentId]={agentId:q.agentId,agentName:q.agentName,requestedCents:0,approvedCents:0,deniedCents:0,chargedCents:0,pendingCount:0});b.requestedCents+=q.amountCents;if(q.status==='approved_not_connected')b.approvedCents+=q.amountCents;if(q.status==='denied')b.deniedCents+=q.amountCents;if(q.status==='pending_review')b.pendingCount++;}return {paymentConnected:false,notificationConnected:false,currency:'USD',requests,bots:Object.values(bots),receipts:requests.filter(q=>q.decisionReceipt).map(q=>q.decisionReceipt),metricsScope:'Latest 300 requests. Approved amounts are intent, not charges.'};}
async function newSpendRequest(agent,body){
 const a=await getJ('fm:agent:'+agent.id);if(!a||a.status!=='active'||await r(['GET','fm:kill']))return {status:403,body:{error:'Worker is off; no spend request accepted'}};
 const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
 if(!Number.isSafeInteger(body.amountCents)||body.amountCents<=0||body.amountCents>100000000||body.currency!=='USD'||!text(body.merchant,120)||!text(body.accountLabel,120)||!text(body.purpose,500)||!text(body.undoTerms,500)||!text(body.sourceId,120))return {status:400,body:{error:'USD amountCents (positive integer), merchant, accountLabel, purpose, undoTerms and sourceId are required'}};
 if(body.taskId){const t=await getJ('fm:task:'+body.taskId);if(!t||t.assignee!==a.id)return {status:400,body:{error:'Task must belong to this worker'}};}
 const details={taskId:body.taskId||null,amountCents:body.amountCents,currency:'USD',merchant:body.merchant.trim(),accountLabel:body.accountLabel.trim(),purpose:body.purpose.trim(),undoTerms:body.undoTerms.trim()};
 const id='spend_'+sha(a.id+':'+body.sourceId).slice(0,24),key='fm:spendRequest:'+id,existing=await getJ(key);
 if(existing)return {status:sha(JSON.stringify(existing.details))===sha(JSON.stringify(details))?200:409,body:sha(JSON.stringify(existing.details))===sha(JSON.stringify(details))?{request:existing}:{error:'sourceId already has different spend details'}};
 const q={id,agentId:a.id,agentName:a.name,...details,details,detailsHash:sha(JSON.stringify(details)),status:'pending_review',createdAt:now(),expiresAt:new Date(Date.now()+86400000).toISOString(),paymentConnected:false,notificationStatus:'in_app_only',chargedCents:0};
 const won=await r(['SET',key,JSON.stringify(q),'NX']);if(!won){const old=await getJ(key);return {status:old.detailsHash===q.detailsHash?200:409,body:old.detailsHash===q.detailsHash?{request:old}:{error:'sourceId conflict'}};}
 await r(['SADD','fm:spendRequests',id]);bust();return {status:201,body:{request:q}};
}
async function reviewSpend(id,decision,detailsHash){const key='fm:spendRequest:'+id;
 for(let attempt=0;attempt<8;attempt++){const raw=await r(['GET',key]);if(!raw)return {status:404,body:{error:'not found'}};const q=JSON.parse(raw);
 if(q.detailsHash!==detailsHash)return {status:409,body:{error:'Spend details changed; review this request again'}};
 if(q.status!=='pending_review')return {status:200,body:{request:q}};
 const a=await getJ('fm:agent:'+q.agentId),blocked=!a||a.status!=='active'||await r(['GET','fm:kill']);
 q.status=decision==='deny'?'denied':Date.parse(q.expiresAt)<=Date.now()?'expired':blocked?'blocked':'approved_not_connected';q.decidedAt=now();q.decisionReceipt={id:'review_'+id,at:q.decidedAt,requestId:id,agentId:q.agentId,agentName:q.agentName,merchant:q.merchant,amountCents:q.amountCents,currency:q.currency,outcome:q.status,chargedCents:0,kind:'decision_record',detailsHash:q.detailsHash,note:'Decision record only. No payment connection, no charge and no vendor receipt.'};
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify(q)]);if(won===1){bust();return {status:200,body:{request:q,receipt:q.decisionReceipt}};}}
 return {status:409,body:{error:'Another decision is being saved; refresh'}};
}

// Synthetic card rails. Separate from gateway policy and existing money decisions.
// Provider contract: execute({id, amountCents, currency, merchant, purpose, botId}).
// Real providers are deliberately not selectable or credentialed in this build.
const CARD_PROVIDER = Object.freeze({id:'sandbox', live:false, async execute(q){
 return {provider:'sandbox',providerReference:'sim_'+q.id,simulatedCents:q.amountCents,chargedCents:0,currency:q.currency};
}});
async function cardData(){
 const ids=await r(['SMEMBERS','fm:cards:proposals']);
 const proposals=ids.length?(await r(['MGET',...ids.map(id=>'fm:cards:q:'+id)])).filter(Boolean).map(JSON.parse).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
 return {mode:'sandbox',liveMoneyEnabled:false,provider:'sandbox',killed:!!await r(['GET','fm:cards:kill']),proposals,ledger:proposals.filter(q=>q.receipt).map(q=>q.receipt),bots:await Promise.all((await listAgents()).map(async a=>({id:a.id,name:a.name,status:a.status,dailyLimitCents:Number((await r(['GET','fm:cards:cap:'+a.id]))??10000),simulatedTodayCents:Number(await r(['GET','fm:cards:spent:'+a.id+':'+now().slice(0,10)])||0)})))};
}
async function cardPropose(a,b){
 if(!a||a.status!=='active'||await r(['GET','fm:kill'])||await r(['GET','fm:cards:kill']))return {status:403,body:{error:'Card proposals paused or worker revoked'}};
 if(!Number.isSafeInteger(b.amountCents)||b.amountCents<1||b.amountCents>100000000||b.currency!=='USD'||!['merchant','purpose','sourceId'].every(k=>typeof b[k]==='string'&&b[k].trim().length>0&&b[k].length<=500))return {status:400,body:{error:'Exact USD cents, merchant, purpose and sourceId required'}};
 const details={botId:a.id,merchant:b.merchant.trim(),amountCents:b.amountCents,currency:'USD',purpose:b.purpose.trim()},hash=sha(JSON.stringify(details)),id='card_'+sha(a.id+':'+b.sourceId).slice(0,24),key='fm:cards:q:'+id;
 const q={id,...details,detailsHash:hash,botName:a.name,status:'pending',mode:'sandbox',createdAt:now(),expiresAt:new Date(Date.now()+86400000).toISOString(),chargedCents:0};
 const won=await r(['SET',key,JSON.stringify(q),'NX']);const old=won?q:await getJ(key);if(old.detailsHash!==hash)return {status:409,body:{error:'sourceId has different details'}};
 await r(['SADD','fm:cards:proposals',id]);return {status:won?201:200,body:{proposal:old}};
}
async function cardDecision(id,decision,hash){
 const key='fm:cards:q:'+id;
 // Serialize all sandbox decisions in the workspace, including cap changes and kill.
 const lock='fm:cards:lock';if(!await r(['SET',lock,'1','NX','EX',30]))return {status:409,body:{error:'Another card change is saving. Try again.'}};
 try{
 const q=await getJ(key);if(!q)return {status:404,body:{error:'not found'}};
 if(q.detailsHash!==hash)return {status:409,body:{error:'Review exact details again'}};
 if(q.status!=='pending')return {status:200,body:{proposal:q}};
 const a=await getJ('fm:agent:'+q.botId),day=now().slice(0,10),spentKey='fm:cards:spent:'+q.botId+':'+day,spent=Number(await r(['GET',spentKey])||0),cap=Number((await r(['GET','fm:cards:cap:'+q.botId]))??10000);
 q.status=decision==='deny'?'denied':Date.parse(q.expiresAt)<=Date.now()?'expired':!a||a.status!=='active'||await r(['GET','fm:kill'])||await r(['GET','fm:cards:kill'])?'blocked':spent+q.amountCents>cap?'limit_blocked':'executing_sandbox';
 // Persist admission before provider invocation. A crash stays visibly unresolved, never recharged.
 if(q.status==='executing_sandbox'){await setJ(key,q);const out=await CARD_PROVIDER.execute(q);q.providerResult=out;q.status='simulated';await r(['INCRBY',spentKey,q.amountCents]);}
 q.decidedAt=now();q.receipt={id:'ledger_'+q.id,requestId:q.id,at:q.decidedAt,botId:q.botId,botName:q.botName,merchant:q.merchant,purpose:q.purpose,amountCents:q.amountCents,currency:q.currency,outcome:q.status,provider:'sandbox',detailsHash:q.detailsHash,simulatedCents:q.status==='simulated'?q.amountCents:0,chargedCents:0,note:'Synthetic ledger. No card issued, no funds moved, no vendor receipt.'};
 await setJ(key,q);return {status:200,body:{proposal:q,receipt:q.receipt}};
 }finally{await r(['DEL',lock]);}
}
async function cardControl(body){
 if(body.dailyLimitCents!=null&&(!Number.isSafeInteger(body.dailyLimitCents)||body.dailyLimitCents<0||body.dailyLimitCents>100000000))return {status:400,body:{error:'Daily limit must be integer cents'}};
 if(body.botId&&!await getJ('fm:agent:'+body.botId))return {status:404,body:{error:'Unknown bot'}};
 const lock='fm:cards:lock';if(!await r(['SET',lock,'1','NX','EX',30]))return {status:409,body:{error:'Another card change is saving. Try again.'}};
 try{if(typeof body.killed==='boolean'){if(body.killed)await r(['SET','fm:cards:kill','1']);else await r(['DEL','fm:cards:kill']);}
 if(body.botId&&body.dailyLimitCents!=null)await r(['SET','fm:cards:cap:'+body.botId,body.dailyLimitCents]);return {status:200,body:await cardData()};}finally{await r(['DEL',lock]);}
}


// OAuth for outbound MCP connections. Providers never lend us their account password.
const OAUTH_ORIGIN='https://foreman-core.vercel.app';
const validRedirect=u=>{try{const x=new URL(u);return !x.username&&!x.password&&!x.hash&&(x.protocol==='https:'||x.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(x.hostname));}catch{return false;}};
// Refresh grants have no routine expiry. Rotation is atomic; replay revokes the family.
// Raw refresh secrets are never persisted. Owner revoke increments the bot epoch.
async function revokeOAuthGrant(id){
 const key='gl:oauth:grant:'+id;
 for(let n=0;n<8;n++){const raw=await r(['GET',key]),g=raw&&JSON.parse(raw);if(!g||g.revoked)return;
 if(await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({...g,revoked:true,revokedAt:now(),failureReason:'refresh_replay',failedAt:now()})])===1){CACHES.delete(g.ws);return;}}
 throw new Error('Concurrent connector update; retry');
}
// Owner-visible state derives from grants, never from a stale heartbeat alone.
async function connectionState(a){
 if(a.hosted)return {status:'not_applicable',persistent:false};
 if(a.status!=='active')return {status:'revoked',persistent:false};
 const gateway=await getJ('fm:gatewaySeen:'+a.id);
 if(a.connectionMode==='gateway')return gateway&&gateway.epoch===(a.oauthEpoch||0)?{status:'active',transport:'gateway',persistent:false,authorizedAt:gateway.seenAt}:{status:'awaiting_bot',transport:'gateway',persistent:false,reason:'gateway_call_pending'};
 const ids=await r(['SMEMBERS','fm:oauth:grants:'+a.id]);
 const grants=(await Promise.all(ids.map(id=>getJ('gl:oauth:grant:'+id)))).filter(g=>g&&g.ws===wsId()&&g.agentId===a.id&&g.epoch===(a.oauthEpoch||0));
 const live=grants.filter(g=>!g.revoked).sort((a,b)=>String(b.renewedAt||b.createdAt).localeCompare(String(a.renewedAt||a.createdAt)));
 if(live.length)return {status:'active',persistent:true,authorizedAt:live[0].createdAt,lastRenewedAt:live[0].renewedAt||null};
 const failed=grants.filter(g=>g.failureReason).sort((a,b)=>String(b.failedAt).localeCompare(String(a.failedAt)))[0];
 const seen=a.lastSeen||await r(['GET','fm:seen:'+a.id]),legacy=await getJ('fm:oauth:legacy:'+a.id),knownLegacy=legacy&&legacy.epoch===(a.oauthEpoch||0);
 return {status:failed||knownLegacy||ids.length?'needs_reauth':seen?'verification_pending':'awaiting_bot',persistent:seen&&!failed&&!knownLegacy&&!ids.length?null:false,reason:failed?failed.failureReason:knownLegacy||ids.length?'persistent_grant_missing':seen?'grant_index_not_verified':'authorization_pending',failedAt:failed?failed.failedAt:null,reconnectEndpoint:'/api/agents/'+a.id+'/reconnect',requiresClientParameters:true};
}
async function reconnectAgent(id,body){
 const a=await getJ('fm:agent:'+id);if(!a)return {status:404,body:{error:'not_found'}};
 if(a.status!=='active'||a.hosted)return {status:409,body:{error:'bot_not_available'}};
 if(!body.client_id||!body.redirect_uri||!body.code_challenge)return {status:409,body:{error:'client_reconnect_required',agentId:id,requires:['client_id','redirect_uri','code_challenge','code_challenge_method'],connection:await connectionState(a)}};
 const client=await getJ('gl:oauth:client:'+body.client_id);
 if(!client||!client.redirect_uris.includes(body.redirect_uri)||body.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge))return {status:400,body:{error:'invalid_client_parameters'}};
 const params=new URLSearchParams({client_id:body.client_id,redirect_uri:body.redirect_uri,response_type:'code',code_challenge_method:'S256',code_challenge:body.code_challenge,scope:'blackbox.bot',resource:OAUTH_ORIGIN+'/api/mcp',agent_id:id});
 if(body.state)params.set('state',String(body.state));
 return {status:200,body:{agentId:id,authorizationUrl:OAUTH_ORIGIN+'/oauth/authorize?'+params.toString(),createsBot:false}};
}
async function oauthRoutes(req,res,path,body){
 const send=(n,b)=>res.status(n).json(b),url=new URL(req.url,OAUTH_ORIGIN),params=Object.fromEntries(url.searchParams);
 if(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/api/mcp')return send(200,{resource:OAUTH_ORIGIN+'/api/mcp',authorization_servers:[OAUTH_ORIGIN],scopes_supported:['blackbox.bot'],bearer_methods_supported:['header']});
 if(path==='/.well-known/oauth-authorization-server')return send(200,{issuer:OAUTH_ORIGIN,authorization_endpoint:OAUTH_ORIGIN+'/oauth/authorize',token_endpoint:OAUTH_ORIGIN+'/api/oauth/token',registration_endpoint:OAUTH_ORIGIN+'/api/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['blackbox.bot']});
 if(path==='/oauth/register'&&req.method==='POST'){
 if(!Array.isArray(body.redirect_uris)||body.redirect_uris.length<1||body.redirect_uris.length>5||!body.redirect_uris.every(validRedirect))return send(400,{error:'invalid_redirect_uri'});
 const ip=String(req.headers['x-forwarded-for']||'local').split(',')[0],n=await r(['INCRBY','gl:oauth:rate:'+sha(ip),1]);await r(['EXPIRE','gl:oauth:rate:'+sha(ip),3600]);if(n>30)return send(429,{error:'rate_limited'});
 const c={client_id:rid('client'),client_name:String(body.client_name||'MCP client').slice(0,100),redirect_uris:body.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']};await setJ('gl:oauth:client:'+c.client_id,c);return send(201,c);
 }
 if(path==='/oauth/context'&&req.method==='GET'){
 const c=await getJ('gl:oauth:client:'+params.client_id);if(!c||!c.redirect_uris.includes(params.redirect_uri)||params.response_type!=='code'||params.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge||''))return send(400,{error:'Invalid sign-in request. Return to your bot and reconnect.'});
 if(params.scope&&params.scope!=='blackbox.bot')return send(400,{error:'invalid_scope'});
 if(params.resource&&params.resource!==OAUTH_ORIGIN+'/api/mcp')return send(400,{error:'invalid_target'});
 const sess=await getSession(req);if(!sess)return send(401,{error:'auth'});
 const csrf=crypto.randomBytes(24).toString('hex');await setJ('gl:oauth:consent:'+sha(csrf),{ws:sess.ws,params,expires:Date.now()+600000});
 const bots=await als.run({ws:sess.ws},listAgents);if(params.agent_id&&!bots.some(a=>a.id===params.agent_id&&a.status==='active'&&!a.hosted))return send(400,{error:'bot_not_available'});return send(200,{client:c.client_name,redirectOrigin:new URL(params.redirect_uri).origin,bots:bots.filter(a=>a.status==='active'&&!a.hosted&&(!params.agent_id||a.id===params.agent_id)).map(a=>({id:a.id,name:a.name,provider:a.provider})),csrf});
 }
 if(path==='/oauth/consent'&&req.method==='POST'){
 if(req.headers.origin!==OAUTH_ORIGIN)return send(403,{error:'origin'});
 const sess=await getSession(req),key='gl:oauth:consent:'+sha(String(body.csrf||'')),raw=await r(['GET',key]),v=raw&&JSON.parse(raw);
 if(!sess||!v||v.ws!==sess.ws||v.expires<Date.now())return send(403,{error:'Sign-in expired. Reconnect from your bot.'});
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({used:true})]);if(won!==1)return send(409,{error:'Already authorized'});
 if(v.params.agent_id&&body.agentId!==v.params.agent_id)return send(400,{error:'Choose the existing bot being reconnected'});
 const a=await als.run({ws:sess.ws},()=>getJ('fm:agent:'+body.agentId));if(!a||a.status!=='active'||a.hosted)return send(400,{error:'Choose an existing external bot'});
 const token='fm_oauth_'+crypto.randomBytes(32).toString('hex'),code=crypto.randomBytes(32).toString('hex');
 await setJ('gl:oauth:code:'+sha(code),{ws:sess.ws,agentId:a.id,clientId:v.params.client_id,redirect:v.params.redirect_uri,challenge:v.params.code_challenge,epoch:a.oauthEpoch||0,expires:Date.now()+120000,token:enc(token)});
 const target=new URL(v.params.redirect_uri);target.searchParams.set('code',code);if(v.params.state)target.searchParams.set('state',v.params.state);return send(200,{redirect:target.toString()});
 }
 if(path==='/oauth/token'&&req.method==='POST'){
 res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');
 if(body.resource&&body.resource!==OAUTH_ORIGIN+'/api/mcp')return send(400,{error:'invalid_target'});
 if(body.scope&&body.scope!=='blackbox.bot')return send(400,{error:'invalid_scope'});
 if(body.grant_type==='refresh_token'){
 const hash=sha(String(body.refresh_token||'')),ref=await getJ('gl:oauth:refresh:'+hash);
 if(!ref||ref.clientId!==body.client_id)return send(400,{error:'invalid_grant'});
 const key='gl:oauth:grant:'+ref.grantId,raw=await r(['GET',key]),grant=raw&&JSON.parse(raw);
 if(!grant||grant.revoked)return send(400,{error:'invalid_grant'});
 await als.run({ws:grant.ws},()=>r(['SADD','fm:oauth:grants:'+grant.agentId,ref.grantId]));CACHES.delete(grant.ws);
 const a=await als.run({ws:grant.ws},()=>getJ('fm:agent:'+grant.agentId));
 if(!a||a.status!=='active'||grant.epoch!==(a.oauthEpoch||0))return send(400,{error:'invalid_grant'});
 if(grant.current!==hash){await revokeOAuthGrant(ref.grantId);return send(400,{error:'invalid_grant'});}
 const refresh='fm_refresh_'+crypto.randomBytes(32).toString('hex'),nextHash=sha(refresh),token='fm_oauth_'+crypto.randomBytes(32).toString('hex');
 await setJ('gl:oauth:refresh:'+nextHash,{grantId:ref.grantId,clientId:grant.clientId});
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({...grant,current:nextHash,renewedAt:now()})]);
 if(won!==1){await r(['DEL','gl:oauth:refresh:'+nextHash]);await revokeOAuthGrant(ref.grantId);return send(400,{error:'invalid_grant'});}
 await setJ('gl:oauth:token:'+sha(token),{ws:grant.ws,agentId:grant.agentId,grantId:ref.grantId,epoch:grant.epoch,expires:Date.now()+3600000});
 return send(200,{access_token:token,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:'blackbox.bot'});
 }
 if(body.grant_type!=='authorization_code')return send(400,{error:'unsupported_grant_type'});
 if(!/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier||''))return send(400,{error:'invalid_grant'});
 const key='gl:oauth:code:'+sha(String(body.code||'')),raw=await r(['GET',key]),c=raw&&JSON.parse(raw),challenge=crypto.createHash('sha256').update(body.code_verifier).digest('base64url');
 if(!c||c.used||c.expires<Date.now()||c.clientId!==body.client_id||c.redirect!==body.redirect_uri||c.challenge!==challenge)return send(400,{error:'invalid_grant'});
 const a=await als.run({ws:c.ws},()=>getJ('fm:agent:'+c.agentId));if(!a||a.status!=='active'||(c.epoch||0)!==(a.oauthEpoch||0))return send(400,{error:'invalid_grant'});
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({used:true})]);if(won!==1)return send(400,{error:'invalid_grant'});
 const token=dec(c.token),refresh='fm_refresh_'+crypto.randomBytes(32).toString('hex'),hash=sha(refresh),grantId=rid('grant'),epoch=a.oauthEpoch||0;
 await setJ('gl:oauth:grant:'+grantId,{ws:c.ws,agentId:c.agentId,clientId:c.clientId,epoch,current:hash,createdAt:now(),revoked:false});
 await als.run({ws:c.ws},()=>r(['SADD','fm:oauth:grants:'+c.agentId,grantId]));CACHES.delete(c.ws);
 await setJ('gl:oauth:refresh:'+hash,{grantId,clientId:c.clientId});
 await setJ('gl:oauth:token:'+sha(token),{ws:c.ws,agentId:c.agentId,grantId,epoch,expires:Date.now()+3600000});
 return send(200,{access_token:token,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:'blackbox.bot'});
 }
 return send(404,{error:'not found'});
}

// ---------- http ----------
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const path = (req.url || '').split('?')[0].replace(/^\/api/, '').replace(/\/$/, '') || '/';
  let body = req.body; if (typeof body === 'string') { try { body = /application\/x-www-form-urlencoded/.test(req.headers['content-type']||'') ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body); } catch { body = {}; } } body = body || {};
  try {
    if(path.startsWith('/oauth/')||path.startsWith('/.well-known/'))return await oauthRoutes(req,res,path,body);
    if (path === '/health') return res.json({ ok: true, store: URL_ ? 'upstash' : 'memory', time: now(), v: 14 });
    if (path === '/me' || path.startsWith('/auth/')) return await handleAuth(req, res, path, body);
    if (path.startsWith('/gateway') || path === '/ingest' || path === '/mcp') {
      const ra = await resolveAgent(req);
      if(!ra&&path==='/mcp')res.setHeader('WWW-Authenticate','Bearer resource_metadata="'+OAUTH_ORIGIN+'/.well-known/oauth-protected-resource/api/mcp"');
      if (!ra) return path === '/mcp' ? res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unknown or invalid agent key' } }) : res.status(401).json({ status: 'unauthorized', reason: 'Unknown or invalid agent key' });
      req.gatewayKeyAuth=!!ra.apiKey;
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
      if(req.gatewayKeyAuth&&agent.status==='active'&&!await r(['GET','fm:kill'])&&((path==='/gateway/presence'&&req.method==='POST')||(path==='/gateway/tasks/next'&&req.method==='GET'))){const prior=await getJ('fm:gatewaySeen:'+agent.id);await setJ('fm:gatewaySeen:'+agent.id,{seenAt:now(),epoch:agent.oauthEpoch||0});await touchAgent(agent);if(!prior||prior.epoch!==(agent.oauthEpoch||0))await event(agent.id,'interaction','HTTP gateway connected',{kind:'INTERACTION',source:'gateway'});}
      if(path==='/gateway/card-proposals'&&req.method==='POST')return send(await cardPropose(await getJ('fm:agent:'+agent.id),body));
      if(path==='/gateway/spend-requests'&&req.method==='POST')return send(await newSpendRequest(agent,body));
      {const sm=path.match(/^\/gateway\/spend-requests\/(spend_[a-f0-9]+)$/);if(sm&&req.method==='GET'){const q=await getJ('fm:spendRequest:'+sm[1]);return q&&q.agentId===agent.id?res.json({request:q}):res.status(404).json({error:'not found'});}}
      if (path === '/gateway/chat-task' && req.method === 'POST') return send(await chatTask(agent,body));
      if (path === '/gateway/presence' && req.method === 'POST') {if(agent.status!=='active'||await r(['GET','fm:kill']))return res.status(403).json({status:'blocked'});await touchAgent(agent);await event(agent.id,'interaction','Available: interacting with owner',{kind:'INTERACTION',source:'chat'});return res.json({status:'ok'});}
      {const tm=path.match(/^\/gateway\/tasks\/(\w+)$/);if(tm&&tm[1]!=='next'&&req.method==='GET'){const t=await taskForAgent(agent,tm[1]);return t?res.json({task:t}):res.status(404).json({error:'not found'});}}
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
    if(path==='/cards'&&req.method==='GET')return res.json(await cardData());
    if(path==='/cards/control'&&req.method==='POST')return send(await cardControl(body));
    if(path==='/cards/proposals'&&req.method==='POST')return send(await cardPropose(await getJ('fm:agent:'+body.botId),body));
    {const cm=path.match(/^\/cards\/(card_[a-f0-9]+)\/(approve|deny)$/);if(cm&&req.method==='POST')return send(await cardDecision(cm[1],cm[2],body.detailsHash));}

    if (path === '/tasks' && req.method === 'POST') { if (!String(body.title || '').trim()) return res.status(400).json({ error: 'title required' }); await track('first_task_started'); return res.json({ task: await newTask({ title: body.title, brief: body.brief, assignee: body.assignee }) }); }
    if(path==='/money'&&req.method==='GET')return res.json(await spendSummary());
    {const sm=path.match(/^\/money\/(spend_[a-f0-9]+)\/(approve|deny)$/);if(sm&&req.method==='POST')return send(await reviewSpend(sm[1],sm[2],body.detailsHash));}
    {const cm=path.match(/^\/agents\/(\w+)\/(connection|reconnect)$/);if(cm){if(cm[2]==='connection'&&req.method==='GET'){const a=await getJ('fm:agent:'+cm[1]);return a?res.json({agentId:a.id,connection:await connectionState(a)}):res.status(404).json({error:'not_found'});}if(cm[2]==='reconnect'&&req.method==='POST'){if(req.headers.origin!==OAUTH_ORIGIN)return res.status(403).json({error:'origin'});return send(await reconnectAgent(cm[1],body));}return res.status(405).json({error:'method_not_allowed'});}}
    if (path === '/state') return res.json(await fullState());
    let m;
    if ((m = path.match(/^\/requests\/(\w+)\/(approve|deny)$/)) && req.method === 'POST') { const d = await decide(m[1], m[2]); if (d.status === 200) await track('approval_completed'); return send(d); }
    {const km=path.match(/^\/agents\/(\w+)\/gateway-key$/);if(km&&req.method==='POST'){
      if(req.headers.origin!==origin)return res.status(403).json({error:'origin'});
      const a=await getJ('fm:agent:'+km[1]);if(!a||a.status!=='active'||a.hosted)return res.status(409).json({error:'bot_not_available'});
      if(await r(['GET','fm:kill']))return res.status(403).json({error:'Workspace is paused'});
      const lock=crypto.randomBytes(12).toString('hex'),lockKey='fm:gatewayKeyLock:'+a.id;if(!await r(['SET',lockKey,lock,'NX','PX',30000]))return res.status(409).json({error:'Key rotation already in progress; retry'});
      try{const oldHash=await r(['GET','fm:gatewayKeyHash:'+a.id]);
      const key='fmk_'+crypto.randomBytes(20).toString('hex'),hash=sha(key);
      const updated=await updateAgent(a.id,x=>{if(x.status!=='active')throw new Error('Bot revoked during setup');x.connectionMode='gateway';x.keyHint=key.slice(0,8)+'...'+key.slice(-4);});
      if(oldHash)await r(['DEL','fm:key:'+oldHash,'gl:key:'+oldHash]);await r(['SET','fm:gatewayKeyHash:'+a.id,hash]);
      await r(['SET','fm:key:'+hash,a.id]);await r(['SET','gl:key:'+hash,wsId()]);await r(['DEL','fm:gatewaySeen:'+a.id,'fm:seen:'+a.id]);bust();
      res.setHeader('Cache-Control','no-store');return res.json({agent:updated,key,connectionStatus:'awaiting_bot'});
      }finally{await r(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lockKey,lock]);}
    }}
    if (path === '/agents' && req.method === 'POST') { const c = await createAgent(body.name, body.role, body.provider); return res.json(c); }
    if ((m = path.match(/^\/agents\/(\w+)\/(revoke|restore|permissions|limits|room)$/)) && req.method === 'POST') {
      const op=m[2];
      const rooms={ops:'Execution Center',sales:'Outreach Center',marketing:'Creative / Marketing',finance:'Research Center',support:'Outreach Center',lounge:'Lounge'};
      if(op==='room' && !Object.prototype.hasOwnProperty.call(rooms,body.room))return res.status(400).json({error:'Choose a valid room'});
      if(op==='permissions' && (!ACTIONS[body.action] || !['AUTO','ASK','NEVER'].includes(body.mode)))return res.status(400).json({error:'bad input'});
      const a=await updateAgent(m[1],a=>{
        if(op==='room'){a.room=body.room;}
        if(op==='revoke'){a.status='revoked';a.revokedAt=now();a.oauthEpoch=(a.oauthEpoch||0)+1;}
        if(op==='restore'){a.status='active';delete a.revokedAt;}
        if(op==='permissions'){a.permissions={...(a.permissions||{}),[body.action]:body.mode};}
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
    case 'EVAL': { const [script,n,key,expected,replacement]=[k,...a]; if(script!==AGENT_CAS || Number(n)!==1)throw Error('unsupported local EVAL'); const old=mem.kv.get(key); if(old==null)return -1;if(old!==expected)return 0;mem.kv.set(key,replacement);return 1; }
    case 'MGET': return c.slice(1).map(x => mem.kv.has(x) ? mem.kv.get(x) : null);
    case 'GET': return mem.kv.has(k) ? mem.kv.get(k) : null;
    case 'SET': if(a.includes('NX')&&mem.kv.has(k))return null;mem.kv.set(k, a[0]); return 'OK';
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
// Policy JSON is authoritative; heartbeats never rewrite it.
const AGENT_CAS = "local old=redis.call('GET',KEYS[1]); if not old then return -1 end; if old~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
async function updateAgent(id, patch) {
  const key='fm:agent:'+id;
  for(let attempt=0;attempt<8;attempt++){
    const raw=await r(['GET',key]);if(!raw)return null;
    const a=JSON.parse(raw);patch(a);a.policyRevision=(Number(a.policyRevision)||0)+1;
    const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify(a)]);
    if(won===1){bust();return a;}if(won===-1)return null;
  }
  throw new Error('Concurrent policy update; retry');
}
const now = () => new Date().toISOString();
const rid = p => p + '_' + crypto.randomBytes(5).toString('hex');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

// ---------- action catalog: the real things an agent can do through Foreman ----------
const ACTIONS = {
  'web.fetch':   { label: 'Fetch a live web page', costCents: 1, risk: 'read' },
  'notes.write': { label: 'Write a note to the shared workspace', costCents: 2, risk: 'write' },
  'notes.delete':{ label: 'Delete a note from the shared workspace', costCents: 5, risk: 'destructive' },
  'work.enqueue':{ label: 'Queue an unassigned task', costCents: 0, risk: 'write' },
  'work.handoff':{ label: 'Hand a task to another agent', costCents: 0, risk: 'write' },
};
const DEFAULT_PERMS = { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO', 'work.enqueue': 'ASK' };

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
  if (action === 'work.enqueue') {
    if (typeof params.title !== 'string' || !params.title.trim()) throw new Error('title required');
    if (params.brief != null && typeof params.brief !== 'string') throw new Error('brief must be text');
    const slot = Math.floor(Date.now() / 60000), key = `fm:enqueue:${agent.id}:${slot}`;
    const n = await r(['INCRBY', key, 1]); await r(['EXPIRE', key, 120]);
    if (n > 10) throw new Error('Queue limit reached: 10 tasks per minute');
    const t = await newTask({ title: params.title.trim(), brief: params.brief || '', createdBy: agent.id });
    return { summary: `Queued unassigned task "${t.title}" (${t.id})`, data: { task_id: t.id, status: t.status, assignee: null } };
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
// Chat adapters register only work that has actually started in their own runtime.
// Idempotency is scoped to authenticated employee and workspace; this never starts hosted inference.
async function chatTask(agent, body) {
  if (agent.status !== 'active' || await r(['GET','fm:kill'])) return {status:403,body:{status:'blocked',reason:'Worker is revoked or workspace paused'}};
  const sourceId = String(body.source_id || '').trim(), title = String(body.title || '').trim();
  if (!sourceId || sourceId.length > 200 || !title || title.length > 120) return {status:400,body:{error:'source_id (max 200) and title (max 120) required'}};
  const id = 'task_' + sha(agent.id + ':' + sourceId).slice(0,24);
  const old = await getJ('fm:task:' + id);
  if (old) return {status:200,body:{task:old,duplicate:true}};
  const t = {id,title,brief:String(body.brief || '').slice(0,1500),assignee:agent.id,status:'running',parentId:null,createdBy:agent.id,createdAt:now(),startedAt:now(),result:null,origin:'chat',sourceId};
  const won=await r(['SET','fm:task:' + id,JSON.stringify(t),'NX']);if(!won)return {status:200,body:{task:await getJ('fm:task:' + id),duplicate:true}};await r(['LPUSH','fm:tasklist',id]);await r(['LTRIM','fm:tasklist',0,59]);
  await touchAgent(agent);
  await event(agent.id,'task_started','Started: '+title,{kind:'TASK_STARTED',taskId:id,source:'chat'});
  return {status:200,body:{task:t}};
}
async function touchAgent(agent) {
  const live=await getJ('fm:agent:'+agent.id);if(!live||live.status!=='active')return;
  await r(['SET','fm:seen:'+agent.id,now()]);bust();
}
async function taskForAgent(agent,id) {
  const t=await getJ('fm:task:' + id);if(!t)return null;
  // Original worker can read its delegated child result; recipient can read its own assignment.
  if(t.assignee===agent.id || t.createdBy===agent.id)return t;
  return null;
}

async function newTask(o) { const t = { id: rid('task'), title: String(o.title || 'Untitled').slice(0, 120), brief: String(o.brief || '').slice(0, 1500), assignee: o.assignee || null, status: 'queued', parentId: o.parentId || null, context: String(o.context || '').slice(0, 4000), createdBy: o.createdBy || 'owner', createdAt: now(), result: null };
  bust(); await setJ('fm:task:' + t.id, t); await r(['LPUSH', 'fm:tasklist', t.id]); await r(['LTRIM', 'fm:tasklist', 0, 59]);
  if (t.assignee) { const ag = await getJ('fm:agent:' + t.assignee); if (ag && ag.hosted && ag.status === 'active') await runHosted(ag, t); }
  return t; }
async function listTasks() { const ids = await r(['LRANGE', 'fm:tasklist', 0, 29]); if (!ids.length) return []; return (await r(['MGET', ...ids.map(i => 'fm:task:' + i)])).filter(Boolean).map(x => JSON.parse(x)); }
async function claimTask(agent) { const ts = (await listTasks()).filter(t => t.status === 'queued' && (t.assignee === agent.id || !t.assignee)).reverse(); const t = ts[0]; if (!t) return null;
  t.status = 'running'; t.assignee = agent.id; t.startedAt = now(); await setJ('fm:task:' + t.id, t); await event(agent.id, 'task_started', 'Started: ' + t.title, { kind: 'TASK_STARTED', taskId: t.id }); return t; }
async function completeTask(agent, id, body) { const t = await getJ('fm:task:' + id); if (!t || t.assignee !== agent.id) return { status: 404, body: { error: 'task not found' } };
  if (!['running','queued'].includes(t.status)) return {status:409,body:{error:'Task is already terminal',task:t}};
  const failed = body.status === 'failed'; t.status = failed ? 'failed' : 'done'; t.result = String(body.result || '').slice(0, 4000); t.finishedAt = now(); await setJ('fm:task:' + id, t);
  await touchAgent(agent);
  await event(agent.id, failed ? 'failed' : 'completed', (failed ? 'Failed: ' : 'Finished: ') + t.title, { kind: failed ? 'FAILED' : 'COMPLETED', taskId: t.id });
  if(t.parentId){const p=await getJ('fm:task:' + t.parentId);if(p&&p.assignee)await event(p.assignee,'result_returned','Delegate '+(failed?'failed: ':'result ready: ')+t.title,{kind:'WAITING',taskId:p.id,childTaskId:t.id,fromAgentId:agent.id});}
  return { status: 200, body: { task: t } }; }
async function reportEvent(agent, body, source) { const kind = normKind(body.kind || body.type || body.status || body.event); if (!kind) return { status: 400, body: { error: 'unrecognized event kind', allowed: KINDS } };
  await touchAgent(agent);
  if (agent.status !== 'active') { await event(agent.id, 'blocked', 'Blocked event report: access revoked', { kind: 'BLOCKED' }); return { status: 403, body: { status: 'blocked', reason: 'Access revoked by owner' } }; }
  if (body.task_id) {const t=await getJ('fm:task:' + body.task_id);if(!t || t.assignee!==agent.id)return {status:404,body:{error:'Task not found or not yours'}};}
  const text = String(body.text || body.message || body.summary || kind).slice(0, 200);
  await event(agent.id, 'reported', text, { kind, taskId: body.task_id || null, source: source || 'gateway' }); return { status: 200, body: { status: 'ok', kind } }; }
// ---------- providers: honest integration tiers ----------
const PROVIDERS = [
  { id: 'instinct', name: 'Instinct', tier: 'verified', how: 'HTTP gateway', note: 'Proven live: a real Instinct agent connected, worked through tasks, and was gated by AUTO, ASK and NEVER, then revoked.' },
  { id: 'custom', name: 'Custom agent', tier: 'verified', how: 'HTTP gateway', note: 'Any agent that can make HTTPS calls. Same adapter Instinct uses.' },
  { id: 'mcp', name: 'API / MCP agent', tier: 'verified', how: 'MCP server (JSON-RPC over HTTPS) or REST', note: 'Foreman exposes /api/mcp. MCP-capable agents get gated tools.' },
  { id: 'grok', name: 'Grok / Grok bots', tier: 'verified', how: 'xAI API worker (HTTP gateway)', note: 'Proven live: a real Grok worker (xAI API, grok-4.3) received a handed-off task through the work bus, did the work, and was gated by ASK on its write.' },
  { id: 'muse', name: 'Meta Muse Spark', tier: 'hosted', how: 'Meta Model API', note: 'Connect with a Meta Model API key. Model-list validation is read-only; tasks use separately billed Meta tokens. No automatic welcome task.' },
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
async function museModels(key) {
  const res = await fetch('https://api.meta.ai/v1/models', { headers: { authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Meta rejected that key or access is unavailable' : res.status === 429 ? 'Meta is rate limiting this key. Try later.' : 'Meta model lookup failed (HTTP ' + res.status + ')');
  const j = await res.json(); return (Array.isArray(j.data) ? j.data : []).map(m => m.id).filter(id => /^muse-spark-[\w.\-]+$/.test(String(id)));
}
async function museChat(key, model, prompt) {
  const res = await fetch('https://api.meta.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ model, max_completion_tokens: 1200, reasoning_effort: 'low', messages: [{ role: 'system', content: 'You are an AI employee working inside Foreman. Use only the context given. Be concise and factual. If context is missing, say so.' }, { role: 'user', content: prompt }] }) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Meta rejected this key or model access' : res.status === 402 || res.status === 429 ? 'Meta billing or rate limit prevented this task' : 'Meta task failed (HTTP ' + res.status + ')');
  const j = await res.json(); const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Meta returned no text result'); return text.trim();
}
// Hosted agents run inline, the moment work is assigned: no polling, no cron, no tab.
async function runHosted(agent, t) {
  const live = await getJ('fm:agent:' + agent.id) || agent;
  t.status = 'running'; t.startedAt = now(); await setJ('fm:task:' + t.id, t);
  await event(agent.id, 'task_started', 'Started: ' + t.title, { kind: 'TASK_STARTED', taskId: t.id });
  const stop = live.status !== 'active' ? 'Access revoked by owner' : (await r(['GET', 'fm:kill'])) ? 'Owner kill switch is on' : null;
  if (stop) { t.status = 'failed'; t.result = 'Not run: ' + stop; t.finishedAt = now(); await setJ('fm:task:' + t.id, t); await event(agent.id, 'blocked', 'Blocked task: ' + stop, { kind: 'BLOCKED', taskId: t.id }); return; }
  try {
    const key = dec(await r(['GET', 'fm:secret:' + agent.id])); const meta = live.providerId === 'muse'; const model = live.model || (meta ? 'muse-spark-1.3' : 'grok-4.3');
    await event(agent.id, 'tool_used', 'Calling ' + (meta ? 'Muse Spark' : 'Grok') + ' (' + model + ')', { kind: 'TOOL_USED', taskId: t.id });
    const prompt = 'Task: ' + t.title + '\nBrief: ' + t.brief + (t.context ? '\nContext from the previous agent (via Foreman):\n' + t.context : '');
    const out = await (meta ? museChat(key, model, prompt) : xaiChat(key, model, prompt));
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
async function listAgents() { const ids = await r(['SMEMBERS', 'fm:agents']); if (!ids.length) return []; const vs = await r(['MGET', ...ids.map(i => 'fm:agent:' + i)]), seen=await r(['MGET',...ids.map(i=>'fm:seen:'+i)]); return vs.map((v,i)=>{if(!v)return null;const a=JSON.parse(v);if(seen[i] && (!a.lastSeen || seen[i]>a.lastSeen))a.lastSeen=seen[i];return a;}).filter(Boolean).sort((x, y) => x.createdAt < y.createdAt ? -1 : 1); }
// Universal Foreman event model. Every provider's activity is normalized into one of these kinds.
const KINDS = ['INTERACTION','TASK_STARTED','TOOL_USED','ACTION_REQUESTED','WAITING','HANDOFF','COMPLETED','FAILED','NEEDS_APPROVAL','BLOCKED'];
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
  const oauth=await getJ('gl:oauth:token:'+sha(key));if(oauth){if(!oauth.grantId){await als.run({ws:oauth.ws},()=>setJ('fm:oauth:legacy:'+oauth.agentId,{seenAt:now(),epoch:oauth.epoch||0}));CACHES.delete(oauth.ws);}if(oauth.expires<Date.now())return null;if(oauth.grantId){const grant=await getJ('gl:oauth:grant:'+oauth.grantId);if(!grant||grant.revoked)return null;await als.run({ws:oauth.ws},()=>r(['SADD','fm:oauth:grants:'+oauth.agentId,oauth.grantId]));}const agent=await als.run({ws:oauth.ws},()=>getJ('fm:agent:'+oauth.agentId));return agent&&agent.status==='active'&&((oauth.epoch||0)===(agent.oauthEpoch||0))?{ws:oauth.ws,agent}:null;}
  const w = await r(['GET', 'gl:key:' + sha(key)]);
  if (w) { const agent = await als.run({ ws: w }, () => authAgent(req)); return agent ? { ws: w, agent, apiKey: true } : null; }
  const agent = await als.run({ ws: 'legacy' }, () => authAgent(req)); return agent ? { ws: 'legacy', agent, apiKey: true } : null;
}
async function authAgent(req) {
  const h = req.headers['authorization'] || ''; const key = h.replace(/^Bearer\s+/i, '').trim(); if (!key) return null;
  const id = await r(['GET', 'fm:key:' + sha(key)]); if (!id) return null;
  const current=await r(['GET','fm:gatewayKeyHash:'+id]);if(current&&current!==sha(key))return null;return getJ('fm:agent:' + id);
}

async function gatewayAct(agent, body) {
  const action = body.action, params = body.params || {};
  await touchAgent(agent);
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
  const connections=await Promise.all(agents.map(connectionState));
  const agentsPub = agents.map((a, i) => ({ ...a, connection:connections[i], spentTodayCents: parseInt(sp[i] || '0', 10), state: sts[i] ? JSON.parse(sts[i]) : null })).filter(a => !a.harness);
  const [kill, receipts, events, notes] = await Promise.all([r(['GET', 'fm:kill']), r(['LRANGE', 'fm:receipts', 0, 59]), r(['LRANGE', 'fm:events', 0, 79]), r(['LRANGE', 'fm:notes', 0, 9])]);
  const v = { now: now(), killed: !!kill, actions: ACTIONS, agents: agentsPub, requests: [...pend, ...hist].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1), receipts: parse(receipts), events: parse(events), notes: parse(notes), tasks, kinds: KINDS, providers: PROVIDERS };
  CACHES.set(wsId(), { t: Date.now(), v }); return v;
}
async function finishReq(q) { bust(); await setJ('fm:req:' + q.id, q); await r(['SREM', 'fm:reqs', q.id]); await r(['LPUSH', 'fm:reqhist', JSON.stringify(pub(q))]); await r(['LTRIM', 'fm:reqhist', 0, 29]); }
async function createAgent(name, role, provider, harness, opts) { opts = opts || {};
  const id = rid('agent'); const key = 'fmk_' + crypto.randomBytes(20).toString('hex');
  const agent = { id, name: String(name || 'Agent').slice(0, 40), role: String(role || '').slice(0, 60), provider: (PROVIDERS.find(p => p.id === provider) || { name: 'Custom agent' }).name, providerId: provider || 'custom', harness: !!harness, status: 'active', permissions: { ...(PRESETS[opts.preset] || DEFAULT_PERMS) }, hosted: !!opts.hosted, model: opts.model || null, limits: { perActionCents: 10, dailyCents: 50 }, createdAt: now(), lastSeen: null, keyHint: key.slice(0, 8) + '...' + key.slice(-4) };
  bust(); await setJ('fm:agent:' + id, agent); await r(['SET','fm:gatewayKeyHash:'+id,sha(key)]); await r(['SET', 'fm:key:' + sha(key), id]); await r(['SET', 'gl:key:' + sha(key), wsId()]); await r(['SADD', 'fm:agents', id]);
  await event(id, 'prepared', `${agent.name} connection prepared; waiting for the bot`);
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
  if (SEEDED) return; if (await r(['GET', 'fm:seeded'])) { SEEDED = true; const sid = await r(['GET', 'fm:scout:id']); const sa = sid && await getJ('fm:agent:' + sid); if (sa && !sa.harness) { await updateAgent(sid,a=>{a.harness=true;}); } return; } SEEDED = true;
  const { agent, key } = await createAgent('Scout', 'Research agent (live)', 'custom', true);
  await updateAgent(agent.id,a=>{a.provider='Foreman live agent';a.live=true;});
  await r(['SET', 'fm:scout:key', key]); await r(['SET', 'fm:scout:id', agent.id]); await r(['SET', 'fm:seeded', '1']);
}

// ---------- MCP adapter (JSON-RPC 2.0 over HTTPS) ----------
const MCP_TOOLS = [
  { name: 'foreman_web_fetch', description: 'Fetch a live https web page through Foreman (policy-gated).', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, action: 'web.fetch' },
  { name: 'foreman_notes_write', description: 'Write a note to the shared workspace through Foreman (policy-gated; may pause for owner approval).', inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'] }, action: 'notes.write' },
  { name: 'foreman_notes_delete', description: 'Delete workspace notes through Foreman (policy-gated).', inputSchema: { type: 'object', properties: {} }, action: 'notes.delete' },
  { name: 'foreman_enqueue', description: 'Queue an unassigned task in your own workspace. This does not start a hosted worker. Policy-gated, zero cost, maximum 10 per minute.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, brief: { type: 'string' } }, required: ['title'] }, action: 'work.enqueue' },
  { name: 'foreman_handoff', description: 'Hand a task to another Foreman agent.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, to: { type: 'string' }, brief: { type: 'string' } }, required: ['task_id', 'to'] }, action: 'work.handoff' },
  { name: 'foreman_report', description: 'Report your activity. kind is one of ' + KINDS.join(', '), inputSchema: { type: 'object', properties: { kind: { type: 'string' }, text: { type: 'string' } }, required: ['kind'] } },
  {name:'foreman_chat_task',description:'Register a task you have actually begun from an owner chat. Does not execute work or infer from text.',inputSchema:{type:'object',properties:{source_id:{type:'string'},title:{type:'string'},brief:{type:'string'}},required:['source_id','title']}},
  {name:'foreman_read_task',description:'Read your task or the result of a task you delegated.',inputSchema:{type:'object',properties:{task_id:{type:'string'}},required:['task_id']}},
  {name:'blackbox_card_proposal',description:'Request an owner decision for a synthetic card purchase. No real money moves.',inputSchema:{type:'object',properties:{sourceId:{type:'string'},merchant:{type:'string'},amountCents:{type:'integer'},currency:{type:'string',enum:['USD']},purpose:{type:'string'}},required:['sourceId','merchant','amountCents','currency','purpose']}},
  {name:'foreman_presence',description:'Report actual recent interaction with your owner. Does not claim work is running.',inputSchema:{type:'object',properties:{}}},
  { name: 'foreman_next_task', description: 'Claim the next task from the Foreman work bus.', inputSchema: { type: 'object', properties: {} } },
  { name: 'foreman_complete_task', description: 'Finish a task and store its result.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, result: { type: 'string' } }, required: ['task_id', 'result'] } },
  { name: 'foreman_check_request', description: 'Check a paused (ASK) request. Once approved Foreman has already run it; the result is included.', inputSchema: { type: 'object', properties: { request_id: { type: 'string' } }, required: ['request_id'] } },
];
async function mcpCall(agent, name, args) {
  const t = MCP_TOOLS.find(x => x.name === name); if (!t) return { isError: true, content: [{ type: 'text', text: 'unknown tool' }] };
  let out;
  if (t.action) { const g = await gatewayAct(agent, { action: t.action, params: args || {} }); out = g.body; }
  else if (name === 'foreman_report') out = (await reportEvent(agent, args || {}, 'mcp')).body;
  else if(name==='foreman_chat_task')out=(await chatTask(agent,args||{})).body;
  else if(name==='foreman_read_task'){const task=await taskForAgent(agent,(args||{}).task_id);out=task?{task}:{error:'not found'};}
  else if(name==='blackbox_card_proposal')out=(await cardPropose(await getJ('fm:agent:'+agent.id),args||{})).body;
  else if(name==='foreman_presence'){if(agent.status!=='active'||await r(['GET','fm:kill']))out={status:'blocked'};else{await touchAgent(agent);await event(agent.id,'interaction','Available: interacting with owner',{kind:'INTERACTION',source:'mcp'});out={status:'ok'};}}
  else if (name === 'foreman_next_task') { if (agent.status !== 'active') out = { status: 'blocked', reason: 'Access revoked by owner' }; else out = { task: await claimTask(agent) }; }
  else if (name === 'foreman_complete_task') out = (await completeTask(agent, (args || {}).task_id, args || {})).body;
  else if (name === 'foreman_check_request') { const q = await getJ('fm:req:' + (args || {}).request_id); out = q && q.agentId === agent.id ? pub(q) : { error: 'not found' }; }
  return { isError: ['blocked', 'failed'].includes(out && out.status), content: [{ type: 'text', text: JSON.stringify(out) }] };
}
async function mcpHandle(agent, m) {
  const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') {await touchAgent(agent);await event(agent.id,'interaction','MCP client connected',{kind:'INTERACTION',source:'mcp'});return ok({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'foreman', version: '9.0.0' } });}
  if (m.method === 'tools/list') return ok({ tools: MCP_TOOLS.map(({ action, ...t }) => t) });
  if (m.method === 'tools/call') return ok(await mcpCall(agent, m.params && m.params.name, m.params && m.params.arguments));
  if (m.method === 'ping') return ok({});
  if (m.id === undefined) return null;
  return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } };
}
// ---------- spend review scaffold: NO payment execution ----------
// Records owner intent only. No provider adapter or execution token exists here.
async function listSpendRequests(){const ids=(await r(['SMEMBERS','fm:spendRequests']));if(!ids.length)return [];return (await r(['MGET',...ids.map(id=>'fm:spendRequest:'+id)])).filter(Boolean).map(JSON.parse).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,300);}
async function spendSummary(){const requests=await listSpendRequests(),bots={};for(const q of requests){const b=bots[q.agentId]||(bots[q.agentId]={agentId:q.agentId,agentName:q.agentName,requestedCents:0,approvedCents:0,deniedCents:0,chargedCents:0,pendingCount:0});b.requestedCents+=q.amountCents;if(q.status==='approved_not_connected')b.approvedCents+=q.amountCents;if(q.status==='denied')b.deniedCents+=q.amountCents;if(q.status==='pending_review')b.pendingCount++;}return {paymentConnected:false,notificationConnected:false,currency:'USD',requests,bots:Object.values(bots),receipts:requests.filter(q=>q.decisionReceipt).map(q=>q.decisionReceipt),metricsScope:'Latest 300 requests. Approved amounts are intent, not charges.'};}
async function newSpendRequest(agent,body){
 const a=await getJ('fm:agent:'+agent.id);if(!a||a.status!=='active'||await r(['GET','fm:kill']))return {status:403,body:{error:'Worker is off; no spend request accepted'}};
 const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
 if(!Number.isSafeInteger(body.amountCents)||body.amountCents<=0||body.amountCents>100000000||body.currency!=='USD'||!text(body.merchant,120)||!text(body.accountLabel,120)||!text(body.purpose,500)||!text(body.undoTerms,500)||!text(body.sourceId,120))return {status:400,body:{error:'USD amountCents (positive integer), merchant, accountLabel, purpose, undoTerms and sourceId are required'}};
 if(body.taskId){const t=await getJ('fm:task:'+body.taskId);if(!t||t.assignee!==a.id)return {status:400,body:{error:'Task must belong to this worker'}};}
 const details={taskId:body.taskId||null,amountCents:body.amountCents,currency:'USD',merchant:body.merchant.trim(),accountLabel:body.accountLabel.trim(),purpose:body.purpose.trim(),undoTerms:body.undoTerms.trim()};
 const id='spend_'+sha(a.id+':'+body.sourceId).slice(0,24),key='fm:spendRequest:'+id,existing=await getJ(key);
 if(existing)return {status:sha(JSON.stringify(existing.details))===sha(JSON.stringify(details))?200:409,body:sha(JSON.stringify(existing.details))===sha(JSON.stringify(details))?{request:existing}:{error:'sourceId already has different spend details'}};
 const q={id,agentId:a.id,agentName:a.name,...details,details,detailsHash:sha(JSON.stringify(details)),status:'pending_review',createdAt:now(),expiresAt:new Date(Date.now()+86400000).toISOString(),paymentConnected:false,notificationStatus:'in_app_only',chargedCents:0};
 const won=await r(['SET',key,JSON.stringify(q),'NX']);if(!won){const old=await getJ(key);return {status:old.detailsHash===q.detailsHash?200:409,body:old.detailsHash===q.detailsHash?{request:old}:{error:'sourceId conflict'}};}
 await r(['SADD','fm:spendRequests',id]);bust();return {status:201,body:{request:q}};
}
async function reviewSpend(id,decision,detailsHash){const key='fm:spendRequest:'+id;
 for(let attempt=0;attempt<8;attempt++){const raw=await r(['GET',key]);if(!raw)return {status:404,body:{error:'not found'}};const q=JSON.parse(raw);
 if(q.detailsHash!==detailsHash)return {status:409,body:{error:'Spend details changed; review this request again'}};
 if(q.status!=='pending_review')return {status:200,body:{request:q}};
 const a=await getJ('fm:agent:'+q.agentId),blocked=!a||a.status!=='active'||await r(['GET','fm:kill']);
 q.status=decision==='deny'?'denied':Date.parse(q.expiresAt)<=Date.now()?'expired':blocked?'blocked':'approved_not_connected';q.decidedAt=now();q.decisionReceipt={id:'review_'+id,at:q.decidedAt,requestId:id,agentId:q.agentId,agentName:q.agentName,merchant:q.merchant,amountCents:q.amountCents,currency:q.currency,outcome:q.status,chargedCents:0,kind:'decision_record',detailsHash:q.detailsHash,note:'Decision record only. No payment connection, no charge and no vendor receipt.'};
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify(q)]);if(won===1){bust();return {status:200,body:{request:q,receipt:q.decisionReceipt}};}}
 return {status:409,body:{error:'Another decision is being saved; refresh'}};
}

// Synthetic card rails. Separate from gateway policy and existing money decisions.
// Provider contract: execute({id, amountCents, currency, merchant, purpose, botId}).
// Real providers are deliberately not selectable or credentialed in this build.
const CARD_PROVIDER = Object.freeze({id:'sandbox', live:false, async execute(q){
 return {provider:'sandbox',providerReference:'sim_'+q.id,simulatedCents:q.amountCents,chargedCents:0,currency:q.currency};
}});
async function cardData(){
 const ids=await r(['SMEMBERS','fm:cards:proposals']);
 const proposals=ids.length?(await r(['MGET',...ids.map(id=>'fm:cards:q:'+id)])).filter(Boolean).map(JSON.parse).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
 return {mode:'sandbox',liveMoneyEnabled:false,provider:'sandbox',killed:!!await r(['GET','fm:cards:kill']),proposals,ledger:proposals.filter(q=>q.receipt).map(q=>q.receipt),bots:await Promise.all((await listAgents()).map(async a=>({id:a.id,name:a.name,status:a.status,dailyLimitCents:Number((await r(['GET','fm:cards:cap:'+a.id]))??10000),simulatedTodayCents:Number(await r(['GET','fm:cards:spent:'+a.id+':'+now().slice(0,10)])||0)})))};
}
async function cardPropose(a,b){
 if(!a||a.status!=='active'||await r(['GET','fm:kill'])||await r(['GET','fm:cards:kill']))return {status:403,body:{error:'Card proposals paused or worker revoked'}};
 if(!Number.isSafeInteger(b.amountCents)||b.amountCents<1||b.amountCents>100000000||b.currency!=='USD'||!['merchant','purpose','sourceId'].every(k=>typeof b[k]==='string'&&b[k].trim().length>0&&b[k].length<=500))return {status:400,body:{error:'Exact USD cents, merchant, purpose and sourceId required'}};
 const details={botId:a.id,merchant:b.merchant.trim(),amountCents:b.amountCents,currency:'USD',purpose:b.purpose.trim()},hash=sha(JSON.stringify(details)),id='card_'+sha(a.id+':'+b.sourceId).slice(0,24),key='fm:cards:q:'+id;
 const q={id,...details,detailsHash:hash,botName:a.name,status:'pending',mode:'sandbox',createdAt:now(),expiresAt:new Date(Date.now()+86400000).toISOString(),chargedCents:0};
 const won=await r(['SET',key,JSON.stringify(q),'NX']);const old=won?q:await getJ(key);if(old.detailsHash!==hash)return {status:409,body:{error:'sourceId has different details'}};
 await r(['SADD','fm:cards:proposals',id]);return {status:won?201:200,body:{proposal:old}};
}
async function cardDecision(id,decision,hash){
 const key='fm:cards:q:'+id;
 // Serialize all sandbox decisions in the workspace, including cap changes and kill.
 const lock='fm:cards:lock';if(!await r(['SET',lock,'1','NX','EX',30]))return {status:409,body:{error:'Another card change is saving. Try again.'}};
 try{
 const q=await getJ(key);if(!q)return {status:404,body:{error:'not found'}};
 if(q.detailsHash!==hash)return {status:409,body:{error:'Review exact details again'}};
 if(q.status!=='pending')return {status:200,body:{proposal:q}};
 const a=await getJ('fm:agent:'+q.botId),day=now().slice(0,10),spentKey='fm:cards:spent:'+q.botId+':'+day,spent=Number(await r(['GET',spentKey])||0),cap=Number((await r(['GET','fm:cards:cap:'+q.botId]))??10000);
 q.status=decision==='deny'?'denied':Date.parse(q.expiresAt)<=Date.now()?'expired':!a||a.status!=='active'||await r(['GET','fm:kill'])||await r(['GET','fm:cards:kill'])?'blocked':spent+q.amountCents>cap?'limit_blocked':'executing_sandbox';
 // Persist admission before provider invocation. A crash stays visibly unresolved, never recharged.
 if(q.status==='executing_sandbox'){await setJ(key,q);const out=await CARD_PROVIDER.execute(q);q.providerResult=out;q.status='simulated';await r(['INCRBY',spentKey,q.amountCents]);}
 q.decidedAt=now();q.receipt={id:'ledger_'+q.id,requestId:q.id,at:q.decidedAt,botId:q.botId,botName:q.botName,merchant:q.merchant,purpose:q.purpose,amountCents:q.amountCents,currency:q.currency,outcome:q.status,provider:'sandbox',detailsHash:q.detailsHash,simulatedCents:q.status==='simulated'?q.amountCents:0,chargedCents:0,note:'Synthetic ledger. No card issued, no funds moved, no vendor receipt.'};
 await setJ(key,q);return {status:200,body:{proposal:q,receipt:q.receipt}};
 }finally{await r(['DEL',lock]);}
}
async function cardControl(body){
 if(body.dailyLimitCents!=null&&(!Number.isSafeInteger(body.dailyLimitCents)||body.dailyLimitCents<0||body.dailyLimitCents>100000000))return {status:400,body:{error:'Daily limit must be integer cents'}};
 if(body.botId&&!await getJ('fm:agent:'+body.botId))return {status:404,body:{error:'Unknown bot'}};
 const lock='fm:cards:lock';if(!await r(['SET',lock,'1','NX','EX',30]))return {status:409,body:{error:'Another card change is saving. Try again.'}};
 try{if(typeof body.killed==='boolean'){if(body.killed)await r(['SET','fm:cards:kill','1']);else await r(['DEL','fm:cards:kill']);}
 if(body.botId&&body.dailyLimitCents!=null)await r(['SET','fm:cards:cap:'+body.botId,body.dailyLimitCents]);return {status:200,body:await cardData()};}finally{await r(['DEL',lock]);}
}


// OAuth for outbound MCP connections. Providers never lend us their account password.
const OAUTH_ORIGIN='https://foreman-core.vercel.app';
const validRedirect=u=>{try{const x=new URL(u);return !x.username&&!x.password&&!x.hash&&(x.protocol==='https:'||x.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(x.hostname));}catch{return false;}};
// Refresh grants have no routine expiry. Rotation is atomic; replay revokes the family.
// Raw refresh secrets are never persisted. Owner revoke increments the bot epoch.
async function revokeOAuthGrant(id){
 const key='gl:oauth:grant:'+id;
 for(let n=0;n<8;n++){const raw=await r(['GET',key]),g=raw&&JSON.parse(raw);if(!g||g.revoked)return;
 if(await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({...g,revoked:true,revokedAt:now(),failureReason:'refresh_replay',failedAt:now()})])===1){CACHES.delete(g.ws);return;}}
 throw new Error('Concurrent connector update; retry');
}
// Owner-visible state derives from grants, never from a stale heartbeat alone.
async function connectionState(a){
 if(a.hosted)return {status:'not_applicable',persistent:false};
 if(a.status!=='active')return {status:'revoked',persistent:false};
 const gateway=await getJ('fm:gatewaySeen:'+a.id);
 if(a.connectionMode==='gateway')return gateway&&gateway.epoch===(a.oauthEpoch||0)?{status:'active',transport:'gateway',persistent:false,authorizedAt:gateway.seenAt}:{status:'awaiting_bot',transport:'gateway',persistent:false,reason:'gateway_call_pending'};
 const ids=await r(['SMEMBERS','fm:oauth:grants:'+a.id]);
 const grants=(await Promise.all(ids.map(id=>getJ('gl:oauth:grant:'+id)))).filter(g=>g&&g.ws===wsId()&&g.agentId===a.id&&g.epoch===(a.oauthEpoch||0));
 const live=grants.filter(g=>!g.revoked).sort((a,b)=>String(b.renewedAt||b.createdAt).localeCompare(String(a.renewedAt||a.createdAt)));
 if(live.length)return {status:'active',persistent:true,authorizedAt:live[0].createdAt,lastRenewedAt:live[0].renewedAt||null};
 const failed=grants.filter(g=>g.failureReason).sort((a,b)=>String(b.failedAt).localeCompare(String(a.failedAt)))[0];
 const seen=a.lastSeen||await r(['GET','fm:seen:'+a.id]),legacy=await getJ('fm:oauth:legacy:'+a.id),knownLegacy=legacy&&legacy.epoch===(a.oauthEpoch||0);
 return {status:failed||knownLegacy||ids.length?'needs_reauth':seen?'verification_pending':'awaiting_bot',persistent:seen&&!failed&&!knownLegacy&&!ids.length?null:false,reason:failed?failed.failureReason:knownLegacy||ids.length?'persistent_grant_missing':seen?'grant_index_not_verified':'authorization_pending',failedAt:failed?failed.failedAt:null,reconnectEndpoint:'/api/agents/'+a.id+'/reconnect',requiresClientParameters:true};
}
async function reconnectAgent(id,body){
 const a=await getJ('fm:agent:'+id);if(!a)return {status:404,body:{error:'not_found'}};
 if(a.status!=='active'||a.hosted)return {status:409,body:{error:'bot_not_available'}};
 if(!body.client_id||!body.redirect_uri||!body.code_challenge)return {status:409,body:{error:'client_reconnect_required',agentId:id,requires:['client_id','redirect_uri','code_challenge','code_challenge_method'],connection:await connectionState(a)}};
 const client=await getJ('gl:oauth:client:'+body.client_id);
 if(!client||!client.redirect_uris.includes(body.redirect_uri)||body.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(body.code_challenge))return {status:400,body:{error:'invalid_client_parameters'}};
 const params=new URLSearchParams({client_id:body.client_id,redirect_uri:body.redirect_uri,response_type:'code',code_challenge_method:'S256',code_challenge:body.code_challenge,scope:'blackbox.bot',resource:OAUTH_ORIGIN+'/api/mcp',agent_id:id});
 if(body.state)params.set('state',String(body.state));
 return {status:200,body:{agentId:id,authorizationUrl:OAUTH_ORIGIN+'/oauth/authorize?'+params.toString(),createsBot:false}};
}
async function oauthRoutes(req,res,path,body){
 const send=(n,b)=>res.status(n).json(b),url=new URL(req.url,OAUTH_ORIGIN),params=Object.fromEntries(url.searchParams);
 if(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/api/mcp')return send(200,{resource:OAUTH_ORIGIN+'/api/mcp',authorization_servers:[OAUTH_ORIGIN],scopes_supported:['blackbox.bot'],bearer_methods_supported:['header']});
 if(path==='/.well-known/oauth-authorization-server')return send(200,{issuer:OAUTH_ORIGIN,authorization_endpoint:OAUTH_ORIGIN+'/oauth/authorize',token_endpoint:OAUTH_ORIGIN+'/api/oauth/token',registration_endpoint:OAUTH_ORIGIN+'/api/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['blackbox.bot']});
 if(path==='/oauth/register'&&req.method==='POST'){
 if(!Array.isArray(body.redirect_uris)||body.redirect_uris.length<1||body.redirect_uris.length>5||!body.redirect_uris.every(validRedirect))return send(400,{error:'invalid_redirect_uri'});
 const ip=String(req.headers['x-forwarded-for']||'local').split(',')[0],n=await r(['INCRBY','gl:oauth:rate:'+sha(ip),1]);await r(['EXPIRE','gl:oauth:rate:'+sha(ip),3600]);if(n>30)return send(429,{error:'rate_limited'});
 const c={client_id:rid('client'),client_name:String(body.client_name||'MCP client').slice(0,100),redirect_uris:body.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']};await setJ('gl:oauth:client:'+c.client_id,c);return send(201,c);
 }
 if(path==='/oauth/context'&&req.method==='GET'){
 const c=await getJ('gl:oauth:client:'+params.client_id);if(!c||!c.redirect_uris.includes(params.redirect_uri)||params.response_type!=='code'||params.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge||''))return send(400,{error:'Invalid sign-in request. Return to your bot and reconnect.'});
 if(params.scope&&params.scope!=='blackbox.bot')return send(400,{error:'invalid_scope'});
 if(params.resource&&params.resource!==OAUTH_ORIGIN+'/api/mcp')return send(400,{error:'invalid_target'});
 const sess=await getSession(req);if(!sess)return send(401,{error:'auth'});
 const csrf=crypto.randomBytes(24).toString('hex');await setJ('gl:oauth:consent:'+sha(csrf),{ws:sess.ws,params,expires:Date.now()+600000});
 const bots=await als.run({ws:sess.ws},listAgents);if(params.agent_id&&!bots.some(a=>a.id===params.agent_id&&a.status==='active'&&!a.hosted))return send(400,{error:'bot_not_available'});return send(200,{client:c.client_name,redirectOrigin:new URL(params.redirect_uri).origin,bots:bots.filter(a=>a.status==='active'&&!a.hosted&&(!params.agent_id||a.id===params.agent_id)).map(a=>({id:a.id,name:a.name,provider:a.provider})),csrf});
 }
 if(path==='/oauth/consent'&&req.method==='POST'){
 if(req.headers.origin!==OAUTH_ORIGIN)return send(403,{error:'origin'});
 const sess=await getSession(req),key='gl:oauth:consent:'+sha(String(body.csrf||'')),raw=await r(['GET',key]),v=raw&&JSON.parse(raw);
 if(!sess||!v||v.ws!==sess.ws||v.expires<Date.now())return send(403,{error:'Sign-in expired. Reconnect from your bot.'});
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({used:true})]);if(won!==1)return send(409,{error:'Already authorized'});
 if(v.params.agent_id&&body.agentId!==v.params.agent_id)return send(400,{error:'Choose the existing bot being reconnected'});
 const a=await als.run({ws:sess.ws},()=>getJ('fm:agent:'+body.agentId));if(!a||a.status!=='active'||a.hosted)return send(400,{error:'Choose an existing external bot'});
 const token='fm_oauth_'+crypto.randomBytes(32).toString('hex'),code=crypto.randomBytes(32).toString('hex');
 await setJ('gl:oauth:code:'+sha(code),{ws:sess.ws,agentId:a.id,clientId:v.params.client_id,redirect:v.params.redirect_uri,challenge:v.params.code_challenge,epoch:a.oauthEpoch||0,expires:Date.now()+120000,token:enc(token)});
 const target=new URL(v.params.redirect_uri);target.searchParams.set('code',code);if(v.params.state)target.searchParams.set('state',v.params.state);return send(200,{redirect:target.toString()});
 }
 if(path==='/oauth/token'&&req.method==='POST'){
 res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');
 if(body.resource&&body.resource!==OAUTH_ORIGIN+'/api/mcp')return send(400,{error:'invalid_target'});
 if(body.scope&&body.scope!=='blackbox.bot')return send(400,{error:'invalid_scope'});
 if(body.grant_type==='refresh_token'){
 const hash=sha(String(body.refresh_token||'')),ref=await getJ('gl:oauth:refresh:'+hash);
 if(!ref||ref.clientId!==body.client_id)return send(400,{error:'invalid_grant'});
 const key='gl:oauth:grant:'+ref.grantId,raw=await r(['GET',key]),grant=raw&&JSON.parse(raw);
 if(!grant||grant.revoked)return send(400,{error:'invalid_grant'});
 await als.run({ws:grant.ws},()=>r(['SADD','fm:oauth:grants:'+grant.agentId,ref.grantId]));CACHES.delete(grant.ws);
 const a=await als.run({ws:grant.ws},()=>getJ('fm:agent:'+grant.agentId));
 if(!a||a.status!=='active'||grant.epoch!==(a.oauthEpoch||0))return send(400,{error:'invalid_grant'});
 if(grant.current!==hash){await revokeOAuthGrant(ref.grantId);return send(400,{error:'invalid_grant'});}
 const refresh='fm_refresh_'+crypto.randomBytes(32).toString('hex'),nextHash=sha(refresh),token='fm_oauth_'+crypto.randomBytes(32).toString('hex');
 await setJ('gl:oauth:refresh:'+nextHash,{grantId:ref.grantId,clientId:grant.clientId});
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({...grant,current:nextHash,renewedAt:now()})]);
 if(won!==1){await r(['DEL','gl:oauth:refresh:'+nextHash]);await revokeOAuthGrant(ref.grantId);return send(400,{error:'invalid_grant'});}
 await setJ('gl:oauth:token:'+sha(token),{ws:grant.ws,agentId:grant.agentId,grantId:ref.grantId,epoch:grant.epoch,expires:Date.now()+3600000});
 return send(200,{access_token:token,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:'blackbox.bot'});
 }
 if(body.grant_type!=='authorization_code')return send(400,{error:'unsupported_grant_type'});
 if(!/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier||''))return send(400,{error:'invalid_grant'});
 const key='gl:oauth:code:'+sha(String(body.code||'')),raw=await r(['GET',key]),c=raw&&JSON.parse(raw),challenge=crypto.createHash('sha256').update(body.code_verifier).digest('base64url');
 if(!c||c.used||c.expires<Date.now()||c.clientId!==body.client_id||c.redirect!==body.redirect_uri||c.challenge!==challenge)return send(400,{error:'invalid_grant'});
 const a=await als.run({ws:c.ws},()=>getJ('fm:agent:'+c.agentId));if(!a||a.status!=='active'||(c.epoch||0)!==(a.oauthEpoch||0))return send(400,{error:'invalid_grant'});
 const won=await r(['EVAL',AGENT_CAS,1,key,raw,JSON.stringify({used:true})]);if(won!==1)return send(400,{error:'invalid_grant'});
 const token=dec(c.token),refresh='fm_refresh_'+crypto.randomBytes(32).toString('hex'),hash=sha(refresh),grantId=rid('grant'),epoch=a.oauthEpoch||0;
 await setJ('gl:oauth:grant:'+grantId,{ws:c.ws,agentId:c.agentId,clientId:c.clientId,epoch,current:hash,createdAt:now(),revoked:false});
 await als.run({ws:c.ws},()=>r(['SADD','fm:oauth:grants:'+c.agentId,grantId]));CACHES.delete(c.ws);
 await setJ('gl:oauth:refresh:'+hash,{grantId,clientId:c.clientId});
 await setJ('gl:oauth:token:'+sha(token),{ws:c.ws,agentId:c.agentId,grantId,epoch,expires:Date.now()+3600000});
 return send(200,{access_token:token,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:'blackbox.bot'});
 }
 return send(404,{error:'not found'});
}

// ---------- http ----------
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const path = (req.url || '').split('?')[0].replace(/^\/api/, '').replace(/\/$/, '') || '/';
  let body = req.body; if (typeof body === 'string') { try { body = /application\/x-www-form-urlencoded/.test(req.headers['content-type']||'') ? Object.fromEntries(new URLSearchParams(body)) : JSON.parse(body); } catch { body = {}; } } body = body || {};
  try {
    if(path.startsWith('/oauth/')||path.startsWith('/.well-known/'))return await oauthRoutes(req,res,path,body);
    if (path === '/health') return res.json({ ok: true, store: URL_ ? 'upstash' : 'memory', time: now(), v: 14 });
    if (path === '/me' || path.startsWith('/auth/')) return await handleAuth(req, res, path, body);
    if (path.startsWith('/gateway') || path === '/ingest' || path === '/mcp') {
      const ra = await resolveAgent(req);
      if(!ra&&path==='/mcp')res.setHeader('WWW-Authenticate','Bearer resource_metadata="'+OAUTH_ORIGIN+'/.well-known/oauth-protected-resource/api/mcp"');
      if (!ra) return path === '/mcp' ? res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unknown or invalid agent key' } }) : res.status(401).json({ status: 'unauthorized', reason: 'Unknown or invalid agent key' });
      req.gatewayKeyAuth=!!ra.apiKey;
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
      if(req.gatewayKeyAuth&&agent.status==='active'&&!await r(['GET','fm:kill'])&&((path==='/gateway/presence'&&req.method==='POST')||(path==='/gateway/tasks/next'&&req.method==='GET'))){const prior=await getJ('fm:gatewaySeen:'+agent.id);await setJ('fm:gatewaySeen:'+agent.id,{seenAt:now(),epoch:agent.oauthEpoch||0});await touchAgent(agent);if(!prior||prior.epoch!==(agent.oauthEpoch||0))await event(agent.id,'interaction','HTTP gateway connected',{kind:'INTERACTION',source:'gateway'});}
      if(path==='/gateway/card-proposals'&&req.method==='POST')return send(await cardPropose(await getJ('fm:agent:'+agent.id),body));
      if(path==='/gateway/spend-requests'&&req.method==='POST')return send(await newSpendRequest(agent,body));
      {const sm=path.match(/^\/gateway\/spend-requests\/(spend_[a-f0-9]+)$/);if(sm&&req.method==='GET'){const q=await getJ('fm:spendRequest:'+sm[1]);return q&&q.agentId===agent.id?res.json({request:q}):res.status(404).json({error:'not found'});}}
      if (path === '/gateway/chat-task' && req.method === 'POST') return send(await chatTask(agent,body));
      if (path === '/gateway/presence' && req.method === 'POST') {if(agent.status!=='active'||await r(['GET','fm:kill']))return res.status(403).json({status:'blocked'});await touchAgent(agent);await event(agent.id,'interaction','Available: interacting with owner',{kind:'INTERACTION',source:'chat'});return res.json({status:'ok'});}
      {const tm=path.match(/^\/gateway\/tasks\/(\w+)$/);if(tm&&tm[1]!=='next'&&req.method==='GET'){const t=await taskForAgent(agent,tm[1]);return t?res.json({task:t}):res.status(404).json({error:'not found'});}}
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
    if(path==='/cards'&&req.method==='GET')return res.json(await cardData());
    if(path==='/cards/control'&&req.method==='POST')return send(await cardControl(body));
    if(path==='/cards/proposals'&&req.method==='POST')return send(await cardPropose(await getJ('fm:agent:'+body.botId),body));
    {const cm=path.match(/^\/cards\/(card_[a-f0-9]+)\/(approve|deny)$/);if(cm&&req.method==='POST')return send(await cardDecision(cm[1],cm[2],body.detailsHash));}

    if (path === '/tasks' && req.method === 'POST') { if (!String(body.title || '').trim()) return res.status(400).json({ error: 'title required' }); await track('first_task_started'); return res.json({ task: await newTask({ title: body.title, brief: body.brief, assignee: body.assignee }) }); }
    if(path==='/money'&&req.method==='GET')return res.json(await spendSummary());
    {const sm=path.match(/^\/money\/(spend_[a-f0-9]+)\/(approve|deny)$/);if(sm&&req.method==='POST')return send(await reviewSpend(sm[1],sm[2],body.detailsHash));}
    {const cm=path.match(/^\/agents\/(\w+)\/(connection|reconnect)$/);if(cm){if(cm[2]==='connection'&&req.method==='GET'){const a=await getJ('fm:agent:'+cm[1]);return a?res.json({agentId:a.id,connection:await connectionState(a)}):res.status(404).json({error:'not_found'});}if(cm[2]==='reconnect'&&req.method==='POST'){if(req.headers.origin!==OAUTH_ORIGIN)return res.status(403).json({error:'origin'});return send(await reconnectAgent(cm[1],body));}return res.status(405).json({error:'method_not_allowed'});}}
    if (path === '/state') return res.json(await fullState());
    let m;
    if ((m = path.match(/^\/requests\/(\w+)\/(approve|deny)$/)) && req.method === 'POST') { const d = await decide(m[1], m[2]); if (d.status === 200) await track('approval_completed'); return send(d); }
    {const km=path.match(/^\/agents\/(\w+)\/gateway-key$/);if(km&&req.method==='POST'){
      if(req.headers.origin!==origin)return res.status(403).json({error:'origin'});
      const a=await getJ('fm:agent:'+km[1]);if(!a||a.status!=='active'||a.hosted)return res.status(409).json({error:'bot_not_available'});
      if(await r(['GET','fm:kill']))return res.status(403).json({error:'Workspace is paused'});
      const lock=crypto.randomBytes(12).toString('hex'),lockKey='fm:gatewayKeyLock:'+a.id;if(!await r(['SET',lockKey,lock,'NX','PX',30000]))return res.status(409).json({error:'Key rotation already in progress; retry'});
      try{const oldHash=await r(['GET','fm:gatewayKeyHash:'+a.id]);
      const key='fmk_'+crypto.randomBytes(20).toString('hex'),hash=sha(key);
      const updated=await updateAgent(a.id,x=>{if(x.status!=='active')throw new Error('Bot revoked during setup');x.connectionMode='gateway';x.keyHint=key.slice(0,8)+'...'+key.slice(-4);});
      if(oldHash)await r(['DEL','fm:key:'+oldHash,'gl:key:'+oldHash]);await r(['SET','fm:gatewayKeyHash:'+a.id,hash]);
      await r(['SET','fm:key:'+hash,a.id]);await r(['SET','gl:key:'+hash,wsId()]);await r(['DEL','fm:gatewaySeen:'+a.id,'fm:seen:'+a.id]);bust();
      res.setHeader('Cache-Control','no-store');return res.json({agent:updated,key,connectionStatus:'awaiting_bot'});
      }finally{if(await r(['GET',lockKey])===lock)await r(['DEL',lockKey]);}
    }}
    if (path === '/agents' && req.method === 'POST') { const c = await createAgent(body.name, body.role, body.provider); return res.json(c); }
    if ((m = path.match(/^\/agents\/(\w+)\/(revoke|restore|permissions|limits|room)$/)) && req.method === 'POST') {
      const op=m[2];
      const rooms={ops:'Execution Center',sales:'Outreach Center',marketing:'Creative / Marketing',finance:'Research Center',support:'Outreach Center',lounge:'Lounge'};
      if(op==='room' && !Object.prototype.hasOwnProperty.call(rooms,body.room))return res.status(400).json({error:'Choose a valid room'});
      if(op==='permissions' && (!ACTIONS[body.action] || !['AUTO','ASK','NEVER'].includes(body.mode)))return res.status(400).json({error:'bad input'});
      const a=await updateAgent(m[1],a=>{
        if(op==='room'){a.room=body.room;}
        if(op==='revoke'){a.status='revoked';a.revokedAt=now();a.oauthEpoch=(a.oauthEpoch||0)+1;}
        if(op==='restore'){a.status='active';delete a.revokedAt;}
        if(op==='permissions'){a.permissions={...(a.permissions||{}),[body.action]:body.mode};}
        if(op==='limits'){a.limits={perActionCents:body.perActionCents==null?null:+body.perActionCents,dailyCents:body.dailyCents==null?null:+body.dailyCents};}
      });if(!a)return res.status(404).json({error:'not found'});
      if (m[2] === 'revoke') { await event(a.id, 'revoked', `Owner revoked ${a.name}'s access`); 
        // pending requests of this agent are cancelled immediately
        for (const id of await r(['SMEMBERS', 'fm:reqs'])) { const q = await getJ('fm:req:' + id); if (q && q.agentId === a.id && q.status === 'pending') { q.status = 'blocked'; q.reason = 'Access revoked while pending'; q.decidedAt = now(); await finishReq(q); await receipt(a, q.action, q.params, 'blocked', 0, 'BLOCKED: access revoked while request was pending', q.id, { code: 'revoked' }); } } }
      if (m[2] === 'restore') { await event(a.id, 'restored', `Owner restored ${a.name}'s access`); }
      if (m[2] === 'permissions') { await event(a.id, 'permission', `${body.action} set to ${body.mode}`); }
      if (m[2] === 'limits') { await event(a.id, 'limits', `Limits set: per action ${a.limits.perActionCents}c, daily ${a.limits.dailyCents}c`); }
      if(op==='room')await event(a.id,'room_changed','Moved to '+rooms[a.room],{room:a.room});
      return res.json({ agent: a });
    }
    if ((m = path.match(/^\/agents\/(\w+)\/remove$/)) && req.method === 'POST') { const a = await getJ('fm:agent:' + m[1]); if (!a || a.live) return res.status(400).json({ error: 'cannot remove' }); await updateAgent(a.id,x=>{x.status='revoked';x.revokedAt=now();x.oauthEpoch=(x.oauthEpoch||0)+1;}); bust(); await r(['SREM', 'fm:agents', a.id]); await r(['DEL', 'fm:secret:' + a.id]); return res.json({ removed: true }); }
    if (path === '/kill' && req.method === 'POST') { bust(); if (body.on) await r(['SET', 'fm:kill', '1']); else await r(['DEL', 'fm:kill']); await event(null, 'kill', body.on ? 'KILL SWITCH ON: all agents stopped' : 'Kill switch off'); return res.json({ killed: !!body.on }); }
    // --- v11: one connect flow for every provider. Hosted providers (Grok) need only a pasted key; the rest get one message to paste. ---
    if (path === '/connect' && req.method === 'POST') {
      const prov = String(body.provider || 'custom'); const name = String(body.name || '').trim() || (prov === 'grok' ? 'Grok' : 'AI employee');
      const preset = PRESETS[body.preset] ? body.preset : 'balanced'; const base = origin;
      if (prov === 'muse' && body.connectionMode !== 'existing') {
        let k = String(body.apiKey || '').trim().replace(/^MODEL_API_KEY=/i, '').replace(/^Bearer\s+/i, '').trim(); if (k.length > 1 && ((k[0] === '"' && k.endsWith('"')) || (k[0] === "'" && k.endsWith("'")))) k = k.slice(1, -1).trim();
        if (!/^LLM(?:_[^\s_|]+_[^\s|]+|\|[^\s|]+\|[^\s|]+)$/.test(k)) return res.status(400).json({ error: 'Paste your Meta Model API key from dev.meta.ai. It starts with LLM_ (LLM_<id>_<secret>).' });
        let models; try { models = await museModels(k); } catch (e) { return res.status(400).json({ error: e.message }); }
        if (!models.length) return res.status(400).json({ error: 'This Meta account has no available Muse Spark text model. Check model access in the Meta dashboard.' });
        const requested = String(body.model || '');
        const model = requested || (models.includes('muse-spark-1.3') ? 'muse-spark-1.3' : models.find(x => !x.includes('contributor')) || models[0]);
        if (!models.includes(model)) return res.status(400).json({ error: 'That Muse Spark model is not available to this key.' });
        if (body.check) return res.json({ ok: true, model, validation: 'read-only model list' });
        const c = await createAgent(name, String(body.role || '').trim() || 'Muse Spark employee', 'muse', false, { preset, hosted: true, model });
        await r(['SET', 'fm:secret:' + c.agent.id, enc(k)]);
        await track('connected', { provider: 'muse' }); return res.json({ agent: c.agent, hosted: true, noFirstTask: true });
      }
      if (prov === 'grok' && body.connectionMode !== 'existing') {
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
      await track('connected', { provider: prov }); return res.json({ agent: c.agent, hosted: false, noFirstTask: true, connectionStatus: 'awaiting_bot', instructions: msg, mcpUrl: base + '/api/mcp', key: c.key });
    }
    if (path === '/track' && req.method === 'POST') { if (['connect_started', 'first_task_started', 'approval_shown'].includes(body.step)) await track(body.step, body.provider ? { provider: String(body.provider).slice(0, 20) } : null); return res.json({ ok: true }); }
    // --- live demo agent ---
    if (wsId() !== 'legacy' && path.startsWith('/demo/')) return res.status(404).json({ error: 'not found' });
    if (path === '/demo/scout/tick' && req.method === 'POST') return res.json(await scoutTick(origin));
    if (path === '/demo/scout/state') return res.json({ ...(await getJ('fm:scout:state') || {}), agentId: await r(['GET', 'fm:scout:id']) });
    return res.status(404).json({ error: 'not found', path });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
