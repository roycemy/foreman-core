/* Black Box vNext · "Anything on me?" (G). The Inbox button opens this quick view first; it is not a second inbox.
   "Open inbox →" opens the full rail. Phone: the same content as a bottom sheet from the Inbox tab badge. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const pop = $('#pop'), sheet = $('#sheet'), scrim = $('#scrim'), ibtn = $('#ibtn');
  let lastFocus = null;

  /* one row per thing on you: avatar, 14/500 title, 12.5 mute line, one or two 32px actions */
  function line(i) {
    if (i.type === 'approval') { const c = BB.ACTION_COPY[i.q.action]; return i.a.name + ' · ' + (c ? c.what.toLowerCase().replace(/^saves drafts to/, 'writes to') : i.q.label) + ' · ' + i.q.costCents + '¢'; }
    if (i.type === 'spend') return i.a.name + ' · ' + i.q.purpose;
    if (i.type === 'card') return i.a.name + ' · ' + i.q.purpose + ' · example card';
    if (i.type === 'reconnect') return 'Lost access' + (i.at ? ' ' + BB.ago(i.at) + (BB.ago(i.at) === 'just now' ? '' : ' ago') : '') + '. Its jobs are paused.';
    return 'Waiting for someone to take it · ' + BB.ago(i.at);
  }
  function title(i) { return i.type === 'reconnect' ? i.a.name + ' needs reconnecting' : BB.itemTitle(i); }
  function acts(i, big) {
    const sz = big ? '' : ' sm';
    if (['approval', 'spend', 'card'].includes(i.type)) return big ? `<div class="kbtns"><button class="b pri" type="button" data-d="approve">Approve</button><button class="b out" type="button" data-d="deny">Deny</button></div>` : `<div class="btns"><button class="b pri${sz}" type="button" data-d="approve" aria-keyshortcuts="A">Approve</button><button class="b out${sz}" type="button" data-d="deny" aria-keyshortcuts="D">Deny</button></div>`;
    if (i.type === 'reconnect') return big ? '' : `<div class="btns"><button class="b ink${sz}" type="button" data-rec="${i.a.id}">Reconnect</button></div>`;
    return `<div class="btns"><span class="assign"><button class="b out${sz}" type="button" data-assign="${i.t.id}" aria-haspopup="menu">Assign ▾</button></span></div>`;
  }
  const avOf = (i, phone) => i.a ? (phone ? `<span class="kav" style="--av:${BB.avColor(i.a)}">${esc(BB.initials(i.a.name))}${BB.glyph(i.a)}</span>` : BB.av(i.a)) : (phone ? '<span class="kav merch">?</span>' : '<span class="av ghost" aria-hidden="true">?</span>');
  const things = n => n + (n === 1 ? ' thing' : ' things');
  const runningN = () => BB.tasks().filter(t => t.status === 'running').length;

  function paintPop() {
    if (!pop.classList.contains('on')) return;
    const items = BB.onYou(), was = pop.dataset.empty;
    const html = items.length
      ? `<div class="pin"><h3 id="pop-h">Anything on me? <span>${things(items.length)}</span></h3>${items.map(i => `<div class="pr" data-item="${esc(i.id)}">${avOf(i)}<div class="t"><b>${esc(title(i))}</b><small>${esc(line(i))}</small>${acts(i)}</div></div>`).join('')}</div>
         <div class="popf"><span>${items.some(i => ['approval', 'spend', 'card'].includes(i.type)) ? 'Approve with A · Deny with D' : 'Esc to close'}</span><button type="button" data-open>Open inbox →</button></div>`
      : `<div class="pin"><h3 id="pop-h" class="sr">Anything on me?</h3><div class="empty"><div class="ok">${BB.GLYPH.tick}</div><b>Nothing on you.</b><small>Your team's handling it.</small></div></div>
         <div class="popf"><span>${runningN() ? runningN() + (runningN() === 1 ? ' job' : ' jobs') + ' running' : 'No jobs running'}</span><button type="button" data-open>Open inbox →</button></div>`;
    /* the last row turns into the empty state with a crossfade */
    if (!items.length && was === '0' && !BB.reduced()) { pop.style.transition = 'none'; pop.style.opacity = .4; requestAnimationFrame(() => { pop.style.transition = ''; pop.style.opacity = ''; }); }
    pop.dataset.empty = items.length ? '0' : '1';
    pop.innerHTML = html; BB.bindItems(pop, items);
    pop.querySelector('[data-open]').onclick = () => { closePop(true); BB.openRail(); };
    place();
  }
  function place() {
    const r = ibtn.getBoundingClientRect(); if (!r.width) return;
    const right = Math.max(12, innerWidth - r.right - 18); pop.style.right = right + 'px';
    const popRight = innerWidth - right, center = r.left + r.width / 2; pop.style.setProperty('--caret', Math.max(16, popRight - center - 6) + 'px');
  }
  function openPop() { lastFocus = document.activeElement; BB.closeRail(); pop.classList.add('on'); ibtn.setAttribute('aria-expanded', 'true'); paintPop(); requestAnimationFrame(() => { const f = pop.querySelector('.pr button,[data-open]'); f && f.focus(); }); }
  function closePop(keep) { if (!pop.classList.contains('on')) return; pop.classList.remove('on'); ibtn.setAttribute('aria-expanded', 'false'); if (!keep && lastFocus && lastFocus.focus) lastFocus.focus(); }
  BB.openPop = openPop; BB.closePop = closePop; BB.popOpen = () => pop.classList.contains('on') || sheet.classList.contains('on');
  BB.togglePop = () => pop.classList.contains('on') ? closePop() : openPop();
  document.addEventListener('click', e => { if (pop.classList.contains('on') && !e.target.closest('#pop,#ibtn')) closePop(true); });
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } });
  addEventListener('resize', place);

  /* ---------- phone: bottom sheet (28 radius, 8px inset, grab handle, 28% scrim) ---------- */
  function paintSheet() {
    if (!sheet.classList.contains('on')) return; const items = BB.onYou();
    sheet.innerHTML = `<div class="grab" aria-hidden="true"></div>` + (items.length
      ? `<div class="sh"><b>Anything on me?</b><span>${things(items.length)}</span></div>${items.map(i => `<div class="kr" data-item="${esc(i.id)}">${avOf(i, true)}<div class="t"><b>${esc(i.type === 'reconnect' ? 'Reconnect ' + i.a.name : i.type === 'approval' ? ((BB.ACTION_COPY[i.q.action] || {}).ask || i.q.label) : title(i))}</b><small>${esc(i.type === 'approval' ? i.a.name + ' · ' + ((i.q.params && (i.q.params.title || i.q.params.url)) || '') + ' · ' + i.q.costCents + '¢' : i.type === 'reconnect' ? 'Lost access' + (i.at ? ' ' + BB.ago(i.at) + (BB.ago(i.at) === 'just now' ? '' : ' ago') : '') : line(i))}</small>${acts(i, true)}</div>${i.type === 'reconnect' ? `<button class="b out" type="button" style="height:36px;border-radius:11px" data-rec="${i.a.id}">Reconnect</button>` : ''}</div>`).join('')}`
      : `<div class="empty"><div class="ok">${BB.GLYPH.tick}</div><b>Nothing on you.</b><small>Your team's handling it.</small></div>`)
      + `<div class="open"><button type="button" data-open>Open inbox</button></div>`;
    BB.bindItems(sheet, items);
    sheet.querySelector('[data-open]').onclick = () => { closeSheet(); BB.go('#inbox'); };
  }
  function openSheet() { lastFocus = document.activeElement; sheet.classList.add('on'); scrim.classList.add('on'); paintSheet(); requestAnimationFrame(() => { const f = sheet.querySelector('button'); f && f.focus(); }); }
  function closeSheet() { sheet.classList.remove('on'); scrim.classList.remove('on'); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  BB.openSheet = openSheet; BB.closeSheet = closeSheet;
  scrim.onclick = () => { if (sheet.classList.contains('on')) closeSheet(); else { BB.closeInspector && BB.closeInspector(); scrim.classList.remove('on'); } };
  sheet.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  /* drag the grab handle down to close */
  let y0 = null; sheet.addEventListener('touchstart', e => { if (e.target.closest('.grab,.sh')) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true });
  sheet.addEventListener('touchend', e => { if (y0 == null) return; const dy = parseFloat((sheet.style.transform.match(/[\d.]+/) || [0])[0]); sheet.style.transform = ''; y0 = null; if (dy > 80) closeSheet(); });
  /* the Inbox tab badge opens the sheet from any tab */
  document.addEventListener('click', e => { if (!e.target.closest('#tcount')) return; e.preventDefault(); e.stopPropagation(); openSheet(); }, true);

  /* ---------- keys: I opens the inbox; A / D act on the first request while the pop-down is open ---------- */
  BB.keys = function (e) {
    const k = e.key.toLowerCase();
    if (k === 'i' && !BB.phone()) { e.preventDefault(); return BB.openRail(); }
    if ((k === 'a' || k === 'd') && pop.classList.contains('on')) {
      const row = pop.querySelector('.pr [data-d]'); if (!row) return; e.preventDefault();
      const b = row.closest('.pr').querySelector('[data-d="' + (k === 'a' ? 'approve' : 'deny') + '"]'); b && !b.disabled && b.click();
    }
  };
  BB.on(() => { paintPop(); paintSheet(); });
})();
