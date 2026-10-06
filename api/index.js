// Foreman core: real permission gateway. Agents hold only a Foreman key; every action goes through /api/gateway/act.
const crypto = require('crypto');

// ---------- storage (Upstash/Vercel KV REST; memory fallback for local dev only) ----------
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = global.__mem || (global.__mem = { kv: new Map(), lists: new Map() });
async function r(cmd) {
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
    case 'DEL': mem.kv.delete(k); mem.lists.delete(k); return 1;
  }
  throw new Error('memcmd ' + op);
}
let STATE_CACHE = null, SEEDED = false;
const bust = () => { STATE_CACHE = null; };
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
};
const DEFAULT_PERMS = { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER' };

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
  throw new Error('unknown action');
}

// ---------- core ----------
async function listAgents() { const ids = await r(['SMEMBERS', 'fm:agents']); if (!ids.length) return []; const vs = await r(['MGET', ...ids.map(i => 'fm:agent:' + i)]); return vs.filter(Boolean).map(v => JSON.parse(v)).sort((x, y) => x.createdAt < y.createdAt ? -1 : 1); }
async function event(agentId, type, text, extra) { bust(); const e = { id: rid('ev'), at: now(), agentId, type, text, ...extra }; await r(['LPUSH', 'fm:events', JSON.stringify(e)]); await r(['LTRIM', 'fm:events', 0, 299]); return e; }
async function spentToday(agentId) { return parseInt((await r(['GET', `fm:spend:${agentId}:${now().slice(0, 10)}`])) || '0', 10); }
async function receipt(agent, action, params, outcome, cost, summary, reqId, extra) { bust();
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

async function authAgent(req) {
  const h = req.headers['authorization'] || ''; const key = h.replace(/^Bearer\s+/i, '').trim(); if (!key) return null;
  const id = await r(['GET', 'fm:key:' + sha(key)]); if (!id) return null;
  return getJ('fm:agent:' + id);
}

async function gatewayAct(agent, body) {
  const action = body.action, params = body.params || {};
  if (!agent.lastSeen || Date.now() - Date.parse(agent.lastSeen) > 20000) { agent.lastSeen = now(); await setJ('fm:agent:' + agent.id, agent); }
  const mode = (agent.permissions || {})[action] || 'NEVER';
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
  if (STATE_CACHE && Date.now() - STATE_CACHE.t < 1500) return STATE_CACHE.v;
  const agents = await listAgents();
  const ids = await r(['SMEMBERS', 'fm:reqs']);
  const parse = a => (a || []).filter(Boolean).map(x => JSON.parse(x));
  const pend = ids.length ? parse(await r(['MGET', ...ids.map(i => 'fm:req:' + i)])).map(pub) : [];
  const hist = parse(await r(['LRANGE', 'fm:reqhist', 0, 14]));
  const day = now().slice(0, 10);
  const sp = agents.length ? await r(['MGET', ...agents.map(a => `fm:spend:${a.id}:${day}`)]) : [];
  const agentsPub = agents.map((a, i) => ({ ...a, spentTodayCents: parseInt(sp[i] || '0', 10) }));
  const [kill, receipts, events, notes] = await Promise.all([r(['GET', 'fm:kill']), r(['LRANGE', 'fm:receipts', 0, 59]), r(['LRANGE', 'fm:events', 0, 79]), r(['LRANGE', 'fm:notes', 0, 9])]);
  const v = { now: now(), killed: !!kill, actions: ACTIONS, agents: agentsPub, requests: [...pend, ...hist].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1), receipts: parse(receipts), events: parse(events), notes: parse(notes) };
  STATE_CACHE = { t: Date.now(), v }; return v;
}
async function finishReq(q) { bust(); await setJ('fm:req:' + q.id, q); await r(['SREM', 'fm:reqs', q.id]); await r(['LPUSH', 'fm:reqhist', JSON.stringify(pub(q))]); await r(['LTRIM', 'fm:reqhist', 0, 29]); }
async function createAgent(name, role) {
  const id = rid('agent'); const key = 'fmk_' + crypto.randomBytes(20).toString('hex');
  const agent = { id, name: String(name || 'Agent').slice(0, 40), role: String(role || '').slice(0, 60), provider: 'Foreman Demo Agent', status: 'active', permissions: { ...DEFAULT_PERMS }, limits: { perActionCents: 10, dailyCents: 50 }, createdAt: now(), lastSeen: null, keyHint: key.slice(0, 8) + '...' + key.slice(-4) };
  bust(); await setJ('fm:agent:' + id, agent); await r(['SET', 'fm:key:' + sha(key), id]); await r(['SADD', 'fm:agents', id]);
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
  if (SEEDED) return; if (await r(['GET', 'fm:seeded'])) { SEEDED = true; return; } SEEDED = true;
  const { agent, key } = await createAgent('Scout', 'Research agent (live)');
  agent.provider = 'Foreman live agent'; agent.live = true; await setJ('fm:agent:' + agent.id, agent);
  await r(['SET', 'fm:scout:key', key]); await r(['SET', 'fm:scout:id', agent.id]); await r(['SET', 'fm:seeded', '1']);
}

