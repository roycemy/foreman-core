/* Black Box vNext · bot inspector (C). 460px floating panel: figure tile, name, one plain status line,
   then Activity / Permissions / Profile. The job log is one tap from the bot. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const P = $('#insp');
  let cur = null, tab = 'activity', openJob = null, jobCache = {}, lastFocus = null;
  const removeState = new Map(); // Confirmation must survive the inspector's one-second redraw.
  BB.inspected = null;

  BB.openInspector = function (id, o) {
    o = o || {}; const a = BB.agent(id); if (!a) return;
    if (!P.classList.contains('on')) lastFocus = document.activeElement;
    BB.closeRail && BB.closeRail(); BB.closePop && BB.closePop();
    if (BB.route().v !== 'floor' && !BB.phone()) BB.go('#floor');
    if (cur !== id) { if (cur && removeState.get(cur) !== 'pending') removeState.delete(cur); tab = 'activity'; openJob = null; }
    cur = id; BB.inspected = id; if (o.tab) tab = o.tab; if (o.job) { tab = 'activity'; openJob = o.job; }
    P.classList.add('on'); $('#stage') && $('#stage').classList.add('dim'); P.setAttribute('aria-label', a.name); if (BB.phone()) $('#scrim').classList.add('on');
    paint(true); BB.floorFit && BB.floorFit(); BB.floorPlace && BB.floorPlace();
    if (openJob) loadJob(openJob);
  };
  BB.closeInspector = function (keepFocus) {
    if (!P.classList.contains('on')) return; P.classList.remove('on'); if (cur && removeState.get(cur) !== 'pending') removeState.delete(cur); cur = null; BB.inspected = null; if (!$('#sheet').classList.contains('on')) $('#scrim').classList.remove('on');
    if (!BB.panelOpen()) $('#stage') && $('#stage').classList.remove('dim');
    BB.floorFit && BB.floorFit(); BB.floorPlace && BB.floorPlace();
    if (!keepFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  };
  BB.closeTop = function () { if ($('#modal').classList.contains('on')) return; if (BB.popOpen && BB.popOpen()) return BB.closePop(); if (P.classList.contains('on')) return BB.closeInspector(); if (BB.panelOpen && BB.panelOpen()) return BB.closeRail(); };

  async function loadJob(id) { const j = await BB.api('/api/jobs/' + id); if (!j.error) { jobCache[id] = j; paint(); } }

  /* ---------- activity ---------- */
  const jobsOf = a => BB.jobs().filter(t => t.assignee === a.id || (t.createdBy === a.id && t.assignee && t.assignee !== a.id && ['running', 'queued'].includes(t.status)));
  function jobSmall(t) {
    if (t.status === 'running') return 'Running · ' + BB.dur(Date.now() - Date.parse(t.startedAt || t.createdAt));
    if (t.status === 'queued') return t.assignee ? 'Queued · ' + BB.ago(t.assignedAt || t.createdAt) : 'Unassigned';
    if (t.status === 'failed') return 'Failed · ' + BB.ago(t.finishedAt);
    if (!t.finishedAt) return ''; const ago = BB.ago(t.finishedAt);
    return Date.now() - Date.parse(t.finishedAt) < 864e5 ? ago + (/min$|h$/.test(ago) ? ' ago' : '') : BB.when(t.finishedAt);
  }
  function steps(list, owner) {
    return `<ol class="steps">${list.map(s => `<li class="${s.kind === 'approval' ? 'ap' : s.kind === 'denied' ? 'no' : ''}">${esc(s.text)}<small>${esc(BB.clock(s.at))}${s.meta ? ' · ' + esc(s.meta) : ''}${owner && s.detail && s.kind !== 'step' ? ' · ' + esc(s.detail) : owner && s.detail && /^“/.test(s.detail) ? ' · ' + esc(s.detail) : ''}</small></li>`).join('')}</ol>`;
  }
  BB.costLine = t => t.modelCostUsd != null ? BB.modelCost(t.modelCostUsd) + ' model costs' : 'Model costs not reported';
  BB.jobDur = t => t.finishedAt ? BB.dur(Date.parse(t.finishedAt) - Date.parse(t.startedAt || t.createdAt)) : t.startedAt ? BB.dur(Date.now() - Date.parse(t.startedAt)) : '';
  /* design pack v3: honest status in the header; estimates repaint once a minute, not on every 1s tick */
  function hst(a) { const st = BB.honestStatus(a); return `<div class="bst" data-s="${st.s}"><i class="bst-dot" aria-hidden="true"></i><div class="bst-t"><span class="bst-line">${esc(st.line)}</span>${st.why ? `<span class="bst-why">${esc(st.why)}</span>` : ''}</div></div>`; }
  const estMemo = {};
  function est(t) { const k = t.id + ':' + t.status, m = estMemo[k], now = Date.now(); if (m && now - m.at < 60000) return m.h; const h = BB.estimateHTML(t, BB.tasks()); estMemo[k] = { at: now, h }; return h; }
  function jobHTML(t, a) {
    const s = BB.jobStatus(t), open = openJob === t.id, d = jobCache[t.id];
    let body = '';
    if (open) {
      const finished = ['done', 'failed'].includes(t.status);
      body = `<div class="jb">${d ? steps(d.timeline, true) : '<p class="meta">Loading…</p>'}
        ${t.result ? `<p class="meta" style="margin-top:12px;white-space:pre-wrap;color:var(--stone)">${esc(t.result.slice(0, 280))}${t.result.length > 280 ? '…' : ''}</p>` : ''}
        ${a.permissionScope === 'job' && ['running', 'queued'].includes(t.status) && t.assignee === a.id ? `<div class="foot"><button class="b out sm" type="button" data-grant="${t.id}">${t.jobGrant && t.jobGrant.status === 'active' ? 'Change what this job may do' : 'Grant actions for this job'}</button></div>` : ''}
        <div class="foot">${finished ? `<button class="b out sm" type="button" data-receipt="${t.id}">Open receipt</button><button class="b ghost sm" type="button" data-share="${t.id}">Share…</button>` : t.assignee ? `<button class="b ghost sm" type="button" data-stop="${t.id}" style="color:var(--vermilion-press)">Stop job</button>` : ''}<span class="cost">${esc(t.modelCostUsd != null ? BB.modelCost(t.modelCostUsd) : 'Cost not reported')}${BB.jobDur(t) ? ' · ' + esc(BB.jobDur(t)) : ''}</span></div></div>`;
    }
    return `<div class="job${open ? ' open' : ''}"><button type="button" aria-expanded="${open}" data-job="${t.id}"><span class="st ${s.cls}"><i></i></span><b>${esc(t.title)}</b><small>${esc(jobSmall(t) + BB.byLabel(t))}</small>${BB.estimateHTML && ['running', 'queued'].includes(t.status) ? est(t) : ''}</button>${body}</div>`;
  }
  function activity(a) {
    const js = jobsOf(a);
    if (!js.length) return `<div class="empty"><b>No jobs yet</b><small>${BB.isGhost(a) ? 'Connect ' + esc(a.name) + ' first. Its jobs show up here.' : 'Ask the team for something, or assign a job from the inbox.'}</small></div>`;
    return js.map(t => jobHTML(t, a)).join('');
  }

  /* ---------- permissions: a verb, one line on what it means, Allowed / Ask first / Never ---------- */
  const ORDER = ['web.fetch', 'notes.write', 'notes.delete', 'work.handoff', 'work.assign', 'work.enqueue'];
  const DEF = { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO', 'work.enqueue': 'ASK', 'work.assign': 'ASK' };
  function permissions(a) {
    const perms = Object.assign({}, DEF, a.permissions || {}), cap = ((BB.cards && BB.cards.bots) || []).find(b => b.id === a.id), lim = a.limits || {};
    const sel = (k, v) => `<span class="choice"><select data-perm="${k}" aria-label="${esc(BB.ACTION_COPY[k].verb)}">${['AUTO', 'ASK', 'NEVER'].map(m => `<option value="${m}"${v === m ? ' selected' : ''}>${BB.MODE_COPY[m]}</option>`).join('')}</select></span>`;
    return `<div class="intro">What ${esc(a.name)} can do without asking. Changes apply to its next step.</div>
      ${ORDER.map(k => `<div class="perm"><div class="t"><b>${esc(BB.ACTION_COPY[k].verb)}</b><small>${esc(BB.ACTION_COPY[k].what)}</small></div>${sel(k, perms[k])}</div>`).join('')}
      <div class="perm"><div class="t"><b>Spend on the card</b><small>${cap ? (cap.dailyLimitCents ? 'Up to ' + BB.usd(cap.dailyLimitCents) + ' a day · example card' : 'Off') : 'Example card'}</small></div><span class="inline-input">$<input type="number" min="0" step="1" inputmode="decimal" data-cap value="${cap ? (cap.dailyLimitCents / 100).toFixed(0) : ''}" aria-label="Daily card limit in dollars"></span></div>
      <div class="perm"><div class="t"><b>Action budget</b><small>Gateway fees per day, not provider billing</small></div><span class="inline-input"><input type="number" min="0" step="1" data-lim="dailyCents" value="${lim.dailyCents == null ? '' : lim.dailyCents}" placeholder="none" aria-label="Daily action budget in cents">¢</span></div>
      ${!a.hosted ? `<div class="perm"><div class="t"><b>Applies to</b><small>${a.permissionScope === 'job' ? 'Only jobs you grant, one job at a time' : 'All of its work'}</small></div><span class="choice"><select data-scope aria-label="Permission scope"><option value="standing"${a.permissionScope !== 'job' ? ' selected' : ''}>All work</option><option value="job"${a.permissionScope === 'job' ? ' selected' : ''}>Granted jobs</option></select></span></div>` : ''}
      <div class="perm"><div class="t"><b>Pause ${esc(a.name)}</b><small>Stops new steps. Nothing is deleted.</small></div><button class="tog" type="button" role="switch" aria-checked="${!!a.paused}" aria-label="Pause ${esc(a.name)}" data-pause></button></div>`;
  }

  /* ---------- profile: role, provider, home room, connection, remove ---------- */
  function profile(a) {
    const p = BB.presence(a), home = BB.homeRoomOf(a), tag = BB.channelTag(a), bsk = BB.botState(a).kind;
    const seen = a.lastSeen ? 'Last heard from ' + BB.ago(a.lastSeen) + (BB.ago(a.lastSeen) === 'just now' ? '' : ' ago') : 'Has not reported yet';
    return `<div class="kv"><span class="k">Role</span><span class="v">${esc(a.role || 'Not set')}</span></div>
      <div class="kv"><span class="k">Provider</span><span class="v">${esc(a.provider || 'Custom')}${a.model ? ' · ' + esc(a.model) : ''}</span></div>
      <div class="kv"><span class="k">Home room</span><span class="choice"><select data-room aria-label="Home room">${BB.ROOMS.map(k => `<option value="${k}"${home === k || (k === 'sales' && home === 'support') ? ' selected' : ''}>${esc(BB.roomName(k))}</option>`).join('')}</select></span></div>
      <div class="kv"><span class="k">Connection</span><span class="v"><span class="st ${tag.cls}"><i></i>${esc(tag.text)}</span><br><small class="meta">${esc(seen)}</small>${BB.wentDark(a) && bsk !== 'msg' ? `<br><span class="${BB.pollSec(a) ? 'badge-late' : 'badge-dim'}">${BB.pollSec(a) ? 'Late' : 'Went dark'} · last activity ${esc(new Date(a.lastSeen).toLocaleTimeString())}</span>` : ''}${['msg', 'dark', 'late'].includes(bsk) ? `<br><button class="b ghost sm" type="button" data-nudge style="margin-top:8px">Copy nudge</button>` : ''}</span></div>
      ${a.keyHint ? `<div class="kv"><span class="k">Key</span><span class="v"><code>${esc(a.keyHint)}</code></span></div>` : ''}
      <div class="kv"><span class="k">Bot ID</span><span class="v"><code>${esc(a.id)}</code></span></div>
      <div style="padding:8px 24px 24px;border-top:1px solid var(--line)">${a.status !== 'revoked' && !a.hosted ? `<button class="b ghost" type="button" data-revoke style="color:var(--vermilion-press);padding-left:0">Revoke access</button>` : ''}<button class="b ghost" type="button" data-remove style="color:var(--vermilion-press);padding-left:0">Remove ${esc(a.name)}</button><p class="meta">Disconnects it and deletes its stored key. Its receipts stay.</p></div>`;
  }

  function paint(fresh) {
    if (!P.classList.contains('on')) return; const a = BB.agent(cur); if (!a) return BB.closeInspector();
    const sc = P.querySelector('.scroll'), top = sc && !fresh ? sc.scrollTop : 0, focused = document.activeElement && P.contains(document.activeElement) ? document.activeElement.dataset : null;
    const ps = BB.presence(a);
    const prim = a.status === 'revoked' ? `<button class="b ink sm" type="button" data-restore style="flex:none">Restore access</button>`
      : BB.isOffline && BB.isOffline(a) ? `<button class="b ink sm" type="button" data-offcopy style="flex:none">Copy pairing code</button>`
      : !a.hosted && a.providerId === 'grok' ? `<button class="b ink sm" type="button" data-rec style="flex:none">Reconnect</button>`
      : !a.hosted && ps === 'reconnect' ? `<button class="b ink sm" type="button" data-rec style="flex:none">Reconnect</button>`
      : !a.hosted && ['prepared', 'waiting'].includes(ps) ? `<button class="b ink sm" type="button" data-rec style="flex:none">Finish connecting</button>`
      : `<button class="b ghost sm" type="button" data-perms style="flex:none">Edit permissions</button>`;
    const rec2 = !a.hosted && a.status !== 'revoked' && a.providerId !== 'grok' && !['reconnect', 'prepared', 'waiting'].includes(ps) && !(BB.isOffline && BB.isOffline(a)) ? `<button class="b out sm" type="button" data-newcode style="flex:none">New pairing code</button>` : '';
    const body = tab === 'permissions' ? permissions(a) : tab === 'profile' ? profile(a) : activity(a);
    P.innerHTML = `<div class="ins-h"><div class="ins-fig" aria-hidden="true">${BB.figureSVG(a, { ghost: BB.isGhost(a), pose: 'stand' })}</div><div class="t"><h2>${esc(a.name)}</h2>${BB.honestStatus && !BB.isGhost(a) && BB.presence(a) !== 'revoked' ? hst(a) : `<p>${BB.isGhost(a) ? '' : `<span class="st sig-${BB.signal(a)}" data-signal="${BB.signal(a)}" title="${BB.SIGNAL_COPY[BB.signal(a)]}"><i></i></span> `}${esc(BB.statusLine(a))}</p>`}</div><div class="ins-acts">${prim}${rec2}</div><button class="x" type="button" aria-label="Close" data-x>${BB.ICON.x}</button></div>
      <div class="seg" role="tablist" aria-label="${esc(a.name)}">${['activity', 'permissions', 'profile'].map(k => `<button type="button" role="tab" aria-selected="${tab === k}" data-tab="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="scroll" role="tabpanel">${body}</div>`;
    const s2 = P.querySelector('.scroll'); s2.scrollTop = top;
    if (focused) { const k = Object.keys(focused)[0]; const el = k && P.querySelector('[data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + (focused[k] ? '="' + focused[k] + '"' : '') + ']'); if (el && el.tagName !== 'INPUT') el.focus(); }
    if (fresh) requestAnimationFrame(() => P.focus({ preventScroll: true }));
    bind(a);
  }
  function bind(a) {
    P.querySelector('[data-x]').onclick = () => BB.closeInspector();
    const ep = P.querySelector('[data-perms]'); if (ep) ep.onclick = () => { tab = 'permissions'; paint(); P.querySelector('[data-tab="permissions"]').focus(); };
    P.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; paint(); P.querySelector('[data-tab="' + tab + '"]').focus(); });
    P.querySelector('[role=tablist]').onkeydown = e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; const ks = ['activity', 'permissions', 'profile']; tab = ks[(ks.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; paint(); P.querySelector('[data-tab="' + tab + '"]').focus(); };
    P.querySelectorAll('[data-job]').forEach(b => b.onclick = () => { openJob = openJob === b.dataset.job ? null : b.dataset.job; paint(); if (openJob) loadJob(openJob); });
    P.querySelectorAll('[data-receipt]').forEach(b => b.onclick = () => BB.go('#receipts/' + b.dataset.receipt));
    P.querySelectorAll('[data-share]').forEach(b => b.onclick = () => BB.openShare ? BB.openShare(b.dataset.share) : BB.go('#receipts/' + b.dataset.share));
    P.querySelectorAll('[data-grant]').forEach(b => b.onclick = () => grantModal(BB.task(b.dataset.grant), a));
    P.querySelectorAll('[data-stop]').forEach(b => b.onclick = async () => { if (!b.dataset.arm) { b.dataset.arm = 1; b.textContent = 'Click again to stop this job'; return; } const j = await BB.stop(b.dataset.stop); BB.toast(j.error || 'Job stopped. ' + (a.name || 'The bot') + ' can take its next job.'); BB.sync(true); });
    P.querySelectorAll('[data-perm]').forEach(s => s.onchange = async () => { const j = await BB.api('/api/agents/' + a.id + '/permissions', 'POST', { action: s.dataset.perm, mode: s.value }); BB.toast(j.error || BB.ACTION_COPY[s.dataset.perm].verb + ': ' + BB.MODE_COPY[s.value].toLowerCase() + '.'); BB.sync(true); });
    const cap = P.querySelector('[data-cap]'); if (cap) cap.onchange = async () => { const v = Math.round(Number(cap.value) * 100); if (!(v >= 0)) return; const j = await BB.api('/api/cards/control', 'POST', { botId: a.id, dailyLimitCents: v }); BB.toast(j.error || (v ? 'Card limit: ' + BB.usd(v) + ' a day.' : 'Card spending off.')); BB.sync(true); };
    const lim = P.querySelector('[data-lim]'); if (lim) lim.onchange = async () => { const v = lim.value === '' ? null : Math.max(0, Math.round(Number(lim.value))); const j = await BB.api('/api/agents/' + a.id + '/limits', 'POST', { perActionCents: (a.limits || {}).perActionCents ?? null, dailyCents: v }); BB.toast(j.error || 'Action budget saved.'); BB.sync(true); };
    const sc = P.querySelector('[data-scope]'); if (sc) sc.onchange = async () => { const j = await BB.api('/api/agents/' + a.id + '/permission-scope', 'POST', { scope: sc.value, confirmed: true }); BB.toast(j.error || (sc.value === 'job' ? 'Now only acts inside jobs you grant.' : 'Permissions apply to all its work.')); BB.sync(true); };
    const pz = P.querySelector('[data-pause]'); if (pz) pz.onclick = async () => { const on = pz.getAttribute('aria-checked') !== 'true'; pz.setAttribute('aria-checked', on); const j = await BB.api('/api/agents/' + a.id + '/pause', 'POST', { on }); BB.toast(j.error || (on ? a.name + ' is paused. Nothing was deleted.' : a.name + ' is back to work.')); BB.sync(true); };
    const rm = P.querySelector('[data-room]'); if (rm) rm.onchange = async () => { const j = await BB.api('/api/agents/' + a.id + '/room', 'POST', { room: rm.value }); BB.toast(j.error || a.name + ' moved to the ' + BB.roomName(rm.value) + '.'); BB.sync(true); };
    const rc = P.querySelector('[data-rec]'); if (rc) rc.onclick = () => BB.reconnect && BB.reconnect(a.id);
    const oc = P.querySelector('[data-offcopy]'); if (oc) oc.onclick = async () => { oc.disabled = true;
      try { const j = await BB.api('/api/agents/' + a.id + '/pairing', 'POST', {}); if (!j || j.error || !j.code) throw Error('no code');
        await navigator.clipboard.writeText(BB.setupMessage(a, j.code)); BB.toast('Copied. Paste it into ' + a.name + '.'); oc.textContent = 'Copied'; }
      catch (e) { oc.disabled = false; BB.toast("Couldn't copy. Opening the pairing screen."); BB.reconnect && BB.reconnect(a.id); } };
    const rc2 = P.querySelector('[data-newcode]'); if (rc2) rc2.onclick = () => BB.reconnect && BB.reconnect(a.id);
    const ng = P.querySelector('[data-nudge]'); if (ng) ng.onclick = async () => { const msg = BB.nudgeText(a); try { await navigator.clipboard.writeText(msg); } catch (e) { window.prompt('Copy this nudge', msg); } BB.toast('Copied - paste it into ' + a.name); };
    const rv = P.querySelector('[data-revoke]'); if (rv) rv.onclick = async () => { if (!rv.dataset.arm) { rv.dataset.arm = 1; rv.textContent = 'Click again to revoke'; return; } await BB.api('/api/agents/' + a.id + '/revoke', 'POST'); BB.toast('Access revoked. It must reconnect after you restore it.'); BB.sync(true); };
    const rs = P.querySelector('[data-restore]'); if (rs) rs.onclick = async () => { await BB.api('/api/agents/' + a.id + '/restore', 'POST'); BB.toast('Access restored.'); BB.sync(true); };
    const rmv = P.querySelector('[data-remove]'); if (rmv) {
      const removing = removeState.get(a.id) === 'pending';
      rmv.disabled = removing;
      if (removeState.has(a.id)) rmv.textContent = removing ? 'Removing ' + a.name + '...' : 'Click again to remove ' + a.name;
      rmv.onclick = async () => {
        if (removeState.get(a.id) === 'pending') return;
        if (!removeState.has(a.id)) { removeState.set(a.id, 'armed'); rmv.textContent = 'Click again to remove ' + a.name; return; }
        removeState.set(a.id, 'pending'); rmv.disabled = true; rmv.textContent = 'Removing ' + a.name + '...';
        try {
          const j = await BB.api('/api/agents/' + a.id + '/remove', 'POST');
          if (!j.removed) throw Error(j.error || 'Could not remove.');
          removeState.delete(a.id); if (cur === a.id) BB.closeInspector();
          BB.toast(a.name + ' removed. Its receipts stay.'); await BB.sync(true);
        } catch (e) {
          removeState.set(a.id, 'armed'); BB.toast(e.message || 'Could not remove. Try again.');
          if (cur === a.id) paint();
        }
      };
    }
  }
  /* per-job grant for bots that only act inside granted jobs */
  function grantModal(t, a) {
    if (!t) return; const g = t.jobGrant && t.jobGrant.status === 'active' ? t.jobGrant : null, perms = Object.assign({}, DEF, a.permissions || {});
    const ks = ORDER.filter(k => perms[k] !== 'NEVER');
    const box = BB.modal(`<h3>What may ${esc(a.name)} do in “${esc(t.title)}”?</h3><p>Only for this job. Anything set to Never stays blocked.</p>
      <div class="stackf">${ks.map(k => `<div class="perm" style="padding:10px 0"><div class="t"><b>${esc(BB.ACTION_COPY[k].verb)}</b><small>${esc(BB.ACTION_COPY[k].what)}</small></div><span class="choice"><select data-g="${k}"><option value="">Not in this job</option><option value="AUTO"${g && g.actions[k] === 'AUTO' ? ' selected' : ''}>Allowed</option><option value="ASK"${g && g.actions[k] === 'ASK' ? ' selected' : ''}>Ask first</option></select></span></div>`).join('')}
      <label class="fld">Action budget for this job <small>gateway fees, in cents</small><input class="in" type="number" min="0" id="g-b" value="${g ? g.budgetCents : 20}"></label></div>
      <p class="err" id="g-e" style="color:var(--vermilion-press);font-size:13px;margin-top:8px"></p>
      <div class="acts"><button class="b ghost" type="button" data-close>Cancel</button><button class="b ink" type="button" id="g-ok">Grant</button></div>`, { label: 'Grant actions' });
    box.querySelector('#g-ok').onclick = async () => {
      const actions = {}; box.querySelectorAll('[data-g]').forEach(s => { if (s.value) actions[s.dataset.g] = s.value; });
      const j = await BB.api('/api/tasks/' + t.id + '/grant', 'POST', { confirmed: true, expectedAssignee: t.assignee, actions, budgetCents: Math.round(Number(box.querySelector('#g-b').value)) });
      if (j.error) { box.querySelector('#g-e').textContent = j.error; return; } BB.closeModal(); BB.toast('Granted for this job.'); BB.sync(true);
    };
  }
  BB.on(() => { if (!P.classList.contains('on')) return; const ae = document.activeElement; if (ae && P.contains(ae) && ['INPUT', 'SELECT'].includes(ae.tagName)) return; if (openJob && BB.task(openJob) && jobCache[openJob] && (jobCache[openJob].task.status !== BB.task(openJob).status)) loadJob(openJob); paint(); });
  P.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); BB.closeInspector(); } });
})();

