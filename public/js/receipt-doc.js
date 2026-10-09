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
