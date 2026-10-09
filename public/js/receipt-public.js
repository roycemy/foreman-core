/* Black Box vNext · public receipt (D). No login and no nav. The server already rendered the page's meta tags;
   this paints the redacted snapshot with the viewer's local times. */
(function () {
  'use strict';
  const R = window.__RECEIPT, root = document.getElementById('rc'); if (!R || !root) return;
  const brand = (window.BRAND && BRAND.name) || 'Black Box';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  root.classList.add('wide');
  root.innerHTML = receiptDoc(R.snap, { fullResult: true })
    + `<a class="cta" href="/hq?clone=${encodeURIComponent(R.token)}">Run this job</a><p>Opens a copy of this job in your own ${esc(brand)}. Nothing runs until you connect a bot.</p>`
    + `<div class="foot"><span class="mark"><i aria-hidden="true"></i>${esc(brand)}</span><span title="Snapshot ${esc(R.hash)}">· Verified receipt</span></div>`;
  receiptBind(root);
})();
