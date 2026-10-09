/* Black Box vNext · ⌘K: search or jump to a bot. Also lists rooms (rooms are hover-only on the floor) and
   holds the actions that left the top bar, Emergency stop included. */
(function () {
  'use strict';
  const BB = window.BB, $ = BB.$, esc = BB.esc;
  const M = $('#cmdk'); let items = [], sel = 0, last = null;
  function all() {
    const out = [];
    BB.agents().forEach(a => out.push({ g: 'Bots', label: a.name, sub: BB.statusLine(a), icon: BB.av(a, 's28'), run: () => BB.openInspector(a.id), keys: a.name + ' ' + (a.role || '') + ' ' + (a.provider || '') }));
    BB.ROOMS.forEach(k => { const n = BB.agents().filter(a => !BB.isGhost(a) && (k === 'sales' ? ['sales', 'support'].includes(BB.roomOf(a)) : BB.roomOf(a) === k)).length; out.push({ g: 'Rooms', label: BB.roomName(k), sub: n + ' here', icon: `<span class="ic">${BB.ICON.room}</span>`, run: () => { BB.go('#floor'); setTimeout(() => BB.focusRoom(k), 60); }, keys: BB.roomName(k) + ' room' }); });
    BB.jobs().slice(0, 30).forEach(t => { const who = BB.jobWho(t); out.push({ g: 'Jobs', label: t.title, sub: BB.jobStatus(t).word, icon: `<span class="ic">${BB.ICON.receipt}</span>`, run: () => ['done', 'failed'].includes(t.status) ? BB.go('#receipts/' + t.id) : who.length ? BB.openInspector(who[0].id, { job: t.id }) : BB.openRail(), keys: t.title + ' ' + who.map(a => a.name).join(' ') }); });
    const A = (label, icon, run, sub) => out.push({ g: 'Actions', label, sub: sub || '', icon: `<span class="ic">${icon}</span>`, run, keys: label });
    A('Open inbox', BB.ICON.inbox, () => BB.openRail(), 'I');
    A('New job', BB.ICON.plus, () => BB.newJob());
    A('Connect a bot', BB.ICON.plus, () => BB.openConnect());
    A('Floor', BB.ICON.floor, () => BB.go('#floor'));
    A('Receipts', BB.ICON.receipt, () => BB.go('#receipts'));
    A('Card', BB.ICON.card, () => BB.go('#card'));
    A('All permissions', BB.ICON.grid, () => BB.openPermsOverview());
    A(BB.S && BB.S.killed ? 'Resume all bots' : 'Emergency stop', BB.ICON.stop, () => BB.openEmergency(), 'Pause every bot');
    A('Sign out', BB.ICON.out, () => BB.act('signout'));
    return out;
  }
  function score(it, q) {
    if (!q) return it.g === 'Jobs' ? -1 : 1; const k = it.keys.toLowerCase(), l = it.label.toLowerCase();
    if (l.startsWith(q)) return 3; if (l.split(/\s+/).some(w => w.startsWith(q))) return 2; if (k.includes(q)) return 1; return -1;
  }
  function paint() {
    const q = M.querySelector('input').value.trim().toLowerCase();
    items = all().map(it => [score(it, q), it]).filter(x => x[0] >= 0).sort((a, b) => b[0] - a[0] || 0).map(x => x[1]).slice(0, 40);
    if (!q) items = ['Bots', 'Rooms', 'Actions'].flatMap(g => items.filter(i => i.g === g));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let html = '', g = null;
    items.forEach((it, i) => { if (it.g !== g) { g = it.g; html += `<li class="grp" role="presentation">${esc(g)}</li>`; } html += `<li role="option" id="ck-${i}" aria-selected="${i === sel}" data-i="${i}">${it.icon}<span>${esc(it.label)}</span><small>${esc(it.sub)}</small></li>`; });
    const ul = M.querySelector('ul'); ul.innerHTML = html || '<li class="none">Nothing matches. Try a bot or room name.</li>';
    M.querySelector('input').setAttribute('aria-activedescendant', items.length ? 'ck-' + sel : '');
    ul.querySelectorAll('[data-i]').forEach(li => { li.onclick = () => run(+li.dataset.i); li.onmousemove = () => { if (sel !== +li.dataset.i) { sel = +li.dataset.i; mark(); } }; });
  }
  function mark() { M.querySelectorAll('[data-i]').forEach(li => li.setAttribute('aria-selected', +li.dataset.i === sel)); const e = M.querySelector('[aria-selected=true]'); e && e.scrollIntoView({ block: 'nearest' }); M.querySelector('input').setAttribute('aria-activedescendant', 'ck-' + sel); }
  function run(i) { const it = items[i]; if (!it) return; close(true); it.run(); }
  function close(keep) { M.classList.remove('on'); if (!keep && last && last.focus) last.focus(); }
  BB.openCmdk = function () {
    last = document.activeElement; BB.closePop && BB.closePop();
    M.querySelector('.box').innerHTML = `<label class="sr" for="ck-in">Search or jump to a bot</label><input id="ck-in" placeholder="Search or jump to a bot" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="ck-list"><ul id="ck-list" role="listbox" aria-label="Results"></ul>`;
    M.classList.add('on'); sel = 0; paint();
    const inp = M.querySelector('input'); inp.focus();
    inp.oninput = () => { sel = 0; paint(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
  };
  M.addEventListener('click', e => { if (e.target === M) close(); });
  $('#kbar').onclick = () => BB.openCmdk();
})();
