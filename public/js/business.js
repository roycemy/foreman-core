/* Alter · Business: teach Alter about the business from your own notes, review evidence-checked
   proposals for work it could take over, and run approved responsibilities as drafts.
   Proposals never run. Responsibilities only draft; nothing is sent, posted, purchased or connected. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, $$ = BB.$$, esc = BB.esc;
  const V = $('#v-business');
  let B = null, loading = false, loadErr = null, editingSrc = null, editingProp = null, openResp = {};

  const api = (p, m, b) => BB.api('/api/business' + p, m, b);
  async function load() { loading = true; let j = null; try { j = await api('/state'); } catch (e) { j = null; } loading = false; if (j && !j.error) { B = j; loadErr = null; } else if (!B) loadErr = (j && j.error) || 'Could not load the Business view. Try again.'; paint(); }

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
    const ev = (p.evidence || []).map(e => `<div class="bz-ev"><span class="bz-tick" title="This quote was checked against your source">✓</span><blockquote>${esc(e.excerpt)}</blockquote><small>${esc(e.sourceTitle || 'Source')} · v${e.sourceVersion}</small></div>`).join('');
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
        <p class="meta">Starting runs this responsibility inside the boundary above, plus a daily check-in. Your sources go to the reasoning engine on each run. Results are drafts for your review - nothing is sent, spent or connected.</p>
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
    if (rp.status === 'retired') return '';
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
        <div class="btns"><button class="b ink" data-run="${rp.id}">Do this work</button>${rp.status === 'active' ? `<button class="b out" data-resp-pause="${rp.id}">Pause</button>` : `<button class="b out" data-resp-resume="${rp.id}">Resume</button>`}<button class="b out" data-resp-retire="${rp.id}">Retire</button></div>
        <p class="meta">Alter also does a daily check-in on active responsibilities and leaves what it finds here. Results are drafts - they never leave Alter.</p>
        ${runs ? `<div class="bz-sech">History</div>${runs}` : '<p class="meta">No work done yet.</p>'}
      </div>` : ''}
    </div>`;
  }

  /* ---------- page ---------- */
  function paint() {
    if (!V.classList.contains('on')) return;
    if (!B) { V.innerHTML = loadErr ? '<div class="page-in narrow"><p style="margin-top:24px">' + esc(loadErr) + '</p><p class="meta"><button class="btn" data-biz-retry type="button">Try again</button></p></div>' : '<div class="page-in narrow"><p class="meta" style="margin-top:24px">Loading…</p></div>'; const rt = $('[data-biz-retry]', V); if (rt) rt.onclick = () => load(); return; }
    const eng = B.engine || {}, srcs = B.sources || [], props = (B.proposals || []).filter(p => p.status !== 'rejected'), resps = B.responsibilities || [];
    const engNote = eng.configured && eng.enabled ? '' :
      `<div class="bz-note">The reasoning engine ${eng.configured ? 'is connected but not enabled for this workspace' : 'is not connected yet'}. You can add sources now; proposals and work runs start once setup finishes. Nothing is simulated - Alter will not invent proposals without it.</div>`;
    const addForm = `<div class="bz-card"><div class="bz-sech">Add to what Alter knows</div>
      <div class="bz-kind"><button class="b out sm" data-kind="note" type="button">Note</button><button class="b out sm" data-kind="doc" type="button">Document</button></div>
      <label class="fld">Title<input class="in" id="bz-add-title" maxlength="120" placeholder="e.g. How last week actually went"></label>
      <label class="fld">Text<textarea class="in" id="bz-add-text" rows="6" maxlength="20000" placeholder="Paste notes, a call summary, a process doc…"></textarea></label>
      <div class="btns"><button class="b ink" id="bz-add">Add source</button></div>
      <p class="meta">Saved to your Alter workspace. When the reasoning engine is connected, a source's full text goes to it whenever you ask Alter to look for work, whenever you run a responsibility, and during each active responsibility's daily check-in.</p></div>`;
    const empty = !srcs.length ? `<div class="bz-hero"><h2>Teach Alter the business</h2>
      <p>1. Add notes or documents about how the business actually runs.<br>2. Alter proposes responsibilities it could take over, each backed by quotes from your own notes.<br>3. You approve what starts. Approved work runs as drafts you review - nothing is sent, spent or connected.</p></div>` : '';
    const propSec = srcs.length ? `<div class="bz-sech row"><span>What Alter could take over</span><button class="b ink sm" id="bz-discover" ${eng.configured && eng.enabled ? '' : 'disabled'}>Look for work</button></div>
      ${engNote}
      ${props.length ? props.map(propCard).join('') : '<p class="meta">No proposals yet. Ask Alter to look for work once you have added sources.</p>'}` : '';
    const respSec = resps.length ? `<div class="bz-sech">Running with your approval</div>${resps.map(respCard).join('')}` : '';
    const logSec = (B.log && B.log.length) ? `<div class="bz-sech">Recent activity</div><div class="bz-log">${B.log.slice(0, 8).map(l => `<div><small>${BB.when(l.at)} · ${esc(logLine(l))}</small></div>`).join('')}</div>` : '';
    V.innerHTML = `<div class="page-in narrow"><div class="page-h"><div><h1>Business</h1><p class="sub">Teach Alter the business. Approve what it takes over.</p></div></div>
      ${empty}${srcs.length ? `<div class="bz-sech">What Alter knows</div>${srcs.map(srcRow).join('')}` : ''}${addForm}${propSec}${respSec}${logSec}</div>`;
    bind();
  }
  function logLine(l) {
    return { source_added: 'Source added: ' + (l.title || ''), source_edited: 'Source edited (v' + l.fromVersion + ' → v' + l.toVersion + ')', source_deleted: 'Source deleted: ' + (l.title || ''),
      discover: 'Looked for work: ' + l.proposals + ' proposal' + (l.proposals === 1 ? '' : 's') + (l.droppedEvidence ? ' · ' + l.droppedEvidence + ' unverifiable quote' + (l.droppedEvidence === 1 ? '' : 's') + ' dropped' : ''),
      proposal_edited: 'Proposal edited', proposal_rejected: 'Proposal rejected: ' + (l.title || ''),
      responsibility_activated: 'Started: ' + (l.title || ''), responsibility_paused: 'Paused: ' + (l.title || ''), responsibility_resumed: 'Resumed: ' + (l.title || ''), responsibility_retired: 'Retired: ' + (l.title || ''),
      run: (l.runKind === 'daily' ? 'Daily check-in' : 'Work run') + (l.usage ? ' · ' + tok(l.usage) + ' tokens' : '') }[l.kind] || l.kind;
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
      if (!await askConfirm('Delete this source?', 'Proposals that quoted it keep their copy of the quote.', 'Delete')) return;
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
    $$('[data-resp-retire]', V).forEach(b => b.onclick = async () => { if (!await askConfirm('Retire this responsibility?', 'Its history stays visible.', 'Retire')) return; const j = await api('/responsibilities/' + b.dataset.respRetire + '/retire', 'POST', {}); if (j.error) return BB.toast(j.error); BB.toast('Retired.'); await load(); });
  }

  BB.onRoute(r => { if (r.v === 'business' && !B && !loading) load(); else if (r.v === 'business') paint(); });
  BB.on(() => { /* state syncs should not clobber an in-progress edit */ if (V.classList.contains('on') && !B && !loading) load(); });
})();
