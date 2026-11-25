/* Black Box vNext · one-tap sharing. The share button generates the public title, description, reusable template and
   budget itself - ONLY from non-private facts (bot names, step count, status, timing, recorded budget) - and publishes
   in one tap. Job text, titles, results, links, paths and credentials are never copied in. Links expire in 30 days and
   can be unshared. There is no "clone after sign-in": a public receipt can only be copied as text. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  BB.openShare = async function (taskId) {
    const box = BB.modal('<h3>Sharing...</h3><p class="meta">Generating a safe public snapshot.</p>', { label: 'Share a public receipt' });
    const r = await BB.api('/api/public-receipts/auto', 'POST', { taskId });
    if (r.error) { box.querySelector('h3').textContent = 'Share'; box.querySelector('p').textContent = r.error; const a = document.createElement('div'); a.className = 'acts'; a.innerHTML = '<button class="b ghost" type="button" data-close>Close</button>'; box.appendChild(a); a.querySelector('[data-close]').onclick = BB.closeModal; return; }
    const link = location.origin + r.path;
    box.innerHTML = `<button class="x" type="button" aria-label="Close" data-close>${BB.ICON.x}</button><h3>Shared</h3><p>Anyone with this link can see the snapshot until ${esc(new Date(r.expiresAt).toLocaleDateString())}, or until you unshare it. It shows bot names, steps and outcome only - never your job text.</p>
      <div class="share-box" style="margin-top:16px;padding:0;border:0"><div class="link"><input class="in" readonly value="${esc(link)}" aria-label="Public link"><button class="b ink" type="button" id="sh-copy">Copy</button></div></div>
      <div class="review-frame" style="margin-top:16px"><div class="rc">${publicReceiptDoc({ snapshot: r.snapshot, hash: r.hash, publishedAt: null }, { preview: true })}</div></div>
      <div class="acts"><a class="b out" href="${esc(link)}" target="_blank" rel="noopener">Open ↗</a><button class="b ghost" type="button" id="sh-unshare">Unshare</button><button class="b ghost" type="button" data-close>Done</button></div>`;
    box.querySelectorAll('[data-close]').forEach(x => x.onclick = BB.closeModal);
    box.querySelector('#sh-copy').onclick = () => navigator.clipboard.writeText(link).then(() => BB.toast('Link copied.')).catch(() => { const i = box.querySelector('input'); i.focus(); i.select(); });
    box.querySelector('#sh-unshare').onclick = async ev => {
      const b = ev.currentTarget; if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = 'Click to confirm unshare'; return; }
      const x = await BB.api('/api/public-receipts/' + r.token + '/revoke', 'POST');
      if (x.error) { BB.toast(x.error); return; }
      b.disabled = true; b.textContent = 'Unshared - the link no longer opens'; BB.paintShareBox(taskId);
    };
    BB.paintShareBox(taskId);
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
