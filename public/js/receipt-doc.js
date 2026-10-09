/* Black Box vNext · receipt document (D). Shared by the owner's receipt view and the public receipt page,
   so both render the same 600px column from the same data shape:
   { bot:{name,initials,color}, at, headline, lede, artifact:{title,text,words}|null, costUsd:number|null, showCost,
     approvals:number|null, durationMs:number|null, timeline:[{at,text,kind,meta}] } */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const day = iso => iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
  const dur = ms => { if (!(ms >= 0)) return '–'; const m = ms / 60000; if (m < 1) return Math.max(1, Math.round(ms / 1000)) + ' s'; if (m < 60) return Math.round(m) + ' min'; const h = m / 60; if (h < 24) return (h < 10 ? Math.round(h * 10) / 10 : Math.round(h)) + ' h'; return Math.round(h / 24) + ' d'; };
  const money = usd => usd == null ? '–' : usd > 0 && usd < .01 ? '<$0.01' : '$' + Number(usd).toFixed(2);
  window.receiptDoc = function (d, o) {
    o = o || {};
    const first = d.timeline && d.timeline[0], last = d.timeline && d.timeline[d.timeline.length - 1];
    const sameDay = first && last && day(first.at) === day(last.at);
    const steps = (d.timeline || []).map((s, i) => {
      let when = (i === 0 || !sameDay) ? day(s.at) + ' · ' + clock(s.at) : clock(s.at);
      if (s.end && first) when = clock(s.at) + ' · ' + dur(Date.parse(s.at) - Date.parse(first.at)) + ' total';
      return `<li class="${s.kind === 'approval' ? 'ap' : s.kind === 'denied' ? 'no' : ''}">${esc(s.text)}<small>${esc(when)}${s.meta ? ' · ' + esc(s.meta) : ''}</small></li>`;
    }).join('');
    const facts = [];
    if (d.showCost !== false) facts.push(`<div><b>${esc(money(d.costUsd))}</b><small>${d.costUsd == null ? 'model costs not reported' : 'model costs'}</small></div>`);
    if (d.approvals != null) facts.push(`<div><b>${d.approvals}</b><small>owner ${d.approvals === 1 ? 'approval' : 'approvals'}</small></div>`);
    if (d.durationMs != null) facts.push(`<div><b>${esc(dur(d.durationMs))}</b><small>start to finish</small></div>`);
    const art = d.artifact ? `<div class="art"><div class="prev"><span class="tag">${esc(o.artifactLabel || 'Result')}</span><div class="sw" aria-hidden="true"></div><h3>${esc(d.artifact.title)}</h3>${d.artifact.text ? `<p>${esc(d.artifact.text)}</p>` : ''}</div><div class="meta-row"><b>${esc(d.artifact.name || 'result.txt')}</b>${o.fullResult && d.artifact.full ? `<button type="button" class="link" data-full aria-expanded="false">Show all ↓</button>` : `<small>${d.artifact.words ? d.artifact.words + ' words' : ''}</small>`}</div>${o.fullResult && d.artifact.full ? `<div class="full" hidden>${esc(d.artifact.full)}</div>` : ''}</div>` : '';
    return `<div class="eyb"><span class="av s24" style="--av:${esc(d.bot.color || '#121212')}" aria-hidden="true">${esc(d.bot.initials)}</span>Receipt · ${esc(new Date(d.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))}</div>
      <h1>${esc(d.headline)}</h1>${d.lede ? `<p class="lede">${esc(d.lede)}</p>` : ''}
      ${art}
      ${facts.length ? `<div class="costs">${facts.join('')}</div>` : ''}
      ${d.showCost !== false ? `<p class="honest">${d.costUsd == null ? 'Model costs were not reported for this job, so none are shown. This never includes subscriptions or tools.' : 'Model costs only. Excludes the owner\'s subscription and any tools they pay for.'}</p>` : ''}
      ${steps ? `<div class="tl"><h5>How it got done</h5><ol class="steps">${steps}</ol></div>` : ''}`;
  };
  window.receiptBind = function (root) {
    const b = root.querySelector('[data-full]'); if (!b) return;
    b.onclick = () => { const f = root.querySelector('.art .full'); f.hidden = !f.hidden; b.setAttribute('aria-expanded', !f.hidden); b.textContent = f.hidden ? 'Show all ↓' : 'Show less ↑'; };
  };
})();

