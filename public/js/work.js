/* Work control (top right): active and finished work in one panel, honest about what is known.
   Everything shown comes from BB.S through BBWork (work-model.js). Task titles, bot names, reasons and results are untrusted text: every
   string is escaped here, and no HTML from the server is ever inserted. Nothing here sends email, push or browser notifications. */
(function () {
  'use strict';
  const BB = window.BB, M = window.BBWork, esc = BB.esc, $ = BB.$;
  if (!M) return;
  const W = BB.work = BB.work || {};
  const ui = { open: false, tab: 'active', updOpen: false, rowOpen: {}, announced: new Set(), prev: null, pulse: 0 };
  const pending = []; // owner submissions: { ref, path, body, title, state: 'sending'|'failed'|'accepted', error, taskId }
  let ack = null, lastHtml = '', lastBtn = '';

  /* ---------- acknowledgement: explicit only (open a receipt, or Mark all seen). Fetching and re-rendering never mark anything seen. ---------- */
  const ackKey = () => 'alter.work.ack.v1:' + ((BB.who && BB.who.workspace) || 'default');
  function loadAck() { try { const v = JSON.parse(localStorage.getItem(ackKey()) || 'null'); if (v && v.v === 1 && Number.isFinite(v.since) && v.seen && typeof v.seen === 'object') return v; } catch (e) { } return null; }
  function saveAck() { try { localStorage.setItem(ackKey(), JSON.stringify(ack)); } catch (e) { } }
  /* Nothing is created or saved until the workspace and the server clock are known (this file loads before sign-in finishes). Until then nothing counts as new. */
  const NO_ACK = { v: 1, since: Infinity, seen: {} }; let ackFor = null;
  function theAck() {
    if (!BB.who || !BB.S) return NO_ACK;
    const k = ackKey(); if (ack && ackFor === k) return ack;
    ack = loadAck(); ackFor = k; if (!ack) { ack = M.newAck(BB.now()); saveAck(); } return ack;
  }
  function markSeen(ids) { const cur = theAck(); if (cur === NO_ACK) return; ack = M.markSeen(cur, ids, M.finishedItems(BB.S || {}, BB.now())); saveAck(); paint(true); }
  W.markSeen = markSeen;

  /* ---------- submitting work: pending the moment the owner presses Start, accepted only when the server confirms the task record ---------- */
  const newRef = () => { try { if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, ''); } catch (e) { } return Math.random().toString(36).slice(2) + Date.now().toString(36); };
  async function post(entry) {
    entry.state = 'sending'; entry.error = ''; paint(true);
    let j;
    entry.unknown = false;
    try { j = await BB.api(entry.path, 'POST', entry.body); } catch (e) { entry.unknown = !(e && e.auth); j = { error: e && e.auth ? 'Please sign in again.' : "No answer from Alter, so it isn't confirmed whether it was received. Trying again is safe: it will not create a second job." }; }
    if (j && j.error) { entry.state = 'failed'; entry.error = String(j.error).slice(0, 220); paint(true); return j; }
    entry.state = 'accepted'; entry.taskId = j && j.task && j.task.id; paint(true);
    BB.sync(true).then(() => { setTimeout(() => { const i = pending.indexOf(entry); if (i >= 0 && entry.taskId && BB.task(entry.taskId)) { pending.splice(i, 1); paint(true); } }, 0); });
    setTimeout(() => { const i = pending.indexOf(entry); if (i >= 0) { pending.splice(i, 1); paint(true); } }, 20000);
    return j;
  }
  /* The same entry (same clientRef) is used for a retry, so a lost response can never create a second task. */
  W.send = function (path, body, title) {
    // pressing Start again on the same text after a failed send retries that same request (same clientRef), so a lost response can't make two tasks
    const same = pending.find(x => x.state === 'failed' && x.path === path && JSON.stringify({ ...x.body, clientRef: 0 }) === JSON.stringify({ ...body, clientRef: 0 })); if (same) return post(same);
    return W._new(path, body, title);
  };
  W._new = function (path, body, title) { const entry = { ref: newRef(), path, title: String(title || body.title || 'New work'), state: 'sending', error: '', taskId: null }; entry.body = { ...body, clientRef: entry.ref }; pending.push(entry); return post(entry); };
  W.retry = ref => { const e = pending.find(x => x.ref === ref); if (e && e.state === 'failed') post(e); };
  W.dismissPending = ref => { const i = pending.findIndex(x => x.ref === ref && x.state === 'failed'); if (i >= 0) { pending.splice(i, 1); paint(true); } };
  W.pending = () => pending.slice();

  /* ---------- derived view ---------- */
  const coarse = t => Math.floor(t / 15000) * 15000; // text changes at most every 15 s, so the panel is not rebuilt (and focus not lost) every second
  function view() {
    const S = BB.S || {}, now = coarse(BB.now());
    const fin = M.finishedItems(S, now), unseen = M.unseen(fin, theAck());
    return { S, now, fin, unseen, unseenIds: new Set(unseen.map(f => f.id)), active: M.activeItems(S, now), fresh: M.freshness(Date.now(), BB.lastSync, BB.offline), loaded: !!BB.S };
  }
  const ageWord = ms => { if (ms == null) return ''; const a = M.ago(ms, BB.now()); return a === 'just now' ? a : a + ' ago'; };
  const CHIP = { queued: 'Queued', running: 'In progress', waiting: 'Waiting', done: 'Finished', partial: 'Partly finished', failed: "Didn't finish", stopped: 'Stopped' };

  /* ---------- button ---------- */
  function btnState(v) {
    const sending = pending.filter(p => p.state === 'sending').length, failedSend = pending.filter(p => p.state === 'failed').length;
    if (sending) return { cls: 'is-sending', label: 'Sending…', n: 0, aria: 'Work: sending your request' };
    if (failedSend) return { cls: 'is-failed', label: pending.some(p => p.state === 'failed' && p.unknown) ? 'Not confirmed' : 'Not sent', n: failedSend, aria: 'Work: ' + failedSend + ' request' + (failedSend === 1 ? '' : 's') + ' not sent or not confirmed' };
    if (v.unseen.length) return { cls: 'has-finished', label: 'Work finished', n: v.unseen.length, aria: 'Work finished: ' + v.unseen.length + ' new' };
    if (v.active.length) return { cls: 'is-active', label: v.active.length + ' active', n: 0, aria: 'Work: ' + v.active.length + ' active' };
    return { cls: '', label: 'Work', n: 0, aria: 'Work' };
  }
  W.btnHTML = (extra) => `<button class="wbtn${extra ? ' ' + extra : ''}" type="button" aria-haspopup="dialog" aria-expanded="${ui.open}" aria-controls="wpanel"><span class="wdot" aria-hidden="true"></span><span class="wlabel">Work</span><b class="wcount" hidden></b></button>`;
  function paintBtns(v) {
    const b = btnState(v), stale = v.fresh.state === 'stale' || v.fresh.state === 'offline', key = JSON.stringify([b, stale, ui.open]);
    if (key === lastBtn) return; lastBtn = key;
    document.querySelectorAll('.wbtn').forEach(el => {
      el.className = el.className.replace(/\b(is-sending|is-failed|has-finished|is-active|is-stale)\b/g, '').replace(/\s+/g, ' ').trim() + (b.cls ? ' ' + b.cls : '') + (stale ? ' is-stale' : '');
      el.querySelector('.wlabel').textContent = b.label; const c = el.querySelector('.wcount'); c.hidden = !b.n; c.textContent = b.n || '';
      el.setAttribute('aria-label', b.aria + (stale ? ' (last known, not refreshing)' : '')); el.setAttribute('aria-expanded', ui.open);
    });
  }

  /* ---------- panel ---------- */
  function freshHTML(v) {
    if (v.fresh.state === 'live') return '';
    if (v.fresh.state === 'loading') return '<p class="wfresh" role="status">Loading your work…</p>';
    const age = v.fresh.ageMs != null ? ' Last updated ' + (M.ago(0, v.fresh.ageMs) === 'just now' ? 'just now' : M.ago(0, v.fresh.ageMs) + ' ago') + '.' : '';
    return `<p class="wfresh bad" role="status">${v.fresh.state === 'offline' ? "Couldn't refresh." : 'Updates are late.'}${esc(age)} What you see below is the last known state, not confirmed now.</p>`;
  }
  function pendingHTML() {
    return pending.map(p => p.state === 'sending' ? `<li class="wi wp"><div class="wi-top"><b class="wi-title">${esc(p.title)}</b><span class="wchip st-sending">Sending…</span></div><p class="wi-meta">Waiting for Alter to confirm it was received.</p></li>`
      : p.state === 'failed' ? `<li class="wi wp"><div class="wi-top"><b class="wi-title">${esc(p.title)}</b><span class="wchip st-failed">${p.unknown ? 'Not confirmed' : 'Not sent'}</span></div><p class="wi-meta">${esc(p.error)}</p><div class="wi-act"><button class="b ink sm" type="button" data-wretry="${esc(p.ref)}" data-fk="retry-${esc(p.ref)}">Try again</button><button class="b ghost sm" type="button" data-wdismiss="${esc(p.ref)}" data-fk="dis-${esc(p.ref)}">Dismiss</button></div></li>`
        : `<li class="wi wp"><div class="wi-top"><b class="wi-title">${esc(p.title)}</b><span class="wchip st-queued">Received</span></div><p class="wi-meta">Alter confirmed it. It appears below once it is in the queue.</p></li>`).join('');
  }
  function activeHTML(v) {
    const rows = pendingHTML() + v.active.map(i => {
      const unconf = i.phase === 'queued' && i.detail.includes('Pickup not confirmed');
      const meta = [i.part && i.part.n ? 'Part ' + i.part.n + ' of ' + i.part.of + (i.part.title ? ': ' + M.short(i.part.title, 40) : '') : null, i.bot, i.ageMs != null && i.phase === 'queued' ? 'queued ' + M.ago(0, i.ageMs) : null, unconf ? 'pickup not confirmed' : null].filter(Boolean).join(' · ');
      const open = !!ui.rowOpen[i.id], extra = i.failedSoFar ? `<p class="wi-warn">${i.failedSoFar} earlier part${i.failedSoFar === 1 ? '' : 's'} did not finish.</p>` : '';
      /* a bar only where real steps exist (done of total); a single running job gets an indeterminate bar that claims no fraction */
      const bar = i.progress ? `<div class="wprog" role="progressbar" aria-valuemin="0" aria-valuemax="${i.progress.total}" aria-valuenow="${i.progress.done}" title="${i.progress.done} of ${i.progress.total} steps done"><i style="width:${Math.round(i.progress.done / i.progress.total * 100)}%"></i></div>` : (i.phase === 'running' ? '<div class="wprog ind" role="progressbar" aria-label="In progress; no step count to show"><i></i></div>' : '');
      return `<li class="wi" data-run="${esc(i.id)}"><div class="wi-top"><b class="wi-title">${esc(i.title)}</b><span class="wchip st-${esc(i.phase)}">${esc(i.label)}</span></div>${meta ? `<p class="wi-meta">${esc(meta)}</p>` : ''}${bar}${extra}
        <ul class="wi-detail">${i.detail.filter(d => !(unconf && d === 'Pickup not confirmed')).slice(0, open ? 8 : 2).map(d => `<li>${esc(d)}</li>`).join('')}</ul>
        <div class="wi-act">${i.detail.filter(d => !(unconf && d === 'Pickup not confirmed')).length > 2 ? `<button class="wlink" type="button" data-wmore="${esc(i.id)}" data-fk="more-${esc(i.id)}" aria-expanded="${open}">${open ? 'Fewer details' : 'All details'}</button>` : ''}<a class="wlink" href="#receipts/${encodeURIComponent(i.id)}" data-wgo data-fk="open-${esc(i.id)}">Open</a></div></li>`;
    }).join('');
    const upd = M.recentUpdates(v.S, v.now, 12);
    const updHTML = `<div class="wupd"><button class="wlink" type="button" data-wupd data-fk="upd" aria-expanded="${ui.updOpen}">${ui.updOpen ? 'Hide recent updates' : 'Recent updates (' + upd.length + ')'}</button>${ui.updOpen ? (upd.length ? `<ol class="wupd-list">${upd.map(u => `<li><span class="wu-k">${esc(u.kind)}</span> ${esc([u.bot, u.title].filter(Boolean).join(' · '))}<small>${esc(M.ago(u.at, v.now) === 'just now' ? 'just now' : M.ago(u.at, v.now) + ' ago')}</small></li>`).join('')}</ol>` : '<p class="wi-meta">No recent updates.</p>') : ''}</div>`;
    return (rows ? `<ul class="wlist">${rows}</ul>` : `<p class="wempty"><b>Nothing active</b>Work you start shows up here as soon as Alter receives it.</p>`) + updHTML;
  }
  function finishedHTML(v) {
    if (!v.fin.length) return `<p class="wempty"><b>Nothing finished yet</b>Finished work appears here with a receipt.</p>`;
    const rows = v.fin.slice(0, 20).map(f => {
      const meta = [f.bots.join(' + ') || null, f.partsTotal > 1 ? f.partsDone + ' of ' + f.partsTotal + ' parts' : null, ageWord(f.finishedAtMs)].filter(Boolean).join(' · '), isNew = v.unseenIds.has(f.id);
      return `<li class="wi wf${isNew ? ' is-new' : ''}" data-run="${esc(f.id)}"><div class="wi-top"><b class="wi-title">${isNew ? '<i class="wnew" aria-label="New"></i>' : ''}${esc(f.title)}</b><span class="wchip st-${esc(f.status)}">${esc(CHIP[f.status] || f.status)}</span></div><p class="wi-meta">${esc(meta)}</p>
        <div class="wi-act"><button class="b ink sm" type="button" data-wreceipt="${esc(f.id)}" data-fk="rcpt-${esc(f.id)}">Show receipt</button></div></li>`;
    }).join('');
    return `<ul class="wlist">${rows}</ul>${v.unseen.length ? '<div class="wfoot"><button class="wlink" type="button" data-wseen data-fk="seen">Mark all seen</button></div>' : ''}`;
  }
  function panelHTML(v) {
    const unseen = v.unseen.length;
    return `<div class="whead"><div class="wtabs" role="tablist" aria-label="Work"><button class="wtab" role="tab" id="wt-active" aria-selected="${ui.tab === 'active'}" aria-controls="wp-body" data-wtab="active" data-fk="tab-active" tabindex="${ui.tab === 'active' ? 0 : -1}">Active <span class="wn">${v.active.length + pending.filter(p => p.state !== 'accepted').length}</span></button><button class="wtab" role="tab" id="wt-fin" aria-selected="${ui.tab === 'finished'}" aria-controls="wp-body" data-wtab="finished" data-fk="tab-finished" tabindex="${ui.tab === 'finished' ? 0 : -1}">Finished${unseen ? ` <span class="wn hot">${unseen} new</span>` : ''}</button></div><button class="wclose" type="button" aria-label="Close work panel" data-wclose data-fk="close">×</button></div>
      ${freshHTML(v)}<div class="wbody" id="wp-body" role="tabpanel" aria-labelledby="${ui.tab === 'active' ? 'wt-active' : 'wt-fin'}" tabindex="-1">${!v.loaded ? '<p class="wempty"><b>Loading…</b></p>' : ui.tab === 'active' ? activeHTML(v) : finishedHTML(v)}</div>`;
  }
  function panel() { let p = $('#wpanel'); if (!p) { p = document.createElement('div'); p.id = 'wpanel'; p.className = 'wpanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Work'); p.setAttribute('aria-modal', 'false'); p.hidden = true; document.body.appendChild(p); } return p; }
  function paintPanel(v, force) {
    const p = panel(); if (!ui.open) { p.hidden = true; return; }
    const html = panelHTML(v); if (!force && html === lastHtml && !p.hidden) return;
    const keep = document.activeElement && p.contains(document.activeElement) ? document.activeElement.dataset.fk : null, body = p.querySelector('.wbody'), top = body ? body.scrollTop : 0;
    p.hidden = false; p.innerHTML = html; lastHtml = html;
    const nb = p.querySelector('.wbody'); if (nb) nb.scrollTop = top;
    if (keep) { const el = [...p.querySelectorAll('[data-fk]')].find(x => x.dataset.fk === keep); if (el) el.focus({ preventScroll: true }); }
    place();
  }
  function place() {
    const p = panel(), anchor = [...document.querySelectorAll('.wbtn')].find(b => b.offsetParent !== null);
    if (innerWidth <= 760 || !anchor) { p.classList.add('wsheet'); p.style.top = ''; p.style.right = ''; return; }
    p.classList.remove('wsheet'); const r = anchor.getBoundingClientRect(); p.style.top = Math.round(r.bottom + 10) + 'px'; p.style.right = Math.max(12, Math.round(innerWidth - r.right)) + 'px';
  }
  function paint(force) { if (!BB.S && !pending.length && !force) { paintBtns(view()); return; } const v = view(); paintBtns(v); paintPanel(v, force); }
  W.paint = paint;

  function openPanel(btn, tab) {
    const v = view(); ui.tab = tab || (v.unseen.length ? 'finished' : 'active'); ui.open = true; ui.trigger = btn || ui.trigger; lastHtml = ''; paint(true);
    const t = panel().querySelector('[aria-selected=true]'); if (t) t.focus();
  }
  function closePanel(refocus) { if (!ui.open) return; ui.open = false; panel().hidden = true; paintBtns(view()); lastBtn = ''; paintBtns(view()); if (refocus && ui.trigger && document.contains(ui.trigger)) ui.trigger.focus(); }
  W.open = openPanel; W.close = closePanel;

  document.addEventListener('click', e => {
    const p = panel(), t = e.target;
    const b = t.closest && t.closest('.wbtn'); if (b) { e.preventDefault(); ui.open ? closePanel(true) : openPanel(b); return; }
    if (!p.contains(t)) { if (ui.open) closePanel(false); return; }
    let el;
    if (t.closest('[data-wclose]')) return closePanel(true);
    if ((el = t.closest('[data-wtab]'))) { ui.tab = el.dataset.wtab; paint(true); const n = p.querySelector('[aria-selected=true]'); if (n) n.focus(); return; }
    if ((el = t.closest('[data-wmore]'))) { ui.rowOpen[el.dataset.wmore] = !ui.rowOpen[el.dataset.wmore]; return paint(true); }
    if (t.closest('[data-wupd]')) { ui.updOpen = !ui.updOpen; return paint(true); }
    if ((el = t.closest('[data-wretry]'))) return W.retry(el.dataset.wretry);
    if ((el = t.closest('[data-wdismiss]'))) return W.dismissPending(el.dataset.wdismiss);
    if (t.closest('[data-wseen]')) return markSeen(null);
    if ((el = t.closest('[data-wreceipt]'))) { const id = el.dataset.wreceipt; markSeen([id]); closePanel(false); return BB.go('#receipts/' + encodeURIComponent(id)); }
    if (t.closest('[data-wgo]')) { closePanel(false); }
  });
  document.addEventListener('keydown', e => {
    if (!ui.open) return; const p = panel();
    if (e.key === 'Escape' && !document.querySelector('#modal.on')) { e.stopPropagation(); closePanel(true); return; }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && document.activeElement && document.activeElement.dataset && document.activeElement.dataset.wtab) { ui.tab = document.activeElement.dataset.wtab === 'active' ? 'finished' : 'active'; paint(true); const n = p.querySelector('[aria-selected=true]'); if (n) n.focus(); e.preventDefault(); }
  });
  addEventListener('resize', () => { if (ui.open) place(); });

  /* ---------- one-time completion indication, from a real change observed by this page; old completions are never replayed ---------- */
  function observe() {
    if (!BB.S) return; const S = BB.S, now = BB.now();
    if (ui.prev === null) { ui.prev = M.snapshot(S); return; }
    const tr = M.transitions(ui.prev, S, now); ui.prev = M.snapshot(S);
    const fresh = tr.filter(f => !ui.announced.has(f.id + ':' + f.finishedAtMs) && !(theAck().seen[f.id] >= f.finishedAtMs));
    fresh.forEach(f => ui.announced.add(f.id + ':' + f.finishedAtMs));
    if (!fresh.length) return;
    BB.toast(fresh.length === 1 ? M.finishCopy(fresh[0]) : fresh.length + ' pieces of work finished. Open Work to see them.');
    ui.pulse = Date.now(); document.querySelectorAll('.wbtn').forEach(b => { b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 2400); });
  }
  BB.on(() => { observe(); paint(false); });
  /* opening a receipt is the owner's explicit look at it */
  BB.onRoute(r => { if (r.v === 'receipts' && r.arg && BB.S) { const f = M.finishedItems(BB.S, BB.now()).find(x => x.id === r.arg); if (f && M.unseen([f], theAck()).length) markSeen([r.arg]); } });
  paint(true);
})();
