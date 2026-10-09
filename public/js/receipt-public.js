/* Black Box vNext · public receipt (D). No login and no nav. "Run this job" only copies the reusable template (with its
   budget) to the clipboard: no account, no request, nothing runs. */
(function () {
  'use strict';
  const X = window.__RECEIPT, root = document.getElementById('rc'); if (!X || !root) return;
  root.classList.add('wide'); root.innerHTML = publicReceiptDoc(X);
  const text = publicTemplateText(X.snapshot), out = document.getElementById('copied');
  document.getElementById('runjob').onclick = async () => {
    try { await navigator.clipboard.writeText(text); out.textContent = 'Template copied. Nothing has run or been charged.'; }
    catch (e) { const f = document.getElementById('tplfallback'); f.hidden = false; f.value = text; f.focus(); f.select(); out.textContent = 'Copy the template below. Nothing has run or been charged.'; }
  };
  /* recompute the fingerprint from the data on this page */
  (async () => {
    const el = document.getElementById('fpcheck'); if (!el || !window.crypto || !crypto.subtle) return;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(X.snapshot)));
      const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      el.textContent = hex === X.hash ? '(recomputed in your browser: matches this page)' : '(recomputed in your browser: does not match this page)';
    } catch (e) { }
  })();
})();
