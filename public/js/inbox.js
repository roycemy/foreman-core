/* Black Box vNext · Inbox (B) and "Anything on me?" (G). There is no Work tab: jobs and approvals live here.
   Needs you (approvals, spend and card requests, reconnects) is pinned on top; Latest is one flat newest-first job list. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, $$ = BB.$$, esc = BB.esc;
  const rail = $('#rail');

  /* reconnect "Later": snoozed for this browser for four hours */
  const SNOOZE = 'bb.snooze';
  const snoozed = () => { try { const o = JSON.parse(localStorage.getItem(SNOOZE) || '{}'); return o; } catch (e) { return {}; } };
  const isSnoozed = id => (snoozed()[id] || 0) > Date.now();
  BB.snooze = id => { const o = snoozed(); o[id] = Date.now() + 4 * 3600e3; try { localStorage.setItem(SNOOZE, JSON.stringify(o)); } catch (e) { } BB.emit(); };
  BB.needsYou = () => BB.onYou().filter(i => i.type !== 'unassigned' && !(i.type === 'reconnect' && isSnoozed(i.id)));

  /* ---------- job rows (shared by the rail, the phone inbox and the pop-down) ---------- */
  const jobAt = t => [t.finishedAt, t.startedAt, t.assignedAt, t.createdAt].filter(Boolean).sort().pop();
  BB.jobStatus = t => {
    if (t.status === 'queued' && !t.assignee) return { cls: 'q', word: 'Unassigned' };
    if (t.status === 'queued') return { cls: 'q', word: 'Queued' };
    if (t.status === 'running') return BB.pendingReqs().some(q => q.taskId === t.id) ? { cls: 'need', word: 'Waiting for you' } : { cls: 'run', word: 'Running' };
    if (t.status === 'done') return { cls: 'done', word: 'Done' };
    if (t.status === 'failed') return { cls: 'fail', word: 'Failed' };
    return { cls: 'q', word: BB.sentenceCase(t.status) };
  };
  BB.jobs = () => BB.tasks().slice().sort((x, y) => String(jobAt(y)).localeCompare(String(jobAt(x))));
  BB.jobWho = t => { const shared = BB.sharedJobFor(t); if (shared) return shared.bots; const a = t.assignee && BB.agent(t.assignee); return a ? [a] : []; };
  BB.jobMeta = t => { const who = BB.jobWho(t); return (who.length ? who.map(a => a.name).join(' + ') : 'Unassigned') + ' · ' + BB.ago(jobAt(t)); };
  BB.jobAv = (t, size) => { const who = BB.jobWho(t); if (who.length > 1) return BB.duo(who, size || ''); return who.length ? BB.av(who[0], size) : `<span class="av ghost ${size || ''}" aria-hidden="true">?</span>`; };

  /* Assign ▾ : pick a bot for an unassigned job */
  BB.assignMenu = function (btn, taskId) {
    const old = $('.assign .menu.on'); if (old) old.classList.remove('on');
    let wrap = btn.closest('.assign'), m = wrap.querySelector('.menu');
    if (!m) { m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu'); wrap.appendChild(m); }
    const bots = BB.assignable();
    m.innerHTML = bots.length ? bots.map(a => `<button role="menuitem" type="button" data-bot="${a.id}">${BB.av(a, 's22')} ${esc(a.name)}</button>`).join('') : '<div class="who"><small>Connect a bot first.</small></div>';
    m.querySelectorAll('[data-bot]').forEach(b => b.onclick = async e => { e.stopPropagation(); m.classList.remove('on'); await BB.assign(taskId, b.dataset.bot); });
    m.classList.add('on'); const f = m.querySelector('button'); f && f.focus();
  };
  document.addEventListener('click', e => { if (!e.target.closest('.assign')) $$('.assign .menu.on').forEach(m => m.classList.remove('on')); });

  /* ---------- needs-you card ---------- */
  BB.itemCard = function (i, o) {
    o = o || {};
    const when = i.at ? ' · ' + esc(BB.ago(i.at)) : '', who = i.a ? `${BB.av(i.a, 's22')}${esc(i.a.name)}${when}` : `<span class="av ghost s22">?</span>${when.slice(3)}`;
    let title = esc(BB.itemTitle(i)), line = '', acts = '';
    if (i.type === 'approval') { line = esc(BB.reqLine(i.q)); acts = `<button class="b pri grow" type="button" data-d="approve">Approve</button><button class="b out grow" type="button" data-d="deny">Deny</button>`; }
    if (i.type === 'spend') { line = esc(i.q.purpose) + ' · no payment rail is connected'; acts = `<button class="b pri grow" type="button" data-d="approve">Approve</button><button class="b out grow" type="button" data-d="deny">Deny</button>`; }
    if (i.type === 'card') { line = esc(i.q.purpose) + ' · example card'; acts = `<button class="b pri grow" type="button" data-d="approve">Approve</button><button class="b out grow" type="button" data-d="deny">Deny</button>`; }
    if (i.type === 'reconnect') { title = 'Reconnect needed'; line = esc(i.a.name) + ' lost access. Reconnect to resume its jobs.'; acts = `<button class="b ink" type="button" data-rec="${i.a.id}">Reconnect</button><button class="b ghost" type="button" data-later="${esc(i.id)}">Later</button>`; }
    if (i.type === 'unassigned') { line = 'Waiting for someone to take it'; acts = `<span class="assign"><button class="b out" type="button" data-assign="${i.t.id}" aria-haspopup="menu">Assign ▾</button></span>`; }
    return `<div class="appr" data-item="${esc(i.id)}"><div class="who">${who}</div><h4>${title}</h4><p>${line}</p><div class="btns">${acts}</div></div>`;
  };
  /* one handler for every Approve / Deny / Reconnect / Later / Assign button, wherever it is rendered */
  BB.bindItems = function (root, items) {
    root.querySelectorAll('[data-item]').forEach(card => {
      const i = items.find(x => x.id === card.dataset.item); if (!i) return;
      card.querySelectorAll('[data-d]').forEach(b => b.onclick = async e => {
        e.stopPropagation(); card.querySelectorAll('button').forEach(x => x.disabled = true);
        const j = await BB.decide(i, b.dataset.d); if (j && !j.error) BB.collapse(card); else card.querySelectorAll('button').forEach(x => x.disabled = false);
      });
    });
    root.querySelectorAll('[data-rec]').forEach(b => b.onclick = e => { e.stopPropagation(); BB.closeTop && BB.closeTop(); BB.reconnect && BB.reconnect(b.dataset.rec); });
    root.querySelectorAll('[data-later]').forEach(b => b.onclick = e => { e.stopPropagation(); const card = b.closest('[data-item]'); BB.collapse(card); setTimeout(() => BB.snooze(b.dataset.later), 440); });
    root.querySelectorAll('[data-assign]').forEach(b => b.onclick = e => { e.stopPropagation(); BB.assignMenu(b, b.dataset.assign); });
  };
  /* approved row: fade 200ms, then the list reflows 240ms */
  BB.collapse = function (el) {
    if (!el || BB.reduced()) { if (el) el.remove(); return; }
    el.classList.add('collapsing');
    setTimeout(() => { const h = el.offsetHeight; el.style.height = h + 'px'; el.classList.add('reflow'); el.style.overflow = 'hidden'; requestAnimationFrame(() => { el.style.height = '0px'; el.style.marginTop = el.style.marginBottom = '0px'; el.style.paddingTop = el.style.paddingBottom = '0px'; el.style.borderWidth = '0'; }); setTimeout(() => el.remove(), 260); }, 200);
  };

  /* ---------- the rail ---------- */
  function row(t) {
    const s = BB.jobStatus(t), un = s.word === 'Unassigned';
    const right = un ? `<span class="assign act"><button class="b out sm" type="button" data-assign="${t.id}" aria-haspopup="menu">Assign ▾</button></span>` : `<span class="st ${s.cls}"><i></i>${s.word}</span>`;
    return `<div class="row" role="button" tabindex="0" data-job="${t.id}">${BB.jobAv(t)}<span class="t"><b>${esc(t.title)}</b><small>${esc(BB.jobMeta(t))}</small></span>${right}</div>`;
  }
  function paintRail() {
    if (!rail.classList.contains('on')) return;
    const needs = BB.needsYou(), jobs = BB.jobs().slice(0, 40), sc = rail.querySelector('.scroll'), top = sc ? sc.scrollTop : 0;
    rail.innerHTML = `<div class="ph"><h2 id="rail-h">Inbox</h2><span class="meta">${needs.length ? needs.length + ' need' + (needs.length === 1 ? 's' : '') + ' you' : 'Nothing on you'}</span><button class="x" type="button" aria-label="Close inbox" data-close-rail>${BB.ICON.x}</button></div>
      <div class="scroll">${needs.length ? `<div class="sec">Needs you</div>${needs.map(i => BB.itemCard(i)).join('')}` : ''}
      <div class="sec" style="padding-top:14px">Latest</div>${jobs.length ? jobs.map(row).join('') : `<div class="empty"><b>No jobs yet</b><small>Ask the team for something from the floor.</small></div>`}</div>`;
    const s2 = rail.querySelector('.scroll'); if (s2) s2.scrollTop = top;
    rail.querySelector('[data-close-rail]').onclick = () => BB.closeRail();
    BB.bindItems(rail, needs.concat(BB.onYou()));
    rail.querySelectorAll('[data-job]').forEach(r => { const open = e => { if (e.target.closest('.assign')) return; const t = BB.task(r.dataset.job); if (!t) return; const who = BB.jobWho(t); if (who.length) BB.openInspector(who[0].id, { job: t.id }); }; r.onclick = open; r.onkeydown = e => { if (e.key === 'Enter') open(e); }; });
  }
  BB.openRail = function () {
    BB.closePop && BB.closePop(); BB.closeInspector && BB.closeInspector(true);
    if (BB.phone()) return BB.go('#inbox');
    if (BB.route().v !== 'floor') BB.go('#floor');
    rail.classList.add('on'); $('#stage') && $('#stage').classList.add('dim'); $('#ibtn').setAttribute('aria-expanded', 'true'); paintRail(); BB.floorFit && BB.floorFit();
    requestAnimationFrame(() => { const f = rail.querySelector('.appr button,.row'); (f || rail).focus && (f || rail).focus(); });
  };
  BB.closeRail = function () { if (!rail.classList.contains('on')) return; rail.classList.remove('on'); $('#ibtn').setAttribute('aria-expanded', 'false'); if (!BB.panelOpen()) $('#stage') && $('#stage').classList.remove('dim'); BB.floorFit && BB.floorFit(); };
  BB.panelOpen = () => rail.classList.contains('on') || $('#insp').classList.contains('on');
  BB.closePanels = () => { BB.closeRail(); BB.closeInspector && BB.closeInspector(); };
  BB.on(paintRail);
  $('#ibtn').onclick = e => { e.stopPropagation(); if (BB.openPop) return BB.togglePop(); rail.classList.contains('on') ? BB.closeRail() : BB.openRail(); };

  /* ---------- phone Inbox: home screen. Needs you, then today's jobs. ---------- */
  function paintPhone() {
    const v = $('#v-inbox'); if (!v || !v.classList.contains('on')) return;
    const needs = BB.needsYou(), jobs = BB.jobs(), today = new Date(); today.setHours(0, 0, 0, 0);
    const todays = jobs.filter(t => Date.parse(jobAt(t)) >= today || ['running', 'queued'].includes(t.status)).slice(0, 30);
    const running = jobs.filter(t => t.status === 'running').length;
    const sub = needs.length ? needs.length + ' need' + (needs.length === 1 ? 's' : '') + ' you' : running ? running + ' running' : 'Nothing on you';
    const card = i => {
      const g = i.a ? BB.glyph(i.a) : '';
      const kav = i.a ? `<span class="kav" style="--av:${BB.avColor(i.a)}">${esc(BB.initials(i.a.name))}${g}</span>` : '<span class="kav merch">?</span>';
      let t = esc(BB.itemTitle(i)), l = '', b = '';
      if (['approval', 'spend', 'card'].includes(i.type)) {
        l = esc((i.a ? i.a.name + ' · ' : '') + (i.type === 'approval' ? ((i.q.params && (i.q.params.title || i.q.params.url)) || BB.reqLine(i.q)) + ' · ' + i.q.costCents + '¢' : i.q.purpose));
        if (i.type === 'approval') t = esc((BB.ACTION_COPY[i.q.action] || {}).ask || i.q.label || i.q.action);
        b = `<div class="kbtns"><button class="b pri" type="button" data-d="approve">Approve</button><button class="b out" type="button" data-d="deny">Deny</button></div>`;
        return `<div class="swipe" data-item="${esc(i.id)}"><div class="under" aria-hidden="true">Approve</div><div class="kr">${kav}<div class="t"><b>${t}</b><small>${l}</small>${b}</div></div></div>`;
      }
      l = esc(i.a.name) + ' lost access' + (i.at ? ' ' + esc(BB.ago(i.at)) + (BB.ago(i.at) === 'just now' ? '' : ' ago') : '');
      return `<div class="kr" data-item="${esc(i.id)}">${kav}<div class="t"><b>Reconnect ${esc(i.a.name)}</b><small>${l}</small></div><button class="b out" type="button" style="height:36px;border-radius:11px" data-rec="${i.a.id}">Reconnect</button></div>`;
    };
    const jrow = t => {
      const who = BB.jobWho(t), s = BB.jobStatus(t), a = who[0];
      const kav = who.length > 1 ? BB.duo(who, 's28') : a ? `<span class="kav" style="--av:${BB.avColor(a)}">${esc(BB.initials(a.name))}${t.status === 'running' ? BB.glyph(a) : ''}</span>` : '<span class="kav merch">?</span>';
      const meta = (who.length ? who.map(x => x.name).join(' + ') : 'Unassigned') + ' · ' + (t.status === 'running' && t.startedAt ? 'started ' + BB.ago(t.startedAt) + (BB.ago(t.startedAt) === 'just now' ? '' : ' ago') : BB.ago(jobAt(t)) + (/min|h$/.test(BB.ago(jobAt(t))) ? ' ago' : ''));
      const right = s.word === 'Unassigned' ? `<span class="assign"><button class="b out sm" type="button" data-assign="${t.id}">Assign ▾</button></span>` : `<span class="r">${s.word}</span>`;
      return `<div class="kr" role="button" tabindex="0" data-job="${t.id}">${kav}<div class="t"><b>${esc(t.title)}</b><small>${esc(meta)}</small></div>${right}</div>`;
    };
    v.innerHTML = `<div class="kh"><h1>Inbox</h1><div class="end"><button class="plus" type="button" aria-label="New job" data-newjob>${BB.ICON.plus}</button>${BB.acctAv ? BB.acctAv() : ''}</div></div><div class="ks">${esc(sub)}</div>
      ${needs.length ? `<div class="kl">Needs you</div>${needs.map(card).join('')}` : ''}
      <div class="kl" style="padding-top:${needs.length ? 28 : 8}px">Today</div>${todays.length ? todays.map(jrow).join('') : `<div class="ks" style="padding-top:4px">No jobs today. Tap + to ask the team for something.</div>`}
      <div class="ks" style="padding-top:24px"><button class="link" type="button" data-go-floor>View floor</button></div>`;
    BB.bindItems(v, needs.concat(BB.onYou()));
    v.querySelector('[data-newjob]').onclick = () => BB.newJob();
    v.querySelector('[data-go-floor]').onclick = () => BB.go('#floor');
    v.querySelectorAll('[data-job]').forEach(r => r.onclick = e => { if (e.target.closest('.assign')) return; const t = BB.task(r.dataset.job), who = t && BB.jobWho(t); if (who && who.length) BB.openInspector(who[0].id, { job: t.id }); });
    v.querySelectorAll('.swipe').forEach(bindSwipe);
  }
  /* swipe left to approve: an 8px threshold arms it, past 96px it approves; the buttons are always there */
  function bindSwipe(w) {
    const kr = w.querySelector('.kr'); let x0 = null, dx = 0, armed = false;
    w.addEventListener('touchstart', e => { if (e.target.closest('button')) return; x0 = e.touches[0].clientX; dx = 0; armed = false; }, { passive: true });
    w.addEventListener('touchmove', e => {
      if (x0 == null) return; dx = Math.min(0, e.touches[0].clientX - x0);
      if (!armed && dx < -8) { armed = true; w.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(8); }
      if (armed) kr.style.transform = 'translateX(' + Math.max(dx, -140) + 'px)';
    }, { passive: true });
    w.addEventListener('touchend', () => {
      if (x0 == null) return; x0 = null; w.classList.remove('dragging');
      if (armed && dx < -96) { const b = w.querySelector('[data-d=approve]'); kr.style.transform = 'translateX(-100%)'; b && b.click(); }
      else kr.style.transform = '';
    });
  }
  BB.on(paintPhone); BB.onRoute(r => { if (r.v === 'inbox') paintPhone(); });
})();
