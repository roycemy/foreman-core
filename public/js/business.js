/* Alter · Business: teach Alter about the business from your own notes, review evidence-checked
   proposals for work it could take over, and run approved responsibilities as drafts.
   Proposals never run. Responsibilities only draft; nothing is sent, posted, purchased or connected. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, $$ = BB.$$, esc = BB.esc;
  const V = $('#v-business');
  let B = null, loading = false, loadErr = null, editingSrc = null, editingProp = null, openResp = {}, pendingApproval = null, pendingDelegation = null, pendingDiscovery = null, pendingSchedule = null, schedGen = 0, pollT = null;
  // Identity objects are rebuilt on every flip: compare by VALUE, never by reference.
  const sameId = (a, b) => a && b && a.e === b.e && a.w === b.w;
  // Draft operation state is SERVER-OWNED: the deployment durably records each create's intent
  // BEFORE the provider effect, holds one in-flight operation per owner+connection, and keeps
  // unresolved (unconfirmed) receipts until the owner's explicit checked-Gmail acknowledgment.
  // The browser stores none of it - no localStorage, no in-memory gate, no body anywhere.
  const fetchDraftOps = async () => { const j = await api('/apps/gmail/draft-ops'); if (j && Array.isArray(j.ops)) return j; return { error: (j && j.error) || 'unavailable', ops: null }; };
  const draftFpSha = async (to, subject, text) => { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('v1:' + JSON.stringify([to, subject, text]))); return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }; // exact payload identity - canonicalization must match the server byte for byte

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
    if (stamp !== identity()) return; // ownership changed mid-flight (including unknown -> known at first auth): discard - the sync/route handler already cleared the DOM and will reload under the resolved identity
    inflightId = null;
    if (j && !j.error) { B = j; loadedId = stamp; loadErr = null; appLanding(); } else if (!B) loadErr = (j && j.error) || 'Could not load the Business view. Try again.';
    paint();
  }
  // OAuth return landing: the callback redirects to #business/app-<outcome>. Announce it once,
  // from the LIVE state where possible, then clear the marker so a refresh never re-announces.
  function appLanding() {
    const m = location.hash.match(/^#business\/app-(connected|declined|uncertain|failed)$/);
    if (!m) return;
    history.replaceState(null, '', '#business');
    const g = B && B.apps && B.apps.gmail;
    // A stored record (connected, needs-reconnect, or otherwise known) is never claimed absent;
    // an UNKNOWN status makes no absence claim at all.
    const hasRec = g && (g.connected || g.email || g.connectedAt || (g.status && g.status !== 'not_connected'));
    const kept = g && g.connected ? 'the existing connection is unchanged.' : hasRec ? 'the stored connection is unchanged.' : null;
    if (m[1] === 'connected') BB.toast(g && g.connected && g.email ? 'Gmail connected as ' + g.email + '.' : 'The Gmail sign-in finished - the card shows the current state.');
    else if (m[1] === 'declined') BB.toast('Google declined the new sign-in - ' + (kept || (g ? 'nothing was connected.' : 'the card shows the current state.')));
    else if (m[1] === 'uncertain') BB.toast('Google did not confirm whether the sign-in finished. ' + (kept ? 'The card shows the current state - ' + kept + ' ' : 'The card shows the current state. ') + 'An older attempt may have left access at Google: check third-party access in the Google account and remove anything you do not recognize, then try again.');
    else BB.toast('The new sign-in could not be finished - ' + (kept || (g ? 'nothing was connected. Start the connection again.' : 'the card shows the current state.')));
  }
  function dropIfStaleTenant() {
    identity(); // bumps the generation when the account or workspace changed
    // The shell routes before /api/me lands, so an early load runs under an UNKNOWN identity
    // (stamp and loadedId stay null). Such state has no verified owner: once the identity is
    // known, loadedId !== curId marks it stale exactly like a cross-account residue.
    const known = !!(curId && (curId.e || curId.w));
    const stale = (B && known && loadedId !== curId) || (inflightId && inflightId !== curId);
    if (stale) {
      B = null; loadErr = null; editingSrc = null; editingProp = null; openResp = {}; loadedId = null;
      pendingApproval = null; // A's reviewed pages and work text never survive into another identity
      pendingDelegation = null; // same for a reviewed delegation payload
      pendingDiscovery = null; // and a reviewed discovery scan payload
      pendingSchedule = null; schedGen++; // and a reviewed daily-schedule payload
      if (window.BB && BB.closeModal) BB.closeModal(); // private dialogs (the draft composer carries receipts + typed words) never survive an identity change
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
    if (p.status === 'active') return `<div class="bz-card" data-prop="${p.id}">
      <div class="bz-prop-h"><div class="t"><b>${esc(p.title)}</b><small>${p.bot ? 'Mapped by ' + esc(p.bot.name) + ' from your sources' : 'Drafted from your sources'} · ${BB.when(p.createdAt)}</small></div>${chip('Started', 'ok')}</div>
      <p class="meta">Approved - it runs under your approval in the responsibilities below.</p>
    </div>`; // a decided proposal is a record, never a pending decision again
    const editing = editingProp === p.id;
    const ev = (p.evidence || []).map(e => e && e.excerptDeleted
      ? `<div class="bz-ev"><blockquote class="bz-ev-del">Quote removed - its source was deleted.</blockquote><small>${esc(e.sourceTitle || 'Source')}</small></div>`
      : `<div class="bz-ev"><span class="bz-tick" title="This quote was checked against your source">✓</span><blockquote>${esc(e.excerpt)}</blockquote><small>${esc(e.sourceTitle || 'Source')} · v${e.sourceVersion}</small></div>`).join('');
    const un = (p.unknowns || []).map(u => `<li>${esc(u)}</li>`).join('');
    const sys = (p.systems || []).map(s => chip(s)).join('');
    return `<div class="bz-card" data-prop="${p.id}">
      <div class="bz-prop-h"><div class="t"><b>${esc(p.title)}</b><small>${p.bot ? 'Mapped by ' + esc(p.bot.name) + ' from your sources · every quote checked against them' : 'Drafted by the reasoning engine from your sources'} · ${BB.when(p.createdAt)}${p.editedByOwner ? ' · edited by you' : ''}</small></div>${chip('Proposal · not running', 'dim')}${staleBadge(p)}</div>
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
        ${p.bot
          ? `<p class="meta">Starting runs this responsibility inside the boundary above. Work you bring goes to <b>${esc(p.bot.name)}</b> - you review the exact text before anything leaves, and the draft comes back here. Alter does not send drafts anywhere and cannot verify what the bot does with the text it receives. Daily check-ins and web-page reading use the reasoning engine and are not turned on for this responsibility.</p>`
          : `<p class="meta">Starting runs this responsibility inside the boundary above, plus a daily check-in. On each run the first 4,000 characters of every source go to the reasoning engine. If a bot is connected, work you bring goes to it instead - you review the exact text first. Results come back here as drafts for your review. Alter does not send them anywhere, and cannot verify what a connected bot does with the text it receives.</p>
        <label class="fld bz-check"><input type="checkbox" data-p-research> Let it read public web pages during runs. Before each run you approve the exact pages it may read (chosen from URLs in your sources or the work you bring). It cannot search the web and it cannot visit pages you did not approve. Approved pages also go to the reasoning engine during those runs.</label>`}
        <div class="btns"><button class="b ink" data-p-activate="${p.id}">Approve and start</button><button class="b out" data-p-edit="${p.id}">Edit</button><button class="b out" data-p-reject="${p.id}">Reject</button></div>`}
    </div>`;
  }

  /* ---------- responsibilities ---------- */
  function runItem(run) {
    const botName = run.bot && run.bot.name ? run.bot.name : 'the connected bot';
    const head = `<div class="bz-run-h"><small>${run.kind === 'daily' ? 'Daily check-in' : run.kind === 'auto' ? 'Automatic run · scheduled by you' : 'You brought work'} · ${BB.when(run.at)}${run.usage ? ' · ' + esc(tok(run.usage)) + ' tokens' : ''}</small></div>`;
    const rin = run.input ? `<p class="bz-run-in">${esc(run.input.length > 240 ? run.input.slice(0, 240) + '…' : run.input)}</p>` : '';
    if (run.status === 'delegated' || run.status === 'running') {
      const j = run.job || null;
      const state = !j || j.status === 'queued' ? 'Sent. Waiting for it to pick the job up.'
        : j.status === 'running' ? 'Working on it' + (j.startedAt ? ' since ' + BB.when(j.startedAt) : '') + '.'
        : j.status === 'missing' ? 'The job record is gone, so this run cannot finish.'
        : 'Finishing up.';
      return `<div class="bz-run">${head}${rin}
        <div class="bz-draft"><span class="bzc dim">With ${esc(botName)}</span><p>${esc(state)} Its report lands here as a draft for your review.</p></div>
        ${j && (j.status === 'queued' || j.status === 'running') && run.taskId ? `<div class="btns"><button class="b out sm" data-run-stop="${esc(run.taskId)}" type="button">Stop this job</button></div>` : ''}
      </div>`;
    }
    const failedText = run.failureReason === 'engine_malformed_output' ? 'The engine replied in a format Alter could not use, so nothing was drafted.'
      : run.failureReason === 'bot_stalled' ? botName + ' stopped making progress, so the job auto-stopped. Nothing was drafted.'
      : run.failureReason === 'owner_stopped' ? 'You stopped the job. Nothing was drafted.'
      : run.failureReason === 'source_deleted' ? 'A source this run sent was deleted, so the job was cancelled. Nothing was drafted.'
      : run.failureReason === 'data_deleted' ? 'The business data was deleted, so the job was cancelled.'
      : run.failureReason === 'bot_failed' ? botName + ' could not finish' + (run.failureDetail ? ': ' + run.failureDetail : '.')
      : 'The engine did not produce a draft this run.';
    const doneChip = run.backend === 'linked-bot'
      ? `<span class="bzc">Draft from ${esc(botName)}${run.bot && run.bot.reassignedFrom ? ' (reassigned from ' + esc(run.bot.reassignedFrom) + ')' : ''} · bot-reported - Alter did not verify it · Alter sent nothing onward</span>`
      : `<span class="bzc">Draft · Alter sent nothing onward</span>`;
    return `<div class="bz-run">
      ${head}
      ${rin}
      ${run.status === 'failed' ? `<div class="bz-draft"><span class="bzc warn">Run failed</span><p>${esc(failedText)}</p></div>` : `<div class="bz-draft">${doneChip}<p>${esc(run.output)}</p></div>`}
      ${run.blockedStep ? `<p class="bz-blocked">Did not do: ${esc(run.blockedStep)}</p>` : ''}
      ${run.fetchedPages && run.fetchedPages.length ? `<p class="meta">Pages read this run: ${run.fetchedPages.filter(x => x.ok).length}${run.fetchedPages.some(x => !x.ok) ? ' · ' + run.fetchedPages.filter(x => !x.ok).length + ' not read (' + run.fetchedPages.filter(x => !x.ok).map(x => x.scrubbedWithSource ? 'removed with its source' : x.error === 'url_not_approved' ? 'not an approved page' : x.error === 'url_too_long' ? 'address too long to use' : x.error === 'ssrf_blocked' ? 'not a public page' : 'could not be read').join(', ') + ')' : ''}</p>` : ''}
      ${run.citations && run.citations.length ? `<div class="bz-cites">${run.citations.map(c => { const u = c.finalUrl || c.url; let h = u, safe = ''; try { const pu = new URL(u); if (pu.protocol === 'http:' || pu.protocol === 'https:') { safe = u; h = pu.host; } } catch (e) {} const label = c.located ? 'Quote found on page' : c.reason === 'page_not_fetched' ? 'Page not read this run' : c.reason === 'excerpt_too_short' || c.reason === 'excerpt_too_long' ? 'Quote not usable' : 'Quote not found on page'; return `<div class="bz-cite">${chip(label, c.located ? 'ok' : 'warn')}<p>${esc(c.quote)}</p>${c.located && safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer nofollow">${esc(h)}</a>` : `<small>${esc(u)}</small>`}</div>`; }).join('')}</div>` : ''}
      ${run.nextSteps && run.nextSteps.length ? `<div class="bz-next"><div class="bz-sech">Suggested next steps</div><ul>${run.nextSteps.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
  }
  function respCard(rp) {
    const engC = (B && B.engine) || {};
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
        <div class="bz-chips">${chip('Drafts only')}${chip('Nothing is sent')}${chip('No spending')}${chip('You review outputs')}${rp.research ? chip('Reads public pages') : ''}</div>
        <p class="bz-sum">${esc(rp.summary)}</p>
        <p class="meta">Boundary you approved: ${esc(rp.boundary)}</p>
        <label class="fld">Bring it work<textarea class="in" data-run-input="${rp.id}" rows="3" maxlength="4000" placeholder="Paste an email to answer, a question, a request…"></textarea></label>
        ${B.delegate && !rp.research ? `<p class="meta">Goes to <b>${esc(B.delegate.name)}</b>${B.delegate.connection && B.delegate.connection.status !== 'active' ? ' - not connected right now; it picks work up when it connects' : ''}. You review the exact text before it goes to the bot.</p>` : ''}
        ${rp.bot && !rp.research ? `<div class="bz-sched">${rp.schedule ? `
          <p class="meta">${chip('Schedule saved', 'dim')} <b>Not live yet.</b> Automatic daily sends have no live trigger on this deployment, so nothing is sent for now. Once they are switched on, the exact text you reviewed goes to <b>${esc(B.delegate ? B.delegate.name : 'the connected bot')}</b> once a day, and its report comes back here as a draft - Alter sends nothing onward.${rp.schedule.lastQueuedAt ? ' Last queued ' + BB.when(rp.schedule.lastQueuedAt) + '.' : ''}</p>
          ${rp.schedule.needsReview ? `<p class="bz-blocked">Schedule paused: the sources or this responsibility changed since you reviewed the daily text. Review the new text to resume it.</p>` : ''}
          <div class="btns"><button class="b out sm" data-sched-edit="${rp.id}" type="button">${rp.schedule.needsReview ? 'Review and resume' : 'Change the daily instruction'}</button><button class="b out sm" data-sched-off="${rp.id}" type="button">Turn schedule off</button></div>`
        : `<p class="meta">Not scheduled. You can save a standing daily instruction for the connected bot - you review the exact text first, and the schedule pauses itself if anything it would send changes afterward. Automatic sends are not live on this deployment yet; saving a schedule sends nothing.</p>
          <div class="btns"><button class="b out sm" data-sched-on="${rp.id}" type="button">Set a daily schedule</button></div>`}
          ${pendingSchedule && pendingSchedule.respId === rp.id ? `<div class="bz-card bz-approve"><div class="bz-sech">${pendingSchedule.delegation ? 'Review the exact daily text' : 'Write the daily instruction'}</div>
            ${!pendingSchedule.delegation ? `<p class="meta">Once automatic sends are live, this exact instruction - with the linked sources shown after you review - goes to the bot once a day. The bot's report comes back here as a draft. Saving this schedule sends nothing for now.</p>
            <label class="fld">Standing instruction<textarea class="in" data-sched-input rows="3" maxlength="4000">${esc(pendingSchedule.instruction)}</textarea></label>
            <div class="btns"><button class="b ink" data-sched-preview type="button">Review the daily text</button><button class="b out" data-sched-cancel type="button">Cancel</button></div>`
          : (() => { const d = pendingSchedule.delegation, conn = (d.bot && d.bot.connection) || {};
            const presence = conn.lastRealCallAt && (Date.now() - new Date(conn.lastRealCallAt).getTime()) < 15*60e3 ? 'heard from in the last 15 minutes' : conn.lastRealCallAt ? 'paired - last heard from ' + BB.when(conn.lastRealCallAt) + '; it picks the job up when it connects' : 'paired - not heard from yet; it picks the job up when it connects';
            return `<p class="meta">Destination once automatic sends are live: <b>${esc(d.bot.name)}</b>${d.bot.providerId ? ' (' + esc(d.bot.providerId) + ')' : ''} - ${esc(presence)}. Saving sends nothing now; when live, this text leaves Alter to that bot through its own connection once a day. How the bot processes or keeps it is between you and the bot's provider. If your sources or this responsibility change, the schedule pauses until you review the new text.</p>
            <p class="meta">Instructions (exact text):</p><p class="bz-reviewed">${esc(d.brief)}</p>
            <p class="meta">Work and sources (exact text):</p><p class="bz-reviewed">${esc(d.context)}</p>
            <p class="meta">${d.sources && d.sources.length ? 'Included sources: ' + d.sources.map(s => esc(s.title) + ' v' + s.version).join(', ') + '.' : 'No sources are linked to this responsibility - only the instruction text goes.'}${d.omittedSources && d.omittedSources.length ? ' Not included: ' + d.omittedSources.map(s => esc(s.title)).join(', ') + '.' : ''}</p>
            <div class="btns"><button class="b ink" data-sched-enable type="button">Save the daily schedule</button><button class="b out" data-sched-back type="button">Back</button><button class="b out" data-sched-cancel type="button">Cancel</button></div>`; })()}
          </div>` : ''}</div>` : ''}
        <div class="btns"><button class="b ink" data-run="${rp.id}">Do this work</button>${rp.status === 'active' ? `<button class="b out" data-resp-pause="${rp.id}">Pause</button>` : `<button class="b out" data-resp-resume="${rp.id}">Resume</button>`}<button class="b out" data-resp-retire="${rp.id}">Retire</button><button class="b danger" data-resp-del="${rp.id}">Delete</button></div>
        ${pendingApproval && pendingApproval.respId === rp.id ? `<div class="bz-card bz-approve"><div class="bz-sech">Approve pages for this run</div>
          <p class="meta">Work being run (exactly as reviewed):</p><p class="bz-reviewed">${esc(pendingApproval.input)}</p>
          <p class="meta">These exact URLs appear in your sources or work item. Alter can read only the ones you check, for this run only - it cannot search the web or visit anything else. Checked pages go to the reasoning engine during the run.</p>
          ${pendingApproval.urls.map(u => `<label class="bz-urlrow"><input type="checkbox" data-appr-url value="${esc(u)}"${(pendingApproval.checked || []).includes(u) ? ' checked' : ''}><span class="bz-url">${esc(u)}</span>${pendingApproval.flagged.includes(u) ? chip('Looks like a signed or private link - review carefully', 'warn') : ''}</label>`).join('')}
          <div class="btns"><button class="b ink" data-appr-run type="button">Run with checked pages</button><button class="b out" data-appr-cancel type="button">Cancel</button></div></div>` : ''}
        ${pendingDelegation && pendingDelegation.respId === rp.id ? (() => { const d = pendingDelegation.delegation, conn = (d.bot && d.bot.connection) || {};
          const presence = conn.lastRealCallAt && (Date.now() - new Date(conn.lastRealCallAt).getTime()) < 15*60e3 ? 'heard from in the last 15 minutes' : conn.lastRealCallAt ? 'paired - last heard from ' + BB.when(conn.lastRealCallAt) + '; it picks the job up when it connects' : 'paired - not heard from yet; it picks the job up when it connects';
          return `<div class="bz-card bz-approve"><div class="bz-sech">Review exactly what goes to ${esc(d.bot.name)}</div>
          <p class="meta">Destination: <b>${esc(d.bot.name)}</b>${d.bot.providerId ? ' (' + esc(d.bot.providerId) + ')' : ''} - ${esc(presence)}. This text leaves Alter to that bot through its own connection. How the bot processes or keeps it is between you and the bot's provider: Alter does not control or verify it, and a connected personal bot account is not a separate private space for this business's data.</p>
          <p class="meta">Instructions (exact text):</p><p class="bz-reviewed">${esc(d.brief)}</p>
          <p class="meta">Work and sources (exact text):</p><p class="bz-reviewed">${esc(d.context)}</p>
          <p class="meta">${d.sources && d.sources.length ? 'Included sources: ' + d.sources.map(s => esc(s.title) + ' v' + s.version + (s.chars < s.totalChars ? ' (first ' + s.chars.toLocaleString() + ' of ' + s.totalChars.toLocaleString() + ' characters)' : '')).join(', ') + '.' : 'No sources are linked to this responsibility - only the work text goes.'}${d.omittedSources && d.omittedSources.length ? ' Not included (no room in one job): ' + d.omittedSources.map(s => esc(s.title)).join(', ') + '.' : ''}</p>
          <p class="meta">The report comes back here as a draft. Alter does not send it anywhere and cannot verify what the bot did with the text.</p>
          <div class="btns"><button class="b ink" data-dele-run type="button">Send to ${esc(d.bot.name)}</button><button class="b out" data-dele-cancel type="button">Cancel</button></div></div>`; })() : ''}
        ${rp.bot ? `<p class="meta">Results come back here as drafts - Alter does not send them anywhere.</p>` : engC.consent && engC.consent.current ? `<p class="meta">Alter also does a daily check-in on active responsibilities and leaves what it finds here. Results come back here as drafts - Alter does not send them anywhere.${rp.research ? ' When it reads owner-approved pages during a run, those pages go to the reasoning engine too.' : ''}</p>` : `<p class="meta">Results come back here as drafts - Alter does not send them anywhere. Daily check-ins use the reasoning engine and are off in this workspace.</p>`}
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
      `<div class="bz-note">The reasoning engine ${eng.configured ? 'is connected but not enabled for this workspace' : 'is not connected yet'}. ${B.delegate ? 'You can add sources and map the business with ' + esc(B.delegate.name) + ' now; engine runs and daily check-ins start once setup finishes.' : 'You can add sources now; proposals and work runs start once setup finishes.'} Nothing is simulated: proposals come only from a real provider or bot answer - Alter never writes them itself. Every quote is checked against your sources and non-matching quotes are dropped; Alter does not verify the answer's reasoning or whether a proposal is a good fit.</div>`;
    const addForm = `<div class="bz-card" id="bz-add-form"><div class="bz-sech">Add to what Alter knows</div>
      <div class="bz-kind"><button class="b out sm" data-kind="note" type="button">Note</button><button class="b out sm" data-kind="doc" type="button">Document</button></div>
      <label class="fld">Title<input class="in" id="bz-add-title" maxlength="120" placeholder="e.g. How last week actually went"></label>
      <label class="fld">Text<textarea class="in" id="bz-add-text" rows="6" maxlength="20000" placeholder="Paste notes, a call summary, a process doc…"></textarea></label>
      <div class="btns"><button class="b ink" id="bz-add">Add source</button><button class="b out" id="bz-add-file" type="button">Add from file</button><input type="file" id="bz-file" accept=".txt,.md,.markdown,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json" style="display:none"></div>
      <p class="meta">Add from file reads a plain-text file (.txt, .md, .csv, .json, .log) on this device into the form for your review - the file itself is not uploaded. PDF and Word files are not readable yet.</p>
      <p class="meta">Saved to your Alter workspace. When the reasoning engine is connected, looking for work sends each source's full saved text (up to 20,000 characters per source); each responsibility run or daily check-in sends the first 4,000 characters of every source plus the work you bring. For a responsibility you allow to read public pages, the pages it reads during a run go to the engine too. When a bot is connected, work you delegate sends it the exact text you review at run time instead.</p></div>`;
    const empty = !srcs.length ? `<div class="bz-hero"><h2>Teach Alter the business</h2>
      <p>1. Add notes or documents about how the business actually runs.<br>2. Alter proposes responsibilities it could take over, each backed by quotes from your own notes.<br>3. You approve what starts. Approved work comes back as drafts you review - Alter does not send the results anywhere.</p></div>` : '';
    // Provider consent card: exact host+model, what is sent, withdraw any time. The gate is
    // server-side (engine_no_consent covers manual runs AND daily check-ins); this is its control.
    const consentCard = eng.configured && eng.enabled ? `<div class="bz-card"><div class="bz-sech">Reasoning provider</div>
      ${eng.consent && eng.consent.current ? `<p class="meta">Provider processing is <b>on</b> for ${esc(eng.consent.host)} (${esc(eng.consent.model)}), allowed ${BB.when(eng.consent.at)}. While on, looking for work sends each source's full saved text to this provider; each run or daily check-in sends the first 4,000 characters of every source plus the work you bring. For a responsibility you allow to read public pages, the exact pages it reads during a run go to this provider too.</p>
      <div class="btns"><button class="b out sm" id="bz-consent-off">Withdraw provider processing</button></div>` :
      `<p class="meta">Alter's reasoning provider is <b>${esc(eng.host || 'unknown')}</b> using model <b>${esc(eng.model || 'unknown')}</b>. While allowed, looking for work sends each source's full saved text to this provider; each run or daily check-in sends the first 4,000 characters of every source plus the work you bring. For a responsibility you allow to read public pages, the exact pages it reads during a run go to this provider too.${eng.consent && !eng.consent.current ? ' Your earlier allowance no longer matches the configured provider - review and choose again.' : ''}</p>
      <div class="btns"><button class="b ink sm" id="bz-consent-on">Allow provider processing</button></div>`}
      <p class="meta">Source text is treated as data, not instructions, but no system can promise a hostile document cannot influence the engine's behavior. Results are drafts for your review.</p></div>` : '';
    const dataCard = `<div class="bz-card"><div class="bz-sech">Your data</div>
      <p class="meta">Your business data is stored in Alter's hosted database. There is no app-level encryption: the workspace owner and Alter's platform operator can access stored data operationally. The activity log above records key owner actions in this workspace (adding, editing and deleting sources, proposals, runs, consent changes); it is not an audit of operator access.</p>
      <p class="meta">Deleting a source removes the source, the proposal quotes that matched it, and page addresses copied from it into research run records: approved-page lists, fetched-page entries and citations that reference them. An address that appears in the source is removed even if you also pasted it into a work item - the work item text you pasted stays as your own record. Work derived from the source - proposal text, responsibilities, run drafts and suggested next steps, which can reflect its content - is kept as your reviewable record, and activity entries can still mention a deleted item's title; that history is intentional. Deleting a responsibility removes that responsibility and its runs only. Only deleting all business data removes sources, proposals, responsibilities, work history, provider consent and the activity log from Alter's database; one minimal receipt of the purge itself remains there (an id, the time and item counts, none of your text). Content already sent to the reasoning provider is governed by that provider's own retention, and platform infrastructure backups are outside this deletion.</p>
      <p class="meta">Work you send to a connected bot leaves Alter through the bot's own connection; what the bot's provider processes or keeps is governed by that provider, and a connected personal bot account is not a separate private space for this business's data. Deleting a source cancels a pending delegated job that used it; deleting a responsibility cancels its pending delegated jobs; deleting all business data cancels every pending delegated job and removes every delegated job record with it.</p>
      <div class="btns"><button class="b danger sm" id="bz-purge">Delete all business data</button></div></div>`;
    const latestDisc = (B.discoveries || [])[0] || null;
    const discLive = latestDisc && (latestDisc.status === 'delegated' || latestDisc.status === 'running') ? latestDisc : null;
    const discFailed = !discLive && latestDisc && latestDisc.status === 'failed' ? latestDisc : null;
    const discCard = discLive ? (() => { const j = discLive.job || null;
        const state = !j || j.status === 'queued' ? 'Sent. Waiting for it to pick the job up.'
          : j.status === 'running' ? 'Working on it' + (j.startedAt ? ' since ' + BB.when(j.startedAt) : '') + '.'
          : j.status === 'missing' ? 'The job record is gone, so this scan cannot finish.'
          : 'Finishing up.';
        return `<div class="bz-card"><div class="bz-sech">Business scan · with ${esc(discLive.bot.name)}</div>
          <p class="meta">${esc(state)} Its answer is checked against your sources before any proposal appears - quotes that do not match are dropped.</p>
          ${j && (j.status === 'queued' || j.status === 'running') && discLive.taskId ? `<div class="btns"><button class="b out sm" data-run-stop="${esc(discLive.taskId)}" type="button">Stop this scan</button></div>` : ''}</div>`; })()
      : discFailed ? `<div class="bz-card"><div class="bz-sech">Business scan · with ${esc(discFailed.bot.name)}</div>
          <p class="meta">The scan did not finish${discFailed.failureReason === 'bot_stalled' ? ': the bot went quiet and the job was stopped' : discFailed.failureReason === 'owner_stopped' ? ': you stopped it' : discFailed.failureReason === 'source_deleted' ? ': a source it used was deleted' : discFailed.failureReason === 'data_deleted' ? ': the business data was deleted' : discFailed.failureReason === 'workspace_changed' ? ': the workspace changed while it was being created' : discFailed.failureDetail ? ': ' + esc(String(discFailed.failureDetail).replace(/\.+$/, '')) : ''}. No proposals were drafted from it.</p></div>`
      : '';
    const propSec = srcs.length ? `<div class="bz-sech row" id="bz-proposals"><span>What Alter could take over</span><span><button class="b ink sm" id="bz-discover" ${eng.configured && eng.enabled && eng.consent && eng.consent.current ? '' : 'disabled'}>Look for work</button>${B.delegate ? ` <button class="b ink sm" id="bz-discover-bot">Map with ${esc(B.delegate.name)}</button>` : ''}</span></div>
      ${engNote}
      ${B.delegate ? `<p class="meta">Map with ${esc(B.delegate.name)} sends your sources to that bot after you review the exact text. Its answer is checked against your sources - quotes that do not match are dropped - and proposals come back here as drafts. Alter does not send the answer anywhere and cannot verify what the bot does with the text it receives.</p>` : ''}
      ${discCard}
      ${pendingDiscovery ? (() => { const d = pendingDiscovery.delegation, conn = (d.bot && d.bot.connection) || {};
        const presence = conn.lastRealCallAt && (Date.now() - new Date(conn.lastRealCallAt).getTime()) < 15*60e3 ? 'heard from in the last 15 minutes' : conn.lastRealCallAt ? 'paired - last heard from ' + BB.when(conn.lastRealCallAt) + '; it picks the job up when it connects' : 'paired - not heard from yet; it picks the job up when it connects';
        return `<div class="bz-card bz-approve"><div class="bz-sech">Review exactly what goes to ${esc(d.bot.name)} for the scan</div>
        <p class="meta">Destination: <b>${esc(d.bot.name)}</b>${d.bot.providerId ? ' (' + esc(d.bot.providerId) + ')' : ''} - ${esc(presence)}. This text leaves Alter to that bot through its own connection. How the bot processes or keeps it is between you and the bot's provider: Alter does not control or verify it, and a connected personal bot account is not a separate private space for this business's data.</p>
        <p class="meta">Instructions (exact text):</p><p class="bz-reviewed">${esc(d.brief)}</p>
        <p class="meta">Sources (exact text):</p><p class="bz-reviewed">${esc(d.context)}</p>
        <p class="meta">${d.sources && d.sources.length ? 'Included sources: ' + d.sources.map(s => esc(s.title) + ' v' + s.version).join(', ') + '.' : 'No sources fit in one scan job.'}${d.omittedSources && d.omittedSources.length ? ' Not included (no room in one job): ' + d.omittedSources.map(s => esc(s.title)).join(', ') + '.' : ''}</p>
        <p class="meta">The answer comes back here. Alter checks every quote against your sources and drops what does not match; proposals are drafts for your review. Alter does not send the answer anywhere and cannot verify what the bot did with the text.</p>
        <div class="btns"><button class="b ink" data-disc-run type="button">Send scan to ${esc(d.bot.name)}</button><button class="b out" data-disc-cancel type="button">Cancel</button></div></div>`; })() : ''}
      ${props.length ? props.map(propCard).join('') : '<p class="meta">No proposals yet. Ask Alter to look for work once you have added sources.</p>'}` : '';
    /* ---------- HQ: the business's home base. Everything shown derives from live state:
       needs-you items, the plate, and the profile - nothing is invented or padded. ---------- */
    const profile = B.profile || null;
    const draftProps = props.filter(p => p.status === 'draft');
    const liveResps = resps.filter(rp => rp.status === 'active'), pausedResps = resps.filter(rp => rp.status === 'paused');
    const appG = (B.apps && B.apps.gmail) || null;
    const needs = [];
    if (draftProps.length) needs.push({ label: draftProps.length + ' proposal' + (draftProps.length === 1 ? ' is' : 's are') + ' waiting for your review', cta: 'Review', target: '#bz-proposals' });
    if (discLive) needs.push({ label: 'A business scan is still working - its proposals appear here when it finishes' });
    if (discFailed) needs.push({ label: 'The last business scan did not finish. No proposals were drafted from it.' });
    if (B.delegate && B.delegate.connection && B.delegate.connection.status !== 'active') needs.push({ label: B.delegate.name + ' is not connected right now - delegated work waits for it to reconnect' });
    for (const rp of liveResps) if (rp.schedule && rp.schedule.needsReview) needs.push({ label: '"' + rp.title + '" schedule paused - the text it would send changed since your review', cta: 'Review', target: '[data-resp="' + rp.id + '"]' });
    if (appG && (appG.connected || appG.email || appG.connectedAt || (appG.status && appG.status !== 'not_connected'))) {
      if (!appG.connected) needs.push({ label: (appG.label || 'Gmail') + (appG.email ? ' (' + appG.email + ')' : '') + ' needs reconnecting - inbox reading and drafts are paused until then', cta: 'Review', target: '#bz-apps-card' });
      if (appG.grantStatus === 'revoke_unconfirmed') needs.push({ label: 'A ' + (appG.label || 'Gmail') + ' removal was not confirmed - the Google account may still list the connection', cta: 'Review', target: '#bz-apps-card' });
    }
    const botRespsNoBot = !B.delegate ? liveResps.filter(rp => rp.bot).length : 0;
    if (botRespsNoBot) needs.push({ label: botRespsNoBot + (botRespsNoBot === 1 ? ' responsibility runs' : ' responsibilities run') + ' on a bot, and no bot is connected', cta: 'Connect a bot', target: 'connect' });
    const plate = liveResps.map(rp => {
      const last = (rp.runs || [])[0];
      const lastTxt = !last ? 'no runs yet'
        : (last.status === 'delegated' || last.status === 'running') ? 'a run is with ' + esc((last.bot && last.bot.name) || 'the bot') + ' now'
        : last.status === 'failed' ? 'last run ' + BB.when(last.at) + ' did not finish'
        : 'last draft ' + BB.when(last.at);
      return `<div class="bz-row"><div class="t"><b>${esc(rp.title)}</b><small>${lastTxt}${rp.bot ? (rp.schedule ? ' · schedule saved (not live yet)' : '') : ' · daily check-in while provider processing is on'}</small></div>${chip(rp.bot ? 'Runs on ' + ((rp.bot && rp.bot.name) || 'the bot') : 'Reasoning engine', 'dim')}</div>`;
    }).join('');
    const hqPanel = (srcs.length || profile) ? `<div class="bz-card bz-hq">
      <div class="bz-sech">At a glance</div>
      ${needs.length ? `<div class="bz-hq-needs">${needs.map(n => `<div class="bz-hq-need"><span>${esc(n.label)}</span>${n.cta ? `<button class="b out sm" data-hq-target="${esc(n.target)}" type="button">${esc(n.cta)}</button>` : ''}</div>`).join('')}</div>` : `<p class="meta">Nothing needs you right now.</p>`}
      ${liveResps.length ? `<div class="bz-sech">On Alter's plate</div>${plate}` : ''}
      ${pausedResps.length ? `<p class="meta">Paused: ${pausedResps.map(rp => esc(rp.title)).join(', ')}</p>` : ''}
    </div>` : '';
    const systems = [...new Set(props.flatMap(p => p.systems || []).concat(resps.flatMap(rp => rp.systems || [])))].slice(0, 8);
    // App connections: rendered from the LIVE server-reported status, so every state is
    // honest. A stored connection (exact account, scope, removal path) renders whenever one
    // exists - config or credential-storage problems mask it NEVER, and removal/recovery
    // stays reachable. An unloaded status is UNKNOWN (no absence claims); an unconfirmed
    // removal is surfaced with the manual recovery path.
    const appsCard = (() => {
      const head = `<div class="bz-sech">App connections</div>`;
      // Only systems WITHOUT a live connection are "until those connect" - a connected app's
      // systems are covered above, so the line never asks the owner to import what is linked.
      const uncovered = systems.filter(x => !(appG && appG.connected && /^email/i.test(x)));
      const fallback = uncovered.length ? `<p class="meta">Your proposals mention: ${uncovered.map(esc).join(', ')}. Until those connect, paste or import their key details as sources.</p>` : '';
      if (!appG) return `<div class="bz-card" id="bz-apps-card">${head}<p class="meta">Connection status could not be loaded - whether an account is connected is unknown.</p>${fallback}</div>`;
      // The compose scope can technically send; this app has no send endpoint at all, so the
      // honest bound is: only the owner sends, in Gmail. Draft creation writes to Google.
      const scopeLine = (appG.scopes || []).length ? `<p class="meta">Access this connection asks for: ${appG.scopes.map(x => esc(String(x).split('/').pop())).join(', ')} - read recent inbox messages and create drafts stored in your Google account. The compose scope technically allows sending; this app has no send endpoint and never sends.</p>` : '';
      const warn = appG.grantStatus === 'revoke_unconfirmed' ? `<div class="bz-row"><div class="t"><b>A removal was not confirmed</b><small>${esc(appG.grantNote || 'Check third-party access in the Google account and remove the connection there to be sure.')}</small></div>${chip('Check Google account', 'warn')}</div>` : '';
      const hasConn = !!(appG.connected || appG.email || appG.connectedAt || (appG.status && appG.status !== 'not_connected'));
      if (hasConn) {
        const unavail = !appG.configured ? `<p class="meta">Reconnecting is unavailable on this deployment right now - the Google app credentials are not in place. Removal below still works.</p>`
          : appG.credentialStorage !== 'ready' ? `<p class="meta">Reconnecting is unavailable on this deployment right now - credential storage is not configured safely. Removal below still works.</p>` : '';
        return `<div class="bz-card" id="bz-apps-card">${head}${warn}
        ${appG.connected ? `<div class="bz-row"><div class="t"><b>${esc(appG.label)}</b><small>Connected as ${esc(appG.email || 'unknown account')}${appG.connectedAt ? ' · since ' + BB.when(appG.connectedAt) : ''}${appG.lastSyncAt ? ' · inbox last read ' + BB.when(appG.lastSyncAt) : ' · inbox not read yet'}</small></div>${chip('Connected', 'ok')}</div>`
        : `<div class="bz-row"><div class="t"><b>${esc(appG.label)}${appG.email ? ' - ' + esc(appG.email) : ''}</b><small>${esc(appG.lastError || 'The stored credential no longer works - reconnect to resume.')}</small></div>${chip('Reconnect needed', 'warn')}</div>`}
        ${unavail}
        ${scopeLine}
        ${appG.syncDisclosure ? `<p class="meta">${esc(appG.syncDisclosure)}</p>` : ''}${fallback}
        <div class="btns">${!appG.connected && appG.configured && appG.credentialStorage === 'ready' ? `<button class="b ink sm" id="bz-app-connect" type="button">Reconnect ${esc(appG.label)}</button>` : ''}${appG.connected ? `<button class="b ink sm" id="bz-app-draft" type="button">Draft an email</button>` : ''}<button class="b out sm" id="bz-app-disconnect" type="button">Disconnect</button></div>
        <p class="meta" id="bz-app-msg"></p></div>`;
      }
      // No stored connection (the server's own report): say exactly why connecting is or is
      // not available, without claiming more than the server knows.
      if (!appG.configured) return `<div class="bz-card" id="bz-apps-card">${head}${warn}
        <p class="meta">${esc(appG.label)} connection is not set up on this deployment yet - the Google app credentials still need to be created, so connecting is unavailable. Today Alter learns from what you paste or import: notes, documents and plain-text files.</p>
        ${scopeLine}${fallback}
        <div class="btns"><button class="b out sm" data-hq-target="#bz-add-form" type="button">Add a source</button></div></div>`;
      if (appG.credentialStorage !== 'ready') return `<div class="bz-card" id="bz-apps-card">${head}${warn}
        <p class="meta">Credential storage is not configured safely on this deployment, so connecting is unavailable.</p></div>`;
      return `<div class="bz-card" id="bz-apps-card">${head}${warn}
        <p class="meta">Connect ${esc(appG.label)} so Alter can read recent inbox context for drafts you review. Connecting is your choice and can be removed here anytime.</p>
        ${scopeLine}${fallback}
        ${appG.syncDisclosure ? `<p class="meta">${esc(appG.syncDisclosure)}</p>` : ''}
        <div class="btns"><button class="b ink sm" id="bz-app-connect" type="button">Connect ${esc(appG.label)}</button></div></div>`;
    })();
    const nameCard = (!profile && srcs.length) ? `<div class="bz-card"><div class="bz-sech">Name this business</div>
      <p class="meta">The name and one line appear at the top of this page. Only you see them here.</p>
      <label class="fld">Business name<input class="in" id="bz-prof-name" maxlength="80" placeholder="e.g. North Bend Contracting"></label>
      <label class="fld">One line about it<input class="in" id="bz-prof-blurb" maxlength="240" placeholder="e.g. Renovations and repairs around North Bend"></label>
      <div class="btns"><button class="b ink" id="bz-prof-save" type="button">Save</button></div></div>` : '';
    const pageH = profile
      ? `<div class="page-h"><div><h1>${esc(profile.name)}</h1><p class="sub">${esc(profile.blurb || 'Approve what Alter takes over.')}</p></div><button class="b ghost sm" id="bz-prof-edit" type="button">Edit profile</button></div>`
      : `<div class="page-h"><div><h1>Business</h1><p class="sub">Teach Alter the business. Approve what it takes over.</p></div></div>`;
    const live = resps.filter(rp => rp.status !== 'retired'), retired = resps.filter(rp => rp.status === 'retired');
    const respSec = (live.length ? `<div class="bz-sech">Running with your approval</div>${live.map(respCard).join('')}` : '') + (retired.length ? `<div class="bz-sech">Retired</div>${retired.map(respCard).join('')}` : '');
    const logSec = (B.log && B.log.length) ? `<div class="bz-sech">Recent activity</div><div class="bz-log">${B.log.slice(0, 8).map(l => `<div><small>${BB.when(l.at)} · ${esc(logLine(l))}</small></div>`).join('')}</div>` : '';
    const pend = B.opPending;
    const pendWhat = pend && (pend.op === 'purge' ? 'Deleting all business data' : pend.op === 'source_delete' ? 'Deleting a source' : pend.op === 'resp_delete' ? 'Deleting a responsibility and its work history' : 'A delete');
    const pendCard = pend ? `<div class="bz-card"><div class="bz-sech">A delete did not finish</div>
      <p class="meta">${esc(pendWhat)} started ${BB.when(pend.at)} but paused partway. Records already deleted stay deleted; everything else is held - no new work runs until you finish or cancel it.</p>
      <div class="btns bz-pendbtns"><button class="b danger sm" id="bz-pend-finish">Finish this delete</button><button class="b out sm" id="bz-pend-cancel">Cancel the delete - keep what remains</button></div></div>` : '';
    V.innerHTML = `<div class="page-in narrow">${pageH}
      ${pendCard}${empty}${hqPanel}${appsCard}${nameCard}${srcs.length ? `<div class="bz-sech">What Alter knows</div>${srcs.map(srcRow).join('')}` : ''}${addForm}${consentCard}${propSec}${respSec}${logSec}${dataCard}</div>`;
    bind();
    // A delegated run settles whenever the bot reports: refresh on a slow poll while one is
    // in flight so the draft appears without a manual reload. Never faster - this is a view.
    clearTimeout(pollT); pollT = null;
    if (resps.some(rp => (rp.runs || []).some(r => r.status === 'delegated' || r.status === 'running'))
      || (B.discoveries || []).some(d => d.status === 'delegated' || d.status === 'running')) pollT = setTimeout(() => { if (!dropIfStaleTenant()) load(); }, 12000);
  }
  function logLine(l) {
    return { source_added: 'Source added: ' + (l.title || ''), source_edited: 'Source edited (v' + l.fromVersion + ' → v' + l.toVersion + ')', source_deleted: 'Source deleted: ' + (l.title || ''),
      discover: 'Looked for work: ' + l.proposals + ' proposal' + (l.proposals === 1 ? '' : 's') + (l.droppedEvidence ? ' · ' + l.droppedEvidence + ' unverifiable quote' + (l.droppedEvidence === 1 ? '' : 's') + ' dropped' : ''),
      proposal_edited: 'Proposal edited', proposal_rejected: 'Proposal rejected: ' + (l.title || ''),
      responsibility_deleted: 'Deleted with its history: ' + (l.title || ''), provider_consent_granted: 'Provider processing allowed: ' + (l.host || '') + ' (' + (l.model || '') + ')', provider_consent_withdrawn: 'Provider processing withdrawn',
      profile_saved: 'Business profile saved: ' + (l.name || ''), profile_cleared: 'Business profile cleared',
      schedule_enabled: 'Daily schedule set: ' + (l.title || '') + ' → ' + (l.botName || 'the bot'), schedule_disabled: 'Daily schedule turned off: ' + (l.title || ''),
      schedule_queued: 'Scheduled run sent to ' + (l.botName || 'the bot'), schedule_needs_review: 'Schedule paused, text changed: ' + (l.title || ''), schedule_skipped: 'Scheduled run skipped: no bot connected',
      responsibility_activated: 'Started: ' + (l.title || ''), responsibility_paused: 'Paused: ' + (l.title || ''), responsibility_resumed: 'Resumed: ' + (l.title || ''), responsibility_retired: 'Retired: ' + (l.title || ''),
      run: (l.runKind === 'daily' ? 'Daily check-in' : 'Work run') + (l.usage ? ' · ' + tok(l.usage) + ' tokens' : ''),
      run_delegated: 'Sent to ' + (l.botName || 'the connected bot') + (l.omittedSources ? ' · ' + l.omittedSources + ' linked source(s) did not fit' : ''),
      discover_delegated: 'Business scan sent to ' + (l.botName || 'the connected bot') + (l.omittedSources ? ' · ' + l.omittedSources + ' source(s) did not fit' : ''),
      discover_settled: l.status === 'done' ? 'Business scan finished: ' + (l.proposals || 0) + ' proposal' + (l.proposals === 1 ? '' : 's') + (l.droppedEvidence ? ' · ' + l.droppedEvidence + ' unverifiable quote' + (l.droppedEvidence === 1 ? '' : 's') + ' dropped' : '') : 'Business scan ended without proposals' + (l.failure ? ' (' + l.failure + ')' : ''),
      run_settled: l.status === 'done' ? 'Draft received from the bot' : 'Delegated run ended without a draft' + (l.failure ? ' (' + l.failure + ')' : ''),
      data_purged: 'All business data deleted. Earlier activity was deleted with it; only this minimal receipt remains.', delete_abandoned: 'A paused delete was cancelled; what remained was kept.' }[l.kind] || l.kind;
  }

  function profileDialog() {
    const p = B && B.profile || {};
    const box = BB.modal(`<h3>Business profile</h3>
      <p class="meta">Shown at the top of this page. Only you see this page. Clearing the name removes the profile.</p>
      <label class="fld">Business name<input class="in" id="bz-d-name" maxlength="80" value="${esc(p.name || '')}"></label>
      <label class="fld">One line about it<input class="in" id="bz-d-blurb" maxlength="240" value="${esc(p.blurb || '')}"></label>
      <div class="acts"><button class="b ghost" data-close>Cancel</button><button class="b ink" id="bz-d-save" type="button">Save</button></div>`, { label: 'Business profile' });
    box.querySelector('#bz-d-save').onclick = async () => {
      const j = await api('/profile', 'POST', { name: box.querySelector('#bz-d-name').value, blurb: box.querySelector('#bz-d-blurb').value });
      if (j.error) return BB.toast(j.error);
      BB.closeModal(); BB.toast('Saved.'); load();
    };
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
    const pe = $('#bz-prof-edit', V); if (pe) pe.onclick = () => profileDialog();
    // The exact connection under review: account + generation. Snapshotted at click, re-checked
    // after EVERY await, and echoed to the server on removal - an identity switch, a reload or
    // another tab's reconnect invalidates the action instead of acting on the wrong owner or
    // removing a replacement connection never reviewed here.
    const appSnap = () => { const g = B && B.apps && B.apps.gmail; return g ? { email: g.email || null, at: g.connectedAt || null, v: g.connectionVersion || null } : null; };
    const ac = $('#bz-app-connect', V); if (ac) ac.onclick = async () => {
      const stamp = identity(), want = appSnap();
      ac.disabled = true; const j = await api('/apps/gmail/connect', 'POST', {}); ac.disabled = false;
      if (stamp && stamp !== identity()) return; // the account or workspace changed mid-flight: never start Google's consent for the old identity
      const cur = appSnap();
      if ((want && want.v) !== (cur && cur.v)) { await load(); return BB.toast('The connection changed - review it and try again.'); }
      if (j.error) return BB.toast(j.error);
      if (j.authorizationUrl) window.location.assign(j.authorizationUrl); // Google's consent screen; the return lands on the callback
    };
    const dr = $('#bz-app-draft', V); if (dr) dr.onclick = async () => {
      const stamp = identity(), want = appSnap();
      const stillCurrent = () => !(stamp && !sameId(stamp, identity())) && (() => { const cur = appSnap(); return want && cur && cur.email === want.email && cur.at === want.at && cur.v === want.v; })(); // value compare: an A->B->A round trip is still the same owner
      const opsJ = await fetchDraftOps(); // server-owned durable operation state, read fresh at every composer open
      if (stamp && !sameId(stamp, identity())) return; // the identity changed while the list loaded: show none of it
      const openComposer = (vals) => {
        const pendOp = opsJ.ops ? (opsJ.ops.find(o => o.status === 'in_flight' && o.connectionVersion === (want && want.v)) || null) : null; // the durable in-flight gate - survives close, reload and round trips
        const unList = opsJ.ops ? opsJ.ops.filter(o => o.status === 'unconfirmed') : [];
        const form = BB.modal(`<h3>Draft an email</h3>
        <p class="meta">A draft is created in the connected Google account with exactly your words. Nothing is sent - you review and send it in Gmail.</p>
        ${opsJ.ops === null ? `<p class="meta" data-draft-opserr><b>Earlier draft attempts could not be checked - reload this card before creating, so nothing is duplicated.</b></p>` : ''}
        ${pendOp ? `<p class="meta" data-draft-pending="${esc(pendOp.id)}"><b>A draft is already being created in Gmail from this connection - wait for its result before creating another.</b> Closing this window does not cancel it.</p>` : ''}
        ${unList.map(u0 => `<p class="meta" data-draft-unconf="${esc(u0.id)}">An earlier draft attempt for <b>${esc(u0.account || 'the connected account')}</b>${u0.to && u0.to.length ? ' to <b>' + esc(u0.to.join(', ')) + '</b>' : ''}${u0.subject ? ' (' + esc(u0.subject) + ')' : ''}${u0.at ? ' · ' + BB.when(u0.at) : ''} did not get a clear answer - it may exist in Gmail. Check the drafts folder there before creating the same draft again. <button class="b out sm" data-draft-reconciled="${esc(u0.id)}" type="button">I checked Gmail - clear this note</button></p>`).join('')}
        <label class="fld">To<input class="in" id="bz-draft-to" maxlength="300" value="${esc(vals.to || '')}" placeholder="dana@example.com"></label>
        <label class="fld">Subject<input class="in" id="bz-draft-subject" maxlength="300" value="${esc(vals.subject || '')}" placeholder="Re: Estimate"></label>
        <label class="fld">Words<textarea class="in" id="bz-draft-text" rows="6" maxlength="20000" placeholder="Hi Dana - ">${esc(vals.text || '')}</textarea></label>
        <div class="acts"><button class="b ghost" data-close>Cancel</button><button class="b ink" data-draft-review ${pendOp || opsJ.ops === null ? 'disabled' : ''}>Review the exact draft</button></div>`, { label: 'Draft an email' });
        form.querySelectorAll('[data-draft-reconciled]').forEach(recBtn => recBtn.onclick = async () => { // the owner's explicit checked-Gmail acknowledgment clears a receipt - nothing else does
          if (stamp && !sameId(stamp, identity())) { BB.closeModal(); load(); return; } // the acknowledgment binds the identity that opened this composer: a stale dialog never addresses another owner's records
          const opId = recBtn.getAttribute('data-draft-reconciled');
          recBtn.disabled = true;
          const j = await api('/apps/gmail/draft-ops/' + opId + '/reconcile', 'POST', {});
          if (stamp && !sameId(stamp, identity())) { BB.closeModal(); load(); return; }
          if (j && j.error && j._status !== 404) { recBtn.disabled = false; return BB.toast(j.error); } // a 404 means it was already acknowledged elsewhere - consistent
          const n = form.querySelector('[data-draft-unconf="' + opId + '"]'); if (n) n.remove();
          if (opsJ.ops) opsJ.ops = opsJ.ops.filter(o => o.id !== opId);
        });
        form.querySelector('[data-draft-review]').onclick = async () => {
          if (!stillCurrent()) { BB.closeModal(); load(); return BB.toast('The connection changed - review it and try again.'); }
          const to = form.querySelector('#bz-draft-to').value.trim(), subject = form.querySelector('#bz-draft-subject').value, text = form.querySelector('#bz-draft-text').value;
          if (!to || !text.trim()) return BB.toast('A draft needs a recipient and text.');
          const g = B.apps.gmail;
          const toN = to.split(',').map(x => x.trim()).filter(Boolean).join(', ');
          const fp = await draftFpSha(toN, subject, text); // exact payload identity - the same canonicalization the server used when it recorded the attempt
          if (!stillCurrent()) { BB.closeModal(); load(); return BB.toast('The connection changed - review it and try again.'); }
          const sameUnList = unList.filter(u0 => u0.connectionVersion === want.v && u0.fp === fp); // EVERY unresolved same-payload attempt - the owner reviews the exact set, never a sample
          BB.modal(`<h3>Review the exact draft</h3>
          <p class="meta">This creates a draft - nothing is sent.</p>
          ${sameUnList.length ? `<p class="meta"><b>${sameUnList.length > 1 ? 'Earlier attempts (' + sameUnList.length + ') to create this exact draft did not get a clear answer' : 'An earlier attempt to create this exact draft did not get a clear answer'} - it may already exist in Gmail.</b> Check the drafts folder in Gmail before creating it again.</p>
          <label class="fld bz-check"><input type="checkbox" data-draft-checked> I checked the drafts folder in Gmail for the earlier attempt.</label>` : ''}
          <div class="bz-log"><div><small>From (the connected account)</small><br><b>${esc(g.email || 'unknown account')}</b></div>
          <div><small>To</small><br><b>${esc(to)}</b></div>
          <div><small>Subject</small><br><b>${esc(subject || '(no subject)')}</b></div>
          <div><small>Words, exactly as they will appear</small><br><pre style="white-space:pre-wrap;margin:6px 0 0">${esc(text)}</pre></div></div>
          <p class="meta" data-draft-live></p>
          <div class="acts"><button class="b ghost" data-draft-back>Back</button><button class="b ink" data-draft-create>Create this draft in Gmail</button></div>`, { label: 'Review the exact draft' });
          const backBtn = document.querySelector('#modal [data-draft-back]'), createBtn = document.querySelector('#modal [data-draft-create]');
          const checkedBox = document.querySelector('#modal [data-draft-checked]');
          if (checkedBox) { createBtn.disabled = true; checkedBox.onchange = () => { createBtn.disabled = !checkedBox.checked; }; } // a same-op retry needs the explicit checked-Gmail decision first
          backBtn.onclick = () => openComposer({ to, subject, text }); // Back keeps every typed word
          createBtn.onclick = async () => {
            if (!stillCurrent()) { BB.closeModal(); load(); return BB.toast('The connection changed - review it and try again.'); }
            createBtn.disabled = true; backBtn.disabled = true; // a submitted request cannot be undone: Back/Close never pretend otherwise
            createBtn.textContent = 'Creating in Gmail...';
            const liveNote = document.querySelector('#modal [data-draft-live]'); if (liveNote) liveNote.textContent = 'Creating the draft in Gmail - closing this window does not cancel it.';
            const j = await api('/apps/gmail/drafts', 'POST', { to, subject, text, expectedVersion: want.v, checkedGmail: !!(checkedBox && checkedBox.checked), reviewedOps: sameUnList.map(o => o.id), decisionRev: (opsJ && opsJ.rev) || '' }); // the server records the intent BEFORE the provider effect - a reload here loses nothing; the decision binds the EXACT reviewed set + revision, enforced server-side
            if (stamp && !sameId(stamp, identity())) return; // changed mid-request: the server owns the operation record; this stale reply touches nothing
            // A composer reopened while this op was in flight re-arms on the known outcome - words untouched
            const pn = j && j.opId ? document.querySelector('#modal [data-draft-pending="' + j.opId + '"]') : null;
            if (pn) { pn.remove(); const rv = document.querySelector('#modal [data-draft-review]'); if (rv) rv.disabled = false; }
            createBtn.disabled = false; backBtn.disabled = false;
            createBtn.textContent = 'Create this draft in Gmail';
            if (liveNote) liveNote.textContent = '';
            const closeIfOurs = () => { if (document.contains(createBtn)) BB.closeModal(); }; // never close a modal that is not this review
            await load(); // refresh BEFORE judging: a replacement that landed mid-request must not get the success copy
            if (stamp && !sameId(stamp, identity())) return; // value compare: an A->B->A round trip during the request must not strand this op's own settlement
            if (j.error) { closeIfOurs(); return BB.toast(j.error); } // an unresolved outcome is already a durable server-side receipt under this exact owner - the error copy tells the owner to check Gmail
            closeIfOurs();
            // The create was bound to the reviewed connection: if it has since been replaced,
            // say where the draft went and let the card show the current state.
            if (!stillCurrent()) return BB.toast('Draft created in Gmail for ' + (want.email || 'the reviewed account') + ' - the connection changed meanwhile; the card shows the current state.');
            const ops2 = await fetchDraftOps();
            if (stamp && !sameId(stamp, identity())) return;
            const hadUn = ops2.ops ? ops2.ops.some(o => o.status === 'unconfirmed') : false;
            BB.toast((j.note || 'Draft created in Gmail - nothing was sent.') + (hadUn ? ' An earlier attempt may also have created a draft - check the drafts folder in Gmail.' : '')); // a success never clears any earlier unknown: only the owner's checked-Gmail acknowledgment does
          };
        };
      };
      openComposer({});
    };
    const ad = $('#bz-app-disconnect', V); if (ad) ad.onclick = async () => {
      const stamp = identity(), want = appSnap();
      // A connection stored before removal tracking has no version to bind: say exactly what
      // that means and remove only on the explicit unversioned marker.
      const legacy = want && !want.v;
      if (!await askConfirm('Disconnect Gmail?', (legacy ? 'This connection was stored before removal tracking existed - disconnecting removes the connection currently stored for ' + (want.email || 'the shown account') + '. ' : '') + 'Alter stops reading the inbox and the stored connection is removed here. Google is asked to revoke its access too.', 'Disconnect')) return;
      if (stamp && stamp !== identity()) return; // the dialog outlived an identity switch: discard, never act as the new identity
      const cur = appSnap();
      if (!want || !cur || cur.email !== want.email || cur.at !== want.at || cur.v !== want.v) { await load(); if (stamp && stamp !== identity()) return; return BB.toast('The connection changed - review it and try again.'); }
      ad.disabled = true; const j = await api('/apps/gmail/disconnect', 'POST', { expectedVersion: legacy ? 'unversioned' : want.v }); ad.disabled = false;
      if (stamp && stamp !== identity()) return; // changed mid-request: the guard reloads under the new identity - discard the stale reply
      if (j.error) { await load(); if (stamp && stamp !== identity()) return; return BB.toast(j.error); }
      // Refresh FIRST: the announcement must describe the current state, never the removed
      // snapshot. A replacement connected while the removal ran gets a neutral line - the
      // old grant's fate is never announced over the new connection's card.
      await load();
      if (stamp && stamp !== identity()) return; // the identity changed during the refresh: never announce the old identity's outcome under the new one
      const after = appSnap();
      if (after && after.v && after.v !== want.v) return BB.toast('The older connection was removed. A different connection is active now - the card shows it.');
      const who = want.email ? ' ' + want.email : '';
      // Honest removal: a confirmed current grant does NOT imply older grants are gone.
      const unconfirmed = j.grantStatus === 'revoke_unconfirmed' || j.grantStatus === 'undecryptable' || j.priorGrant === 'revoke_unconfirmed' || j.priorGrant === 'undecryptable';
      if (j.grantStatus === 'revoked' && !unconfirmed) BB.toast('Disconnected' + who + ' - Google confirmed the access removal.');
      else BB.toast('Disconnected' + who + ' here. ' + (j.note || (unconfirmed ? 'Google did not confirm removing every grant - check third-party access in the Google account and remove the connection there to be sure.' : '')));
    };
    const ps = $('#bz-prof-save', V); if (ps) ps.onclick = async () => {
      ps.disabled = true; const j = await api('/profile', 'POST', { name: $('#bz-prof-name', V).value, blurb: $('#bz-prof-blurb', V).value }); ps.disabled = false;
      if (j.error) return BB.toast(j.error); BB.toast('Saved.'); await load();
    };
    $$('[data-hq-target]', V).forEach(b => b.onclick = () => { if (b.dataset.hqTarget === 'connect') return BB.openConnect(); const el = document.querySelector(b.dataset.hqTarget); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const rid = el.getAttribute('data-resp'); if (rid && !openResp[rid]) { openResp[rid] = true; paint(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } });
    $$('[data-sched-on]', V).forEach(b => b.onclick = () => { pendingSchedule = { respId: b.dataset.schedOn, instruction: '', delegation: null }; schedGen++; paint(); });
    $$('[data-sched-edit]', V).forEach(b => b.onclick = () => { const rp = (B.responsibilities || []).find(x => x.id === b.dataset.schedEdit); pendingSchedule = { respId: b.dataset.schedEdit, instruction: (rp && rp.schedule && rp.schedule.instruction) || '', delegation: null }; schedGen++; paint(); });
    $$('[data-sched-off]', V).forEach(b => b.onclick = async () => { if (!await askConfirm('Turn the daily schedule off?', 'The bot stops getting the daily text. You can set it again any time.', 'Turn off')) return; const j = await api('/responsibilities/' + b.dataset.schedOff + '/schedule', 'POST', { op: 'disable' }); if (j.error) return BB.toast(j.error); BB.toast('Schedule off.'); await load(); });
    {
      const sc = $('[data-sched-input]', V); if (sc) sc.oninput = () => { if (pendingSchedule) pendingSchedule.instruction = sc.value; };
      const sp = $('[data-sched-preview]', V); if (sp) sp.onclick = async () => {
        const req = pendingSchedule, gen = schedGen; if (!req) return;
        sp.disabled = true; const j = await api('/responsibilities/' + req.respId + '/schedule', 'POST', { op: 'preview', instruction: req.instruction }); sp.disabled = false;
        if (pendingSchedule !== req || schedGen !== gen) return; // canceled, replaced or reloaded mid-flight: discard the stale response
        if (j.error) return BB.toast(j.error);
        req.delegation = j.delegation; paint();
      };
      const sb = $('[data-sched-back]', V); if (sb) sb.onclick = () => { const req = pendingSchedule; if (req) { req.delegation = null; paint(); } };
      const sx = $('[data-sched-cancel]', V); if (sx) sx.onclick = () => { pendingSchedule = null; schedGen++; paint(); };
      const se = $('[data-sched-enable]', V); if (se) se.onclick = async () => {
        const req = pendingSchedule, gen = schedGen; if (!req || !req.delegation) return;
        se.disabled = true;
        const j = await api('/responsibilities/' + req.respId + '/schedule', 'POST', { op: 'enable', instruction: req.instruction, delegateHash: req.delegation.hash });
        if (pendingSchedule !== req || schedGen !== gen) return; // the review this response belongs to is gone: never enable from a stale continuation
        if (j.error) { se.disabled = false; if (j.delegation) { req.delegation = j.delegation; paint(); } return BB.toast(j.error); }
        pendingSchedule = null; schedGen++; BB.toast('Daily schedule saved. Automatic sends are not live yet, so nothing is sent for now.'); await load();
      };
    }
    let kind = 'note';
    $$('.bz-kind .b', V).forEach(b => b.onclick = () => { kind = b.dataset.kind; $$('.bz-kind .b', V).forEach(x => x.classList.toggle('ink', x === b)); });
    const add = $('#bz-add', V);
    if (add) add.onclick = async () => {
      const title = $('#bz-add-title', V).value, text = $('#bz-add-text', V).value;
      add.disabled = true; const j = await api('/sources', 'POST', { kind, title, text }); add.disabled = false;
      if (j.error) return BB.toast(j.error); BB.toast('Added.'); await load();
    };
    const fileBtn = $('#bz-add-file', V), fileIn = $('#bz-file', V);
    if (fileBtn && fileIn) {
      fileBtn.onclick = () => fileIn.click();
      fileIn.onchange = () => {
        const f = fileIn.files && fileIn.files[0]; fileIn.value = '';
        if (!f) return;
        if (f.size > 25000) return BB.toast('That file is too large for a text source (about 20,000 characters). Paste a section instead.');
        const rd = new FileReader();
        rd.onerror = () => BB.toast('Could not read that file.');
        rd.onload = () => {
          const text = String(rd.result || '');
          if (!text.trim()) return BB.toast('That file had no readable text.');
          const t = $('#bz-add-title', V), x = $('#bz-add-text', V);
          if (t) t.value = f.name.replace(/\.[^.]+$/, '').slice(0, 120);
          if (x) x.value = text.slice(0, 20000);
          BB.toast('File read into the form - review it, then Add source.');
        };
        rd.readAsText(f);
      };
    }
    $$('[data-toggle-src]', V).forEach(el => el.onclick = () => { editingSrc = editingSrc === el.dataset.toggleSrc ? null : el.dataset.toggleSrc; paint(); });
    $$('[data-src-save]', V).forEach(b => b.onclick = async () => {
      const card = b.closest('.bz-card'), title = $('[data-src-title]', card).value, text = $('[data-src-text]', card).value;
      b.disabled = true; const j = await api('/sources/' + b.dataset.srcSave, 'PATCH', { title, text }); b.disabled = false;
      if (j.error) return BB.toast(j.error); editingSrc = null;
      BB.toast(j.proposalsStale && j.proposalsStale.length ? 'Saved. ' + j.proposalsStale.length + ' proposal' + (j.proposalsStale.length === 1 ? ' is' : 's are') + ' now flagged as drafted from the old version.' : 'Saved.'); await load();
    });
    $$('[data-src-cancel]', V).forEach(b => b.onclick = () => { editingSrc = null; paint(); });
    $$('[data-src-del]', V).forEach(b => b.onclick = async () => {
      if (!await askConfirm('Delete this source?', 'The source and proposal quotes that matched it are removed. Work derived from it (proposal text, responsibilities, run drafts) stays as your record.', 'Delete')) return;
      const j = await api('/sources/' + b.dataset.srcDel, 'DELETE'); if (j.error) return BB.toast(j.error); editingSrc = null; BB.toast('Deleted.'); await load();
    });
    const discBot = $('#bz-discover-bot', V);
    if (discBot) discBot.onclick = async () => {
      discBot.disabled = true;
      const stamp = identity();
      const c = await api('/discover/delegate-preview', 'POST', {});
      if (stamp !== identity()) return; // ownership changed mid-flight (including unknown -> known): the old identity's scan payload never paints here
      discBot.disabled = false;
      if (c.error) return BB.toast(c.error);
      pendingDiscovery = { delegation: c.delegation }; paint();
    };
    const discRun = $('[data-disc-run]', V);
    if (discRun) discRun.onclick = async () => {
      const d = pendingDiscovery; if (!d) return;
      discRun.disabled = true;
      const stamp = identity();
      const j = await api('/discover/delegate-run', 'POST', { delegateHash: d.delegation.hash });
      if (stamp !== identity()) return; // same discard rule for run results, including a 409 carrying the old identity's review payload
      discRun.disabled = false;
      if (j.error) {
        if (j.code === 'delegation_review_required' && j.delegation) { pendingDiscovery = { delegation: j.delegation }; paint(); return BB.toast('The payload changed - review the current version.'); }
        pendingDiscovery = null; paint();
        return BB.toast(j.error);
      }
      pendingDiscovery = null;
      BB.toast('Scan sent to ' + (d.delegation.bot.name || 'the bot') + '. Proposals appear here when its answer checks out.'); await load();
    };
    const discCancel = $('[data-disc-cancel]', V);
    if (discCancel) discCancel.onclick = () => { pendingDiscovery = null; paint(); };
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
      b.disabled = true; const research = !!($('[data-p-research]', card) && $('[data-p-research]', card).checked);
      let j = await api('/proposals/' + b.dataset.pActivate + '/activate', 'POST', research ? { research: true } : {});
      if (j.error === 'stale_evidence' && await askConfirm('Sources changed since this was drafted', (j.message || 'Review it against the current sources.') + ' Start it anyway?', 'Start anyway')) j = await api('/proposals/' + b.dataset.pActivate + '/activate', 'POST', { confirmStale: true, ...(research ? { research: true } : {}) });
      b.disabled = false; if (j.error) return BB.toast(j.message || j.error);
      await load();
      // Provisioning: a bot-mapped responsibility with no connected bot cannot run yet - say so
      // at activation and offer the existing connect flow, rather than failing later at run time.
      const needsBot = !!(j.responsibility && j.responsibility.bot);
      const botReady = B && B.delegate && B.delegate.connection && B.delegate.connection.status === 'active';
      if (needsBot && !botReady) {
        const go = await askConfirm('"' + title + '" is started', 'It runs on a connected bot, and none is connected right now. Connect one so work can go to it - nothing runs until then.', 'Connect a bot');
        if (go) BB.openConnect();
      } else BB.toast('Started. Bring it work below.');
    });
    $$('[data-toggle-resp]', V).forEach(el => el.onclick = () => { openResp[el.dataset.toggleResp] = !openResp[el.dataset.toggleResp]; paint(); });
    $$('[data-run]', V).forEach(b => b.onclick = async () => {
      const rp = (B.responsibilities || []).find(x => x.id === b.dataset.run);
      const ta = $('[data-run-input="' + b.dataset.run + '"]', V), input = ta.value;
      if (!input.trim()) return BB.toast('Describe or paste the work first');
      if (rp && rp.research) return researchApprove(rp, input, b);
      if (B.delegate) return delegateApprove(rp, input, b);
      b.disabled = true; b.textContent = 'Working…';
      const j = await api('/responsibilities/' + b.dataset.run + '/run', 'POST', { input });
      b.disabled = false; b.textContent = 'Do this work';
      if (j.error) return BB.toast(j.error);
      if (j.run && j.run.status === 'failed') { await load(); return BB.toast('The run failed: ' + (j.run.failureReason === 'engine_malformed_output' ? 'the engine reply was unusable' : 'the engine produced no draft')); }
      ta.value = ''; BB.toast('Draft ready.'); await load();
    });
    // Delegated runs (connected bot does the work): the owner reviews the EXACT payload -
    // instructions, work item, whole linked sources, destination bot - and the run binds that
    // review by hash. Same review-discard rules as research approvals across identity changes.
    async function delegateApprove(rp, input, b) {
      b.disabled = true; b.textContent = 'Preparing…';
      const stamp = identity();
      const c = await api('/responsibilities/' + rp.id + '/delegate-preview', 'POST', { input });
      if (stamp && stamp !== identity()) return;
      b.disabled = false; b.textContent = 'Do this work';
      if (c.error) return BB.toast(c.error);
      openResp[rp.id] = true;
      pendingDelegation = { respId: rp.id, input, delegation: c.delegation };
      paint();
    }
    async function runDelegated(rp, d, b) {
      if (b) { b.disabled = true; b.textContent = 'Sending…'; }
      const stamp = identity();
      const j = await api('/responsibilities/' + rp.id + '/run', 'POST', { input: d.input, delegateHash: d.delegation.hash });
      if (stamp && stamp !== identity()) return;
      if (b) { b.disabled = false; b.textContent = 'Do this work'; }
      if (j.error) {
        if (j.code === 'delegation_review_required' && j.delegation) { pendingDelegation = { respId: rp.id, input: d.input, delegation: j.delegation }; paint(); return BB.toast('The payload changed - review the current version.'); }
        pendingDelegation = null; paint();
        return BB.toast(j.error);
      }
      pendingDelegation = null;
      const ta = $('[data-run-input="' + rp.id + '"]', V); if (ta) ta.value = '';
      BB.toast('Sent to ' + (d.delegation.bot.name || 'the bot') + '. Its draft lands in the history.');
      await load();
    }
    $$('[data-dele-run]', V).forEach(b => b.onclick = () => {
      if (!pendingDelegation) return;
      const rp = (B.responsibilities || []).find(x => x.id === pendingDelegation.respId);
      const d = pendingDelegation;
      pendingDelegation = null; paint();
      if (rp) runDelegated(rp, d, $('[data-run="' + rp.id + '"]', V));
    });
    $$('[data-dele-cancel]', V).forEach(b => b.onclick = () => {
      const pd = pendingDelegation; pendingDelegation = null; paint();
      if (pd) { const ta = $('[data-run-input="' + pd.respId + '"]', V); if (ta) ta.value = pd.input; }
    });
    $$('[data-run-stop]', V).forEach(b => b.onclick = async () => {
      if (!await askConfirm('Stop this job?', 'The bot is told to stop. Anything it already did outside Alter is not undone; the run shows as stopped.', 'Stop job')) return;
      const j = await BB.api('/api/tasks/' + b.dataset.runStop + '/stop', 'POST', {});
      if (j.error) return BB.toast(j.error);
      BB.toast('Stopped.'); await load();
    });
    // Research runs: the owner reviews the exact pages found in their sources/work item
    // and approves each one for THIS run. The card shows the immutable work text that was
    // reviewed; the run executes exactly that text and the reviewed source versions.
    async function researchApprove(rp, input, b) {
      b.disabled = true; b.textContent = 'Checking pages…';
      const stamp = identity(); // generation at request time
      const c = await api('/responsibilities/' + rp.id + '/candidates', 'POST', { input });
      if (stamp && stamp !== identity()) return; // identity changed mid-check: the guard already cleared everything - a late reply must not restore the old identity's review
      b.disabled = false; b.textContent = 'Do this work';
      if (c.error) return BB.toast(c.error);
      const urls = c.urls || [];
      if (!urls.length) return runResearch(rp, { input, approvedUrls: [], reviewedVersions: c.sourceVersions || {} }, b);
      openResp[rp.id] = true;
      pendingApproval = { respId: rp.id, input, urls, flagged: c.flagged || [], reviewedVersions: c.sourceVersions || {}, checked: [] };
      paint();
    }
    async function runResearch(rp, review, b) {
      if (b) { b.disabled = true; b.textContent = 'Working…'; }
      const stamp = identity(); // generation at request time
      const j = await api('/responsibilities/' + rp.id + '/run', 'POST', { input: review.input, approvedUrls: review.approvedUrls, reviewedVersions: review.reviewedVersions });
      if (stamp && stamp !== identity()) return; // identity changed mid-run: discard - never restore the old identity's review or results
      if (b) { b.disabled = false; b.textContent = 'Do this work'; }
      if (j.error) {
        // Recoverable errors keep the review intact: same input, same checks, owner decides again.
        if (review.urls && review.urls.length) { pendingApproval = { respId: rp.id, input: review.input, urls: review.urls, flagged: review.flagged || [], reviewedVersions: review.reviewedVersions || {}, checked: review.approvedUrls || [] }; paint(); }
        return BB.toast(j.error);
      }
      if (j.run && j.run.status === 'failed') { pendingApproval = null; await load(); return BB.toast('The run failed: ' + (j.run.failureReason === 'engine_malformed_output' ? 'the engine reply was unusable' : 'the engine produced no draft')); }
      pendingApproval = null;
      const ta = $('[data-run-input="' + rp.id + '"]', V); if (ta) ta.value = '';
      BB.toast('Draft ready.'); await load();
    }
    $$('[data-appr-run]', V).forEach(b => b.onclick = async () => {
      if (!pendingApproval) return;
      const checked = $$('[data-appr-url]', V).filter(x => x.checked).map(x => x.value);
      const rp = (B.responsibilities || []).find(x => x.id === pendingApproval.respId);
      const review = { input: pendingApproval.input, approvedUrls: checked, reviewedVersions: pendingApproval.reviewedVersions, urls: pendingApproval.urls, flagged: pendingApproval.flagged };
      pendingApproval = null; paint();
      if (rp) runResearch(rp, review, $('[data-run="' + rp.id + '"]', V));
    });
    $$('[data-appr-cancel]', V).forEach(b => b.onclick = () => {
      // Cancel keeps the typed work: restore the reviewed text into the input box.
      const pa = pendingApproval; pendingApproval = null; paint();
      if (pa) { const ta = $('[data-run-input="' + pa.respId + '"]', V); if (ta) ta.value = pa.input; }
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
