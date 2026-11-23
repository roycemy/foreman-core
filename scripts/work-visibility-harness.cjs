#!/usr/bin/env node
// Local simulation of the work-visibility flow in a real browser (Playwright/Chromium). LOCAL ONLY, never shipped to the app:
//  - the REAL api/index.js handler runs in a vm on its in-memory store, with a controllable clock; the public/ files are served as they are;
//  - "bots" are scripted callers of the real gateway routes (claim, event, complete). They prove the local state-and-UI path only:
//    they say nothing about any real provider, real pickup, or real handoff reliability;
//  - every outbound request is refused (fetch throws), no env credentials exist, so no email, push, provider or store call can happen;
//  - the page gets a fixed "SIMULATED" label injected by this script. The app itself contains no simulation switch.
// Usage: node scripts/work-visibility-harness.cjs <repo root> <screenshot dir>
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), http = require('http'), assert = require('assert');
const ROOT = path.resolve(process.argv[2] || '.'), OUT = path.resolve(process.argv[3] || 'screens'); fs.mkdirSync(OUT, { recursive: true });
let off = 0; class FD extends Date { constructor(...a) { if (a.length) super(...a); else super(Date.now() + off); } static now() { return Date.now() + off; } }
const API = path.join(ROOT, 'api/index.js'), src = 'Date=FD;' + fs.readFileSync(API, 'utf8') + '\nmodule.exports.t={setJ,getJ,sha,als,createAgent,r};';
const outbound = [];
const ctx = { FD, require: require('module').createRequire(API), module: { exports: {} }, process: { env: {} }, global: {}, console: { log() { }, warn() { }, error() { } }, fetch: async u => { outbound.push(String(u)); throw new Error('NO NETWORK ' + u); }, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, AbortSignal, Buffer, TextEncoder, TextDecoder };
vm.runInNewContext(src, ctx); const h = ctx.module.exports, f = h.t;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
let stateDown = false;
const srv = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', async () => {
  if (req.url.startsWith('/api/')) {
    if (stateDown && req.url.startsWith('/api/state')) { res.statusCode = 503; res.setHeader('content-type', 'application/json'); return res.end('{"error":"simulated outage"}'); }
    const out = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, json(j) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(j)); }, send(x) { res.end(typeof x === 'string' ? x : JSON.stringify(x)); }, end() { res.end(); } };
    try { await h({ method: req.method, url: req.url, headers: req.headers, body: b ? JSON.parse(b) : {} }, out); } catch (e) { res.statusCode = 500; res.end('{}'); } return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/' || p === '/hq') p = '/app.html'; const fp = path.join(ROOT, 'public', p);
  if (!fp.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.statusCode = 404; return res.end('nf'); }
  res.setHeader('content-type', MIME[path.extname(fp)] || 'application/octet-stream'); res.end(fs.readFileSync(fp)); }); });
