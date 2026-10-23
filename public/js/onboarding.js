/* Alter · business-first first run. A workspace with no business sources starts here:
   "Tell Alter about your business". The note is saved through the existing POST /api/business/sources. */
(function () {
  'use strict';
  const BB = window.BB = window.BB || {}, esc = s => (BB.esc ? BB.esc(s) : String(s == null ? '' : s));
  /* first run = the business state loaded and holds no sources yet */
  BB.needsOnboarding = B => !!(B && !B.error && Array.isArray(B.sources) && B.sources.length === 0);
  BB.onboardingHTML = function (err) {
    return `<div class="bz-card ob" data-onboarding>
      <h2>Tell Alter about your business</h2>
      <p class="sub">Start with the business, not the tools. What do you do, who are your customers, and what keeps falling through the cracks?</p>
      <form id="ob-form" class="stackf" autocomplete="off">
        <label class="fld">Business name<input class="in" id="ob-title" maxlength="80" required placeholder="Acme Plumbing"></label>
        <label class="fld">About the business<textarea class="in" id="ob-text" maxlength="20000" required style="min-height:140px" placeholder="We are a three-person plumbing company. Calls come in while we are on jobs and quotes go out late."></textarea></label>
        <p class="err" id="ob-err" role="alert">${esc(err || '')}</p>
        <div class="acts"><button class="b ink" type="submit" id="ob-save">Save and continue</button></div>
        <p class="ov-disc-in">${esc(BB.BIZ_DISCLOSURE || '')} You can edit or delete it later under Business.</p>
        <p class="ov-warn"><b>${esc(BB.BIZ_PRIVACY_WARNING || '')}</b></p>
      </form></div>`;
  };
  /* returns the API result; caller reloads state on success */
  BB.saveOnboarding = async function (title, text) {
    title = String(title || '').trim(); text = String(text || '');
    if (!title) return { error: 'Give it a short title' };
    if (!text.trim()) return { error: 'Tell Alter a little about the business first' };
    return BB.api('/api/business/sources', 'POST', { kind: 'note', title: 'About ' + title, text });
  };
  BB.wireOnboarding = function (root, done) {
    const f = root.querySelector('#ob-form'); if (!f) return;
    f.onsubmit = async e => {
      e.preventDefault(); const b = root.querySelector('#ob-save'); b.disabled = true;
      let j; try { j = await BB.saveOnboarding(root.querySelector('#ob-title').value, root.querySelector('#ob-text').value); } catch (x) { j = { error: 'Could not save. Try again.' }; }
      b.disabled = false;
      if (j.error) { root.querySelector('#ob-err').textContent = j.error; return; }
      BB.toast && BB.toast('Saved. Alter now knows about your business.'); done && done(j);
    };
  };
})();
