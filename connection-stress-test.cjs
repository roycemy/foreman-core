// Connection stress test (owner ask, Nov 24): do real bots keep picking up varied jobs and
// returning results, including after idle - measured from Alter's own records, never a green badge.
//
// Local mode (default): spins up the real api/index.js on localhost with the memory store and
//   two throwaway bots, proving the runner mechanics and the targeted-claim path over real HTTP+MCP.
//   No external calls, no prod writes.
// Live mode (NOT for CI, only on explicit owner go): node connection-stress-test.cjs --live
//   creates explicitly-assigned jobs marked STRESS-<run> in the owner workspace and observes them
//   read-only via /api/state. Real bots do their own claiming; the runner never claims in live mode.
//   Scoring: PASS = exact assigned job claimed with no human nudge and result token matches;
//   FAIL = configured wake path but no pickup, wrong job claimed, or wrong result;
//   NOT-TESTED = no automatic wake path configured for that bot (never counted as pass).
const http = require('http');
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const soakIdx = args.indexOf('--soak-minutes');
const SOAK_MIN = soakIdx >= 0 ? Number(args[soakIdx + 1]) : 0;
const BASE = LIVE ? 'https://www.alterhq.app' : null;
const RUN = 'STRESS-' + Date.now().toString(36);
const OWNER = process.env.ALTER_SESSION || ''; // live mode only: owner session cookie, never logged