// ---------- http ----------
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const path = (req.url || '').split('?')[0].replace(/^\/api/, '').replace(/\/$/, '') || '/';
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  const send = (o) => res.status(o.status).json(o.body);
  const origin = (/^localhost/.test(req.headers.host) ? 'http://' : 'https://') + req.headers.host;
  try {
    await seed();
    if (path === '/health') return res.json({ ok: true, store: URL_ ? 'upstash' : 'memory', time: now() });
    // --- agent-facing gateway ---
    if (path.startsWith('/gateway')) {
      const agent = await authAgent(req);
      if (!agent) return res.status(401).json({ status: 'unauthorized', reason: 'Unknown or invalid agent key' });
      if (path === '/gateway/act' && req.method === 'POST') return send(await gatewayAct(agent, body));
      const m = path.match(/^\/gateway\/requests\/(\w+)$/);
      if (m) { const q = await getJ('fm:req:' + m[1]); if (!q || q.agentId !== agent.id) return res.status(404).json({ error: 'not found' }); return res.json(pub(q)); }
      return res.status(404).json({ error: 'not found' });
    }
    // --- owner-facing ---
    if (path === '/state') return res.json(await fullState());
    let m;
    if ((m = path.match(/^\/requests\/(\w+)\/(approve|deny)$/)) && req.method === 'POST') return send(await decide(m[1], m[2]));
    if (path === '/agents' && req.method === 'POST') { const c = await createAgent(body.name, body.role); return res.json(c); }
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
    if ((m = path.match(/^\/agents\/(\w+)\/remove$/)) && req.method === 'POST') { const a = await getJ('fm:agent:' + m[1]); if (!a || a.live) return res.status(400).json({ error: 'cannot remove' }); a.status = 'revoked'; await setJ('fm:agent:' + a.id, a); bust(); await r(['SREM', 'fm:agents', a.id]); return res.json({ removed: true }); }
    if (path === '/kill' && req.method === 'POST') { bust(); if (body.on) await r(['SET', 'fm:kill', '1']); else await r(['DEL', 'fm:kill']); await event(null, 'kill', body.on ? 'KILL SWITCH ON: all agents stopped' : 'Kill switch off'); return res.json({ killed: !!body.on }); }
    // --- live demo agent ---
    if (path === '/demo/scout/tick' && req.method === 'POST') return res.json(await scoutTick(origin));
    if (path === '/demo/scout/state') return res.json({ ...(await getJ('fm:scout:state') || {}), agentId: await r(['GET', 'fm:scout:id']) });
    return res.status(404).json({ error: 'not found', path });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
