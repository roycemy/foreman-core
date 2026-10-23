/* Alter · owner overview. Business context -> responsibilities -> results -> exceptions -> proposals, with what needs the owner first.
   Built only from GET /api/business/state and the live /api/state store (BB.S, BB.onYou). Empty sections say so.
   Cache is keyed by account + workspace; responses that land after an identity change are dropped. */
(function () {
  'use strict';
  const BB = window.BB = window.BB || {}, esc = s => (BB.esc ? BB.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const when = t => (BB.when ? BB.when(t) : String(t || ''));
  const ENGINE_OFF = ['engine_not_configured', 'engine_not_enabled'];
  const STALE_MS = 120000, REFRESH_MS = 60000;
  const byAtDesc = (a, b) => String(b.at || '').localeCompare(String(a.at || ''));

  /* what the owner is told about storage and model processing (checked against api/index.js: r() -> Redis REST store,
     nsKey() scopes fm:* keys to the workspace, bizDiscover/bizRun send full source text to the configured model endpoint) */
  BB.BIZ_DISCLOSURE = 'Saved in Alter\u2019s database (a Redis store), under keys scoped to this workspace. When the reasoning engine is connected, the full text of your business notes is sent to the workspace\u2019s configured model provider each time Alter looks for work, runs a responsibility, or does a daily check-in.';
  BB.BIZ_PRIVACY_WARNING = 'Use synthetic or redacted data only until privacy controls are ready. Do not paste customer personal data, passwords or payment details.';

  const PENDING_LABEL = { approval: 'Approval', spend: 'Spend approval', card: 'Card approval', budget: 'Budget limit', reconnect: 'Reconnect', dark: 'Went dark', asleep: 'Asleep', unassigned: 'Unassigned job' };
  /* pure: B = /api/business/state body (or a 503 engine error body); S = BB.S; pending = BB.onYou() or null while unknown */
  BB.overviewModel = function (B, S, pending) {
    B = B || {}; S = S || {};
    const code = B.code || null, eng = B.engine || {};
    const engineOn = !ENGINE_OFF.includes(code) && !!(eng.configured && eng.enabled);
    const sources = B.sources || [], allResps = B.responsibilities || [];
    const resps = allResps.filter(r => r.status !== 'retired');
    const runs = [];
    allResps.forEach(r => (r.runs || []).forEach(run => runs.push(Object.assign({ respId: r.id, respTitle: r.title, respStatus: r.status }, run))));
    const tasks = (S.tasks || []).filter(t => !t.synthetic);
    const results = runs.map(r => ({ kind: 'run', id: r.id, title: r.respTitle, at: r.at, text: r.output || '', blocked: r.blockedStep || null }))
      .concat(tasks.filter(t => t.status === 'done').map(t => ({ kind: 'job', id: t.id, title: t.title, at: t.finishedAt, text: t.result || '' })))
      .sort(byAtDesc).slice(0, 8);
    /* a blocked run is open only while it is the latest run of a still-live responsibility; a later run resolves it */
    const exceptions = [];
    resps.forEach(r => { const last = (r.runs || []).slice().sort(byAtDesc)[0]; if (last && last.blockedStep) exceptions.push({ kind: 'blocked', id: r.id, title: r.title, why: 'Needs you: ' + last.blockedStep, at: last.at }); });
    /* a failed job is open unless a later job with the same title finished */
    tasks.filter(t => t.status === 'failed').forEach(t => { const later = tasks.some(o => o.status === 'done' && o.title === t.title && String(o.finishedAt || '') > String(t.finishedAt || '')); if (!later) exceptions.push({ kind: 'failed', id: t.id, title: t.title, why: 'Job failed', at: t.finishedAt }); });
    (B.proposals || []).filter(p => p.status === 'draft' && p.stale && p.stale.length).forEach(p => exceptions.push({ kind: 'stale', id: p.id, title: p.title, why: 'Sources changed since this proposal was drafted', at: p.createdAt }));
    exceptions.sort(byAtDesc);
    const proposals = (B.proposals || []).filter(p => p.status === 'draft').map(p => ({ id: p.id, title: p.title, summary: p.summary || '', at: p.createdAt, stale: !!(p.stale && p.stale.length) }));
    return {
      engineOn, engineCode: engineOn ? null : (code || (eng.configured ? 'engine_not_enabled' : 'engine_not_configured')),
      pendingKnown: Array.isArray(pending),
      pending: (pending || []).map(i => ({ id: i.id, type: i.type, label: PENDING_LABEL[i.type] || 'Needs you', title: (BB.itemTitle ? BB.itemTitle(i) : (i.q && i.q.title) || (i.t && i.t.title) || i.type) })),
      context: sources.map(s => ({ id: s.id, title: s.title, kind: s.kind, version: s.version, at: s.updatedAt })),
      responsibilities: resps.map(r => ({ id: r.id, title: r.title, status: r.status, runs: (r.runs || []).length, canRun: engineOn && r.status === 'active',
        runWhy: !engineOn ? 'Running needs the reasoning engine, which is not connected.' : r.status !== 'active' ? 'Resume it to run it.' : '' })),
      results, exceptions, proposals
    };
  };

  /* pure: st = { loading, error, fetchedAt, now, refreshing } */
  BB.overviewHTML = function (m, st) {
    st = st || {}; const now = st.now || Date.now();
    const sec = (key, h, body) => `<section class="ov-sec" data-sec="${key}"><h2 class="bz-sech">${esc(h)}</h2>${body}</section>`;
    const empty = t => `<p class="ov-empty" data-empty>${esc(t)}</p>`;
    const age = st.fetchedAt ? now - st.fetchedAt : 0;
    const status = st.error ? `<div class="ov-banner err" role="alert" data-stale>Couldn\u2019t refresh: ${esc(st.error)}. Showing data from ${esc(when(new Date(st.fetchedAt).toISOString()))}; it may be out of date. <button class="b out" type="button" data-ov-retry>Retry</button></div>`
      : age > STALE_MS ? `<div class="ov-banner" role="status" data-stale>Last updated ${esc(when(new Date(st.fetchedAt).toISOString()))}; it may be out of date. <button class="b out" type="button" data-ov-retry>Refresh</button></div>`
      : st.refreshing ? `<p class="ov-refresh" role="status">Refreshing\u2026</p>` : '';
    const engineNote = m.engineOn ? '' : `<div class="bz-note ov-engine" data-engine-off><b>Reasoning engine not connected.</b> New proposals can\u2019t be generated and responsibilities can\u2019t run until it is. Saved records below are still yours to review. Nothing here is simulated.</div>`;
    const need = !m.pendingKnown ? `<p class="ov-empty" data-pending-unknown>Checking what needs you\u2026</p>`
      : m.pending.length ? `<div class="ov-pending">${m.pending.map(p => (st.itemCard ? st.itemCard(p.id) : '') || `<div class="bz-card ov-item" data-pending="${esc(p.id)}"><span class="ov-tag">${esc(p.label)}</span><b>${esc(p.title)}</b></div>`).join('')}</div><p><a class="ov-link" href="#inbox" data-ov-inbox>Open all ${m.pending.length} in the Inbox</a></p>`
      : empty('Nothing needs you right now.');
    const ctx = m.context.length ? m.context.map(c => `<div class="bz-card ov-item"><b>${esc(c.title)}</b><small>${c.kind === 'doc' ? 'Document' : 'Note'} \u00b7 v${esc(c.version)} \u00b7 updated ${esc(when(c.at))}</small></div>`).join('') : empty('No business context yet.');
    const resp = m.responsibilities.length ? m.responsibilities.map(r => `<div class="bz-card ov-item" data-resp="${esc(r.id)}"><b>${esc(r.title)}</b><small>${r.status === 'active' ? 'Active' : 'Paused'} \u00b7 ${r.runs} ${r.runs === 1 ? 'run' : 'runs'}</small>
      <div class="ov-acts">${r.status === 'active' ? `<button class="b out" type="button" data-ov-pause="${esc(r.id)}">Pause</button>` : `<button class="b out" type="button" data-ov-resume="${esc(r.id)}">Resume</button>`}</div>
      <form class="ov-run" data-ov-run="${esc(r.id)}"><label class="sr" for="ovr-${esc(r.id)}">Work for ${esc(r.title)}</label><textarea class="in" id="ovr-${esc(r.id)}" maxlength="4000" placeholder="Describe or paste the work" ${r.canRun ? '' : 'disabled'}></textarea>
      <button class="b ink" type="submit" ${r.canRun ? '' : 'disabled aria-describedby="ovw-' + esc(r.id) + '"'}>Run</button>${r.canRun ? '' : `<small class="ov-why" id="ovw-${esc(r.id)}">${esc(r.runWhy)}</small>`}</form></div>`).join('') : empty('No ongoing responsibilities yet.');
    const res = m.results.length ? m.results.map(r => r.kind === 'job'
      ? `<a class="bz-card ov-item ov-open" href="#receipts/${esc(r.id)}"><b>${esc(r.title)}</b><small>Finished job \u00b7 ${esc(when(r.at))} \u00b7 Open receipt</small></a>`
      : `<details class="bz-card ov-item"><summary><b>${esc(r.title)}</b><small>Draft \u00b7 ${esc(when(r.at))}${r.blocked ? ' \u00b7 stopped before: ' + esc(r.blocked) : ''} \u00b7 Open draft</small></summary><pre class="ov-out">${esc(r.text)}</pre></details>`).join('') : empty('No results yet.');
    const exc = m.exceptions.length ? m.exceptions.map(x => `<div class="bz-card ov-item"><b>${esc(x.title)}</b><small>${esc(x.why)}</small>${x.kind === 'failed' ? `<a class="ov-link" href="#receipts/${esc(x.id)}">Open job</a>` : `<a class="ov-link" href="#business">Review in Business</a>`}</div>`).join('') : empty('No open exceptions.');
    const props = (m.engineOn ? '' : `<p class="ov-empty" data-gen-off>New proposals unavailable: reasoning engine not connected.</p>`) + (m.proposals.length ? m.proposals.map(p => `<div class="bz-card ov-item" data-prop="${esc(p.id)}"><span class="ov-tag">Saved proposal \u00b7 drafted ${esc(when(p.at))}${p.stale ? ' \u00b7 sources changed' : ''}</span><b>${esc(p.title)}</b>${p.summary ? `<small>${esc(p.summary)}</small>` : ''}
      <div class="ov-acts"><button class="b ink" type="button" data-ov-activate="${esc(p.id)}">Start it</button><button class="b out" type="button" data-ov-reject="${esc(p.id)}">Reject</button><a class="ov-link" href="#business">Review evidence</a></div></div>`).join('') : empty('No saved proposals.'));
    return `<div class="page-in narrow ov"><div class="page-h"><div><h1>Overview</h1><p class="sub">What Alter knows, what it looks after, and what needs you.</p></div></div>${status}${engineNote}
      ${sec('needs', 'Needs you', need)}${sec('context', 'Business context', ctx)}${sec('responsibilities', 'Responsibilities', resp)}${sec('results', 'Recent results', res)}${sec('exceptions', 'Exceptions', exc)}${sec('proposals', m.engineOn ? 'Proposals' : 'Saved proposals', props)}
      <div class="ov-disc"><p>${esc(BB.BIZ_DISCLOSURE)}</p><p class="ov-warn"><b>${esc(BB.BIZ_PRIVACY_WARNING)}</b></p></div>
      <p><a class="ov-link" href="#business">Manage business context and responsibilities</a></p></div>`;
  };

  /* ---------- controller: identity-keyed cache + request generation ---------- */
  BB.overviewIdentity = () => { const w = BB.who; return w && w.email ? w.email + '|' + (w.legacy ? 'legacy' : (w.workspace || '')) : null; };
  const ctl = BB.overviewCtl = { key: null, B: null, fetchedAt: 0, error: null, loading: false, gen: 0, dropped: 0 };
  function resetIfIdentityChanged() { const k = BB.overviewIdentity(); if (k !== ctl.key) { ctl.key = k; ctl.B = null; ctl.fetchedAt = 0; ctl.error = null; ctl.loading = false; ctl.gen++; return true; } return false; }
  ctl.load = async function () {
    resetIfIdentityChanged();
    if (!ctl.key) return;
    const gen = ++ctl.gen, key = ctl.key; ctl.loading = true; paint();
    let j = null, failed = null;
    try { j = await BB.api('/api/business/state'); } catch (e) { failed = e && e.auth ? 'Signed out' : 'Network error'; }
    if (gen !== ctl.gen || key !== BB.overviewIdentity()) { ctl.dropped++; return; } /* identity changed or a newer request won */
    ctl.loading = false;
    if (!failed && j && j.error && !ENGINE_OFF.includes(j.code)) failed = j.error;
    if (failed) ctl.error = failed; else { ctl.B = j; ctl.fetchedAt = Date.now(); ctl.error = null; }
    paint();
  };

  /* ---------- view wiring (browser only) ---------- */
  const V = () => document.getElementById('v-overview');
  const on = () => { const v = V(); return !!(v && v.classList.contains('on')); };
  async function act(path, body, ok) {
    let j; try { j = await BB.api('/api/business' + path, 'POST', body || {}); } catch (e) { j = { error: 'Network error' }; }
    if (j.error) { BB.toast && BB.toast(j.message || j.error); } else { BB.toast && BB.toast(ok); }
    await ctl.load(); return j;
  }
  function paint() {
    if (typeof document === 'undefined') return;
    const v = V(); if (!v || !on()) return;
    if (resetIfIdentityChanged()) { ctl.load(); return; }
    if (!ctl.B) {
      v.innerHTML = ctl.error ? `<div class="page-in narrow ov"><div class="ov-banner err" role="alert" data-ov-error>Couldn\u2019t load your overview: ${esc(ctl.error)}. <button class="b out" type="button" data-ov-retry>Retry</button></div></div>`
        : `<div class="page-in narrow ov"><p class="ov-refresh" role="status" data-ov-loading>Loading your overview\u2026</p></div>`;
      v.dataset.ovHtml = ''; bind(v); return;
    }
    if (BB.needsOnboarding && BB.needsOnboarding(ctl.B)) {
      if (v.querySelector('#ob-form')) return; /* never clobber typing */
      v.innerHTML = `<div class="page-in narrow ov">${BB.onboardingHTML()}</div>`; v.dataset.ovHtml = '';
      BB.wireOnboarding(v, () => ctl.load()); return;
    }
    const pending = BB.S && BB.onYou ? BB.onYou() : null;
    const typing = v.querySelector('.ov-run textarea:focus'); if (typing && typing.value) return;
    const open = Array.from(v.querySelectorAll('details[open]')).map(d => d.querySelector('summary').textContent);
    const st = { error: ctl.error, fetchedAt: ctl.fetchedAt, refreshing: ctl.loading, itemCard: id => { const i = (pending || []).find(x => x.id === id); return i && BB.itemCard ? BB.itemCard(i) : ''; } };
    const html = BB.overviewHTML(BB.overviewModel(ctl.B, BB.S, pending), st);
    if (html === v.dataset.ovHtml) return; /* the store emits every second; only repaint on a real change */
    v.innerHTML = html; v.dataset.ovHtml = html;
    v.querySelectorAll('details').forEach(d => { if (open.includes(d.querySelector('summary').textContent)) d.open = true; });
    if (pending && BB.bindItems) BB.bindItems(v, pending);
    bind(v);
  }
  function bind(v) {
    v.querySelectorAll('[data-ov-retry]').forEach(b => b.onclick = () => ctl.load());
    v.querySelectorAll('[data-ov-inbox]').forEach(a => a.onclick = e => { if (!BB.phone || BB.phone()) return; e.preventDefault(); BB.openRail && BB.openRail(); });
    v.querySelectorAll('[data-ov-pause]').forEach(b => b.onclick = () => { b.disabled = true; act('/responsibilities/' + b.dataset.ovPause + '/pause', {}, 'Paused. It does nothing while paused.'); });
    v.querySelectorAll('[data-ov-resume]').forEach(b => b.onclick = () => { b.disabled = true; act('/responsibilities/' + b.dataset.ovResume + '/resume', {}, 'Resumed.'); });
    v.querySelectorAll('[data-ov-reject]').forEach(b => b.onclick = () => { b.disabled = true; act('/proposals/' + b.dataset.ovReject + '/reject', {}, 'Rejected. It will not run.'); });
    v.querySelectorAll('[data-ov-activate]').forEach(b => b.onclick = async () => {
      b.disabled = true; let j; try { j = await BB.api('/api/business/proposals/' + b.dataset.ovActivate + '/activate', 'POST', {}); } catch (e) { j = { error: 'Network error' }; }
      if (j.error === 'stale_evidence') { BB.toast && BB.toast('Sources changed since this was drafted. Review it in Business first.'); BB.go('#business'); return; }
      BB.toast && BB.toast(j.error ? (j.message || j.error) : 'Started.'); ctl.load();
    });
    v.querySelectorAll('[data-ov-run]').forEach(f => f.onsubmit = e => {
      e.preventDefault(); const ta = f.querySelector('textarea'); if (!ta.value.trim()) return BB.toast && BB.toast('Describe or paste the work first');
      f.querySelector('button').disabled = true; act('/responsibilities/' + f.dataset.ovRun + '/run', { input: ta.value }, 'Draft ready.');
    });
  }
  if (typeof document === 'undefined' || !BB.onRoute) return;
  BB.onRoute(r => { if (r.v === 'overview') ctl.load(); });
  /* live store changed: repaint for approvals; identity change resets and reloads */
  BB.on && BB.on(() => { if (on()) paint(); });
  const refreshIfOn = () => { if (on() && !document.hidden && !ctl.loading) ctl.load(); };
  addEventListener('focus', refreshIfOn);
  document.addEventListener('visibilitychange', refreshIfOn);
  setInterval(refreshIfOn, REFRESH_MS);
})();
