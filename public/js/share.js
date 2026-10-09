/* Black Box vNext · sharing a receipt. Redacted by default: the owner picks what the public page shows
   (headline, title, result, model costs, steps) and can revoke the link at any time. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const url = s => location.origin + s.path;
  const tog = (id, on, label, sub) => `<div class="perm" style="padding:12px 0"><div class="t"><b>${label}</b><small>${sub}</small></div><button class="tog" type="button" role="switch" id="${id}" aria-checked="${on}" aria-label="${label}"></button></div>`;
  BB.openShare = async function (taskId) {
    const j = await BB.api('/api/jobs/' + taskId); if (j.error) return BB.toast(j.error);
    const d = BB.receiptData(j), t = j.task, bot = BB.agent(t.assignee);
    const box = BB.modal(`<h3>Share this receipt</h3><p>Pick what the public page shows. Prompts, briefs, file paths, links and tool details never leave your workspace.</p>
      <div class="stackf"><label class="fld">Headline<input class="in" id="sh-h" maxlength="120" value="${esc(d.headline)}"></label>
      <label class="fld">Title shown <small>edit out anything private</small><input class="in" id="sh-l" maxlength="200" value="${esc(t.title)}"></label>
      <div>${tog('sh-res', false, 'Show the result', t.result ? 'The text your bot delivered' : 'This job has no result text')}
      ${tog('sh-cost', true, 'Show model costs', t.modelCostUsd != null ? BB.modelCost(t.modelCostUsd) + ', labeled as model costs' : 'Not reported for this job')}
      ${tog('sh-steps', true, 'Show how it got done', 'Steps and approvals, without details')}
      ${tog('sh-notes', false, 'Include the bot\'s own step notes', 'Off by default: bots can mention private things')}</div></div>
      <p class="err" id="sh-e" style="color:var(--vermilion-press);font-size:13px;margin-top:8px"></p>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="button" id="sh-go">Create link</button></div>`, { label: 'Share receipt' });
    box.querySelectorAll('.tog').forEach(b => b.onclick = () => b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true'));
    if (!t.result) { const r = box.querySelector('#sh-res'); r.disabled = true; }
    const on = id => box.querySelector('#' + id).getAttribute('aria-checked') === 'true';
    box.querySelector('#sh-go').onclick = async () => {
      const b = box.querySelector('#sh-go'); b.disabled = true;
      const r = await BB.api('/api/jobs/' + taskId + '/shares', 'POST', { headline: box.querySelector('#sh-h').value, lede: box.querySelector('#sh-l').value, color: bot ? BB.avColor(bot) : '#121212', show: { result: on('sh-res'), cost: on('sh-cost'), steps: on('sh-steps'), botNotes: on('sh-notes') } });
      if (r.error) { box.querySelector('#sh-e').textContent = r.error; b.disabled = false; return; }
      const link = url(r.share);
      box.innerHTML = `<button class="x" type="button" aria-label="Close" data-close>${BB.ICON.x}</button><h3>Link ready</h3><p>Anyone with this link can see the receipt. You can revoke it any time.</p>
        <div class="share-box" style="margin-top:16px;padding:0;border:0"><div class="link"><input class="in" readonly value="${esc(link)}" aria-label="Public link"><button class="b ink" type="button" id="sh-copy">Copy</button></div></div>
        <div class="acts"><a class="b out" href="${esc(link)}" target="_blank" rel="noopener">Open ↗</a><button class="b ghost" type="button" data-close>Done</button></div>`;
      box.querySelectorAll('[data-close]').forEach(x => x.onclick = BB.closeModal);
      box.querySelector('#sh-copy').onclick = () => navigator.clipboard.writeText(link).then(() => BB.toast('Link copied.')).catch(() => { const i = box.querySelector('input'); i.focus(); i.select(); });
      BB.paintShareBox(taskId);
    };
  };
  /* existing links on the owner's receipt view, each revocable */
  BB.paintShareBox = async function (taskId) {
    const el = $('#share-box'); if (!el) return;
    const r = await BB.api('/api/jobs/' + taskId + '/shares'); if (r.error || !$('#share-box')) return;
    let l = el.querySelector('.links'); if (!l) { l = document.createElement('div'); l.className = 'links'; el.appendChild(l); }
    const live = (r.shares || []).filter(s => !s.revoked);
    l.innerHTML = live.map(s => `<div class="opt"><div class="t"><b style="font-family:var(--font-code);font-size:12.5px;font-weight:400">${esc(url(s).replace(/^https?:\/\//, ''))}</b><small>Shared ${esc(BB.ago(s.createdAt))}${/min|h$/.test(BB.ago(s.createdAt)) ? ' ago' : ''} · ${[s.show.result ? 'result' : null, s.show.cost ? 'model costs' : null, s.show.steps ? 'steps' : null].filter(Boolean).join(', ') || 'headline only'}</small></div><button class="b out sm" type="button" data-copy="${esc(url(s))}">Copy</button><button class="b ghost sm" type="button" data-revoke="${esc(s.token)}">Revoke</button></div>`).join('');
    l.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => BB.toast('Link copied.')));
    l.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = 'Click to confirm'; return; } const x = await BB.api('/api/shares/' + b.dataset.revoke + '/revoke', 'POST'); BB.toast(x.error || 'Link revoked. It no longer opens.'); BB.paintShareBox(taskId); });
  };
  /* "Run this job" from someone else's receipt: after sign-in, copy it into this workspace as an unassigned job */
  BB.booted = async function () {
    const q = new URLSearchParams(location.search), token = q.get('clone'); if (!token) return;
    history.replaceState(null, '', location.pathname + location.hash);
    const j = await BB.api('/api/receipts/clone', 'POST', { token });
    if (j.error) return BB.toast(j.error);
    BB.toast('Copied “' + j.task.title + '” into your inbox. Nothing runs until a bot takes it.'); await BB.sync(true);
    BB.phone() ? BB.go('#inbox') : BB.openRail();
  };
})();