/* Cross-bot permissions summary (Pushback: "what can my bots do?" across all bots). Read-only grid; edit in each inspector. */
(function () {
  'use strict';
  const BB = window.BB, esc = BB.esc;
  const ORDER = ['web.fetch', 'notes.write', 'notes.delete', 'work.handoff', 'work.assign', 'work.enqueue'];
  const DEF = { 'web.fetch': 'AUTO', 'notes.write': 'ASK', 'notes.delete': 'NEVER', 'work.handoff': 'AUTO', 'work.enqueue': 'ASK', 'work.assign': 'ASK' };
  BB.openPermsOverview = function () {
    const as = BB.agents(), caps = (BB.cards && BB.cards.bots) || [];
    const box = BB.modal(`<h3>All permissions</h3><p>What each bot can do without asking. To change one, open the bot.</p>
      ${as.length ? `<div class="gp-wrap"><table class="grid-perm"><thead><tr><th>Bot</th>${ORDER.map(k => `<th>${esc(BB.ACTION_COPY[k].verb)}</th>`).join('')}<th>Card a day</th><th></th></tr></thead><tbody>
      ${as.map(a => { const p = Object.assign({}, DEF, a.permissions || {}), c = caps.find(b => b.id === a.id); return `<tr><td><b style="font-weight:500">${esc(a.name)}</b>${a.paused ? ' <span class="meta">paused</span>' : ''}</td>${ORDER.map(k => `<td class="m-${p[k]}">${BB.MODE_COPY[p[k]]}</td>`).join('')}<td>${c ? (c.dailyLimitCents ? BB.usd(c.dailyLimitCents) : 'Off') : '–'}</td><td><button class="b ghost sm" type="button" data-open="${a.id}">Edit</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="meta" style="margin-top:16px">Connect a bot to set what it can do.</p>'}`, { wide: true, label: 'All permissions' });
    box.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { BB.closeModal(); BB.openInspector(b.dataset.open, { tab: 'permissions' }); });
  };
})();

/* Deep link from outside HQ: /app#bot/<id>[/permissions] opens that bot's card. The connect flow
   lands here after a successful pairing. Waits for the first sync, then normalizes the hash. */
(function () {
  'use strict';
  const BB = window.BB;
  let tries = 0;
  function openFromHash() {
    const m = location.hash.match(/^#bot\/([^/]+)(\/permissions)?$/);
    if (!m) return;
    const a = BB.agent(decodeURIComponent(m[1]));
    if (!a) { if (tries++ < 40) setTimeout(openFromHash, 250); return; }
    history.replaceState(null, '', '#floor');
    BB.openInspector(a.id, m[2] ? { tab: 'permissions' } : {});
  }
  BB.onRoute(() => { tries = 0; openFromHash(); });
})();
