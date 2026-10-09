/* Black Box vNext · sharing a receipt (the PR #33 boundary). The owner writes the public title, description and reusable
   template from blank fields, reviews the exact snapshot (rendered with the public page's own renderer), confirms the
   public audience, then publishes. Nothing from the private job is prefilled except the suggested budget. Links expire in
   30 days and can be revoked. There is no "clone after sign-in": a public receipt can only be copied as text. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const KIND = { secret: 'a credential or secret', 'internal id': 'an internal ID', contact: 'contact details', link: 'a link or domain', 'file path': 'a file path or file name', 'tool detail': 'a tool or API detail', 'private name': 'a bot name or private job title' };
  const FIELD = { title: 'Public title', summary: 'Description', template: 'Job template' };
  BB.openShare = async function (taskId) {
    const t = BB.task(taskId), d = await BB.api('/api/public-receipts/draft?taskId=' + encodeURIComponent(taskId)); if (d.error) return BB.toast(d.error);
    let review = null;
    const box = BB.modal(`<h3>Share a public receipt</h3><p>Write what the public may see. Nothing from the private job is copied in. Keep out client names, private work, contact details, links, file paths, tool details and credentials.</p>
      <div class="stackf"><label class="fld">Public title<input class="in" id="sh-title" maxlength="100" placeholder="A generic title, not the private job title"></label>
      <label class="fld">What the bot did<textarea class="in" id="sh-summary" maxlength="700" style="min-height:80px" placeholder="A public-safe, honest description"></textarea></label>
      <label class="fld">Reusable job template <small>what "Run this job" copies</small><textarea class="in" id="sh-template" maxlength="1500" style="min-height:100px" placeholder="A generic task anyone could reuse. No private context."></textarea></label>
      <label class="fld">Budget <small>pre-filled from what this job recorded${t && t.modelCostUsd == null ? ' (gateway ledger only; model costs were not reported)' : ''}</small><span class="inline-input">$<input type="number" min="0" step="0.01" id="sh-budget" value="${(d.suggestedBudgetCents / 100).toFixed(2)}" style="width:110px;text-align:left"></span></label></div>
      <ul class="problems" id="sh-problems" hidden></ul><p class="err" id="sh-e" style="color:var(--vermilion-press);font-size:13px;margin-top:8px"></p>
      <div id="sh-review" hidden></div>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b out" type="button" id="sh-check">Review exact snapshot</button><button class="b ink" type="button" id="sh-publish" hidden disabled>Publish</button></div>`, { label: 'Share a public receipt', wide: true });
    const reset = () => { review = null; box.querySelector('#sh-review').hidden = true; box.querySelector('#sh-publish').hidden = true; box.querySelector('#sh-publish').disabled = true; };
    box.querySelectorAll('#sh-title,#sh-summary,#sh-template,#sh-budget').forEach(i => i.oninput = reset);
    box.querySelector('#sh-check').onclick = async () => {
      const pr = box.querySelector('#sh-problems'), er = box.querySelector('#sh-e'); pr.hidden = true; er.textContent = '';
      const budget = box.querySelector('#sh-budget').value.trim();
      const j = await BB.api('/api/public-receipts/review', 'POST', { taskId, title: box.querySelector('#sh-title').value, summary: box.querySelector('#sh-summary').value, template: box.querySelector('#sh-template').value, budgetCents: budget === '' ? null : Math.round(Number(budget) * 100) });
      if (j.error) { reset(); if (j.problems && j.problems.length) { pr.innerHTML = j.problems.map(p => `<li>${esc(FIELD[p.field] || p.field)} contains ${esc(KIND[p.kind] || p.kind)}.</li>`).join(''); pr.hidden = false; } else er.textContent = j.error; return; }
      review = j; const rv = box.querySelector('#sh-review'); rv.hidden = false;
      rv.innerHTML = `<p class="meta" style="margin-top:16px">Exactly what anyone with the link will see:</p><div class="review-frame"><div class="rc">${publicReceiptDoc({ snapshot: j.snapshot, hash: j.hash, publishedAt: null }, { preview: true })}</div></div>
        <label class="consent"><input type="checkbox" id="sh-consent"> I reviewed every word. Anyone with the link may see this snapshot for 30 days or until I revoke it. People who already saw or copied it keep it.</label>`;
      const pb = box.querySelector('#sh-publish'); pb.hidden = false; pb.disabled = true;
      box.querySelector('#sh-consent').onchange = e => pb.disabled = !e.target.checked;
    };
    box.querySelector('#sh-publish').onclick = async () => {
      if (!review || !box.querySelector('#sh-consent').checked) return;
      const pb = box.querySelector('#sh-publish'); pb.disabled = true;
      const r = await BB.api('/api/public-receipts/publish', 'POST', { reviewId: review.reviewId, hash: review.hash, audience: 'public', confirmed: true });
      if (r.error) { box.querySelector('#sh-e').textContent = r.error; reset(); return; }
      const link = location.origin + r.path;
      box.innerHTML = `<button class="x" type="button" aria-label="Close" data-close>${BB.ICON.x}</button><h3>Published</h3><p>Anyone with this link can see the snapshot until ${esc(new Date(r.expiresAt).toLocaleDateString())}, or until you revoke it.</p>
        <div class="share-box" style="margin-top:16px;padding:0;border:0"><div class="link"><input class="in" readonly value="${esc(link)}" aria-label="Public link"><button class="b ink" type="button" id="sh-copy">Copy</button></div></div>
        <p class="meta" style="margin-top:12px">Fingerprint (SHA-256 of the published snapshot): <code style="word-break:break-all">${esc(r.hash)}</code>. Keep it: if a page shows the same fingerprint, it shows this exact snapshot.</p>
        <div class="acts"><a class="b out" href="${esc(link)}" target="_blank" rel="noopener">Open ↗</a><button class="b ghost" type="button" data-close>Done</button></div>`;
      box.querySelectorAll('[data-close]').forEach(x => x.onclick = BB.closeModal);
      box.querySelector('#sh-copy').onclick = () => navigator.clipboard.writeText(link).then(() => BB.toast('Link copied.')).catch(() => { const i = box.querySelector('input'); i.focus(); i.select(); });
      BB.paintShareBox(taskId);
    };
  };
  /* published links for this job on the owner's receipt view, each revocable */
  BB.paintShareBox = async function (taskId) {
    const el = $('#share-box'); if (!el) return;
    const r = await BB.api('/api/public-receipts?taskId=' + encodeURIComponent(taskId)); if (r.error || !$('#share-box')) return;
    let l = el.querySelector('.links'); if (!l) { l = document.createElement('div'); l.className = 'links'; el.appendChild(l); }
    const live = (r.receipts || []).filter(s => !s.revoked && !s.expired), url = s => location.origin + s.path;
    l.innerHTML = live.map(s => `<div class="opt"><div class="t"><b>${esc(s.title)}</b><small>Published ${esc(BB.when(s.publishedAt))} · expires ${esc(new Date(s.expiresAt).toLocaleDateString())}</small></div><button class="b out sm" type="button" data-copy="${esc(url(s))}">Copy link</button><button class="b ghost sm" type="button" data-revoke="${esc(s.token)}">Revoke</button></div>`).join('');
    l.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => BB.toast('Link copied.')));
    l.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = 'Click to confirm'; return; } const x = await BB.api('/api/public-receipts/' + b.dataset.revoke + '/revoke', 'POST'); BB.toast(x.error || 'Link revoked. It no longer opens.'); BB.paintShareBox(taskId); });
  };
})();