/* Public receipt (D) from the allowlisted public snapshot only. The owner's pre-share review renders with this same
   function, so what the owner reviews is exactly what the public page shows. No bot or owner identity is available here. */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STEP = { assigned: 'The owner assigned the job', claimed: 'A bot took the job', actions: n => 'Completed ' + n + ' permitted action' + (n === 1 ? '' : 's'), approved: 'The owner approved a step', denied: 'The owner denied a step', blocked: 'A step was blocked', handoff: 'Part of the job went to another bot', part_done: 'A delegated part finished', delivered: 'Delivered', stopped: 'Stopped without a result' };
  const clock = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = iso => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const elapsed = s => s == null ? 'Not tracked' : s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? (Math.round(s / 360) / 10) + ' h' : Math.round(s / 8640) / 10 + ' d';
  const usd = c => '$' + (c / 100).toFixed(2);
  window.publicTemplateText = s => s.template + (s.budgetCents != null ? '\n\nBudget: up to ' + usd(s.budgetCents) + '.' : '');
  window.publicReceiptDoc = function (x, o) {
    o = o || {}; const s = x.snapshot, brand = (window.BRAND && window.BRAND.name) || 'Black Box';
    const tl = String(s.template).split(/\n+/).map(v => v.trim()).filter(Boolean);
    const first = s.steps && s.steps[0], sameDay = first && s.steps.every(t => day(t.at) === day(first.at));
    const steps = (s.steps || []).map((t, i) => { const txt = typeof STEP[t.code] === 'function' ? STEP[t.code](t.n || 0) : STEP[t.code]; if (!txt) return ''; return `<li class="${t.code === 'approved' ? 'ap' : ['denied', 'blocked', 'stopped'].includes(t.code) ? 'no' : ''}">${esc(txt)}<small>${esc((i === 0 || !sameDay ? day(t.at) + ' · ' : '') + clock(t.at))}</small></li>`; }).join('');
    const cost = s.reportedModelCostUsd != null ? (s.reportedModelCostUsd > 0 && s.reportedModelCostUsd < .01 ? '<$0.01' : '$' + s.reportedModelCostUsd.toFixed(2)) : 'Not reported';
    return `<div class="eyb"><span class="mark"><i aria-hidden="true"></i></span>Public receipt${x.publishedAt ? ' · ' + esc(new Date(x.publishedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })) : ''}${s.outcome === 'failed' ? ' · job stopped' : ''}</div>
      <h1>${esc(s.title)}</h1><p class="lede">${esc(s.summary)}</p>
      <div class="art"><div class="prev"><span class="tag">Reusable job template</span><div class="sw" aria-hidden="true"></div><h3>${esc(tl[0] || '')}</h3>${tl.length > 1 ? `<p>${esc(tl.slice(1).join(' '))}</p>` : ''}</div><div class="meta-row"><b>${s.budgetCents != null ? 'Budget: up to ' + usd(s.budgetCents) : 'No budget set'}</b><small>${tl.join(' ').split(/\s+/).length} words</small></div></div>
      <div class="costs"><div><b>${esc(cost)}</b><small>${s.reportedModelCostUsd != null ? 'model costs (bot-reported)' : 'external cost: not verified'}</small></div><div><b>${s.approvals}</b><small>owner ${s.approvals === 1 ? 'approval' : 'approvals'}</small></div><div><b>${esc(elapsed(s.elapsedSeconds))}</b><small>elapsed (wall clock)</small></div></div>
      <p class="honest">${esc(s.provenance)} Gateway ledger: ${s.ledgerCents == null ? 'not tracked' : s.ledgerCents + '¢ across ' + s.trackedActions + ' retained linked action' + (s.trackedActions === 1 ? '' : 's') + ', not provider spending'}.</p>
      ${steps ? `<div class="tl"><h5>How it got done</h5><ol class="steps">${steps}</ol></div>` : ''}
      ${o.preview ? '' : `<button class="cta" type="button" id="runjob">Run this job</button><p>Copies the job template${s.budgetCents != null ? ' and its budget' : ''}. Nothing runs and nothing is charged. Paste it into your own bot or ${esc(brand)}.</p><p class="copied" id="copied" role="status" aria-live="polite"></p><textarea class="in" id="tplfallback" readonly hidden aria-label="Job template to copy" style="min-height:160px;margin-top:12px"></textarea>`}
      <div class="foot fp"><span class="mark"><i aria-hidden="true"></i>${esc(brand)}</span><span>· SHA-256 <code title="${esc(x.hash)}">${esc(String(x.hash || '').slice(0, 16))}…</code> <span id="fpcheck">${o.preview ? '(fingerprint of this exact snapshot)' : ''}</span></span></div>
      <p class="fpnote">This fingerprint is computed from this page's snapshot data. If it equals the fingerprint the owner received when publishing, the snapshot is unchanged since then. It does not prove the work itself, its timing or its cost.</p>`;
  };
})();
