// Foreman v9 e2e: external agent via HTTP gateway + MCP adapter + work bus. usage: node e2e9.js <base>
const B = process.argv[2] || 'http://localhost:3999'; let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const j = async (p, m, b, key) => { const r = await fetch(B + p, { method: m || 'GET', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) }, body: b ? JSON.stringify(b) : undefined }); let o = {}; try { o = await r.json(); } catch {} return { http: r.status, ...o, o }; };
(async () => {
  const A = await j('/api/agents', 'POST', { name: 'E2E-A', role: 'test', provider: 'custom' }), B2 = await j('/api/agents', 'POST', { name: 'E2E-B', role: 'test', provider: 'custom' });
  const ka = A.key, kb = B2.key, ia = A.agent.id, ib = B2.agent.id; ok(ka && ia, 'agent created with key');
  let st = (await j('/api/state')).o; ok(st.agents.find(a => a.id === ia), 'agent appears in state'); ok(st.kinds.length === 9, 'event model has 9 kinds');
  ok((await j('/api/gateway/events', 'POST', { kind: 'started', text: 'booting' }, ka)).kind === 'TASK_STARTED', 'adapter normalizes provider vocab');
  st = (await j('/api/state')).o; ok(st.agents.find(a => a.id === ia).state.kind === 'TASK_STARTED', 'live state reflects event');
  const auto = await j('/api/gateway/act', 'POST', { action: 'web.fetch', params: { url: 'https://api.github.com/repos/roycemy/foreman-core' } }, ka); ok(auto.http === 200 && auto.status === 'completed', 'AUTO executes');
  const ask = await j('/api/gateway/act', 'POST', { action: 'notes.write', params: { title: 'e2e9', text: 'x' } }, ka); ok(ask.http === 202 && ask.status === 'pending', 'ASK pauses');
  st = (await j('/api/state')).o; ok(!st.notes.some(n => n.title === 'e2e9'), 'nothing ran while pending');
  const ap = await j('/api/requests/' + ask.request_id + '/approve', 'POST'); ok(ap.request && ap.request.status === 'executed' && ap.receipt, 'approve resumes and receipts');
  st = (await j('/api/state')).o; ok(st.notes.some(n => n.title === 'e2e9'), 'approved action really ran');
  const nv = await j('/api/gateway/act', 'POST', { action: 'notes.delete', params: {} }, ka); ok(nv.http === 403 && nv.code === 'never', 'NEVER blocks');
  // MCP
  const m = (method, params, id) => j('/api/mcp', 'POST', { jsonrpc: '2.0', id: id || 1, method, params }, kb);
  ok((await m('initialize', {})).result.serverInfo.name === 'foreman', 'MCP initialize'); ok((await m('tools/list')).result.tools.length >= 6, 'MCP tools/list');
  const mc = await m('tools/call', { name: 'foreman_notes_delete', arguments: {} }); ok(mc.result.isError === true && /never/.test(mc.result.content[0].text), 'MCP call gated (NEVER)');
  // work bus handoff
  const t = (await j('/api/tasks', 'POST', { title: 'E2E research', brief: 'b', assignee: ia })).task; const nx = await j('/api/gateway/tasks/next', 'GET', null, ka); ok(nx.task && nx.task.id === t.id, 'agent A claims task');
  await j('/api/gateway/tasks/' + t.id + '/complete', 'POST', { result: 'finding: 42' }, ka);
  const h = await j('/api/gateway/act', 'POST', { action: 'work.handoff', params: { task_id: t.id, to: ib, brief: 'write it up' } }, ka); ok(h.http === 200, 'handoff through gateway');
  const nb = await j('/api/gateway/tasks/next', 'GET', null, kb); ok(nb.task && nb.task.context === 'finding: 42' && nb.task.parentId === t.id, 'agent B receives task + context');
  // revoke
  await j('/api/agents/' + ia + '/revoke', 'POST'); const rv = await j('/api/gateway/act', 'POST', { action: 'web.fetch', params: { url: 'https://api.github.com/' } }, ka); ok(rv.http === 403 && rv.code === 'revoked', 'revoke blocks next action');
  ok((await j('/api/gateway/events', 'POST', { kind: 'WAITING' }, ka)).http === 403, 'revoked agent cannot report events');
  st = (await j('/api/state')).o; ok(st.receipts.some(r => r.agentId === ia && r.outcome === 'blocked' && r.code === 'revoked'), 'blocked receipt exists');
  for (const id of [ia, ib]) await j('/api/agents/' + id + '/remove', 'POST');
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
