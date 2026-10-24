/* Black Box vNext · sharing a receipt (the PR #33 boundary). The form opens pre-filled with fixed server-written
   suggestions - job-specific from the owner-approved synopsis for responsibility runs and discovery scans, an explicit
   generic fallback (labeled as such) otherwise - and the exact public page renders live beside the fields (same renderer
   as the public page). The owner edits, confirms the public audience, then publishes. Publish binds to the exact visible
   snapshot: the client sends its hash with the review, the server refuses a stale or missing one and returns the current
   snapshot for an in-dialog refresh, and any edit, consent change or close while a check is in flight cancels the
   continuation. Detector gate, review+publish and consent are unchanged. Links expire in 30 days and can be revoked.
   There is no "clone after sign-in": a public receipt can only be copied as text. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const KIND = { secret: 'a credential or secret', 'internal id': 'an internal ID', contact: 'contact details', link: 'a link or domain', 'file path': 'a file path or file name', 'tool detail': 'a tool or API detail', 'private name': 'a bot name or private job title' };
  const FIELD = { title: 'Public title', summary: 'Description', template: 'Job template' };
  BB.openShare = async function (taskId) {
    const t = BB.task(taskId), d = await BB.api('/api/public-receipts/draft?taskId=' + encodeURIComponent(taskId)); if (d.error) return BB.toast(d.error);
    const sg = d.suggestions || { title: '', summary: '', template: '' };
    const box = BB.modal(`<div class="sh-share">
      <div class="sh-body">
      <div class="sh-form"><h3>Share a public receipt</h3><p>Pre-filled from this job - edit anything before you publish. The page beside this form is exactly what anyone with the link will see, and it updates as you type. Keep out client names, private work, contact details, links, file paths, tool details and credentials.</p>
      <div class="stackf"><label class="fld">Public title<input class="in" id="sh-title" maxlength="100"></label>
      <label class="fld">What the bot did<textarea class="in" id="sh-summary" maxlength="700" style="min-height:64px"></textarea></label>
      <label class="fld">Reusable job template <small>what "Run this job" copies</small><textarea class="in" id="sh-template" maxlength="1500" style="min-height:76px"></textarea></label>
      <label class="fld">Budget <small>pre-filled from what this job recorded${t && t.modelCostUsd == null ? ' (gateway ledger only; model costs were not reported)' : ''}</small><span class="inline-input">$<input type="number" min="0" step="0.01" id="sh-budget" value="${(d.suggestedBudgetCents / 100).toFixed(2)}" style="width:110px;text-align:left"></span></label></div>
      <ul class="problems" id="sh-problems" hidden></ul><p class="err" id="sh-e" style="color:var(--vermilion-press);font-size:13px;margin-top:8px"></p>
      <label class="consent"><input type="checkbox" id="sh-consent"> I reviewed every word. Anyone with the link may see this snapshot for 30 days or until I revoke it. People who already saw or copied it keep it.</label>
      </div>
      <div class="sh-prev"><div class="review-frame"><div class="rc" id="sh-preview"></div></div></div></div>
      <div class="acts sh-acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="button" id="sh-publish" disabled>Publish</button></div>
    </div>`, { label: 'Share a public receipt', wide: true });
    box.querySelector('#sh-title').value = sg.title || '';
    box.querySelector('#sh-summary').value = sg.summary || '';
    box.querySelector('#sh-template').value = sg.template || '';
    if (!sg.tailored) box.querySelector('.sh-form p').insertAdjacentHTML('afterend', '<p class="meta">This job did not come with an approved description, so this starting text is generic - rewrite it to say what the job actually did before you publish.</p>');
    const norm = v => v.trim().replace(/\s+\n/g, '\n');
    const cur = () => { const s = JSON.parse(JSON.stringify(d.baseSnapshot)); s.title = norm(box.querySelector('#sh-title').value); s.summary = norm(box.querySelector('#sh-summary').value); s.template = norm(box.querySelector('#sh-template').value); const b = box.querySelector('#sh-budget').value.trim(); s.budgetCents = b === '' ? null : Math.round(Number(b) * 100); return s; };
    const sha256 = async str => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))].map(b => b.toString(16).padStart(2, '0')).join('');
    let paintSeq = 0, publishSeq = 0;
    const paint = async () => { const n = ++paintSeq, snapshot = cur(), hash = await sha256(JSON.stringify(snapshot)); if (n !== paintSeq) return; box.querySelector('#sh-preview').innerHTML = publicReceiptDoc({ snapshot, hash, publishedAt: null }, { preview: true }); };
    paint();
    // Any edit, consent change or dialog close invalidates an in-flight publish: the continuation
    // re-checks the owner's intent and the exact visible snapshot before it posts anything.
    box.querySelectorAll('#sh-title,#sh-summary,#sh-template,#sh-budget').forEach(i => i.oninput = () => { publishSeq++; paint(); });
    box.querySelector('#sh-consent').onchange = e => { publishSeq++; box.querySelector('#sh-publish').disabled = !e.target.checked; };
    box.querySelector('#sh-publish').onclick = async () => {
      if (!box.querySelector('#sh-consent').checked) return;
      const pb = box.querySelector('#sh-publish'), pr = box.querySelector('#sh-problems'), er = box.querySelector('#sh-e'); pb.disabled = true; pr.hidden = true; er.textContent = '';
      const seq = publishSeq, budget = box.querySelector('#sh-budget').value.trim(), sentBudget = budget === '' ? null : Math.round(Number(budget) * 100);
      const seenHash = await sha256(JSON.stringify(cur()));
      const j = await BB.api('/api/public-receipts/review', 'POST', { taskId, title: norm(box.querySelector('#sh-title').value), summary: norm(box.querySelector('#sh-summary').value), template: norm(box.querySelector('#sh-template').value), budgetCents: sentBudget, seenHash });
      // The dialog is live while the server checks: only continue when this exact dialog is still open
      // with the same fields, the same consent and the same visible snapshot the owner just reviewed.
      const open = () => pb.isConnected && document.querySelector('#modal').classList.contains('on');
      const intentIntact = () => open() && publishSeq === seq && box.querySelector('#sh-consent') && box.querySelector('#sh-consent').checked;
      if (!open()) return;
      if (j.error) {
        pb.disabled = false;
        if (j.code === 'snapshot_changed' && j.snapshot) { d.baseSnapshot = j.snapshot; paint(); er.textContent = j.error; }
        else if (j.problems && j.problems.length) { pr.innerHTML = j.problems.map(p => `<li>${esc(FIELD[p.field] || p.field)} contains ${esc(KIND[p.kind] || p.kind)}.</li>`).join(''); pr.hidden = false; }
        else er.textContent = j.error;
        return;
      }
      if (!intentIntact() || j.hash !== (await sha256(JSON.stringify(cur())))) { if (open()) { paint(); er.textContent = 'Something changed while this snapshot was being checked. The preview is up to date - review it and publish again.'; pb.disabled = false; } return; }
      const r = await BB.api('/api/public-receipts/publish', 'POST', { reviewId: j.reviewId, hash: j.hash, audience: 'public', confirmed: true });
      if (!intentIntact()) return;
      if (r.error) { er.textContent = r.error; pb.disabled = false; return; }
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
