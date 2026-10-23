// Lane 1 browser test: Overview approvals, refresh/error + Retry, workspace switch race, engine-off saved proposals, onboarding. Mocked API only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core'), fs = require('fs'), http = require('http'), path = require('path');
const root = path.join(__dirname, 'public'), SHOTS = process.env.SHOTS || '';
const type = f => ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' })[path.extname(f)] || 'application/octet-stream';
const server = http.createServer((q, r) => { const f = path.join(root, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', type(f)); r.end(fs.readFileSync(f)); });
const assert = (c, m) => { if (!c) throw Error(m); };
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const agent = { id: 'ag1', name: 'Desk', provider: 'api', status: 'active', permissions: {}, connection: { status: 'connected' }, lastSeen: new Date().toISOString() };
function biz(ws, o) {
  o = o || {};
  return { engine: { configured: !o.off, enabled: !o.off },
    sources: o.empty ? [] : [{ id: 's_' + ws, kind: 'note', title: 'About ' + (ws === 'wsB' ? 'Bravo Bakery' : 'Acme Plumbing'), text: 'x', version: 2, updatedAt: ago(90) }],
    proposals: o.empty ? [] : [{ id: 'prop_' + ws + '1', title: 'Quote follow-ups', summary: 'Draft a follow-up for every open quote older than 3 days.', status: 'draft', createdAt: ago(300), stale: [] }],
    responsibilities: o.empty ? [] : [{ id: 'resp_' + ws + '1', title: 'Missed-call desk', status: 'active', runs: [
      { id: 'run1', respId: 'resp_' + ws + '1', kind: 'manual', at: ago(2000), input: 'call', output: 'Hi Lee, sorry we missed you. We can come Thursday 9-11.', blockedStep: 'Sending the reply' },
      { id: 'run2', respId: 'resp_' + ws + '1', kind: 'manual', at: ago(60), input: 'call', output: 'Hi Sam, thanks for calling. A plumber can visit tomorrow morning.', blockedStep: 'Sending the reply' }] }],
    log: [] };
}
(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const width of [390, 1280]) {
    /* service workers blocked: a controlling SW fetches outside page.route (it would reach the live site); register() is stubbed */
    const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, serviceWorkers: 'block' }), p = await ctx.newPage();
    await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ update: () => Promise.resolve() }); });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    const F = { ws: 'wsA', fail: false, delayA: 0, off: false, empty: false, posts: [], bizCalls: 0 };
    await p.addInitScript(() => localStorage.setItem('alter.tour', '1'));
    await p.route('https://www.alterhq.app/**', async r => { const u = new URL(r.request().url()); if (!u.pathname.startsWith('/api/')) { const f = path.join(root, u.pathname); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f, contentType: type(f) }); } return r.fallback(); });
    await p.route('**/api/**', async r => {
      const u = new URL(r.request().url()), m = r.request().method(), ws = F.ws; let j = {}, status = 200;
      if (m !== 'GET') F.posts.push(m + ' ' + u.pathname);
      if (u.pathname === '/api/me') j = { email: 'owner@example.test', workspace: ws };
      else if (u.pathname === '/api/state') j = { agents: [agent], tasks: [{ id: 'job1', title: 'Weekly cash memo', status: 'done', finishedAt: ago(30), result: 'memo' }], requests: ws === 'wsA' ? [{ id: 'q1', agentId: 'ag1', status: 'pending', label: 'Send a quote', action: 'email.send', params: { title: 'Lee, kitchen sink repair ($180)' }, createdAt: ago(5) }] : [], events: [], receipts: [], notes: [], kinds: [] };
      else if (u.pathname === '/api/business/state') {
        F.bizCalls++;
        if (ws === 'wsA' && F.delayA) await new Promise(x => setTimeout(x, F.delayA));
        if (F.fail) { status = 500; j = { error: 'server error' }; } else j = biz(ws, { off: F.off, empty: F.empty });
      } else if (u.pathname === '/api/business/sources' && m === 'POST') { F.empty = false; j = { source: { id: 's_new' } }; }
      else if (/\/api\/business\/(proposals|responsibilities)\//.test(u.pathname)) j = { ok: true };
      return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(j) });
    });
    const shot = async n => { if (!SHOTS) return; const vh = width === 390 ? 844 : 900; const h = await p.evaluate(() => { const v = document.getElementById('v-overview'); return v.scrollHeight + v.getBoundingClientRect().top + 120; }); await p.setViewportSize({ width, height: Math.max(vh, Math.ceil(h)) }); await p.waitForTimeout(150); await p.screenshot({ path: path.join(SHOTS, n + '-' + width + '.png') }); await p.setViewportSize({ width, height: vh }); };
    const noOverflow = async n => { const w = await p.evaluate(() => document.documentElement.scrollWidth); assert(w <= width, n + ': horizontal overflow ' + w); };
    const smallTargets = () => p.evaluate(() => Array.from(document.querySelectorAll('#v-overview button, #v-overview a, #v-overview summary, #v-overview textarea, #v-overview input')).filter(e => e.offsetParent && e.getBoundingClientRect().height < 44 && !e.closest('.sr')).map(e => e.outerHTML.slice(0, 80)));
    await p.goto('https://www.alterhq.app/app.html#overview');
    await p.waitForSelector('#v-overview [data-sec="needs"]');
    // 1) approvals from /api/state, linked, never "nothing needs you"
    await p.waitForFunction(() => document.querySelector('#v-overview [data-sec="needs"]').textContent.includes('kitchen sink repair'));
    const needs = await p.locator('#v-overview [data-sec="needs"]').innerText();
    assert(!/Nothing needs you/.test(needs), 'says nothing needs you while pending');
    assert(await p.locator('#v-overview [data-sec="needs"] [data-ov-inbox]').count() === 1, 'inbox link');
    assert(await p.locator('#v-overview [data-sec="needs"] button', { hasText: /Approve|Allow/ }).count() >= 1, 'approve action on card');
    assert((await p.locator('#v-overview [data-sec="exceptions"]').innerText()).match(/Sending the reply/g).length === 1, 'only latest blocked run is an exception');
    assert(!(await smallTargets()).length, 'touch targets < 44px: ' + (await smallTargets()).join(' | '));
    await noOverflow('normal'); await shot('overview-normal');
    // 2) refresh error with stale data + Retry recovers
    F.fail = true; await p.evaluate(() => BB.overviewCtl.load());
    await p.waitForSelector('#v-overview [data-stale].err'); assert(await p.locator('#v-overview').innerText().then(t => t.includes('Acme Plumbing')), 'stale data kept on error');
    await noOverflow('error'); await shot('error-stale');
    F.fail = false; await p.click('#v-overview [data-ov-retry]'); await p.waitForSelector('#v-overview [data-stale]', { state: 'detached' });
    // initial-load error state + retry
    F.fail = true; await p.evaluate(() => { BB.overviewCtl.key = 'x'; return BB.overviewCtl.load(); });
    await p.waitForSelector('#v-overview [data-ov-error]'); F.fail = false; await p.click('#v-overview [data-ov-retry]'); await p.waitForSelector('#v-overview [data-sec="context"]');
    // refresh on focus / visibility / after action
    let n = F.bizCalls; await p.evaluate(() => dispatchEvent(new Event('focus'))); await p.waitForFunction(() => !BB.overviewCtl.loading); assert(F.bizCalls > n, 'focus refreshes');
    n = F.bizCalls; await p.click('#v-overview [data-ov-pause]'); await p.waitForTimeout(300); assert(F.posts.some(x => /\/pause$/.test(x)) && F.bizCalls > n, 'action posts then refreshes');
    // 3) workspace switch: slow A response must not paint over B
    F.delayA = 1500; const late = p.evaluate(() => BB.overviewCtl.load()); await p.waitForTimeout(100);
    F.ws = 'wsB'; await p.evaluate(() => BB.boot());
    await p.waitForFunction(() => document.querySelector('#v-overview').textContent.includes('Bravo Bakery')); await late; await p.waitForTimeout(200);
    const t = await p.locator('#v-overview').innerText();
    assert(t.includes('Bravo Bakery') && !t.includes('Acme Plumbing') && !t.includes('kitchen sink repair'), 'only B data after switch');
    assert(await p.evaluate(() => BB.overviewCtl.dropped) >= 1, 'late A response dropped');
    assert(/Nothing needs you/.test(await p.locator('#v-overview [data-sec="needs"]').innerText()), 'B has nothing pending');
    // 4) engine off: saved proposals visible and actionable; run disabled with reason
    F.off = true; await p.evaluate(() => BB.overviewCtl.load()); await p.waitForSelector('#v-overview [data-engine-off]');
    assert(await p.locator('#v-overview [data-gen-off]').count() === 1 && await p.locator('#v-overview [data-ov-activate]').isEnabled() && await p.locator('#v-overview [data-ov-reject]').isEnabled(), 'saved proposals actionable');
    assert(await p.locator('#v-overview .ov-run button').isDisabled() && (await p.locator('#v-overview .ov-why').innerText()).includes('reasoning engine'), 'run disabled with reason');
    await noOverflow('engine-off'); await shot('engine-off');
    await p.click('#v-overview [data-ov-reject]'); await p.waitForTimeout(300); assert(F.posts.some(x => /\/reject$/.test(x)), 'reject works with engine off');
    // 5) onboarding
    F.empty = true; F.ws = 'wsC'; await p.evaluate(() => BB.boot()); await p.waitForSelector('#v-overview #ob-form');
    const ob = await p.locator('#v-overview').innerText(); assert(/Redis/.test(ob) && /synthetic or redacted/.test(ob) && !/Nothing is sent anywhere/.test(ob), 'onboarding disclosure');
    assert(!(await smallTargets()).length, 'onboarding touch targets: ' + (await smallTargets()).join(' | '));
    await noOverflow('onboarding'); await shot('onboarding');
    await p.fill('#ob-title', 'Cora Cleaning'); await p.fill('#ob-text', 'We clean offices at night.'); await p.click('#ob-save');
    await p.waitForSelector('#v-overview [data-sec="context"]'); assert(F.posts.includes('POST /api/business/sources'), 'onboarding saved');
    assert(!errors.length, 'page errors: ' + errors.join(','));
    console.log('PASS', width, 'overview: approvals linked, error/stale + Retry, focus/action refresh, workspace race dropped, engine-off saved proposals actionable, onboarding saves, no overflow, 44px targets');
    await ctx.close();
  }
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