const results = []; const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail || '' }); if (!ok) console.error('FAIL', name, detail || ''); };
(async () => {
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const base = 'http://localhost:' + srv.address().port;
  const ws = 'ws_sim', sha = f.sha, email = 'owner@sim.example';
  await f.setJ('gl:user:' + sha(email), { id: 'u_sim', email, ws }); await f.setJ('gl:sess:' + sha('cksim'), { uid: 'u_sim', email, ws });
  const inW = fn => f.als.run({ ws }, fn);
  const mkBot = async (name, prov) => { const b = await inW(() => f.createAgent(name, 'Simulated', prov || 'custom', false, { preset: 'balanced' })); return { id: b.agent.id, key: b.key, name }; };
  const GROK = await mkBot('Grok Bot'), MUSE = await mkBot('Muse');
  const gw = async (bot, method, url, body) => { let o; const res = { setHeader() { }, status(c) { this.c = c; return this; }, json(j) { o = { code: this.c || 200, j }; }, send(x) { o = { code: this.c || 200, j: x }; }, end() { o = { code: 204 }; } }; await h({ method, url, headers: { host: 'localhost', origin: base, authorization: 'Bearer ' + bot.key }, body: body || {} }, res); return o; };
  const own = async (method, url, body) => { const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', origin: base, cookie: 'fm_sess=cksim' }, body: body ? JSON.stringify(body) : undefined }); return { code: r.status, j: await r.json().catch(() => ({})) }; };
  await gw(GROK, 'POST', '/api/gateway/presence', {}); // Grok Bot has checked in; Muse has not
  const taskIds = async () => (await inW(() => f.r(['LRANGE', 'fm:tasklist', 0, 99])));
  const pw = require(require('module').createRequire(API).resolve('playwright'));
  const br = await pw.chromium.launch(); const pageErrors = [], dialogs = [];
  const open = async (kind, extra) => {
    const opt = kind === 'phone' ? { ...pw.devices['iPhone 13'] } : { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 };
    const c = await br.newContext({ ...opt, ...(extra || {}) }); await c.addCookies([{ name: 'fm_sess', value: 'cksim', url: base }]);
    await c.addInitScript(() => { try { localStorage.setItem('alter.tour', '1'); } catch (e) { } addEventListener('DOMContentLoaded', () => { const b = document.createElement('div'); b.id = 'sim-label'; b.textContent = 'SIMULATED: local fixtures, scripted bots, no live provider'; b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;font:600 11px system-ui;background:#fff3bf;color:#5c4400;border:1px solid #e6c200;border-radius:6px;padding:3px 8px;pointer-events:none'; document.body.appendChild(b); }); });
    const p = await c.newPage(); p.on('pageerror', e => pageErrors.push(kind + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts\.googleapis|Failed to load resource|simulated outage|503/.test(m.text())) pageErrors.push(kind + ' console: ' + m.text()); }); p.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    return { c, p };
  };
  const ready = p => p.waitForFunction(() => window.BB && BB.S && BB.who, null, { timeout: 20000 });
  const sync = p => p.evaluate(() => BB.sync(true)); const snap = (p, n, o) => p.screenshot({ path: path.join(OUT, n + '.png'), ...(o || {}) });
  const label = p => p.textContent('#wbtn .wlabel'); const nowSrv = () => new Date(Date.now() + off).toISOString();

  // ===================== DESKTOP =====================
  const { c: dc, p: d } = await open('desktop'); await d.goto(base + '/app.html'); await ready(d);
  // ---- 1. Start: immediate pending, then confirmed queued; one POST; a lost response is retried with the same clientRef (no duplicate)
  const posts = []; await d.route('**/api/tasks', async (route, req) => { if (req.method() !== 'POST') return route.continue(); posts.push(JSON.parse(req.postData() || '{}')); const n = posts.length; if (n === 1) { await route.fetch(); /* the server created it */ await new Promise(r => setTimeout(r, 1800)); return route.abort('failed'); /* the response is lost */ } await new Promise(r => setTimeout(r, 1200)); return route.continue(); });
  await d.fill('#askin', '@grokbot Review the launch checklist <img src=x onerror=alert(1)>'); await d.press('#askin', 'Enter');
  await d.waitForFunction(() => /Sending/.test(document.querySelector('#wbtn .wlabel').textContent), null, { timeout: 2000 }); check('Start: button says Sending… immediately', true);
  await d.click('#wbtn'); await d.waitForSelector('#wpanel:not([hidden]) .wchip.st-sending'); await snap(d, 'd1-sending');
  check('Start: nothing is called queued before the server confirms', !(await d.textContent('#wpanel')).includes('Queued'));
  await d.waitForSelector('#wpanel .wchip.st-failed', { timeout: 6000 }); await snap(d, 'd2-not-sent');
  check('Start: a lost response says it is NOT CONFIRMED (not "nothing was sent") and offers a safe retry', /Not confirmed/.test(await d.textContent('#wpanel')) && /isn't confirmed whether it was received/.test(await d.textContent('#wpanel')) && !/Nothing was sent/.test(await d.textContent('#wpanel')) && !!(await d.$('[data-wretry]')));
  const before = (await taskIds()).length; check('Start: the server did receive the first request (this is the duplicate-risk case)', before === 1, 'tasks=' + before);
  await d.click('[data-wretry]'); await d.waitForSelector('#wpanel .wchip.st-queued, #wpanel .wchip.st-sending', { timeout: 4000 }); await d.waitForFunction(() => [...document.querySelectorAll('#wpanel .wchip')].some(c => /Queued|Received/.test(c.textContent)), null, { timeout: 8000 }).catch(async e => { console.error('PANEL:', (await d.textContent('#wpanel')).replace(/\s+/g, ' ').slice(0, 400), '| posts', posts.length, '| tasks', (await taskIds()).length); throw e; });
  await sync(d); await d.waitForTimeout(300);
  const ids = await taskIds(), mine = []; for (const id of ids) { const t = await inW(() => f.getJ('fm:task:' + id)); if (/Review the launch checklist/.test(t.title)) mine.push(t); }
  check('Start: retrying a lost response did not create a second task', mine.length === 1, 'tasks=' + mine.length + ' before=' + before);
  check('Start: both POSTs carried the same clientRef', posts.length === 2 && posts[0].clientRef && posts[0].clientRef === posts[1].clientRef, JSON.stringify(posts.map(x => !!x.clientRef)));
  await d.unroute('**/api/tasks');
  // ---- 2. queued with an honest reason: bot never checked in; then the bot checks in; queue age shown; no pickup promise
  off += 6 * 60000; await own('POST', '/api/tasks', { title: 'Summarise the support backlog', assignee: MUSE.id }); await sync(d); await d.waitForTimeout(400);
  const panelTxt = await d.textContent('#wpanel');
  if (process.env.DEBUG_PANEL) console.error('QUEUED PANEL:', panelTxt.replace(/\s+/g, ' ').slice(0, 700));
  check('Queued: reason for a bot that never checked in is stated', /hasn't checked in yet/.test(panelTxt));
  check('Queued: age and "pickup not confirmed" are visible without opening details', /queued [56] min/.test(panelTxt) && /pickup not confirmed/.test(panelTxt), panelTxt.replace(/\s+/g, ' ').slice(0, 300));
  check('Queued: no ETA or promise', !/ETA|will pick up|within \d/.test(panelTxt));
  check('Queued: hostile title rendered as text, not HTML', !(await d.$('#wpanel img')) && dialogs.length === 0);
  await snap(d, 'd3-active-queue');
  await d.keyboard.press('Escape');
  // floor bubbles: queued is "Queued:", not "Working"
  await d.waitForSelector('.fx.wnote'); const notes1 = await d.$$eval('.fx.wnote', n => n.map(x => x.textContent));
  check('Floor: queued work is shown as queued, not as work in progress', notes1.length >= 1 && notes1.every(t => !/^Working/.test(t)), JSON.stringify(notes1));
  const overlap = async pg => pg.$$eval('.fx.wnote', ns => { const r = ns.map(n => n.getBoundingClientRect()); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) return [ns[i].textContent, ns[j].textContent]; return null; });
  check('Floor: no two notes overlap (desktop)', (await overlap(d)) === null, JSON.stringify(await overlap(d)));
  await snap(d, 'd4-floor-queued');
  // ---- 3. pickup and running: claim is real state; bubble becomes Working; waiting-for-you outranks it
  const c1 = await gw(GROK, 'GET', '/api/gateway/tasks/next'); check('Scripted claim returned the queued task', c1.j.task && /launch checklist/.test(c1.j.task.title));
  await sync(d); await d.waitForFunction(() => [...document.querySelectorAll('.fx.wnote')].some(x => /^Working on/.test(x.textContent)), null, { timeout: 8000 }).catch(() => { }); const notes2 = await d.$$eval('.fx.wnote', n => n.map(x => x.textContent)); check('Floor: claimed work shows as Working on …', notes2.some(t => /^Working on (@grokbot )?Review the launch/.test(t)), JSON.stringify(notes2));
  off += 20000; await gw(GROK, 'POST', '/api/gateway/events', { kind: 'TOOL_USED', text: 'Read the checklist', task_id: c1.j.task.id });
  await sync(d); await d.click('#wbtn'); await d.waitForSelector('#wpanel .wchip.st-running'); const run1 = await d.textContent('#wpanel');
  if (process.env.DEBUG_PANEL) console.error('RUNNING PANEL:', run1.replace(/\s+/g, ' ').slice(0, 500));
  check('Running: says claimed, and when the bot last reported', /Claimed by Grok Bot/.test(run1) && /Last update 0 s ago|Last update just now|Last update \d+ s ago/.test(run1), run1.replace(/\s+/g, ' ').slice(0, 300));
  { const nb = await d.$$eval('.fx.wnote', n => n.map(x => x.textContent)); check('Floor: the bot\'s own report is quoted as its claim', nb.some(t => /“Read the checklist” \(bot-reported/.test(t)), JSON.stringify(nb)); }
  await snap(d, 'd5-running'); await d.keyboard.press('Escape');
  const doPart = async (bot, result, status) => { const c = await gw(bot, 'GET', '/api/gateway/tasks/next'); if (!c.j.task) throw new Error('no task for ' + bot.name + ': ' + JSON.stringify(await Promise.all((await taskIds()).map(i => inW(() => f.getJ('fm:task:' + i)).then(t => [t.title, t.status, t.assignee === bot.id ? 'mine' : t.assignee]))))); const id = c.j.task.id; await gw(bot, 'POST', '/api/gateway/tasks/' + id + '/complete', status === 'failed' ? { status: 'failed', result } : { result }); return id; };
  // ---- 4. multi-part run: counted once; finished only when every part is; a partial result stays visible
  await doPart(MUSE, 'Backlog summarised: 41 open tickets, 6 older than a week.'); // Muse finishes its earlier standalone job first
  const plan = await own('POST', '/api/tasks', { title: 'Prepare the board brief', orchestrate: true, clientRef: 'planref0123456789', parts: [{ title: 'Gather the numbers', assignee: GROK.id }, { title: 'Draft the narrative', assignee: MUSE.id }, { title: 'Review and sign off', assignee: GROK.id }] });
  check('Plan created', plan.code === 200, JSON.stringify(plan.j).slice(0, 100)); const again = await own('POST', '/api/tasks', { title: 'Prepare the board brief', orchestrate: true, clientRef: 'planref0123456789', parts: [{ title: 'x', assignee: GROK.id }, { title: 'y', assignee: GROK.id }] });
  check('Plan: the same clientRef returns the existing run, no second plan', again.j.duplicate === true && again.j.task.id === plan.j.task.id);
  await gw(GROK, 'POST', '/api/gateway/tasks/' + c1.j.task.id + '/complete', { result: 'Checklist reviewed: 12 items, 2 need owners.' });
  await sync(d); await d.waitForTimeout(300);
  await d.click('#wbtn'); await d.click('[data-wtab=active]'); await d.waitForFunction(() => document.querySelectorAll('#wpanel [data-run]').length >= 1);
  const runsShown = await d.$$eval('#wpanel [data-run]', n => n.map(x => x.textContent)); check('Run: one row for the plan with its current part', runsShown.filter(t => /Prepare the board brief/.test(t)).length === 1 && runsShown.some(t => /Part 1 of 3/.test(t)), JSON.stringify(runsShown).slice(0, 200));
  await d.keyboard.press('Escape');
  const LONG = 'Q4 revenue was $4.2M, up 11% on Q3.\n' + Array.from({ length: 16 }, (_, i) => `Line ${i + 1}: churn, expansion, and pipeline detail that makes this result long enough to need expanding. See https://example.com/report-${i}.`).join('\n');
  await doPart(GROK, LONG); await sync(d);
  const afterPart = await own('GET', '/api/state'); const finishedNow = await d.evaluate(() => BBWork.finishedItems(BB.S, BB.now()).map(x => x.title)); check('Run: a finished part is not listed as finished work', !finishedNow.includes('Gather the numbers') && !finishedNow.includes('Prepare the board brief'), JSON.stringify(finishedNow));
  await doPart(MUSE, 'Narrative drafted: three paragraphs, javascript:alert(1) is not a link. <script>window.__x=1</script>'); await doPart(GROK, 'Reviewed and signed off.');
  // the run is complete only now; the owner sees one in-app indication, once
  await sync(d); await d.waitForTimeout(500);
  const toast = await d.textContent('#toast'); check('Completion: one in-app indication for the run', /Finished: Prepare the board brief/.test(toast), toast);
  check('Completion: the control says Work finished, counting three runs (not the plan\'s parts)', /Work finished/.test(await label(d)) && (await d.textContent('#wbtn .wcount')) === '3', await label(d) + ' ' + await d.textContent('#wbtn .wcount'));
  await snap(d, 'd6-work-finished-button');
  await sync(d); await sync(d); await d.waitForTimeout(300); check('Completion: polling does not announce again or clear it', /Work finished/.test(await label(d)));
  await d.click('#wbtn'); await d.waitForSelector('[data-wtab=finished][aria-selected=true]'); check('Finished tab opens first when there is unseen work', true);
  const finTxt = await d.textContent('#wpanel'); check('Finished: the run appears once, not its three parts', (finTxt.match(/Prepare the board brief/g) || []).length === 1 && !/Gather the numbers/.test(finTxt));
  check('Finished: ages are sensible ("just now", seconds or minutes), never an absurd number', /(just now|\d+ (s|min) ago)/.test(finTxt) && !/\d{3,} (d|h) ago/.test(finTxt) && !/just now ago/.test(finTxt), finTxt.replace(/\s+/g, ' ').slice(0, 260));
  await snap(d, 'd7-finished-dropdown');
  check('Finished: keyboard focus is inside the panel on open', await d.evaluate(() => document.getElementById('wpanel').contains(document.activeElement)));
  // ---- 5. Show receipt opens the run's receipt, result first; seen is explicit
  await d.click('[data-wreceipt]:near(:text("Prepare the board brief"))').catch(async () => { await d.locator('[data-wreceipt]').first().click(); });
  await d.waitForFunction(() => /#receipts\//.test(location.hash)); await d.waitForSelector('.rres'); const hashId = (await d.evaluate(() => location.hash)).split('/')[1];
  check('Show receipt: opens the run (the plan), not a part', hashId === plan.j.task.id, hashId + ' vs ' + plan.j.task.id);
  const rtxt = await d.textContent('.rc'); check('Receipt: result before process', rtxt.indexOf('Result') < rtxt.indexOf('How it got done'));
  check('Receipt: each part\'s own result, labelled, in order', /Part 1: Gather the numbers/.test(rtxt) && /Part 2: Draft the narrative/.test(rtxt) && rtxt.indexOf('Part 1') < rtxt.indexOf('Part 2') && rtxt.indexOf('Part 2') < rtxt.indexOf('Part 3'));
  check('Receipt: says there is no combined answer', /No single combined answer/.test(rtxt));
  check('Receipt: saved text kept as text (script and javascript: not active)', (await d.evaluate(() => window.__x)) === undefined && !(await d.$('.rc script')) && !(await d.$('.rc a[href^="javascript"]')));
  check('Receipt: sources are only http(s) links the results contain', (await d.$$eval('.rsrc a', a => a.map(x => x.href))).every(u => /^https:\/\/example\.com\/report-/.test(u)));
  check('Show receipt: marks only that run seen (3 new -> 2 new)', (await d.textContent('#wbtn .wcount')) === '2', await d.textContent('#wbtn .wcount'));
  await snap(d, 'd8-receipt-collapsed', { fullPage: true });
  // ---- 6. expansion stays across a background refresh and a visible repaint; collapses only on intentional action/navigation
  const rexp = await d.$('[data-rexp^="part:"]'); check('Receipt: long output is collapsed by default', !!rexp && (await rexp.getAttribute('aria-expanded')) === 'false');
  await rexp.click(); await d.click('summary[data-fk=proc]'); await d.evaluate(() => window.scrollTo(0, 220)); const y0 = await d.evaluate(() => scrollY);
  const st = () => d.evaluate(() => { const b = document.querySelector('[data-rexp^="part:"]'); return { part: b.getAttribute('aria-expanded'), open: document.querySelector('[data-rout="' + b.dataset.rexp + '"]').classList.contains('open') ? 1 : 0, proc: document.querySelector('details.rproc').open }; });
  const s0 = await st(); check('Expansion: opened by the owner', s0.part === 'true' && s0.open === 1 && s0.proc === true);
  await snap(d, 'd9-receipt-expanded', { fullPage: true });
  for (let i = 0; i < 3; i++) { await own('POST', '/api/tasks', { title: 'Unrelated job ' + i, assignee: MUSE.id }); await sync(d); await d.waitForTimeout(250); }
  const s1 = await st(); check('Expansion: survives background refreshes', JSON.stringify(s1) === JSON.stringify(s0), JSON.stringify(s1));
  const nodeBefore = await d.evaluate(() => { window.__mark = document.querySelector('.rc'); return 1; });
  await inW(async () => { const a = await f.getJ('fm:agent:' + MUSE.id); a.name = 'Muse (renamed)'; await f.setJ('fm:agent:' + MUSE.id, a); }); await own('POST', '/api/tasks', { title: 'Trigger a state change', assignee: GROK.id }); await sync(d); await d.waitForTimeout(500);
  const repainted = await d.evaluate(() => window.__mark !== document.querySelector('.rc')); const s2 = await st();
  check('Expansion: survives a repaint that really changed the page (a bot was renamed)', repainted && /Muse \(renamed\)/.test(await d.textContent('.rc')) && JSON.stringify(s2) === JSON.stringify(s0), JSON.stringify({ repainted, s2 }));
  check('Expansion: scroll position kept across the repaint', Math.abs((await d.evaluate(() => scrollY)) - y0) < 40, y0 + ' -> ' + await d.evaluate(() => scrollY));
  await snap(d, 'd10-receipt-still-expanded-after-update', { fullPage: true });
  await d.click('[data-rexp^="part:"]'); const s3 = await st(); check('Expansion: collapses on the owner\'s own action', s3.part === 'false' && s3.open === 0);
  await d.click('[data-rexp^="part:"]'); const otherId = (await own('GET', '/api/state')).j.tasks.find(t => t.title === 'Gather the numbers').id; await d.evaluate(id => { location.hash = '#receipts/' + id; }, otherId); await d.waitForTimeout(500);
  await d.waitForSelector('[data-full]'); check('Expansion: not carried to a different receipt (its own Show all is closed)', (await d.getAttribute('[data-full]', 'aria-expanded')) === 'false');
  // ---- 7. receipts list: one entry per run, wrapped title, parts counted
  await d.evaluate(() => { location.hash = '#receipts'; }); await d.waitForSelector('a.row'); const rows = await d.$$eval('a.row', n => n.map(x => x.textContent));
  check('Receipts list: the run once, and not its parts at the same level', rows.filter(t => /Prepare the board brief/.test(t)).length === 1 && !rows.some(t => /^\s*Gather the numbers/.test(t)), JSON.stringify(rows).slice(0, 240));
  check('Receipts list: parts counted in words', rows.some(t => /3 of 3 parts/.test(t)));
  const titleStyle = await d.$eval('a.row .t b.wrap', e => getComputedStyle(e).whiteSpace); check('Receipts list: titles wrap instead of truncating', titleStyle === 'normal', titleStyle);
  await snap(d, 'd11-receipts-list');
  // ---- 8. failure and partial completion stay visible; failure outranks a routine message
  for (const bt of [GROK, MUSE]) { for (let i = 0; i < 12; i++) { const c = await gw(bt, 'GET', '/api/gateway/tasks/next'); if (!c.j.task) break; await gw(bt, 'POST', '/api/gateway/tasks/' + c.j.task.id + '/complete', { result: 'done' }); } } // clear unrelated queued jobs
  await sync(d); await sync(d); await d.waitForTimeout(400); // the clean-up completions are announced here, before the plan below
  const plan2 = await own('POST', '/api/tasks', { title: 'Compare vendors', orchestrate: true, parts: [{ title: 'Collect quotes', assignee: GROK.id }, { title: 'Score them', assignee: MUSE.id }] });
  await sync(d); await sync(d); await d.waitForTimeout(300); // the page sees the new plan while it is still active
  await doPart(GROK, 'Three quotes collected.'); await doPart(MUSE, 'Could not score: the quotes were missing prices.', 'failed'); await sync(d); await d.waitForTimeout(500);
  const fin2 = await d.evaluate(() => BBWork.finishedItems(BB.S, BB.now()).find(x => x.title === 'Compare vendors'));
  check('Partial: some parts done and one failed is Partly finished, not complete', fin2 && fin2.status === 'partial' && fin2.partsDone === 1, JSON.stringify(fin2 && fin2.status));
  check('Partial: the in-app indication says partly finished, with counts', /Partly finished \(1 of 2 parts\): Compare vendors/.test(await d.textContent('#toast')), await d.textContent('#toast'));
  await d.evaluate(id => { location.hash = '#receipts/' + id; }, plan2.j.task.id); await d.waitForSelector('.rres'); const prt = await d.textContent('.rc');
  check('Partial receipt: states 1 of 2 parts finished and shows the failed part\'s own result', /1 of 2 parts finished/.test(prt) && /Could not score/.test(prt)); await snap(d, 'd12-partial-receipt', { fullPage: true });
  await d.evaluate(() => { location.hash = '#floor'; }); await d.waitForSelector('.fx.wnote'); const notes3 = await d.$$eval('.fx.wnote', n => n.map(x => x.textContent)); check('Floor: no two notes overlap with a failure and several finishes (desktop)', (await overlap(d)) === null, JSON.stringify(await overlap(d)));
  check('Floor: a failure is shown over a bot, not hidden by routine messages', notes3.some(t => /Didn't finish/.test(t)), JSON.stringify(notes3));
  await snap(d, 'd13-floor-failure');
  // ---- 9. stale / offline: unknown is not live
  stateDown = true; await d.evaluate(() => BB.sync(true)); await d.waitForFunction(() => BB.offline === true, null, { timeout: 5000 }); await d.click('#wbtn'); await d.waitForSelector('.wfresh.bad');
  check('Offline: banner says the page shows the last known state', /last known state, not confirmed now/.test(await d.textContent('#wpanel')));
  check('Offline: the control carries a stale marker', await d.evaluate(() => document.querySelector('#wbtn').classList.contains('is-stale')));
  check('Stale banner and rows read naturally (no "just now ago")', !/just now ago|ago ago/.test(await d.textContent('#wpanel')), (await d.textContent('#wpanel')).replace(/\s+/g, ' ').slice(0, 200));
  await snap(d, 'd14-stale'); stateDown = false; await d.keyboard.press('Escape'); await sync(d);
  // ---- 10. keyboard and focus
  await d.focus('#wbtn'); await d.keyboard.press('Enter'); await d.waitForSelector('#wpanel:not([hidden])'); check('Keyboard: Enter on the control opens the panel and moves focus into it', await d.evaluate(() => document.getElementById('wpanel').contains(document.activeElement)));
  await d.keyboard.press('ArrowRight'); const sel = await d.evaluate(() => document.querySelector('[role=tab][aria-selected=true]').dataset.wtab); check('Keyboard: arrow keys switch tabs', sel === 'finished' || sel === 'active');
  await d.keyboard.press('Escape'); check('Keyboard: Escape closes and returns focus to the control', await d.evaluate(() => document.activeElement && document.activeElement.id === 'wbtn' && document.getElementById('wpanel').hidden));
  check('Control has an accessible name and state', !!(await d.getAttribute('#wbtn', 'aria-label')) && (await d.getAttribute('#wbtn', 'aria-expanded')) === 'false');
  await dc.close();
  // ---- persistence across reloads: the first visit is the baseline; later finishes are unseen until the owner looks; fetching never marks them read
  { const c2 = await br.newContext({ viewport: { width: 1280, height: 860 } }); await c2.addCookies([{ name: 'fm_sess', value: 'cksim', url: base }]); await c2.addInitScript(() => { try { localStorage.setItem('alter.tour', '1'); } catch (e) { } });
    const p1 = await c2.newPage(); p1.on('pageerror', e => pageErrors.push('reload: ' + e.message)); await p1.goto(base + '/app.html'); await ready(p1); await p1.waitForTimeout(700);
    check('Reload: work finished before the first visit is not marked new', !/Work finished/.test(await label(p1)), await label(p1)); await p1.close();
    await own('POST', '/api/tasks', { title: 'Finished while the page was closed', assignee: GROK.id }); await doPart(GROK, 'Done while you were away.');
    const p2 = await c2.newPage(); p2.on('pageerror', e => pageErrors.push('reload2: ' + e.message)); await p2.goto(base + '/app.html'); await ready(p2); await p2.waitForTimeout(900);
    check('Reload: work that finished while the page was closed shows as unseen (count 1)', /Work finished/.test(await label(p2)) && (await p2.textContent('#wbtn .wcount')) === '1', await label(p2) + ' ' + await p2.textContent('#wbtn .wcount'));
    check('Reload: and no pop-up replays it', !(await p2.evaluate(() => document.querySelector('#toast').classList.contains('on'))));
    await p2.reload(); await ready(p2); await p2.waitForTimeout(700); check('Reload: fetching again does not mark it read', /Work finished/.test(await label(p2)) && (await p2.textContent('#wbtn .wcount')) === '1');
    const stored = await p2.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('alter.work.ack.v1:')));
    check('Reload: the record is saved under the real workspace, not a placeholder', stored.length === 1 && stored[0] !== 'alter.work.ack.v1:default', JSON.stringify(stored));
    await c2.close(); }
  // ---- reduced motion: no pulse animation
  { const { c: rc, p: r } = await open('desktop', { reducedMotion: 'reduce' }); await r.goto(base + '/app.html'); await ready(r); await r.evaluate(() => document.querySelector('#wbtn').classList.add('pulse')); const an = await r.$eval('#wbtn', e => getComputedStyle(e).animationName); check('Reduced motion: the completion pulse does not animate', an === 'none', an); await rc.close(); }

  // ===================== PHONE =====================
  const { c: pc, p: ph } = await open('phone'); await ph.goto(base + '/app.html#inbox'); await ready(ph); await ph.waitForSelector('.kh .wbtn');
  await ph.click('.kh .wbtn'); await ph.waitForSelector('#wpanel.wsheet:not([hidden])'); await snap(ph, 'm1-phone-panel'); const box = await ph.$eval('#wpanel', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; });
  check('Phone: the panel is a bottom sheet inside the screen', box.l >= 0 && box.r <= box.w + 1 && box.b <= box.h + 1, JSON.stringify(box));
  await ph.click('[data-wtab=finished]'); await ph.waitForTimeout(200); await snap(ph, 'm2-phone-finished'); await ph.keyboard.press('Escape');
  await ph.evaluate(id => { location.hash = '#receipts/' + id; }, plan.j.task.id); await ph.waitForSelector('.rres'); await snap(ph, 'm3-phone-receipt', { fullPage: true });
  const ov = await ph.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check('Phone: no horizontal overflow on the receipt', ov <= 0, 'overflow ' + ov);
  const px = await ph.$$eval('.rc .rout', n => n.every(e => e.scrollWidth <= e.clientWidth + 1)); check('Phone: long output wraps and is not clipped sideways', px);
  await ph.evaluate(() => { location.hash = '#floor'; }); await ph.waitForTimeout(900); const phn = await ph.$$eval('.fx.wnote', n => n.length); check('Phone Floor: notes are shown', phn >= 1, 'notes=' + phn); check('Phone Floor: no two notes overlap', (await overlap(ph)) === null, JSON.stringify(await overlap(ph))); check('Phone Floor: every note is inside the screen', await ph.$$eval('.fx.wnote', ns => ns.every(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })));
  await snap(ph, 'm4-phone-floor');
  const wb = await ph.$('#v-floor .floor-work .wbtn'); check('Phone: the Floor has the Work control', !!wb && await wb.isVisible());
  await pc.close();
  // ---- global
  check('No page errors', pageErrors.length === 0, pageErrors.join(' | ')); check('No dialog opened by hostile text', dialogs.length === 0, dialogs.join('|'));
  check('No outbound request was attempted by the app or the harness', outbound.length === 0, outbound.join(','));
  await br.close(); srv.close();
  const failed = results.filter(r => !r.ok); console.log(JSON.stringify({ checks: results.length, failed: failed.length, failures: failed, screenshots: fs.readdirSync(OUT).filter(x => x.endsWith('.png')).length, outbound: outbound.length }, null, 1)); process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