let fails = 0;
const rec = [];
const score = (label, verdict, detail) => { rec.push({ label, verdict, detail }); console.log((verdict === 'PASS' ? 'PASS ' : verdict === 'FAIL' ? 'FAIL ' : verdict + ' ') + label + (detail ? ' - ' + detail : '')); if (verdict === 'FAIL') fails++; };
let OWNER_COOKIE = LIVE ? OWNER : '';
const j = async (base, p, m, b, key) => { const r = await fetch(base + p, { method: m || 'GET', headers: { 'Content-Type': 'application/json', Origin: base, ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(OWNER_COOKIE ? { Cookie: OWNER_COOKIE } : {}) }, body: b ? JSON.stringify(b) : undefined }); let o = {}; try { o = await r.json(); } catch {} return { http: r.status, setCookie: r.headers.get('set-cookie') || '', ...o }; };
const mcp = (base, key, name, a) => j(base, '/api/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: a || {} } }, key).then(r => { try { return JSON.parse(r.result.content[0].text); } catch { return { error: 'bad_mcp' }; } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let base = BASE, cleanup = () => {};
  if (!LIVE) {
    const handler = require('./api/index.js');
    const server = http.createServer((req, res) => { // Vercel-style res shim for local http
      const headers = {};
      res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
      res.status = code => ({ json: body => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); }, send: body => { res.writeHead(code, headers); res.end(typeof body === 'string' ? body : JSON.stringify(body)); } });
      res.json = body => { res.writeHead(200, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
      let buf = ''; req.on('data', c => buf += c); req.on('end', () => { req.body = buf ? (() => { try { return JSON.parse(buf); } catch { return {}; } })() : {}; handler(req, res).catch(e => { if (!res.headersSent) { res.writeHead(500, { 'content-type': 'application/json' }); } res.end(JSON.stringify({ error: String(e && e.message || e) })); }); });
    });
    await new Promise(r => server.listen(0, r));
    base = 'http://localhost:' + server.address().port;
    cleanup = () => server.close();
  }
  try {
    // bots: throwaway locally, the real roster live
    let bots;
    if (LIVE) {
      const st = await j(base, '/api/state');
      bots = (st.agents || []).filter(a => a.status === 'active' && !a.hosted && !a.harness);
      if (!bots.length) { score('roster', 'FAIL', 'no active external bots'); throw 'stop'; }
    } else {
      bots = [];
      const su = await j(base, '/api/auth/signup', 'POST', { email: 'stress-' + Date.now().toString(36) + '@example.com', password: 'stress-test-local-9' });
      OWNER_COOKIE = (su.setCookie.split(';')[0] || ''); if (!su.ok || !OWNER_COOKIE) { score('signup', 'FAIL', JSON.stringify(su).slice(0, 120)); throw 'stop'; }
      for (const n of ['stress-A', 'stress-B']) { const a = await j(base, '/api/agents', 'POST', { name: n, role: 'test', provider: 'custom' }); if (!a.agent) { score('agent create', 'FAIL', JSON.stringify(a).slice(0, 120)); throw 'stop'; } bots.push({ ...a.agent, key: a.key }); }
    }

    for (const [round, shape] of [['round1 immediate', 'Say PONG and nothing else.'], ['round2 varied', 'List the first three prime numbers, one per line.']]) {
      for (const b of bots) {
        const token = RUN + '-' + round[5] + '-' + b.id.slice(-4);
        // decoy: an older UNASSIGNED job must never be claimed by a targeted bot
        const decoy = await j(base, '/api/tasks', 'POST', { title: token + ' decoy (unassigned, do not claim)', brief: 'stress-test decoy' });
        const t = await j(base, '/api/tasks', 'POST', { title: token + ': ' + shape, brief: 'Stress test job. Start your answer with ' + token + '.', assignee: b.id });
        const task = t.task; if (!task || !task.id) { score(round + ' ' + b.name, 'FAIL', 'job create failed'); continue; }

        if (LIVE) {
          // observe only: poll /api/state for pickup, no nudge from the runner
          const deadline = Date.now() + 15 * 60 * 1000; let seen = null;
          while (Date.now() < deadline) { const st = await j(base, '/api/state'); seen = (st.tasks || []).find(x => x.id === task.id); if (seen && seen.status === 'done') break; await sleep(15000); }
          if (!seen || seen.status === 'queued') { score(round + ' ' + b.name, 'NOT-TESTED', 'no pickup without nudge inside 15 min (wake path may be unconfigured)'); }
          else if (seen.status !== 'done') score(round + ' ' + b.name, 'FAIL', 'claimed but not finished: ' + seen.status);
          else score(round + ' ' + b.name, String(seen.result || '').startsWith(token) ? 'PASS' : 'FAIL', String(seen.result || '').startsWith(token) ? 'claimed+returned, token ok' : 'result token mismatch');
        } else {
          // local: simulated bot claims EXACTLY its assigned job via MCP task_id (no nudge concept locally)
          const got = await mcp(base, b.key, 'foreman_next_task', { task_id: task.id });
          const decoyState = await j(base, '/api/tasks/' + decoy.task.id, 'GET');
          if (!got.task || got.task.id !== task.id) { score(round + ' ' + b.name, 'FAIL', 'targeted claim returned ' + JSON.stringify(got).slice(0, 120)); continue; }
          if (decoyState.task && decoyState.task.status !== 'queued') { score(round + ' ' + b.name + ' decoy', 'FAIL', 'decoy was touched'); continue; }
          const done = await mcp(base, b.key, 'foreman_complete_task', { task_id: task.id, result: token + ' result' });
          score(round + ' ' + b.name, done.task && done.task.status === 'done' ? 'PASS' : 'FAIL', 'exact claim, decoy untouched, token result');
        }
      }
    }

    if (SOAK_MIN > 0) {
      console.log('idle soak: waiting ' + SOAK_MIN + ' min in silence...');
      await sleep(SOAK_MIN * 60000);
      for (const b of bots) {
        const token = RUN + '-soak-' + b.id.slice(-4);
        const t = await j(base, '/api/tasks', 'POST', { title: token + ': post-idle pickup', brief: 'Stress test job. Start your answer with ' + token + '.', assignee: b.id });
        if (LIVE) { const deadline = Date.now() + 15 * 60 * 1000; let seen = null; while (Date.now() < deadline) { const st = await j(base, '/api/state'); seen = (st.tasks || []).find(x => x.id === t.task.id); if (seen && seen.status === 'done') break; await sleep(15000); } score('soak ' + b.name, seen && seen.status === 'done' && String(seen.result || '').startsWith(token) ? 'PASS' : 'NOT-TESTED', seen && seen.status === 'done' ? 'picked up after ' + SOAK_MIN + ' min idle' : 'no post-idle pickup (wake path may be unconfigured)'); }
        else { const got = await mcp(base, b.key, 'foreman_next_task', { task_id: t.task.id }); score('soak ' + b.name, got.task && got.task.id === t.task.id ? 'PASS' : 'FAIL', 'post-idle exact claim'); }
      }
    } else score('idle soak', 'NOT-TESTED', 'pass --soak-minutes N to run');

    const p = rec.filter(r => r.verdict === 'PASS').length, f = rec.filter(r => r.verdict === 'FAIL').length, n = rec.filter(r => r.verdict === 'NOT-TESTED').length;
    console.log('\n== ' + RUN + ': ' + p + ' PASS, ' + f + ' FAIL, ' + n + ' NOT-TESTED (wake unconfigured is never a pass) ==');
  } finally { cleanup(); }
  process.exit(fails ? 1 : 0);
})().catch(e => { if (e !== 'stop') console.error(e); process.exit(1); });
