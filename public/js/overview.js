/* Alter · owner overview. Business context -> responsibilities -> results -> exceptions -> proposals.
   Built only from GET /api/business/state and the live /api/state store (BB.S). Empty sections say so.
   With the reasoning engine off, it says "Reasoning engine not connected" and shows no proposals. */
(function () {
  'use strict';
  const BB = window.BB = window.BB || {}, esc = s => (BB.esc ? BB.esc(s) : String(s == null ? '' : s));
  const when = t => (BB.when ? BB.when(t) : String(t || ''));
  const ENGINE_OFF = ['engine_not_configured', 'engine_not_enabled'];

  /* pure: turn real data into sections. B = /api/business/state body (or a 503 error body), S = BB.S */
  BB.overviewModel = function (B, S) {
    B = B || {}; S = S || {};
    const code = B.code || (B.error && B._status === 503 ? 'engine_not_configured' : null);
    const eng = B.engine || {};
    const engineOn = !ENGINE_OFF.includes(code) && !!(eng.configured && eng.enabled);
    const sources = B.sources || [], resps = (B.responsibilities || []).filter(r => r.status !== 'retired');
    const runs = [];
    (B.responsibilities || []).forEach(r => (r.runs || []).forEach(run => runs.push(Object.assign({ respTitle: r.title }, run))));
    const tasks = (S.tasks || []).filter(t => !t.synthetic);
    const results = runs.map(r => ({ kind: 'run', title: r.respTitle, at: r.at, text: r.output || '' }))
      .concat(tasks.filter(t => t.status === 'done').map(t => ({ kind: 'job', title: t.title, at: t.finishedAt, text: t.result || '' })))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 8);
    const exceptions = []
      .concat(runs.filter(r => r.blockedStep).map(r => ({ title: r.respTitle, why: 'Needs you: ' + r.blockedStep, at: r.at })))
      .concat(tasks.filter(t => t.status === 'failed').map(t => ({ title: t.title, why: 'Job failed', at: t.finishedAt })))
      .concat((B.proposals || []).filter(p => p.status === 'draft' && p.stale && p.stale.length).map(p => ({ title: p.title, why: 'Sources changed since this proposal was drafted', at: p.createdAt })))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const proposals = engineOn ? (B.proposals || []).filter(p => p.status === 'draft') : [];
    return { engineOn, engineCode: engineOn ? null : (code || (eng.configured ? 'engine_not_enabled' : 'engine_not_configured')),
      context: sources.map(s => ({ title: s.title, kind: s.kind, version: s.version, at: s.updatedAt })),
      responsibilities: resps.map(r => ({ title: r.title, status: r.status, runs: (r.runs || []).length })),
      results, exceptions, proposals: proposals.map(p => ({ title: p.title, summary: p.summary || '' })) };
  };

  const sec = (h, items, empty, row) => `<section class="ov-sec" data-sec="${esc(h.toLowerCase())}"><div class="bz-sech">${esc(h)}</div>${items.length ? items.map(row).join('') : `<p class="meta" data-empty>${esc(empty)}</p>`}</section>`;
  const card = (b, s) => `<div class="bz-card"><b>${esc(b)}</b>${s ? `<br><small>${esc(s)}</small>` : ''}</div>`;
  BB.overviewHTML = function (m) {
    const engineNote = m.engineOn ? '' : `<div class="bz-note" data-engine-off>Reasoning engine not connected. Alter will not draft proposals or run responsibilities until it is. Nothing here is simulated.</div>`;
    return `<div class="page-in narrow"><div class="page-h"><div><h1>Overview</h1><p class="sub">What Alter knows, what it looks after, and what needs you.</p></div></div>${engineNote}
      ${sec('Business context', m.context, 'No business context yet.', c => card(c.title, (c.kind === 'doc' ? 'Document' : 'Note') + ' · v' + c.version + ' · updated ' + when(c.at)))}
      ${sec('Responsibilities', m.responsibilities, 'No ongoing responsibilities yet.', r => card(r.title, (r.status === 'active' ? 'Active' : 'Paused') + ' · ' + r.runs + (r.runs === 1 ? ' run' : ' runs')))}
      ${sec('Recent results', m.results, 'No results yet.', r => card(r.title, (r.kind === 'run' ? 'Draft' : 'Finished job') + ' · ' + when(r.at) + (r.text ? ' · ' + String(r.text).slice(0, 140) : '')))}
      ${sec('Exceptions', m.exceptions, 'No exceptions. Nothing is waiting on you.', x => card(x.title, x.why))}
      ${m.engineOn ? sec('Proposals', m.proposals, 'No proposals yet.', p => card(p.title, p.summary)) : `<section class="ov-sec" data-sec="proposals"><div class="bz-sech">Proposals</div><p class="meta" data-empty>No proposals. Reasoning engine not connected.</p></section>`}
      <p class="meta"><a href="#business">Manage business context and responsibilities</a></p></div>`;
  };

  /* ---------- view wiring (browser only) ---------- */
  if (typeof document === 'undefined' || !BB.onRoute) return;
  let B = null, loading = false, err = null;
  const V = () => document.getElementById('v-overview');
  async function load() {
    loading = true; let j = null;
    try { j = await BB.api('/api/business/state'); } catch (e) { j = null; }
    loading = false;
    if (j && (!j.error || ENGINE_OFF.includes(j.code))) { B = j; err = null; } else if (!B) err = (j && j.error) || 'Could not load the overview. Try again.';
    paint();
  }
  function paint() {
    const v = V(); if (!v) return;
    if (!B) { v.innerHTML = `<div class="page-in narrow"><p style="margin-top:24px">${esc(err || 'Loading…')}</p></div>`; return; }
    if (BB.needsOnboarding && BB.needsOnboarding(B)) {
      v.innerHTML = `<div class="page-in narrow">${BB.onboardingHTML()}</div>`;
      BB.wireOnboarding(v, () => load());
      return;
    }
    v.innerHTML = BB.overviewHTML(BB.overviewModel(B, BB.S));
  }
  BB.onRoute(r => { if (r.v === 'overview') load(); });
  BB.on && BB.on(() => { const v = V(); if (v && v.classList.contains('on') && B && !v.querySelector('#ob-form')) paint(); });
})();
