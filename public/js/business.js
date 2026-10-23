/* Alter · Business: teach Alter about the business from your own notes, review evidence-checked
   proposals for work it could take over, and run approved responsibilities as drafts.
   Proposals never run. Responsibilities only draft; nothing is sent, posted, purchased or connected. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, $$ = BB.$$, esc = BB.esc;
  const V = $('#v-business');
  let B = null, loading = false, loadErr = null, editingSrc = null, editingProp = null, openResp = {};

  const api = (p, m, b) => BB.api('/api/business' + p, m, b);
  // Tenant identity guard: loaded state belongs to the exact identity (account + workspace)
  // it was fetched under, stamped with a generation that bumps on every identity change.
  // A change invalidates everything synchronously - cache, edit state AND the painted DOM -
  // and a late fetch response from before the change is discarded before it can assign or paint.
  let idGen = 0, curId = null, loadedId = null, inflightId = null;
  function identity() {
    const e = (BB.who && BB.who.email) || null, w = (BB.who && BB.who.workspace) || null;
    if (!e && !w) return curId;
    if (!curId || curId.e !== e || curId.w !== w) curId = { e, w, gen: ++idGen };
    return curId;
  }
  async function load() {
    const stamp = identity(); inflightId = stamp; loading = true;
    let j = null; try { j = await api('/state'); } catch (e) { j = null; }
    loading = false;
    if (stamp && stamp !== identity()) return; // late response from before the change: discard - the sync/route handler already cleared the DOM and started the reload
    inflightId = null;
    if (j && !j.error) { B = j; loadedId = stamp; loadErr = null; } else if (!B) loadErr = (j && j.error) || 'Could not load the Business view. Try again.';
    paint();
  }
  function dropIfStaleTenant() {
    identity(); // bumps the generation when the account or workspace changed
    const stale = (loadedId && loadedId !== curId) || (inflightId && inflightId !== curId);
    if (stale) {
      B = null; loadErr = null; editingSrc = null; editingProp = null; openResp = {}; loadedId = null;
      V.innerHTML = ''; // synchronous DOM clear: nothing from the previous identity stays painted
      return true;
    }
    return false;
  }

  const chip = (t, cls) => `<span class="bzc ${cls || ''}">${esc(t)}</span>`;
  const staleBadge = p => (p.stale && p.stale.length) ? chip('Sources changed since drafted', 'warn') : '';
  const tok = u => u ? `${u.promptTokens} in · ${u.completionTokens} out` : '';

  /* ---------- sources ---------- */
  function srcRow(s) {
    const open = editingSrc === s.id;
    return `<div class="bz-card" data-src="${s.id}">
      <div class="bz-row" data-toggle-src="${s.id}" role="button" tabindex="0">
        <div class="t"><b>${esc(s.title)}</b><small>${s.kind === 'doc' ? 'Document' : 'Note'} · v${s.version} · ${s.text.length.toLocaleString()} characters · updated ${BB.when(s.updatedAt)}</small></div>
        <span class="chev">${BB.ICON.chev}</span>
      </div>
      ${open ? `<div class="bz-src-edit">
        <label class="fld">Title<input class="in" data-src-title value="${esc(s.title)}" maxlength="120"></label>
        <label class="fld">Text<textarea class="in" data-src-text rows="8" maxlength="20000">${esc(s.text)}</textarea></label>
        <p class="meta">Editing the text bumps the version and flags proposals that were drafted from the old version.</p>
        <div class="btns"><button class="b ink" data-src-save="${s.id}">Save</button><button class="b out" data-src-cancel>Cancel</button><button class="b danger" data-src-del="${s.id}">Delete</button></div>
      </div>` : ''}
    </div>`;
  }

  /* ---------- proposals ---------- */
  function propCard(p) {
    if (p.status === 'rejected') return '';
    const editing = editingProp === p.id;
    const ev = (p.evidence || []).map(e => e && e.excerptDeleted
      ? `<div class="bz-ev"><blockquote class="bz-ev-del">Quote removed - its source was deleted.</blockquote><small>${esc(e.sourceTitle || 'Source')}</small></div>`
      : `<div class="bz-ev"><span class="bz-tick" title="This quote was checked against your source">✓</span><blockquote>${esc(e.excerpt)}</blockquote><small>${esc(e.sourceTitle || 'Source')} · v${e.sourceVersion}</small></div>`).join('');
    const un = (p.unknowns || []).map(u => `<li>${esc(u)}</li>`).join('');
    const sys = (p.systems || []).map(s => chip(s)).join('');
    return `<div class="bz-card" data-prop="${p.id}">
      <div class="bz-prop-h"><div class="t"><b>${esc(p.title)}</b><small>Drafted by the reasoning engine from your sources · ${BB.when(p.createdAt)}${p.editedByOwner ? ' · edited by you' : ''}</small></div>${chip('Proposal · not running', 'dim')}${staleBadge(p)}</div>
      ${editing ? `
        <label class="fld">Name<input class="in" data-p-title value="${esc(p.title)}" maxlength="90"></label>
        <label class="fld">What it covers<textarea class="in" data-p-summary rows="3" maxlength="600">${esc(p.summary)}</textarea></label>
        <label class="fld">Starting boundary<textarea class="in" data-p-boundary rows="2" maxlength="300">${esc(p.boundary)}</textarea></label>
        <div class="btns"><button class="b ink" data-p-save="${p.id}">Save changes</button><button class="b out" data-p-cancel>Cancel</button></div>`
      : `
        <p class="bz-sum">${esc(p.summary)}</p>
        ${ev ? `<div class="bz-sech">Evidence from your sources</div>${ev}` : `<p class="meta">No verifiable source quotes. Treat this as a hypothesis, not a finding.</p>`}
        ${un ? `<div class="bz-sech">What Alter does not know</div><ul class="bz-ul">${un}</ul>` : ''}
        ${sys ? `<div class="bz-sech">Systems this would need</div><div class="bz-chips">${sys}</div>` : ''}
        <div class="bz-bound"><b>Starting boundary</b><p>${esc(p.boundary)}</p></div>
        <p class="meta">Starting runs this responsibility inside the boundary above, plus a daily check-in. On each run the first 4,000 characters of every source go to the reasoning engine. Results are drafts for your review - nothing is sent, spent or connected.</p>
        <div class="btns"><button class="b ink" data-p-activate="${p.id}">Approve and start</button><button class="b out" data-p-edit="${p.id}">Edit</button><button class="b out" data-p-reject="${p.id}">Reject</button></div>`}
    </div>`;
  }

  /* ---------- responsibilities ---------- */
  function runItem(run) {
    return `<div class="bz-run">
      <div class="bz-run-h"><small>${run.kind === 'daily' ? 'Daily check-in' : 'You brought work'} · ${BB.when(run.at)}${run.usage ? ' · ' + esc(tok(run.usage)) + ' tokens' : ''}</small></div>
      ${run.input ? `<p class="bz-run-in">${esc(run.input.length > 240 ? run.input.slice(0, 240) + '…' : run.input)}</p>` : ''}
      <div class="bz-draft"><span class="bzc">Draft · nothing was sent</span><p>${esc(run.output)}</p></div>
      ${run.blockedStep ? `<p class="bz-blocked">Did not do: ${esc(run.blockedStep)}</p>` : ''}
    </div>`;
  }
  function respCard(rp) {
    if (rp.status === 'retired') return `<div class="bz-card" data-resp="${rp.id}">
      <div class="bz-row"><div class="t"><b>${esc(rp.title)}</b><small>Retired${rp.retiredAt ? ' ' + BB.when(rp.retiredAt) : ''}${rp.runsCount ? ' · ' + rp.runsCount + (rp.runsCount === 1 ? ' run' : ' runs') + ' in history' : ''}</small></div>${chip('Retired', 'dim')}</div>
      <p class="meta">Retired responsibilities keep their stored work history until you delete it.</p>
      <div class="btns"><button class="b danger" data-resp-del="${rp.id}">Delete with its history</button></div>
    </div>`;
    const open = !!openResp[rp.id];
    const runs = (rp.runs || []).map(runItem).join('');
    return `<div class="bz-card" data-resp="${rp.id}">
      <div class="bz-row" data-toggle-resp="${rp.id}" role="button" tabindex="0">
        <div class="t"><b>${esc(rp.title)}</b><small>${rp.status === 'active' ? 'Active' : 'Paused'} since ${BB.when(rp.createdAt)}${rp.runsCount ? ' · ' + rp.runsCount + (rp.runsCount === 1 ? ' run' : ' runs') : ''}</small></div>
        ${chip(rp.status === 'active' ? 'Running with your approval' : 'Paused', rp.status === 'active' ? 'ok' : 'dim')}
        <span class="chev">${BB.ICON.chev}</span>
      </div>
      ${open ? `<div class="bz-resp-b">
        <div class="bz-chips">${chip('Drafts only')}${chip('Nothing is sent')}${chip('No spending')}${chip('You review outputs')}</div>
        <p class="bz-sum">${esc(rp.summary)}</p>
        <p class="meta">Boundary you approved: ${esc(rp.boundary)}</p>
        <label class="fld">Bring it work<textarea class="in" data-run-input="${rp.id}" rows="3" maxlength="4000" placeholder="Paste an email to answer, a question, a request…"></textarea></label>
        <div class="btns"><button class="b ink" data-run="${rp.id}">Do this work</button>${rp.status === 'active' ? `<button class="b out" data-resp-pause="${rp.id}">Pause</button>` : `<button class="b out" data-resp-resume="${rp.id}">Resume</button>`}<button class="b out" data-resp-retire="${rp.id}">Retire</button><button class="b danger" data-resp-del="${rp.id}">Delete</button></div>
        <p class="meta">Alter also does a daily check-in on active responsibilities and leaves what it finds here. Results are drafts - they never leave Alter.</p>
        ${runs ? `<div class="bz-sech">History</div>${runs}` : '<p class="meta">No work done yet.</p>'}
      </div>` : ''}
    </div>`;
  }

  /* ---------- page ---------- */
  function paint() {
    if (dropIfStaleTenant()) { load(); return; }
    if (!V.classList.contains('on')) return;
    if (!B) { V.innerHTML = loadErr ? '<div class="page-in narrow"><p style="margin-top:24px">' + esc(loadErr) + '</p><p class="meta"><button class="btn" data-biz-retry type="button">Try again</button></p></div>' : '<div class="page-in narrow"><p class="meta" style="margin-top:24px">Loading…</p></div>'; const rt = $('[data-biz-retry]', V); if (rt) rt.onclick = () => load(); return; }
    const eng = B.engine || {}, srcs = B.sources || [], props = (B.proposals || []).filter(p => p.status !== 'rejected'), resps = B.responsibilities || [];
    const engNote = eng.configured && eng.enabled ? (eng.consent && eng.consent.current ? '' :
      `<div class="bz-note">Provider processing is off. Allow it above before Alter looks for work or runs responsibilities - your sources stay in Alter until you do.</div>`) :
      `<div class="bz-note">The reasoning engine ${eng.configured ? 'is connected but not enabled for this workspace' : 'is not connected yet'}. You can add sources now; proposals and work runs start once setup finishes. Nothing is simulated - Alter will not invent proposals without it.</div>`;
    const addForm = `<div class="bz-card"><div class="bz-sech">Add to what Alter knows</div>
      <div class="bz-kind"><button class="b out sm" data-kind="note" type="button">Note</button><button class="b out sm" data-kind="doc" type="button">Document</button></div>
      <label class="fld">Title<input class="in" id="bz-add-title" maxlength="120" placeholder="e.g. How last week actually went"></label>
      <label class="fld">Text<textarea class="in" id="bz-add-text" rows="6" maxlength="20000" placeholder="Paste notes, a call summary, a process doc…"></textarea></label>
      <div class="btns"><button class="b ink" id="bz-add">Add source</button></div>
      <p class="meta">Saved to your Alter workspace. When the reasoning engine is connected, looking for work sends each source's full saved text (up to 20,000 characters per source); each responsibility run or daily check-in sends the first 4,000 characters of every source plus the work you bring.</p></div>`;
    const empty = !srcs.length ? `<div class="bz-hero"><h2>Teach Alter the business</h2>
      <p>1. Add notes or documents about how the business actually runs.<br>2. Alter proposes responsibilities it could take over, each backed by quotes from your own notes.<br>3. You approve what starts. Approved work runs as drafts you review - nothing is sent, spent or connected.</p></div>` : '';
    // Provider consent card: exact host+model, what is sent, withdraw any time. The gate is
    // server-side (engine_no_consent covers manual runs AND daily check-ins); this is its control.
    const consentCard = eng.configured && eng.enabled ? `<div class="bz-card"><div class="bz-sech">Reasoning provider</div>
      ${eng.consent && eng.consent.current ? `<p class="meta">Provider processing is <b>on</b> for ${esc(eng.consent.host)} (${esc(eng.consent.model)}), allowed ${BB.when(eng.consent.at)}. While on, looking for work sends each source's full saved text to this provider; each run or daily check-in sends the first 4,000 characters of every source plus the work you bring.</p>
      <div class="btns"><button class="b out sm" id="bz-consent-off">Withdraw provider processing</button></div>` :
      `<p class="meta">Alter's reasoning provider is <b>${esc(eng.host || 'unknown')}</b> using model <b>${esc(eng.model || 'unknown')}</b>. While allowed, looking for work sends each source's full saved text to this provider; each run or daily check-in sends the first 4,000 characters of every source plus the work you bring.${eng.consent && !eng.consent.current ? ' Your earlier allowance no longer matches the configured provider - review and choose again.' : ''}</p>
      <div class="btns"><button class="b ink sm" id="bz-consent-on">Allow provider processing</button></div>`}
      <p class="meta">Source text is treated as data, not instructions, but no system can promise a hostile document cannot influence the engine's behavior. Results are drafts for your review.</p></div>` : '';
    const dataCard = `<div class="bz-card"><div class="bz-sech">Your data</div>
      <p class="meta">Your business data is stored in Alter's hosted database. There is no app-level encryption: the workspace owner and Alter's platform operator can access stored data operationally. The activity log above records key owner actions in this workspace (adding, editing and deleting sources, proposals, runs, consent changes); it is not an audit of operator access.</p>
      <p class="meta">Deleting a source removes the source and the verbatim quotes copied from it into proposals. Work derived from it - proposal text, responsibilities, run drafts - is kept as your reviewable record, and activity entries can still mention a deleted item's title; that history is intentional. Deleting a responsibility removes that responsibility and its runs only. Only deleting all business data removes sources, proposals, responsibilities, work history, provider consent and the activity log from Alter's database; one minimal receipt of the purge itself remains there (an id, the time and item counts, none of your text). Content already sent to the reasoning provider is governed by that provider's own retention, and platform infrastructure backups are outside this deletion.</p>
      <div class="btns"><button class="b danger sm" id="bz-purge">Delete all business data</button></div></div>`;
    const propSec = srcs.length ? `<div class="bz-sech row"><span>What Alter could take over</span><button class="b ink sm" id="bz-discover" ${eng.configured && eng.enabled && eng.consent && eng.consent.current ? '' : 'disabled'}>Look for work</button></div>
      ${engNote}
      ${props.length ? props.map(propCard).join('') : '<p class="meta">No proposals yet. Ask Alter to look for work once you have added sources.</p>'}` : '';
    const live = resps.filter(rp => rp.status !== 'retired'), retired = resps.filter(rp => rp.status === 'retired');
    const respSec = (live.length ? `<div class="bz-sech">Running with your approval</div>${live.map(respCard).join('')}` : '') + (retired.length ? `<div class="bz-sech">Retired</div>${retired.map(respCard).join('')}` : '');
    const logSec = (B.log && B.log.length) ? `<div class="bz-sech">Recent activity</div><div class="bz-log">${B.log.slice(0, 8).map(l => `<div><small>${BB.when(l.at)} · ${esc(logLine(l))}</small></div>`).join('')}</div>` : '';
    const pend = B.opPending;
    const pendWhat = pend && (pend.op === 'purge' ? 'Deleting all business data' : pend.op === 'source_delete' ? 'Deleting a source' : pend.op === 'resp_delete' ? 'Deleting a responsibility and its work history' : 'A delete');
    const pendCard = pend ? `<div class="bz-card"><div class="bz-sech">A delete did not finish</div>
      <p class="meta">${esc(pendWhat)} started ${BB.when(pend.at)} but paused partway. Records already deleted stay deleted; everything else is held - no new work runs until you finish or cancel it.</p>
      <div class="btns bz-pendbtns"><button class="b danger sm" id="bz-pend-finish">Finish this delete</button><button class="b out sm" id="bz-pend-cancel">Cancel the delete - keep what remains</button></div></div>` : '';
    V.innerHTML = `<div class="page-in narrow"><div class="page-h"><div><h1>Business</h1><p class="sub">Teach Alter the business. Approve what it takes over.</p></div></div>
      ${pendCard}${empty}${srcs.length ? `<div class="bz-sech">What Alter knows</div>${srcs.map(srcRow).join('')}` : ''}${addForm}${consentCard}${propSec}${respSec}${logSec}${dataCard}</div>`;
    bind();
  }
  function logLine(l) {
    return { source_added: 'Source added: ' + (l.title || ''), source_edited: 'Source edited (v' + l.fromVersion + ' → v' + l.toVersion + ')', source_deleted: 'Source deleted: ' + (l.title || ''),
      discover: 'Looked for work: ' + l.proposals + ' proposal' + (l.proposals === 1 ? '' : 's') + (l.droppedEvidence ? ' · ' + l.droppedEvidence + ' unverifiable quote' + (l.droppedEvidence === 1 ? '' : 's') + ' dropped' : ''),
      proposal_edited: 'Proposal edited', proposal_rejected: 'Proposal rejected: ' + (l.title || ''),
      responsibility_deleted: 'Deleted with its history: ' + (l.title || ''), provider_consent_granted: 'Provider processing allowed: ' + (l.host || '') + ' (' + (l.model || '') + ')', provider_consent_withdrawn: 'Provider processing withdrawn',
      responsibility_activated: 'Started: ' + (l.title || ''), responsibility_paused: 'Paused: ' + (l.title || ''), responsibility_resumed: 'Resumed: ' + (l.title || ''), responsibility_retired: 'Retired: ' + (l.title || ''),
      run: (l.runKind === 'daily' ? 'Daily check-in' : 'Work run') + (l.usage ? ' · ' + tok(l.usage) + ' tokens' : ''),
      data_purged: 'All business data deleted. Earlier activity was deleted with it; only this minimal receipt remains.', delete_abandoned: 'A paused delete was cancelled; what remained was kept.' }[l.kind] || l.kind;
  }

  /* ---------- confirm via the app modal ---------- */
  function askConfirm(title, body, cta) {
    return new Promise(res => {
      const box = BB.modal(`<h3>${esc(title)}</h3><p>${esc(body)}</p><div class="acts"><button class="b ghost" data-no>Cancel</button><button class="b ink" data-yes>${esc(cta)}</button></div>`, { label: title, onClose: () => res(false) });
      box.querySelector('[data-no]').onclick = () => { BB.closeModal(); };
      box.querySelector('[data-yes]').onclick = () => { res(true); BB.closeModal(); };
    });
  }

  /* ---------- actions ---------- */
  function bind() {
    let kind = 'note';
    $$('.bz-kind .b', V).forEach(b => b.onclick = () => { kind = b.dataset.kind; $$('.bz-kind .b', V).forEach(x => x.classList.toggle('ink', x === b)); });
    const add = $('#bz-add', V);
    if (add) add.onclick = async () => {
      const title = $('#bz-add-title', V).value, text = $('#bz-add-text', V).value;
      add.disabled = true; const j = await api('/sources', 'POST', { kind, title, text }); add.disabled = false;
      if (j.error) return BB.toast(j.error); BB.toast('Added.'); await load();
    };
    $$('[data-toggle-src]', V).forEach(el => el.onclick = () => { editingSrc = editingSrc === el.dataset.toggleSrc ? null : el.dataset.toggleSrc; paint(); });
    $$('[data-src-save]', V).forEach(b => b.onclick = async () => {
      const card = b.closest('.bz-card'), title = $('[data-src-title]', card).value, text = $('[data-src-text]', card).value;
      b.disabled = true; const j = await api('/sources/' + b.dataset.srcSave, 'PATCH', { title, text }); b.disabled = false;
      if (j.error) return BB.toast(j.error); editingSrc = null;
      BB.toast(j.proposalsStale && j.proposalsStale.length ? 'Saved. ' + j.proposalsStale.length + ' proposal' + (j.proposalsStale.length === 1 ? ' is' : 's are') + ' now flagged as drafted from the old version.' : 'Saved.'); await load();
    });
    $$('[data-src-cancel]', V).forEach(b => b.onclick = () => { editingSrc = null; paint(); });
    $$('[data-src-del]', V).forEach(b => b.onclick = async () => {
      if (!await askConfirm('Delete this source?', 'The source and its verbatim quotes in proposals are removed. Work derived from it (proposal text, responsibilities, run drafts) stays as your record.', 'Delete')) return;
      const j = await api('/sources/' + b.dataset.srcDel, 'DELETE'); if (j.error) return BB.toast(j.error); editingSrc = null; BB.toast('Deleted.'); await load();
    });
    const disc = $('#bz-discover', V);
    if (disc) disc.onclick = async () => {
      disc.disabled = true; disc.textContent = 'Reading your sources…';
      const j = await api('/discover', 'POST', {}); disc.disabled = false; disc.textContent = 'Look for work';
      if (j.error) { BB.toast(j.error); if (j.code) paint(); return; }
      BB.toast(j.proposals && j.proposals.length ? j.proposals.length + ' proposal' + (j.proposals.length === 1 ? '' : 's') + ' drafted. Review the evidence before approving.' : (j.note || 'Nothing grounded enough to propose.')); await load();
    };
    $$('[data-p-edit]', V).forEach(b => b.onclick = () => { editingProp = b.dataset.pEdit; paint(); });
    $$('[data-p-cancel]', V).forEach(b => b.onclick = () => { editingProp = null; paint(); });
    $$('[data-p-save]', V).forEach(b => b.onclick = async () => {
      const card = b.closest('.bz-card');
      b.disabled = true;
      const j = await api('/proposals/' + b.dataset.pSave + '/edit', 'POST', { title: $('[data-p-title]', card).value, summary: $('[data-p-summary]', card).value, boundary: $('[data-p-boundary]', card).value });
      b.disabled = false; if (j.error) return BB.toast(j.error); editingProp = null; BB.toast('Saved.'); await load();
    });
    $$('[data-p-reject]', V).forEach(b => b.onclick = async () => {
      const j = await api('/proposals/' + b.dataset.pReject + '/reject', 'POST', {}); if (j.error) return BB.toast(j.error); BB.toast('Rejected. It will not run.'); await load();
    });
    $$('[data-p-activate]', V).forEach(b => b.onclick = async () => {
      const card = b.closest('.bz-card'), title = $('.bz-prop-h b', card).textContent;
      if (!await askConfirm('Start "' + title + '"?', 'It will draft work for your review only. Nothing is sent, posted, purchased or connected.', 'Approve and start')) return;
      b.disabled = true; let j = await api('/proposals/' + b.dataset.pActivate + '/activate', 'POST', {});
      if (j.error === 'stale_evidence' && await askConfirm('Sources changed since this was drafted', (j.message || 'Review it against the current sources.') + ' Start it anyway?', 'Start anyway')) j = await api('/proposals/' + b.dataset.pActivate + '/activate', 'POST', { confirmStale: true });
      b.disabled = false; if (j.error) return BB.toast(j.message || j.error);
      BB.toast('Started. Bring it work below.'); await load();
    });
    $$('[data-toggle-resp]', V).forEach(el => el.onclick = () => { openResp[el.dataset.toggleResp] = !openResp[el.dataset.toggleResp]; paint(); });
    $$('[data-run]', V).forEach(b => b.onclick = async () => {
      const ta = $('[data-run-input="' + b.dataset.run + '"]', V), input = ta.value;
      if (!input.trim()) return BB.toast('Describe or paste the work first');
      b.disabled = true; b.textContent = 'Working…';
      const j = await api('/responsibilities/' + b.dataset.run + '/run', 'POST', { input });
      b.disabled = false; b.textContent = 'Do this work';
      if (j.error) return BB.toast(j.error);
      ta.value = ''; BB.toast('Draft ready.'); await load();
    });
    $$('[data-resp-pause]', V).forEach(b => b.onclick = async () => { const j = await api('/responsibilities/' + b.dataset.respPause + '/pause', 'POST', {}); if (j.error) return BB.toast(j.error); BB.toast('Paused. It does nothing while paused.'); await load(); });
    $$('[data-resp-resume]', V).forEach(b => b.onclick = async () => { const j = await api('/responsibilities/' + b.dataset.respResume + '/resume', 'POST', {}); if (j.error) return BB.toast(j.error); BB.toast('Resumed.'); await load(); });
    const cOn = $('#bz-consent-on', V); if (cOn) cOn.onclick = async () => { const eng = (B && B.engine) || {}; const j = await api('/provider-consent', 'POST', { host: eng.host, model: eng.model }); if (j.error) { BB.toast(j.error); if (j.code === 'consent_stale') await load(); return; } BB.toast('Provider processing allowed.'); await load(); };
    const cOff = $('#bz-consent-off', V); if (cOff) cOff.onclick = async () => { if (!await askConfirm('Withdraw provider processing?', 'No new work goes to the provider, including daily check-ins, until you allow it again. A run already in flight can finish; its draft stays in the history until you delete it.', 'Withdraw')) return; const j = await api('/provider-consent', 'DELETE'); if (j.error) return BB.toast(j.error); BB.toast('Withdrawn. No new work goes to the provider.'); await load(); };
    const pc = $('#bz-pend-cancel', V); if (pc) pc.onclick = async () => { const pendNow = B && B.opPending; if (!pendNow) return; if (!await askConfirm('Cancel the pending delete?', 'Records already deleted stay deleted; everything else is kept and work resumes.', 'Cancel the delete')) return; const j = await api('/data/delete', 'POST', { confirm: 'CANCEL', op: pendNow.op, id: pendNow.id || '', opId: pendNow.opId || '' }); if (j.error) { BB.toast(j.error); await load(); return; } BB.toast('Delete cancelled.'); await load(); };
    // Finish retries the ORIGINAL pending operation only - a narrower delete is never escalated
    // into a full purge from this card; a purge retry keeps its own typed-DELETE ceremony.
    const pf = $('#bz-pend-finish', V); if (pf) pf.onclick = async () => {
      const pendNow = B && B.opPending; if (!pendNow) return;
      let j = null;
      if (pendNow.op === 'purge') { const t = prompt('Finish deleting ALL business data in this workspace: sources, proposals, responsibilities, work history, provider consent and the activity log. One minimal receipt of the purge itself remains: an id, the time and item counts, with none of your text. Type DELETE to confirm.'); if (t !== 'DELETE') return; j = await api('/data/delete', 'POST', { confirm: 'DELETE', opId: pendNow.opId || '' }); }
      else if (pendNow.op === 'source_delete') j = await api('/sources/' + pendNow.id, 'DELETE', { opId: pendNow.opId || '' });
      else if (pendNow.op === 'resp_delete') j = await api('/responsibilities/' + pendNow.id + '/delete', 'POST', { confirm: 'DELETE', opId: pendNow.opId || '' });
      else return;
      if (j.error) { BB.toast(j.error); await load(); return; }
      BB.toast(pendNow.op === 'purge' ? 'All business data deleted.' : 'Delete finished.'); await load();
    };
    const pg = $('#bz-purge', V); if (pg) pg.onclick = async () => { const t = prompt('This deletes ALL business data in this workspace: sources, proposals, responsibilities, work history, provider consent and the activity log. One minimal receipt of the purge itself remains: an id, the time and item counts, with none of your text. Type DELETE to confirm.'); if (t !== 'DELETE') return; const j = await api('/data/delete', 'POST', { confirm: 'DELETE' }); if (j.error) { BB.toast(j.error); await load(); return; } BB.toast('All business data deleted.'); await load(); };
    $$('[data-resp-retire]', V).forEach(b => b.onclick = async () => { if (!await askConfirm('Retire this responsibility?', 'Its history stays visible.', 'Retire')) return; const j = await api('/responsibilities/' + b.dataset.respRetire + '/retire', 'POST', {}); if (j.error) return BB.toast(j.error); BB.toast('Retired.'); await load(); });
    $$('[data-resp-del]', V).forEach(b => b.onclick = async () => { if (!await askConfirm('Delete this responsibility?', 'Its work history is deleted with it. This cannot be undone.', 'Delete')) return; const j = await api('/responsibilities/' + b.dataset.respDel + '/delete', 'POST', {}); if (j.error) return BB.toast(j.error); BB.toast('Deleted with its history.'); await load(); });
  }

  BB.onRoute(r => { if (r.v !== 'business') return; if (dropIfStaleTenant()) { load(); return; } if (!B && !loading) load(); else paint(); });
  BB.on(() => { /* state syncs should not clobber an in-progress edit, but a workspace change invalidates everything */ if (!V.classList.contains('on')) return; if (dropIfStaleTenant()) { load(); return; } if (!B && !loading) load(); });
})();
