// Foreman persistent worker (free): runs in GitHub Actions on a schedule, no browser tab, no task agent.
// It is a plain external agent: it only knows Foreman. Claims tasks, reports events, calls a real LLM
// provider (xAI Grok API) for the work, completes the task through Foreman. Gated actions go through /api/gateway/act.
// Env: FOREMAN_URL, FOREMAN_KEY (agent key), XAI_API_KEY, XAI_MODEL (default grok-4.3), MAX_TASKS (default 3)
const BASE = (process.env.FOREMAN_URL || 'https://foreman-core.vercel.app').replace(/\/$/, '');
const KEY = process.env.FOREMAN_KEY, XKEY = process.env.XAI_API_KEY;
const MODEL = process.env.XAI_MODEL || 'grok-4.3';
const H = { 'content-type': 'application/json', authorization: 'Bearer ' + KEY };
const fm = async (path, method, body) => { const r = await fetch(BASE + '/api' + path, { method: method || 'GET', headers: H, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const ev = (kind, text, task_id) => fm('/gateway/events', 'POST', { kind, text, task_id });
async function grok(prompt) {
  const r = await fetch('https://api.x.ai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + XKEY },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: 'You are a Grok worker inside Foreman. Do the task using only the context given. Be concise and factual.' }, { role: 'user', content: prompt }] }) });
  const j = await r.json(); if (!r.ok) throw new Error('xAI ' + r.status + ': ' + JSON.stringify(j).slice(0, 200));
  return j.choices[0].message.content;
}
(async () => {
  if (!KEY) { console.log('FOREMAN_KEY missing'); process.exit(1); }
  if (!XKEY) { console.log('XAI_API_KEY not set: not claiming tasks'); return; }
  let n = 0;
  for (; n < +(process.env.MAX_TASKS || 3); n++) {
    const c = await fm('/gateway/tasks/next');
    if (c.status === 403) { console.log('revoked: stopping'); return; }
    const t = c.body.task; if (!t) { console.log('no task'); return; }
    console.log('claimed', t.id, t.title);
    if (!XKEY) { await fm('/gateway/tasks/' + t.id + '/complete', 'POST', { status: 'failed', result: 'Worker has no XAI_API_KEY configured.' }); continue; }
    try {
      await ev('TOOL_USED', 'Calling Grok (' + MODEL + ')', t.id);
      const out = await grok('Task: ' + t.title + '\nBrief: ' + t.brief + (t.context ? '\nContext from previous agent (via Foreman):\n' + t.context : ''));
      await fm('/gateway/tasks/' + t.id + '/complete', 'POST', { result: out });
      // External action through Foreman's gate (notes.write is ASK by default): pause until the owner decides.
      const a = await fm('/gateway/act', 'POST', { action: 'notes.write', params: { title: 'Grok result: ' + t.title.slice(0, 60), text: out.slice(0, 1500) } });
      console.log('act', a.status, a.body.status);
      if (a.status === 202 && a.body.request_id) {
        const until = Date.now() + 170000;
        while (Date.now() < until) { await new Promise(r => setTimeout(r, 5000)); const q = await fm('/gateway/requests/' + a.body.request_id); const st = q.body.status; if (st && st !== 'pending') { console.log('request resolved:', st); break; } }
      }
    } catch (e) { await fm('/gateway/tasks/' + t.id + '/complete', 'POST', { status: 'failed', result: String(e.message).slice(0, 500) }); }
  }
})();
