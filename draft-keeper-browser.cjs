// Draft keeper browser test: typed work in Business "Bring it work" survives navigation, is scoped to account+workspace+responsibility, cleared after a successful run. Mocked API only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'), fs = require('fs'), http = require('http'), path = require('path');
const root = path.join(__dirname, 'public');
const type = f => ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' })[path.extname(f)] || 'application/octet-stream';
const assert = (c, m) => { if (!c) throw Error(m); };
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const biz = ws => ({ engine: { configured: true, enabled: true }, sources: [{ id: 's1', kind: 'note', title: 'About ' + ws, text: 'x', version: 1, updatedAt: ago(9) }], proposals: [],
  responsibilities: ['resp_1', 'resp_2'].map((id, i) => ({ id, title: (i ? 'Quote chaser ' : 'Missed-call desk ') + ws, summary: 's', boundary: 'Drafts only.', status: 'active', createdAt: ago(900), runsCount: 0, runs: [] })), log: [] });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), p = await ctx.newPage();
  await p.addInitScript(() => { localStorage.setItem('alter.tour', '1'); if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ update: () => Promise.resolve() }); });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const F = { ws: 'wsA', email: 'owner@example.test', runs: [], delay: 0 };
  await p.route('https://www.alterhq.app/**', async r => { const u = new URL(r.request().url()); if (!u.pathname.startsWith('/api/')) { const f = path.join(root, u.pathname); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f, contentType: type(f) }); return r.fulfill({ status: 404, body: '' }); } return r.fallback(); });
  await p.route('**/api/**', async r => {
    const u = new URL(r.request().url()), m = r.request().method(); let j = {};
    if (u.pathname === '/api/me') j = { email: F.email, workspace: F.ws };
    else if (u.pathname === '/api/state') j = { agents: [], tasks: [], requests: [], receipts: [] };
    else if (u.pathname === '/api/business/state') j = biz(F.ws);
    else if (/\/run$/.test(u.pathname) && m === 'POST') { F.runs.push(u.pathname); if (F.delay) await new Promise(x => setTimeout(x, F.delay)); j = { run: { id: 'r', status: 'done', output: 'ok' } }; }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  });
  const box = id => '#v-business [data-run-input="' + id + '"]';
  const open = async id => { await p.evaluate(() => BB.go('#business')); await p.waitForSelector('#v-business [data-resp="' + id + '"]'); if (!(await p.locator(box(id)).count())) await p.click('#v-business [data-toggle-resp="' + id + '"]'); await p.waitForSelector(box(id)); };
  const away = async () => { await p.evaluate(() => BB.go('#overview')); await p.waitForSelector('#v-overview [data-sec]'); };
  const sw = async (ws, email) => { F.ws = ws; if (email) F.email = email; await p.evaluate(() => BB.boot()); await p.waitForFunction(w => BB.who && BB.who.workspace === w.ws && BB.who.email === w.email, { ws: F.ws, email: F.email }); };
  const keys = () => p.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('fm:draft:')));
  await p.goto('https://www.alterhq.app/app.html#business');
  // 1) persists across navigation, per responsibility
  await open('resp_1'); await p.fill(box('resp_1'), 'Acme: call back Lee about the leak');
  await open('resp_2'); await p.fill(box('resp_2'), 'Acme: chase quote 42');
  await away(); await open('resp_1');
  assert(await p.inputValue(box('resp_1')) === 'Acme: call back Lee about the leak', 'draft restored after navigation');
  await open('resp_2'); assert(await p.inputValue(box('resp_2')) === 'Acme: chase quote 42', 'second responsibility kept separately');
  assert((await keys()).every(k => k.includes(encodeURIComponent('owner@example.test|wsA'))), 'keys include account+workspace');
  // 2) cleared after a successful run (same identity)
  await p.click('#v-business [data-run="resp_2"]'); await p.waitForFunction(() => !Object.keys(sessionStorage).some(k => k.endsWith(':resp_2')));
  assert(F.runs.length === 1, 'run posted'); await away(); await open('resp_2');
  assert(await p.inputValue(box('resp_2')) === '', 'draft cleared after submit');
  await open('resp_1'); assert(await p.inputValue(box('resp_1')).then(v => v.startsWith('Acme')), 'other draft unaffected by submit');
  // 2b) submit A, type B while A runs, A completes: B kept through re-render + navigation; submitting B clears
  await open('resp_2'); await p.fill(box('resp_2'), 'Work A'); F.delay = 1200; const nRuns = F.runs.length;
  await p.click('#v-business [data-run="resp_2"]'); await p.waitForFunction(n => true, nRuns); await p.waitForTimeout(200);
  await p.fill(box('resp_2'), 'Work B typed during run');
  await p.waitForFunction(() => !document.querySelector('#v-business [data-run="resp_2"]').disabled && document.querySelector('#v-business [data-run="resp_2"]').textContent.includes('Do this work'));
  await p.waitForTimeout(300); F.delay = 0;
  assert(F.runs.length === nRuns + 1, 'A posted');
  assert(await p.inputValue(box('resp_2')) === 'Work B typed during run', 'B still present after A completes: ' + await p.inputValue(box('resp_2')));
  await away(); await open('resp_2'); assert(await p.inputValue(box('resp_2')) === 'Work B typed during run', 'B survives navigation');
  await p.click('#v-business [data-run="resp_2"]'); await p.waitForFunction(() => !Object.keys(sessionStorage).some(k => k.endsWith(':resp_2')));
  await p.waitForTimeout(200); assert(await p.inputValue(box('resp_2')) === '', 'submitting B clears'); await away(); await open('resp_2'); assert(await p.inputValue(box('resp_2')) === '', 'B gone after its own submit');
  // 3) other workspace, same account and same responsibility id: never shown, A drafts dropped
  await away(); await sw('wsB'); await open('resp_1');
  assert(await p.inputValue(box('resp_1')) === '', 'no draft leak into workspace B');
  assert(!(await keys()).some(k => k.includes('wsA')), 'workspace A drafts dropped on identity change');
  await p.fill(box('resp_1'), 'Bravo: order flour'); await away(); await open('resp_1');
  assert(await p.inputValue(box('resp_1')) === 'Bravo: order flour', 'B draft persists in B');
  // 4) other account, same workspace id: never shown
  await away(); await sw('wsB', 'second@example.test'); await open('resp_1');
  assert(await p.inputValue(box('resp_1')) === '', 'no draft leak into another account');
  assert(!(await keys()).length, 'previous account drafts dropped');
  assert(!errors.length, 'page errors: ' + errors.join('; '));
  console.log('PASS draft-keeper: persists across navigation per responsibility, cleared after successful run, newer text typed during a run kept (submit A/type B), isolated across two workspaces and two accounts (dropped on identity change)');
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
